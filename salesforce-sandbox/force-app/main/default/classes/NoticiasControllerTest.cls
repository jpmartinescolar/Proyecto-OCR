/**
 * @description Test de NoticiasController (noticias del despacho en Salesforce CMS).
 *              La Connect API del CMS no tiene simulador en tests, pero sus objetos de salida
 *              sí se pueden construir dentro de un test: se inyecta una colección de noticias
 *              por NoticiasController.coleccionTest. Las llamadas REST a la API de entrega del
 *              CMS se simulan con un HttpCalloutMock que responde bien o con error 500.
 */
@isTest
private class NoticiasControllerTest {

    // ===== Noticias simuladas de la Connect API =====
    private static ConnectApi.ManagedContentVersionCollection coleccion() {
        ConnectApi.ManagedContentVersionCollection c = new ConnectApi.ManagedContentVersionCollection();
        c.items = new List<ConnectApi.ManagedContentVersion>{
            noticia('n1', 'iva-2026', 'Novedades IVA 2026', 'Resumen IVA',
                '<html><body>Cuerpo IVA</body></html>', Datetime.newInstanceGmt(2026, 3, 15, 10, 0, 0)),
            noticia('n2', 'reforma-laboral', 'Reforma laboral', 'Resumen laboral', 'Cuerpo laboral',
                Datetime.newInstanceGmt(2026, 6, 1, 8, 0, 0)),
            noticia('n3', 'sin-fecha', 'Sin fecha', null, null, null)
        };
        // Sin nodos de contenido: se descarta
        ConnectApi.ManagedContentVersion sinNodos = new ConnectApi.ManagedContentVersion();
        sinNodos.managedContentId = 'n4';
        sinNodos.title = 'Sin nodos';
        c.items.add(sinNodos);
        return c;
    }

    private static ConnectApi.ManagedContentVersion noticia(String id, String url, String titulo,
                                                            String resumen, String cuerpo, Datetime fecha) {
        ConnectApi.ManagedContentVersion v = new ConnectApi.ManagedContentVersion();
        v.managedContentId = id;
        v.contentUrlName = url;
        v.title = titulo;
        v.contentNodes = new Map<String, ConnectApi.ManagedContentNodeValue>();
        if (resumen != null) {
            ConnectApi.ManagedContentTextNodeValue t = new ConnectApi.ManagedContentTextNodeValue();
            t.value = resumen;
            v.contentNodes.put('excerpt', t);
        }
        if (cuerpo != null) {
            ConnectApi.ManagedContentTextNodeValue b = new ConnectApi.ManagedContentTextNodeValue();
            b.value = cuerpo;
            v.contentNodes.put('body', b);
        }
        ConnectApi.ManagedContentMediaNodeValue m = new ConnectApi.ManagedContentMediaNodeValue();
        m.url = 'https://cms.test/' + id + '.png';
        v.contentNodes.put('bannerImage', m);
        if (fecha != null) {
            ConnectApi.ManagedContentDateNodeValue d = new ConnectApi.ManagedContentDateNodeValue();
            d.value = fecha;
            v.contentNodes.put('Fecha', d);
        }
        return v;
    }

    // ===== API REST de entrega del CMS simulada =====
    private class CmsMock implements HttpCalloutMock {
        private Boolean ok;
        CmsMock(Boolean ok) { this.ok = ok; }
        public HttpResponse respond(HttpRequest req) {
            HttpResponse r = new HttpResponse();
            r.setHeader('Content-Type', 'application/json');
            if (!ok) {
                r.setStatusCode(500);
                r.setBody('{"message":"error"}');
                return r;
            }
            r.setStatusCode(200);
            String ep = req.getEndpoint();
            if (ep.contains('/contents/search')) {
                r.setBody('{"nextPageUri":"/siguiente","items":['
                    + '{"id":"s1","urlName":"iva-2026","title":"Novedades IVA 2026","publishDate":"2026-03-15T10:00:00.000Z",'
                    + '"contentType":{"developerName":"Noticias_GM_Consulting"}},'
                    + '{"id":"s2","urlName":"fecha-rara","title":"Fecha rara","publishDate":"no-es-fecha",'
                    + '"contentType":{"developerName":"Noticias_GM_Consulting"}},'
                    + '{"id":"img1","urlName":"imagen","title":"Una imagen","contentType":{"developerName":"cms_image"}},'
                    + '{"id":"x","title":"Sin tipo"}]}');
            } else if (ep.contains('/contents/')) {
                r.setBody('{"managedContentId":"n1","urlName":"iva-2026","title":"Novedades IVA 2026",'
                    + '"contentBody":{"excerpt":"Resumen IVA","body":"<html><body><p>Cuerpo IVA</p></body></html>",'
                    + '"bannerImage":{"url":"https://cms.test/n1.png"},"Fecha":"2026-03-15"}}');
            } else {
                // Lista de canales: uno de otro tipo, uno de otra comunidad y el de este sitio
                r.setBody('{"channels":[{"id":"chPub","type":"Public","domainUrl":"https://x.test"},'
                    + '{"id":"chOtro","type":"Community","domainUrl":"https://x.test/otro"},'
                    + '{"id":"chSitio","type":"Community","domainUrl":"https://x.test/clientes"}]}');
            }
            return r;
        }
    }

