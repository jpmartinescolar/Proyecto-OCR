@isTest
private class AreaRRHHControllerTest {

    private static SFDC_Employee__c nuevoEmpleado(Id candId, Id accId, String nombre, String estado) {
        return new SFDC_Employee__c(
            Candidato_de_Empleo__c = candId,
            Empresa__c = accId,
            Nombre__c = nombre,
            Apellidos__c = 'Prueba',
            Correo_Electr_nico__c = nombre.toLowerCase() + '@test.com',
            Email_personal__c = nombre.toLowerCase() + '@personal.com',
            Categor_a__c = 'Abogado Junior',
            Empresa_titular__c = 'GM Consulting Empresarial, S.L',
            jornada__c = '100',
            Departamento__c = 'Laboral',
            Estado__c = estado,
            Fecha_de_nacimiento__c = Date.today().addYears(-30),
            Hire_Date__c = Date.today().addYears(-2),
            Obligaci_n_imputar_horas__c = 'Si',
            Obligaci_n_fichaje__c = 'Si'
        );
    }

    @isTest
    static void panelCompleto() {
        Account acc = new Account(Name = 'Empresa RRHH Test',
            Procedencia_del_cliente__c = 'Test');
        insert acc;
        SFDC_Candidate__c cand = new SFDC_Candidate__c(SFDC_Candidate_Email__c = 'candidato@test.com');
        insert cand;

        SFDC_Employee__c activo = nuevoEmpleado(cand.Id, acc.Id, 'Ana', 'Activado');
        SFDC_Employee__c veterano = nuevoEmpleado(cand.Id, acc.Id, 'Berta', 'Activado');
        veterano.Hire_Date__c = Date.today().addYears(-12);
        veterano.Fecha_de_nacimiento__c = Date.today().addYears(-50);
        veterano.Obligaci_n_imputar_horas__c = 'No';
        veterano.Obligaci_n_fichaje__c = 'No';
        SFDC_Employee__c baja = nuevoEmpleado(cand.Id, acc.Id, 'Carlos', 'Baja');
        baja.Termination_Date__c = Date.today().addMonths(-2);
        baja.Usuario_destino__c = UserInfo.getUserId();
        insert new List<SFDC_Employee__c>{ activo, veterano, baja };

        Date hoy = Date.today();
        Date lunes = hoy.addDays(-Math.mod(Date.newInstance(1900, 1, 1).daysBetween(hoy), 7));

        insert new List<Ausencias__c>{
            // Día entero aprobado en la ventana de imputación (lunes de la semana
            // pasada: la semana en curso queda fuera de la ventana)
            new Ausencias__c(Empleado__c = activo.Id, Tipo__c = 'Enfermedad o Médico propia',
                Estado__c = 'Aprobado', Horas_D_as__c = 'Días',
                Fecha_inicio__c = lunes.addDays(-7), Fecha_Fin__c = lunes.addDays(-7)),
            // Solicitada pendiente de aprobar
            new Ausencias__c(Empleado__c = activo.Id, Tipo__c = 'Vacaciones',
                Estado__c = 'Solicitado', Horas_D_as__c = 'Días',
                Fecha_inicio__c = hoy.addDays(10), Fecha_Fin__c = hoy.addDays(14)),
            // Del año pasado, cuenta en la comparativa
            new Ausencias__c(Empleado__c = activo.Id, Tipo__c = 'Enfermedad o Médico propia',
                Estado__c = 'Completado', Horas_D_as__c = 'Días',
                Fecha_inicio__c = Date.newInstance(hoy.year() - 1, 1, 10),
                Fecha_Fin__c = Date.newInstance(hoy.year() - 1, 1, 12)),
            // Berta está ausente hoy: cuenta en la caja de ausentes de hoy
            new Ausencias__c(Empleado__c = veterano.Id, Tipo__c = 'Enfermedad o Médico propia',
                Estado__c = 'Aprobado', Horas_D_as__c = 'Días',
                Fecha_inicio__c = hoy, Fecha_Fin__c = hoy)
        };

        insert new Imputaci_n_horas__c(RR_HH__c = activo.Id,
            Fecha_imputaci_n__c = lunes.addDays(-6), Horas__c = 8);

        // Incidencia de imputación: origen Otros sin validar posterior a 2026
        // (Origen depende del tipo: Otros requiere el tipo Consultoría)
        insert new Imputaci_n_horas__c(RR_HH__c = activo.Id,
            Fecha_imputaci_n__c = Date.newInstance(2026, 2, 2), Horas__c = 1,
            Tipo_de_Imputaci_n__c = 'Consultoría',
            Origen_de_la_imputaci_n__c = 'Otros', Estado__c = 'No validado',
            Motivo_de_origen_otros__c = 'Motivo de prueba');

        insert new Registro_Horario__c(Recursos_Humanos__c = activo.Id,
            Fecha_hora_Registro__c = Datetime.now().addDays(-3));

        Test.startTest();
        AreaRRHHController.PanelDTO p = AreaRRHHController.getPanelRRHH();
        Test.stopTest();

        System.assertEquals(2, p.totalEmpleados, 'Activos sin baja ni cancelado');
        System.assertEquals(12, p.plantilla.size(), 'Doce meses de plantilla');
        System.assertEquals(12, p.ausenciasMeses.size(), 'Doce meses de comparativa');
        System.assert(p.edadMedia > 0, 'Edad media calculada');
        System.assert(p.antiguedadMedia > 0, 'Antigüedad media calculada');
        System.assertEquals(1, p.antiguedadMas10, 'Una persona con más de 10 años');

        // Cajas de hoy: Berta está ausente y nadie tiene días fijos de teletrabajo
        // (el valor del multipicklist depende del tipo de registro y no se puede
        // fijar en el test)
        System.assertEquals(1, p.ausentesHoy, 'Berta ausente hoy');
        System.assertEquals(0, p.teletrabajoHoy, 'Nadie teletrabaja en los datos del test');

        // Comparativa del año anterior: la enfermedad de enero suma su Total días
        Decimal totalEnero = [SELECT Total_d_as__c FROM Ausencias__c
                              WHERE Fecha_inicio__c = :Date.newInstance(hoy.year() - 1, 1, 10)
                              LIMIT 1].Total_d_as__c;
        System.assertEquals(totalEnero == null ? 0 : totalEnero, p.ausenciasMeses[0].anterior,
            'Días de ausencia de enero del año anterior según Total días');

        // Imputación: solo Ana está obligada; lunes ausencia, martes imputado
        System.assertEquals(1, p.imputaciones.size(), 'Solo una persona con obligación de imputar');

        // El cuadro público de pendientes devuelve lo mismo que el panel
        AreaRRHHController.PendientesDTO pend = AreaRRHHController.getImputacionesPendientes();
        System.assertEquals(p.inicioVentana, pend.inicioVentana, 'Misma ventana de 4 semanas');
        System.assertEquals(1, pend.imputaciones.size(), 'Mismo cuadro de imputaciones');
        System.assertEquals(28, p.imputaciones[0].dias.size(), 'Veintiocho días en la ventana');
        System.assertEquals('ausencia', p.imputaciones[0].dias[21], 'El lunes de la semana pasada fue ausencia');
        System.assertEquals('imputado', p.imputaciones[0].dias[22], 'El martes de la semana pasada está imputado');

        // Ausencias por aprobar o completar: la solicitada y la aprobada de la
        // semana pasada, que ya terminó y se puede completar
        System.assertEquals(2, p.ausPendientes.size(), 'Solicitadas y aprobadas ya finalizadas');

        // Fichaje incompleto: el registro de hace 3 días sin salida
        System.assertEquals(1, p.fichajesIncompletos.size(), 'Un fichaje sin salida');
        System.assertEquals(3, p.fichajesIncompletos[0].diasSin, 'Tres días sin salida');

        // Sin fichar hoy: Ana no ha fichado hoy y está obligada (su ausencia
        // fue la semana pasada, así que hoy no cuenta como ausente); los
        // sábados y domingos la caja va siempre vacía
        Integer dowHoy = Math.mod(Date.newInstance(1900, 1, 1).daysBetween(hoy), 7);
        System.assertEquals(dowHoy >= 5 ? 0 : 1, p.sinFichar.size(),
            'Ana sin fichar hoy, salvo en fin de semana');

        // Detalle de un mes de la comparativa: la enfermedad de enero del año anterior
        List<AreaRRHHController.AusenciaMesDTO> mes =
            AreaRRHHController.getAusenciasMes(hoy.year() - 1, 1);
        System.assertEquals(1, mes.size(), 'Una ausencia en enero del año anterior');
        System.assertEquals('Días', mes[0].unidad, 'Ausencia de día entero');
        System.assertEquals('Ana Prueba', mes[0].nombre, 'Empleado de la ausencia');
        System.assertEquals(totalEnero, mes[0].dias, 'La columna de días es el campo Total días');

        // Listado completo de los dos años: la enfermedad del lunes, la de enero
        // del año anterior y la de Berta de hoy (las vacaciones quedan fuera)
        List<AreaRRHHController.AusenciaMesDTO> listado = AreaRRHHController.getAusenciasListado();
        System.assertEquals(3, listado.size(), 'Tres ausencias en el listado completo');

        // Incidencias de imputaciones: la de origen Otros sin validar de 2026
        System.assertEquals(1, p.incidenciasImputaciones, 'Una incidencia de imputación');
        List<AreaRRHHController.IncImputacionDTO> incidencias =
            AreaRRHHController.getIncidenciasImputaciones(null, null);
        System.assertEquals(1, incidencias.size(), 'El listado trae la incidencia');
        System.assertEquals('Motivo de prueba', incidencias[0].motivo, 'Motivo de origen otros');
        System.assertEquals(Date.newInstance(2026, 2, 2), incidencias[0].fecha, 'Fecha de imputación');
        System.assertEquals('No validado', incidencias[0].estado, 'Estado de la incidencia');
        // El tipo llega con su etiqueta traducida (el valor API Consultoría
        // tiene la etiqueta "Consultoría Cientes" en el org)
        System.assert(String.isNotBlank(incidencias[0].tipo), 'Tipo de imputación informado');
        // Sin subtipo Laboral ni Fiscal y Contable no hay nota de contratos
        System.assertEquals(null, incidencias[0].nota, 'Sin subtipo no hay nota');

        // Al validarla desde el listado deja de ser incidencia
        AreaRRHHController.actualizarEstadoImputacion(incidencias[0].id, 'Validado');
        System.assertEquals('Validado',
            [SELECT Estado__c FROM Imputaci_n_horas__c WHERE Id = :incidencias[0].id].Estado__c,
            'Estado actualizado en el registro');
        System.assertEquals(0, AreaRRHHController.getIncidenciasImputaciones(null, null).size(),
            'La validada sale del listado');

        // El test corre como administrador, que sí puede ver el área
        System.assertEquals(true, AreaRRHHController.getAccesoRRHH(), 'El administrador tiene acceso');
    }

