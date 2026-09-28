@IsTest
private class BandejaContableGcpServiceTest {

    @IsTest
    static void tamanoMaximoDeLaConfiguracion() {
        BandejaContableGcpMock.configurar();
        Assert.areEqual(10L * 1024 * 1024, BandejaContableGcpService.maxBytes());
    }

    @IsTest
    static void sinCertificadoNoSeLlamaAGoogle() {
        BandejaContableGcpMock.configurar();
        BandejaContableGcpService.cachedIdToken = null;
        BandejaContableGcpMock mock = new BandejaContableGcpMock();
        Test.setMock(HttpCalloutMock.class, mock);
        try {
            BandejaContableGcpService.listarArchivos(null);
            Assert.fail('Sin certificado no se puede firmar el JWT');
        } catch (BandejaContableGcpService.GcpException e) {
            Assert.isFalse(e.reintentable, 'Un certificado que falta no se arregla reintentando');
            Assert.isTrue(e.getMessage().contains('Certificado_Inexistente'), e.getMessage());
        }
        Assert.areEqual(0, mock.peticiones.size(), 'No debe haber ninguna llamada');
    }

    @IsTest
    static void erroresDeGoogle() {
        BandejaContableGcpMock.configurar();
        BandejaContableGcpMock mock = new BandejaContableGcpMock().responder('/records', 503, 'no disponible');
        Test.setMock(HttpCalloutMock.class, mock);
        try {
            BandejaContableGcpService.listarArchivos(null);
            Assert.fail('Un 503 es un error');
        } catch (BandejaContableGcpService.GcpException e) {
            Assert.isTrue(e.reintentable, 'Un 503 se reintenta');
            Assert.areEqual(503, e.statusCode);
        }
        HttpRequest req = mock.peticiones[0];
        Assert.areEqual('callout:Bandeja_Contable_GCP/records', req.getEndpoint());
        Assert.areEqual('Bearer token-de-prueba', req.getHeader('Authorization'));

        mock.responder('/records', 400, 'faltan datos');
        try {
            BandejaContableGcpService.listarArchivos(null);
            Assert.fail('Un 400 es un error');
        } catch (BandejaContableGcpService.GcpException e) {
            Assert.isFalse(e.reintentable, 'Un 400 no se reintenta');
        }

        mock.lanzar = true;
        try {
            BandejaContableGcpService.listarArchivos(null);
            Assert.fail('Un corte de red es un error');
        } catch (BandejaContableGcpService.GcpException e) {
            Assert.isTrue(e.reintentable, 'Un corte de red se reintenta');
        }
    }

    @IsTest
    static void listaArchivosDeGoogle() {
        BandejaContableGcpMock.configurar();
        Test.setMock(HttpCalloutMock.class, new BandejaContableGcpMock().responder('/records', 200,
            '{"registros":[{"id":"42","sfArchivoId":"a01","sfBandejaId":"a00","nombre":"f.pdf","gcsPath":"o/c/b/a/f.pdf",'
            + '"size":1234,"mime":"application/pdf","estado":"EN_COLA","createdAt":"2026-09-25T10:00:00.000Z","viewUrl":"https://firmada","descargaUrl":"https://descarga"}]}'));
        List<BandejaContableGcpService.ArchivoGoogle> archivos = BandejaContableGcpService.listarArchivos(null);
        Assert.areEqual(1, archivos.size());
        Assert.areEqual('42', archivos[0].googleId);
        Assert.areEqual(1234L, archivos[0].size);
        Assert.areEqual('https://firmada', archivos[0].viewUrl);
        Assert.areEqual('https://descarga', archivos[0].descargaUrl);
        Assert.areEqual('EN_COLA', archivos[0].estado);
        Assert.isNotNull(archivos[0].createdAt);
        Assert.isNull(archivos[0].procesamiento, 'Sin procesar todavía');
    }

    @IsTest
    static void leeElResumenDelProcesamiento() {
        BandejaContableGcpMock.configurar();
        Test.setMock(HttpCalloutMock.class, new BandejaContableGcpMock().responder('/records', 200,
            '{"registros":[{"id":"42","sfArchivoId":"a01","estado":"PROCESADO_CON_INCIDENCIAS","createdAt":"2026-09-28T12:38:15.698599+00:00",'
            + '"procesamiento":{"paginas":19,"tieneTexto":false,"extraidos":0,"documentos":17,"listos":14,"enRevision":3,"conError":0,'
            + '"incidencias":[{"codigo":"SIN_TEXTO","gravedad":"INFO","veces":1}]}}]}'));
        BandejaContableGcpService.ProcesamientoGoogle p = BandejaContableGcpService.listarArchivos(null)[0].procesamiento;
        Assert.areEqual(19, p.paginas);
        Assert.areEqual(false, p.tieneTexto);
        Assert.areEqual(17, p.documentos);
        Assert.areEqual(3, p.enRevision);
        Assert.areEqual('SIN_TEXTO', p.incidencias[0].codigo);
        Assert.areEqual(1, p.incidencias[0].veces);
    }

    @IsTest
    static void listaDocumentosYReprocesa() {
        BandejaContableGcpMock.configurar();
        Test.setMock(HttpCalloutMock.class, new BandejaContableGcpMock()
            .responder('/documents', 200, '{"documentos":[{"id":"doc_1","numero":3,"nombre":"BC-00008_D03.pdf","archivoOrigen":"f.pdf",'
                + '"archivoSubido":"f.pdf","sfArchivoId":"a01","paginaInicio":13,"paginaFin":15,"tipo":"FACTURA","confianza":0.9,'
                + '"estado":"REQUIERE_REVISION","motivos":["DUPLICADO"],"lectura":{"emisor":"OBRAMAT","nif_emisor":"B84406289",'
                + '"numero":"011-0004-027945","fecha":"06/04/2026","total":"178,84","dudas":["borroso"]},"separado":true,'
                + '"motor":"vertex/gemini-2.5-flash-lite","createdAt":"2026-09-28T12:38:26.874644+00:00","viewUrl":"https://firmada"}]}')
            .responder('/reprocess', 200, '{"encolados":2}'));
        List<BandejaContableGcpService.DocumentoGoogle> docs = BandejaContableGcpService.listarDocumentos(null);
        Assert.areEqual(1, docs.size());
        BandejaContableGcpService.DocumentoGoogle d = docs[0];
        Assert.areEqual(3, d.numero);
        Assert.areEqual(13, d.paginaInicio);
        Assert.areEqual(0.9, d.confianza);
        Assert.areEqual('OBRAMAT', d.emisor);
        Assert.areEqual('B84406289', d.nifEmisor);
        Assert.areEqual('011-0004-027945', d.numeroFactura);
        Assert.areEqual('DUPLICADO', d.motivos[0]);
        Assert.areEqual('borroso', d.dudas[0]);
        Assert.isTrue(d.separado);
        Assert.isNotNull(d.createdAt);
        Assert.areEqual(2, BandejaContableGcpService.reprocesar(null, null));
    }
}
