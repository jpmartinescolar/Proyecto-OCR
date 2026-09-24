/**
 * Llamadas a la API intermedia de Google (Cloud Run "buzon-api") para Subir facturas.
 * El archivo nunca pasa por aquí: Apex solo pide la sesión de subida resumible y
 * confirma cuando el navegador ha terminado de subirlo a Cloud Storage.
 *
 * Con Buzon_Test_Config__mdt.Default.Modo_simulado__c = true no hay callouts:
 * se devuelven respuestas simuladas para poder probar el flujo sin Google.
 */
public with sharing class GcpBuzonService {

    private static final Integer TIMEOUT_MS = 20000;

    public class GcpBuzonException extends Exception {
        /** true si merece la pena reintentar (timeout, 429, 5xx); false si es un error de datos (4xx) */
        public Boolean reintentable = false;
        public Integer statusCode;
    }

    public class Sesion {
        @AuraEnabled public String uploadUrl;
        @AuraEnabled public String gcsPath;
        @AuraEnabled public Boolean simulado;
    }

    public class Confirmacion {
        public String googleId;
        public Long size;
        public String crc32c;
    }

    /** Un archivo ya subido, tal como está registrado en Cloud SQL (para la pantalla OCR) */
    public class RegistroOcr {
        @AuraEnabled public String sfRecordId;
        @AuraEnabled public String sfAccountId;
        @AuraEnabled public String cif;
        @AuraEnabled public String gcsPath;
        @AuraEnabled public String gcsObjectId;
        @AuraEnabled public Long size;
        @AuraEnabled public String mime;
        @AuraEnabled public String crc32c;
        @AuraEnabled public Datetime createdAt;
        @AuraEnabled public Datetime updatedAt;
        @AuraEnabled public String nombreArchivo;
        @AuraEnabled public String viewUrl;
    }

    @TestVisible
    private static Buzon_Test_Config__mdt configOverride;

    public static Buzon_Test_Config__mdt config() {
        if (configOverride != null) return configOverride;
        Buzon_Test_Config__mdt c = Buzon_Test_Config__mdt.getInstance('Default');
        if (c == null) {
            // Sin registro de configuración nunca se llama a Google por error
            c = new Buzon_Test_Config__mdt(Modo_simulado__c = true, Tamano_maximo_MB__c = 2048);
        }
        return c;
    }

    public static Boolean esSimulado() {
        return config().Modo_simulado__c == true;
    }

    public static Long maxBytes() {
        Decimal mb = config().Tamano_maximo_MB__c;
        return (mb == null ? 2048 : mb.longValue()) * 1024 * 1024;
    }

    /**
     * Pide a Cloud Run una sesión de subida resumible para el archivo del registro.
     * origin: el origen del navegador (window.location.origin) que subirá el archivo. Google
     * solo habilita CORS en las respuestas de la subida si la sesión se creó con ese Origin;
     * sin esto, el navegador recibe la subida bien (200) pero bloqueada por CORS al leerla.
     */
    public static Sesion crearSesion(Buzon_test__c r, String cif, String origin) {
        String gcsPath = rutaGcs(UserInfo.getOrganizationId(), cif, r.Id, r.Archivo_nombre__c);
        Sesion s = new Sesion();
        s.gcsPath = gcsPath;
        if (esSimulado()) {
            s.simulado = true;
            s.uploadUrl = null;
            return s;
        }
        Map<String, Object> res = enviar('/upload-session', new Map<String, Object>{
            'gcsPath' => gcsPath,
            'size' => r.Archivo_tamano__c,
            'mime' => r.Archivo_tipo__c,
            'origin' => origin
        });
        s.simulado = false;
        s.uploadUrl = (String) res.get('uploadUrl');
        if (String.isBlank(s.uploadUrl)) {
            GcpBuzonException e = new GcpBuzonException('Google no ha devuelto la sesión de subida.');
            e.reintentable = true;
            throw e;
        }
        return s;
    }

    /**
     * Confirma la subida: Cloud Run comprueba el objeto en GCS (tamaño, crc32c, tipo real)
     * y hace UPSERT en Cloud SQL con sf_record_id como clave, así un reintento no duplica.
     */
    public static Confirmacion confirmar(Buzon_test__c r, String cif) {
        Confirmacion c = new Confirmacion();
        if (esSimulado()) {
            c.googleId = 'SIM-' + r.Id;
            c.size = r.Archivo_tamano__c == null ? 0 : r.Archivo_tamano__c.longValue();
            return c;
        }
        Map<String, Object> res = enviar('/confirm', new Map<String, Object>{
            'sfRecordId' => r.Id,
            'sfAccountId' => r.Empresa__c,
            'cif' => cif,
            'sfOrgId' => UserInfo.getOrganizationId(),
            'sfUserId' => r.CreatedById,
            'gcsPath' => r.GCS_ruta__c,
            'size' => r.Archivo_tamano__c,
            'mime' => r.Archivo_tipo__c
        });
        c.googleId = String.valueOf(res.get('id'));
        c.size = res.get('size') == null ? null : Long.valueOf(String.valueOf(res.get('size')));
        c.crc32c = (String) res.get('crc32c');
        return c;
    }

    /**
     * Lista los archivos ya subidos de una empresa (por CIF), más recientes primero, cada uno
     * con una URL firmada de solo lectura para previsualizarlo. El cif ya debe venir validado
     * (la empresa la valida BuzonEmpresasService antes de llamar aquí).
     */
    public static List<RegistroOcr> listarRegistros(String cif) {
        if (esSimulado()) return new List<RegistroOcr>();
        Map<String, Object> res = enviar('/records', new Map<String, Object>{
            'sfOrgId' => UserInfo.getOrganizationId(),
            'cif' => cif
        });
        List<RegistroOcr> out = new List<RegistroOcr>();
        for (Object o : (List<Object>) res.get('registros')) {
            Map<String, Object> m = (Map<String, Object>) o;
            RegistroOcr r = new RegistroOcr();
            r.sfRecordId = (String) m.get('sfRecordId');
            r.sfAccountId = (String) m.get('sfAccountId');
            r.cif = (String) m.get('cif');
            r.gcsPath = (String) m.get('gcsPath');
            r.gcsObjectId = (String) m.get('gcsObjectId');
            r.size = m.get('size') == null ? null : Long.valueOf(String.valueOf(m.get('size')));
            r.mime = (String) m.get('mime');
            r.crc32c = (String) m.get('crc32c');
            r.createdAt = parseFecha((String) m.get('createdAt'));
            r.updatedAt = parseFecha((String) m.get('updatedAt'));
            r.nombreArchivo = (String) m.get('nombreArchivo');
            r.viewUrl = (String) m.get('viewUrl');
            out.add(r);
        }
        return out;
    }

    private static Datetime parseFecha(String iso) {
        if (String.isBlank(iso)) return null;
        return (Datetime) JSON.deserialize('"' + iso + '"', Datetime.class);
    }

    /** Ruta {orgId}/{cif}/{recordId}/{nombre-saneado}: ordenada por empresa y reconocible sin consultar SQL */
    public static String rutaGcs(String orgId, String cif, Id recordId, String nombre) {
        String cifLimpio = String.isBlank(cif) ? 'SIN-CIF' : cif.toUpperCase().replaceAll('[^A-Z0-9]', '');
        String n = String.isBlank(nombre) ? 'archivo' : nombre;
        n = n.replaceAll('[^A-Za-z0-9._-]', '_');
        if (n.length() > 120) n = n.right(120);
        return orgId + '/' + cifLimpio + '/' + recordId + '/' + n;
    }

    // Token de identidad de Google en caché (por transacción): el servicio de Cloud Run
    // es privado, cada llamada necesita un ID token firmado con la service account de Salesforce
    @TestVisible
    private static String cachedIdToken;
    @TestVisible
    private static Long cachedIdTokenExp;

    /**
     * Firma un JWT con el certificado importado en Salesforce y lo canjea en el endpoint
     * OAuth de Google por un ID token cuya audiencia es el propio servicio de Cloud Run
     * (flujo "target_audience", no el JWT Bearer estándar de scope+access_token).
     */
    @TestVisible
    private static String obtenerIdToken() {
        Long ahora = System.currentTimeMillis() / 1000;
        if (cachedIdToken != null && cachedIdTokenExp != null && ahora < (cachedIdTokenExp - 60)) {
            return cachedIdToken;
        }
        Buzon_Test_Config__mdt c = config();
        Auth.JWT jwt = new Auth.JWT();
        jwt.setIss(c.SA_Client_Email__c);
        jwt.setSub(c.SA_Client_Email__c);
        jwt.setAud('https://oauth2.googleapis.com/token');
        Map<String, Object> claims = new Map<String, Object>();
        claims.put('target_audience', c.Cloud_Run_URL__c);
        jwt.setAdditionalClaims(claims);

        Auth.JWS jws;
        try {
            jws = new Auth.JWS(jwt, c.Certificate_Name__c);
        } catch (Exception e) {
            GcpBuzonException ex = new GcpBuzonException('No se ha podido firmar el JWT para Google: ' + e.getMessage());
            ex.reintentable = false;
            throw ex;
        }

        HttpRequest req = new HttpRequest();
        req.setEndpoint('https://oauth2.googleapis.com/token');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        req.setTimeout(TIMEOUT_MS);
        req.setBody('grant_type=' + EncodingUtil.urlEncode('urn:ietf:params:oauth:grant-type:jwt-bearer', 'UTF-8')
            + '&assertion=' + EncodingUtil.urlEncode(jws.getCompactSerialization(), 'UTF-8'));

        HttpResponse res;
        try {
            res = new Http().send(req);
        } catch (CalloutException ce) {
            GcpBuzonException e = new GcpBuzonException('No se ha podido obtener el token de Google: ' + ce.getMessage());
            e.reintentable = true;
            throw e;
        }
        if (res.getStatusCode() != 200) {
            GcpBuzonException e = new GcpBuzonException('Google OAuth ha respondido ' + res.getStatusCode() + ': ' + res.getBody().left(300));
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
            GcpBuzonException e = new GcpBuzonException('No se ha podido conectar con Google: ' + ce.getMessage());
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
        GcpBuzonException e = new GcpBuzonException('Google ha respondido ' + code + ': ' + cuerpo);
        e.statusCode = code;
        e.reintentable = code == 408 || code == 429 || code >= 500;
        throw e;
    }
}