    @isTest
    static void listadoOrdenadoYDetalleDesdeLaConnectApi() {
        NoticiasController.coleccionTest = coleccion();

        Test.startTest();
        List<NoticiasController.Noticia> todas = NoticiasController.getNoticias(null);
        List<NoticiasController.Noticia> unaSola = NoticiasController.getNoticias(1);
        List<NoticiasController.Noticia> limiteAlto = NoticiasController.getNoticias(500);
        NoticiasController.Noticia porUrl = NoticiasController.getNoticia('iva-2026');
        NoticiasController.Noticia porId = NoticiasController.getNoticia('N2');
        NoticiasController.Noticia ninguna = NoticiasController.getNoticia('no-existe');
        NoticiasController.Noticia vacia = NoticiasController.getNoticia('  ');
        Test.stopTest();

        System.assertEquals(3, todas.size(), 'Tres noticias con nodos; la que no tiene nodos se descarta');
        System.assertEquals('n2', todas[0].id, 'De mas reciente a mas antigua');
        System.assertEquals('n1', todas[1].id);
        System.assertEquals('n3', todas[2].id, 'Las sin fecha van al final');
        System.assertEquals('15 marzo 2026', todas[1].fechaLabel, 'Fecha legible en español');
        System.assertEquals(2026, todas[1].anio);
        System.assertEquals('Resumen IVA', todas[1].excerpt);
        System.assertEquals('https://cms.test/n1.png', todas[1].imageUrl);
        System.assertEquals(null, todas[1].body, 'El listado no lleva cuerpo');
        System.assertEquals(null, todas[2].fechaLabel, 'Sin nodo Fecha no hay etiqueta');
        System.assertEquals(1, unaSola.size(), 'El limite recorta el listado');
        System.assertEquals(3, limiteAlto.size(), 'Un limite fuera de rango se sustituye por el de por defecto');

        System.assertEquals('n1', porUrl.id, 'Detalle por urlName');
        System.assertEquals('<html><body>Cuerpo IVA</body></html>', porUrl.body, 'El detalle lleva el cuerpo');
        System.assertEquals('n2', porId.id, 'Detalle por id, sin distinguir mayusculas');
        System.assertEquals(null, ninguna, 'Clave desconocida: sin noticia');
        System.assertEquals(null, vacia, 'Clave en blanco: sin noticia');
    }

    @isTest
    static void sinCmsDisponibleElListadoAvisaConError() {
        // Sin coleccion inyectada, la Connect API no esta disponible en un test: la excepcion
        // se traduce a AuraHandledException para el componente
        Boolean lanzada = false;
        Test.startTest();
        try {
            NoticiasController.getNoticias(5);
        } catch (AuraHandledException e) {
            lanzada = true;
        }
        Test.stopTest();
        System.assert(lanzada, 'Sin CMS el listado lanza AuraHandledException');
    }

    @isTest
    static void busquedaPorLaApiDeEntrega() {
        Test.setMock(HttpCalloutMock.class, new CmsMock(true));

        Test.startTest();
        NoticiasController.Pagina pagina = NoticiasController.buscar('iva', 0);
        NoticiasController.Pagina enBlanco = NoticiasController.buscar('   ', 0);
        NoticiasController.Pagina paginaNegativa = NoticiasController.buscar('iva', -3);
        Test.stopTest();

        System.assertEquals(2, pagina.items.size(), 'Solo los resultados del tipo noticia; las imagenes y los sin tipo se descartan');
        System.assertEquals('s1', pagina.items[0].id);
        System.assertEquals('15 marzo 2026', pagina.items[0].fechaLabel, 'La fecha de publicacion ISO se traduce');
        System.assertEquals(null, pagina.items[1].fechaLabel, 'Una fecha invalida se ignora sin romper');
        System.assertEquals(true, pagina.hasMore, 'Con nextPageUri hay mas paginas');
        System.assertEquals(0, enBlanco.items.size(), 'Sin termino no se busca');
        System.assertEquals(false, enBlanco.hasMore);
        System.assertEquals(2, paginaNegativa.items.size(), 'Una pagina negativa se trata como la primera');
    }

