/**
 * Tests de LibroMayorSqlExportPDFController (endpoint SQL simulado con HttpCalloutMock).
 */
@isTest
private class LibroMayorSqlExportPDFControllerTest {

    private class SkyviaMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse r = new HttpResponse();
            r.setHeader('Content-Type', 'application/json');
            r.setStatusCode(200);
            r.setBody('{"data":['
                + '{"tipo":"META","fecha":null,"texto":"Banco Caixabank","ca":null,"imp":null,"ant":null,"sig":null,"pos":1,"total":1},'
                + '{"tipo":"MOV","fecha":"2026-01-10T00:00:00","texto":"Cobro factura","ca":"D","imp":"100.00","ant":null,"sig":null,"pos":null,"total":null},'
                + '{"tipo":"MOV","fecha":"2026-01-15T00:00:00","texto":"Pago recibo","ca":"H","imp":"40.50","ant":null,"sig":null,"pos":null,"total":null}]}');
            return r;
        }
    }

    @isTest
    static void testPdf() {
        Test.setCurrentPage(Page.LibroMayorSqlExportPDF);
        ApexPages.currentPage().getParameters().put('e', '1138');
        ApexPages.currentPage().getParameters().put('en', 'EMPRESA DEMO, SL');
        ApexPages.currentPage().getParameters().put('c', '57200001');
        ApexPages.currentPage().getParameters().put('d1', '2026-01-01');
        ApexPages.currentPage().getParameters().put('d2', '2026-12-31');
        Test.setMock(HttpCalloutMock.class, new SkyviaMock());

        Test.startTest();
        LibroMayorSqlExportPDFController ctrl = new LibroMayorSqlExportPDFController();
        ctrl.init();
        Test.stopTest();

        System.assertEquals(null, ctrl.errorMsg, 'No debe haber error');
        System.assertEquals(2, ctrl.rows.size(), 'Debe listar los dos movimientos');
        System.assertEquals('EMPRESA DEMO, SL', ctrl.empresaLabel);
        System.assert(ctrl.cuentaLabel.contains('Banco Caixabank'), 'La cuenta lleva su titulo');
        System.assertEquals('100,00 €', ctrl.rows[0].debe);
        System.assertEquals('59,50 €', ctrl.rows[1].saldo, 'El saldo es acumulado');
        System.assertEquals('59,50 €', ctrl.totalSaldo);
    }

    @isTest
    static void testSinParametros() {
        Test.setCurrentPage(Page.LibroMayorSqlExportPDF);
        LibroMayorSqlExportPDFController ctrl = new LibroMayorSqlExportPDFController();
        ctrl.init();
        System.assertNotEquals(null, ctrl.errorMsg, 'Sin empresa y cuenta debe informar el error');
    }
}