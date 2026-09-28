/**
 * Apex no permite un callout después de un DML sin confirmar en la misma transacción: por eso los
 * archivos de cada estado se crean en @TestSetup y cada test ejecuta un solo paso con callout.
 */
@IsTest
private class BandejaContableControllerTest {

    @TestSetup
    static void setup() {
        User asesor = BandejaContableTestData.crearAsesor();
        System.runAs(asesor) {
            Account empresa = BandejaContableTestData.crearEmpresa('Empresa test', 'B00000001', asesor.Id);
            Bandeja_Contable__c b = new Bandeja_Contable__c(Empresa__c = empresa.Id, Tipo_documentacion__c = 'Recibida',
                                                            Observaciones__c = 'Marzo', Origen__c = 'Manual');
            insert b;
            insert new List<Bandeja_Contable_Archivo__c>{
                archivo(b.Id, 'pendiente.pdf', 'Pendiente', null),
                archivo(b.Id, 'subiendo.pdf', 'Subiendo', 'org/B00000001/b/a/subiendo.pdf'),
                archivo(b.Id, 'sincronizado.pdf', 'Sincronizado', 'org/B00000001/b/a/sincronizado.pdf')
            };
        }
    }

    static Bandeja_Contable_Archivo__c archivo(Id bandejaId, String nombre, String estado, String ruta) {
        return new Bandeja_Contable_Archivo__c(Bandeja__c = bandejaId, Nombre__c = nombre, Tamano__c = 1000,
            Tipo_mime__c = 'application/pdf', Estado__c = estado, GCS_ruta__c = ruta, Intentos__c = 0);
    }

    static Id empresaId() {
        return [SELECT Id FROM Account WHERE Name = 'Empresa test' LIMIT 1].Id;
    }

    static Bandeja_Contable_Archivo__c leer(String nombre) {
        return [SELECT Id, Estado__c, GCS_ruta__c, Google_Id__c, Intentos__c, Ultimo_error__c, Bandeja__c,
                       Bandeja__r.Google_Id__c
                FROM Bandeja_Contable_Archivo__c WHERE Nombre__c = :nombre LIMIT 1];
    }

    static BandejaContableController.ArchivoEntradaDTO entrada(String nombre, Long tamano, String mime) {
        BandejaContableController.ArchivoEntradaDTO a = new BandejaContableController.ArchivoEntradaDTO();
        a.clave = nombre;
        a.nombre = nombre;
        a.tamano = tamano;
        a.mime = mime;
        return a;
    }

    static void esperarError(String tipo, List<BandejaContableController.ArchivoEntradaDTO> archivos, String texto) {
        try {
            BandejaContableController.crearBandeja(empresaId(), tipo, null, archivos);
            Assert.fail('Debía fallar: ' + texto);
        } catch (AuraHandledException e) {
            Assert.isTrue(e.getMessage().contains(texto), e.getMessage());
        }
    }

    // ===== Contexto y creación de la bandeja =====