    @isTest
    static void busquedaConRespaldoSinCallout() {
        // La API de entrega falla (500): se busca entre las recientes de la Connect API simulada
        Test.setMock(HttpCalloutMock.class, new CmsMock(false));
        NoticiasController.coleccionTest = coleccion();

        Test.startTest();
        NoticiasController.Pagina porTitulo = NoticiasController.buscar('IVA', 0);
        NoticiasController.Pagina porCuerpo = NoticiasController.buscar('cuerpo laboral', 0);
        NoticiasController.Pagina nada = NoticiasController.buscar('zzz', 0);
        NoticiasController.Pagina paginaFuera = NoticiasController.buscar('iva', 7);
        Test.stopTest();

        System.assertEquals(1, porTitulo.items.size(), 'Coincide por titulo o resumen, sin distinguir mayusculas');
        System.assertEquals('n1', porTitulo.items[0].id);
        System.assertEquals(null, porTitulo.items[0].body, 'Los resultados no llevan cuerpo');
        System.assertEquals(false, porTitulo.hasMore);
        System.assertEquals(1, porCuerpo.items.size(), 'Tambien coincide por el cuerpo');
        System.assertEquals('n2', porCuerpo.items[0].id);
        System.assertEquals(0, nada.items.size(), 'Sin coincidencias, vacio');
        System.assertEquals(0, paginaFuera.items.size(), 'Una pagina mas alla del final, vacia');
    }

    @isTest
    static void busquedaSinCalloutNiCmsDevuelveVacio() {
        // Ni la API de entrega ni la Connect API: la busqueda no rompe, devuelve vacio
        Test.setMock(HttpCalloutMock.class, new CmsMock(false));
        Test.startTest();
        NoticiasController.Pagina p = NoticiasController.buscar('iva', 0);
        NoticiasController.Noticia n = NoticiasController.getNoticiaPorClave('iva-2026');
        Test.stopTest();
        System.assertEquals(0, p.items.size());
        System.assertEquals(null, n, 'Sin ninguna fuente, el detalle es nulo en vez de error');
    }

    @isTest
    static void detallePorClaveDesdeLaApiDeEntrega() {
        Test.setMock(HttpCalloutMock.class, new CmsMock(true));

        Test.startTest();
        NoticiasController.Noticia n = NoticiasController.getNoticiaPorClave('iva-2026');
        NoticiasController.Noticia vacia = NoticiasController.getNoticiaPorClave('');
        Test.stopTest();

        System.assertEquals('n1', n.id);
        System.assertEquals('Novedades IVA 2026', n.title);
        System.assertEquals('Resumen IVA', n.excerpt);
        System.assertEquals('<p>Cuerpo IVA</p>', n.body, 'Se quitan las etiquetas html y body envolventes');
        System.assertEquals('https://cms.test/n1.png', n.imageUrl);
        System.assertEquals('15 marzo 2026', n.fechaLabel, 'La fecha yyyy-MM-dd del campo Fecha se traduce');
        System.assertEquals(null, vacia, 'Sin clave, sin noticia');
    }

    @isTest
    static void detallePorClaveConRespaldoSinCallout() {
        Test.setMock(HttpCalloutMock.class, new CmsMock(false));
        NoticiasController.coleccionTest = coleccion();

        Test.startTest();
        NoticiasController.Noticia porUrl = NoticiasController.getNoticiaPorClave('reforma-laboral');
        NoticiasController.Noticia porId = NoticiasController.getNoticiaPorClave('n1');
        NoticiasController.Noticia ninguna = NoticiasController.getNoticiaPorClave('no-existe');
        Test.stopTest();

        System.assertEquals('n2', porUrl.id, 'Respaldo por urlName');
        System.assertEquals('Cuerpo laboral', porUrl.body, 'El respaldo lleva el cuerpo');
        System.assertEquals('n1', porId.id, 'Respaldo por id');
        System.assertEquals(null, ninguna);
    }

    @isTest
    static void ordenDeNoticiasPorFecha() {
        NoticiasController.Noticia reciente = new NoticiasController.Noticia();
        reciente.fechaSort = '2026-06-01 08:00:00';
        NoticiasController.Noticia antigua = new NoticiasController.Noticia();
        antigua.fechaSort = '2025-01-01 08:00:00';
        NoticiasController.Noticia sinFecha = new NoticiasController.Noticia();
        NoticiasController.Noticia igual = new NoticiasController.Noticia();
        igual.fechaSort = '2026-06-01 08:00:00';

        List<NoticiasController.Noticia> lista = new List<NoticiasController.Noticia>{ sinFecha, antigua, reciente };
        lista.sort();
        System.assertEquals(reciente, lista[0], 'La mas reciente primero');
        System.assertEquals(antigua, lista[1]);
        System.assertEquals(sinFecha, lista[2], 'Las sin fecha al final');
        System.assertEquals(0, reciente.compareTo(igual), 'Misma fecha, mismo orden');
    }
}