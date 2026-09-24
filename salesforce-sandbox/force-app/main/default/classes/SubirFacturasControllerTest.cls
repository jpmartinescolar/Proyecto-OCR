@isTest
private class SubirFacturasControllerTest {

    /** Mock de Cloud Run: respuesta fija o CalloutException */
    private class GoogleMock implements HttpCalloutMock {
        Integer status;
        String body;
        Boolean lanzar = false;
        GoogleMock(Integer status, String body) { this.status = status; this.body = body; }
        public HttpResponse respond(HttpRequest req) {
            if (lanzar) throw new CalloutException('Read timed out');
            System.assert(req.getEndpoint().startsWith('callout:GCP_Buzon_Test/'), req.getEndpoint());
            HttpResponse res = new HttpResponse();
            res.setStatusCode(status);
            res.setBody(body);
            return res;
        }
    }

    @TestSetup
    static void setup() {
        insert new Account(Name = 'Empresa test', Procedencia_del_cliente__c = 'Test', CIF__c = 'B00000001',
                           Asesor_responsable_fiscal_actual__c = UserInfo.getUserId());
    }

    static void config(Boolean simulado) {
        GcpBuzonService.configOverride = new Buzon_Test_Config__mdt(
            Modo_simulado__c = simulado, Tamano_maximo_MB__c = 10, Named_Credential__c = 'GCP_Buzon_Test');
    }

    static Id empresaId() {
        return [SELECT Id FROM Account WHERE Name = 'Empresa test' LIMIT 1].Id;
    }

    static Buzon_test__c registro(String estado) {
        Buzon_test__c r = new Buzon_test__c(
            Empresa__c = empresaId(), Tipo_documentacion__c = 'Emitida', Opcion__c = 'A',
            Archivo_nombre__c = 'factura.pdf', Archivo_tamano__c = 1000, Archivo_tipo__c = 'application/pdf',
            Estado_sincronizacion__c = estado, Intentos__c = 0,
            GCS_ruta__c = estado == 'Pendiente' ? null : 'org/B00000001/x/factura.pdf');
        insert r;
        return r;
    }

    static Buzon_test__c leer(Id id) {
        return [SELECT Estado_sincronizacion__c, GCS_ruta__c, Google_Id__c, Intentos__c, Ultimo_error__c
                FROM Buzon_test__c WHERE Id = :id];
    }

