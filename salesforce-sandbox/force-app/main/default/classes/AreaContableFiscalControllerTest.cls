/**
 * Tests de AreaContableFiscalController.
 */
@isTest
private class AreaContableFiscalControllerTest {

    @isTest
    static void testResumen() {
        // Caso abierto propiedad del usuario actual
        insert new Case(Subject = 'Test area contable', OwnerId = UserInfo.getUserId());

        Test.startTest();
        List<AreaContableFiscalController.FilaDTO> filas = AreaContableFiscalController.getResumen();
        Test.stopTest();

        Boolean hayUsuarioActual = false;
        for (AreaContableFiscalController.FilaDTO f : filas) {
            if (f.usuarioId == UserInfo.getUserId()) {
                hayUsuarioActual = true;
                System.assert(f.casos >= 1, 'El caso abierto debe contarse');
                System.assert(f.total >= f.casos, 'El total agrega todas las columnas');
                System.assertEquals(true, f.activo, 'El estado sale del campo Active de la ficha de usuario');
            }
        }
        System.assert(hayUsuarioActual, 'El propietario del registro abierto debe aparecer');
    }

    @isTest
    static void testInicio() {
        insert new Task(Subject = 'Tarea test inicio', OwnerId = UserInfo.getUserId(),
                        Status = 'Not Started', ActivityDate = Date.today());

        Test.startTest();
        AreaContableFiscalController.InicioDTO inicio = AreaContableFiscalController.getInicio();
        Test.stopTest();

        System.assertNotEquals(null, inicio.resumen, 'El resumen debe venir informado');
        System.assertEquals(14, inicio.vencimientos.dias.size(), 'Los vencimientos traen los 14 dias');
        System.assertEquals(1, inicio.misTareas.size(), 'Las tareas del usuario deben venir en la misma llamada');
    }

    @isTest
    static void testInicioRapido() {
        insert new Task(Subject = 'Tarea test rapido', OwnerId = UserInfo.getUserId(),
                        Status = 'Not Started', ActivityDate = Date.today());
        insert new Case(Subject = 'Caso test rapido', OwnerId = UserInfo.getUserId());

        Test.startTest();
        AreaContableFiscalController.InicioRapidoDTO inicio = AreaContableFiscalController.getInicioRapido();
        Test.stopTest();

        System.assertEquals(UserInfo.getUserId(), inicio.miResumen.usuarioId, 'La fila es la del usuario conectado');
        System.assertEquals(1, inicio.miResumen.casos, 'El caso abierto del usuario cuenta');
        System.assertEquals(1, inicio.miResumen.tareas, 'La tarea abierta del usuario cuenta');
        System.assertEquals(14, inicio.vencimientos.dias.size(), 'Los vencimientos traen los 14 dias');
        System.assertEquals(1, inicio.misTareas.size(), 'Las tareas del usuario vienen en la misma llamada');
        System.assertEquals(1, inicio.misTareasTotal, 'El total real de tareas viaja junto al listado recortado');
        Integer sumaOrigenes = 0;
        for (AreaContableFiscalController.OrigenDTO o : inicio.misTareasOrigenes) {
            System.assert(String.isNotBlank(o.nombre), 'Cada origen del desglose lleva nombre');
            sumaOrigenes += o.n;
        }
        System.assertEquals(1, sumaOrigenes, 'El desglose por origen suma el total de tareas');
    }

    @isTest
    static void testMisTareas() {
        insert new Task(Subject = 'Tarea test mi situacion', OwnerId = UserInfo.getUserId(),
                        Status = 'Not Started', ActivityDate = Date.today().addDays(-1));
        insert new Task(Subject = 'Tarea test futura', OwnerId = UserInfo.getUserId(),
                        Status = 'Not Started', ActivityDate = Date.today().addDays(5));

        Test.startTest();
        List<AreaContableFiscalController.TareaDTO> tareas = AreaContableFiscalController.getMisTareas(null);
        List<AreaContableFiscalController.TareaDTO> proximas = AreaContableFiscalController.getMisTareasProximas();
        Test.stopTest();

        Boolean hayFutura = false;
        for (AreaContableFiscalController.TareaDTO t : proximas) {
            System.assert(t.fecha > Date.today(), 'Solo tareas con vencimiento posterior a hoy');
            if (t.asunto == 'Tarea test futura') hayFutura = true;
        }
        System.assert(hayFutura, 'La tarea futura debe salir en Mis proximas tareas');

        Boolean encontrada = false;
        for (AreaContableFiscalController.TareaDTO t : tareas) {
            if (t.asunto == 'Tarea test mi situacion') {
                encontrada = true;
                System.assertEquals(Date.today().addDays(-1), t.fecha, 'La fecha es el vencimiento de la tarea');
                System.assertNotEquals(null, t.origen, 'El origen en blanco viaja como Sin origen');
            }
        }
        System.assert(encontrada, 'La tarea abierta vencida del usuario debe listarse');
    }

    @isTest
    static void testSenalamientosLegales() {
        insert new Event(Subject = 'Juicio test', Es_un_se_alamiento_legal__c = 'Si',
                         Location = 'Juzgado n. 1 de Madrid', OwnerId = UserInfo.getUserId(),
                         StartDateTime = Datetime.now().addDays(1),
                         EndDateTime = Datetime.now().addDays(1).addHours(1));

        Test.startTest();
        List<AreaContableFiscalController.SenalamientoDTO> lista = AreaContableFiscalController.getSenalamientosLegales();
        Test.stopTest();

        Boolean encontrado = false;
        for (AreaContableFiscalController.SenalamientoDTO s : lista) {
            if (s.asunto == 'Juicio test') {
                encontrado = true;
                System.assertEquals('Juzgado n. 1 de Madrid', s.direccion, 'La direccion sale del campo Location');
                System.assertEquals(UserInfo.getUserId(), s.asesorId, 'La persona asignada es el propietario del evento');
            }
        }
        System.assert(encontrado, 'El senalamiento futuro debe listarse');
    }

    @isTest
    static void testRiesgoColor() {
        System.assertEquals('rojo', AreaContableFiscalController.riesgoColor('<img src="x" alt="Warningwarning" border="0"/>'));
        System.assertEquals('verde', AreaContableFiscalController.riesgoColor('<img src="x" alt="Verde" border="0"/>'));
        System.assertEquals('gris', AreaContableFiscalController.riesgoColor(null));
    }

