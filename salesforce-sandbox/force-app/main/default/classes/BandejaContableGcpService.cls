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
        /** Ruta del objeto en el bucket de originales; la decide Google (sin CIF ni nombre del cliente) */
        public String gcsPath;
        public String archivoGoogleId;
        public String bandejaGoogleId;
    }

    public class Confirmacion {
        public String bandejaGoogleId;
        public String archivoGoogleId;
        public Long size;
        public String crc32c;
        /** Estado del archivo en Google tras confirmar (RECIBIDO, EN_COLA…) */
        public String estadoGoogle;
    }

    /** Un archivo tal como está registrado en Cloud SQL, con URL firmadas para verlo y descargarlo */
    public class ArchivoGoogle {
        @AuraEnabled public String googleId;
        @AuraEnabled public String archivoId;
        @AuraEnabled public String bandejaId;
        @AuraEnabled public String nombre;
        @AuraEnabled public String gcsPath;
        @AuraEnabled public Long size;
        @AuraEnabled public String mime;
        @AuraEnabled public String estado;
        @AuraEnabled public Datetime createdAt;
        /** Se abre en el navegador (visor) */
        @AuraEnabled public String viewUrl;
        /** Se descarga con el nombre original del cliente */
        @AuraEnabled public String descargaUrl;
        /** Qué ha hecho el procesador con el archivo (y con lo extraído si es un ZIP) */
        @AuraEnabled public ProcesamientoGoogle procesamiento;
    }

    public class ProcesamientoGoogle {
        @AuraEnabled public Integer paginas;
        @AuraEnabled public Boolean tieneTexto;
        /** Archivos extraídos (ZIP, también anidados) */
        @AuraEnabled public Integer extraidos;
        @AuraEnabled public Integer documentos;
        @AuraEnabled public Integer listos;
        @AuraEnabled public Integer enRevision;
        @AuraEnabled public Integer conError;
        @AuraEnabled public List<IncidenciaGoogle> incidencias = new List<IncidenciaGoogle>();
    }

    public class IncidenciaGoogle {
        @AuraEnabled public String codigo;
        /** INFO, AVISO o ERROR */
        @AuraEnabled public String gravedad;
        @AuraEnabled public Integer veces;
    }

    /** Un documento separado por Google (una factura, un albarán…) con la lectura preliminar del clasificador */
    public class DocumentoGoogle {
        @AuraEnabled public String id;
        @AuraEnabled public Integer numero;
        @AuraEnabled public String nombre;
        /** Archivo del que sale (ruta dentro del ZIP si viene de uno) */
        @AuraEnabled public String archivoOrigen;
        /** Archivo que subió el asesor o el cliente */
        @AuraEnabled public String archivoSubido;
        @AuraEnabled public String sfArchivoId;
        @AuraEnabled public Integer paginaInicio;
        @AuraEnabled public Integer paginaFin;
        /** FACTURA, FACTURA_SIMPLIFICADA, RECTIFICATIVA, ALBARAN, PRESUPUESTO, HOJA_CALCULO, OTRO, DESCONOCIDO */
        @AuraEnabled public String tipo;
        @AuraEnabled public Decimal confianza;
        /** LISTO, REQUIERE_REVISION, DESCARTADO, ERROR */
        @AuraEnabled public String estado;
        @AuraEnabled public List<String> motivos = new List<String>();
        @AuraEnabled public String emisor;
        @AuraEnabled public String nifEmisor;
        @AuraEnabled public String numeroFactura;
        @AuraEnabled public String fecha;
        @AuraEnabled public String total;
        @AuraEnabled public List<String> dudas = new List<String>();
        /** true si Google ha generado un PDF propio (el archivo tenía varios documentos) */
        @AuraEnabled public Boolean separado;
        @AuraEnabled public String motor;
        /** Datos extraídos por la IA (JSON tal cual lo guarda Google en extracciones). Solo al abrir el documento. */
        @AuraEnabled public String extraccion;
        @AuraEnabled public Datetime createdAt;
        /** URL firmada para verlo. Solo al abrir el documento (firmarla es una llamada a Google por documento). */
        @AuraEnabled public String viewUrl;
    }

    /** Estado técnico del procesamiento de una bandeja, para calcular el estado que ve el usuario */
    public class EstadoGoogle {
        @AuraEnabled public String bandejaId;
        /** Archivos subidos por estado de Google (RECIBIDO, EN_COLA, PROCESANDO, PROCESADO…) */
        @AuraEnabled public Map<String, Integer> archivos = new Map<String, Integer>();
        @AuraEnabled public Integer documentos = 0;
        @AuraEnabled public Integer enRevision = 0;
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
     * Registra la bandeja y el archivo en Google y pide una sesión de subida resumible. Google decide
     * la ruta del objeto y devuelve sus id. El archivo debe venir con los campos de su bandeja (Bandeja__r).
     * origin: el origen del navegador (window.location.origin) que subirá el archivo. Google solo
     * habilita CORS en las respuestas de la subida si la sesión se creó con ese Origin.
     */
    public static Sesion crearSesion(Bandeja_Contable_Archivo__c a, String origin) {
        Bandeja_Contable__c b = a.Bandeja__r;
        Map<String, Object> res = enviar('/upload-session', new Map<String, Object>{
            'sfOrgId' => UserInfo.getOrganizationId(),
            'bandeja' => new Map<String, Object>{
                'sfId' => b.Id,
                'numero' => b.Name,
                'sfAccountId' => b.Empresa__c,
                'cif' => b.Empresa__r.CIF__c,
                'empresa' => b.Empresa__r.Name,
                'tipo' => b.Tipo_documentacion__c,
                'observaciones' => b.Observaciones__c,
                'origen' => b.Origen__c,
                'sfUserId' => b.CreatedById
            },
            'archivo' => new Map<String, Object>{
                'sfId' => a.Id,
                'nombre' => a.Nombre__c,
                'size' => a.Tamano__c,
                'mime' => a.Tipo_mime__c,
                'sfUserId' => a.CreatedById
            },
            'origin' => origin
        });
        Sesion s = new Sesion();
        s.uploadUrl = (String) res.get('uploadUrl');
        s.gcsPath = (String) res.get('gcsPath');
        s.archivoGoogleId = (String) res.get('archivoId');
        s.bandejaGoogleId = (String) res.get('bandejaId');
        if (String.isBlank(s.uploadUrl)) {
            GcpException e = new GcpException('Google no ha devuelto la sesión de subida.');
            e.reintentable = true;
            throw e;
        }
        return s;
    }

    /**
     * Confirma la subida: Google comprueba el objeto en Cloud Storage, marca el archivo como recibido
     * y encola su procesamiento. Idempotente: confirmar dos veces no duplica nada.
     */
    public static Confirmacion confirmar(Bandeja_Contable_Archivo__c a) {
        Map<String, Object> res = enviar('/confirm', new Map<String, Object>{
            'sfOrgId' => UserInfo.getOrganizationId(),
            'sfArchivoId' => a.Id
        });
        Confirmacion c = new Confirmacion();
        c.bandejaGoogleId = (String) res.get('bandejaId');
        c.archivoGoogleId = (String) res.get('archivoId');
        c.size = res.get('size') == null ? null : Long.valueOf(String.valueOf(res.get('size')));
        c.crc32c = (String) res.get('crc32c');
        c.estadoGoogle = (String) res.get('estado');
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
            g.estado = (String) m.get('estado');
            g.createdAt = parseFecha((String) m.get('createdAt'));
            g.viewUrl = (String) m.get('viewUrl');
            g.descargaUrl = (String) m.get('descargaUrl');
            g.procesamiento = toProcesamiento((Map<String, Object>) m.get('procesamiento'));
            out.add(g);
        }
        return out;
    }

    private static ProcesamientoGoogle toProcesamiento(Map<String, Object> m) {
        if (m == null || m.isEmpty()) return null;
        ProcesamientoGoogle p = new ProcesamientoGoogle();
        p.paginas = entero(m.get('paginas'));
        p.tieneTexto = (Boolean) m.get('tieneTexto');
        p.extraidos = entero(m.get('extraidos'));
        p.documentos = entero(m.get('documentos'));
        p.listos = entero(m.get('listos'));
        p.enRevision = entero(m.get('enRevision'));
        p.conError = entero(m.get('conError'));
        if (m.get('incidencias') != null) {
            for (Object o : (List<Object>) m.get('incidencias')) {
                Map<String, Object> i = (Map<String, Object>) o;
                IncidenciaGoogle x = new IncidenciaGoogle();
                x.codigo = (String) i.get('codigo');
                x.gravedad = (String) i.get('gravedad');
                x.veces = entero(i.get('veces'));
                p.incidencias.add(x);
            }
        }
        return p;
    }

    /**
     * Documentos separados por Google en una bandeja, solo con sus datos (sin URL ni extracción: se piden
     * con obtenerDocumento al abrir uno). La bandeja ya debe estar validada por el llamante.
     */
    public static List<DocumentoGoogle> listarDocumentos(Id bandejaId) {
        Map<String, Object> res = enviar('/documents', new Map<String, Object>{
            'sfOrgId' => UserInfo.getOrganizationId(),
            'sfBandejaId' => bandejaId
        });
        List<DocumentoGoogle> out = new List<DocumentoGoogle>();
        for (Object o : (List<Object>) res.get('documentos')) {
            out.add(toDocumento((Map<String, Object>) o));
        }
        return out;
    }

    /** Un documento de la bandeja para abrirlo: con URL firmada y datos extraídos por la IA */
    public static DocumentoGoogle obtenerDocumento(Id bandejaId, String documentoId) {
        return toDocumento(enviar('/document', new Map<String, Object>{
            'sfOrgId' => UserInfo.getOrganizationId(),
            'sfBandejaId' => bandejaId,
            'documentoId' => documentoId
        }));
    }

    /** Estado del procesamiento de varias bandejas en una sola llamada (las bandejas ya deben estar validadas) */
    public static Map<String, EstadoGoogle> estadoBandejas(List<Id> bandejaIds) {
        Map<String, EstadoGoogle> out = new Map<String, EstadoGoogle>();
        if (bandejaIds == null || bandejaIds.isEmpty()) return out;
        Map<String, Object> res = enviar('/status', new Map<String, Object>{
            'sfOrgId' => UserInfo.getOrganizationId(),
            'sfBandejaIds' => bandejaIds
        });
        Map<String, Object> bandejas = (Map<String, Object>) res.get('bandejas');
        for (String id : bandejas.keySet()) {
            Map<String, Object> m = (Map<String, Object>) bandejas.get(id);
            EstadoGoogle e = new EstadoGoogle();
            e.bandejaId = id;
            Map<String, Object> archivos = (Map<String, Object>) m.get('archivos');
            if (archivos != null) for (String estado : archivos.keySet()) e.archivos.put(estado, entero(archivos.get(estado)));
            e.documentos = entero(m.get('documentos'));
            e.enRevision = entero(m.get('enRevision'));
            out.put(id, e);
        }
        return out;
    }

    private static DocumentoGoogle toDocumento(Map<String, Object> m) {
        DocumentoGoogle d = new DocumentoGoogle();
        d.id = (String) m.get('id');
        d.numero = entero(m.get('numero'));
        d.nombre = (String) m.get('nombre');
        d.archivoOrigen = (String) m.get('archivoOrigen');
        d.archivoSubido = (String) m.get('archivoSubido');
        d.sfArchivoId = (String) m.get('sfArchivoId');
        d.paginaInicio = entero(m.get('paginaInicio'));
        d.paginaFin = entero(m.get('paginaFin'));
        d.tipo = (String) m.get('tipo');
        d.confianza = m.get('confianza') == null ? null : Decimal.valueOf(String.valueOf(m.get('confianza')));
        d.estado = (String) m.get('estado');
        d.motivos = textos(m.get('motivos'));
        Map<String, Object> l = m.get('lectura') == null ? new Map<String, Object>() : (Map<String, Object>) m.get('lectura');
        d.emisor = (String) l.get('emisor');
        d.nifEmisor = (String) l.get('nif_emisor');
        d.numeroFactura = (String) l.get('numero');
        d.fecha = (String) l.get('fecha');
        d.total = (String) l.get('total');
        d.dudas = textos(l.get('dudas'));
        d.separado = m.get('separado') == true;
        d.motor = (String) m.get('motor');
        d.createdAt = parseFecha((String) m.get('createdAt'));
        d.viewUrl = (String) m.get('viewUrl');
        d.extraccion = m.get('extraccion') == null ? null : JSON.serialize(m.get('extraccion'));
        return d;
    }

    /** Vuelve a procesar en Google los archivos de una bandeja (o uno). Devuelve cuántos se han encolado. */
    public static Integer reprocesar(Id bandejaId, Id archivoId) {
        Map<String, Object> res = enviar('/reprocess', new Map<String, Object>{
            'sfOrgId' => UserInfo.getOrganizationId(),
            'sfBandejaId' => bandejaId,
            'sfArchivoId' => archivoId
        });
        return entero(res.get('encolados'));
    }

    private static Integer entero(Object v) {
        return v == null ? null : Integer.valueOf(String.valueOf(v));
    }

    private static List<String> textos(Object v) {
        List<String> out = new List<String>();
        if (v != null) for (Object o : (List<Object>) v) out.add(String.valueOf(o));
        return out;
    }

    private static Datetime parseFecha(String iso) {
        if (String.isBlank(iso)) return null;
        return (Datetime) JSON.deserialize('"' + iso + '"', Datetime.class);
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
