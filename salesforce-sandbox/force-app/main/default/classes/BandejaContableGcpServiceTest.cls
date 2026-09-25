@IsTest
private class BandejaContableGcpServiceTest {

    @IsTest
    static void rutaPorEmpresaBandejaYArchivo() {
        Id bandejaId = Bandeja_Contable__c.SObjectType.getDescribe().getKeyPrefix() + '000000000001';
        Id archivoId = Bandeja_Contable_Archivo__c.SObjectType.getDescribe().getKeyPrefix() + '000000000001';
        String ruta = BandejaContableGcpService.rutaGcs('00D000000000001', 'b-1234.5678', bandejaId, archivoId, 'Factura enero (1).pdf');
        Assert.areEqual('00D000000000001/B12345678/' + bandejaId + '/' + archivoId + '/Factura_enero__1_.pdf', ruta);
    }

    @IsTest
    static void rutaSinCifYNombreLargo() {
        String ruta = BandejaContableGcpService.rutaGcs('org', null, null, null, 'x'.repeat(200) + '.pdf');
        Assert.isTrue(ruta.startsWith('org/SIN-CIF/'), ruta);
        Assert.areEqual(120, ruta.substringAfterLast('/').length(), 'El nombre se recorta a 120 caracteres');
    }

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
            + '"size":1234,"mime":"application/pdf","createdAt":"2026-09-25T10:00:00.000Z","viewUrl":"https://firmada"}]}'));
        List<BandejaContableGcpService.ArchivoGoogle> archivos = BandejaContableGcpService.listarArchivos(null);
        Assert.areEqual(1, archivos.size());
        Assert.areEqual('42', archivos[0].googleId);
        Assert.areEqual(1234L, archivos[0].size);
        Assert.areEqual('https://firmada', archivos[0].viewUrl);
        Assert.isNotNull(archivos[0].createdAt);
    }
}