    @isTest
    static void testContabilidadesAbiertas() {
        List<AreaContableFiscalController.ContabDTO> filas = AreaContableFiscalController.getContabilidadesAbiertas();
        System.assertNotEquals(null, filas, 'Debe devolver una lista');
    }

    @isTest
    static void testPrecierresAbiertos() {
        insert new Precierre_Contable__c(Estado__c = 'Sin revisar', Asesor_responsable__c = UserInfo.getUserId());
        List<AreaContableFiscalController.RegistroDTO> filas = AreaContableFiscalController.getPrecierresAbiertos();
        System.assertEquals(1, filas.size(), 'Debe listar el precierre abierto');
        System.assertEquals('Sin revisar', filas[0].estado);
    }

    @isTest
    static void testCierresAbiertos() {
        insert new Cierre_Contable__c(Estado__c = 'Pendiente', Asesor__c = UserInfo.getUserId());
        List<AreaContableFiscalController.RegistroDTO> filas = AreaContableFiscalController.getCierresAbiertos();
        System.assertEquals(1, filas.size(), 'Debe listar el cierre abierto');
        System.assertEquals('Sin comenzar', filas[0].estado, 'El estado viaja con su etiqueta');
    }

    @isTest
    static void testLibrosAbiertos() {
        // No se insertan libros de prueba: su creación dispara un flow de
        // presupuestos que exige datos de CPQ
        List<AreaContableFiscalController.RegistroDTO> filas = AreaContableFiscalController.getLibrosAbiertos();
        System.assertNotEquals(null, filas, 'Debe devolver una lista');
    }

    @isTest
    static void testCuentasAbiertas() {
        // No se insertan cuentas de prueba: su creación dispara un flow de
        // presupuestos que exige datos de CPQ
        List<AreaContableFiscalController.RegistroDTO> filas = AreaContableFiscalController.getCuentasAbiertas();
        System.assertNotEquals(null, filas, 'Debe devolver una lista');
    }

    @isTest
    static void testRentasAbiertas() {
        List<AreaContableFiscalController.RegistroDTO> filas = AreaContableFiscalController.getRentasAbiertas();
        System.assertNotEquals(null, filas, 'Debe devolver una lista');
    }

    @isTest
    static void testExpedientesAbiertos() {
        List<AreaContableFiscalController.RegistroDTO> filas = AreaContableFiscalController.getExpedientesAbiertos();
        System.assertNotEquals(null, filas, 'Debe devolver una lista');
    }

    @isTest
    static void testVencimientosLegales() {
        insert new Event(Subject = 'Juicio test vencimientos', Es_un_se_alamiento_legal__c = 'Si',
                         OwnerId = UserInfo.getUserId(),
                         StartDateTime = Datetime.now().addDays(1),
                         EndDateTime = Datetime.now().addDays(1).addHours(1));

        AreaContableFiscalController.VencimientosDTO v = AreaContableFiscalController.getVencimientosLegales();
        System.assertEquals(14, v.dias.size(), 'Debe devolver los 14 dias de las dos semanas');
        System.assertNotEquals(null, v.sinPresentar);
        System.assertEquals(1, v.senalamientos, 'El senalamiento de manana cuenta como por delante');
    }

    @isTest
    static void testVencimientosLegalesLista() {
        // Cuentan las tareas abiertas con vencimiento legal de cualquier
        // usuario, sin filtrar por departamento
        insert new Task(
            OwnerId = UserInfo.getUserId(),
            Subject = 'Test vencimiento legal',
            Vencimiento_Legal__c = Date.today().addDays(3)
        );

        List<AreaContableFiscalController.VencTareaDTO> filas = AreaContableFiscalController.getVencimientosLegalesLista();
        System.assertEquals(1, filas.size(), 'Debe listar la tarea de vencimiento legal');
        System.assertEquals('Test vencimiento legal', filas[0].asunto);

        AreaContableFiscalController.VencimientosDTO v = AreaContableFiscalController.getVencimientosLegales();
        Integer enCalendario = 0;
        for (AreaContableFiscalController.VencDiaDTO d : v.dias) enCalendario += d.n;
        System.assertEquals(1, enCalendario, 'La tarea debe contarse en el calendario');
    }

    @isTest
    static void testOportunidadesAbiertas() {
        Account acc = new Account(Name = 'Test Oportunidad', Procedencia_del_cliente__c = 'Test', CIF__c = 'B00000002');
        insert acc;
        // El proceso "Oportunidad. Creación función de contacto" exige el
        // contacto del cliente para crear la función de contacto
        Contact con = new Contact(LastName = 'Contacto Test', AccountId = acc.Id,
            Departamento__c = 'Administración');
        insert con;
        insert new Opportunity(Name = 'Oportunidad test', AccountId = acc.Id,
            StageName = 'Análisis y Propuesta', CloseDate = Date.today().addDays(30),
            OwnerId = UserInfo.getUserId(), Contacto_del_Cliente__c = con.Id);

        List<AreaContableFiscalController.OportunidadDTO> filas = AreaContableFiscalController.getOportunidadesAbiertas();
        System.assertEquals(1, filas.size(), 'Debe listar la oportunidad abierta');
        System.assertEquals('Oportunidad test', filas[0].asunto);
        System.assertEquals('Test Oportunidad', filas[0].cuenta);
        System.assertEquals('Análisis y Propuesta', filas[0].estado);
        System.assertEquals(Date.today(), filas[0].fechaCreacion, 'Fecha de creación informada');

        // El panel añade los casos abiertos de las cuentas, los eventos y las recuperadas
        insert new Case(Subject = 'Caso de la cuenta', AccountId = acc.Id, OwnerId = UserInfo.getUserId());
        AreaContableFiscalController.OpoPanelDTO panel = AreaContableFiscalController.getOportunidadesPanel();
        System.assertEquals(1, panel.oportunidades.size(), 'El panel trae la oportunidad');
        System.assertEquals(1, panel.casos.size(), 'El panel trae el caso abierto de la cuenta');
        System.assertEquals(acc.Id, panel.casos[0].cuentaId, 'El caso viene con su cuenta');
        System.assertNotEquals(null, panel.eventos, 'Lista de eventos');
        System.assertNotEquals(null, panel.recuperadas, 'Lista de recuperadas');
    }

