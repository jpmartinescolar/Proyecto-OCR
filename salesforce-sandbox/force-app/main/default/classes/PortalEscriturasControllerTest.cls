@isTest
private class PortalEscriturasControllerTest {

    private static Account crearEmpresa(String nombre) {
        Account acc = new Account(Name = nombre, Procedencia_del_cliente__c = 'Test');
        insert acc;
        return acc;
    }

    private static Escrituras__c crearEscritura(Id empresaId, Date fecha, String protocolo, String notario, String titulo) {
        return new Escrituras__c(
            Empresa__c = empresaId,
            Fecha_escritura__c = fecha,
            N_Protocolo__c = protocolo,
            Notario__c = notario,
            T_tulo_Escritura__c = titulo,
            Observaciones__c = 'Obs ' + titulo,
            Contiene_descripci_n_objeto_social__c = 'Si'
        );
    }

    private static void adjuntar(Id escrituraId, String titulo, String nombreArchivo) {
        insert new ContentVersion(
            Title = titulo,
            PathOnClient = nombreArchivo,
            VersionData = Blob.valueOf('contenido ' + titulo),
            FirstPublishLocationId = escrituraId
        );
    }

    @isTest
    static void listadoOrdenPaginacionYAdjuntos() {
        Account acc = crearEmpresa('Empresa Escrituras Test');
        List<Escrituras__c> escrituras = new List<Escrituras__c>{
            crearEscritura(acc.Id, Date.newInstance(2024, 3, 10), '100', 'Juan Notario', 'Escritura de constitución'),
            crearEscritura(acc.Id, Date.newInstance(2025, 6, 1), '200', 'Ana Fedataria', 'Escritura de poder'),
            crearEscritura(acc.Id, null, '300', 'Juan Notario', 'Acta sin fecha')
        };
        insert escrituras;
        adjuntar(escrituras[0].Id, 'Escritura firmada', 'escritura.pdf');
        adjuntar(escrituras[0].Id, 'Foto del sello', 'sello.jpg');

        Test.startTest();
        // Página de 2: la más reciente primero y la que no tiene fecha al final
        PortalEscriturasController.ListadoDTO p1 = PortalEscriturasController.getEscrituras(
            null, null, null, null, 2, null, null);
        System.assertEquals(3, p1.total, 'Total sin paginar');
        System.assertEquals(2, p1.filas.size(), 'Dos filas en la primera página');
        System.assert(p1.hayMas, 'Queda otra página');
        System.assertEquals(escrituras[1].Id, p1.filas[0].id, 'La de 2025 va primero');
        System.assertEquals(escrituras[0].Id, p1.filas[1].id, 'La de 2024 después');
        System.assertEquals(2, p1.filas[1].adjuntos, 'Dos archivos enlazados');
        System.assertEquals(0, p1.filas[0].adjuntos, 'Sin archivos');
        System.assertEquals('Empresa Escrituras Test', p1.filas[0].empresa, 'Nombre de la empresa');
        System.assertEquals(Date.newInstance(2024, 3, 10), p1.cursorFecha, 'Cursor en la última fila');
        System.assertEquals(escrituras[0].Id, p1.cursorId, 'Cursor en la última fila');

        PortalEscriturasController.ListadoDTO p2 = PortalEscriturasController.getEscrituras(
            null, null, null, null, 2, p1.cursorFecha, p1.cursorId);
        System.assertEquals(1, p2.filas.size(), 'Una fila en la segunda página');
        System.assertEquals(escrituras[2].Id, p2.filas[0].id, 'La que no tiene fecha cierra el listado');
        System.assert(!p2.hayMas, 'No quedan más');
        System.assertEquals(null, p2.cursorFecha, 'Cursor sin fecha');

        // Cursor en la cola de las que no tienen fecha: ya no queda nada
        PortalEscriturasController.ListadoDTO p3 = PortalEscriturasController.getEscrituras(
            null, null, null, null, 2, p2.cursorFecha, p2.cursorId);
        System.assertEquals(0, p3.filas.size(), 'Fin del listado');
        Test.stopTest();
    }

    @isTest
    static void filtrosDeTextoNotarioYFechas() {
        Account acc = crearEmpresa('Empresa Filtros Test');
        List<Escrituras__c> escrituras = new List<Escrituras__c>{
            crearEscritura(acc.Id, Date.newInstance(2024, 3, 10), '100', 'Juan Notario', 'Escritura de constitución'),
            crearEscritura(acc.Id, Date.newInstance(2025, 6, 1), '200', 'Ana Fedataria', 'Escritura de poder'),
            crearEscritura(acc.Id, Date.newInstance(2025, 9, 15), '300', 'Juan Notario', 'Ampliación de capital')
        };
        insert escrituras;
        String numero = [SELECT Name FROM Escrituras__c WHERE Id = :escrituras[1].Id].Name;

        Test.startTest();
        PortalEscriturasController.ListadoDTO porTitulo = PortalEscriturasController.getEscrituras(
            'poder', null, null, null, null, null, null);
        System.assertEquals(1, porTitulo.total, 'Filtro por título');
        System.assertEquals(escrituras[1].Id, porTitulo.filas[0].id, 'Filtro por título');

        PortalEscriturasController.ListadoDTO porNumero = PortalEscriturasController.getEscrituras(
            numero, null, null, null, null, null, null);
        System.assertEquals(1, porNumero.total, 'El texto también busca en el nº de escritura');

        PortalEscriturasController.ListadoDTO porNotario = PortalEscriturasController.getEscrituras(
            'juan', null, null, null, null, null, null);
        System.assertEquals(2, porNotario.total, 'El texto también busca en el notario, sin distinguir mayúsculas');

        PortalEscriturasController.ListadoDTO porFechas = PortalEscriturasController.getEscrituras(
            null, null, Date.newInstance(2025, 1, 1), Date.newInstance(2025, 6, 30), null, null, null);
        System.assertEquals(1, porFechas.total, 'Filtro por rango de fechas');
        System.assertEquals(escrituras[1].Id, porFechas.filas[0].id, 'Filtro por rango de fechas');

        PortalEscriturasController.ListadoDTO combinado = PortalEscriturasController.getEscrituras(
            'constitu', new List<Id>{ acc.Id }, Date.newInstance(2024, 1, 1), null, null, null, null);
        System.assertEquals(1, combinado.total, 'Filtros combinados');
        System.assertEquals(escrituras[0].Id, combinado.filas[0].id, 'Filtros combinados');
        Test.stopTest();
    }

