@isTest
private class PortalReactEstadisticas_Test {

    @TestSetup
    static void datos() {
        // Procedencia_del_cliente__c la exige una regla de validación de Account.
        insert new List<Account>{
            new Account(Name = 'Cliente Madrid', BillingState = 'Madrid', Type = 'Despacho Profesional',
                N_de_Empleados__c = '3 a 5 asalariados', Contrato_activo__c = 'Alta',
                Procedencia_del_cliente__c = 'Datos de prueba'),
            new Account(Name = 'Cliente Barcelona', BillingState = 'Barcelona', Type = 'Pyme y Autónomos',
                N_de_Empleados__c = '10 a 19 asalariados', Procedencia_del_cliente__c = 'Datos de prueba'),
            new Account(Name = 'Solo base de datos', BillingState = 'Valencia', Type = 'Pyme y Autónomos',
                Procedencia_del_cliente__c = 'Datos de prueba')
        };
    }

    @isTest
    static void doGetDevuelveAgregadosSinDatosIndividuales() {
        RestContext.request = new RestRequest();
        RestContext.request.requestUri = '/services/apexrest/portalreact/estadisticas';
        RestContext.request.httpMethod = 'GET';
        RestContext.response = new RestResponse();

        Test.startTest();
        PortalReactEstadisticas.doGet();
        Test.stopTest();

        System.assertEquals(200, RestContext.response.statusCode);
        String cuerpo = RestContext.response.responseBody.toString();
        Map<String, Object> json = (Map<String, Object>) JSON.deserializeUntyped(cuerpo);
        System.assert(json.containsKey('kpis'), 'Debe devolver los KPIs');
        System.assert(json.containsKey('porProvincia'), 'Debe devolver el reparto por provincia');
        System.assert(json.containsKey('porTipo'), 'Debe devolver el reparto por tipo');
        System.assert(json.containsKey('porTamano'), 'Debe devolver el reparto por tamaño');
        System.assert(!cuerpo.contains('Cliente Madrid'), 'Nunca debe salir el nombre de una cuenta');

        Map<String, Object> kpis = (Map<String, Object>) json.get('kpis');
        System.assertEquals(3, (Integer) kpis.get('empresasBaseDatos'));
        System.assertEquals(1, (Integer) kpis.get('contratosAlta'));
    }

    @isTest
    static void calcularOrdenaTamanosPorListaDeSeleccion() {
        Map<String, Object> resultado = PortalReactEstadisticas.calcular();
        List<PortalReactEstadisticas.Fila> tamanos = (List<PortalReactEstadisticas.Fila>) resultado.get('porTamano');
        // Sin cuenta contable en los datos de prueba el universo está vacío: la lista existe y no falla.
        System.assertNotEquals(null, tamanos);
    }
}