    @isTest
    static void testAusenciasEquipo() {
        // No se insertan ausencias de prueba: la ficha de empleado exige una
        // cadena de datos de RRHH (candidato de empleo, empresa...) ajena a
        // este componente
        List<AreaContableFiscalController.AusenciaDTO> filas = AreaContableFiscalController.getAusenciasEquipo(null, null);
        System.assertNotEquals(null, filas, 'Debe devolver una lista');
        // Con tramo explícito, la ventana abarca esas fechas
        filas = AreaContableFiscalController.getAusenciasEquipo(
            Date.today().addDays(-30), Date.today().addDays(60));
        System.assertNotEquals(null, filas, 'Debe devolver una lista con tramo');
    }

    @isTest
    static void testTeletrabajo() {
        // Sin insertar empleados de prueba (su creación exige la cadena de
        // datos de RRHH): el método debe responder con una lista
        List<AreaContableFiscalController.TeletrabajoDTO> filas = AreaContableFiscalController.getTeletrabajo();
        System.assertNotEquals(null, filas, 'Debe devolver una lista');
    }

    @isTest
    static void testEstadoContrato() {
        System.assertEquals('ok', AreaContableFiscalController.estadoContrato('<img src="x" alt="Ok" border="0"/>'));
        System.assertEquals('cruz', AreaContableFiscalController.estadoContrato('<img src="x" alt="Cruz" border="0"/>'));
        System.assertEquals('', AreaContableFiscalController.estadoContrato(null));
    }

    @isTest
    static void testContadoresPestanas() {
        insert new Case(Subject = 'Test contadores', OwnerId = UserInfo.getUserId());
        Map<String, Integer> c = AreaContableFiscalController.getContadoresPestanas();
        System.assert(c.containsKey('contabilidad') && c.containsKey('casos'), 'Debe devolver los contadores');
        System.assert(c.get('casos') >= 1, 'El caso abierto debe contarse');
    }

    @isTest
    static void testCasosAbiertos() {
        Account acc = new Account(Name = 'Empresa Casos Test', Procedencia_del_cliente__c = 'Test');
        insert acc;
        Contact con = new Contact(LastName = 'Contacto Casos', AccountId = acc.Id,
            Departamento__c = 'Administración');
        insert con;
        insert new Case(Subject = 'Caso abierto test', AccountId = acc.Id, ContactId = con.Id,
            OwnerId = UserInfo.getUserId(), Fecha_prevista_de_cierre__c = Date.today().addDays(7));

        List<AreaContableFiscalController.CasoDTO> filas = AreaContableFiscalController.getCasosAbiertos();

        AreaContableFiscalController.CasoDTO caso;
        for (AreaContableFiscalController.CasoDTO f : filas) {
            if (f.asunto == 'Caso abierto test') caso = f;
        }
        System.assertNotEquals(null, caso, 'El caso abierto debe estar en el listado');
        System.assertEquals('Empresa Casos Test', caso.empresa, 'Nombre de la cuenta');
        System.assertEquals('Contacto Casos', caso.contacto, 'Nombre del contacto');
        System.assertEquals(UserInfo.getUserId(), caso.asesorId, 'Usuario asignado');
        // La fecha prevista la recalcula la automatización del caso al crearlo,
        // así que solo se comprueba que llega informada
        System.assertNotEquals(null, caso.fechaPrevista, 'Fecha prevista de cierre informada');
        System.assert(String.isNotBlank(caso.estado), 'El estado del caso viaja con su etiqueta');
        System.assert(String.isNotBlank(caso.numero), 'Número de caso');
        System.assert(String.isNotBlank(caso.fechaApertura), 'Fecha de apertura formateada');
    }

