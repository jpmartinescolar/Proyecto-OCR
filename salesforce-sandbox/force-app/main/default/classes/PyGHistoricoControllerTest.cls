/**
 * Tests de PyGHistoricoController (Pérdidas y Ganancias Histórico anual).
 */
@isTest
private class PyGHistoricoControllerTest {

    private static final String EMPRESA = primerValorPicklist('Linea_asiento_contable__c', 'Empresa_titular__c');

    private static String primerValorPicklist(String objApi, String fieldApi) {
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objApi);
        if (t == null) return null;
        Schema.DescribeFieldResult fr = t.getDescribe().fields.getMap().get(fieldApi).getDescribe();
        for (Schema.PicklistEntry e : fr.getPicklistValues()) {
            if (e.isActive()) return e.getValue();
        }
        return null;
    }

    @TestSetup
    static void setup() {
        Plan_general_contable__c p705 = new Plan_general_contable__c(
            Name = '7050000000', T_tulo_cuenta__c = 'Prestaciones de servicios',
            Apartados__c = '01. Operaciones',
            Categor_a_Anal_tica_PyG__c = '01. Ingresos servicios profesionales'
        );
        Plan_general_contable__c p621 = new Plan_general_contable__c(
            Name = '6210000000', T_tulo_cuenta__c = 'Arrendamientos y cánones',
            Apartados__c = '02. Alquileres e Instalaciones'
        );
        insert new List<Plan_general_contable__c>{ p705, p621 };

        Integer yr = Date.today().year();
        List<Asiento_contable__c> asientos = new List<Asiento_contable__c>();
        for (Integer i = 0; i < 4; i++) {
            asientos.add(new Asiento_contable__c(Empresa_titular__c = EMPRESA));
        }
        asientos[0].Fecha_asiento_contable__c = Date.newInstance(yr, 2, 10);       // año actual, feb
        asientos[1].Fecha_asiento_contable__c = Date.newInstance(yr, 8, 5);        // año actual, ago
        asientos[2].Fecha_asiento_contable__c = Date.newInstance(yr - 1, 3, 15);   // año anterior, mar
        asientos[3].Fecha_asiento_contable__c = Date.newInstance(yr - 1, 11, 20);  // año anterior, nov
        insert asientos;

        List<Linea_asiento_contable__c> lineas = new List<Linea_asiento_contable__c>();
        lineas.add(new Linea_asiento_contable__c(
            Plan__c = p705.Id, Asientos_contable__c = asientos[0].Id,
            Debe__c = 0, Haber__c = 10000, Empresa_titular__c = EMPRESA,
            Simulaci_n__c = 'No', Check__c = 'Si'
        ));
        lineas.add(new Linea_asiento_contable__c(
            Plan__c = p621.Id, Asientos_contable__c = asientos[1].Id,
            Debe__c = 2000, Haber__c = 0, Empresa_titular__c = EMPRESA,
            Simulaci_n__c = 'No', Check__c = 'Si'
        ));
        lineas.add(new Linea_asiento_contable__c(
            Plan__c = p705.Id, Asientos_contable__c = asientos[2].Id,
            Debe__c = 0, Haber__c = 7000, Empresa_titular__c = EMPRESA,
            Simulaci_n__c = 'No', Check__c = 'Si'
        ));
        lineas.add(new Linea_asiento_contable__c(
            Plan__c = p621.Id, Asientos_contable__c = asientos[3].Id,
            Debe__c = 1500, Haber__c = 0, Empresa_titular__c = EMPRESA,
            Simulaci_n__c = 'No', Check__c = 'Si'
        ));
        insert lineas;
    }

    @isTest
    static void testGenerarBasico() {
        Integer yr = Date.today().year();
        Test.startTest();
        PyGHistoricoController.HistResult res = PyGHistoricoController.generarHistorico(
            new List<String>{ EMPRESA }, null, null,
            new List<Integer>{ yr, yr - 1 },   // desordenados a propósito
            null,                              // todos los meses
            'PGC PYMES', 'Todas', 'No', 'Todos'
        );
        Test.stopTest();

        System.assertNotEquals(null, res);
        System.assertEquals(2, res.anios.size());
        System.assertEquals(yr - 1, res.anios[0], 'Los años deben venir de menor a mayor');
        System.assertEquals(yr, res.anios[1]);
        System.assert(res.rows.size() > 0);

        // Cada fila debe tener una celda por año
        for (PyGHistoricoController.HistRow r : res.rows) {
            System.assertEquals(2, r.anios.size());
        }

        // La sección de cifra de negocios y el resultado A4 deben existir
        Boolean hayCN = false, hayA4 = false;
        for (PyGHistoricoController.HistRow r : res.rows) {
            if (r.key == 'CN') hayCN = true;
            if (r.key == 'A4') hayA4 = true;
        }
        System.assert(hayCN, 'Debe existir la fila de cifra de negocios (CN)');
        System.assert(hayA4, 'Debe existir el subtotal A.4 (resultado del ejercicio)');
    }

    @isTest
    static void testMesesContiguosYNoContiguos() {
        Integer yr = Date.today().year();
        Test.startTest();
        // Contiguos (feb-ago): incluye los apuntes de feb y ago del año actual
        PyGHistoricoController.HistResult r1 = PyGHistoricoController.generarHistorico(
            new List<String>{ EMPRESA }, null, null,
            new List<Integer>{ yr },
            new List<Integer>{ 2, 3, 4, 5, 6, 7, 8 },
            'PGC PYMES', 'Todas', 'No', 'Todos'
        );
        // No contiguos (feb y ago sueltos): dos rangos
        PyGHistoricoController.HistResult r2 = PyGHistoricoController.generarHistorico(
            new List<String>{ EMPRESA }, null, null,
            new List<Integer>{ yr },
            new List<Integer>{ 2, 8 },
            'PGC PYMES', 'Todas', 'No', 'Todos'
        );
        Test.stopTest();
        System.assert(r1.rows.size() > 0);
        System.assert(r2.rows.size() > 0);

        // El total de CN debe coincidir en ambos casos (los apuntes están en feb y ago)
        Decimal cn1, cn2;
        for (PyGHistoricoController.HistRow r : r1.rows) { if (r.key == 'CN') cn1 = r.anios[0].valor; }
        for (PyGHistoricoController.HistRow r : r2.rows) { if (r.key == 'CN') cn2 = r.anios[0].valor; }
        System.assertEquals(cn1, cn2, 'Meses no contiguos deben sumar igual que el rango que los contiene');
    }

    @isTest
    static void testRangosMeses() {
        Set<Integer> todos = new Set<Integer>{ 1,2,3,4,5,6,7,8,9,10,11,12 };
        List<List<Date>> r1 = PyGHistoricoController.rangosMeses(2025, todos);
        System.assertEquals(1, r1.size());
        System.assertEquals(Date.newInstance(2025, 1, 1),  r1[0][0]);
        System.assertEquals(Date.newInstance(2025, 12, 31), r1[0][1]);

        List<List<Date>> r2 = PyGHistoricoController.rangosMeses(2024, new Set<Integer>{ 1, 2, 6, 11, 12 });
        System.assertEquals(3, r2.size());
        System.assertEquals(Date.newInstance(2024, 2, 29), r2[0][1], 'Febrero bisiesto');
        System.assertEquals(Date.newInstance(2024, 6, 1),  r2[1][0]);
        System.assertEquals(Date.newInstance(2024, 6, 30), r2[1][1]);
        System.assertEquals(Date.newInstance(2024, 12, 31), r2[2][1]);
    }

    @isTest
    static void testValidaciones() {
        Integer yr = Date.today().year();
        Boolean cazado1 = false, cazado2 = false;
        Test.startTest();
        try {
            PyGHistoricoController.generarHistorico(null, null, null,
                new List<Integer>{ yr }, null, 'PGC PYMES', 'Todas', 'No', 'Todos');
        } catch (AuraHandledException ex) { cazado1 = true; }
        try {
            PyGHistoricoController.generarHistorico(new List<String>{ EMPRESA }, null, null,
                new List<Integer>(), null, 'PGC PYMES', 'Todas', 'No', 'Todos');
        } catch (AuraHandledException ex) { cazado2 = true; }
        Test.stopTest();
        System.assert(cazado1, 'Debe fallar sin empresas');
        System.assert(cazado2, 'Debe fallar sin ejercicios');
    }
}