    @isTest
    static void borrarRegistroHorario() {
        Account acc = new Account(Name = 'Empresa Borrado Test',
            Procedencia_del_cliente__c = 'Test');
        insert acc;
        SFDC_Candidate__c cand = new SFDC_Candidate__c(SFDC_Candidate_Email__c = 'borrado@test.com');
        insert cand;
        SFDC_Employee__c emp = nuevoEmpleado(cand.Id, acc.Id, 'Diana', 'Activado');
        insert emp;
        Registro_Horario__c reg = new Registro_Horario__c(Recursos_Humanos__c = emp.Id,
            Fecha_hora_Registro__c = Datetime.now().addDays(-3));
        insert reg;

        Test.startTest();
        AreaRRHHController.borrarRegistroHorario(reg.Id);
        try {
            AreaRRHHController.borrarRegistroHorario(null);
            System.assert(false, 'Sin registro debía rechazar el borrado');
        } catch (AuraHandledException e) {
            System.assert(true, 'Borrado rechazado sin registro');
        }
        Test.stopTest();

        System.assertEquals(0, [SELECT COUNT() FROM Registro_Horario__c WHERE Id = :reg.Id],
            'El registro horario queda borrado');
    }

    @isTest
    static void recordatorioImputacion() {
        Test.startTest();
        try {
            AreaRRHHController.enviarRecordatorioImputacion('empleado@test.com',
                'Imputación de horas pendientes', 'Cuerpo de prueba');
            System.assertEquals(1, Limits.getEmailInvocations(), 'Se envía un correo');
        } catch (AuraHandledException e) {
            // El sandbox puede tener el envío de correo restringido; la llamada
            // llegó al envío y el error se devuelve con un mensaje claro
            System.assert(true, 'Envío restringido en el sandbox');
        }
        try {
            AreaRRHHController.enviarRecordatorioImputacion('', 'Asunto', 'Cuerpo');
            System.assert(false, 'Sin destinatario debía rechazar el envío');
        } catch (AuraHandledException e) {
            System.assert(true, 'Envío rechazado sin destinatario');
        }
        Test.stopTest();
    }