    @isTest
    static void testContratosCF() {
        // El contador de contratos de la cuenta lo exigen las validaciones de
        // locales afectos y actividades económicas
        Account acc = new Account(Name = 'Test CCF', Procedencia_del_cliente__c = 'Test', CIF__c = 'B00000000',
            N_contrato_asesoria_contable_y_fiscal__c = 1);
        insert acc;
        Contrato_Contabilidad_y_Fiscal__c ccf = new Contrato_Contabilidad_y_Fiscal__c(
            Empresa__c = acc.Id, Estado__c = 'Abierto',
            Asesor_responsable__c = UserInfo.getUserId(),
            Territorio_fiscal__c = 'Territorio Común',
            Fecha_inicio_Contrato__c = Date.today().addMonths(-6));
        insert ccf;
        // Contrato de baja hace dos meses: cuenta en los meses antiguos pero no hoy
        insert new Contrato_Contabilidad_y_Fiscal__c(Empresa__c = acc.Id, Estado__c = 'Cerrado',
            Asesor_responsable__c = UserInfo.getUserId(),
            Fecha_inicio_Contrato__c = Date.today().addMonths(-10),
            Fecha_baja__c = Date.today().addMonths(-2).toStartOfMonth());
        insert new Case(Subject = 'Test contrato', AccountId = acc.Id, OwnerId = UserInfo.getUserId());
        insert new Task(Subject = 'Test tarea vencida', OwnerId = UserInfo.getUserId(),
            Empresa__c = acc.Id, ActivityDate = Date.today().addDays(-3));

        // Tareas de todos los usuarios: la tarea vencida sale con su propietario
        List<AreaContableFiscalController.TareaEquipoDTO> tareasTodas =
            AreaContableFiscalController.getTareasTodas();
        Boolean hayTareaTest = false;
        for (AreaContableFiscalController.TareaEquipoDTO t : tareasTodas) {
            if (t.asunto == 'Test tarea vencida') {
                hayTareaTest = true;
                System.assertEquals(UserInfo.getUserId(), t.ownerId, 'Propietario informado');
                System.assertEquals(true, t.ownerActivo, 'El usuario del test está activo');
            }
        }
        System.assert(hayTareaTest, 'La tarea vencida del test sale en el listado de todos');

        // Obligaciones tributarias: solo el contrato no cerrado, con su modelo
        insert new Impuestos__c(Contrato_Contabilidad_y_Fiscal__c = ccf.Id,
            Empresa__c = acc.Id, Modelos__c = '303',
            Asesor_responsable__c = UserInfo.getUserId());
        // Local afecto y actividad económica de la empresa, contados en la cabecera de la ficha
        insert new Local_afecto__c(Empresa__c = acc.Id, Metro_cuadrados__c = 100,
            Localizaci_n__Street__s = 'Calle Test 1', Localizaci_n__City__s = 'Madrid',
            Localizaci_n__PostalCode__s = '28001', Localizaci_n__StateCode__s = 'MA',
            Localizaci_n__CountryCode__s = 'ES');
        Epigrafes__c epigrafe = new Epigrafes__c(Name = 'Epígrafe test');
        insert epigrafe;
        insert new actividad_economica__c(Empresa__c = acc.Id,
            Ep_grafes_IAE__c = epigrafe.Id, Fecha_de_Alta__c = Date.today());
        List<AreaContableFiscalController.ObligacionDTO> oblig =
            AreaContableFiscalController.getObligacionesTributarias();
        System.assertEquals(1, oblig.size(), 'Solo el contrato no cerrado');
        System.assertEquals(ccf.Id, oblig[0].contratoId, 'Contrato de la fila');
        System.assert(String.isNotBlank(oblig[0].numero), 'Nº del contrato para el enlace de la ficha');
        System.assertEquals('Territorio Común', oblig[0].territorioFiscal, 'Territorio fiscal del contrato');
        System.assertEquals(1, oblig[0].nLocales, 'Locales afectos de la empresa');
        System.assertEquals(1, oblig[0].nActividades, 'Actividades económicas de la empresa');
        Boolean hay303 = false;
        for (AreaContableFiscalController.ModeloOblDTO m : oblig[0].modelos) {
            if (m.modelo == '303') hay303 = true;
        }
        System.assert(hay303, 'El modelo 303 del contrato');

        // Alta de obligación: exige contrato no cerrado y la asocia a él
        Map<String, Object> opciones = AreaContableFiscalController.getOpcionesObligacion();
        System.assert(!((List<String>) opciones.get('modelos')).isEmpty(),
            'El alta ofrece los modelos del picklist');
        System.assert(opciones.containsKey('modalidadesPorModelo'),
            'El alta ofrece las modalidades dependientes de cada modelo');
        System.assert(opciones.containsKey('periodicidadesPorModelo'),
            'El alta ofrece las periodicidades dependientes de cada modelo');
        Id contratoSel = AreaContableFiscalController.crearObligacionTributaria(
            acc.Id, '111', 'Trimestral', 'Territorio Común', 'Profesionales', Date.today(),
            'Despacho', 'ERP del Despacho', null, null);
        System.assertEquals(ccf.Id, contratoSel, 'Devuelve el contrato para marcar el cliente');
        try {
            AreaContableFiscalController.crearObligacionTributaria(
                acc.Id, '111', 'Trimestral', 'Territorio Común', 'Profesionales', null,
                'Despacho', 'ERP del Despacho', null, null);
            System.assert(false, 'Sin fecha de alta debia rechazar el alta');
        } catch (AuraHandledException e) {
            System.assert(true, 'Alta rechazada sin fecha de alta');
        }
        try {
            AreaContableFiscalController.crearObligacionTributaria(
                acc.Id, '111', 'Trimestral', null, 'Profesionales', Date.today(),
                'Despacho', 'ERP del Despacho', null, null);
            System.assert(false, 'Sin territorio debia rechazar el alta');
        } catch (AuraHandledException e) {
            System.assert(true, 'Alta rechazada sin territorio');
        }
        try {
            AreaContableFiscalController.crearObligacionTributaria(
                acc.Id, '111', 'Trimestral', 'Territorio Común', null, Date.today(),
                'Despacho', 'ERP del Despacho', null, null);
            System.assert(false, 'El 111 tiene modalidades: sin modalidad debia rechazar el alta');
        } catch (AuraHandledException e) {
            System.assert(true, 'Alta rechazada sin modalidad');
        }
        try {
            AreaContableFiscalController.crearObligacionTributaria(
                acc.Id, '111', 'Trimestral', 'Territorio Común', 'Profesionales', Date.today(),
                null, 'ERP del Despacho', null, null);
            System.assert(false, 'Sin quien presenta debia rechazar el alta');
        } catch (AuraHandledException e) {
            System.assert(true, 'Alta rechazada sin quien presenta');
        }
        // Tipo de titular editable desde la ficha censal
        AreaContableFiscalController.actualizarTipoTitular(acc.Id, 'Persona Jurídica');
        System.assertEquals('Persona Jurídica',
            [SELECT Tipo_de_titular__c FROM Account WHERE Id = :acc.Id].Tipo_de_titular__c,
            'El tipo de titular se graba en la empresa');
        // Edición rápida de software, modalidad y presentación desde el listado
        Impuestos__c creada = [SELECT Id FROM Impuestos__c WHERE Modelos__c = '111' LIMIT 1];
        AreaContableFiscalController.actualizarImpuestoRapido(creada.Id, 'ERP del Despacho', 'Profesionales', 'Despacho');
        creada = [SELECT Software_preparaci_n_impuesto__c, Modalidad__c, Presentaci_n_del_impuesto__c
                  FROM Impuestos__c WHERE Id = :creada.Id];
        System.assertEquals('ERP del Despacho', creada.Software_preparaci_n_impuesto__c,
            'La edición rápida graba el software de presentación');
        System.assertEquals('Profesionales', creada.Modalidad__c,
            'La edición rápida graba la modalidad');
        System.assertEquals('Despacho', creada.Presentaci_n_del_impuesto__c,
            'La edición rápida graba quién presenta');
        // Edición completa desde la ficha: el asesor responsable de la obligación se cambia
        AreaContableFiscalController.actualizarObligacionTributaria(creada.Id, '111', 'Trimestral',
            'Territorio Común', 'Profesionales', Date.today(), 'Despacho', 'ERP del Despacho',
            UserInfo.getUserId(), 'Si');
        System.assertEquals(UserInfo.getUserId(),
            [SELECT Asesor_responsable__c FROM Impuestos__c WHERE Id = :creada.Id].Asesor_responsable__c,
            'La edición de la ficha graba el asesor responsable elegido');
        System.assertEquals('Si', [SELECT Exonerado__c FROM Impuestos__c WHERE Id = :creada.Id].Exonerado__c,
            'La edición de la ficha graba el exonerado');
        Account accSin = new Account(Name = 'Sin contrato CCF', Procedencia_del_cliente__c = 'Test');
        insert accSin;
        try {
            AreaContableFiscalController.crearObligacionTributaria(
                accSin.Id, '111', 'Trimestral', 'Territorio Común', 'Profesionales', Date.today(),
                'Despacho', 'ERP del Despacho', null, null);
            System.assert(false, 'Sin contrato no cerrado debía rechazar el alta');
        } catch (AuraHandledException e) {
            System.assert(true, 'Alta rechazada sin contrato');
        }

        // Evolución mensual de contratos vivos por fecha de inicio y de baja
        AreaContableFiscalController.ContratosMesesDTO meses = AreaContableFiscalController.getContratosCFMeses(null, null, null);
        System.assertEquals(12, meses.meses.size(), 'Doce meses de evolución');
        System.assertEquals(1, meses.totalHoy, 'Hoy solo vive el contrato sin baja');
        // Solo meses cerrados (el último índice es el mes anterior). Hace 6 meses
        // (índice 6) vivían los dos: el iniciado hace 10 aún sin baja y el
        // iniciado ese mismo mes
        System.assertEquals(2, meses.meses[6].n, 'Hace seis meses vivían los dos contratos');

        List<AreaContableFiscalController.ContratoCFDTO> filas = AreaContableFiscalController.getContratosCF();
        System.assertEquals(1, filas.size(), 'Debe listar el contrato abierto');
        System.assertEquals('Test CCF', filas[0].empresa);
        System.assertEquals(1, filas[0].casos, 'El caso abierto de la empresa debe contarse');
        System.assertEquals(1, filas[0].tareas, 'La tarea abierta vencida de la empresa debe contarse');
    }

