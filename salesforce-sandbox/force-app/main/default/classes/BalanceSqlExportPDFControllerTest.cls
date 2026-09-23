/**
 * Tests de BalanceSqlExportPDFController (endpoint SQL simulado con HttpCalloutMock).
 */
@isTest
private class BalanceSqlExportPDFControllerTest {

    private class SkyviaMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            String cuerpo = req.getBody();
            HttpResponse r = new HttpResponse();
            r.setHeader('Content-Type', 'application/json');
            r.setStatusCode(200);
            if (cuerpo.contains('NOT LIKE')) {
                r.setBody('{"data":['
                    + '{"cuenta":"1000000000","titulo":"Capital","debeA":"0","haberA":"3000","debeC":"0","haberC":"1000"},'
                    + '{"cuenta":"5700000000","titulo":"Caja","debeA":"5000","haberA":"0","debeC":"1000","haberC":"0"}]}');
            } else {
                r.setBody('{"data":[{"debeA":"0","haberA":"0","debeC":"0","haberC":"0"}]}');
            }
            return r;
        }
    }

    @isTest
    static void testPdf() {
        Test.setCurrentPage(Page.BalanceSqlExportPDF);
        ApexPages.currentPage().getParameters().put('e', '1138');
        ApexPages.currentPage().getParameters().put('en', 'EMPRESA DEMO, SL (1138)');
        ApexPages.currentPage().getParameters().put('d1', '2026-01-01');
        ApexPages.currentPage().getParameters().put('d2', '2026-12-31');
        ApexPages.currentPage().getParameters().put('cc', '1');
        ApexPages.currentPage().getParameters().put('c1', '2025-01-01');
        ApexPages.currentPage().getParameters().put('c2', '2025-12-31');
        ApexPages.currentPage().getParameters().put('dg', '1');
        ApexPages.currentPage().getParameters().put('p', 'PGC PYMES');
        Test.setMock(HttpCalloutMock.class, new SkyviaMock());

        Test.startTest();
        BalanceSqlExportPDFController ctrl = new BalanceSqlExportPDFController();
        ctrl.init();
        Test.stopTest();

        System.assertEquals(null, ctrl.errorMsg, 'No debe haber error');
        System.assert(ctrl.rows.size() > 0, 'Debe construir las filas del PDF');
        System.assertEquals('EMPRESA DEMO, SL (1138)', ctrl.empresaLabel);
        System.assertEquals('2026', ctrl.anioActual);
        System.assertEquals('2025', ctrl.anioComparado);
        Boolean hayTotal = false;
        for (BalanceSqlExportPDFController.PdfRow r : ctrl.rows) {
            if (r.rowClass == 'row-final') hayTotal = true;
        }
        System.assert(hayTotal, 'Los totales deben viajar como fila final');
    }

    @isTest
    static void testSinEmpresa() {
        Test.setCurrentPage(Page.BalanceSqlExportPDF);
        ApexPages.currentPage().getParameters().put('d1', '2026-01-01');
        ApexPages.currentPage().getParameters().put('d2', '2026-12-31');

        BalanceSqlExportPDFController ctrl = new BalanceSqlExportPDFController();
        ctrl.init();
        System.assertNotEquals(null, ctrl.errorMsg, 'Sin empresa debe informar el error');
    }
}