/**
 * Controlador del formulario de pruebas Subir facturas, opción A (testSubirFacturasA).
 *
 * Flujo (cada paso es una transacción aparte: Apex no permite un callout después de un DML):
 *  1. crearRegistro          → Buzon_test__c en estado Pendiente
 *  2. solicitarSesionSubida  → callout a Google, estado Subiendo; el navegador sube el archivo a GCS
 *  3. confirmarSubida        → callout a Google, estado Sincronizado (o Subido + reintento en cola)
 *  marcarError               → el navegador informa de un fallo en la subida
 *  reintentarSincronizacion  → vuelve a encolar la confirmación de un registro ya subido
 *
 *  Los fallos de Google se guardan en el registro (estado Error) y se devuelven con ok = false;
 *  las validaciones del formulario sí lanzan AuraHandledException (no hay nada que guardar).
 */
public with sharing class SubirFacturasController {

    public static final String ESTADO_PENDIENTE = 'Pendiente';
    public static final String ESTADO_SUBIENDO = 'Subiendo';
    public static final String ESTADO_SUBIDO = 'Subido';
    public static final String ESTADO_SINCRONIZADO = 'Sincronizado';
    public static final String ESTADO_ERROR = 'Error';

    /** Extensiones permitidas y los MIME que aceptamos para cada una ('' = el navegador no lo sabe) */
    public static final Map<String, Set<String>> MIME_POR_EXTENSION = new Map<String, Set<String>>{
        'pdf' => new Set<String>{ 'application/pdf', '' },
        'zip' => new Set<String>{ 'application/zip', 'application/x-zip-compressed', 'multipart/x-zip', '' },
        'png' => new Set<String>{ 'image/png', '' },
        'jpg' => new Set<String>{ 'image/jpeg', '' },
        'jpeg' => new Set<String>{ 'image/jpeg', '' }
    };

    public class ContextoDTO {
        @AuraEnabled public Boolean modoLibre;
        @AuraEnabled public Boolean esPortal;
        @AuraEnabled public Boolean simulado;
        @AuraEnabled public Long maxBytes;
        @AuraEnabled public List<BuzonEmpresasService.EmpresaDTO> empresas;
    }

    /** ok = false: fallo de Google ya guardado en el registro (no se lanza excepción para no deshacer el DML) */
    public class ResultadoDTO {
        @AuraEnabled public Boolean ok = true;
        @AuraEnabled public GcpBuzonService.Sesion sesion;
        @AuraEnabled public Id recordId;
        @AuraEnabled public String numero;
        @AuraEnabled public String estado;
        @AuraEnabled public String mensaje;
    }

    @AuraEnabled(cacheable=true)
    public static ContextoDTO getContexto() {
        ContextoDTO c = new ContextoDTO();
        c.modoLibre = BuzonEmpresasService.esModoLibre();
        c.esPortal = BuzonEmpresasService.esUsuarioPortal();
        c.simulado = GcpBuzonService.esSimulado();
        c.maxBytes = GcpBuzonService.maxBytes();
        c.empresas = BuzonEmpresasService.getEmpresasPermitidas();
        return c;
    }

    @AuraEnabled
    public static ResultadoDTO crearRegistro(Id empresaId, String tipo, String observaciones,
                                             String nombreArchivo, Long tamano, String mime) {
        try {
            BuzonEmpresasService.validarEmpresa(empresaId);
            validarTipo(tipo);
            validarArchivo(nombreArchivo, tamano, mime);
            Buzon_test__c r = new Buzon_test__c(
                Empresa__c = empresaId,
                Tipo_documentacion__c = tipo,
                Observaciones__c = observaciones,
                Archivo_nombre__c = nombreArchivo.left(255),
                Archivo_tamano__c = tamano,
                Archivo_tipo__c = String.isBlank(mime) ? null : mime.left(100),
                Estado_sincronizacion__c = ESTADO_PENDIENTE,
                Opcion__c = 'A',
                Intentos__c = 0
            );
            Database.insert(r, AccessLevel.USER_MODE);
            return resultado(cargar(r.Id), null);
        } catch (BuzonEmpresasService.BuzonException e) {
            throw error(e.getMessage());
        } catch (DmlException e) {
            throw error('No se ha podido guardar el registro: ' + e.getDmlMessage(0));
        }
    }

    /** Pide la sesión de subida a Google. El callout va antes del DML en la misma transacción. */
    @AuraEnabled
    public static ResultadoDTO solicitarSesionSubida(Id recordId) {
        Buzon_test__c r = cargar(recordId);
        // Subiendo también se admite: una subida interrumpida (pestaña cerrada) se vuelve a empezar
        if (!new Set<String>{ ESTADO_PENDIENTE, ESTADO_SUBIENDO, ESTADO_ERROR }.contains(r.Estado_sincronizacion__c)) {
            throw error('El registro ' + r.Name + ' ya está en estado ' + r.Estado_sincronizacion__c + '.');
        }
        GcpBuzonService.Sesion s;
        try {
            s = GcpBuzonService.crearSesion(r, r.Empresa__r.CIF__c);
        } catch (GcpBuzonService.GcpBuzonException e) {
            guardarError(r, e.getMessage(), false);
            return fallo(r, 'No se ha podido preparar la subida en Google. ' + e.getMessage());
        }
        r.GCS_ruta__c = s.gcsPath;
        r.Estado_sincronizacion__c = ESTADO_SUBIENDO;
        r.Ultimo_error__c = null;
        Database.update(r, AccessLevel.USER_MODE);
        ResultadoDTO res = resultado(r, null);
        res.sesion = s;
        return res;
    }

    /**
     * El navegador ha terminado de subir el archivo: se confirma en Google (Cloud SQL).
     * Si Google falla con un error temporal, el archivo ya está en GCS: queda Subido y se reintenta en cola.
     */
    @AuraEnabled
    public static ResultadoDTO confirmarSubida(Id recordId) {
        Buzon_test__c r = cargar(recordId);
        if (r.Estado_sincronizacion__c != ESTADO_SUBIENDO && r.Estado_sincronizacion__c != ESTADO_SUBIDO) {
            throw error('El registro ' + r.Name + ' no está pendiente de confirmar (estado ' + r.Estado_sincronizacion__c + ').');
        }
        try {
            aplicarConfirmacion(r, GcpBuzonService.confirmar(r, r.Empresa__r.CIF__c));
            Database.update(r, AccessLevel.USER_MODE);
            return resultado(r, 'Factura subida y sincronizada con Google.');
        } catch (GcpBuzonService.GcpBuzonException e) {
            if (e.reintentable) {
                r.Estado_sincronizacion__c = ESTADO_SUBIDO;
                r.Ultimo_error__c = e.getMessage();
                Database.update(r, AccessLevel.USER_MODE);
                GcpSyncQueueable.encolar(r.Id, 1);
                return resultado(r, 'El archivo se ha subido, pero Google no ha confirmado todavía. Se reintentará automáticamente.');
            }
            guardarError(r, e.getMessage(), true);
            return fallo(r, 'Google ha rechazado el archivo: ' + e.getMessage());
        }
    }

    /** El navegador informa de que la subida a Cloud Storage ha fallado */
    @AuraEnabled
    public static ResultadoDTO marcarError(Id recordId, String mensaje) {
        Buzon_test__c r = cargar(recordId);
        guardarError(r, String.isBlank(mensaje) ? 'Error desconocido en la subida.' : mensaje, false);
        return resultado(r, null);
    }

    /** Reintento manual de la confirmación de un registro cuyo archivo ya está en GCS */
    @AuraEnabled
    public static ResultadoDTO reintentarSincronizacion(Id recordId) {
        Buzon_test__c r = cargar(recordId);
        if (String.isBlank(r.GCS_ruta__c) || r.Estado_sincronizacion__c == ESTADO_SINCRONIZADO) {
            throw error('Este registro no tiene una sincronización pendiente.');
        }
        GcpSyncQueueable.encolar(r.Id, 1);
        return resultado(r, 'Reintento en cola.');
    }

    // ===== Uso interno (también desde GcpSyncQueueable) =====

    public static Buzon_test__c cargar(Id recordId) {
        List<Buzon_test__c> rs = [
            SELECT Id, Name, Empresa__c, Empresa__r.CIF__c, Tipo_documentacion__c, Archivo_nombre__c,
                   Archivo_tamano__c, Archivo_tipo__c, GCS_ruta__c, Google_Id__c, Estado_sincronizacion__c,
                   Intentos__c, Ultimo_error__c, CreatedById
            FROM Buzon_test__c
            WHERE Id = :recordId
            WITH USER_MODE
            LIMIT 1
        ];
        if (rs.isEmpty()) throw error('No se encuentra el registro o no tienes acceso.');
        return rs[0];
    }

    public static void aplicarConfirmacion(Buzon_test__c r, GcpBuzonService.Confirmacion c) {
        r.Google_Id__c = c.googleId;
        r.Estado_sincronizacion__c = ESTADO_SINCRONIZADO;
        r.Ultimo_error__c = null;
    }

    public static void guardarError(Buzon_test__c r, String mensaje, Boolean contarIntento) {
        r.Estado_sincronizacion__c = ESTADO_ERROR;
        r.Ultimo_error__c = mensaje == null ? null : mensaje.left(32768);
        if (contarIntento) r.Intentos__c = (r.Intentos__c == null ? 0 : r.Intentos__c) + 1;
        Database.update(r, AccessLevel.USER_MODE);
    }

    @TestVisible
    private static void validarTipo(String tipo) {
        for (Schema.PicklistEntry pe : Buzon_test__c.Tipo_documentacion__c.getDescribe().getPicklistValues()) {
            if (pe.isActive() && pe.getValue() == tipo) return;
        }
        throw new BuzonEmpresasService.BuzonException('El tipo de documentación no es válido.');
    }

    /** Misma validación que en el navegador: allí es para avisar, aquí es la que cuenta */
    @TestVisible
    private static void validarArchivo(String nombre, Long tamano, String mime) {
        if (String.isBlank(nombre) || !nombre.contains('.')) {
            throw new BuzonEmpresasService.BuzonException('Falta el archivo o no tiene extensión.');
        }
        String ext = nombre.substringAfterLast('.').toLowerCase();
        if (!MIME_POR_EXTENSION.containsKey(ext)) {
            throw new BuzonEmpresasService.BuzonException('Formato no permitido (.' + ext + '). Solo PDF, ZIP, PNG, JPG o JPEG.');
        }
        String m = mime == null ? '' : mime.toLowerCase();
        if (!MIME_POR_EXTENSION.get(ext).contains(m)) {
            throw new BuzonEmpresasService.BuzonException('El tipo del archivo (' + mime + ') no coincide con su extensión.');
        }
        if (tamano == null || tamano <= 0) {
            throw new BuzonEmpresasService.BuzonException('El archivo está vacío.');
        }
        if (tamano > GcpBuzonService.maxBytes()) {
            throw new BuzonEmpresasService.BuzonException('El archivo supera el tamaño máximo permitido.');
        }
    }

    private static ResultadoDTO resultado(Buzon_test__c r, String mensaje) {
        ResultadoDTO res = new ResultadoDTO();
        res.recordId = r.Id;
        res.numero = r.Name;
        res.estado = r.Estado_sincronizacion__c;
        res.mensaje = mensaje;
        return res;
    }

    private static ResultadoDTO fallo(Buzon_test__c r, String mensaje) {
        ResultadoDTO res = resultado(r, mensaje);
        res.ok = false;
        return res;
    }

    private static AuraHandledException error(String mensaje) {
        AuraHandledException e = new AuraHandledException(mensaje);
        e.setMessage(mensaje);
        return e;
    }
}