    @isTest
    static void testBuzonContable() {
        Account acc = new Account(Name = 'Test Buzon', Procedencia_del_cliente__c = 'Test', CIF__c = 'B00000001');
        insert acc;
        insert new Buzon_contable__c(Empresa__c = acc.Id, Tipo_documentaci_n__c = 'Facturas emitidas',
            Ejercicio__c = '2026', Periodicidad__c = 'Mensual', Suptipo_periodo__c = 'Enero');

        List<AreaContableFiscalController.BuzonDTO> filas = AreaContableFiscalController.getBuzonContable();
        System.assertEquals(1, filas.size(), 'Debe listar el registro del buzon');
        System.assertEquals('Test Buzon', filas[0].empresa);
        System.assertNotEquals(null, filas[0].numero, 'El numero del registro debe venir informado');
    }

    @isTest
    static void testContabVencida() {
        System.assert(AreaContableFiscalController.contabVencida('2020', 'Enero'), 'Un periodo antiguo esta vencido');
        System.assert(AreaContableFiscalController.contabVencida('2020', 'Primer Trimestre'),
            'El trimestre vence con su ultimo mes');
        System.assert(!AreaContableFiscalController.contabVencida('2099', 'Enero'), 'Un periodo futuro no esta vencido');
        System.assert(!AreaContableFiscalController.contabVencida('no-numerico', 'Enero'), 'Un ejercicio invalido no marca vencida');
    }

    @isTest
    static void testPrecierreVencido() {
        System.assert(AreaContableFiscalController.precierreVencido('2020'),
            'Un ejercicio pasado esta vencido tras el 31 de octubre');
        System.assert(!AreaContableFiscalController.precierreVencido('2099'), 'Un ejercicio futuro no esta vencido');
        System.assert(!AreaContableFiscalController.precierreVencido('no-numerico'), 'Un ejercicio invalido no marca vencido');
        Date hoy = Date.today();
        System.assertEquals(hoy > Date.newInstance(hoy.year(), 10, 31),
            AreaContableFiscalController.precierreVencido(String.valueOf(hoy.year())),
            'El ejercicio actual vence justo despues del 31 de octubre');
    }

    @isTest
    static void testCierreVencido() {
        System.assert(AreaContableFiscalController.cierreVencido('2020'),
            'Un ejercicio pasado esta vencido tras el 30 de abril');
        System.assert(!AreaContableFiscalController.cierreVencido('2099'), 'Un ejercicio futuro no esta vencido');
        System.assert(!AreaContableFiscalController.cierreVencido('no-numerico'), 'Un ejercicio invalido no marca vencido');
        Date hoy = Date.today();
        System.assertEquals(hoy > Date.newInstance(hoy.year(), 4, 30),
            AreaContableFiscalController.cierreVencido(String.valueOf(hoy.year())),
            'El ejercicio actual vence justo despues del 30 de abril');
    }

    @isTest
    static void testCuentasVencida() {
        System.assert(AreaContableFiscalController.cuentasVencida('2020'),
            'Un ejercicio pasado esta vencido tras el 30 de julio');
        System.assert(!AreaContableFiscalController.cuentasVencida('2099'), 'Un ejercicio futuro no esta vencido');
        System.assert(!AreaContableFiscalController.cuentasVencida('no-numerico'), 'Un ejercicio invalido no marca vencida');
        Date hoy = Date.today();
        System.assertEquals(hoy > Date.newInstance(hoy.year(), 7, 30),
            AreaContableFiscalController.cuentasVencida(String.valueOf(hoy.year())),
            'El ejercicio actual vence justo despues del 30 de julio');
    }

    @isTest
    static void testColorSemaforo() {
        System.assertEquals('rojo', AreaContableFiscalController.colorSemaforo('<img src="x" alt="Warningrojo" border="0"/>'));
        System.assertEquals('verde', AreaContableFiscalController.colorSemaforo('<img src="x" alt="Verde" border="0"/>'));
        System.assertEquals('gris', AreaContableFiscalController.colorSemaforo(null));
        System.assertEquals('gris', AreaContableFiscalController.colorSemaforo('<img src="x" alt="Otro" border="0"/>'));
    }

