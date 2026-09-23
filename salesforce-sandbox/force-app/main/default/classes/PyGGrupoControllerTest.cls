@isTest
private class PyGGrupoControllerTest {

    private static final String EMPRESA = primerValorPicklist('Linea_asiento_contable__c', 'Empresa_titular__c');
    private static final String AREA    = primerValorPicklist('Linea_asiento_contable__c', 'rea__c');

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
            new Plan_general_contable__c(Name = '7050000000', T_tulo_cuenta__c = 'Prestaciones de servicios'),
            new Plan_general_contable__c(Name = '6210000000', T_tulo_cuenta__c = 'Arrendamientos y cánones')
        };
        insert cuentas;

        Integer yr = Date.today().year();
        List<Asiento_contable__c> asientos = new List<Asiento_contable__c>{
            new Asiento_contable__c(Empresa_titular__c = EMPRESA, Fecha_asiento_contable__c = Date.newInstance(yr, 2, 10)),
            new Asiento_contable__c(Empresa_titular__c = EMPRESA, Fecha_asiento_contable__c = Date.newInstance(yr - 1, 2, 10))
        };
        insert asientos;

        insert new List<Linea_asiento_contable__c>{
            new Linea_asiento_contable__c(Plan__c = cuentas[0].Id, Asientos_contable__c = asientos[0].Id,
                Debe__c = 0, Haber__c = 12000, Empresa_titular__c = EMPRESA, rea__c = AREA,
                Simulaci_n__c = 'No', Check__c = 'Si'),
            new Linea_asiento_contable__c(Plan__c = cuentas[1].Id, Asientos_contable__c = asientos[0].Id,
                Debe__c = 3000, Haber__c = 0, Empresa_titular__c = EMPRESA, rea__c = AREA,
                Simulaci_n__c = 'No', Check__c = 'Si'),
            new Linea_asiento_contable__c(Plan__c = cuentas[0].Id, Asientos_contable__c = asientos[1].Id,
                Debe__c = 0, Haber__c = 9000, Empresa_titular__c = EMPRESA, rea__c = AREA,
                Simulaci_n__c = 'No', Check__c = 'Si')
        };
    }

    @isTest
    static void testGenerarGrupo() {
        Integer yr = Date.today().year();
        Test.startTest();
        PyGGrupoController.GrupoResult res = PyGGrupoController.generarGrupo(
            new List<String>{ EMPRESA }, null, null,
            Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31),
            Date.newInstance(yr - 1, 1, 1), Date.newInstance(yr - 1, 12, 31),
            'PGC PYMES', 'Todas', 'No', 'Todos'
        );
        Test.stopTest();

        System.assertEquals(1, res.empresas.size());
        System.assert(res.rows.size() > 0, 'Debe devolver filas de estructura');
        for (PyGGrupoController.GrupoRow r : res.rows) {
            System.assertEquals(1, r.empresas.size(), 'Una celda por empresa');
            System.assertNotEquals(null, r.total);
        }
    }

    @isTest
    static void testGenerarGrupoSinEmpresa() {
        Boolean cazado = false;
        Integer yr = Date.today().year();
        try {
            PyGGrupoController.generarGrupo(
                new List<String>(), null, null,
                Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31),
                Date.newInstance(yr - 1, 1, 1), Date.newInstance(yr - 1, 12, 31),
                'PGC PYMES', 'Todas', 'No', 'Todos'
            );
        } catch (AuraHandledException ex) { cazado = true; }
        System.assert(cazado, 'Debe exigir al menos una empresa');
    }
}