    @IsTest
    static void contexto() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableGcpMock.configurar();
            BandejaContableController.ContextoDTO ctx = BandejaContableController.getContexto();
            Assert.isFalse(ctx.modoLibre);
            Assert.isFalse(ctx.esPortal);
            Assert.areEqual(1, ctx.empresas.size());
            Assert.areEqual(10L * 1024 * 1024, ctx.maxBytes);
        }
    }

    @IsTest
    static void creaBandejaConUnRegistroPorArchivo() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableGcpMock.configurar();
            BandejaContableController.BandejaCreadaDTO r = BandejaContableController.crearBandeja(empresaId(), 'Emitida', 'Enero',
                new List<BandejaContableController.ArchivoEntradaDTO>{
                    entrada('Factura 1.PDF', 5000L, 'application/pdf'),
                    entrada('ticket.jpeg', 300L, '')
                });
            Assert.isTrue(r.numero.startsWith('BC-'), r.numero);
            Assert.areEqual(2, r.archivos.size());
            Assert.areEqual('Factura 1.PDF', r.archivos[0].clave);

            Bandeja_Contable__c b = [SELECT Origen__c, Estado__c, Archivos_total__c, Archivos_sincronizados__c, Estado_subida__c
                                     FROM Bandeja_Contable__c WHERE Id = :r.bandejaId];
            Assert.areEqual('Manual', b.Origen__c, 'Un usuario interno sube como Manual');
            Assert.areEqual('Pendiente', b.Estado__c);
            Assert.areEqual(2, b.Archivos_total__c);
            Assert.areEqual(0, b.Archivos_sincronizados__c);
            Assert.areEqual('En curso', b.Estado_subida__c);
            Assert.areEqual(2, [SELECT COUNT() FROM Bandeja_Contable_Archivo__c WHERE Bandeja__c = :r.bandejaId AND Estado__c = 'Pendiente']);

            List<BandejaContableController.BandejaResumenDTO> lista = BandejaContableController.listarBandejas(null);
            Assert.areEqual(2, lista.size(), 'La del setup y la nueva');
        }
    }

    @IsTest
    static void validaciones() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableGcpMock.configurar();
            esperarError('Emitida', new List<BandejaContableController.ArchivoEntradaDTO>(), 'al menos un archivo');
            esperarError('Emitida', new List<BandejaContableController.ArchivoEntradaDTO>{ entrada('virus.exe', 100L, '') }, 'Formato no permitido');
            esperarError('Emitida', new List<BandejaContableController.ArchivoEntradaDTO>{ entrada('sin_extension', 100L, '') }, 'no tiene extensión');
            esperarError('Emitida', new List<BandejaContableController.ArchivoEntradaDTO>{ entrada('falso.pdf', 100L, 'application/x-msdownload') }, 'no coincide');
            esperarError('Emitida', new List<BandejaContableController.ArchivoEntradaDTO>{ entrada('vacio.pdf', 0L, 'application/pdf') }, 'vacío');
            esperarError('Emitida', new List<BandejaContableController.ArchivoEntradaDTO>{ entrada('grande.zip', 11L * 1024 * 1024, 'application/zip') }, 'tamaño máximo');
            esperarError('Otro', new List<BandejaContableController.ArchivoEntradaDTO>{ entrada('ok.pdf', 100L, 'application/pdf') }, 'tipo de documentación');
            // Si un archivo no es válido no se crea nada, tampoco la bandeja
            esperarError('Emitida', new List<BandejaContableController.ArchivoEntradaDTO>{
                entrada('ok.pdf', 100L, 'application/pdf'), entrada('mal.exe', 100L, '') }, 'mal.exe');
            Assert.areEqual(1, [SELECT COUNT() FROM Bandeja_Contable__c], 'Solo la del setup');
            // Excel en sus dos formatos
            Assert.isNotNull(BandejaContableController.crearBandeja(empresaId(), 'Ticket', null,
                new List<BandejaContableController.ArchivoEntradaDTO>{
                    entrada('libro.xlsx', 100L, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
                    entrada('antiguo.xls', 100L, 'application/vnd.ms-excel')
                }).bandejaId);
        }
    }

    @IsTest
    static void rechazaEmpresaNoAsignada() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableGcpMock.configurar();
            Account ajena = new Account(Name = 'Ajena', Procedencia_del_cliente__c = 'Test', CIF__c = 'B00000002');
            insert ajena;
            try {
                BandejaContableController.crearBandeja(ajena.Id, 'Emitida', null,
                    new List<BandejaContableController.ArchivoEntradaDTO>{ entrada('f.pdf', 100L, 'application/pdf') });
                Assert.fail('Debía rechazar la empresa');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('No tienes permiso'), e.getMessage());
            }
        }
    }

    // ===== Sesión de subida =====

    @IsTest
    static void sesionDeSubida() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableGcpMock.configurar();
            BandejaContableGcpMock mock = new BandejaContableGcpMock()
                .responder('/upload-session', 200, '{"uploadUrl":"https://storage.googleapis.com/sesion",'
                    + '"gcsPath":"org/bandeja/arc_01TEST.pdf","archivoId":"arc_01TEST","bandejaId":"bnd_01TEST"}');
            Test.setMock(HttpCalloutMock.class, mock);
            Bandeja_Contable_Archivo__c a = leer('pendiente.pdf');

            Test.startTest();
            BandejaContableController.ResultadoDTO r = BandejaContableController.solicitarSesionSubida(a.Id, 'https://test.local');
            Test.stopTest();

            Assert.isTrue(r.ok);
            Assert.areEqual('https://storage.googleapis.com/sesion', r.uploadUrl);
            Bandeja_Contable_Archivo__c d = leer('pendiente.pdf');
            Assert.areEqual('Subiendo', d.Estado__c);
            Assert.areEqual('org/bandeja/arc_01TEST.pdf', d.GCS_ruta__c, 'La ruta la decide Google');
            Assert.areEqual('arc_01TEST', d.Google_Id__c);
            Assert.areEqual('bnd_01TEST', d.Bandeja__r.Google_Id__c);
            Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(mock.peticiones[0].getBody());
            Map<String, Object> bandeja = (Map<String, Object>) body.get('bandeja');
            Map<String, Object> archivo = (Map<String, Object>) body.get('archivo');
            Assert.areEqual('https://test.local', body.get('origin'));
            Assert.areEqual(UserInfo.getOrganizationId(), body.get('sfOrgId'));
            Assert.areEqual('B00000001', bandeja.get('cif'));
            Assert.areEqual('Recibida', bandeja.get('tipo'));
            Assert.areEqual('Marzo', bandeja.get('observaciones'));
            Assert.areEqual(a.Id, archivo.get('sfId'));
            Assert.areEqual('pendiente.pdf', archivo.get('nombre'));
            Assert.areEqual(1000, archivo.get('size'));
        }
    }

    @IsTest
    static void sesionFallaEnGoogle() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableGcpMock.configurar();
            Test.setMock(HttpCalloutMock.class, new BandejaContableGcpMock().responder('/upload-session', 500, 'fallo'));
            Test.startTest();
            BandejaContableController.ResultadoDTO r = BandejaContableController.solicitarSesionSubida(leer('pendiente.pdf').Id, 'https://test.local');
            Test.stopTest();
            Assert.isFalse(r.ok);
            Bandeja_Contable_Archivo__c d = leer('pendiente.pdf');
            Assert.areEqual('Error', d.Estado__c);
            Assert.isTrue(d.Ultimo_error__c.contains('500'), d.Ultimo_error__c);
        }
    }

    @IsTest
    static void noSeRepiteLaSubidaDeUnArchivoSincronizado() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableGcpMock.configurar();
            try {
                BandejaContableController.solicitarSesionSubida(leer('sincronizado.pdf').Id, 'https://test.local');
                Assert.fail('No se puede volver a subir');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('Sincronizado'), e.getMessage());
            }
        }
    }

    // ===== Confirmación =====

    @IsTest
    static void confirmaYGuardaLosIdDeGoogle() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableGcpMock.configurar();
            BandejaContableGcpMock mock = new BandejaContableGcpMock()
                .responder('/confirm', 200, '{"bandejaId":"7","archivoId":"42","gcsObjectId":"x","size":1000,"crc32c":"abc"}');
            Test.setMock(HttpCalloutMock.class, mock);
            Test.startTest();
            BandejaContableController.ResultadoDTO r = BandejaContableController.confirmarSubida(leer('subiendo.pdf').Id);
            Test.stopTest();

            Assert.isTrue(r.ok);
            Assert.areEqual('Sincronizado', r.estado);
            Bandeja_Contable_Archivo__c d = leer('subiendo.pdf');
            Assert.areEqual('42', d.Google_Id__c);
            Assert.areEqual('7', d.Bandeja__r.Google_Id__c);

            // La confirmación solo identifica el archivo: Google ya lo tiene registrado desde la sesión
            Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(mock.peticiones[0].getBody());
            Assert.areEqual(UserInfo.getOrganizationId(), body.get('sfOrgId'));
            Assert.areEqual(d.Id, body.get('sfArchivoId'));
        }
    }

    @IsTest
    static void errorTemporalQuedaSubidoYSeReintentaEnCola() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableGcpMock.configurar();
            Test.setMock(HttpCalloutMock.class, new BandejaContableGcpMock().responder('/confirm', 503, 'ocupado'));
            Test.startTest();
            BandejaContableController.ResultadoDTO r = BandejaContableController.confirmarSubida(leer('subiendo.pdf').Id);
            Assert.isTrue(r.ok, 'El archivo ya está en Cloud Storage: no es un fallo para el usuario');
            Assert.areEqual('Subido', r.estado);
            Test.stopTest(); // ejecuta la cola, que vuelve a recibir 503

            Bandeja_Contable_Archivo__c d = leer('subiendo.pdf');
            Assert.areEqual('Subido', d.Estado__c, 'Quedan intentos: sigue pendiente de confirmar');
            Assert.areEqual(1, d.Intentos__c);
            Assert.isTrue(d.Ultimo_error__c.startsWith('Intento 1 de 3'), d.Ultimo_error__c);
        }
    }

    @IsTest
    static void laColaConfirmaCuandoGoogleResponde() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableGcpMock.configurar();
            Test.setMock(HttpCalloutMock.class, new BandejaContableGcpMock()
                .responder('/confirm', 200, '{"bandejaId":"7","archivoId":"43"}'));
            Test.startTest();
            BandejaContableSyncQueueable.encolar(leer('subiendo.pdf').Id, 1);
            Test.stopTest();
            Bandeja_Contable_Archivo__c d = leer('subiendo.pdf');
            Assert.areEqual('Sincronizado', d.Estado__c);
            Assert.areEqual('43', d.Google_Id__c);
        }
    }

    @IsTest
    static void laColaDejaEnErrorTrasElUltimoIntento() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableGcpMock.configurar();
            Test.setMock(HttpCalloutMock.class, new BandejaContableGcpMock().responder('/confirm', 503, 'ocupado'));
            Test.startTest();
            BandejaContableSyncQueueable.encolar(leer('subiendo.pdf').Id, BandejaContableSyncQueueable.MAX_INTENTOS);
            Test.stopTest();
            Assert.areEqual('Error', leer('subiendo.pdf').Estado__c);
        }
    }

    @IsTest
    static void googleRechazaElArchivo() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableGcpMock.configurar();
            Test.setMock(HttpCalloutMock.class, new BandejaContableGcpMock().responder('/confirm', 404, 'no esta'));
            Test.startTest();
            BandejaContableController.ResultadoDTO r = BandejaContableController.confirmarSubida(leer('subiendo.pdf').Id);
            Test.stopTest();
            Assert.isFalse(r.ok);
            Bandeja_Contable_Archivo__c d = leer('subiendo.pdf');
            Assert.areEqual('Error', d.Estado__c);
            Assert.areEqual(1, d.Intentos__c);
        }
    }

    @IsTest
    static void noSeConfirmaUnArchivoSinSubir() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableGcpMock.configurar();
            try {
                BandejaContableController.confirmarSubida(leer('pendiente.pdf').Id);
                Assert.fail('No se puede confirmar sin haber subido');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('todavía no se ha subido'), e.getMessage());
            }
        }
    }

    @IsTest
    static void confirmarDosVecesNoLlamaAGoogle() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableGcpMock.configurar();
            BandejaContableGcpMock mock = new BandejaContableGcpMock();
            Test.setMock(HttpCalloutMock.class, mock);
            BandejaContableController.ResultadoDTO r = BandejaContableController.confirmarSubida(leer('sincronizado.pdf').Id);
            Assert.isTrue(r.ok);
            Assert.areEqual(0, mock.peticiones.size());
        }
    }

    // ===== Otros =====

    @IsTest
    static void elNavegadorInformaDeUnFallo() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableGcpMock.configurar();
            BandejaContableController.marcarError(leer('subiendo.pdf').Id, 'Error de red al subir a Cloud Storage.');
            Bandeja_Contable_Archivo__c d = leer('subiendo.pdf');
            Assert.areEqual('Error', d.Estado__c);
            Assert.areEqual('Error de red al subir a Cloud Storage.', d.Ultimo_error__c);
            Assert.areEqual(0, d.Intentos__c, 'Un fallo del navegador no cuenta como intento de Google');
        }
    }

    @IsTest
    static void listaLosArchivosDeGoogle() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableGcpMock.configurar();
            Test.setMock(HttpCalloutMock.class, new BandejaContableGcpMock().responder('/records', 200, '{"registros":[]}'));
            Id bandejaId = leer('pendiente.pdf').Bandeja__c;
            Test.startTest();
            List<BandejaContableGcpService.ArchivoGoogle> archivos = BandejaContableController.listarArchivosGoogle(bandejaId);
            Test.stopTest();
            Assert.areEqual(0, archivos.size());
        }
    }

    // ===== Consultas de las pantallas =====

    @IsTest
    static void fichaDeLaBandejaConSusArchivos() {
        System.runAs(BandejaContableTestData.asesor()) {
            Id bandejaId = leer('pendiente.pdf').Bandeja__c;
            BandejaContableController.BandejaDetalleDTO d = BandejaContableController.getBandeja(bandejaId);
            Assert.areEqual('Empresa test', d.resumen.empresa);
            Assert.areEqual('B00000001', d.resumen.cif);
            Assert.areEqual('Recibida', d.resumen.tipoValor);
            Assert.areEqual('Factura recibida', d.resumen.tipo, 'Etiqueta del valor de la lista');
            Assert.areEqual('Marzo', d.observaciones);
            Assert.areEqual('Asesor Bandeja', d.asesor);
            Assert.areEqual(3, d.archivos.size());
            Assert.areEqual(3, d.resumen.archivos);
            Assert.areEqual(1, d.archivosSincronizados);
        }
    }

    @IsTest
    static void bandejasDeUnaEmpresa() {
        System.runAs(BandejaContableTestData.asesor()) {
            Account otra = BandejaContableTestData.crearEmpresa('Otra', 'B00000009', BandejaContableTestData.asesor().Id);
            Assert.areEqual(1, BandejaContableController.listarBandejas(empresaId()).size());
            Assert.areEqual(0, BandejaContableController.listarBandejas(otra.Id).size());
            Assert.areEqual(1, BandejaContableController.listarBandejas(null).size());
            List<BandejaContableController.BandejaDetalleDTO> conArchivos = BandejaContableController.listarBandejasConArchivos(empresaId());
            Assert.areEqual(1, conArchivos.size());
            Assert.areEqual(3, conArchivos[0].archivos.size());
            Assert.areEqual(0, BandejaContableController.listarBandejasConArchivos(otra.Id).size());
        }
    }

    @IsTest
    static void fichaDeLaEmpresa() {
        System.runAs(BandejaContableTestData.asesor()) {
            Account a = new Account(Id = empresaId(), BillingStreet = 'Calle de la Industria 14', BillingPostalCode = '28850',
                                    BillingCity = 'Torrejón de Ardoz', BillingState = 'Madrid');
            update a;
            BandejaContableController.EmpresaDetalleDTO e = BandejaContableController.getEmpresa(a.Id);
            Assert.areEqual('B00000001', e.cif);
            Assert.areEqual('Calle de la Industria 14', e.domicilio);
            Assert.areEqual('28850 Torrejón de Ardoz (Madrid)', e.localidad);
            Assert.areEqual('Asesor Bandeja', e.asesor);
        }
    }

    @IsTest
    static void registrosInaccesibles() {
        System.runAs(BandejaContableTestData.asesor()) {
            Id inexistente = Bandeja_Contable__c.SObjectType.getDescribe().getKeyPrefix() + '000000000000';
            try {
                BandejaContableController.getBandeja(inexistente);
                Assert.fail('No existe');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('No se encuentra la bandeja'), e.getMessage());
            }
            try {
                BandejaContableController.getEmpresa(Account.SObjectType.getDescribe().getKeyPrefix() + '000000000000');
                Assert.fail('No existe');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('No se encuentra la empresa'), e.getMessage());
            }
        }
    }
}
