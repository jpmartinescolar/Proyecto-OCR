@isTest
private class SumasSaldosControllerTest {

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
        List<Plan_general_contable__c> cuentas = new List<Plan_general_contable__c>{
            new Plan_general_contable__c(Name = '1000000000', T_tulo_cuenta__c = 'Capital social'),
            new Plan_general_contable__c(Name = '7050000000', T_tulo_cuenta__c = 'Prestaciones de servicios')
        };
        insert cuentas;

        Integer yr = Date.today().year();
        // Asiento de apertura + asiento normal
        Asiento_contable__c apertura = new Asiento_contable__c(
            Empresa_titular__c = EMPRESA, Fecha_asiento_contable__c = Date.newInstance(yr, 1, 1),
            Tipo_de_asiento__c = 'Asiento de apertura');
        Asiento_contable__c normal = new Asiento_contable__c(
            Empresa_titular__c = EMPRESA, Fecha_asiento_contable__c = Date.newInstance(yr, 6, 15),
            Tipo_de_asiento__c = 'Factura emitida');
        insert new List<Asiento_contable__c>{ apertura, normal };

        insert new List<Linea_asiento_contable__c>{
            new Linea_asiento_contable__c(Plan__c = cuentas[0].Id, Asientos_contable__c = apertura.Id,
                Debe__c = 0, Haber__c = 15000, Empresa_titular__c = EMPRESA, Simulaci_n__c = 'No', Check__c = 'Si'),
            new Linea_asiento_contable__c(Plan__c = cuentas[1].Id, Asientos_contable__c = normal.Id,
                Debe__c = 0, Haber__c = 8000, Empresa_titular__c = EMPRESA, Simulaci_n__c = 'No', Check__c = 'Si')
        };

        // Cuentas 400 (proveedor) y 430 (cliente) para el cuadre Saldo cuentas & Saldo efectos
        Plan_general_contable__c pProv = new Plan_general_contable__c(Name = '4000000001', T_tulo_cuenta__c = 'Proveedor test');
        Plan_general_contable__c pCli  = new Plan_general_contable__c(Name = '4300000001', T_tulo_cuenta__c = 'Cliente test');
        insert new List<Plan_general_contable__c>{ pProv, pCli };
        insert new List<Linea_asiento_contable__c>{
            new Linea_asiento_contable__c(Plan__c = pProv.Id, Asientos_contable__c = normal.Id,
                Debe__c = 0, Haber__c = 500, Empresa_titular__c = EMPRESA, Simulaci_n__c = 'No', Check__c = 'Si'),
            new Linea_asiento_contable__c(Plan__c = pCli.Id, Asientos_contable__c = normal.Id,
                Debe__c = 1000, Haber__c = 0, Empresa_titular__c = EMPRESA, Simulaci_n__c = 'No', Check__c = 'Si')
        };
    }

    @isTest
    static void testGenerar() {
        Integer yr = Date.today().year();
        Test.startTest();
        List<SumasSaldosController.SumaRow> rows = SumasSaldosController.generar(
            new List<String>{ EMPRESA }, Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31),
            null, null, null, 'Todas', 'Todas', 'Todos', 'Todas');
        Test.stopTest();

        System.assert(rows.size() >= 2, 'Debe listar las cuentas del plan');
        Map<String, SumasSaldosController.SumaRow> byNum = new Map<String, SumasSaldosController.SumaRow>();
        for (SumasSaldosController.SumaRow r : rows) byNum.put(r.numero, r);

        // Capital social: apertura haber 15000 -> apertura saldo -15000; saldo actual -15000
        System.assertEquals(15000, byNum.get('1000000000').aperturaHaber);
        System.assertEquals(-15000, byNum.get('1000000000').aperturaSaldo);
        System.assertEquals(-15000, byNum.get('1000000000').saldoActual);
        // 705: periodo haber 8000 -> periodo saldo -8000
        System.assertEquals(-8000, byNum.get('7050000000').periodoSaldo);

        // Solo con apuntes contables: ambas cuentas tienen apuntes
        List<SumasSaldosController.SumaRow> conAp = SumasSaldosController.generar(
            new List<String>{ EMPRESA }, Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31),
            null, null, null, 'Todas', 'Todas', 'Todos', 'Con');
        System.assertEquals(4, conAp.size(), 'Las 4 cuentas con apuntes');

        SumasSaldosController.AvisoResult inc = SumasSaldosController.getIncidencias(new List<String>{ EMPRESA });
        System.assert(inc.total >= 0);
        System.assertEquals(0, SumasSaldosController.getIncidencias(new List<String>()).total);

        SumasSaldosController.AvisoResult descR = SumasSaldosController.contarDescuadrados(new List<String>{ EMPRESA });
        System.assert(descR.total >= 0);
        System.assertEquals(0, SumasSaldosController.contarDescuadrados(new List<String>()).total);

        SumasSaldosController.AvisoResult sinc = SumasSaldosController.getSinCuenta(new List<String>{ EMPRESA });
        System.assert(sinc.total >= 0);
        System.assertEquals(0, SumasSaldosController.getSinCuenta(new List<String>()).total);

        Integer nExt = SumasSaldosController.contarExtractosPendientes(
            new List<String>{ EMPRESA }, Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31));
        System.assert(nExt >= 0);
        System.assertEquals(0, SumasSaldosController.contarExtractosPendientes(
            new List<String>(), Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31)));

        SumasSaldosController.CuadreResult cu = SumasSaldosController.cuadreFacturas(new List<String>{ EMPRESA });
        System.assertNotEquals(null, cu);
        System.assertEquals(0, SumasSaldosController.cuadreFacturas(new List<String>()).baseImponible);

        SumasSaldosController.CuadreResult cur = SumasSaldosController.cuadreRecibidas(new List<String>{ EMPRESA });
        System.assertNotEquals(null, cur);
        System.assertEquals(0, SumasSaldosController.cuadreRecibidas(new List<String>()).baseImponible);

        SumasSaldosController.DifEfectosResult de = SumasSaldosController.diferenciaEfectos(new List<String>{ EMPRESA });
        System.assertNotEquals(null, de);
        // 4000000001 (Haber 500, sin efectos) y 4300000001 (Debe 1000, sin efectos) descuadran
        System.assertEquals(1, de.proveedores, 'La cuenta 400 sin efectos debe descuadrar');
        System.assertEquals(1, de.clientes, 'La cuenta 430 sin efectos debe descuadrar');
        System.assertEquals(2, de.total);
        System.assertEquals(0, SumasSaldosController.diferenciaEfectos(new List<String>()).total);

        // Apuntes sin check (Check__c != 'Si'): con la lista vacía es 0; al marcar uno como 'No' debe contarlo
        System.assertEquals(0, SumasSaldosController.contarSinCheck(new List<String>()));
        Linea_asiento_contable__c unaLinea = [SELECT Id FROM Linea_asiento_contable__c WHERE Empresa_titular__c = :EMPRESA LIMIT 1];
        unaLinea.Check__c = 'No';
        update unaLinea;
        System.assert(SumasSaldosController.contarSinCheck(new List<String>{ EMPRESA }) >= 1,
            'Debe contar el apunte marcado como Check distinto de Sí');
    }

    @isTest
    static void testGenerarVacio() {
        Integer yr = Date.today().year();
        System.assertEquals(0, SumasSaldosController.generar(
            new List<String>(), Date.newInstance(yr,1,1), Date.newInstance(yr,12,31), null, null, null, 'Todas', 'Todas', 'Todos', 'Todas').size());
    }
}