    @isTest
    static void empresasYFiltroPorEmpresa() {
        Account a = crearEmpresa('Alfa Empresas Test');
        Account b = crearEmpresa('Beta Empresas Test');
        insert new List<Escrituras__c>{
            crearEscritura(a.Id, Date.newInstance(2024, 1, 1), '1', 'N', 'Una de Alfa'),
            crearEscritura(a.Id, Date.newInstance(2024, 2, 1), '2', 'N', 'Otra de Alfa'),
            crearEscritura(b.Id, Date.newInstance(2024, 3, 1), '3', 'N', 'Una de Beta')
        };

        Test.startTest();
        List<PortalEscriturasController.EmpresaDTO> empresas = PortalEscriturasController.getEmpresas();
        Map<Id, PortalEscriturasController.EmpresaDTO> porId = new Map<Id, PortalEscriturasController.EmpresaDTO>();
        for (PortalEscriturasController.EmpresaDTO e : empresas) porId.put(e.id, e);
        System.assertEquals(2, porId.get(a.Id).escrituras, 'Alfa tiene dos escrituras');
        System.assertEquals('Beta Empresas Test', porId.get(b.Id).nombre, 'Nombre de la empresa');

        PortalEscriturasController.ListadoDTO soloBeta = PortalEscriturasController.getEscrituras(
            null, new List<Id>{ b.Id }, null, null, null, null, null);
        System.assertEquals(1, soloBeta.total, 'Filtro por una empresa');
        PortalEscriturasController.ListadoDTO ambas = PortalEscriturasController.getEscrituras(
            null, new List<Id>{ a.Id, b.Id }, null, null, null, null, null);
        System.assertEquals(3, ambas.total, 'Filtro por varias empresas');
        Test.stopTest();
    }

    @isTest
    static void detalleConAdjuntosOrdenados() {
        Account acc = crearEmpresa('Empresa Detalle Test');
        Escrituras__c e = crearEscritura(acc.Id, Date.newInstance(2023, 7, 18), '0', 'Ministerio de Justicia',
            'Apud Acta telemático');
        insert e;
        adjuntar(e.Id, 'Foto del sello', 'sello.jpg');
        adjuntar(e.Id, 'Comprimido', 'anexos.zip');
        adjuntar(e.Id, 'Escritura firmada', 'escritura.pdf');

        Test.startTest();
        PortalEscriturasController.DetalleDTO d = PortalEscriturasController.getDetalle(e.Id);
        Test.stopTest();

        System.assertEquals('Apud Acta telemático', d.titulo, 'Título');
        System.assertEquals('Ministerio de Justicia', d.notario, 'Notario');
        System.assertEquals('Obs Apud Acta telemático', d.observaciones, 'Observaciones');
        System.assertEquals('Si', d.contieneObjetoSocial, 'Picklist objeto social');
        System.assertEquals('Empresa Detalle Test', d.empresa, 'Empresa');
        System.assertEquals(3, d.adjuntos.size(), 'Tres adjuntos');
        System.assertEquals('PDF', d.adjuntos[0].tipo, 'El PDF va primero');
        System.assertEquals('paginas', d.adjuntos[0].previsualizacion, 'El PDF se previsualiza por páginas');
        System.assertEquals('imagen', d.adjuntos[1].previsualizacion, 'La imagen se previsualiza directamente');
        System.assertEquals('ninguna', d.adjuntos[2].previsualizacion, 'El zip no se previsualiza y va al final');
        System.assertNotEquals(null, d.adjuntos[0].versionId, 'Versión publicada del archivo');
        System.assert(d.adjuntos[0].tamano > 0, 'Tamaño del archivo');

        System.assertEquals('paginas', PortalEscriturasController.tipoPrevisualizacion('word_x'), 'Office por páginas');
        System.assertEquals('ninguna', PortalEscriturasController.tipoPrevisualizacion(null), 'Tipo desconocido');
    }

    @isTest
    static void detalleInexistenteDaError() {
        Account acc = crearEmpresa('Empresa Error Test');
        Escrituras__c e = crearEscritura(acc.Id, Date.today(), '1', 'N', 'Borrada');
        insert e;
        delete e;

        Boolean errorSinId = false, errorBorrada = false;
        try { PortalEscriturasController.getDetalle(null); } catch (AuraHandledException ex) { errorSinId = true; }
        try { PortalEscriturasController.getDetalle(e.Id); } catch (AuraHandledException ex) { errorBorrada = true; }
        System.assert(errorSinId, 'Sin Id se avisa');
        System.assert(errorBorrada, 'Escritura borrada o sin acceso se avisa');
    }
}