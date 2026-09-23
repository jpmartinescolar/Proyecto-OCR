/**
 * Tests de PyGSqlExportPDFController (endpoint SQL simulado con HttpCalloutMock).
 */
@isTest
private class PyGSqlExportPDFControllerTest {

    private class SkyviaMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse r = new HttpResponse();
            r.setHeader('Content-Type', 'application/json');
            r.setStatusCode(200);
            r.setBody('{"data":['
                + '{"cuenta":"7000000000","titulo":"Ventas","debeA":"0","haberA":"10000","debeC":"0","haberC":"8000"},'
                + '{"cuenta":"6000000000","titulo":"Compras","debeA":"4000","haberA":"0","debeC":"3000","haberC":"0"}]}');
            return r;
        }
    }

    @isTest
    static void testPdf() {
        Test.setCurrentPage(Page.PyGSqlExportPDF);
        ApexPages.currentPage().getParameters().put('e', '1138');
        ApexPages.currentPage().getParameters().put('en', 'EMPRESA DEMO, SL (1138)');
        ApexPages.currentPage().getParameters().put('d1', '2026-01-01');
        ApexPages.currentPage().getParameters().put('d2', '2026-12-31');
        ApexPages.currentPage().getParameters().put('cc', '1');
        ApexPages.currentPage().getParameters().put('c1', '2025-01-01');
        ApexPages.currentPage().getParameters().put('c2', '2025-12-31');
        ApexPages.currentPage().getParameters().put('dg', '1');
        Test.setMock(HttpCalloutMock.class, new SkyviaMock());

        Test.startTest();
        PyGSqlExportPDFController ctrl = new PyGSqlExportPDFController();
        ctrl.init();
        Test.stopTest();

        System.assertEquals(null, ctrl.errorMsg, 'No debe haber error');
        System.assert(ctrl.rows.size() > 0, 'Debe construir las filas del PDF');
        System.assertEquals('EMPRESA DEMO, SL (1138)', ctrl.empresaLabel);
        Boolean hayFinal = false, hayCuenta = false;
        for (PyGSqlExportPDFController.PdfRow r : ctrl.rows) {
            if (r.rowClass == 'row-final') hayFinal = true;
            if (r.isCuenta == true) hayCuenta = true;
        }
        System.assert(hayFinal, 'El resultado del ejercicio debe viajar como fila final');
        System.assert(hayCuenta, 'Con desglose deben viajar las cuentas');
    }

    @isTest
    static void testSinDesglose() {
        Test.setCurrentPage(Page.PyGSqlExportPDF);
        ApexPages.currentPage().getParameters().put('e', '1138');
        ApexPages.currentPage().getParameters().put('d1', '2026-01-01');
        ApexPages.currentPage().getParameters().put('d2', '2026-12-31');
        ApexPages.currentPage().getParameters().put('cc', '0');
        ApexPages.currentPage().getParameters().put('dg', '0');
        Test.setMock(HttpCalloutMock.class, new SkyviaMock());

        Test.startTest();
        PyGSqlExportPDFController ctrl = new PyGSqlExportPDFController();
        ctrl.init();
        Test.stopTest();

        System.assertEquals(null, ctrl.errorMsg);
        for (PyGSqlExportPDFController.PdfRow r : ctrl.rows) {
            System.assert(r.isCuenta != true, 'Sin desglose no deben viajar las cuentas');
        }
    }

    @isTest
    static void testSinEmpresa() {
        Test.setCurrentPage(Page.PyGSqlExportPDF);
        ApexPages.currentPage().getParameters().put('d1', '2026-01-01');
        ApexPages.currentPage().getParameters().put('d2', '2026-12-31');

        PyGSqlExportPDFController ctrl = new PyGSqlExportPDFController();
        ctrl.init();
        System.assertNotEquals(null, ctrl.errorMsg, 'Sin empresa debe informar el error');
    }
}