@isTest
private class CatalogoModelosPdfControllerTest {

    @isTest
    static void testCuerpoDelDocumentoPropio() {
        String html = '<div class="title">Catálogo de modelos</div><table class="cat"><tr><td>200</td></tr></table>';
        Id docId = AreaContableFiscalController.guardarCatalogoHtml(html);
        // Segunda llamada: actualiza el mismo documento, no crea otro
        Id docId2 = AreaContableFiscalController.guardarCatalogoHtml(html + '<p>v2</p>');
        System.assertEquals(docId, docId2, 'El catálogo se guarda siempre en el mismo Documento del usuario');

        Test.setCurrentPage(Page.CatalogoModelosPdf);
        ApexPages.currentPage().getParameters().put('d', docId);
        CatalogoModelosPdfController c = new CatalogoModelosPdfController();
        System.assertEquals(null, c.error, 'Sin error con un documento propio');
        System.assert(c.cuerpo.contains('<p>v2</p>'), 'El cuerpo es la última versión guardada');
    }

    @isTest
    static void testSinParametroYDocumentoAjeno() {
        Test.setCurrentPage(Page.CatalogoModelosPdf);
        CatalogoModelosPdfController sinParam = new CatalogoModelosPdfController();
        System.assertNotEquals(null, sinParam.error, 'Sin parámetro d hay error');
        System.assertEquals('', sinParam.cuerpo);

        ApexPages.currentPage().getParameters().put('d', 'noEsUnId');
        CatalogoModelosPdfController malId = new CatalogoModelosPdfController();
        System.assertNotEquals(null, malId.error, 'Un Id inválido da error controlado');

        // Un documento que no es el del catálogo no se sirve aunque sea del usuario
        Document otro = new Document(Name = 'Otro documento', DeveloperName = 'Otro_documento_test_' + String.valueOf(Datetime.now().getTime()),
            FolderId = UserInfo.getUserId(), Body = Blob.valueOf('<p>secreto</p>'), ContentType = 'text/html', Type = 'html');
        insert otro;
        ApexPages.currentPage().getParameters().put('d', otro.Id);
        CatalogoModelosPdfController ajeno = new CatalogoModelosPdfController();
        System.assertNotEquals(null, ajeno.error, 'Un documento que no es el catálogo no se sirve');
        System.assertEquals('', ajeno.cuerpo);

        Boolean lanzada = false;
        try {
            AreaContableFiscalController.guardarCatalogoHtml('');
        } catch (AuraHandledException e) {
            lanzada = true;
        }
        System.assert(lanzada, 'Sin contenido debe lanzar AuraHandledException');
    }

    @isTest
    static void testPaginaReglasIncidencias() {
        Id docId = AreaContableFiscalController.guardarHtmlPdf('<div class="obl-info-bloques"><div class="obl-info-bloque">Regla</div></div>', 'Reglas_Incidencias');
        Test.setCurrentPage(Page.ReglasIncidenciasPdf);
        ApexPages.currentPage().getParameters().put('d', docId);
        CatalogoModelosPdfController c = new CatalogoModelosPdfController();
        System.assertEquals(null, c.error, 'La página de reglas sirve el documento propio');
        System.assert(c.cuerpo.contains('obl-info-bloque'), 'El cuerpo es el HTML de las reglas');
    }
}