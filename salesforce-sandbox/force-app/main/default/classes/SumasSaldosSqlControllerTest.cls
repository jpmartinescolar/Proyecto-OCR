/**
 * Tests de SumasSaldosSqlController (endpoint SQL externo simulado con HttpCalloutMock).
 */
@isTest
private class SumasSaldosSqlControllerTest {

    private static String ultimoCuerpo;

    private class SkyviaMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            ultimoCuerpo = req.getBody();
            HttpResponse r = new HttpResponse();
            r.setHeader('Content-Type', 'application/json');
            r.setStatusCode(200);
            r.setBody('{"data":['
                + '{"cuenta":"4300000001","titulo":"Cliente","debe":"2000","haber":"500"},'
                + '{"cuenta":"5700000000","titulo":"Caja","debe":"5000","haber":"1200"}]}');
            return r;
        }
    }

    @isTest
    static void testSumasSaldos() {
        Test.setMock(HttpCalloutMock.class, new SkyviaMock());

        Test.startTest();
        List<SumasSaldosSqlController.CuentaSaldoDTO> filas = SumasSaldosSqlController.getSumasSaldos(
            1, Date.newInstance(2026, 1, 1), Date.newInstance(2026, 12, 31));
        Test.stopTest();

        System.assertEquals(2, filas.size(), 'Debe listar las dos cuentas con movimientos');
        System.assertEquals('4300000001', filas[0].codigo);
        System.assertEquals('Cliente', filas[0].titulo);
        System.assertEquals(2000, filas[0].debe);
        System.assertEquals(500, filas[0].haber);
        System.assertEquals(1500, filas[0].saldo, 'saldo = Debe - Haber');
        System.assertEquals(3800, filas[1].saldo);
        System.assert(ultimoCuerpo.contains('NOT IN (\'Cierre ejercicio\', \'Cierre contabilidad\')'),
            'Los asientos de cierre no deben entrar en los saldos');
        System.assert(ultimoCuerpo.contains('FechaAsiento >= \'20260101\''),
            'El saldo debe acotarse a las fechas seleccionadas');
    }

    @isTest
    static void testValidaciones() {
        try {
            SumasSaldosSqlController.getSumasSaldos(null, Date.today(), Date.today());
            System.assert(false, 'Sin empresa debe fallar');
        } catch (AuraHandledException ex) { /* esperado */ }
        try {
            SumasSaldosSqlController.getSumasSaldos(1, null, null);
            System.assert(false, 'Sin fechas debe fallar');
        } catch (AuraHandledException ex) { /* esperado */ }
    }
}