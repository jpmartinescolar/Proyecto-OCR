@isTest
private class BalanceControllerTest {

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
            new Plan_general_contable__c(Name = '1000000000', T_tulo_cuenta__c = 'Capital'),       // PNA111 (H)
            new Plan_general_contable__c(Name = '5700000000', T_tulo_cuenta__c = 'Caja'),           // AC60 (D)
            new Plan_general_contable__c(Name = '4300000001', T_tulo_cuenta__c = 'Cliente'),        // AC21 (D)
            new Plan_general_contable__c(Name = '4000000001', T_tulo_cuenta__c = 'Proveedor')       // PC41 (H)
        };
        insert cuentas;

        Integer yr = Date.today().year();
        Asiento_contable__c apertura = new Asiento_contable__c(
            Empresa_titular__c = EMPRESA, Fecha_asiento_contable__c = Date.newInstance(yr, 1, 1),
            Tipo_de_asiento__c = 'Asiento de apertura');
        insert apertura;

        insert new List<Linea_asiento_contable__c>{
            new Linea_asiento_contable__c(Plan__c = cuentas[0].Id, Asientos_contable__c = apertura.Id,
                Debe__c = 0, Haber__c = 3000, Empresa_titular__c = EMPRESA, Simulaci_n__c = 'No', Check__c = 'Si'),
            new Linea_asiento_contable__c(Plan__c = cuentas[1].Id, Asientos_contable__c = apertura.Id,
                Debe__c = 5000, Haber__c = 0, Empresa_titular__c = EMPRESA, Simulaci_n__c = 'No', Check__c = 'Si'),
            new Linea_asiento_contable__c(Plan__c = cuentas[2].Id, Asientos_contable__c = apertura.Id,
                Debe__c = 2000, Haber__c = 0, Empresa_titular__c = EMPRESA, Simulaci_n__c = 'No', Check__c = 'Si'),
            new Linea_asiento_contable__c(Plan__c = cuentas[3].Id, Asientos_contable__c = apertura.Id,
                Debe__c = 0, Haber__c = 4000, Empresa_titular__c = EMPRESA, Simulaci_n__c = 'No', Check__c = 'Si')
        };
    }

    private static Map<String, BalanceController.BalRow> porKey(List<BalanceController.BalRow> rows) {
        Map<String, BalanceController.BalRow> m = new Map<String, BalanceController.BalRow>();
        for (BalanceController.BalRow r : rows) m.put(r.key, r);
        return m;
    }

    @isTest
    static void testGenerarPymes() {
        Integer yr = Date.today().year();
        Test.startTest();
        List<BalanceController.BalRow> rows = BalanceController.generar(
            new List<String>{ EMPRESA }, null, null,
            Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31),
            Date.newInstance(yr - 1, 1, 1), Date.newInstance(yr - 1, 12, 31),
            'PGC PYMES', 'Todas', 'No', 'Todos');
        Test.stopTest();

        System.assert(rows.size() > 0, 'Debe devolver la estructura del balance');
        Map<String, BalanceController.BalRow> m = porKey(rows);

        System.assertEquals(5000, m.get('AC60').valorActual, 'Caja (57x) deudor = 5000');
        System.assertEquals(2000, m.get('AC21').valorActual, 'Clientes (430) deudor = 2000');
        System.assertEquals(3000, m.get('PNA111').valorActual, 'Capital (100) acreedor = 3000');
        System.assertEquals(4000, m.get('PC41').valorActual, 'Proveedores (400) acreedor = 4000');
        // TOTAL ACTIVO = Caja + Clientes = 7000
        System.assertEquals(7000, m.get('ACTIVO').valorActual, 'TOTAL ACTIVO = 7000');
        // banda y total presentes
        System.assertEquals('BANDA', m.get('SALTO1').tipo);
        System.assertEquals('TOTAL', m.get('ACTIVO').tipo);
    }

    @isTest
    static void testPlanesNormalAbreviado() {
        Integer yr = Date.today().year();
        Test.startTest();
        List<BalanceController.BalRow> n = BalanceController.generar(
            new List<String>{ EMPRESA }, null, null,
            Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31),
            Date.newInstance(yr - 1, 1, 1), Date.newInstance(yr - 1, 12, 31),
            'PGC Normal', 'Todas', 'No', 'Todos');
        List<BalanceController.BalRow> a = BalanceController.generar(
            new List<String>{ EMPRESA }, null, null,
            Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31),
            Date.newInstance(yr - 1, 1, 1), Date.newInstance(yr - 1, 12, 31),
            'PGC Abreviado', 'Si', 'Si', 'Si');
        Test.stopTest();
        System.assert(n.size() > 0, 'Normal devuelve estructura');
        System.assert(a.size() > 0, 'Abreviado devuelve estructura');
    }

    @isTest
    static void testOpcionesYValidaciones() {
        Test.startTest();
        BalanceController.FilterOptions opt = BalanceController.getFilterOptions();
        System.assert(opt.planesPGC.size() == 3, 'Tres planes');

        // Sin empresa -> excepción
        try {
            BalanceController.generar(new List<String>(), null, null,
                Date.today(), Date.today(), Date.today(), Date.today(),
                'PGC PYMES', 'Todas', 'No', 'Todos');
            System.assert(false, 'Debió lanzar excepción');
        } catch (Exception e) { System.assert(true); }

        // Sin fechas -> excepción
        try {
            BalanceController.generar(new List<String>{ EMPRESA }, null, null,
                null, null, null, null, 'PGC PYMES', 'Todas', 'No', 'Todos');
            System.assert(false, 'Debió lanzar excepción');
        } catch (Exception e) { System.assert(true); }
        Test.stopTest();
    }
}