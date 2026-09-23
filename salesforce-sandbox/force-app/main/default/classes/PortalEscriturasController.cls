/**
 * Escrituras del portal de clientes (Experience Cloud, sitio LWR "Portal de Clientes").
 *
 * Sirve al LWC portalEscrituras: listado paginado con filtros (texto libre sobre
 * título, notario y nº de escritura; una o varias empresas; rango de fechas),
 * lista de empresas para el filtro, y detalle de una escritura con sus
 * documentos adjuntos (Salesforce Files enlazados por ContentDocumentLink).
 *
 * Todo es de solo lectura y respeta la visibilidad del usuario conectado:
 * `with sharing` para los registros y USER_MODE para objeto y campos, de forma
 * que un cliente del portal solo ve las escrituras de su empresa y los archivos
 * que se han compartido con usuarios externos.
 *
 * La paginación es por cursor (fecha de escritura + Id de la última fila) en
 * vez de OFFSET, porque OFFSET no admite más de 2.000 filas y ya hay más
 * escrituras que eso para los usuarios internos.
 */
public with sharing class PortalEscriturasController {

    /** Tamaño de página por defecto y tope para no traer bloques enormes */
    private static final Integer TAMANO_DEFECTO = 25;
    private static final Integer TAMANO_MAXIMO = 200;

    /** Fila del listado */
    public class FilaDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String numero;
        @AuraEnabled public Date fecha;
        @AuraEnabled public String protocolo;
        @AuraEnabled public Id empresaId;
        @AuraEnabled public String empresa;
        @AuraEnabled public String notario;
        @AuraEnabled public String titulo;
        @AuraEnabled public Integer adjuntos = 0;
    }

    /** Página del listado con el cursor para pedir la siguiente */
    public class ListadoDTO {
        @AuraEnabled public List<FilaDTO> filas = new List<FilaDTO>();
        @AuraEnabled public Integer total = 0;
        @AuraEnabled public Boolean hayMas = false;
        @AuraEnabled public Date cursorFecha;
        @AuraEnabled public Id cursorId;
    }

    /** Empresa con escrituras visibles, para el filtro multiselección */
    public class EmpresaDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String nombre;
        @AuraEnabled public Integer escrituras;
    }

    /** Documento adjunto a una escritura */
    public class AdjuntoDTO {
        @AuraEnabled public Id documentoId;
        @AuraEnabled public Id versionId;
        @AuraEnabled public String titulo;
        @AuraEnabled public String extension;
        @AuraEnabled public String tipo;
        @AuraEnabled public Long tamano;
        @AuraEnabled public Datetime fecha;
        /** 'paginas' (PDF/Office: renders SVG por página), 'imagen' o 'ninguna' */
        @AuraEnabled public String previsualizacion;
    }

    /** Detalle completo de una escritura */
    public class DetalleDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String numero;
        @AuraEnabled public Date fecha;
        @AuraEnabled public String protocolo;
        @AuraEnabled public Id empresaId;
        @AuraEnabled public String empresa;
        @AuraEnabled public String notario;
        @AuraEnabled public String titulo;
        @AuraEnabled public String observaciones;
        @AuraEnabled public String contieneObjetoSocial;
        @AuraEnabled public String acreditaTitularidadReal;
        @AuraEnabled public String variacionParticipaciones;
        @AuraEnabled public String cambioAdministrador;
        @AuraEnabled public String cambioDomicilio;
        @AuraEnabled public List<AdjuntoDTO> adjuntos = new List<AdjuntoDTO>();
    }

    /**
     * Listado paginado de escrituras visibles para el usuario.
     *
     * @param texto        Busca en el título, el notario y el nº de escritura (LIKE)
     * @param empresaIds   Empresas a las que limitar el listado (vacío = todas)
     * @param desde        Fecha de escritura mínima (inclusive)
     * @param hasta        Fecha de escritura máxima (inclusive)
     * @param tamano       Filas por página (1-200; por defecto 25)
     * @param cursorFecha  Fecha de la última fila recibida (null en la primera página
     *                     o cuando la última fila no tenía fecha)
     * @param cursorId     Id de la última fila recibida (null en la primera página)
     */
    @AuraEnabled(cacheable=true)
    public static ListadoDTO getEscrituras(String texto, List<Id> empresaIds, Date desde, Date hasta,
                                           Integer tamano, Date cursorFecha, Id cursorId) {
        Integer limite = (tamano == null || tamano < 1) ? TAMANO_DEFECTO : Math.min(tamano, TAMANO_MAXIMO);

        Map<String, Object> binds = new Map<String, Object>();
        List<String> condiciones = condicionesFiltro(texto, empresaIds, desde, hasta, binds);

        // Total sin paginar, para el "x/y" del pie del listado
        String whereFiltro = condiciones.isEmpty() ? '' : ' WHERE ' + String.join(condiciones, ' AND ');
        ListadoDTO resultado = new ListadoDTO();
        resultado.total = Database.countQueryWithBinds(
            'SELECT COUNT() FROM Escrituras__c' + whereFiltro, binds, AccessLevel.USER_MODE);

        // Cursor: todo lo que va "después" de la última fila en el orden
        // Fecha DESC NULLS LAST, Id DESC
        if (cursorId != null) {
            binds.put('cursorId', cursorId);
            if (cursorFecha != null) {
                binds.put('cursorFecha', cursorFecha);
                condiciones.add('(Fecha_escritura__c < :cursorFecha'
                    + ' OR (Fecha_escritura__c = :cursorFecha AND Id < :cursorId)'
                    + ' OR Fecha_escritura__c = null)');
            } else {
                condiciones.add('(Fecha_escritura__c = null AND Id < :cursorId)');
            }
        }
        String wherePagina = condiciones.isEmpty() ? '' : ' WHERE ' + String.join(condiciones, ' AND ');
        binds.put('limite', limite + 1);

        List<Escrituras__c> registros = Database.queryWithBinds(
            'SELECT Id, Name, Fecha_escritura__c, N_Protocolo__c, Empresa__c, Empresa__r.Name,'
            + ' Notario__c, T_tulo_Escritura__c'
            + ' FROM Escrituras__c' + wherePagina
            + ' ORDER BY Fecha_escritura__c DESC NULLS LAST, Id DESC'
            + ' LIMIT :limite',
            binds, AccessLevel.USER_MODE);

        // Se pide una fila más de la cuenta solo para saber si hay otra página
        resultado.hayMas = registros.size() > limite;
        if (resultado.hayMas) registros.remove(registros.size() - 1);

        Map<Id, Integer> adjuntosPorEscritura = contarAdjuntos(new Map<Id, Escrituras__c>(registros).keySet());
        for (Escrituras__c e : registros) {
            FilaDTO f = new FilaDTO();
            f.id = e.Id;
            f.numero = e.Name;
            f.fecha = e.Fecha_escritura__c;
            f.protocolo = e.N_Protocolo__c;
            f.empresaId = e.Empresa__c;
            f.empresa = e.Empresa__r == null ? null : e.Empresa__r.Name;
            f.notario = e.Notario__c;
            f.titulo = e.T_tulo_Escritura__c;
            f.adjuntos = adjuntosPorEscritura.containsKey(e.Id) ? adjuntosPorEscritura.get(e.Id) : 0;
            resultado.filas.add(f);
        }
        if (!registros.isEmpty()) {
            Escrituras__c ultima = registros[registros.size() - 1];
            resultado.cursorFecha = ultima.Fecha_escritura__c;
            resultado.cursorId = ultima.Id;
        }
        return resultado;
    }

    /** Condiciones WHERE de los filtros del usuario; rellena los binds que usan */
    private static List<String> condicionesFiltro(String texto, List<Id> empresaIds, Date desde, Date hasta,
                                                  Map<String, Object> binds) {
        List<String> condiciones = new List<String>();
        if (String.isNotBlank(texto)) {
            binds.put('texto', '%' + texto.trim() + '%');
            condiciones.add('(T_tulo_Escritura__c LIKE :texto OR Notario__c LIKE :texto OR Name LIKE :texto)');
        }
        if (empresaIds != null && !empresaIds.isEmpty()) {
            binds.put('empresaIds', empresaIds);
            condiciones.add('Empresa__c IN :empresaIds');
        }
        if (desde != null) {
            binds.put('desde', desde);
            condiciones.add('Fecha_escritura__c >= :desde');
        }
        if (hasta != null) {
            binds.put('hasta', hasta);
            condiciones.add('Fecha_escritura__c <= :hasta');
        }
        return condiciones;
    }

    /** Empresas con escrituras visibles para el usuario, por orden alfabético, con su nº de escrituras */
    @AuraEnabled(cacheable=true)
    public static List<EmpresaDTO> getEmpresas() {
        List<EmpresaDTO> empresas = new List<EmpresaDTO>();
        for (AggregateResult ar : [
            SELECT Empresa__c emp, Empresa__r.Name nombre, COUNT(Id) n
            FROM Escrituras__c
            WHERE Empresa__c != null
            WITH USER_MODE
            GROUP BY Empresa__c, Empresa__r.Name
            ORDER BY Empresa__r.Name
        ]) {
            EmpresaDTO e = new EmpresaDTO();
            e.id = (Id) ar.get('emp');
            e.nombre = (String) ar.get('nombre');
            e.escrituras = (Integer) ar.get('n');
            empresas.add(e);
        }
        return empresas;
    }

    /** Nº de archivos enlazados a cada escritura (solo los visibles para el usuario) */
    private static Map<Id, Integer> contarAdjuntos(Set<Id> escrituraIds) {
        Map<Id, Integer> conteo = new Map<Id, Integer>();
        if (escrituraIds.isEmpty()) return conteo;
        for (AggregateResult ar : [
            SELECT LinkedEntityId ent, COUNT(Id) n
            FROM ContentDocumentLink
            WHERE LinkedEntityId IN :escrituraIds
            GROUP BY LinkedEntityId
        ]) {
            conteo.put((Id) ar.get('ent'), (Integer) ar.get('n'));
        }
        return conteo;
    }

    /** Detalle de una escritura con la lista de sus documentos adjuntos */
    @AuraEnabled(cacheable=true)
    public static DetalleDTO getDetalle(Id escrituraId) {
        if (escrituraId == null) throw new AuraHandledException('No se ha indicado la escritura.');

        List<Escrituras__c> registros = [
            SELECT Id, Name, Fecha_escritura__c, N_Protocolo__c, Empresa__c, Empresa__r.Name,
                   Notario__c, T_tulo_Escritura__c, Observaciones__c,
                   Contiene_descripci_n_objeto_social__c, Acredita_la_titularidad_real__c,
                   Conlleva_variaci_n_de_Participaciones__c, Conlleva_cambio_de_administrador__c,
                   Conlleva_cambio_de_domicilio__c
            FROM Escrituras__c
            WHERE Id = :escrituraId
            WITH USER_MODE
            LIMIT 1
        ];
        if (registros.isEmpty()) {
            throw new AuraHandledException('La escritura no existe o no tienes permiso para verla.');
        }
        Escrituras__c e = registros[0];

        DetalleDTO d = new DetalleDTO();
        d.id = e.Id;
        d.numero = e.Name;
        d.fecha = e.Fecha_escritura__c;
        d.protocolo = e.N_Protocolo__c;
        d.empresaId = e.Empresa__c;
        d.empresa = e.Empresa__r == null ? null : e.Empresa__r.Name;
        d.notario = e.Notario__c;
        d.titulo = e.T_tulo_Escritura__c;
        d.observaciones = e.Observaciones__c;
        d.contieneObjetoSocial = e.Contiene_descripci_n_objeto_social__c;
        d.acreditaTitularidadReal = e.Acredita_la_titularidad_real__c;
        d.variacionParticipaciones = e.Conlleva_variaci_n_de_Participaciones__c;
        d.cambioAdministrador = e.Conlleva_cambio_de_administrador__c;
        d.cambioDomicilio = e.Conlleva_cambio_de_domicilio__c;

        for (ContentDocumentLink cdl : [
            SELECT ContentDocumentId, ContentDocument.Title, ContentDocument.FileExtension,
                   ContentDocument.FileType, ContentDocument.ContentSize,
                   ContentDocument.LatestPublishedVersionId, ContentDocument.CreatedDate
            FROM ContentDocumentLink
            WHERE LinkedEntityId = :escrituraId
        ]) {
            ContentDocument doc = cdl.ContentDocument;
            if (doc == null) continue;
            AdjuntoDTO a = new AdjuntoDTO();
            a.documentoId = cdl.ContentDocumentId;
            a.versionId = doc.LatestPublishedVersionId;
            a.titulo = doc.Title;
            a.extension = doc.FileExtension;
            a.tipo = doc.FileType;
            a.tamano = doc.ContentSize;
            a.fecha = doc.CreatedDate;
            a.previsualizacion = tipoPrevisualizacion(doc.FileType);
            d.adjuntos.add(a);
        }
        // Primero los PDF (lo habitual en una escritura), luego el resto, y
        // dentro de cada grupo del más antiguo al más reciente
        d.adjuntos = ordenarAdjuntos(d.adjuntos);
        return d;
    }

    private static final Set<String> TIPOS_CON_PAGINAS = new Set<String>{
        'PDF', 'WORD', 'WORD_X', 'WORD_M', 'EXCEL', 'EXCEL_X', 'EXCEL_M',
        'POWER_POINT', 'POWER_POINT_X', 'POWER_POINT_M', 'TEXT', 'RTF', 'CSV'
    };
    private static final Set<String> TIPOS_IMAGEN = new Set<String>{ 'JPG', 'JPEG', 'PNG', 'GIF', 'BMP', 'WEBP' };

    /** Cómo puede previsualizarse un archivo según su tipo */
    @TestVisible
    private static String tipoPrevisualizacion(String fileType) {
        String t = fileType == null ? '' : fileType.toUpperCase();
        if (TIPOS_CON_PAGINAS.contains(t)) return 'paginas';
        if (TIPOS_IMAGEN.contains(t)) return 'imagen';
        return 'ninguna';
    }

    private static List<AdjuntoDTO> ordenarAdjuntos(List<AdjuntoDTO> adjuntos) {
        List<AdjuntoOrdenable> ordenables = new List<AdjuntoOrdenable>();
        for (AdjuntoDTO a : adjuntos) ordenables.add(new AdjuntoOrdenable(a));
        ordenables.sort();
        List<AdjuntoDTO> ordenados = new List<AdjuntoDTO>();
        for (AdjuntoOrdenable o : ordenables) ordenados.add(o.adjunto);
        return ordenados;
    }

    private class AdjuntoOrdenable implements Comparable {
        public AdjuntoDTO adjunto;
        AdjuntoOrdenable(AdjuntoDTO a) { this.adjunto = a; }
        public Integer compareTo(Object otro) {
            AdjuntoDTO b = ((AdjuntoOrdenable) otro).adjunto;
            Integer ga = grupo(adjunto), gb = grupo(b);
            if (ga != gb) return ga - gb;
            if (adjunto.fecha == null || b.fecha == null) return 0;
            return adjunto.fecha < b.fecha ? -1 : (adjunto.fecha > b.fecha ? 1 : 0);
        }
        private Integer grupo(AdjuntoDTO a) {
            if (a.tipo == 'PDF') return 0;
            return a.previsualizacion == 'ninguna' ? 2 : 1;
        }
    }
}