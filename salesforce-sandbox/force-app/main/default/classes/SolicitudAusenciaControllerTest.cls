@isTest
private class SolicitudAusenciaControllerTest {

    private static SFDC_Employee__c crearEmpleado() {
        Account acc = new Account(Name = 'Empresa Solicitud Test',
            Procedencia_del_cliente__c = 'Test');
        insert acc;
        SFDC_Candidate__c cand = new SFDC_Candidate__c(SFDC_Candidate_Email__c = 'candsolicitud@test.com');
        insert cand;
        SFDC_Employee__c emp = new SFDC_Employee__c(
            Candidato_de_Empleo__c = cand.Id,
            Empresa__c = acc.Id,
            Nombre__c = 'Sole',
            Apellidos__c = 'Prueba',
            Correo_Electr_nico__c = 'sole@test.com',
            Email_personal__c = 'sole@personal.com',
            Categor_a__c = 'Abogado Junior',
            Empresa_titular__c = 'GM Consulting Empresarial, S.L',
            jornada__c = '100',
            Departamento__c = 'Laboral',
            Estado__c = 'Activado',
            Fecha_de_nacimiento__c = Date.today().addYears(-30),
            Hire_Date__c = Date.today().addYears(-2),
            Obligaci_n_imputar_horas__c = 'Si',
            Obligaci_n_fichaje__c = 'Si',
            OwnerId = UserInfo.getUserId()
        );
        insert emp;
        return emp;
    }

    @isTest
    static void datosYDiasConFinDeSemana() {
        SFDC_Employee__c emp = crearEmpleado();

        SolicitudAusenciaController.DatosDTO datos = SolicitudAusenciaController.getDatosSolicitud();
        System.assertEquals(emp.Id, datos.empleadoId, 'La ficha del usuario conectado');
        System.assert(datos.tipos.contains('Vacaciones'), 'El tipo Vacaciones está disponible');

        // Lunes de la semana que viene: el rango lunes → miércoles de la
        // siguiente cruza un fin de semana y debe partirse en dos registros
        Date hoy = Date.today();
        Date lunes = hoy.addDays(7 - Math.mod(Date.newInstance(1900, 1, 1).daysBetween(hoy), 7));
        Test.startTest();
        SolicitudAusenciaController.ResultadoDTO r = SolicitudAusenciaController.crearSolicitud(
            'Vacaciones', 'Días', lunes, lunes.addDays(9), null, null, null, false);
        Test.stopTest();

        System.assertEquals(2, r.registros, 'El fin de semana parte el rango en dos tramos');
        List<Ausencias__c> creadas = [SELECT Fecha_inicio__c, Fecha_Fin__c, Estado__c, Horas_D_as__c,
                                             Tipo__c, Empleado__c, Ejercicio_anterior__c
                                      FROM Ausencias__c WHERE Empleado__c = :emp.Id ORDER BY Fecha_inicio__c];
        System.assertEquals(2, creadas.size(), 'Dos registros creados');
        System.assertEquals('Solicitado', creadas[0].Estado__c, 'Nacen en estado Solicitado');
        System.assertEquals(lunes, creadas[0].Fecha_inicio__c, 'Primer tramo desde el lunes');
        System.assertEquals(lunes.addDays(4), creadas[0].Fecha_Fin__c, 'Primer tramo hasta el viernes');
        System.assertEquals(lunes.addDays(7), creadas[1].Fecha_inicio__c, 'Segundo tramo desde el lunes siguiente');
        System.assertEquals(lunes.addDays(9), creadas[1].Fecha_Fin__c, 'Segundo tramo hasta el miércoles');
        System.assertEquals('No', creadas[0].Ejercicio_anterior__c, 'Ejercicio anterior por defecto No');
    }

    @isTest
    static void porHorasYValidaciones() {
        SFDC_Employee__c emp = crearEmpleado();
        // Lunes de la semana que viene: por horas la fecha debe ser laborable
        Date hoy = Date.today();
        Date lunes = hoy.addDays(7 - Math.mod(Date.newInstance(1900, 1, 1).daysBetween(hoy), 7));

        Test.startTest();
        SolicitudAusenciaController.ResultadoDTO r = SolicitudAusenciaController.crearSolicitud(
            'Enfermedad o Médico propia', 'Horas', lunes, null, '07:30', '08:30', 'Cita médica', null);
        Test.stopTest();

        System.assertEquals(1, r.registros, 'Por horas se crea un único registro');
        Ausencias__c a = [SELECT Hora_de_Inicio__c, Hora_de_Fin__c, Fecha_inicio__c, Fecha_Fin__c,
                                 Observaciones__c, Estado__c
                          FROM Ausencias__c WHERE Empleado__c = :emp.Id LIMIT 1];
        System.assertEquals(Time.newInstance(7, 30, 0, 0), a.Hora_de_Inicio__c, 'Hora de inicio');
        System.assertEquals(Time.newInstance(8, 30, 0, 0), a.Hora_de_Fin__c, 'Hora de fin');
        System.assertEquals(lunes, a.Fecha_inicio__c, 'La fecha es el mismo día');
        System.assertEquals('Cita médica', a.Observaciones__c, 'Descripción guardada');
        System.assertEquals('Solicitado', a.Estado__c, 'Nace en estado Solicitado');

        // La descripción es obligatoria fuera de Vacaciones
        try {
            SolicitudAusenciaController.crearSolicitud('Exámenes', 'Días', lunes, lunes, null, null, '', false);
            System.assert(false, 'Sin descripción debía rechazarse');
        } catch (AuraHandledException e) {
            System.assert(true, 'Rechazado sin descripción');
        }
        // La hora de fin debe ser posterior a la de inicio
        try {
            SolicitudAusenciaController.crearSolicitud('Exámenes', 'Horas', lunes, null, '09:00', '08:00', 'Examen', false);
            System.assert(false, 'Hora fin anterior debía rechazarse');
        } catch (AuraHandledException e) {
            System.assert(true, 'Rechazado con horas invertidas');
        }
        // Por horas en sábado no se puede seguir
        try {
            SolicitudAusenciaController.crearSolicitud('Exámenes', 'Horas', lunes.addDays(5), null,
                '09:00', '10:00', 'Examen', false);
            System.assert(false, 'Un sábado por horas debía rechazarse');
        } catch (AuraHandledException e) {
            System.assert(true, 'Rechazado en fin de semana');
        }
    }
}