    // El área solo es visible para Directora RR.HH y administradores: otro
    // perfil no la ve y sus métodos de datos rechazan la llamada
    @isTest
    static void accesoDenegadoParaOtrosPerfiles() {
        Profile p = [SELECT Id FROM Profile
                     WHERE Name NOT IN ('Directora RR.HH', 'System Administrator', 'Administrador del sistema')
                       AND UserType = 'Standard' LIMIT 1];
        User u = new User(Alias = 'norrhh', LastName = 'Sin Acceso', Email = 'norrhh@innovaciondespachos.com',
            Username = 'norrhh' + Datetime.now().getTime() + '@test.com', ProfileId = p.Id,
            EmailEncodingKey = 'UTF-8', LanguageLocaleKey = 'es', LocaleSidKey = 'es_ES',
            TimeZoneSidKey = 'Europe/Paris');
        insert u;

        System.runAs(u) {
            System.assertEquals(false, AreaRRHHController.getAccesoRRHH(), 'Sin acceso al área');
            try {
                AreaRRHHController.getPanelRRHH();
                System.assert(false, 'getPanelRRHH debía rechazar al perfil sin acceso');
            } catch (AuraHandledException e) {
                System.assert(true, 'Llamada rechazada');
            }
            try {
                AreaRRHHController.getAusenciasMes(Date.today().year(), 1);
                System.assert(false, 'getAusenciasMes debía rechazar al perfil sin acceso');
            } catch (AuraHandledException e) {
                System.assert(true, 'Llamada rechazada');
            }
            try {
                AreaRRHHController.getAusenciasListado();
                System.assert(false, 'getAusenciasListado debía rechazar al perfil sin acceso');
            } catch (AuraHandledException e) {
                System.assert(true, 'Llamada rechazada');
            }
            // Análisis Imputaciones es público: sus métodos no exigen el perfil
            AreaRRHHController.PendientesDTO pend = AreaRRHHController.getImputacionesPendientes();
            System.assertNotEquals(null, pend.imputaciones, 'Pendientes accesible para cualquier perfil');
            System.assertNotEquals(null, AreaRRHHController.getIncidenciasImputaciones(null, null),
                'Incidencias accesible para cualquier perfil');
        }
    }
}