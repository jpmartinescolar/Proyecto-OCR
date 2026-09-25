/**
 * Llamadas a la API de Google de la Bandeja Contable (Cloud Run privado, Bandeja_Contable_Config__mdt).
 * El archivo nunca pasa por aquí: Apex solo pide la sesión de subida resumible y confirma cuando el
 * navegador ha terminado de subirlo a Cloud Storage.
 *
 * Autenticación: Apex firma un JWT con el certificado de Salesforce (Certificate_Name__c), lo canjea
 * en el OAuth de Google por un ID token con audiencia el servicio y lo envía como Bearer.
 */
public with sharing class BandejaContableGcpService {

    private static final Integer TIMEOUT_MS = 20000;
    private static final String GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

    public class GcpException extends Exception {
        /** true si merece la pena reintentar (timeout, 429, 5xx); false si es un error de datos (4xx) */
        public Boolean reintentable = false;
        public Integer statusCode;
    }

    public class Sesion {
        public String uploadUrl;
        public String gcsPath;
    }

    public class Confirmacion {
        public String bandejaGoogleId;
        public String archivoGoogleId;
        public Long size;
        public String crc32c;
    }

    /** Un archivo tal como está registrado en Cloud SQL, con URL firmada para previsualizarlo */
    public class ArchivoGoogle {
        @AuraEnabled public String googleId;
        @AuraEnabled public String archivoId;
        @AuraEnabled public String bandejaId;
        @AuraEnabled public String nombre;
        @AuraEnabled public String gcsPath;
        @AuraEnabled public Long size;
        @AuraEnabled public String mime;
        @AuraEnabled public Datetime createdAt;
        @AuraEnabled public String viewUrl;
    }

    @TestVisible
    private static Bandeja_Contable_Config__mdt configOverride;

    public static Bandeja_Contable_Config__mdt config() {
        if (configOverride != null) return configOverride;
        Bandeja_Contable_Config__mdt c = Bandeja_Contable_Config__mdt.getInstance('Default');
        if (c == null) {
            throw new GcpException('Falta la configuración Bandeja_Contable_Config.Default.');
        }
        return c;
    }

    public static Long maxBytes() {
        Decimal mb = config().Tamano_maximo_MB__c;
        return (mb == null ? 2048 : mb.longValue()) * 1024 * 1024;
    }

    /**
     * Pide a Cloud Run una sesión de subida resumible para el archivo.
     * origin: el origen del navegador (window.location.origin) que subirá el archivo. Google solo
     * habilita CORS en las respuestas de la subida si la sesión se creó con ese Origin.
     */
    public static Sesion crearSesion(Bandeja_Contable_Archivo__c a, String cif, String origin) {
        Sesion s = new Sesion();
        s.gcsPath = rutaGcs(UserInfo.getOrganizationId(), cif, a.Bandeja__c, a.Id, a.Nombre__c);
        Map<String, Object> res = enviar('/upload-session', new Map<String, Object>{
            'gcsPath' => s.gcsPath,
            'size' => a.Tamano__c,
            'mime' => a.Tipo_mime__c,
            'origin' => origin
        });
        s.uploadUrl = (String) res.get('uploadUrl');
        if (String.isBlank(s.uploadUrl)) {
            GcpException e = new GcpException('Google no ha devuelto la sesión de subida.');
            e.reintentable = true;
            throw e;
        }
        return s;
    }

    /**
     * Confirma la subida: Cloud Run comprueba el objeto en Cloud Storage y registra en Cloud SQL la
     * bandeja y el archivo con sus Id de Salesforce (upsert: un reintento no duplica).
     * El archivo debe venir con los campos de su bandeja (Bandeja__r) cargados.
     */
    public static Confirmacion confirmar(Bandeja_Contable_Archivo__c a) {
        Bandeja_Contable__c b = a.Bandeja__r;
        Map<String, Object> res = enviar('/confirm', new Map<String, Object>{
            'sfOrgId' => UserInfo.getOrganizationId(),
            'bandeja' => new Map<String, Object>{
                'sfId' => b.Id,
                'numero' => b.Name,
                'sfAccountId' => b.Empresa__c,
                'cif' => b.Empresa__r.CIF__c,
                'tipo' => b.Tipo_documentacion__c,
                'observaciones' => b.Observaciones__c,
                'origen' => b.Origen__c,
                'sfUserId' => b.CreatedById
            },
            'archivo' => new Map<String, Object>{
                'sfId' => a.Id,
                'nombre' => a.Nombre__c,
                'gcsPath' => a.GCS_ruta__c,
                'sfUserId' => a.CreatedById
            }
        });
        Confirmacion c = new Confirmacion();
        c.bandejaGoogleId = (String) res.get('bandejaId');
        c.archivoGoogleId = (String) res.get('archivoId');
        c.size = res.get('size') == null ? null : Long.valueOf(String.valueOf(res.get('size')));
        c.crc32c = (String) res.get('crc32c');
        return c;
    }

    /** Archivos de una bandeja registrados en Google (la bandeja ya debe estar validada por el llamante) */
    public static List<ArchivoGoogle> listarArchivos(Id bandejaId) {
        Map<String, Object> res = enviar('/records', new Map<String, Object>{
            'sfOrgId' => UserInfo.getOrganizationId(),
            'sfBandejaId' => bandejaId
        });
        List<ArchivoGoogle> out = new List<ArchivoGoogle>();
        for (Object o : (List<Object>) res.get('registros')) {
            Map<String, Object> m = (Map<String, Object>) o;
            ArchivoGoogle g = new ArchivoGoogle();
            g.googleId = (String) m.get('id');
            g.archivoId = (String) m.get('sfArchivoId');
            g.bandejaId = (String) m.get('sfBandejaId');
            g.nombre = (String) m.get('nombre');
            g.gcsPath = (String) m.get('gcsPath');
            g.size = m.get('size') == null ? null : Long.valueOf(String.valueOf(m.get('size')));
            g.mime = (String) m.get('mime');
            g.createdAt = parseFecha((String) m.get('createdAt'));
            g.viewUrl = (String) m.get('viewUrl');
            out.add(g);
        }
        return out;
    }

    private static Datetime parseFecha(String iso) {
        if (String.isBlank(iso)) return null;
        return (Datetime) JSON.deserialize('"' + iso + '"', Datetime.class);
    }

    /** Ruta {orgId}/{cif}/{bandejaId}/{archivoId}/{nombre-saneado}: ordenada por empresa y reconocible sin consultar SQL */
    public static String rutaGcs(String orgId, String cif, Id bandejaId, Id archivoId, String nombre) {
        String cifLimpio = String.isBlank(cif) ? 'SIN-CIF' : cif.toUpperCase().replaceAll('[^A-Z0-9]', '');
        String n = String.isBlank(nombre) ? 'archivo' : nombre;
        n = n.replaceAll('[^A-Za-z0-9._-]', '_');
        if (n.length() > 120) n = n.right(120);
        return orgId + '/' + cifLimpio + '/' + bandejaId + '/' + archivoId + '/' + n;
    }

    // ID token de Google en caché durante la transacción (dura 1 h; se renueva antes)
    @TestVisible
    private static String cachedIdToken;
    @TestVisible
    private static Long cachedIdTokenExp;

    /**
     * Firma un JWT con el certificado de Salesforce y lo canjea en el OAuth de Google por un ID token
     * cuya audiencia es el propio servicio de Cloud Run (flujo "target_audience").
     */
    @TestVisible
    private static String obtenerIdToken() {
        Long ahora = System.currentTimeMillis() / 1000;
        if (cachedIdToken != null && cachedIdTokenExp != null && ahora < (cachedIdTokenExp - 60)) {
            return cachedIdToken;
        }
        Bandeja_Contable_Config__mdt c = config();
        Auth.JWT jwt = new Auth.JWT();
        jwt.setIss(c.SA_Client_Email__c);
        jwt.setSub(c.SA_Client_Email__c);
        jwt.setAud(GOOGLE_TOKEN_URL);
        jwt.setAdditionalClaims(new Map<String, Object>{ 'target_audience' => c.Cloud_Run_URL__c });

        // La firma se hace al serializar, no al crear el Auth.JWS: ambos van dentro del try
        String assertion;
        try {
            assertion = new Auth.JWS(jwt, c.Certificate_Name__c).getCompactSerialization();
        } catch (Exception e) {
            throw new GcpException('No se ha podido firmar el JWT para Google con el certificado '
                + c.Certificate_Name__c + ': ' + e.getMessage());
        }

        HttpRequest req = new HttpRequest();
        req.setEndpoint(GOOGLE_TOKEN_URL);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        req.setTimeout(TIMEOUT_MS);
        req.setBody('grant_type=' + EncodingUtil.urlEncode('urn:ietf:params:oauth:grant-type:jwt-bearer', 'UTF-8')
            + '&assertion=' + EncodingUtil.urlEncode(assertion, 'UTF-8'));

        HttpResponse res;
        try {
            res = new Http().send(req);
        } catch (CalloutException ce) {
            GcpException e = new GcpException('No se ha podido obtener el token de Google: ' + ce.getMessage());
            e.reintentable = true;
            throw e;
        }
        if (res.getStatusCode() != 200) {
            GcpException e = new GcpException('Google OAuth ha respondido ' + res.getStatusCode() + ': ' + res.getBody().left(300));
            e.statusCode = res.getStatusCode();
            e.reintentable = res.getStatusCode() >= 500;
            throw e;
        }
        Map<String, Object> respBody = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        cachedIdToken = (String) respBody.get('id_token');
        cachedIdTokenExp = ahora + 3300;
        return cachedIdToken;
    }

    private static Map<String, Object> enviar(String path, Map<String, Object> body) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:' + config().Named_Credential__c + path);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Authorization', 'Bearer ' + obtenerIdToken());
        req.setTimeout(TIMEOUT_MS);
        req.setBody(JSON.serialize(body));
        HttpResponse res;
        try {
            res = new Http().send(req);
        } catch (CalloutException ce) {
            GcpException e = new GcpException('No se ha podido conectar con Google: ' + ce.getMessage());
            e.reintentable = true;
            throw e;
        }
        Integer code = res.getStatusCode();
        if (code >= 200 && code < 300) {
            return String.isBlank(res.getBody())
                ? new Map<String, Object>()
                : (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        }
        String cuerpo = res.getBody() == null ? '' : res.getBody().left(500);
        GcpException e = new GcpException('Google ha respondido ' + code + ': ' + cuerpo);
        e.statusCode = code;
        e.reintentable = code == 408 || code == 429 || code >= 500;
        throw e;
    }
}