    // Endpoint SQL de Sage simulado: movimientos por código de empresa
    private class SageMovsMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse r = new HttpResponse();
            r.setHeader('Content-Type', 'application/json');
            r.setStatusCode(200);
            r.setBody('{"data":[{"CodigoEmpresa":4,"n":3168,"manual":1000},{"CodigoEmpresa":27,"n":13695,"manual":0}]}');
            return r;
        }
    }

    @isTest
    static void movimientosContablesDesdeSage() {
        Test.setMock(HttpCalloutMock.class, new SageMovsMock());
        Test.startTest();
        Map<String, AreaContableFiscalController.MovsSageDTO> movs =
            AreaContableFiscalController.getMovimientosContables12m();
        Test.stopTest();
        System.assertEquals(3168, movs.get('4').total, 'Los movimientos llegan por código de empresa del ERP');
        System.assertEquals(1000, movs.get('4').manual, 'Los manuales (EN/ES) viajan aparte');
        System.assertEquals(13695, movs.get('27').total, 'Cada código trae su recuento de 12 meses');
        System.assertEquals(0, movs.get('27').manual, 'Sin manuales, cero');
    }

    @isTest
    static void testCargaTrabajo() {
        // Usuario activo de Fiscal y Contable (el DML de User va en runAs para no mezclarlo con datos)
        // Mismo perfil que quien ejecuta el test: el flujo de creación del contrato transfiere el registro al asesor
        User u = new User(Alias = 'carga', LastName = 'Carga Trabajo', Email = 'carga@innovaciondespachos.com',
            Username = 'carga' + Datetime.now().getTime() + '@test.com', ProfileId = UserInfo.getProfileId(),
            EmailEncodingKey = 'UTF-8', LanguageLocaleKey = 'es', LocaleSidKey = 'es_ES',
            TimeZoneSidKey = 'Europe/Paris', Departamento__c = 'Fiscal y Contable',
            Empresa_Titular__c = 'GM Consulting Empresarial, S.L');
        System.runAs(new User(Id = UserInfo.getUserId())) { insert u; }

        Account acc = new Account(Name = 'Test Carga', Procedencia_del_cliente__c = 'Test', CIF__c = 'B00000001');
        insert acc;
        // Contrato de gestión contable y fiscal del usuario, con código ERP y cuota
        Contrato_Contabilidad_y_Fiscal__c ccf = new Contrato_Contabilidad_y_Fiscal__c(
            Empresa__c = acc.Id, Estado__c = 'Abierto', Asesor_responsable__c = u.Id,
            Tipo_de_servicio__c = 'Asesoría', C_digo_ERP__c = 4,
            Fecha_inicio_Contrato__c = Date.today().addMonths(-6));
        insert ccf;
        // Contrato de otro asesor donde el usuario lleva una obligación
        Contrato_Contabilidad_y_Fiscal__c otro = new Contrato_Contabilidad_y_Fiscal__c(
            Empresa__c = acc.Id, Estado__c = 'Abierto', Asesor_responsable__c = UserInfo.getUserId(),
            Tipo_de_servicio__c = 'Consultoría', Fecha_inicio_Contrato__c = Date.today().addMonths(-6));
        insert otro;
        // Solo cuentan las que presenta el despacho: la del 115 la presenta el cliente y no suma
        insert new List<Impuestos__c>{
            new Impuestos__c(Contrato_Contabilidad_y_Fiscal__c = ccf.Id, Empresa__c = acc.Id,
                Modelos__c = '303', Periodicidad__c = 'Trimestral', Estado__c = 'Alta', Asesor_responsable__c = u.Id,
                Presentaci_n_del_impuesto__c = 'Despacho'),
            new Impuestos__c(Contrato_Contabilidad_y_Fiscal__c = ccf.Id, Empresa__c = acc.Id,
                Modelos__c = '200', Periodicidad__c = 'Anual', Estado__c = 'Alta', Asesor_responsable__c = u.Id,
                Presentaci_n_del_impuesto__c = 'Despacho'),
            new Impuestos__c(Contrato_Contabilidad_y_Fiscal__c = otro.Id, Empresa__c = acc.Id,
                Modelos__c = '111', Periodicidad__c = 'Mensual', Estado__c = 'Alta', Asesor_responsable__c = u.Id,
                Presentaci_n_del_impuesto__c = 'Despacho'),
            new Impuestos__c(Contrato_Contabilidad_y_Fiscal__c = ccf.Id, Empresa__c = acc.Id,
                Modelos__c = '115', Periodicidad__c = 'Trimestral', Estado__c = 'Alta', Asesor_responsable__c = u.Id,
                Presentaci_n_del_impuesto__c = 'Cliente'),
            new Impuestos__c(Contrato_Contabilidad_y_Fiscal__c = ccf.Id, Empresa__c = acc.Id,
                Modelos__c = '390', Periodicidad__c = 'Anual', Estado__c = 'Baja', Asesor_responsable__c = u.Id,
                Presentaci_n_del_impuesto__c = 'Despacho'),
            // De alta por estado pero con fecha de baja: tampoco cuenta, como en la pestaña de obligaciones
            new Impuestos__c(Contrato_Contabilidad_y_Fiscal__c = ccf.Id, Empresa__c = acc.Id,
                Modelos__c = '349', Periodicidad__c = 'Trimestral', Estado__c = 'Alta', Asesor_responsable__c = u.Id,
                Presentaci_n_del_impuesto__c = 'Despacho', Fecha_Baja__c = Date.today())
        };

        List<AreaContableFiscalController.CargaTrabajoDTO> filas = AreaContableFiscalController.getCargaTrabajo(null);
        AreaContableFiscalController.CargaTrabajoDTO fila;
        for (AreaContableFiscalController.CargaTrabajoDTO f : filas) {
            if (f.usuarioId == u.Id) fila = f;
        }
        System.assertNotEquals(null, fila, 'El usuario de Fiscal y Contable sale en la carga de trabajo');
        System.assertEquals('GM Consulting Empresarial, S.L', fila.empresaTitular, 'Empresa titular de la ficha del usuario');
        System.assertEquals(1, fila.contratos, 'Un contrato asignado no cerrado');
        System.assertEquals(1, fila.contratosGestion, 'De gestión contable y fiscal');
        System.assertEquals(0, fila.contratosConsultoria, 'Ninguno de consultoría');
        System.assertEquals(1, fila.mensuales, 'La mensual del contrato de otro asesor cuenta para el usuario');
        System.assertEquals(1, fila.trimestrales, 'Una trimestral de alta que presenta el despacho (la del cliente no cuenta)');
        System.assertEquals(1, fila.anuales, 'Una anual de alta (la de baja no cuenta)');
        System.assertEquals(1, fila.modelo200, 'El modelo 200 de alta');
        System.assertEquals(new List<Integer>{ 4 }, fila.codigosErp, 'El código ERP del contrato de gestión contable');
        // Desglose: su contrato y, además, el contrato del otro asesor donde lleva la mensual
        // (fila ajena), para que la suma de las empresas cuadre con el total del usuario
        System.assertEquals(2, fila.detalle.size(), 'Su contrato y el ajeno donde lleva una obligación');
        AreaContableFiscalController.ContratoCargaDTO propio;
        AreaContableFiscalController.ContratoCargaDTO ajeno;
        for (AreaContableFiscalController.ContratoCargaDTO d : fila.detalle) {
            if (d.contratoId == ccf.Id) propio = d;
            if (d.contratoId == otro.Id) ajeno = d;
        }
        System.assertNotEquals(null, propio, 'El contrato asignado está en el desglose');
        System.assertEquals(false, propio.ajeno, 'Su contrato no es ajeno');
        System.assertEquals(1, propio.trimestrales, 'La trimestral del despacho cuelga de su contrato');
        System.assertEquals(1, propio.modelo200, 'El 200 cuelga de su contrato');
        System.assertEquals(0, propio.mensuales, 'La mensual no es de su contrato');
        System.assertNotEquals(null, ajeno, 'El contrato del otro asesor está en el desglose');
        System.assertEquals(true, ajeno.ajeno, 'Marcado como ajeno');
        System.assertEquals(1, ajeno.mensuales, 'La mensual cuelga del contrato ajeno');
        System.assertEquals(null, ajeno.cuotaMensual, 'La cuota del contrato ajeno no es suya');
        System.assertEquals(UserInfo.getName(), ajeno.asesorContrato, 'El asesor del contrato ajeno');
        System.assert(filas[filas.size() - 1].esSinAsesor, 'La última fila es la de Sin asesor');

        // Excluyendo la empresa, sus contratos y obligaciones salen de todos los cálculos
        for (AreaContableFiscalController.CargaTrabajoDTO f :
                AreaContableFiscalController.getCargaTrabajo(new List<Id>{ acc.Id })) {
            if (f.usuarioId == u.Id) {
                System.assertEquals(0, f.contratos, 'Sin la empresa excluida no quedan contratos');
                System.assertEquals(0, f.trimestrales + f.anuales + f.mensuales, 'Ni obligaciones');
                System.assertEquals(0, f.detalle.size(), 'Ni desglose');
            }
        }
    }

    @IsTest
    static void getLeadsAbiertosListaPendientesYAtendidos() {
        insert new List<Lead>{
            new Lead(LastName = 'Lead pendiente', Company = 'Empresa Pendiente', Status = 'Nuevo',
                     Email = 'pendiente@test.com', Nombre_del_formulario__c = 'Formulario web'),
            new Lead(LastName = 'Lead atendido', Company = 'Empresa Atendida', Status = 'Atendido')
        };

        Test.startTest();
        List<AreaContableFiscalController.LeadDTO> filas = AreaContableFiscalController.getLeadsAbiertos();
        Test.stopTest();

        System.assertEquals(2, filas.size(), 'Lista los leads pendientes y atendidos no convertidos');
        Map<String, AreaContableFiscalController.LeadDTO> porEmpresa = new Map<String, AreaContableFiscalController.LeadDTO>();
        for (AreaContableFiscalController.LeadDTO f : filas) porEmpresa.put(f.empresa, f);
        AreaContableFiscalController.LeadDTO pendiente = porEmpresa.get('Empresa Pendiente');
        System.assert(String.isNotBlank(pendiente.propietario), 'El propietario del lead viaja con su nombre');
        System.assertEquals(String.valueOf(pendiente.propietarioId).startsWith('005'), pendiente.propietarioId != null,
            'El Id del propietario solo viaja cuando es un usuario');
        System.assertNotEquals(null, pendiente, 'El lead pendiente esta en la lista');
        System.assertEquals('pendiente@test.com', pendiente.email);
        System.assertEquals('Formulario web', pendiente.formulario);
        System.assertEquals(Date.today(), pendiente.fechaCreacion, 'Fecha de creacion informada');
        System.assert(String.isNotBlank(pendiente.estado), 'El estado viene con su etiqueta');
        System.assertNotEquals(null, porEmpresa.get('Empresa Atendida'), 'El lead atendido esta en la lista');
    }

    @IsTest
    static void getTareasLegalesUsuarioListaLasCompletadasConVencimientoLegal() {
        Account acc = new Account(Name = 'Cuenta tareas legales', Procedencia_del_cliente__c = 'Test');
        insert acc;
        insert new List<Task>{
            new Task(Subject = 'Modelo 303 presentado', Status = 'Completo', ActivityDate = Date.today(),
                     Vencimiento_Legal__c = Date.today().addDays(5), Fecha_presentaci_n__c = Date.today(), Confirmar_fecha_presentaci_n__c = Date.today(),
                     WhatId = acc.Id, OwnerId = UserInfo.getUserId()),
            new Task(Subject = 'Tarea sin vencimiento legal', Status = 'Completo', ActivityDate = Date.today(),
                     Fecha_presentaci_n__c = Date.today(), Confirmar_fecha_presentaci_n__c = Date.today(), OwnerId = UserInfo.getUserId()),
            new Task(Subject = 'Tarea abierta', Status = 'Abierto', ActivityDate = Date.today(),
                     Vencimiento_Legal__c = Date.today(), OwnerId = UserInfo.getUserId()),
            new Task(Subject = 'Tarea de hace mas de un año', Status = 'Completo', ActivityDate = Date.today().addMonths(-13),
                     Vencimiento_Legal__c = Date.today().addMonths(-13), Fecha_presentaci_n__c = Date.today().addMonths(-13), Confirmar_fecha_presentaci_n__c = Date.today().addMonths(-13),
                     OwnerId = UserInfo.getUserId())
        };

        Test.startTest();
        List<AreaContableFiscalController.TareaLegalDTO> filas =
            AreaContableFiscalController.getTareasLegalesUsuario(UserInfo.getUserId());
        Test.stopTest();

        System.assertEquals(1, filas.size(), 'Solo la completada con vencimiento legal de los ultimos doce meses');
        System.assertEquals('Modelo 303 presentado', filas[0].asunto);
        System.assertEquals('Cuenta tareas legales', filas[0].relacionado, 'Nombre del registro relacionado');
        System.assertEquals(Date.today().addDays(5), filas[0].vencimientoLegal);
        System.assertEquals(Date.today(), filas[0].vencimiento);
        System.assert(String.isNotBlank(filas[0].usuario), 'Nombre del propietario');
        System.assert(String.isNotBlank(filas[0].estado), 'Estado de la tarea con su etiqueta');
        System.assertEquals(null, filas[0].tituloRelacionado, 'Una cuenta no es un expediente: sin titulo');
        System.assertEquals(0, AreaContableFiscalController.getTareasLegalesUsuario(null).size(), 'Sin usuario, lista vacia');
    }

    // Endpoint SQL de Sage simulado: detalle por mes, usuario y tipo de entrada
    private class SageMovsDetalleMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse r = new HttpResponse();
            r.setHeader('Content-Type', 'application/json');
            r.setStatusCode(200);
            r.setBody('{"data":[{"anio":2026,"mes":3,"usuario":5,"nombre":"ANA  ","tipoEntrada":"EN","tipoDesc":"Entrada Manual","n":10},'
                + '{"anio":2026,"mes":3,"usuario":5,"nombre":"ANA  ","tipoEntrada":"IN","tipoDesc":"Activos Fijos","n":90},'
                + '{"anio":2026,"mes":4,"usuario":7,"nombre":null,"tipoEntrada":"IO","tipoDesc":null,"n":25}]}');
            return r;
        }
    }
    // Endpoint SQL de Sage simulado: error del servidor
    private class SageErrorMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse r = new HttpResponse();
            r.setStatusCode(500);
            r.setBody('{"Message":"boom"}');
            return r;
        }
    }

    @isTest
    static void movimientosContablesDetalleDesdeSage() {
        Test.setMock(HttpCalloutMock.class, new SageMovsDetalleMock());
        Test.startTest();
        AreaContableFiscalController.MovsSageDetalleResultDTO res =
            AreaContableFiscalController.getMovimientosContablesDetalle(new List<Integer>{ 344, null, 390 });
        AreaContableFiscalController.MovsSageDetalleResultDTO vacio =
            AreaContableFiscalController.getMovimientosContablesDetalle(new List<Integer>());
        AreaContableFiscalController.MovsSageDetalleResultDTO sinLista =
            AreaContableFiscalController.getMovimientosContablesDetalle(null);
        Test.stopTest();
        System.assertEquals(String.valueOf(Date.today().addMonths(-12)).left(10), res.desde,
            'El periodo empieza hace doce meses, como la columna de la tabla');
        System.assertEquals(3, res.filas.size(), 'Una fila por mes, usuario y tipo de entrada');
        System.assertEquals(2026, res.filas[0].anio);
        System.assertEquals(3, res.filas[0].mes);
        System.assertEquals(5, res.filas[0].usuario);
        System.assertEquals('ANA', res.filas[0].usuarioNombre, 'El nombre de Sage llega sin espacios de relleno');
        System.assertEquals(true, res.filas[0].manual, 'EN es una entrada manual');
        System.assertEquals('Entrada Manual', res.filas[0].tipoEntradaDesc, 'El concepto del tipo viene de la tabla de Sage');
        System.assertEquals(false, res.filas[1].manual, 'IN (activos fijos) es automatica');
        System.assertEquals('IN', res.filas[1].tipoEntrada);
        System.assertEquals(90, res.filas[1].n);
        System.assertEquals(null, res.filas[2].usuarioNombre, 'Usuario sin ficha en lsysUsuarios: sin nombre');
        System.assertEquals(null, res.filas[2].tipoEntradaDesc, 'Tipo sin fila en la tabla de Sage: sin concepto, lo completa el LWC');
        System.assertEquals(0, vacio.filas.size(), 'Sin codigos de empresa no se consulta Sage');
        System.assertEquals(0, sinLista.filas.size(), 'Sin lista tampoco');
    }

    @isTest
    static void movimientosContablesErrorDeSage() {
        Test.setMock(HttpCalloutMock.class, new SageErrorMock());
        Test.startTest();
        Boolean lanzada = false;
        try {
            AreaContableFiscalController.getMovimientosContablesDetalle(new List<Integer>{ 1 });
        } catch (AuraHandledException e) {
            lanzada = true;
        }
        Test.stopTest();
        System.assert(lanzada, 'Un estado distinto de 200 debe lanzar AuraHandledException');
    }

    @isTest
    static void testGuardarCatalogoHtml() {
        Test.startTest();
        Id d1 = AreaContableFiscalController.guardarCatalogoHtml('<p>v1</p>');
        Id d2 = AreaContableFiscalController.guardarCatalogoHtml('<p>v2</p>');
        Test.stopTest();
        System.assertEquals(d1, d2, 'El catálogo se guarda siempre en el mismo Documento del usuario');
        Document d = [SELECT Body, FolderId, DeveloperName FROM Document WHERE Id = :d1];
        System.assertEquals('<p>v2</p>', d.Body.toString(), 'Se sobrescribe con la última exportación');
        System.assertEquals(UserInfo.getUserId(), d.FolderId, 'Va en la carpeta personal del usuario');
        System.assert(d.DeveloperName.startsWith('ACF_Catalogo_Modelos_'), 'Nombre de desarrollador del catálogo');
        System.assertEquals('Catálogo de modelos (HTML para el PDF)', [SELECT Name FROM Document WHERE Id = :d1].Name);
        // Otro tipo va a otro Documento con su propio prefijo, y un tipo desconocido se rechaza
        Id r1 = AreaContableFiscalController.guardarHtmlPdf('<p>reglas</p>', 'Reglas_Incidencias');
        System.assertNotEquals(d1, r1, 'Cada tipo de PDF tiene su propio Documento');
        System.assert([SELECT DeveloperName FROM Document WHERE Id = :r1].DeveloperName.startsWith('ACF_Reglas_Incidencias_'));
        Boolean tipoMalo = false;
        try {
            AreaContableFiscalController.guardarHtmlPdf('<p>x</p>', 'Otro');
        } catch (AuraHandledException e) {
            tipoMalo = true;
        }
        System.assert(tipoMalo, 'Un tipo no reconocido debe lanzar AuraHandledException');
        Boolean lanzada = false;
        try {
            AreaContableFiscalController.guardarCatalogoHtml('   ');
        } catch (AuraHandledException e) {
            lanzada = true;
        }
        System.assert(lanzada, 'Sin contenido debe lanzar AuraHandledException');
    }
}