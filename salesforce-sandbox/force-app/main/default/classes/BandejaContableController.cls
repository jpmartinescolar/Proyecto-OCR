/**
 * Controlador de la Bandeja Contable (LWC bandejaContableApp y bandejaContableNuevo).
 *
 * Flujo de un envío (cada paso es una transacción aparte: Apex no permite un callout después de un DML):
 *  1. crearBandeja           → Bandeja_Contable__c + un Bandeja_Contable_Archivo__c por archivo (Pendiente)
 *  Por cada archivo:
 *  2. solicitarSesionSubida  → callout a Google, archivo Subiendo; el navegador sube el archivo a Cloud Storage
 *  3. confirmarSubida        → callout a Google, archivo Sincronizado con su Google_Id__c
 *                              (si Google falla con un error temporal: Subido + reintento en cola)
 *  marcarError               → el navegador informa de un fallo en la subida
 *
 * Los fallos de Google se guardan en el archivo (estado Error) y se devuelven con ok = false;
 * las validaciones del formulario sí lanzan AuraHandledException (no hay nada que guardar).
 */
public with sharing class BandejaContableController {

    public static final String ESTADO_PENDIENTE = 'Pendiente';
    public static final String ESTADO_SUBIENDO = 'Subiendo';
    public static final String ESTADO_SUBIDO = 'Subido';
    public static final String ESTADO_SINCRONIZADO = 'Sincronizado';
    public static final String ESTADO_ERROR = 'Error';

    private static final Integer MAX_ARCHIVOS = 200;
    private static final Integer MAX_BANDEJAS_LISTADO = 50;

    /** Extensiones permitidas y los MIME que aceptamos para cada una ('' = el navegador no lo sabe) */
    public static final Map<String, Set<String>> MIME_POR_EXTENSION = new Map<String, Set<String>>{
        'pdf' => new Set<String>{ 'application/pdf', '' },
        'zip' => new Set<String>{ 'application/zip', 'application/x-zip-compressed', 'multipart/x-zip', '' },
        'png' => new Set<String>{ 'image/png', '' },
        'jpg' => new Set<String>{ 'image/jpeg', '' },
        'jpeg' => new Set<String>{ 'image/jpeg', '' },
        'xlsx' => new Set<String>{ 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', '' },
        'xls' => new Set<String>{ 'application/vnd.ms-excel', '' }
    };

    public class ContextoDTO {
        @AuraEnabled public Boolean modoLibre;
        @AuraEnabled public Boolean esPortal;
        @AuraEnabled public Long maxBytes;
        @AuraEnabled public List<BandejaContableEmpresasService.EmpresaDTO> empresas;
    }

    /** Archivo que el navegador quiere subir; clave = identificador local para casar la respuesta */
    public class ArchivoEntradaDTO {
        @AuraEnabled public String clave { get; set; }
        @AuraEnabled public String nombre { get; set; }
        @AuraEnabled public Long tamano { get; set; }
        @AuraEnabled public String mime { get; set; }
    }

    public class ArchivoCreadoDTO {
        @AuraEnabled public String clave;
        @AuraEnabled public Id archivoId;
    }

    public class BandejaCreadaDTO {
        @AuraEnabled public Id bandejaId;
        @AuraEnabled public String numero;
        @AuraEnabled public List<ArchivoCreadoDTO> archivos = new List<ArchivoCreadoDTO>();
    }

    /** ok = false: fallo de Google ya guardado en el archivo (no se lanza excepción para no deshacer el DML) */
    public class ResultadoDTO {
        @AuraEnabled public Boolean ok = true;
        @AuraEnabled public Id archivoId;
        @AuraEnabled public String estado;
        @AuraEnabled public String uploadUrl;
        @AuraEnabled public String mensaje;
    }

    public class BandejaResumenDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String numero;
        @AuraEnabled public Datetime fecha;
        @AuraEnabled public Id empresaId;
        @AuraEnabled public String empresa;
        @AuraEnabled public String cif;
        @AuraEnabled public String tipoValor;
        @AuraEnabled public String tipo;
        @AuraEnabled public Integer archivos;
        @AuraEnabled public String origen;
        @AuraEnabled public String estado;
        @AuraEnabled public String estadoSubida;
        @AuraEnabled public String creadoPor;
    }

    public class ArchivoDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String numero;
        @AuraEnabled public String nombre;
        @AuraEnabled public Long tamano;
        @AuraEnabled public String mime;
        @AuraEnabled public String estado;
        @AuraEnabled public String googleId;
        @AuraEnabled public String error;
        @AuraEnabled public Datetime fecha;
    }

    public class BandejaDetalleDTO {
        @AuraEnabled public BandejaResumenDTO resumen;
        @AuraEnabled public String observaciones;
        @AuraEnabled public String asesor;
        @AuraEnabled public Datetime ultimaModificacion;
        @AuraEnabled public String googleId;
        @AuraEnabled public Integer archivosSincronizados;
        @AuraEnabled public Integer archivosError;
        @AuraEnabled public Integer documentos;
        @AuraEnabled public List<ArchivoDTO> archivos = new List<ArchivoDTO>();
    }

    @AuraEnabled(cacheable=true)
    public static ContextoDTO getContexto() {
        try {
            ContextoDTO c = new ContextoDTO();
            c.modoLibre = BandejaContableEmpresasService.esModoLibre();
            c.esPortal = BandejaContableEmpresasService.esUsuarioPortal();
            c.maxBytes = BandejaContableGcpService.maxBytes();
            c.empresas = BandejaContableEmpresasService.getEmpresasPermitidas();
            return c;
        } catch (BandejaContableGcpService.GcpException e) {
            throw error(e.getMessage());
        }
    }

    /** Últimas bandejas visibles para el usuario, más recientes primero; empresaId opcional para filtrar */
    @AuraEnabled
    public static List<BandejaResumenDTO> listarBandejas(Id empresaId) {
        List<BandejaResumenDTO> out = new List<BandejaResumenDTO>();
        String soql = 'SELECT Id, Name, CreatedDate, Empresa__c, Empresa__r.Name, Empresa__r.CIF__c, Tipo_documentacion__c, '
            + 'Archivos_total__c, Origen__c, Estado__c, Estado_subida__c, CreatedBy.Name FROM Bandeja_Contable__c '
            + (empresaId == null ? '' : 'WHERE Empresa__c = :empresaId ')
            + 'ORDER BY CreatedDate DESC LIMIT :limite';
        Map<String, Object> binds = new Map<String, Object>{ 'empresaId' => empresaId, 'limite' => MAX_BANDEJAS_LISTADO };
        for (Bandeja_Contable__c b : (List<Bandeja_Contable__c>) Database.queryWithBinds(soql, binds, AccessLevel.USER_MODE)) {
            out.add(toResumen(b));
        }
        return out;
    }

    private static final String CAMPOS_DETALLE = 'SELECT Id, Name, CreatedDate, LastModifiedDate, Empresa__c, Empresa__r.Name, '
        + 'Empresa__r.CIF__c, Empresa__r.Asesor_responsable_fiscal_actual__r.Name, Tipo_documentacion__c, Archivos_total__c, '
        + 'Archivos_sincronizados__c, Archivos_error__c, Documentos_total__c, Origen__c, Estado__c, Estado_subida__c, '
        + 'Observaciones__c, Google_Id__c, CreatedBy.Name, '
        + '(SELECT Id, Name, Nombre__c, Tamano__c, Tipo_mime__c, Estado__c, Google_Id__c, Ultimo_error__c, CreatedDate '
        + 'FROM Archivos__r ORDER BY CreatedDate, Name) FROM Bandeja_Contable__c ';

    /** Ficha completa de una bandeja con sus archivos (pantalla de registro y de documento) */
    @AuraEnabled
    public static BandejaDetalleDTO getBandeja(Id bandejaId) {
        List<Bandeja_Contable__c> bs = (List<Bandeja_Contable__c>) Database.queryWithBinds(
            CAMPOS_DETALLE + 'WHERE Id = :bandejaId LIMIT 1',
            new Map<String, Object>{ 'bandejaId' => bandejaId }, AccessLevel.USER_MODE);
        if (bs.isEmpty()) throw error('No se encuentra la bandeja o no tienes acceso.');
        return toDetalle(bs[0]);
    }

    /** Bandejas visibles con sus archivos (listado OCR); empresaId opcional para filtrar */
    @AuraEnabled
    public static List<BandejaDetalleDTO> listarBandejasConArchivos(Id empresaId) {
        List<BandejaDetalleDTO> out = new List<BandejaDetalleDTO>();
        String soql = CAMPOS_DETALLE + (empresaId == null ? '' : 'WHERE Empresa__c = :empresaId ')
            + 'ORDER BY CreatedDate DESC LIMIT :limite';
        Map<String, Object> binds = new Map<String, Object>{ 'empresaId' => empresaId, 'limite' => MAX_BANDEJAS_LISTADO };
        for (Bandeja_Contable__c b : (List<Bandeja_Contable__c>) Database.queryWithBinds(soql, binds, AccessLevel.USER_MODE)) {
            out.add(toDetalle(b));
        }
        return out;
    }

    private static BandejaDetalleDTO toDetalle(Bandeja_Contable__c b) {
        BandejaDetalleDTO d = new BandejaDetalleDTO();
        d.resumen = toResumen(b);
        d.observaciones = b.Observaciones__c;
        d.asesor = b.Empresa__r.Asesor_responsable_fiscal_actual__r == null ? null : b.Empresa__r.Asesor_responsable_fiscal_actual__r.Name;
        d.ultimaModificacion = b.LastModifiedDate;
        d.googleId = b.Google_Id__c;
        d.archivosSincronizados = b.Archivos_sincronizados__c == null ? 0 : b.Archivos_sincronizados__c.intValue();
        d.archivosError = b.Archivos_error__c == null ? 0 : b.Archivos_error__c.intValue();
        d.documentos = b.Documentos_total__c == null ? null : b.Documentos_total__c.intValue();
        for (Bandeja_Contable_Archivo__c a : b.Archivos__r) {
            ArchivoDTO x = new ArchivoDTO();
            x.id = a.Id;
            x.numero = a.Name;
            x.nombre = a.Nombre__c;
            x.tamano = a.Tamano__c == null ? null : a.Tamano__c.longValue();
            x.mime = a.Tipo_mime__c;
            x.estado = a.Estado__c;
            x.googleId = a.Google_Id__c;
            x.error = a.Ultimo_error__c;
            x.fecha = a.CreatedDate;
            d.archivos.add(x);
        }
        return d;
    }

    /** Datos fiscales del cliente (perfil, modelos, IAE, locales, vinculados) para las pantallas de documento y empresa */
    @AuraEnabled
    public static BandejaContableClienteService.DatosClienteDTO getDatosCliente(Id empresaId) {
        try {
            return BandejaContableClienteService.getDatosCliente(empresaId);
        } catch (BandejaContableEmpresasService.BandejaContableException e) {
            throw error(e.getMessage());
        }
    }


    private static BandejaResumenDTO toResumen(Bandeja_Contable__c b) {
        BandejaResumenDTO r = new BandejaResumenDTO();
        r.id = b.Id;
        r.numero = b.Name;
        r.fecha = b.CreatedDate;
        r.empresaId = b.Empresa__c;
        r.empresa = b.Empresa__r.Name;
        r.cif = b.Empresa__r.CIF__c;
        r.tipoValor = b.Tipo_documentacion__c;
        r.tipo = etiqueta(Bandeja_Contable__c.Tipo_documentacion__c, b.Tipo_documentacion__c);
        r.archivos = b.Archivos_total__c == null ? 0 : b.Archivos_total__c.intValue();
        r.origen = etiqueta(Bandeja_Contable__c.Origen__c, b.Origen__c);
        r.estado = b.Estado__c;
        r.estadoSubida = b.Estado_subida__c;
        r.creadoPor = b.CreatedBy.Name;
        return r;
    }

    private static String etiqueta(Schema.SObjectField campo, String valor) {
        if (valor == null) return null;
        for (Schema.PicklistEntry pe : campo.getDescribe().getPicklistValues()) {
            if (pe.getValue() == valor) return pe.getLabel();
        }
        return valor;
    }

    /** Crea la bandeja y un registro por archivo, todo en estado Pendiente */
    @AuraEnabled
    public static BandejaCreadaDTO crearBandeja(Id empresaId, String tipo, String observaciones,
                                               List<ArchivoEntradaDTO> archivos) {
        Savepoint sp = Database.setSavepoint();
        try {
            BandejaContableEmpresasService.validarEmpresa(empresaId);
            validarTipo(tipo);
            if (archivos == null || archivos.isEmpty()) {
                throw new BandejaContableEmpresasService.BandejaContableException('Adjunta al menos un archivo.');
            }
            if (archivos.size() > MAX_ARCHIVOS) {
                throw new BandejaContableEmpresasService.BandejaContableException(
                    'Como máximo se pueden subir ' + MAX_ARCHIVOS + ' archivos por bandeja.');
            }
            for (ArchivoEntradaDTO a : archivos) validarArchivo(a.nombre, a.tamano, a.mime);

            Bandeja_Contable__c b = new Bandeja_Contable__c(
                Empresa__c = empresaId,
                Tipo_documentacion__c = tipo,
                Observaciones__c = observaciones,
                Origen__c = BandejaContableEmpresasService.esUsuarioPortal() ? 'Portal' : 'Manual',
                Estado__c = 'Pendiente'
            );
            Database.insert(b, AccessLevel.USER_MODE);

            List<Bandeja_Contable_Archivo__c> registros = new List<Bandeja_Contable_Archivo__c>();
            for (ArchivoEntradaDTO a : archivos) {
                registros.add(new Bandeja_Contable_Archivo__c(
                    Bandeja__c = b.Id,
                    Nombre__c = a.nombre.left(255),
                    Tamano__c = a.tamano,
                    Tipo_mime__c = String.isBlank(a.mime) ? null : a.mime.left(100),
                    Estado__c = ESTADO_PENDIENTE,
                    Intentos__c = 0
                ));
            }
            Database.insert(registros, AccessLevel.USER_MODE);

            BandejaCreadaDTO res = new BandejaCreadaDTO();
            res.bandejaId = b.Id;
            res.numero = [SELECT Name FROM Bandeja_Contable__c WHERE Id = :b.Id WITH USER_MODE].Name;
            for (Integer i = 0; i < archivos.size(); i++) {
                ArchivoCreadoDTO c = new ArchivoCreadoDTO();
                c.clave = archivos[i].clave;
                c.archivoId = registros[i].Id;
                res.archivos.add(c);
            }
            return res;
        } catch (BandejaContableEmpresasService.BandejaContableException e) {
            Database.rollback(sp);
            throw error(e.getMessage());
        } catch (DmlException e) {
            Database.rollback(sp);
            throw error('No se ha podido guardar la bandeja: ' + e.getDmlMessage(0));
        }
    }

    /** Pide la sesión de subida a Google. El callout va antes del DML en la misma transacción. */
    @AuraEnabled
    public static ResultadoDTO solicitarSesionSubida(Id archivoId, String origin) {
        Bandeja_Contable_Archivo__c a = cargar(archivoId);
        // Subiendo también se admite: una subida interrumpida (pestaña cerrada) se vuelve a empezar
        if (!new Set<String>{ ESTADO_PENDIENTE, ESTADO_SUBIENDO, ESTADO_ERROR }.contains(a.Estado__c)) {
            throw error('El archivo ' + a.Nombre__c + ' ya está en estado ' + a.Estado__c + '.');
        }
        BandejaContableGcpService.Sesion s;
        try {
            s = BandejaContableGcpService.crearSesion(a, origin);
        } catch (BandejaContableGcpService.GcpException e) {
            guardarError(a, e.getMessage(), false);
            return fallo(a, 'No se ha podido preparar la subida en Google. ' + e.getMessage());
        }
        // Google ya ha registrado la bandeja y el archivo: se guardan sus id y la ruta que ha decidido
        a.GCS_ruta__c = s.gcsPath;
        a.Google_Id__c = s.archivoGoogleId;
        a.Estado__c = ESTADO_SUBIENDO;
        a.Ultimo_error__c = null;
        actualizar(a);
        guardarIdBandeja(a, s.bandejaGoogleId);
        ResultadoDTO res = resultado(a, null);
        res.uploadUrl = s.uploadUrl;
        return res;
    }

    /**
     * El navegador ha terminado de subir el archivo: se confirma en Google (Cloud SQL).
     * También sirve para reintentar la confirmación de un archivo que ya está en Cloud Storage.
     * Si Google falla con un error temporal, el archivo queda Subido y se reintenta en cola.
     */
    @AuraEnabled
    public static ResultadoDTO confirmarSubida(Id archivoId) {
        Bandeja_Contable_Archivo__c a = cargar(archivoId);
        if (a.Estado__c == ESTADO_SINCRONIZADO) return resultado(a, 'El archivo ya estaba sincronizado.');
        if (String.isBlank(a.GCS_ruta__c) || a.Estado__c == ESTADO_PENDIENTE) {
            throw error('El archivo ' + a.Nombre__c + ' todavía no se ha subido.');
        }
        try {
            aplicarConfirmacion(a, BandejaContableGcpService.confirmar(a));
            return resultado(a, 'Archivo subido y registrado en Google.');
        } catch (BandejaContableGcpService.GcpException e) {
            if (e.reintentable) {
                a.Estado__c = ESTADO_SUBIDO;
                a.Ultimo_error__c = e.getMessage();
                actualizar(a);
                BandejaContableSyncQueueable.encolar(a.Id, 1);
                return resultado(a, 'El archivo se ha subido, pero Google no lo ha confirmado todavía. Se reintentará automáticamente.');
            }
            guardarError(a, e.getMessage(), true);
            return fallo(a, 'Google ha rechazado el archivo: ' + e.getMessage());
        }
    }

    /** El navegador informa de que la subida a Cloud Storage ha fallado */
    @AuraEnabled
    public static ResultadoDTO marcarError(Id archivoId, String mensaje) {
        Bandeja_Contable_Archivo__c a = cargar(archivoId);
        guardarError(a, String.isBlank(mensaje) ? 'Error desconocido en la subida.' : mensaje, false);
        return resultado(a, null);
    }

    /** Archivos de una bandeja registrados en Google, con URL firmada para previsualizarlos */
    @AuraEnabled
    public static List<BandejaContableGcpService.ArchivoGoogle> listarArchivosGoogle(Id bandejaId) {
        List<Bandeja_Contable__c> b = [SELECT Id FROM Bandeja_Contable__c WHERE Id = :bandejaId WITH USER_MODE LIMIT 1];
        if (b.isEmpty()) throw error('No se encuentra la bandeja o no tienes acceso.');
        try {
            return BandejaContableGcpService.listarArchivos(bandejaId);
        } catch (BandejaContableGcpService.GcpException e) {
            throw error('No se han podido consultar los archivos en Google. ' + e.getMessage());
        }
    }

    // ===== Uso interno (también desde BandejaContableSyncQueueable) =====

    public static Bandeja_Contable_Archivo__c cargar(Id archivoId) {
        List<Bandeja_Contable_Archivo__c> rs = [
            SELECT Id, Name, Nombre__c, Tamano__c, Tipo_mime__c, GCS_ruta__c, Google_Id__c, Estado__c,
                   Intentos__c, Ultimo_error__c, CreatedById, Bandeja__c,
                   Bandeja__r.Id, Bandeja__r.Name, Bandeja__r.Empresa__c, Bandeja__r.Empresa__r.CIF__c,
                   Bandeja__r.Tipo_documentacion__c, Bandeja__r.Observaciones__c, Bandeja__r.Origen__c,
                   Bandeja__r.Google_Id__c, Bandeja__r.CreatedById
            FROM Bandeja_Contable_Archivo__c
            WHERE Id = :archivoId
            WITH USER_MODE
            LIMIT 1
        ];
        if (rs.isEmpty()) throw error('No se encuentra el archivo o no tienes acceso.');
        return rs[0];
    }

    /** Guarda en Salesforce los id de Google del archivo y, si aún no lo tiene, de la bandeja */
    public static void aplicarConfirmacion(Bandeja_Contable_Archivo__c a, BandejaContableGcpService.Confirmacion c) {
        a.Google_Id__c = c.archivoGoogleId;
        a.Estado__c = ESTADO_SINCRONIZADO;
        a.Ultimo_error__c = null;
        actualizar(a);
        guardarIdBandeja(a, c.bandejaGoogleId);
    }

    /** Guarda el id de Google de la bandeja si aún no lo tiene (lo devuelven la sesión y la confirmación) */
    private static void guardarIdBandeja(Bandeja_Contable_Archivo__c a, String bandejaGoogleId) {
        if (String.isBlank(bandejaGoogleId) || a.Bandeja__r.Google_Id__c == bandejaGoogleId) return;
        Database.update(new Bandeja_Contable__c(Id = a.Bandeja__c, Google_Id__c = bandejaGoogleId), AccessLevel.USER_MODE);
        a.Bandeja__r.Google_Id__c = bandejaGoogleId;
    }

    /**
     * Guarda solo los campos de seguimiento. No se actualiza el registro consultado tal cual porque trae
     * campos que no se pueden escribir (Name, CreatedById, el maestro-detalle) y USER_MODE los comprobaría.
     */
    public static void actualizar(Bandeja_Contable_Archivo__c a) {
        Database.update(new Bandeja_Contable_Archivo__c(
            Id = a.Id,
            Estado__c = a.Estado__c,
            GCS_ruta__c = a.GCS_ruta__c,
            Google_Id__c = a.Google_Id__c,
            Intentos__c = a.Intentos__c,
            Ultimo_error__c = a.Ultimo_error__c
        ), AccessLevel.USER_MODE);
    }

    public static void guardarError(Bandeja_Contable_Archivo__c a, String mensaje, Boolean contarIntento) {
        a.Estado__c = ESTADO_ERROR;
        a.Ultimo_error__c = mensaje == null ? null : mensaje.left(32768);
        if (contarIntento) a.Intentos__c = (a.Intentos__c == null ? 0 : a.Intentos__c) + 1;
        actualizar(a);
    }

    @TestVisible
    private static void validarTipo(String tipo) {
        for (Schema.PicklistEntry pe : Bandeja_Contable__c.Tipo_documentacion__c.getDescribe().getPicklistValues()) {
            if (pe.isActive() && pe.getValue() == tipo) return;
        }
        throw new BandejaContableEmpresasService.BandejaContableException('El tipo de documentación no es válido.');
    }

    /** Misma validación que en el navegador: allí es para avisar, aquí es la que cuenta */
    @TestVisible
    private static void validarArchivo(String nombre, Long tamano, String mime) {
        if (String.isBlank(nombre) || !nombre.contains('.')) {
            throw new BandejaContableEmpresasService.BandejaContableException('Falta el archivo o no tiene extensión.');
        }
        String ext = nombre.substringAfterLast('.').toLowerCase();
        if (!MIME_POR_EXTENSION.containsKey(ext)) {
            throw new BandejaContableEmpresasService.BandejaContableException(
                'Formato no permitido (.' + ext + ') en ' + nombre + '. Solo PDF, ZIP, PNG, JPG, JPEG, XLSX o XLS.');
        }
        String m = mime == null ? '' : mime.toLowerCase();
        if (!MIME_POR_EXTENSION.get(ext).contains(m)) {
            throw new BandejaContableEmpresasService.BandejaContableException(
                'El tipo del archivo ' + nombre + ' (' + mime + ') no coincide con su extensión.');
        }
        if (tamano == null || tamano <= 0) {
            throw new BandejaContableEmpresasService.BandejaContableException('El archivo ' + nombre + ' está vacío.');
        }
        if (tamano > BandejaContableGcpService.maxBytes()) {
            throw new BandejaContableEmpresasService.BandejaContableException(
                'El archivo ' + nombre + ' supera el tamaño máximo permitido.');
        }
    }

    private static ResultadoDTO resultado(Bandeja_Contable_Archivo__c a, String mensaje) {
        ResultadoDTO res = new ResultadoDTO();
        res.archivoId = a.Id;
        res.estado = a.Estado__c;
        res.mensaje = mensaje;
        return res;
    }

    private static ResultadoDTO fallo(Bandeja_Contable_Archivo__c a, String mensaje) {
        ResultadoDTO res = resultado(a, mensaje);
        res.ok = false;
        return res;
    }

    private static AuraHandledException error(String mensaje) {
        AuraHandledException e = new AuraHandledException(mensaje);
        e.setMessage(mensaje);
        return e;
    }
}
