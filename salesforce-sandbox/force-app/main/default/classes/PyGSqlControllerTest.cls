/**
 * Tests de PyGSqlController (endpoint SQL externo simulado con HttpCalloutMock).
 */
@isTest
private class PyGSqlControllerTest {

    private class SkyviaMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            String cuerpo = req.getBody();
            HttpResponse r = new HttpResponse();
            r.setHeader('Content-Type', 'application/json');
            r.setStatusCode(200);
            if (cuerpo.contains('dbo.Empresas')) {
                r.setBody('{"data":[{"CodigoEmpresa":1,"Empresa":"Empresa Test SQL"}]}');
            } else {
                // Consulta combinada: dos periodos + título en un solo viaje
                r.setBody('{"data":['
                    + '{"cuenta":"70500001","titulo":"Prestaciones de servicios","debeA":"0","haberA":"1000.50","debeC":"0","haberC":"600.00"},'
                    + '{"cuenta":"62900001","titulo":"Otros servicios","debeA":"200.50","haberA":"0","debeC":"100.00","haberC":"0"}]}');
            }
            return r;
        }
    }

    private class SkyviaErrorMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse r = new HttpResponse();
            r.setStatusCode(200);
            r.setBody('{"ErrorCode":0,"Message":"El nombre de objeto no es válido."}');
            return r;
        }
    }

    @isTest
    static void testGenerar() {
        Test.setMock(HttpCalloutMock.class, new SkyviaMock());

        Test.startTest();
        List<PyGSqlController.EmpresaDTO> empresas = PyGSqlController.getEmpresas();
        List<PyGSqlController.PyGSqlRow> rows = PyGSqlController.generar(
            new List<Integer>{ 1, 2 }, Date.newInstance(2026, 1, 1), Date.newInstance(2026, 12, 31),
            Date.newInstance(2025, 1, 1), Date.newInstance(2025, 12, 31));
        Test.stopTest();

        System.assertEquals(1, empresas.size());
        System.assertEquals('Empresa Test SQL', empresas[0].nombre);

        Decimal cn, otrosGto, a4, a4Comp;
        Boolean hayCuentaVentas = false;
        for (PyGSqlController.PyGSqlRow r : rows) {
            if (r.key == 'CN' && r.tipo == 'SECCION') cn = r.valorActual;
            if (r.key == 'OTROS_GTO' && r.tipo == 'SECCION') otrosGto = r.valorActual;
            if (r.key == 'A4') { a4 = r.valorActual; a4Comp = r.valorComparado; }
            if (r.tipo == 'CUENTA' && r.codigoCuenta == '70500001') {
                hayCuentaVentas = true;
                System.assertEquals('Prestaciones de servicios', r.concepto);
                System.assertEquals(false, r.esGasto);
            }
        }
        System.assertEquals(1000.50, cn, 'La cifra de negocios es el haber de la 705');
        System.assertEquals(-200.50, otrosGto, 'El gasto va en negativo (haber - debe)');
        System.assertEquals(800.00, a4, 'Resultado del ejercicio = suma con signo');
        System.assertEquals(500.00, a4Comp, 'Resultado comparado con sus propios saldos');
        System.assert(hayCuentaVentas, 'Debe incluir la fila de la cuenta 705');
    }

    @isTest
    static void testErrores() {
        Test.setMock(HttpCalloutMock.class, new SkyviaErrorMock());
        try {
            PyGSqlController.generar(new List<Integer>(), Date.today(), Date.today(), Date.today(), Date.today());
            System.assert(false, 'Sin empresas debe fallar');
        } catch (AuraHandledException ex) { /* esperado */ }
        try {
            PyGSqlController.generar(new List<Integer>{ 1 }, null, null, null, null);
            System.assert(false, 'Sin fechas debe fallar');
        } catch (AuraHandledException ex) { /* esperado */ }
        Test.startTest();
        try {
            PyGSqlController.getEmpresas();
            System.assert(false, 'El error SQL debe propagarse como AuraHandledException');
        } catch (AuraHandledException ex) { /* esperado */ }
        Test.stopTest();
    }
}