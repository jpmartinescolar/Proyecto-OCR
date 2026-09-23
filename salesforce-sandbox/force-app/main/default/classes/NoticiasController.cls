/**
 * Noticias del despacho publicadas en Salesforce CMS (canal "Portal de Clientes").
 * Lee el contenido enriquecido (tipo artículo: título, fecha, imagen, resumen y cuerpo)
 * mediante la Connect API y lo devuelve ordenado de más reciente a más antiguo.
 */
public with sharing class NoticiasController {

    // Tipo de contenido CMS "artículo de noticia" (con Fecha, bannerImage, excerpt, body).
    private static final String NEWS_TYPE = '0T107000000TOEY';
    // Nombre de API del tipo: lo usa la búsqueda para filtrar a solo noticias (descarta imágenes).
    private static final String NEWS_TYPE_DEVNAME = 'Noticias_GM_Consulting';
    // Network del sitio (fallback si Network.getNetworkId() no está disponible en el contexto).
    private static final String DEFAULT_NETWORK = '0DBS8000000Nx7ROAS';
    // Versión de API para las llamadas REST a la entrega del CMS.
    private static final String API_VER = 'v62.0';
    // Canal de entrega del CMS de esta comunidad (cacheado por transacción).
    private static String cachedChannelId;
    // Solo para tests: colección de contenido inyectada en lugar de llamar a la Connect API
    @TestVisible private static ConnectApi.ManagedContentVersionCollection coleccionTest;
    private static final List<String> MESES = new List<String>{
        '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    };

    /** Listado ordenado (más reciente primero). lim limita el número devuelto. Sin cuerpo (payload ligero). */
    @AuraEnabled(cacheable=true)
    public static List<Noticia> getNoticias(Integer lim) {
        Integer n = (lim == null || lim <= 0 || lim > 200) ? 100 : lim;
        List<Noticia> result = fetchAll(false);
        result.sort();
        if (result.size() > n) {
            List<Noticia> trimmed = new List<Noticia>();
            for (Integer i = 0; i < n; i++) trimmed.add(result[i]);
            return trimmed;
        }
        return result;
    }

    /** Una noticia por su id (managedContentId) o por su urlName, con el cuerpo completo. */
    @AuraEnabled(cacheable=true)
    public static Noticia getNoticia(String key) {
        if (String.isBlank(key)) return null;
        String k = key.trim();
        for (Noticia art : fetchAll(true)) {
            if (k.equalsIgnoreCase(art.id) || k.equalsIgnoreCase(art.urlName)) {
                return art;
            }
        }
        return null;
    }

    private static List<Noticia> fetchAll(Boolean includeBody) {
        Id networkId;
        try { networkId = Network.getNetworkId(); } catch (Exception e) { networkId = null; }
        String community = (networkId == null) ? DEFAULT_NETWORK : String.valueOf(networkId);

        List<Noticia> result = new List<Noticia>();
        try {
            ConnectApi.ManagedContentVersionCollection coll = coleccionTest != null
                ? coleccionTest
                : ConnectApi.ManagedContent.getAllManagedContent(community, 0, 200, null, NEWS_TYPE);
            if (coll == null || coll.items == null) return result;
            for (ConnectApi.ManagedContentVersion v : coll.items) {
                if (v.contentNodes == null) continue;
                result.add(buildNoticia(v, includeBody));
            }
        } catch (Exception e) {
            throw new AuraHandledException('No se pudieron cargar las noticias: ' + e.getMessage());
        }
        return result;
    }

    private static Noticia buildNoticia(ConnectApi.ManagedContentVersion v, Boolean includeBody) {
        Noticia art = new Noticia();
        art.id = v.managedContentId;
        art.urlName = v.contentUrlName;
        art.title = v.title;
        art.excerpt = textNode(v.contentNodes.get('excerpt'));
        art.imageUrl = mediaNode(v.contentNodes.get('bannerImage'));
        if (includeBody) art.body = textNode(v.contentNodes.get('body'));
        applyFecha(art, v.contentNodes.get('Fecha'));
        return art;
    }

    private static String textNode(ConnectApi.ManagedContentNodeValue node) {
        if (node instanceof ConnectApi.ManagedContentTextNodeValue) {
            return ((ConnectApi.ManagedContentTextNodeValue) node).value;
        }
        return null;
    }

    private static String mediaNode(ConnectApi.ManagedContentNodeValue node) {
        if (node instanceof ConnectApi.ManagedContentMediaNodeValue) {
            return ((ConnectApi.ManagedContentMediaNodeValue) node).url;
        }
        return null;
    }

    private static void applyFecha(Noticia art, ConnectApi.ManagedContentNodeValue node) {
        if (!(node instanceof ConnectApi.ManagedContentDateNodeValue)) return;
        Datetime dt = ((ConnectApi.ManagedContentDateNodeValue) node).value;
        if (dt == null) return;
        art.fechaSort = dt.formatGmt('yyyy-MM-dd HH:mm:ss');
        Integer y = Integer.valueOf(dt.formatGmt('yyyy'));
        Integer m = Integer.valueOf(dt.formatGmt('MM'));
        Integer d = Integer.valueOf(dt.formatGmt('dd'));
        art.fechaLabel = d + ' ' + MESES[m] + ' ' + y;
        art.anio = y;
    }

    // ===== BÚSQUEDA Y DETALLE A ESCALA (API de entrega del CMS vía REST, sobre miles) =====

    /**
     * Búsqueda de texto completo (título, resumen y cuerpo) sobre TODO el CMS, paginada en servidor.
     * Devuelve una página de resultados (solo noticias) ordenados por relevancia/fecha de publicación.
     * No incluye cuerpo ni imagen: la búsqueda del CMS devuelve resultados ligeros.
     */
    @AuraEnabled
    public static Pagina buscar(String q, Integer page) {
        Pagina out = new Pagina();
        if (String.isBlank(q)) return out;
        Integer pg = (page == null || page < 0) ? 0 : page;
        // 1) Búsqueda a ESCALA (todo el CMS) vía API de entrega, si el callout está disponible.
        try {
            String channelId = getChannelId();
            if (String.isNotBlank(channelId)) {
                String ep = baseUrl() + '/services/data/' + API_VER + '/connect/cms/delivery/channels/'
                    + channelId + '/contents/search?queryTerm=' + EncodingUtil.urlEncode(q.trim(), 'UTF-8')
                    + '&page=' + pg + '&pageSize=20';
                Map<String, Object> body = getJson(ep);
                if (body != null) {
                    out.hasMore = body.get('nextPageUri') != null;
                    for (Object io : safeList(body.get('items'))) {
                        Map<String, Object> it = (Map<String, Object>) io;
                        Map<String, Object> ct = (Map<String, Object>) it.get('contentType');
                        // La búsqueda mezcla imágenes y otros tipos: solo noticias.
                        if (ct == null || !NEWS_TYPE_DEVNAME.equals((String) ct.get('developerName'))) continue;
                        Noticia n = new Noticia();
                        n.id = (String) it.get('id');
                        n.urlName = (String) it.get('urlName');
                        n.title = (String) it.get('title');
                        applyIsoDate(n, (String) it.get('publishDate'));
                        out.items.add(n);
                    }
                    return out;
                }
            }
        } catch (Exception e) {
            // El callout no está disponible en este contexto: usamos el respaldo de abajo.
        }
        // 2) Respaldo SIN callout: filtra las recientes (título, resumen y cuerpo) en Apex.
        return buscarEnRecientes(q, pg);
    }

    private static Pagina buscarEnRecientes(String q, Integer pg) {
        Pagina out = new Pagina();
        String t = q.trim().toLowerCase();
        List<Noticia> hits = new List<Noticia>();
        try {
            for (Noticia n : fetchAll(true)) {
                String hay = ((n.title == null ? '' : n.title) + ' '
                    + (n.excerpt == null ? '' : n.excerpt) + ' '
                    + (n.body == null ? '' : n.body)).toLowerCase();
                if (hay.contains(t)) {
                    n.body = null; // el cuerpo no hace falta en los resultados
                    hits.add(n);
                }
            }
        } catch (Exception e) {
            return out;
        }
        hits.sort();
        Integer pageSize = 20;
        Integer fromI = pg * pageSize;
        if (fromI >= hits.size()) return out;
        Integer toI = Math.min(fromI + pageSize, hits.size());
        for (Integer i = fromI; i < toI; i++) out.items.add(hits[i]);
        out.hasMore = toI < hits.size();
        return out;
    }

    /** Una noticia (con cuerpo) por su clave/id. Intenta una sola consulta; si el contexto no
     *  permite el callout, cae al método clásico (ConnectApi, sin callout) que siempre funciona. */
    @AuraEnabled
    public static Noticia getNoticiaPorClave(String key) {
        if (String.isBlank(key)) return null;
        // Intento rápido: una sola consulta por la API de entrega (si el callout está disponible).
        try {
            String channelId = getChannelId();
            if (String.isNotBlank(channelId)) {
                Map<String, Object> c = getJson(baseUrl() + '/services/data/' + API_VER
                    + '/connect/cms/delivery/channels/' + channelId + '/contents/'
                    + EncodingUtil.urlEncode(key.trim(), 'UTF-8'));
                if (c != null && c.get('contentBody') != null) return buildFromBody(c);
            }
        } catch (Exception e) {
            // El callout no está disponible en este contexto: usamos el respaldo de abajo.
        }
        // Respaldo SIN callout (ConnectApi): busca entre las recientes por id o por urlName.
        try {
            for (Noticia art : fetchAll(true)) {
                if (key.equalsIgnoreCase(art.urlName) || key.equalsIgnoreCase(art.id)) return art;
            }
        } catch (Exception e) {
            return null;
        }
        return null;
    }

    private static Noticia buildFromBody(Map<String, Object> c) {
        Noticia art = new Noticia();
        art.id = (String) c.get('managedContentId');
        art.urlName = (String) c.get('urlName');
        art.title = (String) c.get('title');
        Object bodyObj = c.get('contentBody');
        if (bodyObj instanceof Map<String, Object>) {
            Map<String, Object> cb = (Map<String, Object>) bodyObj;
            art.excerpt = (String) cb.get('excerpt');
            art.body = stripHtmlWrapper((String) cb.get('body'));
            Object bi = cb.get('bannerImage');
            if (bi instanceof Map<String, Object>) art.imageUrl = (String) ((Map<String, Object>) bi).get('url');
            applyIsoDate(art, (String) cb.get('Fecha'));
        }
        return art;
    }

    // Canal de entrega del CMS de esta comunidad (lo busca por el prefijo de URL de la comunidad).
    private static String getChannelId() {
        if (cachedChannelId != null) return cachedChannelId;
        String prefix;
        Id netId;
        try { netId = Network.getNetworkId(); } catch (Exception e) { netId = null; }
        Id lookup = (netId == null) ? (Id) DEFAULT_NETWORK : netId;
        try {
            List<Network> nets = [SELECT UrlPathPrefix FROM Network WHERE Id = :lookup LIMIT 1];
            if (!nets.isEmpty()) prefix = nets[0].UrlPathPrefix;
        } catch (Exception e) { prefix = null; }
        Map<String, Object> body = getJson(baseUrl() + '/services/data/' + API_VER + '/connect/cms/delivery/channels');
        if (body == null) return null;
        String fallback;
        for (Object co : safeList(body.get('channels'))) {
            Map<String, Object> ch = (Map<String, Object>) co;
            if (!'Community'.equals((String) ch.get('type'))) continue;
            String id = (String) ch.get('id');
            String dom = (String) ch.get('domainUrl');
            if (fallback == null) fallback = id;
            if (String.isNotBlank(prefix) && dom != null && dom.contains('/' + prefix)) {
                cachedChannelId = id;
                return id;
            }
        }
        cachedChannelId = fallback;
        return fallback;
    }

    private static String baseUrl() {
        return URL.getOrgDomainUrl().toExternalForm();
    }

    private static Map<String, Object> getJson(String endpoint) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('GET');
        req.setHeader('Authorization', 'Bearer ' + UserInfo.getSessionId());
        req.setTimeout(30000);
        HttpResponse res = new Http().send(req);
        if (res.getStatusCode() != 200) {
            throw new AuraHandledException('CMS REST ' + res.getStatusCode());
        }
        return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
    }

    private static List<Object> safeList(Object o) {
        return (o instanceof List<Object>) ? (List<Object>) o : new List<Object>();
    }

    private static String stripHtmlWrapper(String html) {
        if (String.isBlank(html)) return html;
        return html.replaceAll('(?i)</?(html|body)>', '');
    }

    // Acepta "yyyy-MM-dd" (campo Fecha) o ISO completo (publishDate).
    private static void applyIsoDate(Noticia art, String iso) {
        if (String.isBlank(iso)) return;
        String s = iso.trim();
        Datetime dt;
        try {
            dt = (s.length() == 10)
                ? Datetime.newInstanceGmt(Date.valueOf(s), Time.newInstance(0, 0, 0, 0))
                : (Datetime) JSON.deserialize('"' + s + '"', Datetime.class);
        } catch (Exception e) { return; }
        art.fechaSort = dt.formatGmt('yyyy-MM-dd HH:mm:ss');
        Integer y = Integer.valueOf(dt.formatGmt('yyyy'));
        Integer m = Integer.valueOf(dt.formatGmt('MM'));
        Integer d = Integer.valueOf(dt.formatGmt('dd'));
        art.fechaLabel = d + ' ' + MESES[m] + ' ' + y;
        art.anio = y;
    }

    public class Pagina {
        @AuraEnabled public List<Noticia> items = new List<Noticia>();
        @AuraEnabled public Boolean hasMore = false;
    }

    public class Noticia implements Comparable {
        @AuraEnabled public String id;
        @AuraEnabled public String urlName;
        @AuraEnabled public String title;
        @AuraEnabled public String excerpt;
        @AuraEnabled public String body;
        @AuraEnabled public String imageUrl;
        @AuraEnabled public String fechaSort;
        @AuraEnabled public String fechaLabel;
        @AuraEnabled public Integer anio;

        // Orden descendente por fecha (las sin fecha al final).
        public Integer compareTo(Object other) {
            Noticia o = (Noticia) other;
            String a = (this.fechaSort == null) ? '' : this.fechaSort;
            String b = (o.fechaSort == null) ? '' : o.fechaSort;
            if (a == b) return 0;
            return (a > b) ? -1 : 1;
        }
    }
}