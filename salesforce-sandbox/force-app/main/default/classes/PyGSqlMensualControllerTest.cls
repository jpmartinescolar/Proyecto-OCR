/**
 * Tests de PyGSqlMensualController (endpoint SQL externo simulado).
 */
@isTest
private class PyGSqlMensualControllerTest {

    private class SkyviaMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse r = new HttpResponse();
            r.setHeader('Content-Type', 'application/json');
            r.setStatusCode(200);
            // Ventas en enero y marzo; gasto en febrero
            r.setBody('{"data":['
                + '{"cuenta":"70500001","titulo":"Prestaciones de servicios",'
                + '"d1":"0","h1":"1000.50","d2":"0","h2":"0","d3":"0","h3":"500.00",'
                + '"d4":"0","h4":"0","d5":"0","h5":"0","d6":"0","h6":"0","d7":"0","h7":"0",'
                + '"d8":"0","h8":"0","d9":"0","h9":"0","d10":"0","h10":"0","d11":"0","h11":"0","d12":"0","h12":"0"},'
                + '{"cuenta":"62900001","titulo":"Otros servicios",'
                + '"d1":"0","h1":"0","d2":"200.50","h2":"0","d3":"0","h3":"0",'
                + '"d4":"0","h4":"0","d5":"0","h5":"0","d6":"0","h6":"0","d7":"0","h7":"0",'
                + '"d8":"0","h8":"0","d9":"0","h9":"0","d10":"0","h10":"0","d11":"0","h11":"0","d12":"0","h12":"0"}]}');
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
        List<PyGSqlMensualController.FilaDTO> rows =
            PyGSqlMensualController.generar(new List<Integer>{ 1 }, 2026);
        Test.stopTest();

        PyGSqlMensualController.FilaDTO cn;
        PyGSqlMensualController.FilaDTO a4;
        PyGSqlMensualController.FilaDTO cuentaGasto;
        for (PyGSqlMensualController.FilaDTO r : rows) {
            if (r.key == 'CN' && r.tipo == 'SECCION') cn = r;
            if (r.key == 'A4') a4 = r;
            if (r.tipo == 'CUENTA' && r.codigoCuenta == '62900001') cuentaGasto = r;
        }
        System.assertNotEquals(null, cn, 'Debe existir la sección de cifra de negocios');
        System.assertEquals(1000.50, cn.meses[0], 'Ventas de enero');
        System.assertEquals(0, cn.meses[1], 'Febrero sin ventas');
        System.assertEquals(500.00, cn.meses[2], 'Ventas de marzo');
        System.assertEquals(1500.50, cn.total, 'Total anual de la cifra de negocios');

        System.assertNotEquals(null, cuentaGasto, 'Debe incluir la fila de la cuenta 629');
        System.assertEquals(-200.50, cuentaGasto.meses[1], 'El gasto de febrero va en negativo');
        System.assertEquals(true, cuentaGasto.esGasto, 'La 629 es gasto');

        System.assertNotEquals(null, a4, 'Debe existir el resultado del ejercicio');
        System.assertEquals(1000.50, a4.meses[0], 'Resultado de enero');
        System.assertEquals(-200.50, a4.meses[1], 'Resultado de febrero');
        System.assertEquals(1300.00, a4.total, 'Resultado anual');
    }

    @isTest
    static void testErrores() {
        Test.setMock(HttpCalloutMock.class, new SkyviaErrorMock());
        try {
            PyGSqlMensualController.generar(new List<Integer>(), 2026);
            System.assert(false, 'Sin empresas debe fallar');
        } catch (AuraHandledException ex) { /* esperado */ }
        try {
            PyGSqlMensualController.generar(new List<Integer>{ 1 }, null);
            System.assert(false, 'Sin ejercicio debe fallar');
        } catch (AuraHandledException ex) { /* esperado */ }
        Test.startTest();
        try {
            PyGSqlMensualController.generar(new List<Integer>{ 1 }, 2026);
            System.assert(false, 'El error SQL debe propagarse como AuraHandledException');
        } catch (AuraHandledException ex) { /* esperado */ }
        Test.stopTest();
    }
}