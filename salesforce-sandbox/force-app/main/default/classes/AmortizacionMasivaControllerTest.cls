@isTest
private class AmortizacionMasivaControllerTest {

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
    static void obtenerEmpresasTitulares() {
        Test.startTest();
        List<String> empresas = AmortizacionMasivaController.obtenerEmpresasTitulares();
        Test.stopTest();
        System.assert(empresas.size() > 0, 'Debe haber al menos una empresa');
    }

    @isTest
    static void obtenerPreviewOk() {
        String empresa = AmortizacionTestDataFactory.obtenerEmpresaTitular();
        Test.startTest();
        AmortizacionMasivaController.Resumen r = AmortizacionMasivaController.obtenerPreview(
            new List<String>{ empresa }, 2026, 1, 12
        );
        Test.stopTest();
        System.assert(r.porEmpresa.size() > 0, 'Debe haber filas en porEmpresa');
        System.assert(r.asientosACrear > 0, 'Debe calcular asientos a crear');
        // Suma de cuotas mensuales puede diferir en céntimos por redondeo
        System.assert(Math.abs(r.importeTotal - 2500) < 1, 'Importe total ~2500, actual: ' + r.importeTotal);
    }

    @isTest
    static void previewSinEmpresas() {
        Test.startTest();
        try {
            AmortizacionMasivaController.obtenerPreview(new List<String>(), 2026, 1, 12);
            System.assert(false, 'Debería lanzar excepción');
        } catch (AuraHandledException e) {
            // Esperado
        }
        Test.stopTest();
    }

    @isTest
    static void previewMesesInvalidos() {
        String empresa = AmortizacionTestDataFactory.obtenerEmpresaTitular();
        Test.startTest();
        try {
            AmortizacionMasivaController.obtenerPreview(new List<String>{ empresa }, 2026, 6, 3);
            System.assert(false, 'Debería lanzar excepción por meses');
        } catch (AuraHandledException e) {
            // Esperado
        }
        Test.stopTest();
    }

    @isTest
    static void procesarAmortizacionLanzaQueueable() {
        String empresa = AmortizacionTestDataFactory.obtenerEmpresaTitular();
        Test.startTest();
        Id jobId = AmortizacionMasivaController.procesarAmortizacion(
            new List<String>{ empresa }, 2026, 1, 12
        );
        Test.stopTest();
        System.assertNotEquals(null, jobId, 'Debe devolver Id de job');
    }

    @isTest
    static void obtenerEstadoJob() {
        Test.startTest();
        Map<String, Object> r = AmortizacionMasivaController.obtenerEstadoJob(null);
        Test.stopTest();
        System.assertEquals(0, r.size(), 'Con jobId null debe devolver mapa vacío');
    }

    @isTest
    static void obtenerDetalleMensual() {
        Inmovilizados__c inm = [SELECT Id FROM Inmovilizados__c LIMIT 1];
        Test.startTest();
        List<AmortizacionMasivaController.FilaMensual> filas =
            AmortizacionMasivaController.obtenerDetalleMensual(inm.Id, 2026, 1, 12);
        Test.stopTest();
        System.assertEquals(12, filas.size(), 'Debe haber 12 filas mensuales');
    }

    @isTest
    static void calcularCuotaMesFueraInicio() {
        Inmovilizados__c inm = [SELECT Id, Valor_inicial__c, Coeficiente__c, Fecha_inicio_amortizaci_n__c FROM Inmovilizados__c LIMIT 1];
        Test.startTest();
        AmortizacionMasivaController.ResultadoCuota rc =
            AmortizacionMasivaController.calcularCuotaMes(inm, 2023, 5, 2500);
        Test.stopTest();
        System.assertEquals('FUERA_INICIO', rc.estado, 'Año previo a adquisición debe ser FUERA_INICIO');
    }

    @isTest
    static void nombreMesYUltimoDia() {
        System.assertEquals('Enero', AmortizacionMasivaController.nombreMes(1));
        System.assertEquals('Diciembre', AmortizacionMasivaController.nombreMes(12));
        System.assertEquals(Date.newInstance(2024, 2, 29), AmortizacionMasivaController.ultimoDiaMes(2024, 2));
        System.assertEquals(Date.newInstance(2025, 2, 28), AmortizacionMasivaController.ultimoDiaMes(2025, 2));
    }
}