    static void esperarError(String tipo, String nombre, Long tamano, String mime, String texto) {
        try {
            SubirFacturasController.crearRegistro(empresaId(), tipo, null, nombre, tamano, mime);
            System.assert(false, 'Debía fallar: ' + texto);
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains(texto), e.getMessage());
        }
    }

    // ===== Flujo completo sin Google =====

    @isTest
    static void flujoCompletoSimulado() {
        config(true);
        SubirFacturasController.ContextoDTO ctx = SubirFacturasController.getContexto();
        System.assert(ctx.simulado);
        System.assertEquals(1, ctx.empresas.size());
        System.assertEquals(10L * 1024 * 1024, ctx.maxBytes);

        SubirFacturasController.ResultadoDTO r = SubirFacturasController.crearRegistro(
            empresaId(), 'Emitida', 'Enero', 'Factura enero.PDF', 5000L, 'application/pdf');
        System.assertEquals('Pendiente', r.estado);
        System.assert(r.numero.startsWith('BT-'), r.numero);

        SubirFacturasController.ResultadoDTO s = SubirFacturasController.solicitarSesionSubida(r.recordId, 'https://test.local');
        System.assert(s.ok);
        System.assert(s.sesion.simulado);
        System.assertEquals('Subiendo', leer(r.recordId).Estado_sincronizacion__c);
        System.assert(leer(r.recordId).GCS_ruta__c.contains('/B00000001/' + r.recordId + '/'), 'Ruta por CIF y registro');

        SubirFacturasController.ResultadoDTO c = SubirFacturasController.confirmarSubida(r.recordId);
        System.assert(c.ok);
        System.assertEquals('Sincronizado', c.estado);
        System.assertEquals('SIM-' + r.recordId, leer(r.recordId).Google_Id__c);
    }

    // ===== Validaciones del formulario (Apex repite las del navegador) =====

    @isTest
    static void validaciones() {
        config(true);
        esperarError('Emitida', 'virus.exe', 100L, '', 'Formato no permitido');
        esperarError('Emitida', 'sin_extension', 100L, '', 'no tiene extensión');
        esperarError('Emitida', 'falso.pdf', 100L, 'application/x-msdownload', 'no coincide');
        esperarError('Emitida', 'vacio.pdf', 0L, 'application/pdf', 'vacío');
        esperarError('Emitida', 'grande.zip', 11L * 1024 * 1024, 'application/zip', 'tamaño máximo');
        esperarError('Otro', 'ok.pdf', 100L, 'application/pdf', 'tipo de documentación');
        // MIME vacío se admite (el navegador no siempre lo sabe; Google comprueba el contenido real)
        System.assertNotEquals(null,
            SubirFacturasController.crearRegistro(empresaId(), 'Ticket', null, 'foto.JPEG', 100L, '').recordId);
    }

    @isTest
    static void rechazaEmpresaNoAsignada() {
        config(true);
        Account ajena = new Account(Name = 'Ajena', Procedencia_del_cliente__c = 'Test', CIF__c = 'B00000002');
        insert ajena;
        try {
            SubirFacturasController.crearRegistro(ajena.Id, 'Emitida', null, 'f.pdf', 100L, 'application/pdf');
            System.assert(false, 'Debía rechazar la empresa');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('No tienes permiso'), e.getMessage());
        }
    }

    @isTest
    static void noSeRepiteUnaSubidaSincronizada() {
        config(true);
        Buzon_test__c r = registro('Sincronizado');
        try {
            SubirFacturasController.solicitarSesionSubida(r.Id, 'https://test.local');
            System.assert(false, 'No se puede volver a subir');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('ya está en estado'), e.getMessage());
        }
        try {
            SubirFacturasController.reintentarSincronizacion(r.Id);
            System.assert(false, 'No hay nada que reintentar');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('no tiene una sincronización pendiente'), e.getMessage());
        }
    }

    // ===== Sesión de subida contra Google (mock) =====

    @isTest
    static void sesionOk() {
        config(false);
        Buzon_test__c r = registro('Pendiente');
        Test.setMock(HttpCalloutMock.class, new GoogleMock(200, '{"uploadUrl":"https://storage.googleapis.com/upload/abc"}'));
        Test.startTest();
        SubirFacturasController.ResultadoDTO s = SubirFacturasController.solicitarSesionSubida(r.Id, 'https://test.local');
        Test.stopTest();
        System.assert(s.ok);
        System.assert(!s.sesion.simulado);
        System.assertEquals('https://storage.googleapis.com/upload/abc', s.sesion.uploadUrl);
        System.assertEquals('Subiendo', leer(r.Id).Estado_sincronizacion__c);
    }

    @isTest
    static void sesionErrorDeGoogleQuedaGuardado() {
        config(false);
        Buzon_test__c r = registro('Pendiente');
        Test.setMock(HttpCalloutMock.class, new GoogleMock(500, 'boom'));
        Test.startTest();
        SubirFacturasController.ResultadoDTO s = SubirFacturasController.solicitarSesionSubida(r.Id, 'https://test.local');
        Test.stopTest();
        System.assert(!s.ok, 'Devuelve ok = false en vez de lanzar, para no deshacer el estado Error');
        Buzon_test__c db = leer(r.Id);
        System.assertEquals('Error', db.Estado_sincronizacion__c);
        System.assert(db.Ultimo_error__c.contains('500'), db.Ultimo_error__c);
    }

    @isTest
    static void sesionSinUrlEsError() {
        config(false);
        Buzon_test__c r = registro('Pendiente');
        Test.setMock(HttpCalloutMock.class, new GoogleMock(200, '{}'));
        Test.startTest();
        SubirFacturasController.ResultadoDTO s = SubirFacturasController.solicitarSesionSubida(r.Id, 'https://test.local');
        Test.stopTest();
        System.assert(!s.ok);
        System.assertEquals('Error', leer(r.Id).Estado_sincronizacion__c);
    }

    // ===== Confirmación contra Google (mock) =====

    @isTest
    static void confirmarOk() {
        config(false);
        Buzon_test__c r = registro('Subiendo');
        Test.setMock(HttpCalloutMock.class, new GoogleMock(200, '{"id":42,"size":1000,"crc32c":"AAAA"}'));
        Test.startTest();
        SubirFacturasController.ResultadoDTO c = SubirFacturasController.confirmarSubida(r.Id);
        Test.stopTest();
        System.assert(c.ok);
        System.assertEquals('Sincronizado', leer(r.Id).Estado_sincronizacion__c);
        System.assertEquals('42', leer(r.Id).Google_Id__c);
    }

    @isTest
    static void confirmarErrorTemporalQuedaSubidoYEnCola() {
        config(false);
        Buzon_test__c r = registro('Subiendo');
        Test.setMock(HttpCalloutMock.class, new GoogleMock(503, 'no disponible'));
        Test.startTest();
        SubirFacturasController.ResultadoDTO c = SubirFacturasController.confirmarSubida(r.Id);
        System.assert(c.ok, 'El archivo está subido: no es un fallo para el usuario');
        System.assertEquals('Subido', c.estado);
        System.assertEquals(1, [SELECT COUNT() FROM AsyncApexJob WHERE ApexClass.Name = 'GcpSyncQueueable']);
        Test.stopTest();
    }

    @isTest
    static void confirmarTimeoutEsReintentable() {
        config(false);
        Buzon_test__c r = registro('Subiendo');
        GoogleMock m = new GoogleMock(200, '');
        m.lanzar = true;
        Test.setMock(HttpCalloutMock.class, m);
        Test.startTest();
        SubirFacturasController.ResultadoDTO c = SubirFacturasController.confirmarSubida(r.Id);
        System.assertEquals('Subido', c.estado);
        Test.stopTest();
    }

    @isTest
    static void confirmarRechazoDefinitivoEsError() {
        config(false);
        Buzon_test__c r = registro('Subiendo');
        Test.setMock(HttpCalloutMock.class, new GoogleMock(400, '{"error":"no es un PDF"}'));
        Test.startTest();
        SubirFacturasController.ResultadoDTO c = SubirFacturasController.confirmarSubida(r.Id);
        Test.stopTest();
        System.assert(!c.ok);
        Buzon_test__c db = leer(r.Id);
        System.assertEquals('Error', db.Estado_sincronizacion__c);
        System.assertEquals(1, db.Intentos__c);
    }

    @isTest
    static void confirmarEnEstadoIncorrecto() {
        config(true);
        Buzon_test__c r = registro('Pendiente');
        try {
            SubirFacturasController.confirmarSubida(r.Id);
            System.assert(false, 'No se puede confirmar sin haber subido');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('no está pendiente de confirmar'), e.getMessage());
        }
    }

    // ===== Errores del navegador y reintentos =====

    @isTest
    static void marcarErrorYReintentar() {
        config(true);
        Buzon_test__c r = registro('Subiendo');
        SubirFacturasController.ResultadoDTO res = SubirFacturasController.marcarError(r.Id, 'Error de red');
        System.assertEquals('Error', res.estado);
        System.assertEquals('Error de red', leer(r.Id).Ultimo_error__c);

        Test.startTest();
        SubirFacturasController.reintentarSincronizacion(r.Id);
        Test.stopTest();
        System.assertEquals('Sincronizado', leer(r.Id).Estado_sincronizacion__c, 'En simulado el reintento confirma');
    }

    @isTest
    static void registroInexistente() {
        Buzon_test__c r = registro('Pendiente');
        delete r;
        try {
            SubirFacturasController.marcarError(r.Id, 'x');
            System.assert(false, 'Debía fallar');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('No se encuentra'), e.getMessage());
        }
    }

    // ===== Cola de reintentos =====

    @isTest
    static void colaConfirmaCuandoGoogleResponde() {
        config(false);
        Buzon_test__c r = registro('Subido');
        Test.setMock(HttpCalloutMock.class, new GoogleMock(200, '{"id":"7"}'));
        Test.startTest();
        new GcpSyncQueueable(r.Id, 2).execute(null);
        Test.stopTest();
        Buzon_test__c db = leer(r.Id);
        System.assertEquals('Sincronizado', db.Estado_sincronizacion__c);
        System.assertEquals(1, db.Intentos__c);
    }

    @isTest
    static void colaSigueReintentandoSiQuedanIntentos() {
        config(false);
        Buzon_test__c r = registro('Subido');
        Test.setMock(HttpCalloutMock.class, new GoogleMock(503, 'no disponible'));
        Test.startTest();
        new GcpSyncQueueable(r.Id, 1).execute(null);
        Test.stopTest();
        Buzon_test__c db = leer(r.Id);
        System.assertEquals('Subido', db.Estado_sincronizacion__c);
        System.assert(db.Ultimo_error__c.startsWith('Intento 1 de 3'), db.Ultimo_error__c);
    }

    @isTest
    static void colaQuedaEnErrorTrasElUltimoIntento() {
        config(false);
        Buzon_test__c r = registro('Subido');
        Test.setMock(HttpCalloutMock.class, new GoogleMock(503, 'no disponible'));
        Test.startTest();
        new GcpSyncQueueable(r.Id, GcpSyncQueueable.MAX_INTENTOS).execute(null);
        Test.stopTest();
        System.assertEquals('Error', leer(r.Id).Estado_sincronizacion__c);
    }

    @isTest
    static void colaNoHaceNadaSiYaEstaSincronizado() {
        config(false);
        Buzon_test__c r = registro('Sincronizado');
        Test.startTest();
        new GcpSyncQueueable(r.Id, 1).execute(null);
        Test.stopTest();
        System.assertEquals(0, leer(r.Id).Intentos__c);
    }
}
