/**
 * Controller del componente "Área Contable y Fiscal": recuento de registros
 * en estado abierto por usuario propietario, para los objetos del área:
 * Contabilidad, Precierre contable, Cierre contable, Libros, Cuentas anuales,
 * Renta, Expediente (Proyecto__c) y Casos.
 *
 * "Abierto" se define por objeto excluyendo sus estados finales; los estados
 * en blanco cuentan como abiertos (en SOQL NOT IN incluye los nulos).
 */
public with sharing class AreaContableFiscalController {

    private static final Set<String> CERRADOS_PRECIERRE    = new Set<String>{ 'Cancelado', 'Cerrado' };
    private static final Set<String> CERRADOS_CIERRE       = new Set<String>{ 'Completado' };
    private static final Set<String> CERRADOS_LIBROS       = new Set<String>{ 'Presentado', 'Cerrado' };
    private static final Set<String> CERRADOS_CUENTAS      = new Set<String>{ 'Presentado', 'Cerrado' };
    private static final Set<String> CERRADOS_RENTA        = new Set<String>{ 'Cerrado' };
    private static final Set<String> CERRADOS_PROYECTO     = new Set<String>{ 'Cerrado' };

    // Mes efectivo de vencimiento de cada periodicidad (los trimestres vencen con su último mes)
    private static final Map<String, Integer> MES_EFECTIVO = new Map<String, Integer>{
        'Enero' => 1, 'Febrero' => 2, 'Marzo' => 3, 'Primer Trimestre' => 3,
        'Abril' => 4, 'Mayo' => 5, 'Junio' => 6, 'Segundo Trimestre' => 6,
        'Julio' => 7, 'Agosto' => 8, 'Septiembre' => 9, 'Tercer Trimestre' => 9,
        'Octubre' => 10, 'Noviembre' => 11, 'Diciembre' => 12, 'Cuarto Trimestre' => 12
    };

    /** Vencida si su mes efectivo es anterior al mes pasado */
    @TestVisible
    private static Boolean contabVencida(String ejercicio, String periodicidad) {
        Integer anio;
        try { anio = Integer.valueOf(ejercicio); } catch (Exception e) { return false; }
        Integer mes = MES_EFECTIVO.containsKey(periodicidad) ? MES_EFECTIVO.get(periodicidad) : 12;
        Date hoy = Date.today();
        return (anio * 12 + mes) < (hoy.year() * 12 + hoy.month() - 1);
    }

    /** Vencido si hoy es posterior al 31 de octubre de su ejercicio */
    @TestVisible
    private static Boolean precierreVencido(String ejercicio) {
        Integer anio;
        try { anio = Integer.valueOf(ejercicio); } catch (Exception e) { return false; }
        return Date.today() > Date.newInstance(anio, 10, 31);
    }

    /** Vencido si hoy es posterior al 30 de abril de su ejercicio (cierres y libros) */
    @TestVisible
    private static Boolean cierreVencido(String ejercicio) {
        Integer anio;
        try { anio = Integer.valueOf(ejercicio); } catch (Exception e) { return false; }
        return Date.today() > Date.newInstance(anio, 4, 30);
    }

    /** Vencida si hoy es posterior al 30 de julio de su ejercicio */
    @TestVisible
    private static Boolean cuentasVencida(String ejercicio) {
        Integer anio;
        try { anio = Integer.valueOf(ejercicio); } catch (Exception e) { return false; }
        return Date.today() > Date.newInstance(anio, 7, 30);
    }

    public class FilaDTO {
        @AuraEnabled public Id      usuarioId;
        @AuraEnabled public String  nombre;
        @AuraEnabled public String  empresaTitular;
        @AuraEnabled public String  departamento;
        @AuraEnabled public Boolean activo;
        @AuraEnabled public Integer contabilidades = 0;
        @AuraEnabled public Integer precierres = 0;
        @AuraEnabled public Integer cierres = 0;
        @AuraEnabled public Integer libros = 0;
        @AuraEnabled public Integer cuentas = 0;
        @AuraEnabled public Integer rentas = 0;
        @AuraEnabled public Integer expedientes = 0;
        @AuraEnabled public Integer casos = 0;
        @AuraEnabled public Integer contratos = 0;
        @AuraEnabled public Integer tareas = 0;
        @AuraEnabled public Integer buzon = 0;
        @AuraEnabled public Integer oportunidades = 0;
        @AuraEnabled public Integer leads = 0;          // leads no convertidos en Pendiente o Atendido de los que soy propietario
        @AuraEnabled public Integer oppVencidas = 0;    // oportunidades abiertas con fecha de cierre anterior a hoy
        @AuraEnabled public Integer vencimientos = 0;   // tareas abiertas con vencimiento legal (sin señalamientos)
        @AuraEnabled public Integer vencVencidos = 0;   // de ellas, con vencimiento legal anterior a hoy
        @AuraEnabled public Integer contabVencidas = 0;
        @AuraEnabled public Integer precVencidos = 0;
        @AuraEnabled public Integer cierVencidos = 0;
        @AuraEnabled public Integer librosVencidos = 0;
        @AuraEnabled public Integer cuentasVencidas = 0;
        @AuraEnabled public Integer total = 0;
    }

    public class ContabDTO {
        @AuraEnabled public Id     id;
        @AuraEnabled public String numero;
        @AuraEnabled public Date   fecha;
        @AuraEnabled public String ejercicio;
        @AuraEnabled public String periodicidad;
        @AuraEnabled public Id     empresaId;
        @AuraEnabled public String empresa;
        @AuraEnabled public String tipoServicio;
        @AuraEnabled public Id     asesorId;
        @AuraEnabled public String asesor;
        @AuraEnabled public String emitColor;
        @AuraEnabled public String recColor;
        @AuraEnabled public String banColor;
        @AuraEnabled public String chkColor;
        @AuraEnabled public String checklist;
        @AuraEnabled public String empresaTitularUsuario;
        @AuraEnabled public String grupo;      // grupo empresarial de la empresa
        @AuraEnabled public String contacto;   // contacto contable del registro
        @AuraEnabled public String emitRecep;   // forma de recepción de las facturas emitidas
        @AuraEnabled public String recRecep;    // forma de recepción de las facturas recibidas
        @AuraEnabled public String banRecep;    // forma de recepción de los bancos
    }

    // DTO común para los listados sencillos (precierres, cierres...)
    public class RegistroDTO {
        @AuraEnabled public Id     id;
        @AuraEnabled public String numero;
        @AuraEnabled public Id     empresaId;
        @AuraEnabled public String empresa;
        @AuraEnabled public Id     asesorId;
        @AuraEnabled public String asesor;
        @AuraEnabled public String estado;
        @AuraEnabled public String titulo;
        @AuraEnabled public String empresaTitular;
        @AuraEnabled public String materia;
        @AuraEnabled public String empresaTitularUsuario;
        @AuraEnabled public String contratoFiscal;
        @AuraEnabled public String contratoLaboral;
        @AuraEnabled public Integer tareasAbiertas;
        @AuraEnabled public Date   ultimaTarea;
        @AuraEnabled public Date   fechaApertura;
        @AuraEnabled public Boolean asesorActivo;
        @AuraEnabled public String ejercicio;
        @AuraEnabled public String grupo;
    }

    // DTO de las tareas del usuario para la pestaña Mi situación
    public class TareaDTO {
        @AuraEnabled public Id     id;
        @AuraEnabled public String asunto;
        @AuraEnabled public Date   fecha;
        @AuraEnabled public Date   vtoLegal;
        @AuraEnabled public String riesgo;
        @AuraEnabled public String origen;
        @AuraEnabled public Id     empresaId;
        @AuraEnabled public String empresa;
        @AuraEnabled public Id     relId;
        @AuraEnabled public String relTipo;
        @AuraEnabled public String relNombre;
    }

    /**
     * Tareas abiertas del usuario actual con vencimiento hasta hoy, ordenadas
     * por fecha de vencimiento, para la pestaña Mi situación. Las de origen
     * Candidatura quedan fuera. Con limite informado trae solo las N más
     * antiguas (el arranque pide 25); sin él, el listado completo.
     */
    @AuraEnabled
    public static List<TareaDTO> getMisTareas(Integer limite) {
        Integer tope = (limite == null || limite <= 0) ? 1000 : limite;
        List<TareaDTO> out = new List<TareaDTO>();
        for (Task t : [
            SELECT Subject, ActivityDate, Vencimiento_Legal__c, Riesgo__c, Categor_a__c,
                   Empresa__c, Empresa__r.Name, WhatId, What.Type, What.Name
            FROM Task
            WHERE OwnerId = :UserInfo.getUserId() AND IsClosed = false
                  AND ActivityDate <= :Date.today()
                  AND (Categor_a__c = null OR Categor_a__c != 'Candidatura')
            ORDER BY ActivityDate ASC
            LIMIT :tope
        ]) {
            out.add(mapTarea(t));
        }
        return out;
    }

    // Fila del listado de tareas a partir de la tarea con sus relaciones consultadas
    private static TareaDTO mapTarea(Task t) {
        TareaDTO dto = new TareaDTO();
        dto.id = t.Id;
        dto.asunto = t.Subject;
        dto.fecha = t.ActivityDate;
        dto.vtoLegal = t.Vencimiento_Legal__c;
        dto.riesgo = riesgoColor(t.Riesgo__c);
        dto.origen = String.isBlank(t.Categor_a__c) ? 'Sin origen' : t.Categor_a__c;
        dto.empresaId = t.Empresa__c;
        dto.empresa = t.Empresa__r == null ? null : t.Empresa__r.Name;
        dto.relId = t.WhatId;
        dto.relTipo = t.WhatId == null ? null : String.valueOf(t.WhatId.getSObjectType());
        dto.relNombre = t.What == null ? null : t.What.Name;
        return dto;
    }

    /**
     * Mis próximas tareas: abiertas del usuario actual con vencimiento
     * posterior a hoy (sin Candidatura), ordenadas por fecha.
     */
    @AuraEnabled
    public static List<TareaDTO> getMisTareasProximas() {
        List<TareaDTO> out = new List<TareaDTO>();
        for (Task t : [
            SELECT Subject, ActivityDate, Vencimiento_Legal__c, Riesgo__c, Categor_a__c,
                   Empresa__c, Empresa__r.Name, WhatId, What.Type, What.Name
            FROM Task
            WHERE OwnerId = :UserInfo.getUserId() AND IsClosed = false
                  AND ActivityDate > :Date.today()
                  AND (Categor_a__c = null OR Categor_a__c != 'Candidatura')
            ORDER BY ActivityDate ASC
            LIMIT 1000
        ]) {
            TareaDTO dto = new TareaDTO();
            dto.id = t.Id;
            dto.asunto = t.Subject;
            dto.fecha = t.ActivityDate;
            dto.vtoLegal = t.Vencimiento_Legal__c;
            dto.riesgo = riesgoColor(t.Riesgo__c);
            dto.origen = String.isBlank(t.Categor_a__c) ? 'Sin origen' : t.Categor_a__c;
            dto.empresaId = t.Empresa__c;
            dto.empresa = t.Empresa__r == null ? null : t.Empresa__r.Name;
            dto.relId = t.WhatId;
            dto.relTipo = t.WhatId == null ? null : String.valueOf(t.WhatId.getSObjectType());
            dto.relNombre = t.What == null ? null : t.What.Name;
            out.add(dto);
        }
        return out;
    }

    public class TareaEquipoDTO {
        @AuraEnabled public Id     id;
        @AuraEnabled public String asunto;
        @AuraEnabled public Date   fecha;
        @AuraEnabled public Date   vtoLegal;
        @AuraEnabled public String riesgo;
        @AuraEnabled public String origen;
        @AuraEnabled public Id     empresaId;
        @AuraEnabled public String empresa;
        @AuraEnabled public Id     relId;
        @AuraEnabled public String relTipo;
        @AuraEnabled public String relNombre;
        @AuraEnabled public Id     ownerId;
        @AuraEnabled public String ownerNombre;
        @AuraEnabled public Boolean ownerActivo;
        @AuraEnabled public String empresaTitularUsuario; // de la ficha del usuario propietario
    }

    /**
     * Tareas abiertas de todos los usuarios con vencimiento hasta hoy para la
     * pestaña Tareas de Inicio (mismas reglas que las del Detalle, sin las de
     * origen Candidatura). El nombre y el estado activo del propietario viajan
     * para las listas y filtros de la pantalla.
     */
    @AuraEnabled
    public static List<TareaEquipoDTO> getTareasTodas() {
        List<Task> tareas = [
            SELECT Subject, ActivityDate, Vencimiento_Legal__c, Riesgo__c, Categor_a__c,
                   Empresa__c, Empresa__r.Name, WhatId, What.Type, What.Name, OwnerId
            FROM Task
            WHERE IsClosed = false AND ActivityDate <= :Date.today()
                  AND (Categor_a__c = null OR Categor_a__c != 'Candidatura')
            ORDER BY ActivityDate ASC
            LIMIT 10000
        ];
        Set<Id> ownerIds = new Set<Id>();
        for (Task t : tareas) ownerIds.add(t.OwnerId);
        Map<Id, User> usuarios = new Map<Id, User>([
            SELECT Name, IsActive, Empresa_Titular__c FROM User WHERE Id IN :ownerIds
        ]);
        List<TareaEquipoDTO> out = new List<TareaEquipoDTO>();
        for (Task t : tareas) {
            TareaEquipoDTO dto = new TareaEquipoDTO();
            dto.id = t.Id;
            dto.asunto = t.Subject;
            dto.fecha = t.ActivityDate;
            dto.vtoLegal = t.Vencimiento_Legal__c;
            dto.riesgo = riesgoColor(t.Riesgo__c);
            dto.origen = String.isBlank(t.Categor_a__c) ? 'Sin origen' : t.Categor_a__c;
            dto.empresaId = t.Empresa__c;
            dto.empresa = t.Empresa__r == null ? null : t.Empresa__r.Name;
            dto.relId = t.WhatId;
            dto.relTipo = t.WhatId == null ? null : String.valueOf(t.WhatId.getSObjectType());
            dto.relNombre = t.What == null ? null : t.What.Name;
            // Las tareas de colas quedan sin usuario y cuentan como inactivas
            User u = usuarios.get(t.OwnerId);
            dto.ownerId = t.OwnerId;
            dto.ownerNombre = u == null ? 'Sin usuario' : u.Name;
            dto.ownerActivo = u != null && u.IsActive;
            dto.empresaTitularUsuario = u == null ? null : u.Empresa_Titular__c;
            out.add(dto);
        }
        return out;
    }

    // DTO de los señalamientos legales para su pestaña
    public class SenalamientoDTO {
        @AuraEnabled public Id       id;
        @AuraEnabled public Datetime inicio;
        @AuraEnabled public Datetime fin;
        @AuraEnabled public String   asunto;
        @AuraEnabled public String   direccion;
        @AuraEnabled public Id       asesorId;
        @AuraEnabled public String   asesor;
        @AuraEnabled public Id       relId;
        @AuraEnabled public String   relTipo;
        @AuraEnabled public String   relNombre;
    }

    /**
     * Señalamientos legales desde el lunes de la semana actual: eventos de
     * calendario marcados como señalamiento legal, ordenados por fecha de
     * inicio ascendente. La vista por defecto de la pestaña muestra los de
     * hoy en adelante; los de días ya pasados de la semana permiten que el
     * filtro de fecha del calendario funcione en cualquier celda.
     */
    @AuraEnabled
    public static List<SenalamientoDTO> getSenalamientosLegales() {
        Date hoy = Date.today();
        // Lunes de la semana actual (el 1/1/1900 fue lunes; no depende del locale)
        Date lunes = hoy.addDays(-Math.mod(Date.newInstance(1900, 1, 1).daysBetween(hoy), 7));
        Datetime desde = Datetime.newInstance(lunes, Time.newInstance(0, 0, 0, 0));
        List<SenalamientoDTO> out = new List<SenalamientoDTO>();
        for (Event ev : [
            SELECT Id, Subject, StartDateTime, EndDateTime, Location, OwnerId, Owner.Name,
                   WhatId, What.Type, What.Name
            FROM Event
            WHERE Es_un_se_alamiento_legal__c = 'Si' AND EndDateTime >= :desde
            ORDER BY StartDateTime ASC
            LIMIT 2000
        ]) {
            SenalamientoDTO dto = new SenalamientoDTO();
            dto.id = ev.Id;
            dto.inicio = ev.StartDateTime;
            dto.fin = ev.EndDateTime;
            dto.asunto = ev.Subject;
            dto.direccion = ev.Location;
            dto.asesorId = ev.OwnerId;
            dto.asesor = ev.Owner == null ? null : ev.Owner.Name;
            dto.relId = ev.WhatId;
            dto.relTipo = ev.WhatId == null ? null : String.valueOf(ev.WhatId.getSObjectType());
            dto.relNombre = ev.What == null ? null : ev.What.Name;
            out.add(dto);
        }
        return out;
    }

    /** Semáforo de riesgo de la tarea: el icono Warning cuenta como rojo */
    @TestVisible
    private static String riesgoColor(String html) {
        String color = colorSemaforo(html);
        if (color == 'gris' && html != null && html.toLowerCase().contains('warning')) return 'rojo';
        return color;
    }

    // Datos del arranque del componente, agrupados en una sola llamada para
    // ahorrar viajes de red en el primer pintado
    public class InicioDTO {
        @AuraEnabled public List<FilaDTO>    resumen;
        @AuraEnabled public VencimientosDTO  vencimientos;
        @AuraEnabled public List<TareaDTO>   misTareas;
    }

    @AuraEnabled
    public static InicioDTO getInicio() {
        InicioDTO out = new InicioDTO();
        out.resumen = getResumen();
        out.vencimientos = getVencimientosLegales();
        out.misTareas = getMisTareas(null);
        return out;
    }

    // Cuántas tareas mías trae el arranque; el resto llega al pulsar Ver todas
    private static final Integer MIS_TAREAS_INICIO = 25;

    public class OrigenDTO {
        @AuraEnabled public String  nombre;
        @AuraEnabled public Integer n = 0;
    }

    // Arranque rápido de Detalle: los contadores del usuario conectado, los
    // vencimientos y sus 25 tareas más antiguas; el total y el desglose por
    // origen viajan aparte para que la columna de orígenes y el KPI muestren
    // las cifras reales aunque el listado venga recortado. El resumen de todos
    // los usuarios (mucho más pesado) se pide aparte en segundo plano
    public class InicioRapidoDTO {
        @AuraEnabled public FilaDTO          miResumen;
        @AuraEnabled public VencimientosDTO  vencimientos;
        @AuraEnabled public List<TareaDTO>   misTareas;
        @AuraEnabled public Integer          misTareasTotal = 0;
        @AuraEnabled public List<OrigenDTO>  misTareasOrigenes;
        // Totales de las pestañas de Inicio (mismos criterios que sus listados)
        @AuraEnabled public Integer          tabExpedientes = 0;
        @AuraEnabled public Integer          tabOportunidades = 0;
        @AuraEnabled public Integer          tabCasos = 0;
        @AuraEnabled public Integer          tabLeads = 0; // leads no convertidos en Pendiente (Nuevo) o Atendido
        @AuraEnabled public Integer          tabTareas = 0;
        @AuraEnabled public Integer          tabVtos = 0; // tareas abiertas con vencimiento legal vencido o de hoy (sin señalamientos)
        @AuraEnabled public Integer          tabSenalamientos = 0; // señalamientos legales (eventos) que caen hoy
        @AuraEnabled public Integer          tabAusencias = 0; // ausentes hoy
        @AuraEnabled public Integer          tabTeletrabajo = 0; // empleados con teletrabajo fijo hoy
        // Accesos rápidos de Detalle
        @AuraEnabled public Integer          notifPendientes = 0;   // notificaciones puestas a disposición o descargadas
        @AuraEnabled public Integer          incidAbiertas = 0;     // incidencias informáticas abiertas
    }

    @AuraEnabled
    public static InicioRapidoDTO getInicioRapido() {
        InicioRapidoDTO out = new InicioRapidoDTO();
        out.miResumen = getMiResumen();
        out.vencimientos = getVencimientosLegales();
        // Mis tareas abiertas hasta hoy en una sola consulta: las 25 primeras por fecha
        // forman el listado y todas cuentan para el total y el desglose por origen
        // (Categor_a__c es una fórmula y no admite GROUP BY). Antes eran dos consultas,
        // y la del listado, por juntar el nombre del relacionado, el filtro por la fórmula
        // y el LIMIT 25 ordenado, tardaba 155 ms; esta trae todas las filas en 40.
        out.misTareas = new List<TareaDTO>();
        out.misTareasOrigenes = new List<OrigenDTO>();
        Map<String, OrigenDTO> porOrigen = new Map<String, OrigenDTO>();
        for (Task t : [
            SELECT Subject, ActivityDate, Vencimiento_Legal__c, Riesgo__c, Categor_a__c,
                   Empresa__c, Empresa__r.Name, WhatId, What.Type, What.Name
            FROM Task
            WHERE OwnerId = :UserInfo.getUserId() AND IsClosed = false
                  AND ActivityDate <= :Date.today()
                  AND (Categor_a__c = null OR Categor_a__c != 'Candidatura')
            ORDER BY ActivityDate ASC]) {
            if (out.misTareas.size() < MIS_TAREAS_INICIO) out.misTareas.add(mapTarea(t));
            String nombre = String.isBlank(t.Categor_a__c) ? 'Sin origen' : t.Categor_a__c;
            OrigenDTO o = porOrigen.get(nombre);
            if (o == null) {
                o = new OrigenDTO();
                o.nombre = nombre;
                porOrigen.put(nombre, o);
                out.misTareasOrigenes.add(o);
            }
            o.n++;
            out.misTareasTotal++;
        }
        // Totales para las pestañas Expedientes, Oportunidades, Casos y Tareas
        out.tabExpedientes = [SELECT COUNT() FROM Proyecto__c WHERE Estado__c NOT IN :CERRADOS_PROYECTO];
        out.tabOportunidades = [SELECT COUNT() FROM Opportunity WHERE IsClosed = false];
        out.tabCasos = [SELECT COUNT() FROM Case WHERE IsClosed = false];
        out.tabLeads = [SELECT COUNT() FROM Lead WHERE IsConverted = false AND Status IN :LEAD_ESTADOS_ABIERTOS];
        out.tabTareas = [SELECT COUNT() FROM Task
            WHERE IsClosed = false AND ActivityDate <= :Date.today()
              AND (Categor_a__c = null OR Categor_a__c != 'Candidatura')];
        // Vencimientos legales vencidos o de hoy que siguen abiertos: ya calculado en la
        // misma pasada que el calendario y las sin presentar, sin otra consulta a Tarea
        out.tabVtos = out.vencimientos.vencidasOHoy;
        // Señalamientos legales de hoy: eventos marcados como señalamiento cuyo intervalo
        // toca el día de hoy (mismo criterio que el calendario de la pestaña)
        Datetime hoyIni = Datetime.newInstance(Date.today(), Time.newInstance(0, 0, 0, 0));
        Datetime hoyFin = hoyIni.addDays(1);
        out.tabSenalamientos = [SELECT COUNT() FROM Event
            WHERE Es_un_se_alamiento_legal__c = 'Si'
              AND StartDateTime < :hoyFin AND EndDateTime >= :hoyIni];
        // Ausentes hoy: mismas ausencias que la pestaña Ausencias Equipo filtrada por Hoy
        out.tabAusencias = new AusenciasSelector().enRango(Date.today(), Date.today()).size();
        // Teletrabajo hoy: empleados activos con el día de hoy entre sus días fijos
        // (0 = lunes; el 1/1/1900 fue lunes, no depende del locale). Fin de semana: 0
        Integer dow = Math.mod(Date.newInstance(1900, 1, 1).daysBetween(Date.today()), 7);
        List<String> DIAS_TEL = new List<String>{ 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes' };
        if (dow < 5) {
            String hoyNombre = DIAS_TEL[dow];
            for (SFDC_Employee__c e : new EmpleadosSelector().activos()) {
                if (String.isBlank(e.D_as_fijos_teletrabajo__c)) continue;
                if (e.D_as_fijos_teletrabajo__c.split(';').contains(hoyNombre)) out.tabTeletrabajo++;
            }
        }
        // Accesos rápidos: notificaciones electrónicas pendientes e incidencias informáticas abiertas
        out.notifPendientes = [SELECT COUNT() FROM Notificaciones_electronicas__c
            WHERE Estado__c IN ('Puesta a disposición', 'Descargada')];
        out.incidAbiertas = [SELECT COUNT() FROM Auditor_a__c WHERE Estado__c = 'Abierto'];
        return out;
    }

    /**
     * Contadores del usuario conectado: mismas reglas que getResumen pero con
     * consultas filtradas por usuario, muchísimo más rápidas que los agregados
     * de tabla completa de todos los usuarios.
     */
    private static FilaDTO getMiResumen() {
        Id uid = UserInfo.getUserId();
        FilaDTO f = new FilaDTO();
        f.usuarioId = uid;
        f.nombre = UserInfo.getName();
        f.activo = true;

        // El total de cada objeto sale de sumar los grupos de su agregado por
        // ejercicio, sin un COUNT() aparte que repetiría la misma consulta
        for (AggregateResult ar : [
            SELECT Ejercicio__c ej, Periodicidad__c per, COUNT(Id) n FROM Contabilidad__c
            WHERE Estado__c = 'Pendiente' AND Asesor_responsable__c = :uid
            GROUP BY Ejercicio__c, Periodicidad__c]) {
            Integer n = (Integer) ar.get('n');
            f.contabilidades += n;
            if (contabVencida((String) ar.get('ej'), (String) ar.get('per'))) {
                f.contabVencidas += n;
            }
        }
        for (AggregateResult ar : [
            SELECT Ejercicio__c ej, COUNT(Id) n FROM Precierre_Contable__c
            WHERE Estado__c NOT IN :CERRADOS_PRECIERRE AND OwnerId = :uid GROUP BY Ejercicio__c]) {
            Integer n = (Integer) ar.get('n');
            f.precierres += n;
            if (precierreVencido((String) ar.get('ej'))) f.precVencidos += n;
        }
        for (AggregateResult ar : [
            SELECT Ejercicio__c ej, COUNT(Id) n FROM Cierre_Contable__c
            WHERE Estado__c NOT IN :CERRADOS_CIERRE AND OwnerId = :uid GROUP BY Ejercicio__c]) {
            Integer n = (Integer) ar.get('n');
            f.cierres += n;
            if (cierreVencido((String) ar.get('ej'))) f.cierVencidos += n;
        }
        for (AggregateResult ar : [
            SELECT Ejercicio__c ej, COUNT(Id) n FROM Libros__c
            WHERE Estado__c NOT IN :CERRADOS_LIBROS AND OwnerId = :uid GROUP BY Ejercicio__c]) {
            Integer n = (Integer) ar.get('n');
            f.libros += n;
            if (cierreVencido((String) ar.get('ej'))) f.librosVencidos += n;
        }
        for (AggregateResult ar : [
            SELECT Ejercicio__c ej, COUNT(Id) n FROM Cuentas_Anuales__c
            WHERE Estado__c NOT IN :CERRADOS_CUENTAS AND OwnerId = :uid GROUP BY Ejercicio__c]) {
            Integer n = (Integer) ar.get('n');
            f.cuentas += n;
            if (cuentasVencida((String) ar.get('ej'))) f.cuentasVencidas += n;
        }
        f.rentas = [SELECT COUNT() FROM Renta__c
            WHERE Estado_Renta__c NOT IN :CERRADOS_RENTA AND OwnerId = :uid];
        f.expedientes = [SELECT COUNT() FROM Proyecto__c
            WHERE Estado__c NOT IN :CERRADOS_PROYECTO AND OwnerId = :uid];
        f.casos = [SELECT COUNT() FROM Case WHERE IsClosed = false AND OwnerId = :uid];
        f.contratos = [SELECT COUNT() FROM Contrato_Contabilidad_y_Fiscal__c
            WHERE Estado__c = 'Abierto' AND Asesor_responsable__c = :uid];
        f.tareas = [SELECT COUNT() FROM Task
            WHERE IsClosed = false AND ActivityDate <= :Date.today() AND OwnerId = :uid];
        f.oportunidades = [SELECT COUNT() FROM Opportunity
            WHERE IsClosed = false AND OwnerId = :uid];
        f.oppVencidas = [SELECT COUNT() FROM Opportunity
            WHERE IsClosed = false AND OwnerId = :uid AND CloseDate < :Date.today()];
        // Mis vencimientos legales: mismas reglas que la pestaña Vencimientos legales
        f.vencimientos = [SELECT COUNT() FROM Task
            WHERE IsClosed = false AND OwnerId = :uid AND Vencimiento_Legal__c != null
              AND Es_un_se_alamiento_legal__c != 'Si'];
        f.vencVencidos = [SELECT COUNT() FROM Task
            WHERE IsClosed = false AND OwnerId = :uid AND Vencimiento_Legal__c != null
              AND Vencimiento_Legal__c < :Date.today() AND Es_un_se_alamiento_legal__c != 'Si'];
        f.buzon = [SELECT COUNT() FROM Buzon_contable__c
            WHERE Estado__c != 'Contabilizado'
              AND Contrato_Contabilidad_y_Fiscal__r.Asesor_responsable__c = :uid];
        // Mis leads: mismos criterios que la pestaña Leads, solo los que tengo como propietario
        f.leads = [SELECT COUNT() FROM Lead
            WHERE IsConverted = false AND Status IN :LEAD_ESTADOS_ABIERTOS AND OwnerId = :uid];
        f.total = f.contabilidades + f.precierres + f.cierres + f.libros
                + f.cuentas + f.rentas + f.expedientes + f.casos;
        return f;
    }

    @AuraEnabled
    public static List<FilaDTO> getResumen() {
        Map<Id, Map<String, Integer>> porUsuario = new Map<Id, Map<String, Integer>>();

        // Contabilidad__c es detalle de una maestro-detalle y no tiene propietario:
        // se usa el asesor responsable como usuario asignado. Solo cuentan las pendientes.
        acumular(porUsuario, 'contabilidades', [
            SELECT Asesor_responsable__c o, COUNT(Id) n FROM Contabilidad__c
            WHERE Estado__c = 'Pendiente' GROUP BY Asesor_responsable__c]);
        // De ellas, cuántas están vencidas según su año y periodicidad
        for (AggregateResult ar : [
            SELECT Asesor_responsable__c o, Ejercicio__c ej, Periodicidad__c per, COUNT(Id) n
            FROM Contabilidad__c WHERE Estado__c = 'Pendiente'
            GROUP BY Asesor_responsable__c, Ejercicio__c, Periodicidad__c]) {
            if (!contabVencida((String) ar.get('ej'), (String) ar.get('per'))) continue;
            Id ownerId = (Id) ar.get('o');
            if (ownerId == null || String.valueOf(ownerId).startsWith('00G')) continue;
            if (!porUsuario.containsKey(ownerId)) porUsuario.put(ownerId, new Map<String, Integer>());
            Map<String, Integer> c = porUsuario.get(ownerId);
            c.put('contabVencidas', valor(c, 'contabVencidas') + (Integer) ar.get('n'));
        }
        acumular(porUsuario, 'precierres', [
            SELECT OwnerId o, COUNT(Id) n FROM Precierre_Contable__c
            WHERE Estado__c NOT IN :CERRADOS_PRECIERRE GROUP BY OwnerId]);
        // De ellos, cuántos están vencidos según su ejercicio
        for (AggregateResult ar : [
            SELECT OwnerId o, Ejercicio__c ej, COUNT(Id) n
            FROM Precierre_Contable__c WHERE Estado__c NOT IN :CERRADOS_PRECIERRE
            GROUP BY OwnerId, Ejercicio__c]) {
            if (!precierreVencido((String) ar.get('ej'))) continue;
            Id ownerId = (Id) ar.get('o');
            if (ownerId == null || String.valueOf(ownerId).startsWith('00G')) continue;
            if (!porUsuario.containsKey(ownerId)) porUsuario.put(ownerId, new Map<String, Integer>());
            Map<String, Integer> c = porUsuario.get(ownerId);
            c.put('precVencidos', valor(c, 'precVencidos') + (Integer) ar.get('n'));
        }
        acumular(porUsuario, 'cierres', [
            SELECT OwnerId o, COUNT(Id) n FROM Cierre_Contable__c
            WHERE Estado__c NOT IN :CERRADOS_CIERRE GROUP BY OwnerId]);
        // De ellos, cuántos están vencidos según su ejercicio
        for (AggregateResult ar : [
            SELECT OwnerId o, Ejercicio__c ej, COUNT(Id) n
            FROM Cierre_Contable__c WHERE Estado__c NOT IN :CERRADOS_CIERRE
            GROUP BY OwnerId, Ejercicio__c]) {
            if (!cierreVencido((String) ar.get('ej'))) continue;
            Id ownerId = (Id) ar.get('o');
            if (ownerId == null || String.valueOf(ownerId).startsWith('00G')) continue;
            if (!porUsuario.containsKey(ownerId)) porUsuario.put(ownerId, new Map<String, Integer>());
            Map<String, Integer> c = porUsuario.get(ownerId);
            c.put('cierVencidos', valor(c, 'cierVencidos') + (Integer) ar.get('n'));
        }
        acumular(porUsuario, 'libros', [
            SELECT OwnerId o, COUNT(Id) n FROM Libros__c
            WHERE Estado__c NOT IN :CERRADOS_LIBROS GROUP BY OwnerId]);
        // De ellos, cuántos están vencidos según su ejercicio (misma regla que los cierres)
        for (AggregateResult ar : [
            SELECT OwnerId o, Ejercicio__c ej, COUNT(Id) n
            FROM Libros__c WHERE Estado__c NOT IN :CERRADOS_LIBROS
            GROUP BY OwnerId, Ejercicio__c]) {
            if (!cierreVencido((String) ar.get('ej'))) continue;
            Id ownerId = (Id) ar.get('o');
            if (ownerId == null || String.valueOf(ownerId).startsWith('00G')) continue;
            if (!porUsuario.containsKey(ownerId)) porUsuario.put(ownerId, new Map<String, Integer>());
            Map<String, Integer> c = porUsuario.get(ownerId);
            c.put('librosVencidos', valor(c, 'librosVencidos') + (Integer) ar.get('n'));
        }
        acumular(porUsuario, 'cuentas', [
            SELECT OwnerId o, COUNT(Id) n FROM Cuentas_Anuales__c
            WHERE Estado__c NOT IN :CERRADOS_CUENTAS GROUP BY OwnerId]);
        // De ellas, cuántas están vencidas según su ejercicio
        for (AggregateResult ar : [
            SELECT OwnerId o, Ejercicio__c ej, COUNT(Id) n
            FROM Cuentas_Anuales__c WHERE Estado__c NOT IN :CERRADOS_CUENTAS
            GROUP BY OwnerId, Ejercicio__c]) {
            if (!cuentasVencida((String) ar.get('ej'))) continue;
            Id ownerId = (Id) ar.get('o');
            if (ownerId == null || String.valueOf(ownerId).startsWith('00G')) continue;
            if (!porUsuario.containsKey(ownerId)) porUsuario.put(ownerId, new Map<String, Integer>());
            Map<String, Integer> c = porUsuario.get(ownerId);
            c.put('cuentasVencidas', valor(c, 'cuentasVencidas') + (Integer) ar.get('n'));
        }
        acumular(porUsuario, 'rentas', [
            SELECT OwnerId o, COUNT(Id) n FROM Renta__c
            WHERE Estado_Renta__c NOT IN :CERRADOS_RENTA GROUP BY OwnerId]);
        acumular(porUsuario, 'expedientes', [
            SELECT OwnerId o, COUNT(Id) n FROM Proyecto__c
            WHERE Estado__c NOT IN :CERRADOS_PROYECTO GROUP BY OwnerId]);
        acumular(porUsuario, 'casos', [
            SELECT OwnerId o, COUNT(Id) n FROM Case
            WHERE IsClosed = false GROUP BY OwnerId]);
        // Contratos contables y fiscales abiertos donde el usuario es el asesor responsable
        acumular(porUsuario, 'contratos', [
            SELECT Asesor_responsable__c o, COUNT(Id) n FROM Contrato_Contabilidad_y_Fiscal__c
            WHERE Estado__c = 'Abierto' GROUP BY Asesor_responsable__c]);
        // Tareas abiertas con fecha de vencimiento hasta hoy
        acumular(porUsuario, 'tareas', [
            SELECT OwnerId o, COUNT(Id) n FROM Task
            WHERE IsClosed = false AND ActivityDate <= :Date.today() GROUP BY OwnerId]);
        // Oportunidades abiertas con el usuario como propietario
        acumular(porUsuario, 'oportunidades', [
            SELECT OwnerId o, COUNT(Id) n FROM Opportunity
            WHERE IsClosed = false GROUP BY OwnerId]);
        // Buzón contable pendiente, asignado al asesor responsable del contrato
        acumular(porUsuario, 'buzon', [
            SELECT Contrato_Contabilidad_y_Fiscal__r.Asesor_responsable__c o, COUNT(Id) n
            FROM Buzon_contable__c
            WHERE Estado__c != 'Contabilizado' AND Contrato_Contabilidad_y_Fiscal__c != null
            GROUP BY Contrato_Contabilidad_y_Fiscal__r.Asesor_responsable__c]);

        // Ficha de usuario: empresa titular, departamento asignado y si está activo
        Map<Id, User> usuarios = new Map<Id, User>([
            SELECT Id, Name, IsActive, Empresa_Titular__c, Departamento__c
            FROM User WHERE Id IN :porUsuario.keySet()
        ]);

        List<FilaDTO> out = new List<FilaDTO>();
        for (Id uid : porUsuario.keySet()) {
            User u = usuarios.get(uid);
            if (u == null) continue;
            Map<String, Integer> c = porUsuario.get(uid);
            FilaDTO f = new FilaDTO();
            f.usuarioId = uid;
            f.nombre = u.Name;
            f.empresaTitular = u.Empresa_Titular__c;
            f.departamento = u.Departamento__c;
            f.activo = u.IsActive;
            f.contabilidades = valor(c, 'contabilidades');
            f.precierres = valor(c, 'precierres');
            f.cierres = valor(c, 'cierres');
            f.libros = valor(c, 'libros');
            f.cuentas = valor(c, 'cuentas');
            f.rentas = valor(c, 'rentas');
            f.expedientes = valor(c, 'expedientes');
            f.casos = valor(c, 'casos');
            f.contratos = valor(c, 'contratos');
            f.tareas = valor(c, 'tareas');
            f.buzon = valor(c, 'buzon');
            f.oportunidades = valor(c, 'oportunidades');
            f.contabVencidas = valor(c, 'contabVencidas');
            f.precVencidos = valor(c, 'precVencidos');
            f.cierVencidos = valor(c, 'cierVencidos');
            f.librosVencidos = valor(c, 'librosVencidos');
            f.cuentasVencidas = valor(c, 'cuentasVencidas');
            f.total = f.contabilidades + f.precierres + f.cierres + f.libros
                    + f.cuentas + f.rentas + f.expedientes + f.casos;
            out.add(f);
        }

        // Orden alfabético por nombre de usuario
        List<FilaDTO> ordenadas = new List<FilaDTO>(out);
        Map<String, FilaDTO> porClave = new Map<String, FilaDTO>();
        List<String> claves = new List<String>();
        for (FilaDTO f : out) {
            String k = f.nombre + '·' + f.usuarioId;
            porClave.put(k, f);
            claves.add(k);
        }
        claves.sort();
        ordenadas.clear();
        for (String k : claves) ordenadas.add(porClave.get(k));
        return ordenadas;
    }

    /**
     * Contabilidades en estado Pendiente para la pestaña Contabilidad y/o Consultoría.
     * Los colores de los semáforos salen del alt de las fórmulas IMAGE del org;
     * el valor "En agregador bancario" se muestra en azul como en la vista de lista.
     */
    @AuraEnabled
    public static List<ContabDTO> getContabilidadesAbiertas() {
        List<ContabDTO> out = new List<ContabDTO>();
        for (Contabilidad__c c : [
            SELECT Name, CreatedDate, Ejercicio__c, Periodicidad__c, Empresa__c, Empresa__r.Name,
                   Empresa__r.Grupo_Empresarial__r.Name, Contacto__r.Name,
                   toLabel(Tipo_de_servicio_contable_y_fiscal__c),
                   Asesor_responsable__c, Asesor_responsable__r.Name, Asesor_responsable__r.Empresa_Titular__c,
                   Facturas_Emitidas__c, Facturas_Recibidas__c, Bancos__c,
                   Checklist_color__c, Total_Checklist__c, Total_Checklist_Completadas__c,
                   Recepci_n_F_Emitidas__c, Recepci_n_F_Recibidas__c, Recepci_n_bancos__c
            FROM Contabilidad__c
            WHERE Estado__c = 'Pendiente'
            ORDER BY CreatedDate ASC
        ]) {
            ContabDTO dto = new ContabDTO();
            dto.id = c.Id;
            dto.numero = c.Name;
            dto.fecha = c.CreatedDate.date();
            dto.ejercicio = c.Ejercicio__c;
            dto.periodicidad = c.Periodicidad__c;
            dto.empresaId = c.Empresa__c;
            dto.empresa = c.Empresa__r == null ? null : c.Empresa__r.Name;
            dto.grupo = c.Empresa__r == null || c.Empresa__r.Grupo_Empresarial__r == null
                ? null : c.Empresa__r.Grupo_Empresarial__r.Name;
            dto.contacto = c.Contacto__r == null ? null : c.Contacto__r.Name;
            dto.tipoServicio = c.Tipo_de_servicio_contable_y_fiscal__c;
            dto.asesorId = c.Asesor_responsable__c;
            dto.asesor = c.Asesor_responsable__r == null ? null : c.Asesor_responsable__r.Name;
            dto.empresaTitularUsuario = c.Asesor_responsable__r == null ? null : c.Asesor_responsable__r.Empresa_Titular__c;
            // El color sale del propio picklist, no del alt de las fórmulas de imagen
            // (que puede diferir entre orgs): así pinta igual en sandbox y producción
            dto.emitColor = colorEstadoContab(c.Facturas_Emitidas__c);
            dto.recColor = colorEstadoContab(c.Facturas_Recibidas__c);
            dto.banColor = colorEstadoContab(c.Bancos__c);
            dto.chkColor = colorSemaforo(c.Checklist_color__c);
            dto.checklist = entero(c.Total_Checklist_Completadas__c) + '/' + entero(c.Total_Checklist__c);
            dto.emitRecep = c.Recepci_n_F_Emitidas__c;
            dto.recRecep = c.Recepci_n_F_Recibidas__c;
            dto.banRecep = c.Recepci_n_bancos__c;
            out.add(dto);
        }
        return out;
    }

    /**
     * Precierres contables abiertos (Sin revisar o En curso) para la pestaña
     * Precierres contables.
     */
    @AuraEnabled
    public static List<RegistroDTO> getPrecierresAbiertos() {
        List<Precierre_Contable__c> registros = [
            SELECT Name, Empresa__c, Empresa__r.Name, Empresa__r.Grupo_Empresarial__r.Name,
                   toLabel(Ejercicio__c), Asesor_responsable__c, Asesor_responsable__r.Name,
                   Asesor_responsable__r.Empresa_Titular__c, Estado__c
            FROM Precierre_Contable__c
            WHERE Estado__c IN ('Sin revisar', 'En curso')
            ORDER BY CreatedDate ASC
        ];
        List<RegistroDTO> out = mapRegistros(registros, 'Asesor_responsable__c', 'Asesor_responsable__r');
        // Ejercicio del precierre y grupo empresarial de la ficha de la empresa
        for (Integer i = 0; i < registros.size(); i++) {
            out[i].ejercicio = registros[i].Ejercicio__c;
            out[i].grupo = registros[i].Empresa__r == null
                || registros[i].Empresa__r.Grupo_Empresarial__c == null
                ? null : registros[i].Empresa__r.Grupo_Empresarial__r.Name;
        }
        return out;
    }

    /**
     * Cierres contables abiertos (todo lo no Completado) para la pestaña
     * Cierres Contables. El estado viaja con su etiqueta (Pendiente se
     * muestra como "Sin comenzar").
     */
    @AuraEnabled
    public static List<RegistroDTO> getCierresAbiertos() {
        List<Cierre_Contable__c> registros = [
            SELECT Name, Empresa__c, Empresa__r.Name, Empresa__r.Grupo_Empresarial__r.Name,
                   toLabel(Ejercicio__c), Asesor__c, Asesor__r.Name,
                   Asesor__r.Empresa_Titular__c, toLabel(Estado__c)
            FROM Cierre_Contable__c
            WHERE Estado__c NOT IN :CERRADOS_CIERRE
            ORDER BY CreatedDate ASC
        ];
        List<RegistroDTO> out = mapRegistros(registros, 'Asesor__c', 'Asesor__r');
        // Ejercicio del cierre y grupo empresarial de la ficha de la empresa
        for (Integer i = 0; i < registros.size(); i++) {
            out[i].ejercicio = registros[i].Ejercicio__c;
            out[i].grupo = registros[i].Empresa__r == null
                || registros[i].Empresa__r.Grupo_Empresarial__c == null
                ? null : registros[i].Empresa__r.Grupo_Empresarial__r.Name;
        }
        return out;
    }

    /**
     * Libros contables no cerrados para la pestaña Libros Contables. El estado
     * viaja con su etiqueta (Sin comenzar se muestra como "Cierre pendiente").
     */
    @AuraEnabled
    public static List<RegistroDTO> getLibrosAbiertos() {
        List<Libros__c> registros = [
            SELECT Name, Empresa__c, Empresa__r.Name, Empresa__r.Grupo_Empresarial__r.Name,
                   toLabel(Ejercicio__c), Asesor__c, Asesor__r.Name,
                   Asesor__r.Empresa_Titular__c, toLabel(Estado__c)
            FROM Libros__c
            WHERE Estado__c != 'Cerrado'
            ORDER BY CreatedDate ASC
        ];
        List<RegistroDTO> out = mapRegistros(registros, 'Asesor__c', 'Asesor__r');
        // Ejercicio del libro y grupo empresarial de la ficha de la empresa
        for (Integer i = 0; i < registros.size(); i++) {
            out[i].ejercicio = registros[i].Ejercicio__c;
            out[i].grupo = registros[i].Empresa__r == null
                || registros[i].Empresa__r.Grupo_Empresarial__c == null
                ? null : registros[i].Empresa__r.Grupo_Empresarial__r.Name;
        }
        return out;
    }

    /**
     * Cuentas anuales no cerradas para la pestaña Cuentas anuales. El estado
     * viaja con su etiqueta (Sin comenzar se muestra como "Cierre pendiente").
     */
    @AuraEnabled
    public static List<RegistroDTO> getCuentasAbiertas() {
        List<Cuentas_Anuales__c> registros = [
            SELECT Name, Empresa__c, Empresa__r.Name, Empresa__r.Grupo_Empresarial__r.Name,
                   toLabel(Ejercicio__c), Asesor__c, Asesor__r.Name,
                   Asesor__r.Empresa_Titular__c, toLabel(Estado__c)
            FROM Cuentas_Anuales__c
            WHERE Estado__c != 'Cerrado'
            ORDER BY CreatedDate ASC
        ];
        List<RegistroDTO> out = mapRegistros(registros, 'Asesor__c', 'Asesor__r');
        // Ejercicio de la cuenta y grupo empresarial de la ficha de la empresa
        for (Integer i = 0; i < registros.size(); i++) {
            out[i].ejercicio = registros[i].Ejercicio__c;
            out[i].grupo = registros[i].Empresa__r == null
                || registros[i].Empresa__r.Grupo_Empresarial__c == null
                ? null : registros[i].Empresa__r.Grupo_Empresarial__r.Name;
        }
        return out;
    }

    /**
     * Rentas no cerradas para la pestaña Rentas. El cliente del listado es el
     * declarante de la renta.
     */
    @AuraEnabled
    public static List<RegistroDTO> getRentasAbiertas() {
        return mapRegistros([
            SELECT Name, Declarante__c, Declarante__r.Name, Asesor__c, Asesor__r.Name,
                   Asesor__r.Empresa_Titular__c, toLabel(Estado_Renta__c)
            FROM Renta__c
            WHERE Estado_Renta__c NOT IN :CERRADOS_RENTA
            ORDER BY CreatedDate ASC
        ], 'Asesor__c', 'Asesor__r', 'Declarante__c', 'Declarante__r', 'Estado_Renta__c');
    }

    public class VencDiaDTO {
        @AuraEnabled public Date    fecha;
        @AuraEnabled public Integer n = 0;
        @AuraEnabled public Integer s = 0;
    }

    public class VencimientosDTO {
        @AuraEnabled public List<VencDiaDTO> dias;
        @AuraEnabled public Integer sinPresentar = 0;   // vencimiento legal anterior a hoy
        @AuraEnabled public Integer vencidasOHoy = 0;   // vencimiento legal hasta hoy incluido (contador de la pestaña)
        @AuraEnabled public Integer senalamientos = 0;
    }

    /**
     * Vencimientos legales de expedientes: tareas abiertas con Vto. Legal
     * informado, de cualquier usuario, que no son señalamientos legales.
     * Devuelve los 14 días de la semana actual y la siguiente más el total
     * vencido sin presentar (anterior a hoy).
     */
    @AuraEnabled
    public static VencimientosDTO getVencimientosLegales() {
        Date hoy = Date.today();
        // Lunes de la semana actual (el 1/1/1900 fue lunes; no depende del locale)
        Date lunes = hoy.addDays(-Math.mod(Date.newInstance(1900, 1, 1).daysBetween(hoy), 7));
        Date fin = lunes.addDays(13);

        // Una sola pasada por las tareas abiertas con vencimiento legal, agrupadas por
        // fecha: de ahí salen el calendario de los 14 días, las vencidas sin presentar
        // (anteriores a hoy) y las vencidas o de hoy. Antes eran tres recorridos completos
        // del objeto Tarea, que con 84.000 filas no usa índice para ninguno de estos filtros.
        Map<Date, Integer> porDia = new Map<Date, Integer>();
        Integer sinPresentar = 0;
        Integer vencidasOHoy = 0;
        for (AggregateResult ar : [
            SELECT Vencimiento_Legal__c d, COUNT(Id) n FROM Task
            WHERE IsClosed = false
              AND Vencimiento_Legal__c != null
              AND Es_un_se_alamiento_legal__c != 'Si'
            GROUP BY Vencimiento_Legal__c
        ]) {
            Date d = (Date) ar.get('d');
            Integer n = (Integer) ar.get('n');
            if (d < hoy) sinPresentar += n;
            if (d <= hoy) vencidasOHoy += n;
            if (d >= lunes && d <= fin) porDia.put(d, n);
        }

        // Señalamientos legales: eventos de calendario marcados como tales;
        // cuentan en cada día que cubre su rango de fecha inicio - fecha fin
        Map<Date, Integer> senalPorDia = new Map<Date, Integer>();
        Integer senPorDelante = 0;
        Datetime desde = Datetime.newInstance(lunes, Time.newInstance(0, 0, 0, 0));
        Datetime hasta = Datetime.newInstance(fin.addDays(1), Time.newInstance(0, 0, 0, 0));
        for (Event ev : [
            SELECT StartDateTime, EndDateTime FROM Event
            WHERE Es_un_se_alamiento_legal__c = 'Si'
              AND StartDateTime < :hasta AND EndDateTime >= :desde
        ]) {
            Date d = ev.StartDateTime.date() < lunes ? lunes : ev.StartDateTime.date();
            Date tope = ev.EndDateTime.date() > fin ? fin : ev.EndDateTime.date();
            // Señalamientos por delante: eventos que siguen vivos de hoy en adelante
            if (tope >= hoy) senPorDelante++;
            while (d <= tope) {
                senalPorDia.put(d, (senalPorDia.containsKey(d) ? senalPorDia.get(d) : 0) + 1);
                d = d.addDays(1);
            }
        }

        VencimientosDTO out = new VencimientosDTO();
        out.senalamientos = senPorDelante;
        out.dias = new List<VencDiaDTO>();
        for (Integer i = 0; i < 14; i++) {
            VencDiaDTO dia = new VencDiaDTO();
            dia.fecha = lunes.addDays(i);
            dia.n = porDia.containsKey(dia.fecha) ? porDia.get(dia.fecha) : 0;
            dia.s = senalPorDia.containsKey(dia.fecha) ? senalPorDia.get(dia.fecha) : 0;
            out.dias.add(dia);
        }
        out.sinPresentar = sinPresentar;
        out.vencidasOHoy = vencidasOHoy;
        return out;
    }

    public class VencTareaDTO {
        @AuraEnabled public Id     id;
        @AuraEnabled public Date   fecha;
        @AuraEnabled public String asunto;
        @AuraEnabled public Id     empresaId;
        @AuraEnabled public String empresa;
        @AuraEnabled public Id     asesorId;
        @AuraEnabled public String asesor;
        @AuraEnabled public Id     expedienteId;
        @AuraEnabled public String expedienteNum;
        @AuraEnabled public String titulo;
        @AuraEnabled public String contratoFiscal;
        @AuraEnabled public String contratoLaboral;
        @AuraEnabled public String empresaTitularUsuario; // de la ficha del usuario asignado
    }

    /**
     * Listado de tareas de vencimiento legal (misma lógica que el calendario),
     * ordenadas por fecha de vencimiento ascendente. La empresa, el expediente
     * y su título salen del registro relacionado (expediente o certificado
     * digital con su expediente origen).
     */
    @AuraEnabled
    public static List<VencTareaDTO> getVencimientosLegalesLista() {
        List<Task> tareas = [
            SELECT Id, Subject, Vencimiento_Legal__c, OwnerId, Owner.Name, WhatId, What.Type
            FROM Task
            WHERE IsClosed = false
              AND Vencimiento_Legal__c != null
              AND Es_un_se_alamiento_legal__c != 'Si'
            ORDER BY Vencimiento_Legal__c ASC
        ];

        Set<Id> proyIds = new Set<Id>();
        Set<Id> certIds = new Set<Id>();
        for (Task t : tareas) {
            if (t.WhatId == null) continue;
            if (String.valueOf(t.What.Type) == 'Proyecto__c') proyIds.add(t.WhatId);
            if (String.valueOf(t.What.Type) == 'Certificados_Digitales__c') certIds.add(t.WhatId);
        }
        Map<Id, Proyecto__c> proyectos = new Map<Id, Proyecto__c>([
            SELECT Id, Name, T_tulo_del_Expediente__c, Empresa_Cliente__c, Empresa_Cliente__r.Name,
                   Empresa_Cliente__r.Contrato_fiscal__c, Empresa_Cliente__r.Contrato_laboral__c
            FROM Proyecto__c WHERE Id IN :proyIds
        ]);
        Map<Id, Certificados_Digitales__c> certificados = new Map<Id, Certificados_Digitales__c>([
            SELECT Id, Empresa__c, Empresa__r.Name, Empresa__r.Contrato_fiscal__c, Empresa__r.Contrato_laboral__c,
                   Expediente__c, Expediente__r.Name, Expediente__r.T_tulo_del_Expediente__c
            FROM Certificados_Digitales__c WHERE Id IN :certIds
        ]);
        // Empresa titular de la ficha de usuario de cada persona asignada
        Set<Id> ownerIds = new Set<Id>();
        for (Task t : tareas) ownerIds.add(t.OwnerId);
        Map<Id, User> usuarios = new Map<Id, User>([
            SELECT Empresa_Titular__c FROM User WHERE Id IN :ownerIds
        ]);

        List<VencTareaDTO> out = new List<VencTareaDTO>();
        for (Task t : tareas) {
            VencTareaDTO dto = new VencTareaDTO();
            dto.id = t.Id;
            dto.fecha = t.Vencimiento_Legal__c;
            dto.asunto = t.Subject;
            dto.asesorId = t.OwnerId;
            dto.asesor = t.Owner == null ? null : t.Owner.Name;
            User u = usuarios.get(t.OwnerId);
            dto.empresaTitularUsuario = u == null ? null : u.Empresa_Titular__c;
            Proyecto__c p = proyectos.get(t.WhatId);
            Certificados_Digitales__c cert = certificados.get(t.WhatId);
            if (p != null) {
                dto.expedienteId = p.Id;
                dto.expedienteNum = p.Name;
                dto.titulo = p.T_tulo_del_Expediente__c;
                dto.empresaId = p.Empresa_Cliente__c;
                dto.empresa = p.Empresa_Cliente__r == null ? null : p.Empresa_Cliente__r.Name;
                if (p.Empresa_Cliente__r != null) {
                    dto.contratoFiscal = estadoContrato(p.Empresa_Cliente__r.Contrato_fiscal__c);
                    dto.contratoLaboral = estadoContrato(p.Empresa_Cliente__r.Contrato_laboral__c);
                }
            } else if (cert != null) {
                dto.empresaId = cert.Empresa__c;
                dto.empresa = cert.Empresa__r == null ? null : cert.Empresa__r.Name;
                if (cert.Empresa__r != null) {
                    dto.contratoFiscal = estadoContrato(cert.Empresa__r.Contrato_fiscal__c);
                    dto.contratoLaboral = estadoContrato(cert.Empresa__r.Contrato_laboral__c);
                }
                if (cert.Expediente__c != null) {
                    dto.expedienteId = cert.Expediente__c;
                    dto.expedienteNum = cert.Expediente__r.Name;
                    dto.titulo = cert.Expediente__r.T_tulo_del_Expediente__c;
                }
            }
            out.add(dto);
        }
        return out;
    }

    // Suma un contador en el mapa por empresa (creando la entrada si no existe)
    private static void sumarEmpresa(Map<Id, Map<String, Integer>> porEmpresa, Id emp, String campo, Integer n) {
        if (emp == null) return;
        if (!porEmpresa.containsKey(emp)) porEmpresa.put(emp, new Map<String, Integer>());
        Map<String, Integer> c = porEmpresa.get(emp);
        c.put(campo, valor(c, campo) + n);
    }

    // Tipos de PDF que el componente puede guardar, cada uno con su Documento y su página Visualforce
    private static final Map<String, String> PDF_TIPOS = new Map<String, String>{
        'Catalogo_Modelos' => 'Catálogo de modelos (HTML para el PDF)',
        'Reglas_Incidencias' => 'Reglas de incidencias (HTML para el PDF)'
    };

    /** Compatibilidad: el Catálogo modelos llama al método general con su tipo */
    @AuraEnabled
    public static Id guardarCatalogoHtml(String html) {
        return guardarHtmlPdf(html, 'Catalogo_Modelos');
    }

    /**
     * Guarda el cuerpo HTML de un PDF del área (construido por el componente tal y como se ve) en
     * un Documento personal del usuario, uno por tipo, que se sobrescribe en cada exportación para
     * no acumular copias, y devuelve su Id. Las páginas Visualforce renderAs="pdf"
     * (CatalogoModelosPdf, ReglasIncidenciasPdf) lo leen con ?d=<Id> y le ponen su CSS.
     * El documento se localiza por nombre y carpeta, no por su nombre único: Salesforce reserva
     * los nombres únicos ya usados (incluso borrados), así que el nuevo lleva marca de tiempo.
     */
    @AuraEnabled
    public static Id guardarHtmlPdf(String html, String tipo) {
        if (String.isBlank(html)) throw new AuraHandledException('No hay contenido que exportar');
        if (tipo == null || !PDF_TIPOS.containsKey(tipo)) throw new AuraHandledException('Tipo de PDF no reconocido: ' + tipo);
        Id uid = UserInfo.getUserId();
        String nombre = PDF_TIPOS.get(tipo);
        String prefijo = 'ACF_' + tipo + '_';
        String patron = prefijo + '%';
        List<Document> previos = [
            SELECT Id FROM Document
            WHERE Name = :nombre AND FolderId = :uid AND AuthorId = :uid AND DeveloperName LIKE :patron
            ORDER BY LastModifiedDate DESC LIMIT 1
        ];
        Document d = previos.isEmpty() ? new Document() : previos[0];
        d.Name = nombre;
        if (d.Id == null) d.DeveloperName = prefijo + String.valueOf(uid) + '_' + String.valueOf(Datetime.now().getTime());
        d.FolderId = uid; // carpeta personal del usuario
        d.ContentType = 'text/html';
        d.Type = 'html';
        d.Description = 'Generado por el Área contable y fiscal el ' + Datetime.now().format('dd/MM/yyyy HH:mm')
            + '. Se sobrescribe en cada exportación.';
        d.Body = Blob.valueOf(html);
        upsert d;
        return d.Id;
    }

    public class ContratoCFDTO {
        @AuraEnabled public Id      id;
        @AuraEnabled public String  numero;
        @AuraEnabled public Id      empresaId;
        @AuraEnabled public String  empresa;
        @AuraEnabled public String  grupo;
        @AuraEnabled public Id      asesorId;
        @AuraEnabled public String  asesor;
        @AuraEnabled public String  tipoEmpresa;
        @AuraEnabled public String  censo; // Situación Censal AEAT (Activa/Inactiva)
        @AuraEnabled public String  tipoServicio;
        @AuraEnabled public String  gradoDificultad;
        @AuraEnabled public String  empresaTitularGestion;
        // Visión tecnológica del contrato
        @AuraEnabled public String  softwareFacturacion;   // Software facturas emitidas del cliente
        @AuraEnabled public String  contabEnErp;           // ¿Contabilidad en el ERP del despacho?
        @AuraEnabled public String  accesoPortal;          // Acceso Portal del despacho
        @AuraEnabled public String  codigoErp;             // Código ERP del despacho
        @AuraEnabled public String  recepEmitidas;
        @AuraEnabled public String  recepRecibidas;
        @AuraEnabled public String  recepBancos;
        @AuraEnabled public String  hojaCaja;              // ¿Tiene hoja de caja?
        // Visión fiscal (Control interno)
        @AuraEnabled public String  territorioFiscal;         // Territorio fiscal
        @AuraEnabled public String  operadorIntracomunitario; // ¿Operador intracomunitario? (Si / No)
        @AuraEnabled public String  consolidacionFiscal;      // Consolidación fiscal (Si / No)
        @AuraEnabled public String  posicionConsolidacion;    // Posición en la consolidación (Matriz / Dependiente)
        @AuraEnabled public String  comienzoEjercicio;        // Comienzo ejercicio fiscal (mes)
        @AuraEnabled public String  modalidadEstimacion;      // Modalidad Estimación (Tipo_de_regimen__c)
        @AuraEnabled public Integer contabilidades = 0;
        @AuraEnabled public Integer precierres = 0;
        @AuraEnabled public Integer cierres = 0;
        @AuraEnabled public Integer libros = 0;
        @AuraEnabled public Integer cuentas = 0;
        @AuraEnabled public Integer rentas = 0;
        @AuraEnabled public Integer expedientes = 0;
        @AuraEnabled public Integer casos = 0;
        @AuraEnabled public Integer tareas = 0;
        @AuraEnabled public Integer contabVencidas = 0;
        @AuraEnabled public Integer precVencidos = 0;
        @AuraEnabled public Integer cierVencidos = 0;
        @AuraEnabled public Integer librosVencidos = 0;
        @AuraEnabled public Integer cuentasVencidas = 0;
    }

    public class MesContratosDTO {
        @AuraEnabled public Integer anio;
        @AuraEnabled public Integer mes;
        @AuraEnabled public Integer n;
        @AuraEnabled public Integer activos = 0;    // de los vivos, con situación censal Activa
        @AuraEnabled public Integer inactivos = 0;  // de los vivos, con situación censal Inactiva (u otra)
    }

    public class ContratosMesesDTO {
        @AuraEnabled public Integer totalHoy;
        @AuraEnabled public Integer totalConsultoria;     // tipo de servicio Consultoría
        @AuraEnabled public Integer totalContableFiscal;  // tipo de servicio Asesoría (Contable y Fiscal)
        @AuraEnabled public Integer totalAsesores;        // asesores responsables distintos de los vivos hoy
        @AuraEnabled public List<MesContratosDTO> meses;
        @AuraEnabled public List<EmpresaContratosDTO> porTitular;     // vivos hoy por empresa titular gestión
        @AuraEnabled public List<EmpresaContratosDTO> porFacturacion; // vivos hoy por empresa titular contrato (facturación)
        @AuraEnabled public List<EmpresaContratosDTO> porComercial;   // vivos hoy por empresa titular comercial
    }

    public class EmpresaContratosDTO {
        @AuraEnabled public String nombre;
        @AuraEnabled public Integer n;
    }

    /**
     * Contratos contables y fiscales para la cabecera de la pestaña: la serie
     * de 12 meses va siempre fija con todos los contratos; las cuatro cajas y
     * los repartos por titular facturación y comercial se recalculan con los
     * filtros de titular gestión, asesor responsable y tipo de empresa; el
     * reparto por titular gestión aplica asesor y tipo pero no su propio
     * filtro, porque esas barras son el selector.
     */
    @AuraEnabled
    public static ContratosMesesDTO getContratosCFMeses(List<String> titulares, List<String> asesores, List<String> tipos) {
        Date hoy = Date.today();
        List<Contrato_Contabilidad_y_Fiscal__c> contratos = [
            SELECT Fecha_inicio_Contrato__c, Fecha_baja__c, Tipo_de_servicio__c,
                   Asesor_responsable__c, Empresa_titular__c, Tipo_de_Empresa__c,
                   Empresa_titular_origen__c, Empresa_titular_comercial__c, Tipo_de_Contrato__c
            FROM Contrato_Contabilidad_y_Fiscal__c
            WHERE Fecha_inicio_Contrato__c != null
            LIMIT 50000
        ];
        // Filtros activos (vacío = todos); las claves nulas casan con las del front
        Set<String> fTitular = (titulares == null || titulares.isEmpty()) ? null : new Set<String>(titulares);
        Set<String> fAsesor = (asesores == null || asesores.isEmpty()) ? null : new Set<String>(asesores);
        Set<String> fTipo = (tipos == null || tipos.isEmpty()) ? null : new Set<String>(tipos);
        // Base con asesor y tipo (para el gráfico de gestión) y, encima, el
        // titular de gestión (para las cajas y los otros dos gráficos)
        List<Contrato_Contabilidad_y_Fiscal__c> base = new List<Contrato_Contabilidad_y_Fiscal__c>();
        List<Contrato_Contabilidad_y_Fiscal__c> filtrados = new List<Contrato_Contabilidad_y_Fiscal__c>();
        for (Contrato_Contabilidad_y_Fiscal__c c : contratos) {
            String asesor = c.Asesor_responsable__c == null ? 'SIN' : String.valueOf(c.Asesor_responsable__c);
            if (fAsesor != null && !fAsesor.contains(asesor)) continue;
            String tipo = String.isBlank(c.Tipo_de_Empresa__c) ? 'Sin tipo' : c.Tipo_de_Empresa__c;
            if (fTipo != null && !fTipo.contains(tipo)) continue;
            base.add(c);
            String titular = String.isBlank(c.Empresa_titular__c)
                ? 'Sin empresa titular' : c.Empresa_titular__c;
            if (fTitular == null || fTitular.contains(titular)) filtrados.add(c);
        }

        ContratosMesesDTO out = new ContratosMesesDTO();
        // La evolución de 12 meses es fija: siempre todos los contratos, y solo
        // meses cerrados (el mes en curso no se muestra). Activos / inactivos según
        // la situación censal actual del contrato
        out.meses = new List<MesContratosDTO>();
        for (Integer i = 12; i >= 1; i--) {
            Date primero = hoy.toStartOfMonth().addMonths(-i);
            Date cierre = primero.addMonths(1).addDays(-1);
            MesContratosDTO m = new MesContratosDTO();
            m.anio = primero.year();
            m.mes = primero.month();
            m.n = 0;
            for (Contrato_Contabilidad_y_Fiscal__c c : contratos) {
                if (!contratoVivo(c, cierre)) continue;
                m.n++;
                if (c.Tipo_de_Contrato__c == 'Activa') m.activos++; else m.inactivos++;
            }
            out.meses.add(m);
        }
        // Totales de hoy sobre lo filtrado, con el reparto por tipo de servicio
        // (Consultoría se muestra como Consultoría y Asesoría como Contable y Fiscal)
        out.totalHoy = 0;
        out.totalConsultoria = 0;
        out.totalContableFiscal = 0;
        Set<Id> asesoresDistintos = new Set<Id>();
        Map<String, Integer> porFacturacion = new Map<String, Integer>();
        Map<String, Integer> porComercial = new Map<String, Integer>();
        for (Contrato_Contabilidad_y_Fiscal__c c : filtrados) {
            if (!contratoVivo(c, hoy)) continue;
            out.totalHoy++;
            if (c.Tipo_de_servicio__c == 'Consultoría') out.totalConsultoria++;
            else if (c.Tipo_de_servicio__c == 'Asesoría') out.totalContableFiscal++;
            if (c.Asesor_responsable__c != null) asesoresDistintos.add(c.Asesor_responsable__c);
            sumarTitular(porFacturacion, c.Empresa_titular_origen__c);
            sumarTitular(porComercial, c.Empresa_titular_comercial__c);
        }
        out.totalAsesores = asesoresDistintos.size();
        out.porFacturacion = listaPorTitular(porFacturacion);
        out.porComercial = listaPorTitular(porComercial);
        // Vivos hoy por empresa titular de gestión, con asesor y tipo pero sin
        // su propio filtro: estas barras son el selector
        Map<String, Integer> porTitular = new Map<String, Integer>();
        for (Contrato_Contabilidad_y_Fiscal__c c : base) {
            if (!contratoVivo(c, hoy)) continue;
            sumarTitular(porTitular, c.Empresa_titular__c);
        }
        out.porTitular = listaPorTitular(porTitular);
        return out;
    }

    private static void sumarTitular(Map<String, Integer> mapa, String valor) {
        String titular = String.isBlank(valor) ? 'Sin empresa titular' : valor;
        mapa.put(titular, (mapa.containsKey(titular) ? mapa.get(titular) : 0) + 1);
    }

    // Mapa de recuentos a lista ordenada alfabéticamente por nombre
    private static List<EmpresaContratosDTO> listaPorTitular(Map<String, Integer> mapa) {
        List<EmpresaContratosDTO> out = new List<EmpresaContratosDTO>();
        List<String> nombres = new List<String>(mapa.keySet());
        nombres.sort();
        for (String t : nombres) {
            EmpresaContratosDTO e = new EmpresaContratosDTO();
            e.nombre = t;
            e.n = mapa.get(t);
            out.add(e);
        }
        return out;
    }

    // Contratos vivos en una fecha: iniciados y sin baja anterior a esa fecha
    private static Integer contarContratosVivos(List<Contrato_Contabilidad_y_Fiscal__c> contratos, Date fecha) {
        Integer n = 0;
        for (Contrato_Contabilidad_y_Fiscal__c c : contratos) {
            if (contratoVivo(c, fecha)) n++;
        }
        return n;
    }

    private static Boolean contratoVivo(Contrato_Contabilidad_y_Fiscal__c c, Date fecha) {
        return c.Fecha_inicio_Contrato__c <= fecha
            && (c.Fecha_baja__c == null || c.Fecha_baja__c >= fecha);
    }

    public class ModeloOblDTO {
        @AuraEnabled public Id id;               // la obligación, para poder editarla
        @AuraEnabled public String modelo;
        @AuraEnabled public String periodicidad;
        @AuraEnabled public String presentacion; // quién presenta: Cliente / Despacho / Otro asesor
        @AuraEnabled public String software;     // software de preparación del impuesto
        @AuraEnabled public String territorio;
        @AuraEnabled public String modalidad;
        @AuraEnabled public String vencimientos; // calendario dd/mm;dd/mm de la fórmula
        @AuraEnabled public Date fechaAlta;
        @AuraEnabled public String observaciones;
        @AuraEnabled public String asesor; // asesor responsable de la obligación
        @AuraEnabled public Id asesorId;   // para poder cambiarlo desde la ficha
        @AuraEnabled public String asesorEmpresaTitular; // empresa titular del usuario asesor de la obligación
        @AuraEnabled public String exonerado;   // Exonerado (Si / No): en SII, el 347 y el 390 van de alta y exonerados
    }

    public class ObligacionDTO {
        @AuraEnabled public Id contratoId;
        @AuraEnabled public String numero; // nº del contrato contable y fiscal, enlazado en la ficha
        @AuraEnabled public String territorioFiscal; // territorio fiscal del contrato
        @AuraEnabled public Integer nLocales; // locales afectos de la empresa
        @AuraEnabled public Integer nActividades; // actividades económicas de la empresa
        @AuraEnabled public Id empresaId;
        @AuraEnabled public String empresa;
        @AuraEnabled public String cif;
        @AuraEnabled public String tipoEmpresa;
        @AuraEnabled public String tipoTitular; // Persona Física / Jurídica (de la empresa)
        @AuraEnabled public Id asesorId;   // asesor responsable del contrato
        @AuraEnabled public String asesor;
        @AuraEnabled public String empresaTitular; // empresa titular gestión del contrato
        @AuraEnabled public String grupo; // grupo empresarial del contrato
        @AuraEnabled public Boolean operadorIntracom; // ¿Operador intracomunitario? = Si
        @AuraEnabled public String operadorIntracomValor; // valor literal del campo (Si / No / vacío), para avisar si falta
        @AuraEnabled public String consolidacionFiscal; // Consolidación fiscal (Si / No / vacío)
        @AuraEnabled public String censo; // Situación Censal AEAT (Activa/Inactiva)
        @AuraEnabled public Date fechaBaja; // fecha de baja del contrato, si la tiene
        @AuraEnabled public List<ModeloOblDTO> modelos; // modelos de alta del contrato
    }

    /**
     * Obligaciones tributarias: empresas de los contratos contables y fiscales
     * no cerrados con los modelos tributarios de alta (Impuestos__c, sin los de
     * baja) y su periodicidad, para la matriz de la pestaña.
     */
    @AuraEnabled
    public static List<ObligacionDTO> getObligacionesTributarias() {
        List<Contrato_Contabilidad_y_Fiscal__c> contratos = [
            SELECT Id, Name, Territorio_fiscal__c, Empresa__c, Empresa__r.Name, Empresa__r.Tipo_de_titular__c,
                   CIF_Empresa__c, Tipo_de_Empresa__c, Operador_intracomunitario__c, Consolidaci_n_fiscal__c,
                   Asesor_responsable__c, Asesor_responsable__r.Name, Empresa_titular__c,
                   Grupo_Empresarial__c, Tipo_de_Contrato__c, Fecha_baja__c
            FROM Contrato_Contabilidad_y_Fiscal__c
            WHERE Estado__c != 'Cerrado'
            ORDER BY Empresa__r.Name ASC
            LIMIT 5000
        ];
        // Locales afectos y actividades económicas de cada empresa, para la cabecera de la ficha
        Set<Id> empresaIds = new Set<Id>();
        for (Contrato_Contabilidad_y_Fiscal__c c : contratos) {
            if (c.Empresa__c != null) empresaIds.add(c.Empresa__c);
        }
        Map<Id, Integer> localesPorEmpresa = contarPorEmpresa('Local_afecto__c', empresaIds);
        Map<Id, Integer> actividadesPorEmpresa = contarPorEmpresa('actividad_economica__c', empresaIds);
        Map<Id, List<ModeloOblDTO>> modelosPorContrato = new Map<Id, List<ModeloOblDTO>>();
        for (Impuestos__c i : [
            SELECT Id, Contrato_Contabilidad_y_Fiscal__c, Modelos__c, Periodicidad__c,
                   Presentaci_n_del_impuesto__c, Software_preparaci_n_impuesto__c,
                   Territorio__c, Modalidad__c, Vencimientos__c,
                   Fecha_Alta__c, Observaciones__c, Asesor_responsable__c, Asesor_responsable__r.Name,
                   Asesor_responsable__r.Empresa_Titular__c, Exonerado__c
            FROM Impuestos__c
            WHERE Contrato_Contabilidad_y_Fiscal__c IN :new Map<Id, Contrato_Contabilidad_y_Fiscal__c>(contratos).keySet()
              AND Modelos__c != null
              AND Estado__c != 'Baja'
              AND Fecha_Baja__c = null
            LIMIT 50000
        ]) {
            List<ModeloOblDTO> modelos = modelosPorContrato.get(i.Contrato_Contabilidad_y_Fiscal__c);
            if (modelos == null) {
                modelos = new List<ModeloOblDTO>();
                modelosPorContrato.put(i.Contrato_Contabilidad_y_Fiscal__c, modelos);
            }
            ModeloOblDTO m = new ModeloOblDTO();
            m.id = i.Id;
            m.modelo = i.Modelos__c;
            m.periodicidad = i.Periodicidad__c;
            m.presentacion = i.Presentaci_n_del_impuesto__c;
            m.software = i.Software_preparaci_n_impuesto__c;
            m.territorio = i.Territorio__c;
            m.modalidad = i.Modalidad__c;
            m.vencimientos = i.Vencimientos__c;
            m.fechaAlta = i.Fecha_Alta__c;
            m.observaciones = i.Observaciones__c;
            m.asesor = i.Asesor_responsable__r == null ? null : i.Asesor_responsable__r.Name;
            m.asesorId = i.Asesor_responsable__c;
            m.asesorEmpresaTitular = i.Asesor_responsable__r == null ? null : i.Asesor_responsable__r.Empresa_Titular__c;
            m.exonerado = i.Exonerado__c;
            modelos.add(m);
        }
        List<ObligacionDTO> out = new List<ObligacionDTO>();
        for (Contrato_Contabilidad_y_Fiscal__c c : contratos) {
            ObligacionDTO dto = new ObligacionDTO();
            dto.contratoId = c.Id;
            dto.numero = c.Name;
            dto.territorioFiscal = c.Territorio_fiscal__c;
            dto.nLocales = localesPorEmpresa.containsKey(c.Empresa__c) ? localesPorEmpresa.get(c.Empresa__c) : 0;
            dto.nActividades = actividadesPorEmpresa.containsKey(c.Empresa__c)
                ? actividadesPorEmpresa.get(c.Empresa__c) : 0;
            dto.empresaId = c.Empresa__c;
            dto.empresa = c.Empresa__r == null ? null : c.Empresa__r.Name;
            dto.cif = c.CIF_Empresa__c;
            dto.tipoEmpresa = c.Tipo_de_Empresa__c;
            dto.tipoTitular = c.Empresa__r == null ? null : c.Empresa__r.Tipo_de_titular__c;
            dto.asesorId = c.Asesor_responsable__c;
            dto.asesor = c.Asesor_responsable__r == null ? null : c.Asesor_responsable__r.Name;
            dto.empresaTitular = c.Empresa_titular__c;
            dto.grupo = c.Grupo_Empresarial__c;
            dto.operadorIntracom = c.Operador_intracomunitario__c == 'Si';
            dto.operadorIntracomValor = c.Operador_intracomunitario__c;
            dto.consolidacionFiscal = c.Consolidaci_n_fiscal__c;
            dto.censo = c.Tipo_de_Contrato__c;
            dto.fechaBaja = c.Fecha_baja__c;
            dto.modelos = modelosPorContrato.containsKey(c.Id)
                ? modelosPorContrato.get(c.Id)
                : new List<ModeloOblDTO>();
            out.add(dto);
        }
        return out;
    }

    /**
     * Nº de registros por empresa de un objeto relacionado con la cuenta por
     * Empresa__c (Local_afecto__c, actividad_economica__c).
     */
    private static Map<Id, Integer> contarPorEmpresa(String objeto, Set<Id> empresaIds) {
        Map<Id, Integer> out = new Map<Id, Integer>();
        if (empresaIds.isEmpty()) return out;
        for (AggregateResult ar : Database.query(
                'SELECT Empresa__c e, COUNT(Id) n FROM ' + objeto
                + ' WHERE Empresa__c IN :empresaIds GROUP BY Empresa__c')) {
            out.put((Id) ar.get('e'), (Integer) ar.get('n'));
        }
        return out;
    }

    /** Valores de los picklists de la ficha de obligación tributaria, para el alta */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getOpcionesObligacion() {
        Map<String, Object> out = new Map<String, Object>();
        out.put('modelos', valoresPicklist(Impuestos__c.Modelos__c.getDescribe()));
        out.put('periodicidades', valoresPicklist(Impuestos__c.Periodicidad__c.getDescribe()));
        out.put('territorios', valoresPicklist(Impuestos__c.Territorio__c.getDescribe()));
        out.put('modalidades', valoresPicklist(Impuestos__c.Modalidad__c.getDescribe()));
        out.put('softwares', valoresPicklist(Impuestos__c.Software_preparaci_n_impuesto__c.getDescribe()));
        out.put('exonerados', valoresPicklist(Impuestos__c.Exonerado__c.getDescribe()));
        out.put('presentaciones', valoresPicklist(Impuestos__c.Presentaci_n_del_impuesto__c.getDescribe()));
        out.put('tiposTitular', valoresPicklist(Account.Tipo_de_titular__c.getDescribe()));
        // Asesores responsables elegibles: usuarios activos internos y de partner
        List<Map<String, String>> asesores = new List<Map<String, String>>();
        for (User u : [
            SELECT Id, Name FROM User
            WHERE IsActive = true AND UserType IN ('Standard', 'PowerPartner')
            ORDER BY Name ASC
            LIMIT 500
        ]) {
            asesores.add(new Map<String, String>{ 'value' => u.Id, 'label' => u.Name });
        }
        out.put('asesores', asesores);
        // Modalidad y Periodicidad son picklists dependientes de Modelos:
        // valores válidos por cada modelo
        out.put('modalidadesPorModelo', valoresDependientes(
            Impuestos__c.Modelos__c.getDescribe(), Impuestos__c.Modalidad__c.getDescribe()));
        out.put('periodicidadesPorModelo', valoresDependientes(
            Impuestos__c.Modelos__c.getDescribe(), Impuestos__c.Periodicidad__c.getDescribe()));
        return out;
    }

    private static List<String> valoresPicklist(Schema.DescribeFieldResult campo) {
        List<String> out = new List<String>();
        for (Schema.PicklistEntry e : campo.getPicklistValues()) {
            if (e.isActive()) out.add(e.getValue());
        }
        return out;
    }

    /**
     * Valores del picklist dependiente válidos para cada valor del controlador.
     * El vínculo (validFor) no está expuesto en Apex, así que se lee del JSON
     * del describe: es un bitmap en base64 con un bit por valor controlador.
     */
    private static Map<String, List<String>> valoresDependientes(
            Schema.DescribeFieldResult controlador, Schema.DescribeFieldResult dependiente) {
        List<Schema.PicklistEntry> ctrl = controlador.getPicklistValues();
        Map<String, List<String>> out = new Map<String, List<String>>();
        for (Schema.PicklistEntry e : ctrl) out.put(e.getValue(), new List<String>());
        String base64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        List<EntradaDependiente> entradas = (List<EntradaDependiente>) JSON.deserialize(
            JSON.serialize(dependiente.getPicklistValues()), List<EntradaDependiente>.class);
        for (EntradaDependiente en : entradas) {
            if (en.active != true || String.isBlank(en.validFor)) continue;
            for (Integer i = 0; i < en.validFor.length(); i++) {
                Integer bits = base64.indexOf(en.validFor.mid(i, 1));
                for (Integer b = 0; b < 6; b++) {
                    if ((bits & (32 >> b)) == 0) continue;
                    Integer idx = i * 6 + b;
                    if (idx < ctrl.size()) out.get(ctrl[idx].getValue()).add(en.value);
                }
            }
        }
        return out;
    }

    private class EntradaDependiente {
        public String value;
        public Boolean active;
        public String validFor;
    }

    /** Campos obligatorios de la obligación: modelo, periodicidad, territorio,
        fecha de alta, quién presenta, ERP de presentación y la modalidad
        cuando el modelo tiene modalidades válidas */
    private static void exigirCamposObligacion(String modelo, String periodicidad,
            String territorio, String modalidad, Date fechaAlta,
            String presentacion, String software) {
        if (String.isBlank(modelo)) throw new AuraHandledException('Falta el modelo tributario.');
        if (String.isBlank(periodicidad)) throw new AuraHandledException('Falta la periodicidad.');
        if (String.isBlank(territorio)) throw new AuraHandledException('Falta el territorio.');
        if (fechaAlta == null) throw new AuraHandledException('Falta la fecha de alta en hacienda.');
        if (String.isBlank(presentacion)) throw new AuraHandledException('Falta quién presenta el impuesto.');
        if (String.isBlank(software)) throw new AuraHandledException('Falta el ERP de presentación.');
        if (String.isBlank(modalidad)) {
            List<String> validas = valoresDependientes(
                Impuestos__c.Modelos__c.getDescribe(), Impuestos__c.Modalidad__c.getDescribe()).get(modelo);
            if (validas != null && !validas.isEmpty()) {
                throw new AuraHandledException('Falta la modalidad del modelo ' + modelo + '.');
            }
        }
    }

    /**
     * Da de alta una obligación tributaria para la empresa: exige que tenga un
     * contrato contable y fiscal no cerrado, la asocia a él y devuelve el id
     * del contrato para dejar marcado el cliente en la matriz.
     */
    @AuraEnabled
    public static Id crearObligacionTributaria(Id empresaId, String modelo, String periodicidad,
            String territorio, String modalidad, Date fechaAlta,
            String presentacion, String software, Id asesorId, String exonerado) {
        if (empresaId == null) throw new AuraHandledException('Falta la empresa.');
        exigirCamposObligacion(modelo, periodicidad, territorio, modalidad, fechaAlta, presentacion, software);
        List<Contrato_Contabilidad_y_Fiscal__c> contratos = [
            SELECT Id, Asesor_responsable__c, Empresa_titular__c
            FROM Contrato_Contabilidad_y_Fiscal__c
            WHERE Empresa__c = :empresaId AND Estado__c != 'Cerrado'
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];
        if (contratos.isEmpty()) {
            throw new AuraHandledException('La empresa no tiene un contrato contable y fiscal en estado no cerrado.');
        }
        Impuestos__c i = new Impuestos__c(
            Empresa__c = empresaId,
            Contrato_Contabilidad_y_Fiscal__c = contratos[0].Id,
            Modelos__c = modelo,
            Periodicidad__c = periodicidad,
            Territorio__c = territorio,
            Modalidad__c = modalidad,
            Fecha_Alta__c = fechaAlta,
            Presentaci_n_del_impuesto__c = presentacion,
            Software_preparaci_n_impuesto__c = software,
            Exonerado__c = String.isBlank(exonerado) ? null : exonerado,
            Estado__c = 'Alta',
            // Empresa titular gestión del contrato; asesor responsable el elegido
            // en la ficha o, sin elegir, el del contrato
            Empresa_titular__c = contratos[0].Empresa_titular__c,
            Asesor_responsable__c = asesorId != null ? asesorId : contratos[0].Asesor_responsable__c
        );
        try {
            insert i;
        } catch (DmlException ex) {
            throw new AuraHandledException('Error al crear la obligación: ' + ex.getDmlMessage(0));
        }
        return contratos[0].Id;
    }

    /** Edita una obligación tributaria desde la ficha del cliente */
    @AuraEnabled
    public static void actualizarObligacionTributaria(Id obligacionId, String modelo, String periodicidad,
            String territorio, String modalidad, Date fechaAlta,
            String presentacion, String software, Id asesorId, String exonerado) {
        if (obligacionId == null) throw new AuraHandledException('Falta la obligación tributaria.');
        exigirCamposObligacion(modelo, periodicidad, territorio, modalidad, fechaAlta, presentacion, software);
        try {
            update new Impuestos__c(
                Id = obligacionId,
                Modelos__c = modelo,
                Periodicidad__c = periodicidad,
                Territorio__c = territorio,
                Modalidad__c = modalidad,
                Fecha_Alta__c = fechaAlta,
                Presentaci_n_del_impuesto__c = presentacion,
                Software_preparaci_n_impuesto__c = software,
                // Exonerado (Sí / No) se informa desde la ficha; vacío lo deja sin valor
                Exonerado__c = String.isBlank(exonerado) ? null : exonerado,
                // El asesor responsable de la obligación se cambia desde la ficha
                Asesor_responsable__c = asesorId
            );
        } catch (DmlException ex) {
            throw new AuraHandledException('Error al actualizar la obligación: ' + ex.getDmlMessage(0));
        }
    }

    /** Cambia el tipo de titular en la ficha de la empresa (desde la ficha censal) */
    @AuraEnabled
    public static void actualizarTipoTitular(Id empresaId, String tipoTitular) {
        if (empresaId == null) throw new AuraHandledException('Falta la empresa.');
        try {
            update new Account(Id = empresaId,
                Tipo_de_titular__c = String.isBlank(tipoTitular) ? null : tipoTitular);
        } catch (DmlException ex) {
            throw new AuraHandledException('Error al actualizar el tipo de titular: ' + ex.getDmlMessage(0));
        }
    }

    /**
     * Edición rápida desde el listado de impuestos: el software de
     * presentación, la modalidad y quién presenta la obligación.
     */
    @AuraEnabled
    public static void actualizarImpuestoRapido(Id obligacionId, String software, String modalidad, String presentacion) {
        if (obligacionId == null) throw new AuraHandledException('Falta la obligación tributaria.');
        try {
            update new Impuestos__c(
                Id = obligacionId,
                Software_preparaci_n_impuesto__c = String.isBlank(software) ? null : software,
                Modalidad__c = String.isBlank(modalidad) ? null : modalidad,
                Presentaci_n_del_impuesto__c = String.isBlank(presentacion) ? null : presentacion
            );
        } catch (DmlException ex) {
            throw new AuraHandledException('Error al actualizar la obligación: ' + ex.getDmlMessage(0));
        }
    }

    /**
     * Contratos contables y fiscales abiertos con los registros abiertos de
     * cada empresa (mismos criterios que las pestañas de Control general).
     */
    @AuraEnabled
    public static List<ContratoCFDTO> getContratosCF() {
        List<Contrato_Contabilidad_y_Fiscal__c> contratos = [
            SELECT Id, Name, Empresa__c, Empresa__r.Name, Grupo_Empresarial__c,
                   Asesor_responsable__c, Asesor_responsable__r.Name, Empresa_titular__c,
                   Tipo_de_Empresa__c, toLabel(Tipo_de_servicio__c), toLabel(Grado_de_dificultad__c),
                   toLabel(Tipo_de_Contrato__c),
                   toLabel(Programa_de_facturaci_n__c), toLabel(Contabilidad_en_el_ERP_del_despacho__c),
                   toLabel(Acceso_Portal_del_Cliente__c), C_digo_ERP__c,
                   toLabel(Recepci_n_Facturas_Emitidas__c), toLabel(Recepci_n_Facturas_Recibidas__c),
                   toLabel(Recepci_n_Bancos__c), toLabel(Tiene_hoja_de_caja__c),
                   toLabel(Territorio_fiscal__c), toLabel(Operador_intracomunitario__c),
                   toLabel(Consolidaci_n_fiscal__c), toLabel(Sujeto_consolidaci_n__c),
                   toLabel(Comienzo_ejercicio_fiscal__c), toLabel(Tipo_de_regimen__c)
            FROM Contrato_Contabilidad_y_Fiscal__c
            WHERE Estado__c = 'Abierto'
            ORDER BY Empresa__r.Name ASC
        ];
        Set<Id> empIds = new Set<Id>();
        for (Contrato_Contabilidad_y_Fiscal__c c : contratos) {
            if (c.Empresa__c != null) empIds.add(c.Empresa__c);
        }

        Map<Id, Map<String, Integer>> porEmpresa = new Map<Id, Map<String, Integer>>();
        acumular(porEmpresa, 'contabilidades', [
            SELECT Empresa__c o, COUNT(Id) n FROM Contabilidad__c
            WHERE Estado__c = 'Pendiente' AND Empresa__c IN :empIds GROUP BY Empresa__c]);
        acumular(porEmpresa, 'precierres', [
            SELECT Empresa__c o, COUNT(Id) n FROM Precierre_Contable__c
            WHERE Estado__c IN ('Sin revisar', 'En curso') AND Empresa__c IN :empIds GROUP BY Empresa__c]);
        acumular(porEmpresa, 'cierres', [
            SELECT Empresa__c o, COUNT(Id) n FROM Cierre_Contable__c
            WHERE Estado__c NOT IN :CERRADOS_CIERRE AND Empresa__c IN :empIds GROUP BY Empresa__c]);
        acumular(porEmpresa, 'libros', [
            SELECT Empresa__c o, COUNT(Id) n FROM Libros__c
            WHERE Estado__c NOT IN :CERRADOS_LIBROS AND Empresa__c IN :empIds GROUP BY Empresa__c]);
        acumular(porEmpresa, 'cuentas', [
            SELECT Empresa__c o, COUNT(Id) n FROM Cuentas_Anuales__c
            WHERE Estado__c NOT IN :CERRADOS_CUENTAS AND Empresa__c IN :empIds GROUP BY Empresa__c]);
        acumular(porEmpresa, 'rentas', [
            SELECT Declarante__c o, COUNT(Id) n FROM Renta__c
            WHERE Estado_Renta__c NOT IN :CERRADOS_RENTA AND Declarante__c IN :empIds GROUP BY Declarante__c]);
        acumular(porEmpresa, 'expedientes', [
            SELECT Empresa_Cliente__c o, COUNT(Id) n FROM Proyecto__c
            WHERE Estado__c NOT IN :CERRADOS_PROYECTO AND Empresa_Cliente__c IN :empIds GROUP BY Empresa_Cliente__c]);
        acumular(porEmpresa, 'casos', [
            SELECT AccountId o, COUNT(Id) n FROM Case
            WHERE IsClosed = false AND AccountId IN :empIds GROUP BY AccountId]);
        // Tareas abiertas vencidas (anteriores a hoy) ligadas a la empresa del contrato
        acumular(porEmpresa, 'tareas', [
            SELECT Empresa__c o, COUNT(Id) n FROM Task
            WHERE IsClosed = false AND ActivityDate < :Date.today()
              AND Empresa__c IN :empIds GROUP BY Empresa__c]);

        // Vencidos por empresa, con las mismas reglas de ejercicio que la Visión general
        for (AggregateResult ar : [
            SELECT Empresa__c o, Ejercicio__c ej, Periodicidad__c per, COUNT(Id) n
            FROM Contabilidad__c WHERE Estado__c = 'Pendiente' AND Empresa__c IN :empIds
            GROUP BY Empresa__c, Ejercicio__c, Periodicidad__c]) {
            if (contabVencida((String) ar.get('ej'), (String) ar.get('per'))) {
                sumarEmpresa(porEmpresa, (Id) ar.get('o'), 'contabVencidas', (Integer) ar.get('n'));
            }
        }
        for (AggregateResult ar : [
            SELECT Empresa__c o, Ejercicio__c ej, COUNT(Id) n
            FROM Precierre_Contable__c WHERE Estado__c IN ('Sin revisar', 'En curso')
              AND Empresa__c IN :empIds GROUP BY Empresa__c, Ejercicio__c]) {
            if (precierreVencido((String) ar.get('ej'))) {
                sumarEmpresa(porEmpresa, (Id) ar.get('o'), 'precVencidos', (Integer) ar.get('n'));
            }
        }
        for (AggregateResult ar : [
            SELECT Empresa__c o, Ejercicio__c ej, COUNT(Id) n
            FROM Cierre_Contable__c WHERE Estado__c NOT IN :CERRADOS_CIERRE
              AND Empresa__c IN :empIds GROUP BY Empresa__c, Ejercicio__c]) {
            if (cierreVencido((String) ar.get('ej'))) {
                sumarEmpresa(porEmpresa, (Id) ar.get('o'), 'cierVencidos', (Integer) ar.get('n'));
            }
        }
        for (AggregateResult ar : [
            SELECT Empresa__c o, Ejercicio__c ej, COUNT(Id) n
            FROM Libros__c WHERE Estado__c NOT IN :CERRADOS_LIBROS
              AND Empresa__c IN :empIds GROUP BY Empresa__c, Ejercicio__c]) {
            if (cierreVencido((String) ar.get('ej'))) {
                sumarEmpresa(porEmpresa, (Id) ar.get('o'), 'librosVencidos', (Integer) ar.get('n'));
            }
        }
        for (AggregateResult ar : [
            SELECT Empresa__c o, Ejercicio__c ej, COUNT(Id) n
            FROM Cuentas_Anuales__c WHERE Estado__c NOT IN :CERRADOS_CUENTAS
              AND Empresa__c IN :empIds GROUP BY Empresa__c, Ejercicio__c]) {
            if (cuentasVencida((String) ar.get('ej'))) {
                sumarEmpresa(porEmpresa, (Id) ar.get('o'), 'cuentasVencidas', (Integer) ar.get('n'));
            }
        }

        List<ContratoCFDTO> out = new List<ContratoCFDTO>();
        for (Contrato_Contabilidad_y_Fiscal__c c : contratos) {
            ContratoCFDTO dto = new ContratoCFDTO();
            dto.id = c.Id;
            dto.numero = c.Name;
            dto.empresaId = c.Empresa__c;
            dto.empresa = c.Empresa__r == null ? null : c.Empresa__r.Name;
            dto.grupo = c.Grupo_Empresarial__c;
            dto.asesorId = c.Asesor_responsable__c;
            dto.asesor = c.Asesor_responsable__r == null ? null : c.Asesor_responsable__r.Name;
            dto.tipoEmpresa = c.Tipo_de_Empresa__c;
            dto.censo = c.Tipo_de_Contrato__c;
            dto.tipoServicio = c.Tipo_de_servicio__c;
            dto.gradoDificultad = c.Grado_de_dificultad__c;
            dto.empresaTitularGestion = c.Empresa_titular__c;
            dto.softwareFacturacion = c.Programa_de_facturaci_n__c;
            dto.contabEnErp = c.Contabilidad_en_el_ERP_del_despacho__c;
            dto.accesoPortal = c.Acceso_Portal_del_Cliente__c;
            dto.codigoErp = c.C_digo_ERP__c == null ? null : String.valueOf(c.C_digo_ERP__c.longValue());
            dto.recepEmitidas = c.Recepci_n_Facturas_Emitidas__c;
            dto.recepRecibidas = c.Recepci_n_Facturas_Recibidas__c;
            dto.recepBancos = c.Recepci_n_Bancos__c;
            dto.hojaCaja = c.Tiene_hoja_de_caja__c;
            dto.territorioFiscal = c.Territorio_fiscal__c;
            dto.operadorIntracomunitario = c.Operador_intracomunitario__c;
            dto.consolidacionFiscal = c.Consolidaci_n_fiscal__c;
            dto.posicionConsolidacion = c.Sujeto_consolidaci_n__c;
            dto.comienzoEjercicio = c.Comienzo_ejercicio_fiscal__c;
            dto.modalidadEstimacion = c.Tipo_de_regimen__c;
            Map<String, Integer> n = porEmpresa.get(c.Empresa__c);
            if (n != null) {
                dto.contabilidades = valor(n, 'contabilidades');
                dto.precierres = valor(n, 'precierres');
                dto.cierres = valor(n, 'cierres');
                dto.libros = valor(n, 'libros');
                dto.cuentas = valor(n, 'cuentas');
                dto.contabVencidas = valor(n, 'contabVencidas');
                dto.precVencidos = valor(n, 'precVencidos');
                dto.cierVencidos = valor(n, 'cierVencidos');
                dto.librosVencidos = valor(n, 'librosVencidos');
                dto.cuentasVencidas = valor(n, 'cuentasVencidas');
                dto.rentas = valor(n, 'rentas');
                dto.expedientes = valor(n, 'expedientes');
                dto.casos = valor(n, 'casos');
                dto.tareas = valor(n, 'tareas');
            }
            out.add(dto);
        }
        return out;
    }

    public class BuzonDTO {
        @AuraEnabled public Id     id;
        @AuraEnabled public String numero;
        @AuraEnabled public Date   fecha;
        @AuraEnabled public Id     empresaId;
        @AuraEnabled public String empresa;
        @AuraEnabled public String tipoDoc;
        @AuraEnabled public String situacion;
        @AuraEnabled public String estado;
        @AuraEnabled public String asesor;
        @AuraEnabled public String periodicidad;
        @AuraEnabled public String archivoEjercicio;
        @AuraEnabled public String archivoPeriodicidad;
        @AuraEnabled public String subtipoPeriodo;
    }

    /** Registros del buzón contable pendientes (no contabilizados) */
    @AuraEnabled
    public static List<BuzonDTO> getBuzonContable() {
        List<BuzonDTO> out = new List<BuzonDTO>();
        for (Buzon_contable__c b : [
            SELECT Name, CreatedDate, Empresa__c, Empresa__r.Name, toLabel(Tipo_documentaci_n__c),
                   Situaci_n__c, Estado__c, Responsable__c, Periodicidad_contable__c,
                   toLabel(Ejercicio__c), toLabel(Periodicidad__c), toLabel(Suptipo_periodo__c)
            FROM Buzon_contable__c
            WHERE Estado__c != 'Contabilizado'
            ORDER BY CreatedDate ASC
        ]) {
            BuzonDTO dto = new BuzonDTO();
            dto.id = b.Id;
            dto.numero = b.Name;
            dto.fecha = b.CreatedDate.date();
            dto.empresaId = b.Empresa__c;
            dto.empresa = b.Empresa__r == null ? null : b.Empresa__r.Name;
            dto.tipoDoc = b.Tipo_documentaci_n__c;
            // La situación es una fórmula IMAGE (alt Ok/Cruz): viaja como estado parseado
            dto.situacion = estadoContrato(b.Situaci_n__c);
            dto.estado = b.Estado__c;
            dto.asesor = b.Responsable__c;
            dto.periodicidad = b.Periodicidad_contable__c;
            dto.archivoEjercicio = b.Ejercicio__c;
            dto.archivoPeriodicidad = b.Periodicidad__c;
            dto.subtipoPeriodo = b.Suptipo_periodo__c;
            out.add(dto);
        }
        return out;
    }

    /**
     * Recuento de registros abiertos por pestaña de Control general, con el
     * mismo criterio que usa el listado de cada pestaña.
     */
    @AuraEnabled
    public static Map<String, Integer> getContadoresPestanas() {
        Map<String, Integer> out = new Map<String, Integer>();
        out.put('vtos', [SELECT COUNT() FROM Task
            WHERE IsClosed = false AND Vencimiento_Legal__c != null
              AND Es_un_se_alamiento_legal__c != 'Si']);
        out.put('contabilidad', [SELECT COUNT() FROM Contabilidad__c WHERE Estado__c = 'Pendiente']);
        out.put('precierres', [SELECT COUNT() FROM Precierre_Contable__c WHERE Estado__c IN ('Sin revisar', 'En curso')]);
        out.put('cierres', [SELECT COUNT() FROM Cierre_Contable__c WHERE Estado__c NOT IN :CERRADOS_CIERRE]);
        out.put('libros', [SELECT COUNT() FROM Libros__c WHERE Estado__c != 'Cerrado']);
        out.put('cuentas', [SELECT COUNT() FROM Cuentas_Anuales__c WHERE Estado__c != 'Cerrado']);
        out.put('rentas', [SELECT COUNT() FROM Renta__c WHERE Estado_Renta__c NOT IN :CERRADOS_RENTA]);
        out.put('expedientes', [SELECT COUNT() FROM Proyecto__c WHERE Estado__c NOT IN :CERRADOS_PROYECTO]);
        out.put('casos', [SELECT COUNT() FROM Case WHERE IsClosed = false]);
        return out;
    }

    /**
     * Expedientes abiertos para la pestaña Expedientes.
     */
    @AuraEnabled
    public static List<RegistroDTO> getExpedientesAbiertos() {
        List<Proyecto__c> regs = [
            SELECT Name, Empresa_Cliente__c, Empresa_Cliente__r.Name, T_tulo_del_Expediente__c,
                   Empresa_Cliente__r.Contrato_fiscal__c, Empresa_Cliente__r.Contrato_laboral__c,
                   Usuario_responsable__c, Usuario_responsable__r.Name, Usuario_responsable__r.Empresa_Titular__c,
                   Usuario_responsable__r.IsActive, CreatedDate,
                   Estado__c, Empresa_Titular__c, toLabel(Tipo_de_Expediente__c)
            FROM Proyecto__c
            WHERE Estado__c NOT IN :CERRADOS_PROYECTO
            ORDER BY CreatedDate ASC
        ];
        List<RegistroDTO> out = mapRegistros(regs, 'Usuario_responsable__c', 'Usuario_responsable__r',
            'Empresa_Cliente__c', 'Empresa_Cliente__r', 'Estado__c', 'T_tulo_del_Expediente__c');

        // Tareas abiertas por expediente y, para los que no tienen ninguna,
        // la fecha en la que se cerró la última (CompletedDateTime; si el dato
        // no existe en tareas antiguas, la última modificación)
        Set<Id> proyIds = new Map<Id, Proyecto__c>(regs).keySet();
        Map<Id, Integer> abiertas = new Map<Id, Integer>();
        for (AggregateResult ar : [
            SELECT WhatId w, COUNT(Id) n FROM Task
            WHERE IsClosed = false AND WhatId IN :proyIds GROUP BY WhatId]) {
            abiertas.put((Id) ar.get('w'), (Integer) ar.get('n'));
        }
        Map<Id, Date> cierres = new Map<Id, Date>();
        for (AggregateResult ar : [
            SELECT WhatId w, MAX(CompletedDateTime) f, MAX(LastModifiedDate) lm FROM Task
            WHERE IsClosed = true AND WhatId IN :proyIds GROUP BY WhatId]) {
            Datetime f = (Datetime) ar.get('f');
            if (f == null) f = (Datetime) ar.get('lm');
            if (f != null) cierres.put((Id) ar.get('w'), f.date());
        }

        for (Integer i = 0; i < regs.size(); i++) {
            out[i].empresaTitular = regs[i].Empresa_Titular__c;
            out[i].materia = regs[i].Tipo_de_Expediente__c;
            if (regs[i].Empresa_Cliente__r != null) {
                out[i].contratoFiscal = estadoContrato(regs[i].Empresa_Cliente__r.Contrato_fiscal__c);
                out[i].contratoLaboral = estadoContrato(regs[i].Empresa_Cliente__r.Contrato_laboral__c);
            }
            out[i].tareasAbiertas = abiertas.containsKey(regs[i].Id) ? abiertas.get(regs[i].Id) : 0;
            out[i].ultimaTarea = cierres.get(regs[i].Id);
            out[i].fechaApertura = regs[i].CreatedDate.date();
            out[i].asesorActivo = regs[i].Usuario_responsable__r != null
                && regs[i].Usuario_responsable__r.IsActive;
        }
        return out;
    }

    // Estados de lead que se consideran abiertos en la pestaña Leads de Inicio: Pendiente
    // (API Nuevo) y Atendido. El resto de estados son de conversión (Qualified, Spam...)
    private static final Set<String> LEAD_ESTADOS_ABIERTOS = new Set<String>{ 'Nuevo', 'Atendido' };

    // DTO de los leads abiertos para la pestaña Leads de Inicio
    public class LeadDTO {
        @AuraEnabled public Id     id;
        @AuraEnabled public Date   fechaCreacion;
        @AuraEnabled public String nombre;
        @AuraEnabled public String empresa;
        @AuraEnabled public String tipo;       // Tipo de lead (etiqueta del picklist)
        @AuraEnabled public String email;
        @AuraEnabled public String formulario; // Nombre del formulario
        @AuraEnabled public String estado;     // etiqueta del estado (Pendiente / Atendido)
        @AuraEnabled public String propietario;   // nombre del propietario (usuario o cola)
        @AuraEnabled public Id     propietarioId; // solo cuando el propietario es un usuario (enlace a su ficha)
        @AuraEnabled public String evento;        // Evento (Si / No); vacío si no está informado
    }

    /**
     * Leads no convertidos en estado Pendiente (API Nuevo) o Atendido, del más reciente
     * al más antiguo, para la pestaña Leads de Inicio, con su propietario.
     */
    @AuraEnabled
    public static List<LeadDTO> getLeadsAbiertos() {
        List<Lead> leads = [
            SELECT Id, Name, Company, Email, toLabel(Status), toLabel(Tipo_de_Lead__c),
                   Nombre_del_formulario__c, CreatedDate, OwnerId, toLabel(Evento__c)
            FROM Lead
            WHERE IsConverted = false AND Status IN :LEAD_ESTADOS_ABIERTOS
            ORDER BY CreatedDate DESC
            LIMIT 2000
        ];
        // El nombre del propietario (usuario o cola) se resuelve aparte: la relación
        // polimórfica Owner.Name llega vacía en los tests de esta org
        Set<Id> propietarios = new Set<Id>();
        for (Lead l : leads) propietarios.add(l.OwnerId);
        Map<Id, String> nombres = new Map<Id, String>();
        for (User u : [SELECT Id, Name FROM User WHERE Id IN :propietarios]) nombres.put(u.Id, u.Name);
        for (Group g : [SELECT Id, Name FROM Group WHERE Id IN :propietarios]) nombres.put(g.Id, g.Name);
        List<LeadDTO> out = new List<LeadDTO>();
        for (Lead l : leads) {
            LeadDTO dto = new LeadDTO();
            dto.id = l.Id;
            dto.fechaCreacion = l.CreatedDate.date();
            dto.nombre = l.Name;
            dto.empresa = l.Company;
            dto.tipo = l.Tipo_de_Lead__c;
            dto.email = l.Email;
            dto.formulario = l.Nombre_del_formulario__c;
            dto.estado = l.Status;
            dto.evento = l.Evento__c;
            dto.propietario = nombres.get(l.OwnerId);
            // Las colas (prefijo 00G) no tienen ficha que abrir
            dto.propietarioId = String.valueOf(l.OwnerId).startsWith('005') ? l.OwnerId : null;
            out.add(dto);
        }
        return out;
    }

    // DTO de las oportunidades abiertas para la pestaña Oportunidades
    public class OportunidadDTO {
        @AuraEnabled public Id     id;
        @AuraEnabled public Date   fechaCierre;
        @AuraEnabled public Date   fechaCreacion;
        @AuraEnabled public String asunto;
        @AuraEnabled public Id     cuentaId;
        @AuraEnabled public String cuenta;
        @AuraEnabled public String tipo;
        @AuraEnabled public String subtipo;
        @AuraEnabled public String empresaTitular;
        @AuraEnabled public String estado;
        @AuraEnabled public Id     asesorId;
        @AuraEnabled public String asesor;
    }

    /**
     * Oportunidades abiertas para la pestaña Oportunidades, ordenadas por
     * fecha de cierre de más antigua a más reciente.
     */
    @AuraEnabled
    public static List<OportunidadDTO> getOportunidadesAbiertas() {
        List<OportunidadDTO> out = new List<OportunidadDTO>();
        for (Opportunity o : [
            SELECT Id, Name, CloseDate, CreatedDate, StageName, toLabel(Type), toLabel(Subtipo1__c),
                   toLabel(Empresa_Titular__c), AccountId, Account.Name, OwnerId, Owner.Name
            FROM Opportunity
            WHERE IsClosed = false
            ORDER BY CloseDate ASC
            LIMIT 5000
        ]) {
            OportunidadDTO dto = new OportunidadDTO();
            dto.id = o.Id;
            dto.fechaCierre = o.CloseDate;
            dto.fechaCreacion = o.CreatedDate.date();
            dto.asunto = o.Name;
            dto.cuentaId = o.AccountId;
            dto.cuenta = o.Account == null ? null : o.Account.Name;
            dto.tipo = o.Type;
            dto.subtipo = o.Subtipo1__c;
            dto.empresaTitular = o.Empresa_Titular__c;
            dto.estado = o.StageName;
            dto.asesorId = o.OwnerId;
            dto.asesor = o.Owner == null ? null : o.Owner.Name;
            out.add(dto);
        }
        return out;
    }

    public class OpoCasoDTO {
        @AuraEnabled public Id     id;
        @AuraEnabled public String numero;
        @AuraEnabled public String asunto;
        @AuraEnabled public Id     cuentaId;
        @AuraEnabled public String estado;
        @AuraEnabled public String tipo;
        @AuraEnabled public String asesor;
        @AuraEnabled public Date   fechaCreacion;
    }

    public class OpoEventosDTO {
        @AuraEnabled public Id      cuentaId;
        @AuraEnabled public Integer n;
    }

    public class OpoPanelDTO {
        @AuraEnabled public List<OportunidadDTO> oportunidades;
        @AuraEnabled public List<OpoCasoDTO>     casos;
        @AuraEnabled public List<OpoEventosDTO>  eventos;
        @AuraEnabled public List<Id>             recuperadas;
    }

    /**
     * Panel completo de la pestaña Oportunidades: las oportunidades abiertas
     * más los casos abiertos de sus cuentas, los registros de eventos de los
     * últimos 30 días por cuenta y las oportunidades recuperadas (pasaron por
     * un estado cerrado según su histórico y hoy vuelven a estar abiertas).
     */
    @AuraEnabled
    public static OpoPanelDTO getOportunidadesPanel() {
        OpoPanelDTO out = new OpoPanelDTO();
        out.oportunidades = getOportunidadesAbiertas();

        Set<Id> cuentas = new Set<Id>();
        Set<Id> oppIds = new Set<Id>();
        for (OportunidadDTO o : out.oportunidades) {
            if (o.cuentaId != null) cuentas.add(o.cuentaId);
            oppIds.add(o.id);
        }

        out.casos = new List<OpoCasoDTO>();
        for (Case c : [
            SELECT Id, CaseNumber, Subject, AccountId, toLabel(Status), toLabel(Type),
                   OwnerId, Owner.Name, CreatedDate
            FROM Case
            WHERE IsClosed = false AND AccountId IN :cuentas
            ORDER BY CreatedDate DESC
            LIMIT 5000
        ]) {
            OpoCasoDTO dto = new OpoCasoDTO();
            dto.id = c.Id;
            dto.numero = c.CaseNumber;
            dto.asunto = c.Subject;
            dto.cuentaId = c.AccountId;
            dto.estado = c.Status;
            dto.tipo = c.Type;
            dto.asesor = c.Owner == null ? null : c.Owner.Name;
            dto.fechaCreacion = c.CreatedDate.date();
            out.casos.add(dto);
        }

        out.eventos = new List<OpoEventosDTO>();
        for (AggregateResult ar : [
            SELECT Empresa__c a, COUNT(Id) n FROM Event_Registration__c
            WHERE Empresa__c IN :cuentas AND CreatedDate = LAST_N_DAYS:30
            GROUP BY Empresa__c
        ]) {
            OpoEventosDTO dto = new OpoEventosDTO();
            dto.cuentaId = (Id) ar.get('a');
            dto.n = (Integer) ar.get('n');
            out.eventos.add(dto);
        }

        // Recuperadas: su histórico registra la salida de un estado cerrado
        Set<String> cerrados = new Set<String>();
        for (OpportunityStage s : [SELECT MasterLabel FROM OpportunityStage WHERE IsClosed = true]) {
            cerrados.add(s.MasterLabel);
        }
        Set<Id> recuperadas = new Set<Id>();
        for (OpportunityFieldHistory h : [
            SELECT OpportunityId, OldValue FROM OpportunityFieldHistory
            WHERE Field = 'StageName' AND OpportunityId IN :oppIds
            LIMIT 10000
        ]) {
            if (h.OldValue != null && cerrados.contains(String.valueOf(h.OldValue))) {
                recuperadas.add(h.OpportunityId);
            }
        }
        out.recuperadas = new List<Id>(recuperadas);
        return out;
    }

    public class CasoDTO {
        @AuraEnabled public Id     id;
        @AuraEnabled public String numero;
        @AuraEnabled public String fechaApertura;
        @AuraEnabled public String asunto;
        @AuraEnabled public Id     contactoId;
        @AuraEnabled public String contacto;
        @AuraEnabled public Id     empresaId;
        @AuraEnabled public String empresa;
        @AuraEnabled public String tipo;
        @AuraEnabled public Id     asesorId;
        @AuraEnabled public String asesor;
        @AuraEnabled public Date   fechaPrevista;
        @AuraEnabled public Date   fechaAperturaDia; // día de apertura, para los días transcurridos
        @AuraEnabled public String estado;           // etiqueta del estado del caso
    }

    /**
     * Casos abiertos para la pestaña Casos, ordenados por fecha y hora de
     * apertura de más reciente a más antiguo. La fecha de apertura llega
     * formateada en la zona horaria del usuario conectado.
     */
    @AuraEnabled
    public static List<CasoDTO> getCasosAbiertos() {
        List<CasoDTO> out = new List<CasoDTO>();
        for (Case c : [
            SELECT Id, CaseNumber, CreatedDate, Subject, ContactId, Contact.Name,
                   AccountId, Account.Name, toLabel(Type), OwnerId, Owner.Name,
                   Fecha_prevista_de_cierre__c, toLabel(Status)
            FROM Case
            WHERE IsClosed = false
            ORDER BY CreatedDate DESC
            LIMIT 5000
        ]) {
            CasoDTO dto = new CasoDTO();
            dto.id = c.Id;
            dto.numero = c.CaseNumber;
            dto.fechaApertura = c.CreatedDate.format('d/M/yyyy, HH:mm');
            dto.fechaAperturaDia = c.CreatedDate.date();
            dto.asunto = c.Subject;
            dto.contactoId = c.ContactId;
            dto.contacto = c.Contact == null ? null : c.Contact.Name;
            dto.empresaId = c.AccountId;
            dto.empresa = c.Account == null ? null : c.Account.Name;
            dto.tipo = c.Type;
            dto.asesorId = c.OwnerId;
            dto.asesor = c.Owner == null ? null : c.Owner.Name;
            dto.fechaPrevista = c.Fecha_prevista_de_cierre__c;
            dto.estado = c.Status;
            out.add(dto);
        }
        return out;
    }

    // DTO de las ausencias y vacaciones del equipo para la pestaña Ausencias Equipo
    public class AusenciaDTO {
        @AuraEnabled public Id      id;
        @AuraEnabled public Id      empleadoId;
        @AuraEnabled public String  nombre;
        @AuraEnabled public String  departamento;
        @AuraEnabled public String  empresaTitular;
        @AuraEnabled public String  tipo;
        @AuraEnabled public String  estado;
        @AuraEnabled public String  unidad;
        @AuraEnabled public Date    inicio;
        @AuraEnabled public Date    fin;
        @AuraEnabled public String  horaInicio;
        @AuraEnabled public String  horaFin;
        @AuraEnabled public Decimal cantidad;
    }

    /**
     * Ausencias y vacaciones de todo el equipo en el tramo indicado (sin
     * fechas, las cuatro semanas desde el lunes actual). Quedan fuera las
     * rechazadas y anuladas. El objeto es privado: la consulta se ejecuta
     * sin compartir para que el calendario sea visible para todos.
     */
    @AuraEnabled
    public static List<AusenciaDTO> getAusenciasEquipo(Date desde, Date hasta) {
        Date hoy = Date.today();
        // Lunes de la semana actual (el 1/1/1900 fue lunes; no depende del locale)
        Date lunes = hoy.addDays(-Math.mod(Date.newInstance(1900, 1, 1).daysBetween(hoy), 7));
        Date ini = desde != null ? desde : lunes;
        Date fin = hasta != null && hasta >= ini ? hasta : ini.addDays(27);

        List<AusenciaDTO> out = new List<AusenciaDTO>();
        for (Ausencias__c a : new AusenciasSelector().enRango(ini, fin)) {
            AusenciaDTO dto = new AusenciaDTO();
            dto.id = a.Id;
            dto.empleadoId = a.Empleado__c;
            String nom = a.Empleado__r == null ? null : a.Empleado__r.Nombre__c;
            String ape = a.Empleado__r == null ? null : a.Empleado__r.Apellidos__c;
            dto.nombre = String.isBlank(ape) ? nom : (String.isBlank(nom) ? ape : nom + ' ' + ape);
            dto.departamento = a.Empleado__r == null ? null : a.Empleado__r.Departamento__c;
            dto.empresaTitular = a.Empleado__r == null ? null : a.Empleado__r.Empresa_titular__c;
            dto.tipo = a.Tipo__c;
            dto.estado = a.Estado__c;
            dto.unidad = a.Horas_D_as__c;
            dto.inicio = a.Fecha_inicio__c;
            dto.fin = a.Fecha_Fin__c;
            dto.horaInicio = hora(a.Hora_de_Inicio__c);
            dto.horaFin = hora(a.Hora_de_Fin__c);
            dto.cantidad = a.Cantidad__c;
            out.add(dto);
        }
        return out;
    }

    private static String hora(Time t) {
        if (t == null) return null;
        return (t.hour() < 10 ? '0' : '') + t.hour() + ':' + (t.minute() < 10 ? '0' : '') + t.minute();
    }

    public class TeletrabajoDTO {
        @AuraEnabled public Id     empleadoId;
        @AuraEnabled public String nombre;
        @AuraEnabled public String departamento;
        @AuraEnabled public String empresaTitular;
        @AuraEnabled public String dias;   // multipicklist Días fijos teletrabajo (Lunes;...)
    }

    /**
     * Empleados activos (ni baja ni cancelado) con sus días fijos de
     * teletrabajo, para la pestaña Teletrabajo. Como el calendario de
     * ausencias, puentea el sharing para que lo vea todo el equipo.
     */
    @AuraEnabled
    public static List<TeletrabajoDTO> getTeletrabajo() {
        List<TeletrabajoDTO> out = new List<TeletrabajoDTO>();
        for (SFDC_Employee__c e : new EmpleadosSelector().activos()) {
            TeletrabajoDTO dto = new TeletrabajoDTO();
            dto.empleadoId = e.Id;
            String nom = e.Nombre__c;
            String ape = e.Apellidos__c;
            dto.nombre = String.isBlank(ape) ? nom : (String.isBlank(nom) ? ape : nom + ' ' + ape);
            dto.departamento = e.Departamento__c;
            dto.empresaTitular = e.Empresa_titular__c;
            dto.dias = e.D_as_fijos_teletrabajo__c;
            out.add(dto);
        }
        return out;
    }

    // Las fichas de empleado son privadas: el selector puentea el sharing
    // para que la vista de teletrabajo del equipo sea visible para todos
    private without sharing class EmpleadosSelector {
        List<SFDC_Employee__c> activos() {
            return [
                SELECT Id, Nombre__c, Apellidos__c, Departamento__c,
                       Empresa_titular__c, D_as_fijos_teletrabajo__c
                FROM SFDC_Employee__c
                WHERE Estado__c NOT IN ('Baja', 'Cancelado')
                ORDER BY Nombre__c, Apellidos__c
                LIMIT 2000
            ];
        }
    }

    // El objeto Ausencias__c es privado: este selector puentea el sharing para
    // que las ausencias de todo el equipo sean visibles para cualquier usuario
    private without sharing class AusenciasSelector {
        List<Ausencias__c> enRango(Date desde, Date hasta) {
            return [
                SELECT Id, Tipo__c, Estado__c, Horas_D_as__c, Cantidad__c,
                       Fecha_inicio__c, Fecha_Fin__c, Hora_de_Inicio__c, Hora_de_Fin__c,
                       Empleado__c, Empleado__r.Nombre__c, Empleado__r.Apellidos__c,
                       Empleado__r.Departamento__c, Empleado__r.Empresa_titular__c
                FROM Ausencias__c
                WHERE Fecha_inicio__c <= :hasta AND Fecha_Fin__c >= :desde
                  AND Estado__c NOT IN ('Rechazado', 'Anulado')
                  AND Empleado__r.Estado__c NOT IN ('Baja', 'Cancelado')
                ORDER BY Fecha_inicio__c ASC
                LIMIT 5000
            ];
        }
    }

    // Mapeo común de los listados sencillos: Name, empresa/cliente, asesor y estado
    private static List<RegistroDTO> mapRegistros(List<SObject> registros, String campoAsesor, String relAsesor) {
        return mapRegistros(registros, campoAsesor, relAsesor, 'Empresa__c', 'Empresa__r', 'Estado__c', null);
    }

    private static List<RegistroDTO> mapRegistros(List<SObject> registros, String campoAsesor, String relAsesor,
                                                  String campoEmpresa, String relEmpresa, String campoEstado) {
        return mapRegistros(registros, campoAsesor, relAsesor, campoEmpresa, relEmpresa, campoEstado, null);
    }

    private static List<RegistroDTO> mapRegistros(List<SObject> registros, String campoAsesor, String relAsesor,
                                                  String campoEmpresa, String relEmpresa, String campoEstado,
                                                  String campoTitulo) {
        List<RegistroDTO> out = new List<RegistroDTO>();
        for (SObject r : registros) {
            RegistroDTO dto = new RegistroDTO();
            dto.id = (Id) r.get('Id');
            dto.numero = (String) r.get('Name');
            dto.empresaId = (Id) r.get(campoEmpresa);
            SObject emp = r.getSObject(relEmpresa);
            dto.empresa = emp == null ? null : (String) emp.get('Name');
            dto.asesorId = (Id) r.get(campoAsesor);
            SObject ase = r.getSObject(relAsesor);
            dto.asesor = ase == null ? null : (String) ase.get('Name');
            dto.empresaTitularUsuario = ase == null ? null : (String) ase.get('Empresa_Titular__c');
            dto.estado = (String) r.get(campoEstado);
            dto.titulo = campoTitulo == null ? null : (String) r.get(campoTitulo);
            out.add(dto);
        }
        return out;
    }

    // Los contratos fiscal/laboral de la empresa son fórmulas IMAGE con alt Ok o Cruz
    @TestVisible
    private static String estadoContrato(String html) {
        if (String.isBlank(html)) return '';
        String alt = html.contains('alt="') ? html.substringBetween('alt="', '"') : html;
        String a = alt == null ? '' : alt.toLowerCase();
        if (a.contains('ok')) return 'ok';
        if (a.contains('cruz')) return 'cruz';
        return '';
    }

    /**
     * Semáforo de F. Emitidas / F. Recibidas / Bancos a partir del valor del
     * picklist (misma tabla que las fórmulas F_Emitidas_Color__c y compañía):
     * verde = hecho o no tiene, rojo = pendiente en cualquier fase, azul = en
     * agregador bancario, gris = no incluido en servicio o sin valor.
     */
    private static final Set<String> ESTADOS_CONTAB_VERDE = new Set<String>{ 'Contabilizado', 'No tiene' };
    private static final Set<String> ESTADOS_CONTAB_ROJO = new Set<String>{
        'Pendiente', 'En buzón contable', 'En software OCR', 'En gestor documental',
        'Para descargar software', 'Para descargar del banco', 'En oficina' };

    @TestVisible
    private static String colorEstadoContab(String estado) {
        if (String.isBlank(estado)) return 'gris';
        if (estado == 'En agregador bancario') return 'azul';
        if (ESTADOS_CONTAB_VERDE.contains(estado)) return 'verde';
        if (ESTADOS_CONTAB_ROJO.contains(estado)) return 'rojo';
        return 'gris';
    }

    @TestVisible
    private static String colorSemaforo(String html) {
        if (String.isBlank(html)) return 'gris';
        String alt = html.contains('alt="') ? html.substringBetween('alt="', '"') : html;
        String a = alt == null ? '' : alt.toLowerCase();
        if (a.contains('rojo')) return 'rojo';
        if (a.contains('verde')) return 'verde';
        if (a.contains('azul')) return 'azul';
        if (a.contains('amarillo')) return 'amarillo';
        return 'gris';
    }

    private static String entero(Decimal v) {
        return String.valueOf(v == null ? 0 : v.intValue());
    }

    private static void acumular(Map<Id, Map<String, Integer>> store, String clave, List<AggregateResult> ars) {
        for (AggregateResult ar : ars) {
            Id ownerId = (Id) ar.get('o');
            // Solo propietarios de tipo usuario (las colas empiezan por 00G)
            if (ownerId == null || String.valueOf(ownerId).startsWith('00G')) continue;
            if (!store.containsKey(ownerId)) store.put(ownerId, new Map<String, Integer>());
            Map<String, Integer> c = store.get(ownerId);
            c.put(clave, valor(c, clave) + (Integer) ar.get('n'));
        }
    }

    private static Integer valor(Map<String, Integer> c, String clave) {
        return c.containsKey(clave) ? c.get(clave) : 0;
    }

    // ===== Carga de trabajo: usuarios activos del departamento Fiscal y Contable =====
    // Estado de tarea completada (API Completo, etiqueta "Completado")
    private static final String TAREA_ESTADO_COMPLETADA = 'Completo';

    // Tarea legal presentada de un usuario, para la ventana de Carga de trabajo
    public class TareaLegalDTO {
        @AuraEnabled public Id     id;
        @AuraEnabled public Date   vencimiento;      // fecha de vencimiento de la tarea
        @AuraEnabled public Date   vencimientoLegal; // Vto. Legal
        @AuraEnabled public String asunto;
        @AuraEnabled public Id     relacionadoId;
        @AuraEnabled public String relacionado;      // nombre del registro relacionado
        @AuraEnabled public String usuario;          // propietario de la tarea
        @AuraEnabled public String tituloRelacionado; // Título del expediente, si el registro relacionado es un expediente
        @AuraEnabled public String estado;            // etiqueta del estado de la tarea
    }

    /**
     * Tareas legales presentadas por un usuario en los últimos doce meses (el actual
     * incluido, por fecha de vencimiento): tareas completadas con vencimiento legal
     * informado de las que es propietario, de la más reciente a la más antigua. Si el
     * registro relacionado es un expediente, lleva también su título.
     */
    @AuraEnabled
    public static List<TareaLegalDTO> getTareasLegalesUsuario(Id usuarioId) {
        List<TareaLegalDTO> out = new List<TareaLegalDTO>();
        if (usuarioId == null) return out;
        // Nombre del propietario: una sola consulta (Owner.Name de Task no llega relleno en los tests)
        String nombreUsuario;
        for (User u : [SELECT Name FROM User WHERE Id = :usuarioId LIMIT 1]) nombreUsuario = u.Name;
        Date desde = tareasLegalesDesde();
        List<Task> tareas = [
            SELECT Id, ActivityDate, Vencimiento_Legal__c, Subject, WhatId, What.Name, toLabel(Status)
            FROM Task
            WHERE OwnerId = :usuarioId AND Status = :TAREA_ESTADO_COMPLETADA AND Vencimiento_Legal__c != null
              AND ActivityDate >= :desde
            ORDER BY ActivityDate DESC NULLS LAST, Vencimiento_Legal__c DESC
            LIMIT 2000
        ];
        // Título de los expedientes (Proyecto__c) relacionados
        Set<Id> expedienteIds = new Set<Id>();
        for (Task t : tareas) {
            if (t.WhatId != null && t.WhatId.getSObjectType() == Proyecto__c.SObjectType) expedienteIds.add(t.WhatId);
        }
        Map<Id, Proyecto__c> expedientes = expedienteIds.isEmpty()
            ? new Map<Id, Proyecto__c>()
            : new Map<Id, Proyecto__c>([SELECT Id, T_tulo_del_Expediente__c FROM Proyecto__c WHERE Id IN :expedienteIds]);
        for (Task t : tareas) {
            TareaLegalDTO dto = new TareaLegalDTO();
            dto.id = t.Id;
            dto.vencimiento = t.ActivityDate;
            dto.vencimientoLegal = t.Vencimiento_Legal__c;
            dto.asunto = t.Subject;
            dto.relacionadoId = t.WhatId;
            dto.relacionado = t.What == null ? null : t.What.Name;
            dto.tituloRelacionado = expedientes.containsKey(t.WhatId) ? expedientes.get(t.WhatId).T_tulo_del_Expediente__c : null;
            dto.usuario = nombreUsuario;
            dto.estado = t.Status;
            out.add(dto);
        }
        return out;
    }

    // Primer día del mes de hace once meses: los últimos doce meses, el actual incluido
    private static Date tareasLegalesDesde() { return Date.today().toStartOfMonth().addMonths(-11); }

    public class CargaTrabajoDTO {
        @AuraEnabled public Id      usuarioId;
        @AuraEnabled public String  nombre;
        @AuraEnabled public String  empresaTitular; // de la ficha del usuario
        @AuraEnabled public Integer contratos = 0;    // contratos C&F no cerrados como asesor responsable
        @AuraEnabled public Integer contratosGestion = 0;     // de ellos, tipo de servicio Asesoría ("Contable y Fiscal")
        @AuraEnabled public Integer contratosConsultoria = 0; // y tipo de servicio Consultoría ("Fiscal sin gestión contable")
        @AuraEnabled public Decimal igualasAnuales = 0; // suma de Total cuota mensual de esos contratos x 12
        @AuraEnabled public Decimal salarioBrutoAnual;  // Salario Bruto Anual de su ficha de empleado (propietario); null sin ficha
        @AuraEnabled public Integer mensuales = 0;    // obligaciones de alta por periodicidad, como asesor
        @AuraEnabled public Integer trimestrales = 0; // responsable de la obligación, de contratos no cerrados
        @AuraEnabled public Integer anuales = 0;
        @AuraEnabled public Integer sii = 0;          // periodicidad 4/8 días SII
        @AuraEnabled public Integer modelo200 = 0;    // obligaciones del modelo 200 (mismas reglas)
        @AuraEnabled public Integer tareasLegales = 0; // tareas completadas con vencimiento legal informado, como propietario
        @AuraEnabled public List<Integer> codigosErp = new List<Integer>(); // Código ERP de sus contratos, para Sage
        @AuraEnabled public List<ContratoCargaDTO> detalle = new List<ContratoCargaDTO>(); // sus contratos, para el desglose
        @AuraEnabled public Boolean esSinAsesor = false; // fila final con lo que no tiene asesor responsable
    }

    // Contrato asignado de un usuario, con sus obligaciones (las que tienen al
    // usuario como asesor responsable de la obligación), para el desglose
    public class ContratoCargaDTO {
        @AuraEnabled public Id      contratoId;
        @AuraEnabled public String  numero;
        @AuraEnabled public Id      empresaId;      // para poder excluir la empresa del listado
        @AuraEnabled public String  empresa;
        @AuraEnabled public String  tipoServicio;   // Asesoría (gestión contable y fiscal) o Consultoría
        @AuraEnabled public Decimal cuotaMensual = 0;
        @AuraEnabled public Integer codigoErp;      // null si el contrato no lo tiene
        @AuraEnabled public Integer mensuales = 0;
        @AuraEnabled public Integer trimestrales = 0;
        @AuraEnabled public Integer anuales = 0;
        @AuraEnabled public Integer sii = 0;
        @AuraEnabled public Integer modelo200 = 0;
        @AuraEnabled public Boolean ajeno = false;      // contrato de otro asesor en el que este usuario lleva obligaciones
        @AuraEnabled public String  asesorContrato;     // asesor responsable del contrato, cuando es ajeno
    }

    /**
     * Fila del desglose de un usuario para un contrato: la suya si el contrato es de ese
     * usuario; si no, se crea una fila "ajena" (contrato de otro asesor) con los datos básicos
     * del contrato, sin cuota ni código ERP, y se cuelga del usuario.
     */
    private static ContratoCargaDTO detalleDeUsuarioContrato(Map<String, ContratoCargaDTO> porUsuarioContrato,
            Map<Id, CargaTrabajoDTO> porUsuario, Map<Id, Contrato_Contabilidad_y_Fiscal__c> infoAjenos,
            Id usuarioId, Id contratoId) {
        String k = String.valueOf(usuarioId) + '·' + contratoId;
        ContratoCargaDTO det = porUsuarioContrato.get(k);
        if (det != null) return det;
        CargaTrabajoDTO dto = porUsuario.get(usuarioId);
        Contrato_Contabilidad_y_Fiscal__c c = infoAjenos.get(contratoId);
        if (dto == null || c == null) return null;
        det = new ContratoCargaDTO();
        det.contratoId = c.Id;
        det.numero = c.Name;
        det.empresaId = c.Empresa__c;
        det.empresa = c.Empresa__r == null ? null : c.Empresa__r.Name;
        det.ajeno = true;
        det.asesorContrato = c.Asesor_responsable__r == null ? null : c.Asesor_responsable__r.Name;
        det.cuotaMensual = null; // la cuota es del contrato, que no es suyo
        // El código ERP sí viaja, para poder mostrar los movimientos contables de la empresa en su fila
        det.codigoErp = c.C_digo_ERP__c == null ? null : c.C_digo_ERP__c.intValue();
        dto.detalle.add(det);
        porUsuarioContrato.put(k, det);
        return det;
    }

    /**
     * Carga de trabajo: usuarios activos con departamento asignado Fiscal y
     * Contable y, para cada uno, sus contratos contables y fiscales no cerrados
     * como asesor responsable y sus obligaciones tributarias (Impuestos__c) de
     * alta (estado distinto de Baja) ligadas a un contrato no cerrado donde el
     * usuario es el asesor responsable de la obligación, por periodicidad.
     */
    @AuraEnabled
    public static List<CargaTrabajoDTO> getCargaTrabajo(List<Id> empresasExcluidas) {
        // Empresas excluidas por el usuario: sus contratos y obligaciones salen de todos los cálculos
        Set<Id> excl = empresasExcluidas == null ? new Set<Id>() : new Set<Id>(empresasExcluidas);
        Map<Id, CargaTrabajoDTO> porUsuario = new Map<Id, CargaTrabajoDTO>();
        for (User u : [
            SELECT Id, Name, Empresa_Titular__c
            FROM User
            WHERE IsActive = true AND Departamento__c = 'Fiscal y Contable'
            ORDER BY Name ASC
        ]) {
            CargaTrabajoDTO dto = new CargaTrabajoDTO();
            dto.usuarioId = u.Id;
            dto.nombre = u.Name;
            dto.empresaTitular = u.Empresa_Titular__c;
            porUsuario.put(u.Id, dto);
        }
        if (porUsuario.isEmpty()) return new List<CargaTrabajoDTO>();
        for (AggregateResult ar : [
            SELECT Asesor_responsable__c u, Tipo_de_servicio__c tipo, COUNT(Id) n,
                   SUM(Total_cuota_mensual__c) cuota
            FROM Contrato_Contabilidad_y_Fiscal__c
            WHERE Asesor_responsable__c IN :porUsuario.keySet() AND Estado__c != 'Cerrado'
              AND Empresa__c NOT IN :excl
            GROUP BY Asesor_responsable__c, Tipo_de_servicio__c
        ]) {
            CargaTrabajoDTO dto = porUsuario.get((Id) ar.get('u'));
            Integer n = (Integer) ar.get('n');
            dto.contratos += n;
            // Por tipo de servicio: Asesoría (etiqueta "Contable y Fiscal") y
            // Consultoría (etiqueta "Fiscal sin gestión contable")
            String tipo = (String) ar.get('tipo');
            if (tipo == 'Asesoría') dto.contratosGestion += n;
            else if (tipo == 'Consultoría') dto.contratosConsultoria += n;
            // Igualas anuales: la cuota mensual total de sus contratos por doce meses
            Decimal cuota = (Decimal) ar.get('cuota');
            dto.igualasAnuales += cuota == null ? 0 : cuota * 12;
        }
        // Coste anual: Salario Bruto Anual de la ficha de empleado de la que el
        // usuario es propietario (la ficha activa si tuviera varias)
        for (SFDC_Employee__c e : new EmpleadosCargaSelector().porPropietario(porUsuario.keySet())) {
            CargaTrabajoDTO dto = porUsuario.get(e.OwnerId);
            if (dto.salarioBrutoAnual == null || !ESTADOS_EMPLEADO_FUERA.contains(e.Estado__c)) {
                dto.salarioBrutoAnual = e.Salario_Bruto_Anual_A__c;
            }
        }
        // Solo las obligaciones que presenta el despacho: las que presenta el cliente u
        // otro asesor, o sin informar quién presenta, no son carga de trabajo del usuario
        // (mismo criterio que Total por asesores en la pestaña de obligaciones)
        for (AggregateResult ar : [
            SELECT Asesor_responsable__c u, Periodicidad__c per, COUNT(Id) n
            FROM Impuestos__c
            WHERE Asesor_responsable__c IN :porUsuario.keySet()
              AND Estado__c != 'Baja' AND Fecha_Baja__c = null
              AND Presentaci_n_del_impuesto__c = 'Despacho'
              AND Contrato_Contabilidad_y_Fiscal__c != null
              AND Contrato_Contabilidad_y_Fiscal__r.Estado__c != 'Cerrado'
              AND Contrato_Contabilidad_y_Fiscal__r.Empresa__c NOT IN :excl
              AND Periodicidad__c IN ('Mensual', 'Trimestral', 'Anual', '4/8 días SII')
            GROUP BY Asesor_responsable__c, Periodicidad__c
        ]) {
            CargaTrabajoDTO dto = porUsuario.get((Id) ar.get('u'));
            String per = (String) ar.get('per');
            Integer n = (Integer) ar.get('n');
            if (per == 'Mensual') dto.mensuales = n;
            else if (per == 'Trimestral') dto.trimestrales = n;
            else if (per == 'Anual') dto.anuales = n;
            else if (per == '4/8 días SII') dto.sii = n;
        }
        // Modelo 200 asignado: mismas reglas que el resto de obligaciones, solo ese modelo
        for (AggregateResult ar : [
            SELECT Asesor_responsable__c u, COUNT(Id) n
            FROM Impuestos__c
            WHERE Asesor_responsable__c IN :porUsuario.keySet()
              AND Estado__c != 'Baja' AND Fecha_Baja__c = null AND Modelos__c = '200'
              AND Presentaci_n_del_impuesto__c = 'Despacho'
              AND Contrato_Contabilidad_y_Fiscal__c != null
              AND Contrato_Contabilidad_y_Fiscal__r.Estado__c != 'Cerrado'
              AND Contrato_Contabilidad_y_Fiscal__r.Empresa__c NOT IN :excl
            GROUP BY Asesor_responsable__c
        ]) {
            porUsuario.get((Id) ar.get('u')).modelo200 = (Integer) ar.get('n');
        }
        // Tareas legales presentadas: tareas completadas con vencimiento legal informado de
        // los últimos doce meses (por fecha de vencimiento), contadas por propietario
        Date desdeTareas = tareasLegalesDesde();
        for (AggregateResult ar : [
            SELECT OwnerId u, COUNT(Id) n
            FROM Task
            WHERE OwnerId IN :porUsuario.keySet() AND Status = :TAREA_ESTADO_COMPLETADA
              AND Vencimiento_Legal__c != null
              AND ActivityDate >= :desdeTareas
            GROUP BY OwnerId
        ]) {
            porUsuario.get((Id) ar.get('u')).tareasLegales = (Integer) ar.get('n');
        }
        // Detalle de los contratos asignados de cada usuario (para el desglose)
        // y, de los de gestión contable y fiscal (Asesoría) con Código ERP, los
        // códigos para cruzar con Sage: cada código una sola vez por usuario
        Map<Id, ContratoCargaDTO> contratosPorId = new Map<Id, ContratoCargaDTO>();
        Map<Id, Set<Integer>> codigosVistos = new Map<Id, Set<Integer>>();
        for (Contrato_Contabilidad_y_Fiscal__c c : [
            SELECT Id, Name, Empresa__c, Empresa__r.Name, Asesor_responsable__c, Tipo_de_servicio__c,
                   Total_cuota_mensual__c, C_digo_ERP__c
            FROM Contrato_Contabilidad_y_Fiscal__c
            WHERE Asesor_responsable__c IN :porUsuario.keySet() AND Estado__c != 'Cerrado'
              AND Empresa__c NOT IN :excl
            ORDER BY Empresa__r.Name ASC
            LIMIT 5000
        ]) {
            CargaTrabajoDTO dto = porUsuario.get(c.Asesor_responsable__c);
            ContratoCargaDTO det = new ContratoCargaDTO();
            det.contratoId = c.Id;
            det.numero = c.Name;
            det.empresaId = c.Empresa__c;
            det.empresa = c.Empresa__r == null ? null : c.Empresa__r.Name;
            det.tipoServicio = c.Tipo_de_servicio__c;
            det.cuotaMensual = c.Total_cuota_mensual__c == null ? 0 : c.Total_cuota_mensual__c;
            det.codigoErp = c.C_digo_ERP__c == null ? null : c.C_digo_ERP__c.intValue();
            dto.detalle.add(det);
            contratosPorId.put(c.Id, det);
            if (c.Tipo_de_servicio__c == 'Asesoría' && det.codigoErp != null) {
                if (!codigosVistos.containsKey(c.Asesor_responsable__c)) {
                    codigosVistos.put(c.Asesor_responsable__c, new Set<Integer>());
                }
                if (codigosVistos.get(c.Asesor_responsable__c).add(det.codigoErp)) {
                    dto.codigosErp.add(det.codigoErp);
                }
            }
        }
        // Obligaciones del desglose: cada obligación cuenta para SU asesor responsable, en la
        // empresa de su contrato, aunque el contrato lo lleve otro asesor (esas filas van
        // marcadas como ajenas y sin cuota ni Sage, que son datos del contrato). Mismas
        // condiciones que los totales de arriba: de alta, contrato abierto no excluido y
        // presentada por el despacho, para que el desglose sume lo mismo que el total
        Map<String, ContratoCargaDTO> detallePorUsuarioContrato = new Map<String, ContratoCargaDTO>();
        for (Id uid : porUsuario.keySet()) {
            for (ContratoCargaDTO det : porUsuario.get(uid).detalle) {
                detallePorUsuarioContrato.put(String.valueOf(uid) + '·' + det.contratoId, det);
            }
        }
        List<AggregateResult> oblDetalle = [
            SELECT Asesor_responsable__c u, Contrato_Contabilidad_y_Fiscal__c ct,
                   Periodicidad__c per, COUNT(Id) n
            FROM Impuestos__c
            WHERE Asesor_responsable__c IN :porUsuario.keySet()
              AND Estado__c != 'Baja' AND Fecha_Baja__c = null
              AND Presentaci_n_del_impuesto__c = 'Despacho'
              AND Contrato_Contabilidad_y_Fiscal__c != null
              AND Contrato_Contabilidad_y_Fiscal__r.Estado__c != 'Cerrado'
              AND Contrato_Contabilidad_y_Fiscal__r.Empresa__c NOT IN :excl
              AND Periodicidad__c IN ('Mensual', 'Trimestral', 'Anual', '4/8 días SII')
            GROUP BY Asesor_responsable__c, Contrato_Contabilidad_y_Fiscal__c, Periodicidad__c
        ];
        List<AggregateResult> oblDetalle200 = [
            SELECT Asesor_responsable__c u, Contrato_Contabilidad_y_Fiscal__c ct, COUNT(Id) n
            FROM Impuestos__c
            WHERE Asesor_responsable__c IN :porUsuario.keySet()
              AND Estado__c != 'Baja' AND Fecha_Baja__c = null AND Modelos__c = '200'
              AND Presentaci_n_del_impuesto__c = 'Despacho'
              AND Contrato_Contabilidad_y_Fiscal__c != null
              AND Contrato_Contabilidad_y_Fiscal__r.Estado__c != 'Cerrado'
              AND Contrato_Contabilidad_y_Fiscal__r.Empresa__c NOT IN :excl
            GROUP BY Asesor_responsable__c, Contrato_Contabilidad_y_Fiscal__c
        ];
        // Datos básicos de los contratos ajenos que aparecen en algún desglose
        Set<Id> ajenos = new Set<Id>();
        for (AggregateResult ar : oblDetalle) {
            if (!detallePorUsuarioContrato.containsKey(String.valueOf(ar.get('u')) + '·' + ar.get('ct'))) ajenos.add((Id) ar.get('ct'));
        }
        for (AggregateResult ar : oblDetalle200) {
            if (!detallePorUsuarioContrato.containsKey(String.valueOf(ar.get('u')) + '·' + ar.get('ct'))) ajenos.add((Id) ar.get('ct'));
        }
        Map<Id, Contrato_Contabilidad_y_Fiscal__c> infoAjenos = new Map<Id, Contrato_Contabilidad_y_Fiscal__c>();
        if (!ajenos.isEmpty()) {
            infoAjenos = new Map<Id, Contrato_Contabilidad_y_Fiscal__c>([
                SELECT Id, Name, Empresa__c, Empresa__r.Name, Asesor_responsable__r.Name, C_digo_ERP__c
                FROM Contrato_Contabilidad_y_Fiscal__c WHERE Id IN :ajenos
            ]);
        }
        for (AggregateResult ar : oblDetalle) {
            ContratoCargaDTO det = detalleDeUsuarioContrato(detallePorUsuarioContrato, porUsuario, infoAjenos,
                (Id) ar.get('u'), (Id) ar.get('ct'));
            if (det == null) continue;
            String per = (String) ar.get('per');
            Integer n = (Integer) ar.get('n');
            if (per == 'Mensual') det.mensuales = n;
            else if (per == 'Trimestral') det.trimestrales = n;
            else if (per == 'Anual') det.anuales = n;
            else if (per == '4/8 días SII') det.sii = n;
        }
        for (AggregateResult ar : oblDetalle200) {
            ContratoCargaDTO det = detalleDeUsuarioContrato(detallePorUsuarioContrato, porUsuario, infoAjenos,
                (Id) ar.get('u'), (Id) ar.get('ct'));
            if (det != null) det.modelo200 = (Integer) ar.get('n');
        }
        List<CargaTrabajoDTO> out = new List<CargaTrabajoDTO>(porUsuario.values());
        // Fila final "Sin asesor": contratos no cerrados y obligaciones de alta de
        // contratos no cerrados que no tienen asesor responsable informado, para
        // que no se pierdan de vista
        CargaTrabajoDTO sinAsesor = new CargaTrabajoDTO();
        sinAsesor.esSinAsesor = true;
        sinAsesor.nombre = 'Sin asesor responsable';
        for (AggregateResult ar : [
            SELECT Tipo_de_servicio__c tipo, COUNT(Id) n
            FROM Contrato_Contabilidad_y_Fiscal__c
            WHERE Asesor_responsable__c = null AND Estado__c != 'Cerrado'
              AND Empresa__c NOT IN :excl
            GROUP BY Tipo_de_servicio__c
        ]) {
            Integer n = (Integer) ar.get('n');
            sinAsesor.contratos += n;
            String tipo = (String) ar.get('tipo');
            if (tipo == 'Asesoría') sinAsesor.contratosGestion += n;
            else if (tipo == 'Consultoría') sinAsesor.contratosConsultoria += n;
        }
        for (AggregateResult ar : [
            SELECT Periodicidad__c per, COUNT(Id) n
            FROM Impuestos__c
            WHERE Asesor_responsable__c = null
              AND Estado__c != 'Baja' AND Fecha_Baja__c = null
              AND Contrato_Contabilidad_y_Fiscal__c != null
              AND Contrato_Contabilidad_y_Fiscal__r.Estado__c != 'Cerrado'
              AND Contrato_Contabilidad_y_Fiscal__r.Empresa__c NOT IN :excl
              AND Periodicidad__c IN ('Mensual', 'Trimestral', 'Anual', '4/8 días SII')
            GROUP BY Periodicidad__c
        ]) {
            String per = (String) ar.get('per');
            Integer n = (Integer) ar.get('n');
            if (per == 'Mensual') sinAsesor.mensuales = n;
            else if (per == 'Trimestral') sinAsesor.trimestrales = n;
            else if (per == 'Anual') sinAsesor.anuales = n;
            else if (per == '4/8 días SII') sinAsesor.sii = n;
        }
        sinAsesor.modelo200 = [
            SELECT COUNT() FROM Impuestos__c
            WHERE Asesor_responsable__c = null AND Estado__c != 'Baja' AND Fecha_Baja__c = null AND Modelos__c = '200'
              AND Contrato_Contabilidad_y_Fiscal__c != null
              AND Contrato_Contabilidad_y_Fiscal__r.Estado__c != 'Cerrado'
              AND Contrato_Contabilidad_y_Fiscal__r.Empresa__c NOT IN :excl
        ];
        out.add(sinAsesor);
        return out;
    }

    // ===== Movimientos contables de Sage por código de empresa del ERP =====
    private static final String SAGE_SQL_ENDPOINT = 'https://connect.skyvia.com/2v2l1qq7/execute';

    // Movimientos de una empresa del ERP: total y los grabados a mano
    // (TipoEntrada EN Entrada manual y ES Entrada rápida); el resto son automáticos
    public class MovsSageDTO {
        @AuraEnabled public Integer total = 0;
        @AuraEnabled public Integer manual = 0;
    }

    /**
     * Movimientos contables (dbo.Movimientos de Sage) de los últimos 12 meses
     * por código de empresa del ERP: total y manuales, en un solo viaje al
     * endpoint SQL. Va aparte de getCargaTrabajo para no depender de Sage.
     */
    @AuraEnabled
    public static Map<String, MovsSageDTO> getMovimientosContables12m() {
        Date desde = Date.today().addMonths(-12);
        String sql = 'SELECT CodigoEmpresa, COUNT(*) AS n, '
            + 'SUM(CASE WHEN TipoEntrada IN (\'EN\', \'ES\') THEN 1 ELSE 0 END) AS manual '
            + 'FROM dbo.Movimientos '
            + 'WHERE FechaAsiento >= \'' + fechaSqlServer(desde) + '\' GROUP BY CodigoEmpresa';
        Map<String, MovsSageDTO> out = new Map<String, MovsSageDTO>();
        for (Object o : consultarSage(sql)) {
            Map<String, Object> r = (Map<String, Object>) o;
            MovsSageDTO m = new MovsSageDTO();
            m.total = entero(r.get('n'));
            m.manual = r.get('manual') == null ? 0 : entero(r.get('manual'));
            out.put(String.valueOf(r.get('CodigoEmpresa')), m);
        }
        return out;
    }

    // Detalle para los gráficos de la vista de movimientos de Carga de trabajo:
    // una fila por mes del asiento, usuario de Sage que grabó el movimiento y
    // tipo de entrada (manual EN/ES o automática)
    public class MovsSageDetalleDTO {
        @AuraEnabled public Integer anio;
        @AuraEnabled public Integer mes;
        @AuraEnabled public Integer usuario;
        @AuraEnabled public String usuarioNombre;
        @AuraEnabled public String tipoEntrada;      // código TipoEntrada de Sage (EN, ES, FC, PP...)
        @AuraEnabled public String tipoEntradaDesc;  // su concepto según dbo.MovimientosTipoEntrada
        @AuraEnabled public Boolean manual;          // EN o ES
        @AuraEnabled public Integer n;
    }
    // Tipos de entrada de Sage que se consideran grabados a mano
    private static final Set<String> SAGE_TIPOS_MANUALES = new Set<String>{ 'EN', 'ES' };
    public class MovsSageDetalleResultDTO {
        // Primer día del periodo (yyyy-mm-dd): el mismo que usa la columna de la tabla
        @AuraEnabled public String desde;
        @AuraEnabled public List<MovsSageDetalleDTO> filas = new List<MovsSageDetalleDTO>();
    }

    /**
     * Movimientos contables de Sage de los últimos 12 meses de uno o varios
     * códigos de empresa del ERP, agrupados por mes del asiento, usuario que los
     * grabó (lsysUsuarios) y tipo de entrada manual (EN/ES) o automática. Es la
     * fuente de los cuatro gráficos de la vista de movimientos de Carga de trabajo.
     */
    @AuraEnabled
    public static MovsSageDetalleResultDTO getMovimientosContablesDetalle(List<Integer> codigosEmpresa) {
        MovsSageDetalleResultDTO out = new MovsSageDetalleResultDTO();
        Date desde = Date.today().addMonths(-12);
        out.desde = String.valueOf(desde).left(10);
        // Solo enteros en el IN: los códigos llegan del cliente y no se concatenan tal cual
        List<String> codigos = new List<String>();
        if (codigosEmpresa != null) {
            for (Integer c : codigosEmpresa) {
                if (c != null) codigos.add(String.valueOf(c));
            }
        }
        if (codigos.isEmpty()) return out;
        // Una fila por mes, usuario y tipo de entrada; el concepto del tipo sale de la
        // tabla de Sage dbo.MovimientosTipoEntrada (los que no están, los completa el LWC)
        String sql = 'SELECT YEAR(m.FechaAsiento) AS anio, MONTH(m.FechaAsiento) AS mes, '
            + 'm.CodigoUsuario AS usuario, MAX(u.sysUserName) AS nombre, '
            + 'm.TipoEntrada AS tipoEntrada, MAX(te.Descripcion) AS tipoDesc, COUNT(*) AS n '
            + 'FROM dbo.Movimientos m '
            + 'LEFT JOIN dbo.lsysUsuarios u ON u.sysUsuario = m.CodigoUsuario '
            + 'LEFT JOIN dbo.MovimientosTipoEntrada te ON te.TipoEntrada = m.TipoEntrada '
            + 'WHERE m.CodigoEmpresa IN (' + String.join(codigos, ',') + ') '
            + 'AND m.FechaAsiento >= \'' + fechaSqlServer(desde) + '\' '
            + 'GROUP BY YEAR(m.FechaAsiento), MONTH(m.FechaAsiento), m.CodigoUsuario, m.TipoEntrada '
            + 'ORDER BY anio, mes';
        for (Object o : consultarSage(sql)) {
            Map<String, Object> r = (Map<String, Object>) o;
            MovsSageDetalleDTO f = new MovsSageDetalleDTO();
            f.anio = entero(r.get('anio'));
            f.mes = entero(r.get('mes'));
            f.usuario = entero(r.get('usuario'));
            f.usuarioNombre = r.get('nombre') == null ? null : String.valueOf(r.get('nombre')).trim();
            f.tipoEntrada = r.get('tipoEntrada') == null ? '' : String.valueOf(r.get('tipoEntrada')).trim();
            f.tipoEntradaDesc = r.get('tipoDesc') == null ? null : String.valueOf(r.get('tipoDesc')).trim();
            f.manual = SAGE_TIPOS_MANUALES.contains(f.tipoEntrada);
            f.n = entero(r.get('n'));
            out.filas.add(f);
        }
        return out;
    }

    // Un viaje al endpoint SQL de Sage: devuelve las filas ('data') o lanza el
    // error ya traducido para el usuario
    private static List<Object> consultarSage(String sql) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(SAGE_SQL_ENDPOINT);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(120000);
        req.setBody(JSON.serialize(new Map<String, String>{ 'sql' => sql }));
        HttpResponse res;
        try {
            res = new Http().send(req);
        } catch (Exception ex) {
            throw new AuraHandledException('No se pudo conectar con la contabilidad de Sage: ' + ex.getMessage());
        }
        if (res.getStatusCode() != 200) {
            throw new AuraHandledException('La consulta a Sage devolvió el estado ' + res.getStatusCode() + '.');
        }
        Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        if (body.get('data') == null) {
            String msg = (String) body.get('Message');
            throw new AuraHandledException('Error de la consulta a Sage: ' + (String.isBlank(msg) ? res.getBody() : msg));
        }
        return (List<Object>) body.get('data');
    }

    // Los números del JSON de Sage llegan como Integer, Long o Decimal según el valor
    private static Integer entero(Object v) {
        if (v == null) return null;
        if (v instanceof Integer) return (Integer) v;
        if (v instanceof Long) return ((Long) v).intValue();
        if (v instanceof Decimal) return ((Decimal) v).intValue();
        return Integer.valueOf(String.valueOf(v).trim());
    }

    /** Fecha yyyymmdd: SQL Server la interpreta igual en cualquier idioma */
    private static String fechaSqlServer(Date d) {
        return String.valueOf(d.year())
            + (d.month() < 10 ? '0' : '') + d.month()
            + (d.day() < 10 ? '0' : '') + d.day();
    }

    private static final Set<String> ESTADOS_EMPLEADO_FUERA = new Set<String>{ 'Baja', 'Cancelado' };

    // Las fichas de empleado son privadas: este selector puentea el sharing para
    // que la columna de coste anual de Carga de trabajo salga completa
    private without sharing class EmpleadosCargaSelector {
        List<SFDC_Employee__c> porPropietario(Set<Id> propietarios) {
            return [
                SELECT Id, OwnerId, Estado__c, Salario_Bruto_Anual_A__c
                FROM SFDC_Employee__c
                WHERE OwnerId IN :propietarios
                ORDER BY CreatedDate ASC
                LIMIT 2000
            ];
        }
    }
}