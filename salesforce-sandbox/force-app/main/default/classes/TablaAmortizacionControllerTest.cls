@isTest
private class TablaAmortizacionControllerTest {

    @TestSetup
    static void setup() {
        Plan_general_contable__c gasto = AmortizacionTestDataFactory.crearPlan('6810000000');
        Plan_general_contable__c acum  = AmortizacionTestDataFactory.crearPlan('2810000000');
        AmortizacionTestDataFactory.crearInmovilizado(
            10000, 25, Date.newInstance(2024, 11, 26),
            gasto.Id, acum.Id, AmortizacionTestDataFactory.obtenerEmpresaTitular()
        );
    }

    @isTest
    static void obtenerTablaSinFilas() {
        Inmovilizados__c inm = [SELECT Id FROM Inmovilizados__c LIMIT 1];
        Test.startTest();
        TablaAmortizacionController.ResumenAmortizacion res = TablaAmortizacionController.obtenerTabla(inm.Id);
        Test.stopTest();
        System.assertEquals(10000, res.valorInicial, 'Valor inicial debe ser 10000');
        System.assertEquals(0, res.filas.size(), 'No debe haber filas inicialmente');
    }

    @isTest
    static void generarCuadroAmortizacion() {
        Inmovilizados__c inm = [SELECT Id FROM Inmovilizados__c LIMIT 1];
        Test.startTest();
        String result = TablaAmortizacionController.generarCuadroAmortizacion(inm.Id);
        Test.stopTest();
        System.assert(result.contains('registros'), 'Debe devolver mensaje con conteo');
        Integer creados = [SELECT COUNT() FROM Tabla_de_amortizaci_n__c WHERE Inmovilizados__c = :inm.Id];
        System.assert(creados > 0, 'Debe crear al menos un registro');
    }

    @isTest
    static void generarCuadroDuplicado() {
        Inmovilizados__c inm = [SELECT Id FROM Inmovilizados__c LIMIT 1];
        AmortizacionTestDataFactory.crearTabla(inm.Id, '2024', 100);
        Test.startTest();
        try {
            TablaAmortizacionController.generarCuadroAmortizacion(inm.Id);
            System.assert(false, 'Debería lanzar excepción por duplicado');
        } catch (AuraHandledException e) {
            // Esperado
        }
        Test.stopTest();
    }

    @isTest
    static void obtenerTablaConFilas() {
        Inmovilizados__c inm = [SELECT Id FROM Inmovilizados__c LIMIT 1];
        AmortizacionTestDataFactory.crearTabla(inm.Id, '2024', 683.96);
        AmortizacionTestDataFactory.crearTabla(inm.Id, '2025', 2500);

        Test.startTest();
        TablaAmortizacionController.ResumenAmortizacion res = TablaAmortizacionController.obtenerTabla(inm.Id);
        Test.stopTest();

        System.assertEquals(2, res.filas.size(), 'Debe haber 2 filas');
        // El saldo de la primera fila = 10000 - 683.96 = 9316.04
        System.assertEquals(9316.04, res.filas[0].valorResidualContable, 'Saldo fila 1 erróneo');
        System.assertEquals(6816.04, res.filas[1].valorResidualContable, 'Saldo fila 2 erróneo');
    }

    @isTest
    static void guardarCambios() {
        Inmovilizados__c inm = [SELECT Id FROM Inmovilizados__c LIMIT 1];
        Tabla_de_amortizaci_n__c t = AmortizacionTestDataFactory.crearTabla(inm.Id, '2024', 500);

        Map<String, Object> draft = new Map<String, Object>{
            'id' => t.Id,
            'maximo' => 750
        };
        Test.startTest();
        TablaAmortizacionController.guardarCambios(new List<Map<String, Object>>{ draft });
        Test.stopTest();

        Tabla_de_amortizaci_n__c actualizado = [SELECT Maximo__c FROM Tabla_de_amortizaci_n__c WHERE Id = :t.Id];
        System.assertEquals(750, actualizado.Maximo__c, 'Maximo debe actualizarse');
    }
}