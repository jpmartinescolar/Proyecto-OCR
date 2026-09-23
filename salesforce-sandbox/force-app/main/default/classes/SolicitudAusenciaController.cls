/**
 * Solicitud de ausencias y vacaciones desde el botón azul de la cabecera del
 * componente: crea registros de Ausencias__c en estado Solicitado sobre la
 * ficha de empleado (SFDC_Employee__c) cuyo propietario es el usuario conectado.
 *
 * Por días completos, los sábados y domingos parten el rango: cada tramo de
 * días laborables consecutivos genera su propio registro. Por horas se crea
 * un único registro con su hora de inicio y de fin.
 */
public with sharing class SolicitudAusenciaController {

    public class DatosDTO {
        @AuraEnabled public Id empleadoId;
        @AuraEnabled public String nombre;
        @AuraEnabled public Decimal vacacionesPendientes;
        @AuraEnabled public List<String> tipos;
    }

    /** Ficha de empleado del usuario conectado y valores para el formulario */
    @AuraEnabled
    public static DatosDTO getDatosSolicitud() {
        SFDC_Employee__c emp = fichaDelUsuario();
        DatosDTO d = new DatosDTO();
        d.empleadoId = emp.Id;
        d.nombre = ((emp.Nombre__c == null ? '' : emp.Nombre__c + ' ')
            + (emp.Apellidos__c == null ? '' : emp.Apellidos__c)).trim();
        d.vacacionesPendientes = emp.N_vacaciones_pendientes_a_o_actual__c;
        d.tipos = new List<String>();
        for (Schema.PicklistEntry pe : Ausencias__c.Tipo__c.getDescribe().getPicklistValues()) {
            if (pe.isActive()) d.tipos.add(pe.getValue());
        }
        return d;
    }

    private static SFDC_Employee__c fichaDelUsuario() {
        List<SFDC_Employee__c> emps = [
            SELECT Id, Nombre__c, Apellidos__c, N_vacaciones_pendientes_a_o_actual__c
            FROM SFDC_Employee__c
            WHERE OwnerId = :UserInfo.getUserId()
              AND Estado__c NOT IN ('Baja', 'Cancelado')
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];
        if (emps.isEmpty()) {
            throw new AuraHandledException('No se ha encontrado tu ficha de empleado: '
                + 'no hay ningún registro de RR.HH. activo cuyo propietario seas tú.');
        }
        return emps[0];
    }

    public class ResultadoDTO {
        @AuraEnabled public Integer registros;
        @AuraEnabled public List<CreadoDTO> creados;
    }

    public class CreadoDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String numero;
    }

    @AuraEnabled
    public static ResultadoDTO crearSolicitud(String tipo, String unidad, Date fechaInicio, Date fechaFin,
                                              String horaInicio, String horaFin, String descripcion,
                                              Boolean ejercicioAnterior) {
        if (String.isBlank(tipo)) throw new AuraHandledException('Selecciona el tipo de ausencia.');
        if (unidad != 'Días' && unidad != 'Horas') {
            throw new AuraHandledException('Selecciona el cómputo: días completos o por horas.');
        }
        if (tipo != 'Vacaciones' && String.isBlank(descripcion)) {
            throw new AuraHandledException('La descripción es obligatoria para los tipos distintos de Vacaciones.');
        }
        Id empleadoId = fichaDelUsuario().Id;

        List<Ausencias__c> nuevas = new List<Ausencias__c>();
        if (unidad == 'Horas') {
            if (fechaInicio == null || String.isBlank(horaInicio) || String.isBlank(horaFin)) {
                throw new AuraHandledException('Indica la fecha y las horas de inicio y de fin.');
            }
            if (Math.mod(Date.newInstance(1900, 1, 1).daysBetween(fechaInicio), 7) >= 5) {
                throw new AuraHandledException('La fecha elegida cae en fin de semana: elige un día laborable.');
            }
            Time hIni = parseHora(horaInicio);
            Time hFin = parseHora(horaFin);
            if (hFin.hour() * 60 + hFin.minute() <= hIni.hour() * 60 + hIni.minute()) {
                throw new AuraHandledException('La hora de fin debe ser posterior a la de inicio.');
            }
            nuevas.add(nueva(empleadoId, tipo, unidad, descripcion, ejercicioAnterior,
                fechaInicio, fechaInicio, hIni, hFin));
        } else {
            if (fechaInicio == null || fechaFin == null) {
                throw new AuraHandledException('Indica la fecha de inicio y la de fin.');
            }
            if (fechaFin < fechaInicio) {
                throw new AuraHandledException('La fecha de fin no puede ser anterior a la de inicio.');
            }
            // Cada tramo de días laborables consecutivos es un registro; los
            // fines de semana cortan el tramo y quedan fuera de la solicitud
            Date inicioTramo = null;
            Date ultimoLaborable = null;
            for (Date d = fechaInicio; d <= fechaFin; d = d.addDays(1)) {
                Boolean laborable = Math.mod(Date.newInstance(1900, 1, 1).daysBetween(d), 7) < 5;
                if (laborable) {
                    if (inicioTramo == null) inicioTramo = d;
                    ultimoLaborable = d;
                } else if (inicioTramo != null) {
                    nuevas.add(nueva(empleadoId, tipo, unidad, descripcion, ejercicioAnterior,
                        inicioTramo, ultimoLaborable, null, null));
                    inicioTramo = null;
                }
            }
            if (inicioTramo != null) {
                nuevas.add(nueva(empleadoId, tipo, unidad, descripcion, ejercicioAnterior,
                    inicioTramo, ultimoLaborable, null, null));
            }
            if (nuevas.isEmpty()) {
                throw new AuraHandledException('El rango elegido solo contiene fines de semana.');
            }
        }
        insert nuevas;

        ResultadoDTO r = new ResultadoDTO();
        r.registros = nuevas.size();
        r.creados = new List<CreadoDTO>();
        for (Ausencias__c a : [SELECT Id, Name FROM Ausencias__c WHERE Id IN :nuevas ORDER BY Name]) {
            CreadoDTO c = new CreadoDTO();
            c.id = a.Id;
            c.numero = a.Name;
            r.creados.add(c);
        }
        return r;
    }

    private static Ausencias__c nueva(Id empleadoId, String tipo, String unidad, String descripcion,
                                      Boolean ejercicioAnterior, Date ini, Date fin, Time hIni, Time hFin) {
        return new Ausencias__c(
            Empleado__c = empleadoId,
            Tipo__c = tipo,
            Horas_D_as__c = unidad,
            Estado__c = 'Solicitado',
            Fecha_inicio__c = ini,
            Fecha_Fin__c = fin,
            Hora_de_Inicio__c = hIni,
            Hora_de_Fin__c = hFin,
            Observaciones__c = descripcion,
            Ejercicio_anterior__c = ejercicioAnterior == true ? 'Si' : 'No'
        );
    }

    /** La hora llega del lightning-input como HH:mm o HH:mm:ss.SSS */
    private static Time parseHora(String valor) {
        List<String> partes = valor.split(':');
        return Time.newInstance(Integer.valueOf(partes[0]), Integer.valueOf(partes[1]), 0, 0);
    }
}