@isTest
private class AsientosContablesControllerTest {

    private static final String EMPRESA = primerValorPicklist('Linea_asiento_contable__c', 'Empresa_titular__c');

    private static String primerValorPicklist(String objApi, String fieldApi) {
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objApi);
        if (t == null) return null;
        for (Schema.PicklistEntry e : t.getDescribe().fields.getMap().get(fieldApi).getDescribe().getPicklistValues()) {
            if (e.isActive()) return e.getValue();
        }
        return null;
    }

    @TestSetup
    static void setup() {
        insert new List<Plan_general_contable__c>{
            new Plan_general_contable__c(Name = '4300000001', T_tulo_cuenta__c = 'Clientes'),
            new Plan_general_contable__c(Name = '7050000000', T_tulo_cuenta__c = 'Prestaciones de servicios'),
            new Plan_general_contable__c(Name = '4770000000', T_tulo_cuenta__c = 'HP IVA repercutido')
        };
    }

    private static String jsonLineas(Id c1, Id c2, Id c3, Decimal total, Decimal base, Decimal iva) {
        List<Map<String, Object>> ls = new List<Map<String, Object>>{
            new Map<String, Object>{ 'cuentaId' => c1, 'comentario' => 'Cliente', 'debe' => total, 'haber' => 0 },
            new Map<String, Object>{ 'cuentaId' => c2, 'comentario' => 'Servicios', 'debe' => 0, 'haber' => base },
            new Map<String, Object>{ 'cuentaId' => c3, 'comentario' => 'IVA 21%', 'debe' => 0, 'haber' => iva }
        };
        return JSON.serialize(ls);
    }

    @isTest
    static void testCrearBuscarYModificar() {
        Map<String, Plan_general_contable__c> ctas = new Map<String, Plan_general_contable__c>();
        for (Plan_general_contable__c p : [SELECT Id, Name FROM Plan_general_contable__c]) ctas.put(p.Name, p);
        Integer yr = Date.today().year();
        Date f = Date.newInstance(yr, 3, 15);

        Test.startTest();
        // Crear asiento cuadrado 121 = 100 + 21
        AsientosContablesController.AsientoDTO creado = AsientosContablesController.guardarAsiento(
            null, f, EMPRESA, '001 General', 'Apunte', 'Fra. emit. test',
            jsonLineas(ctas.get('4300000001').Id, ctas.get('7050000000').Id, ctas.get('4770000000').Id, 121, 100, 21),
            new List<Id>()
        );
        System.assertNotEquals(null, creado.id);

        // Descuadrado -> excepción y nada guardado
        Boolean lanzo = false;
        try {
            AsientosContablesController.guardarAsiento(
                null, f, EMPRESA, '001 General', 'Apunte', 'Descuadrado',
                jsonLineas(ctas.get('4300000001').Id, ctas.get('7050000000').Id, ctas.get('4770000000').Id, 121, 100, 30),
                new List<Id>());
        } catch (Exception e) { lanzo = true; }
        System.assert(lanzo, 'No debe permitir guardar descuadrado');
        System.assertEquals(1, [SELECT COUNT() FROM Asiento_contable__c WHERE Empresa_titular__c = :EMPRESA]);

        // Buscar por importe exacto en el Debe (a nivel de apunte)
        AsientosContablesController.ResultadoBusqueda res = AsientosContablesController.buscarAsientos(
            EMPRESA, Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31),
            'Todos', null, 'Debe', 'Exacto', 121, 0);
        System.assertEquals(1, res.asientos.size());
        System.assertEquals(3, res.asientos[0].lineas.size());
        System.assertEquals(true, res.asientos[0].cuadrado);
        System.assertEquals(false, res.hayMas);

        // Buscar por texto de la descripción del apunte
        res = AsientosContablesController.buscarAsientos(
            EMPRESA, Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31),
            'Todos', 'IVA 21', null, null, null, 0);
        System.assertEquals(1, res.asientos.size());

        // Buscar por importe que no existe
        res = AsientosContablesController.buscarAsientos(
            EMPRESA, Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31),
            'Todos', null, 'Haber', 'Exacto', 999999, 0);
        System.assertEquals(0, res.asientos.size());

        // Paginación: con offset más allá de los resultados no devuelve filas
        res = AsientosContablesController.buscarAsientos(
            EMPRESA, Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31),
            'Todos', null, null, null, null, 50);
        System.assertEquals(0, res.asientos.size());

        // Modificar: cambiar importes (110 = 89 + 21) y mantener las líneas
        List<AsientosContablesController.AsientoDTO> antes = AsientosContablesController.buscarAsientos(
            EMPRESA, Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31),
            'Todos', null, null, null, null, 0).asientos;
        List<Map<String, Object>> mod = new List<Map<String, Object>>();
        for (AsientosContablesController.LineaDTO l : antes[0].lineas) {
            Decimal d = l.debe, h = l.haber;
            if (d == 121) d = 110;
            if (h == 100) h = 89;
            if (h == 21)  h = 21;
            mod.add(new Map<String, Object>{ 'lineaId' => l.lineaId, 'cuentaId' => l.cuentaId,
                'comentario' => l.comentario, 'debe' => d, 'haber' => h });
        }
        AsientosContablesController.AsientoDTO editado = AsientosContablesController.guardarAsiento(
            creado.id, f, EMPRESA, '001 General', 'Apunte', 'Fra. emit. test v2',
            JSON.serialize(mod), new List<Id>());
        Test.stopTest();

        System.assertEquals(creado.id, editado.id, 'Debe actualizar el mismo asiento');
        Asiento_contable__c a = [SELECT Total_Debe__c, Total_Haber__c, Observaciones__c FROM Asiento_contable__c WHERE Id = :creado.id];
        System.assertEquals(110, a.Total_Debe__c);
        System.assertEquals(110, a.Total_Haber__c);
        System.assertEquals('Fra. emit. test v2', a.Observaciones__c);
    }

    @isTest
    static void testOpcionesYCuentas() {
        AsientosContablesController.Opciones o = AsientosContablesController.getOpciones();
        System.assert(o.empresas.size() > 0);
        System.assert(o.tipos.size() > 0);

        List<AsientosContablesController.CuentaDTO> cs = AsientosContablesController.buscarCuentas('430');
        System.assertEquals(1, cs.size());
        System.assertEquals('4300000001', cs[0].numero);
        cs = AsientosContablesController.buscarCuentas('Prestaciones');
        System.assertEquals(1, cs.size());
        System.assertEquals(0, AsientosContablesController.buscarCuentas('').size());
    }

    @isTest
    static void testValidaciones() {
        Boolean lanzo = false;
        try { AsientosContablesController.guardarAsiento(null, null, EMPRESA, null, 'Apunte', null, '[]', null); }
        catch (Exception e) { lanzo = true; }
        System.assert(lanzo, 'Sin fecha debe fallar');
        lanzo = false;
        try {
            AsientosContablesController.guardarAsiento(null, Date.today(), EMPRESA, null, 'Apunte', null, '[]', null);
        } catch (Exception e) { lanzo = true; }
        System.assert(lanzo, 'Sin apuntes debe fallar');
        lanzo = false;
        try {
            AsientosContablesController.buscarAsientos(null, Date.today(), Date.today(), 'Todos', null, null, null, null, 0);
        } catch (Exception e) { lanzo = true; }
        System.assert(lanzo, 'Sin empresa debe fallar');
    }
}