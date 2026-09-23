@isTest
private class AmortizacionMasivaQueueableTest {

    @TestSetup
    static void setup() {
        Plan_general_contable__c gasto = AmortizacionTestDataFactory.crearPlan('6810000000');
        Plan_general_contable__c acum  = AmortizacionTestDataFactory.crearPlan('2810000000');
        String empresa = AmortizacionTestDataFactory.obtenerEmpresaTitular();
        Inmovilizados__c inm = AmortizacionTestDataFactory.crearInmovilizado(
            10000, 25, Date.newInstance(2024, 11, 26),
            gasto.Id, acum.Id, empresa
        );
        AmortizacionTestDataFactory.crearTabla(inm.Id, '2026', 2500);
    }

    @isTest
    static void executeCreaAsientosYApuntes() {
        String empresa = AmortizacionTestDataFactory.obtenerEmpresaTitular();

        Test.startTest();
        AmortizacionMasivaQueueable job = new AmortizacionMasivaQueueable(
            new List<String>{ empresa }, 2026, 1, 1, null
        );
        System.enqueueJob(job);
        Test.stopTest();

        Integer asientos = [SELECT COUNT() FROM Asiento_contable__c WHERE Tipo_de_asiento__c = 'Amortización'];
        Integer apuntes  = [SELECT COUNT() FROM Linea_asiento_contable__c];
        System.assert(asientos >= 1, 'Debe crear al menos 1 asiento');
        System.assert(apuntes  >= 2, 'Debe crear al menos 2 apuntes (debe + haber)');
    }

    @isTest
    static void executeNoDuplica() {
        String empresa = AmortizacionTestDataFactory.obtenerEmpresaTitular();
        // Primer run
        Test.startTest();
        System.enqueueJob(new AmortizacionMasivaQueueable(
            new List<String>{ empresa }, 2026, 1, 1, null
        ));
        Test.stopTest();

        Integer asientosPrimero = [SELECT COUNT() FROM Asiento_contable__c WHERE Tipo_de_asiento__c = 'Amortización'];

        // Segundo run con los mismos parámetros — no debe duplicar
        AmortizacionMasivaQueueable job2 = new AmortizacionMasivaQueueable(
            new List<String>{ empresa }, 2026, 1, 1, null
        );
        job2.execute(null);

        Integer asientosSegundo = [SELECT COUNT() FROM Asiento_contable__c WHERE Tipo_de_asiento__c = 'Amortización'];
        System.assertEquals(asientosPrimero, asientosSegundo, 'El segundo run no debe crear duplicados');
    }
}