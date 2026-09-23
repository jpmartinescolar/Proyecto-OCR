/**
 * Datos del panel del Área de RR.HH: plantilla y KPIs de los empleados,
 * comparativa de ausencias con el año anterior, control de imputación de
 * horas de las últimas cuatro semanas, ausencias por aprobar o completar,
 * personas sin fichar hoy y fichajes sin registro de salida.
 *
 * El panel del Área RR.HH solo es visible para los perfiles de RR.HH y
 * administración (cada método lo exige de nuevo). La pestaña Análisis
 * Imputaciones (incidencias y pendientes) está abierta a todos los usuarios,
 * así que sus métodos no exigen el perfil y las consultas van sin
 * compartición para que el cuadro se vea completo, como el resto de vistas
 * públicas del componente.
 */
public with sharing class AreaRRHHController {

    // Solo estos perfiles pueden ver el Área RR.HH y pedir sus datos
    private static final Set<String> PERFILES_RRHH = new Set<String>{
        'Directora RR.HH', 'System Administrator', 'Administrador del sistema'
    };

    /** Dice al componente si el usuario conectado puede ver el Área RR.HH */
    @AuraEnabled(cacheable=true)
    public static Boolean getAccesoRRHH() {
        return tieneAccesoRRHH();
    }

    private static Boolean tieneAccesoRRHH() {
        return PERFILES_RRHH.contains(
            [SELECT Name FROM Profile WHERE Id = :UserInfo.getProfileId()].Name);
    }

    private static void exigirAccesoRRHH() {
        if (!tieneAccesoRRHH()) {
            throw new AuraHandledException('El Área RR.HH solo está disponible para RR.HH y administración.');
        }
    }

    // Un empleado deja de contar cuando su estado es Baja o Cancelado
    private static final Set<String> ESTADOS_FUERA = new Set<String>{ 'Baja', 'Cancelado' };
    // Las ausencias rechazadas o anuladas no cuentan en ningún cálculo
    private static final Set<String> AUS_DESCARTADAS = new Set<String>{ 'Rechazado', 'Anulado' };
    // La comparativa anual excluye vacaciones, maternidad/paternidad y matrimonio
    private static final Set<String> TIPOS_SIN_COMPARATIVA =
        new Set<String>{ 'Vacaciones', 'Maternidad o Paternidad', 'Matrimonio' };

    public class PanelDTO {
        @AuraEnabled public Integer totalEmpleados;
        @AuraEnabled public Integer variacion12m;
        @AuraEnabled public Decimal edadMedia;
        @AuraEnabled public Integer edadMin;
        @AuraEnabled public Integer edadMax;
        @AuraEnabled public Decimal antiguedadMedia;
        @AuraEnabled public Integer antiguedadMas10;
        @AuraEnabled public List<MesPlantillaDTO> plantilla;
        @AuraEnabled public Integer anioActual;
        @AuraEnabled public List<MesAusenciasDTO> ausenciasMeses;
        @AuraEnabled public Decimal acumActual;
        @AuraEnabled public Decimal acumAnterior;
        @AuraEnabled public Integer mesAcumulado;
        @AuraEnabled public Date inicioVentana;
        @AuraEnabled public List<ImputacionDTO> imputaciones;
        @AuraEnabled public List<AusPendienteDTO> ausPendientes;
        @AuraEnabled public List<PersonaDTO> sinFichar;
        @AuraEnabled public Boolean sinFicharActivo;
        @AuraEnabled public List<FichajeDTO> fichajesIncompletos;
        @AuraEnabled public Integer incidenciasImputaciones;
        @AuraEnabled public Integer ausentesHoy;      // personas con ausencia de día entero hoy
        @AuraEnabled public Integer teletrabajoHoy;   // personas con hoy entre sus días fijos de teletrabajo
        @AuraEnabled public List<NotaGastoDTO> notasGastos; // notas de gastos de empleados pendientes de aprobación
        // Importe de los efectos de proveedores ligados a un empleado (notas de
        // gastos) aún no pagados: estado distinto de Tarjeta, Transferido y Conciliado
        @AuraEnabled public Decimal efectosGastosImporte;
        @AuraEnabled public Integer efectosGastosN;
    }

    // Nota de gastos de un empleado de RR.HH pendiente de aprobación
    public class NotaGastoDTO {
        @AuraEnabled public Id      id;
        @AuraEnabled public String  numero;     // Nº de la nota de gastos
        @AuraEnabled public Date    fecha;      // fecha de la nota de gastos
        @AuraEnabled public Decimal importe;
        @AuraEnabled public Id      empleadoId;
        @AuraEnabled public String  empleado;   // nombre completo del empleado de RR.HH
        @AuraEnabled public String  estado;
    }

    public class MesPlantillaDTO {
        @AuraEnabled public Integer anio;
        @AuraEnabled public Integer mes;
        @AuraEnabled public Integer n;
    }

    public class MesAusenciasDTO {
        @AuraEnabled public Integer mes;
        @AuraEnabled public Decimal actual;
        @AuraEnabled public Decimal anterior;
    }

    public class ImputacionDTO {
        @AuraEnabled public Id empleadoId;
        @AuraEnabled public String nombre;
        @AuraEnabled public String departamento;
        @AuraEnabled public String email;
        @AuraEnabled public Integer pendientes;
        @AuraEnabled public List<String> dias;
    }

    public class AusPendienteDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String numero;
        @AuraEnabled public String nombre;
        @AuraEnabled public String tipo;
        @AuraEnabled public String estado;
        @AuraEnabled public Date inicio;
        @AuraEnabled public Date fin;
        @AuraEnabled public String dias;
        @AuraEnabled public String detalle;
    }

    public class AusenciaMesDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String numero;
        @AuraEnabled public String nombre;
        @AuraEnabled public String tipo;
        @AuraEnabled public String unidad;
        @AuraEnabled public Date inicio;
        @AuraEnabled public Date fin;
        @AuraEnabled public String horaInicio;
        @AuraEnabled public String horaFin;
        @AuraEnabled public String estado;
        @AuraEnabled public Decimal dias;
        @AuraEnabled public String empresaTitular;
    }

    public class PersonaDTO {
        @AuraEnabled public Id empleadoId;
        @AuraEnabled public String nombre;
        @AuraEnabled public String departamento;
    }

    public class FichajeDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String numero;
        @AuraEnabled public String nombre;
        @AuraEnabled public Date fecha;
        @AuraEnabled public String horaEntrada;
        @AuraEnabled public Integer diasSin;
    }

    @AuraEnabled
    public static PanelDTO getPanelRRHH() {
        exigirAccesoRRHH();
        Date hoy = Date.today();
        Selector sel = new Selector();
        // Todos los no cancelados; los activos excluyen también las bajas
        List<SFDC_Employee__c> empleados = sel.empleados();
        List<SFDC_Employee__c> activos = new List<SFDC_Employee__c>();
        for (SFDC_Employee__c e : empleados) {
            if (!ESTADOS_FUERA.contains(e.Estado__c)) activos.add(e);
        }

        PanelDTO p = new PanelDTO();
        p.totalEmpleados = activos.size();
        calcularEdadAntiguedad(p, activos, hoy);
        p.plantilla = calcularPlantilla(empleados, hoy);
        p.variacion12m = p.totalEmpleados - p.plantilla[0].n;
        calcularComparativaAusencias(p, sel, hoy);
        calcularImputaciones(p, sel, activos, hoy);
        p.ausPendientes = calcularAusPendientes(sel, hoy);
        calcularSinFichar(p, sel, activos, hoy);
        p.fichajesIncompletos = calcularFichajesIncompletos(sel, hoy);
        p.incidenciasImputaciones = sel.contarIncidenciasImputaciones();
        p.notasGastos = calcularNotasGastos(sel);
        AggregateResult efectos = sel.efectosGastosPendientes();
        p.efectosGastosImporte = efectos == null || efectos.get('total') == null
            ? 0 : (Decimal) efectos.get('total');
        p.efectosGastosN = efectos == null || efectos.get('n') == null ? 0 : (Integer) efectos.get('n');
        return p;
    }

    public class PendientesDTO {
        @AuraEnabled public Date inicioVentana;
        @AuraEnabled public List<ImputacionDTO> imputaciones;
    }

    /**
     * Cuadro de imputaciones pendientes de las 4 últimas semanas completas
     * para la subpestaña Pendiente imputaciones, abierta a todos los usuarios:
     * no exige el perfil de RR.HH ni carga el resto del panel.
     */
    @AuraEnabled
    public static PendientesDTO getImputacionesPendientes() {
        Date hoy = Date.today();
        Selector sel = new Selector();
        List<SFDC_Employee__c> activos = new List<SFDC_Employee__c>();
        for (SFDC_Employee__c e : sel.empleados()) {
            if (!ESTADOS_FUERA.contains(e.Estado__c)) activos.add(e);
        }
        PanelDTO tmp = new PanelDTO();
        calcularImputaciones(tmp, sel, activos, hoy);
        PendientesDTO out = new PendientesDTO();
        out.inicioVentana = tmp.inicioVentana;
        out.imputaciones = tmp.imputaciones;
        return out;
    }

    public class IncImputacionDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String numero;
        @AuraEnabled public String estado;
        @AuraEnabled public Date fecha;
        @AuraEnabled public String igualaFiscal;
        @AuraEnabled public String igualaLaboral;
        @AuraEnabled public String tipo;
        @AuraEnabled public String subtipo;
        @AuraEnabled public Decimal duracion;
        @AuraEnabled public String duracionHHMM;
        @AuraEnabled public String descripcion;
        @AuraEnabled public String cuenta;
        @AuraEnabled public String grupo;
        @AuraEnabled public String nombre;
        @AuraEnabled public String motivo;
        @AuraEnabled public String nota;
    }

    /**
     * Incidencias de imputaciones para su listado: origen Otros, sin validar,
     * en el tramo de fechas indicado (por defecto del 1 de enero de 2026 a hoy).
     * Abierta a todos los usuarios, como toda la pestaña Análisis Imputaciones.
     */
    @AuraEnabled
    public static List<IncImputacionDTO> getIncidenciasImputaciones(Date desde, Date hasta) {
        Selector sel = new Selector();
        List<Imputaci_n_horas__c> registros = sel.incidenciasImputaciones(desde, hasta);
        Set<Id> clientes = new Set<Id>();
        for (Imputaci_n_horas__c i : registros) {
            if (i.Cliente__c != null) clientes.add(i.Cliente__c);
        }
        Set<Id> conLaboral = sel.empresasConContratoLaboral(clientes);
        Set<Id> conFiscal = sel.empresasConContratoFiscal(clientes);
        List<IncImputacionDTO> out = new List<IncImputacionDTO>();
        for (Imputaci_n_horas__c i : registros) {
            IncImputacionDTO dto = new IncImputacionDTO();
            dto.id = i.Id;
            dto.numero = i.Name;
            dto.estado = i.Estado__c;
            dto.fecha = i.Fecha_imputaci_n__c;
            dto.igualaFiscal = i.Iguala_Fiscal__c;
            dto.igualaLaboral = i.iguala_laboral__c;
            dto.tipo = i.Tipo_de_Imputaci_n__c;
            dto.subtipo = i.Subtipo__c;
            dto.duracion = i.Duraci_n__c;
            dto.duracionHHMM = i.Duraci_n_HH_MM__c;
            dto.descripcion = i.Descripci_n__c;
            dto.cuenta = i.Nombre_de_la_cuenta__c;
            dto.grupo = i.Grupo_Empresarial__c;
            dto.nombre = i.Nombre_y_Apellidos__c;
            dto.motivo = i.Motivo_de_origen_otros__c;
            dto.nota = notaContrato(i, conLaboral, conFiscal);
            out.add(dto);
        }
        return out;
    }

    /**
     * Nota de la incidencia: cuando es de subtipo Laboral sin iguala laboral
     * (o Fiscal y Contable sin iguala fiscal) se indica si la empresa ha
     * tenido alguna vez un contrato de ese tipo. En el resto de subtipos
     * no hay nota.
     */
    private static String notaContrato(Imputaci_n_horas__c i, Set<Id> conLaboral, Set<Id> conFiscal) {
        String subtipo = i.Subtipo__c == null ? '' : i.Subtipo__c.trim().toLowerCase();
        if (subtipo == 'laboral' && esNo(i.iguala_laboral__c)) {
            return i.Cliente__c != null && conLaboral.contains(i.Cliente__c)
                ? 'Ha tenido un contrato laboral' : 'Nunca ha tenido contrato laboral';
        }
        if (subtipo == 'fiscal y contable' && esNo(i.Iguala_Fiscal__c)) {
            return i.Cliente__c != null && conFiscal.contains(i.Cliente__c)
                ? 'Ha tenido un contrato fiscal' : 'Nunca ha tenido contrato fiscal';
        }
        return null;
    }

    private static Boolean esNo(String valor) {
        return valor != null && valor.trim().equalsIgnoreCase('no');
    }

    /** Cambia el estado de una imputación desde el listado de incidencias */
    @AuraEnabled
    public static void actualizarEstadoImputacion(Id imputacionId, String estado) {
        if (imputacionId == null || String.isBlank(estado)) {
            throw new AuraHandledException('Faltan el registro o el estado.');
        }
        new Selector().actualizarEstado(new Imputaci_n_horas__c(Id = imputacionId, Estado__c = estado));
    }

    /**
     * Borra un registro horario desde la lista de fichajes incompletos.
     * Los usuarios de Experience no pueden borrar registros ajenos por
     * compartición, así que el borrado va sin compartir; el acceso ya lo
     * limita el propio Área RR.HH por perfil.
     */
    @AuraEnabled
    public static void borrarRegistroHorario(Id registroId) {
        exigirAccesoRRHH();
        if (registroId == null) {
            throw new AuraHandledException('Falta el registro horario a borrar.');
        }
        new BorradoRegistroHorario().borrar(registroId);
    }

    private without sharing class BorradoRegistroHorario {
        void borrar(Id registroId) {
            delete [SELECT Id FROM Registro_Horario__c WHERE Id = :registroId];
        }
    }

    /**
     * Envía el recordatorio de imputación al correo de la ficha del empleado.
     * Sale con la dirección del usuario conectado como remitente (comportamiento
     * por defecto de los correos de Apex).
     */
    @AuraEnabled
    public static void enviarRecordatorioImputacion(String destinatario, String asunto, String cuerpo) {
        if (String.isBlank(destinatario)) {
            throw new AuraHandledException('El empleado no tiene correo electrónico en su ficha.');
        }
        Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
        mail.setToAddresses(new List<String>{ destinatario });
        mail.setSubject(asunto);
        mail.setPlainTextBody(cuerpo);
        try {
            Messaging.sendEmail(new List<Messaging.SingleEmailMessage>{ mail });
        } catch (System.EmailException e) {
            if (e.getMessage().contains('NO_SINGLE_MAIL_PERMISSION')) {
                throw new AuraHandledException('El envío de correo está desactivado en este entorno. '
                    + 'En Configuración → Capacidad de entrega, el nivel de acceso debe ser '
                    + '"Todos los mensajes de correo electrónico".');
            }
            throw new AuraHandledException('No se pudo enviar el correo: ' + e.getMessage());
        }
    }

    /**
     * Ausencias iniciadas en el mes pinchado en la comparativa, con los mismos
     * filtros de tipo y estado que las barras; la columna de días es el campo
     * Total días de cada ficha.
     */
    @AuraEnabled
    public static List<AusenciaMesDTO> getAusenciasMes(Integer anio, Integer mes) {
        exigirAccesoRRHH();
        Date desde = Date.newInstance(anio, mes, 1);
        return mapAusencias(new Selector().ausenciasIniciadas(desde, desde.addMonths(1).addDays(-1)));
    }

    /**
     * Listado completo de las ausencias del año actual y del anterior con los
     * mismos filtros de la comparativa, para el desglose con el total de días.
     */
    @AuraEnabled
    public static List<AusenciaMesDTO> getAusenciasListado() {
        exigirAccesoRRHH();
        Integer anio = Date.today().year();
        return mapAusencias(new Selector().ausenciasIniciadas(
            Date.newInstance(anio - 1, 1, 1), Date.newInstance(anio, 12, 31)));
    }

    private static List<AusenciaMesDTO> mapAusencias(List<Ausencias__c> ausencias) {
        List<AusenciaMesDTO> out = new List<AusenciaMesDTO>();
        for (Ausencias__c a : ausencias) {
            AusenciaMesDTO dto = new AusenciaMesDTO();
            dto.id = a.Id;
            dto.numero = a.Name;
            dto.nombre = nombreCompleto(a.Empleado__r);
            dto.empresaTitular = a.Empleado__r == null ? null : a.Empleado__r.Empresa_titular__c;
            dto.tipo = a.Tipo__c;
            dto.unidad = a.Horas_D_as__c;
            dto.inicio = a.Fecha_inicio__c;
            dto.fin = a.Fecha_Fin__c;
            dto.horaInicio = hora(a.Hora_de_Inicio__c);
            dto.horaFin = hora(a.Hora_de_Fin__c);
            dto.estado = a.Estado__c;
            dto.dias = a.Total_d_as__c;
            out.add(dto);
        }
        return out;
    }

    private static String hora(Time t) {
        if (t == null) return null;
        return (t.hour() < 10 ? '0' : '') + t.hour() + ':' + (t.minute() < 10 ? '0' : '') + t.minute();
    }

    private static void calcularEdadAntiguedad(PanelDTO p, List<SFDC_Employee__c> activos, Date hoy) {
        Decimal sumaEdad = 0; Integer nEdad = 0;
        Decimal sumaAnt = 0; Integer nAnt = 0;
        p.edadMin = null; p.edadMax = null; p.antiguedadMas10 = 0;
        for (SFDC_Employee__c e : activos) {
            if (e.Fecha_de_nacimiento__c != null) {
                Decimal edad = e.Fecha_de_nacimiento__c.daysBetween(hoy) / 365.25;
                // Fechas de nacimiento mal informadas (edades imposibles) no cuentan
                if (edad >= 14) {
                    sumaEdad += edad; nEdad++;
                    Integer anios = edad.intValue();
                    if (p.edadMin == null || anios < p.edadMin) p.edadMin = anios;
                    if (p.edadMax == null || anios > p.edadMax) p.edadMax = anios;
                }
            }
            if (e.Hire_Date__c != null) {
                Decimal ant = e.Hire_Date__c.daysBetween(hoy) / 365.25;
                sumaAnt += ant; nAnt++;
                if (ant >= 10) p.antiguedadMas10++;
            }
        }
        p.edadMedia = nEdad == 0 ? 0 : (sumaEdad / nEdad).setScale(1);
        p.antiguedadMedia = nAnt == 0 ? 0 : (sumaAnt / nAnt).setScale(1);
    }

    // Empleados al cierre de cada uno de los últimos 12 meses cerrados según
    // las fechas de inicio y fin de contrato (el mes en curso no se muestra)
    private static List<MesPlantillaDTO> calcularPlantilla(List<SFDC_Employee__c> empleados, Date hoy) {
        List<MesPlantillaDTO> out = new List<MesPlantillaDTO>();
        for (Integer i = 12; i >= 1; i--) {
            Date primero = hoy.toStartOfMonth().addMonths(-i);
            Date cierre = primero.addMonths(1).addDays(-1);
            MesPlantillaDTO m = new MesPlantillaDTO();
            m.anio = primero.year();
            m.mes = primero.month();
            m.n = 0;
            for (SFDC_Employee__c e : empleados) {
                if (e.Hire_Date__c == null || e.Hire_Date__c > cierre) continue;
                if (e.Termination_Date__c != null && e.Termination_Date__c < cierre) continue;
                m.n++;
            }
            out.add(m);
        }
        return out;
    }

    // Días de ausencia por mes del año actual y del anterior, de todos los
    // empleados (actuales o no), sin vacaciones, maternidad/paternidad ni
    // matrimonio. Cada ausencia suma el campo Total días de su ficha en el
    // mes de su fecha de inicio, incluidas las ausencias por horas.
    private static void calcularComparativaAusencias(PanelDTO p, Selector sel, Date hoy) {
        Integer anio = hoy.year();
        p.anioActual = anio;
        Map<Integer, Decimal> porMesActual = new Map<Integer, Decimal>();
        Map<Integer, Decimal> porMesAnterior = new Map<Integer, Decimal>();
        for (Ausencias__c a : sel.ausenciasIniciadas(
                Date.newInstance(anio - 1, 1, 1), Date.newInstance(anio, 12, 31))) {
            if (a.Fecha_inicio__c == null || a.Total_d_as__c == null) continue;
            Map<Integer, Decimal> destino = a.Fecha_inicio__c.year() == anio ? porMesActual : porMesAnterior;
            Integer m = a.Fecha_inicio__c.month();
            Decimal acumulado = destino.containsKey(m) ? destino.get(m) : 0;
            destino.put(m, acumulado + a.Total_d_as__c);
        }
        p.ausenciasMeses = new List<MesAusenciasDTO>();
        p.acumActual = 0; p.acumAnterior = 0;
        p.mesAcumulado = hoy.month() > 1 ? hoy.month() - 1 : 1;
        for (Integer m = 1; m <= 12; m++) {
            MesAusenciasDTO dto = new MesAusenciasDTO();
            dto.mes = m;
            dto.actual = porMesActual.containsKey(m) ? porMesActual.get(m) : 0;
            dto.anterior = porMesAnterior.containsKey(m) ? porMesAnterior.get(m) : 0;
            p.ausenciasMeses.add(dto);
            if (m <= p.mesAcumulado) {
                p.acumActual += dto.actual;
                p.acumAnterior += dto.anterior;
            }
        }
    }

    // Ventana de cuatro semanas (las tres anteriores y la actual, de lunes a
    // domingo). Cada día laborable de un empleado con obligación de imputar
    // debe tener alguna imputación, salvo ausencia de día entero o que el día
    // quede fuera de su contrato; los días desde hoy aún no se exigen.
    private static void calcularImputaciones(PanelDTO p, Selector sel, List<SFDC_Employee__c> activos, Date hoy) {
        // Las 4 últimas semanas completas: la semana en curso queda siempre fuera
        Date lunes = hoy.addDays(-Math.mod(Date.newInstance(1900, 1, 1).daysBetween(hoy), 7));
        Date inicio = lunes.addDays(-28);
        p.inicioVentana = inicio;

        List<SFDC_Employee__c> obligados = new List<SFDC_Employee__c>();
        for (SFDC_Employee__c e : activos) {
            if (e.Obligaci_n_imputar_horas__c == 'Si') obligados.add(e);
        }
        Set<Id> ids = new Map<Id, SFDC_Employee__c>(obligados).keySet();

        // Días con imputación por empleado, semana a semana para no rozar el
        // límite de filas de las consultas agregadas
        Set<String> imputados = new Set<String>();
        for (Integer s = 0; s < 4; s++) {
            for (AggregateResult ar : sel.diasImputados(ids, inicio.addDays(s * 7), inicio.addDays(s * 7 + 6))) {
                // La fecha agrupada llega con hora (yyyy-MM-dd 00:00:00): la clave usa solo el día
                imputados.add(String.valueOf(ar.get('e')) + '|' + String.valueOf(ar.get('f')).left(10));
            }
        }

        // Ausencias de día entero de la ventana por empleado
        Map<Id, List<Ausencias__c>> ausPorEmp = new Map<Id, List<Ausencias__c>>();
        for (Ausencias__c a : sel.ausenciasDiaEntero(ids, inicio, inicio.addDays(27))) {
            if (!ausPorEmp.containsKey(a.Empleado__c)) ausPorEmp.put(a.Empleado__c, new List<Ausencias__c>());
            ausPorEmp.get(a.Empleado__c).add(a);
        }

        p.imputaciones = new List<ImputacionDTO>();
        for (SFDC_Employee__c e : obligados) {
            ImputacionDTO dto = new ImputacionDTO();
            dto.empleadoId = e.Id;
            dto.nombre = nombreCompleto(e);
            dto.departamento = e.Departamento__c;
            dto.email = e.Correo_Electr_nico__c;
            dto.dias = new List<String>();
            dto.pendientes = 0;
            for (Integer i = 0; i < 28; i++) {
                Date d = inicio.addDays(i);
                dto.dias.add(estadoDia(e, d, hoy, imputados, ausPorEmp.get(e.Id)));
            }
            for (String estado : dto.dias) {
                if (estado == 'pendiente') dto.pendientes++;
            }
            p.imputaciones.add(dto);
        }
    }

    private static String estadoDia(SFDC_Employee__c e, Date d, Date hoy,
                                    Set<String> imputados, List<Ausencias__c> ausencias) {
        Integer dow = Math.mod(Date.newInstance(1900, 1, 1).daysBetween(d), 7);
        if (dow >= 5) return 'finde';
        if (e.Hire_Date__c == null || d < e.Hire_Date__c) return 'fuera';
        if (e.Termination_Date__c != null && d > e.Termination_Date__c) return 'fuera';
        if (imputados.contains(String.valueOf(e.Id) + '|' + String.valueOf(d))) return 'imputado';
        if (ausencias != null) {
            for (Ausencias__c a : ausencias) {
                Date fin = a.Fecha_Fin__c == null ? a.Fecha_inicio__c : a.Fecha_Fin__c;
                if (a.Fecha_inicio__c <= d && d <= fin) return 'ausencia';
            }
        }
        if (d >= hoy) return 'futuro';
        return 'pendiente';
    }

    // Ausencias con estado Solicitado (por aprobar) o Aprobado (por completar)
    private static List<AusPendienteDTO> calcularAusPendientes(Selector sel, Date hoy) {
        List<AusPendienteDTO> out = new List<AusPendienteDTO>();
        for (Ausencias__c a : sel.ausenciasPendientes()) {
            AusPendienteDTO dto = new AusPendienteDTO();
            dto.id = a.Id;
            dto.numero = a.Name;
            dto.nombre = nombreCompleto(a.Empleado__r);
            dto.tipo = a.Tipo__c;
            dto.estado = a.Estado__c == 'Solicitado' ? 'Por aprobar' : 'Por completar';
            dto.inicio = a.Fecha_inicio__c;
            dto.fin = a.Fecha_Fin__c;
            if (a.Horas_D_as__c == 'Horas') {
                dto.dias = (a.Cantidad__c == null ? 'Por horas' : quitarDecimales(a.Cantidad__c) + ' h');
            } else {
                Integer n = a.Cantidad__c != null ? a.Cantidad__c.intValue()
                    : (a.Fecha_inicio__c == null || a.Fecha_Fin__c == null ? 1
                        : a.Fecha_inicio__c.daysBetween(a.Fecha_Fin__c) + 1);
                dto.dias = n + (n == 1 ? ' día' : ' días');
            }
            if (a.Estado__c == 'Solicitado') {
                Integer hace = a.CreatedDate.date().daysBetween(hoy);
                dto.detalle = hace <= 0 ? 'Solicitado hoy' : 'Solicitado hace ' + hace + (hace == 1 ? ' día' : ' días');
            } else if (a.Fecha_Fin__c != null && a.Fecha_Fin__c < hoy) {
                Integer hace = a.Fecha_Fin__c.daysBetween(hoy);
                dto.detalle = 'Finalizó hace ' + hace + (hace == 1 ? ' día' : ' días');
            } else if (a.Fecha_inicio__c != null && a.Fecha_inicio__c > hoy) {
                Integer faltan = hoy.daysBetween(a.Fecha_inicio__c);
                dto.detalle = 'Empieza en ' + faltan + (faltan == 1 ? ' día' : ' días');
            } else {
                dto.detalle = 'En curso';
            }
            out.add(dto);
        }
        return out;
    }

    // Empleados con obligación de fichar que a las 10:00 no tienen registro de
    // entrada hoy, descontando a los ausentes de día entero
    private static void calcularSinFichar(PanelDTO p, Selector sel, List<SFDC_Employee__c> activos, Date hoy) {
        Set<Id> idsActivos = new Map<Id, SFDC_Employee__c>(activos).keySet();
        Set<Id> ausentesHoy = new Set<Id>();
        for (Ausencias__c a : sel.ausenciasDiaEntero(idsActivos, hoy, hoy)) {
            ausentesHoy.add(a.Empleado__c);
        }
        p.ausentesHoy = ausentesHoy.size();
        p.teletrabajoHoy = contarTeletrabajoHoy(activos, hoy);
        // Los sábados y domingos no se ficha: la caja queda vacía e inactiva
        Integer dow = Math.mod(Date.newInstance(1900, 1, 1).daysBetween(hoy), 7);
        if (dow >= 5) {
            p.sinFicharActivo = false;
            p.sinFichar = new List<PersonaDTO>();
            return;
        }
        p.sinFicharActivo = Integer.valueOf(Datetime.now().format('H')) >= 10;
        Set<Id> conFichaje = sel.empleadosFichadosHoy();
        p.sinFichar = new List<PersonaDTO>();
        for (SFDC_Employee__c e : activos) {
            if (e.Obligaci_n_fichaje__c != 'Si') continue;
            if (e.Hire_Date__c == null || e.Hire_Date__c > hoy) continue;
            if (e.Termination_Date__c != null && e.Termination_Date__c < hoy) continue;
            if (conFichaje.contains(e.Id) || ausentesHoy.contains(e.Id)) continue;
            PersonaDTO dto = new PersonaDTO();
            dto.empleadoId = e.Id;
            dto.nombre = nombreCompleto(e);
            dto.departamento = e.Departamento__c;
            p.sinFichar.add(dto);
        }
    }

    // Personas activas con el día de hoy entre sus días fijos de teletrabajo
    // (multiselección Lunes;Martes;… de la ficha del empleado); 0 en fin de semana
    private static Integer contarTeletrabajoHoy(List<SFDC_Employee__c> activos, Date hoy) {
        Integer dow = Math.mod(Date.newInstance(1900, 1, 1).daysBetween(hoy), 7);
        if (dow >= 5) return 0;
        String nombreDia = new List<String>{ 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes' }[dow];
        Integer n = 0;
        for (SFDC_Employee__c e : activos) {
            if (String.isBlank(e.D_as_fijos_teletrabajo__c)) continue;
            if (e.D_as_fijos_teletrabajo__c.split(';').contains(nombreDia)) n++;
        }
        return n;
    }

    // Registros horarios de días anteriores de empleados actuales sin la parte
    // de salida registrada
    private static List<FichajeDTO> calcularFichajesIncompletos(Selector sel, Date hoy) {
        List<FichajeDTO> out = new List<FichajeDTO>();
        for (Registro_Horario__c r : sel.fichajesSinSalida()) {
            FichajeDTO dto = new FichajeDTO();
            dto.id = r.Id;
            dto.numero = r.Name;
            dto.nombre = nombreCompleto(r.Recursos_Humanos__r);
            dto.fecha = r.Fecha_hora_Registro__c.date();
            dto.horaEntrada = r.Fecha_hora_Registro__c.format('HH:mm');
            dto.diasSin = r.Fecha_hora_Registro__c.date().daysBetween(hoy);
            out.add(dto);
        }
        return out;
    }

    // Notas de gastos para aprobar: registros de Nota de gastos con empleado de
    // RR.HH informado y estado "Pendiente aprobación" (valor No), las de fecha
    // más antigua primero
    private static List<NotaGastoDTO> calcularNotasGastos(Selector sel) {
        List<NotaGastoDTO> out = new List<NotaGastoDTO>();
        for (Gastos_de_viaje_o_representaci_n__c g : sel.notasGastosPendientes()) {
            NotaGastoDTO dto = new NotaGastoDTO();
            dto.id = g.Id;
            dto.numero = g.Name;
            dto.fecha = g.Fecha__c;
            dto.importe = g.Importe__c;
            dto.empleadoId = g.RR_HH__c;
            dto.empleado = nombreCompleto(g.RR_HH__r);
            dto.estado = 'Pendiente aprobación';
            out.add(dto);
        }
        return out;
    }

    private static String nombreCompleto(SFDC_Employee__c e) {
        if (e == null) return null;
        String nom = e.Nombre__c;
        String ape = e.Apellidos__c;
        return String.isBlank(ape) ? nom : (String.isBlank(nom) ? ape : nom + ' ' + ape);
    }

    private static String quitarDecimales(Decimal v) {
        return v == v.intValue() ? String.valueOf(v.intValue()) : String.valueOf(v);
    }

    // Los datos de RR.HH son sensibles: el selector respeta el sharing
    // Sin compartición: el área está protegida por perfil y las vistas
    // públicas de imputaciones deben mostrar el cuadro completo a todos
    private without sharing class Selector {

        List<SFDC_Employee__c> empleados() {
            return [
                SELECT Id, Nombre__c, Apellidos__c, Departamento__c, Estado__c,
                       Fecha_de_nacimiento__c, Hire_Date__c, Termination_Date__c,
                       Obligaci_n_imputar_horas__c, Obligaci_n_fichaje__c, Correo_Electr_nico__c,
                       D_as_fijos_teletrabajo__c
                FROM SFDC_Employee__c
                WHERE Estado__c != 'Cancelado'
                ORDER BY Apellidos__c, Nombre__c
                LIMIT 5000
            ];
        }

        List<AggregateResult> diasImputados(Set<Id> ids, Date desde, Date hasta) {
            return [
                SELECT RR_HH__c e, Fecha_imputaci_n__c f
                FROM Imputaci_n_horas__c
                WHERE RR_HH__c IN :ids
                  AND Fecha_imputaci_n__c >= :desde AND Fecha_imputaci_n__c <= :hasta
                GROUP BY RR_HH__c, Fecha_imputaci_n__c
            ];
        }

        List<Ausencias__c> ausenciasDiaEntero(Set<Id> ids, Date desde, Date hasta) {
            return [
                SELECT Empleado__c, Fecha_inicio__c, Fecha_Fin__c
                FROM Ausencias__c
                WHERE Empleado__c IN :ids
                  AND Estado__c NOT IN :AUS_DESCARTADAS
                  AND Horas_D_as__c != 'Horas'
                  AND Fecha_inicio__c <= :hasta AND Fecha_Fin__c >= :desde
                LIMIT 5000
            ];
        }

        // Ausencias con fecha de inicio en el rango, con los filtros de la
        // comparativa; sirven tanto para las barras como para los listados
        List<Ausencias__c> ausenciasIniciadas(Date desde, Date hasta) {
            return [
                SELECT Id, Name, Tipo__c, Estado__c, Horas_D_as__c, Total_d_as__c,
                       Fecha_inicio__c, Fecha_Fin__c, Hora_de_Inicio__c, Hora_de_Fin__c,
                       Empleado__r.Nombre__c, Empleado__r.Apellidos__c,
                       Empleado__r.Empresa_titular__c
                FROM Ausencias__c
                WHERE Estado__c NOT IN :AUS_DESCARTADAS
                  AND (NOT Tipo__c IN :TIPOS_SIN_COMPARATIVA)
                  AND Fecha_inicio__c >= :desde AND Fecha_inicio__c <= :hasta
                ORDER BY Fecha_inicio__c ASC
                LIMIT 10000
            ];
        }

        // Las aprobadas que aún no han terminado (fecha fin hoy o futura) no se
        // pueden completar todavía, así que no cuentan como pendientes
        List<Ausencias__c> ausenciasPendientes() {
            return [
                SELECT Id, Name, Tipo__c, Estado__c, Horas_D_as__c, Cantidad__c,
                       Fecha_inicio__c, Fecha_Fin__c, CreatedDate,
                       Empleado__r.Nombre__c, Empleado__r.Apellidos__c
                FROM Ausencias__c
                WHERE Estado__c IN ('Solicitado', 'Aprobado')
                  AND (Estado__c = 'Solicitado' OR Fecha_Fin__c = null OR Fecha_Fin__c < TODAY)
                  AND Empleado__r.Estado__c NOT IN :ESTADOS_FUERA
                ORDER BY Fecha_inicio__c ASC
                LIMIT 200
            ];
        }

        Set<Id> empleadosFichadosHoy() {
            Set<Id> ids = new Set<Id>();
            for (AggregateResult ar : [
                SELECT Recursos_Humanos__c e
                FROM Registro_Horario__c
                WHERE Fecha_hora_Registro__c = TODAY AND Recursos_Humanos__c != null
                GROUP BY Recursos_Humanos__c
            ]) {
                ids.add((Id) ar.get('e'));
            }
            return ids;
        }

        // Incidencias de imputaciones: origen Otros, sin validar, desde 2026
        Integer contarIncidenciasImputaciones() {
            return [
                SELECT COUNT() FROM Imputaci_n_horas__c
                WHERE Origen_de_la_imputaci_n__c = 'Otros'
                  AND Estado__c != 'Validado'
                  AND Fecha_imputaci_n__c > 2026-01-01
            ];
        }

        List<Imputaci_n_horas__c> incidenciasImputaciones(Date desde, Date hasta) {
            Date ini = desde != null ? desde : Date.newInstance(2026, 1, 1);
            Date fin = hasta != null ? hasta : Date.today();
            return [
                SELECT Id, Name, Estado__c, Fecha_imputaci_n__c, Iguala_Fiscal__c, iguala_laboral__c,
                       toLabel(Tipo_de_Imputaci_n__c), Subtipo__c, Duraci_n__c, Duraci_n_HH_MM__c, Descripci_n__c,
                       Nombre_de_la_cuenta__c, Grupo_Empresarial__c, Nombre_y_Apellidos__c,
                       Motivo_de_origen_otros__c, Cliente__c
                FROM Imputaci_n_horas__c
                WHERE Origen_de_la_imputaci_n__c = 'Otros'
                  AND Estado__c != 'Validado'
                  AND Fecha_imputaci_n__c >= :ini
                  AND Fecha_imputaci_n__c <= :fin
                ORDER BY Fecha_imputaci_n__c DESC
                LIMIT 2000
            ];
        }

        // El cambio de estado desde el listado público de incidencias
        void actualizarEstado(Imputaci_n_horas__c registro) {
            update registro;
        }

        // Empresas de la lista que han tenido algún contrato de asesoría laboral
        Set<Id> empresasConContratoLaboral(Set<Id> empresas) {
            Set<Id> con = new Set<Id>();
            if (empresas.isEmpty()) return con;
            for (AggregateResult ar : [
                SELECT Empresa__c emp FROM Contrato_asesor_a_laboral__c
                WHERE Empresa__c IN :empresas GROUP BY Empresa__c
            ]) {
                con.add((Id) ar.get('emp'));
            }
            return con;
        }

        // Empresas de la lista que han tenido algún contrato de contabilidad y fiscal
        Set<Id> empresasConContratoFiscal(Set<Id> empresas) {
            Set<Id> con = new Set<Id>();
            if (empresas.isEmpty()) return con;
            for (AggregateResult ar : [
                SELECT Empresa__c emp FROM Contrato_Contabilidad_y_Fiscal__c
                WHERE Empresa__c IN :empresas GROUP BY Empresa__c
            ]) {
                con.add((Id) ar.get('emp'));
            }
            return con;
        }

        // Importe y número de efectos de proveedores con empleado de RR.HH
        // informado que aún no están pagados (ni Tarjeta, ni Transferido, ni Conciliado)
        AggregateResult efectosGastosPendientes() {
            List<AggregateResult> res = [
                SELECT SUM(Importe_efecto__c) total, COUNT(Id) n
                FROM Efectos_proveedores__c
                WHERE Recursos_Humanos__c != null
                  AND (Estado__c = null OR Estado__c NOT IN ('Tarjeta', 'Transferido', 'Conciliado'))
            ];
            return res.isEmpty() ? null : res[0];
        }

        // Notas de gastos con empleado de RR.HH informado y pendientes de
        // aprobación (Estado__c = 'No', etiqueta "Pendiente aprobación")
        List<Gastos_de_viaje_o_representaci_n__c> notasGastosPendientes() {
            return [
                SELECT Id, Name, Fecha__c, Importe__c, Estado__c, RR_HH__c,
                       RR_HH__r.Nombre__c, RR_HH__r.Apellidos__c
                FROM Gastos_de_viaje_o_representaci_n__c
                WHERE RR_HH__c != null AND Estado__c = 'No'
                ORDER BY Fecha__c ASC NULLS LAST, Name ASC
                LIMIT 500
            ];
        }

        // Todas las incidencias desde el 1 de enero de 2025
        List<Registro_Horario__c> fichajesSinSalida() {
            Datetime desde = Datetime.newInstance(2025, 1, 1, 0, 0, 0);
            return [
                SELECT Id, Name, Fecha_hora_Registro__c,
                       Recursos_Humanos__r.Nombre__c, Recursos_Humanos__r.Apellidos__c
                FROM Registro_Horario__c
                WHERE Fecha_hora_Salida__c = null
                  AND Fecha_hora_Registro__c < TODAY
                  AND Fecha_hora_Registro__c >= :desde
                  AND Recursos_Humanos__c != null
                  AND (NOT Recursos_Humanos__r.Estado__c IN :ESTADOS_FUERA)
                ORDER BY Fecha_hora_Registro__c DESC
                LIMIT 1000
            ];
        }
    }
}