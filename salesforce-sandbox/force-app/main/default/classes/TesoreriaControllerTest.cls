/**
 * Tests de TesoreriaController.
 */
@isTest
private class TesoreriaControllerTest {

    private static String primerValorPicklist(String objApi, String fieldApi) {
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objApi);
        if (t == null) return null;
        Schema.DescribeFieldResult fr = t.getDescribe().fields.getMap().get(fieldApi).getDescribe();
        for (Schema.PicklistEntry e : fr.getPicklistValues()) {
            if (e.isActive()) return e.getValue();
        }
        return null;
    }

    @isTest
    static void testGetMediosPago() {
        String empresa = primerValorPicklist('Cuenta_bancaria__c', 'Empresa_titular_medios__c');

        Cuenta_bancaria__c cta = new Cuenta_bancaria__c(
            Tipo__c = 'Cuenta bancaria', Empresa_titular_medios__c = empresa, IBAN__c = 'ES00 0000 TEST 1');
        Cuenta_bancaria__c tar = new Cuenta_bancaria__c(
            Tipo__c = 'Tarjetas', Empresa_titular_medios__c = empresa, IBAN__c = 'Tarjeta test');
        Cuenta_bancaria__c caj = new Cuenta_bancaria__c(
            Tipo__c = 'Hoja de Caja', Empresa_titular_medios__c = empresa, IBAN__c = 'Caja test');
        insert new List<Cuenta_bancaria__c>{ cta, tar, caj };

        insert new List<Extracto_bancario__c>{
            new Extracto_bancario__c(Cuenta_bancaria_bancos__c = cta.Id, importe__c = 100,
                Fecha_movimiento__c = Date.today().addDays(-2), Concepto__c = 'Ingreso test'),
            new Extracto_bancario__c(Cuenta_bancaria_bancos__c = cta.Id, importe__c = -40,
                Fecha_movimiento__c = Date.today().addDays(-1), Concepto__c = 'Cargo test'),
            new Extracto_bancario__c(Cuenta_bancaria_bancos__c = tar.Id, importe__c = -25,
                Fecha_movimiento__c = Date.today().addDays(-1), Concepto__c = 'Tarjeta test'),
            new Extracto_bancario__c(Cuenta_bancaria_bancos__c = caj.Id, importe__c = 15,
                Fecha_movimiento__c = Date.today(), Concepto__c = 'Caja test')
        };

        Test.startTest();
        TesoreriaController.MediosPagoResult res = TesoreriaController.getMediosPago();
        Test.stopTest();

        System.assertNotEquals(null, res);
        System.assert(res.cuentas.size() >= 3, 'Debe devolver las cuentas creadas');
        System.assert(res.serie.size() >= 2, 'La serie diaria debe incluir las fechas de los extractos de tipo Cuenta bancaria');

        // El saldo de la cuenta bancaria de test debe ser la suma de sus extractos (100 - 40)
        Decimal saldoCta;
        Integer movsCta, pendCta;
        Date ultCta;
        Boolean hayTarjeta = false, hayCaja = false;
        for (TesoreriaController.CuentaDTO c : res.cuentas) {
            if (c.id == cta.Id) { saldoCta = c.saldo; movsCta = c.numMovimientos; pendCta = c.numPendientes; ultCta = c.fechaUltimo; }
            if (c.id == tar.Id) hayTarjeta = true;
            if (c.id == caj.Id) hayCaja = true;
        }
        System.assertEquals(60, saldoCta, 'Saldo = suma de importes de los extractos');
        System.assertEquals(2, movsCta, 'Numero total de movimientos de la cuenta');
        System.assertEquals(2, pendCta, 'Los extractos sin estado cuentan como no conciliados');
        System.assertEquals(Date.today().addDays(-1), ultCta, 'Fecha del ultimo movimiento');
        System.assert(hayTarjeta && hayCaja, 'Deben venir todos los tipos');

        // Serie filtrada por empresa titular
        List<TesoreriaController.PuntoDTO> serieEmp = TesoreriaController.getSerieEmpresa(empresa);
        System.assert(serieEmp.size() >= 2, 'La serie de la empresa debe incluir sus fechas');
        System.assertEquals(0, TesoreriaController.getSerieEmpresa(null).size(), 'Sin empresa no hay serie');

        // Serie de un grupo de empresas
        List<TesoreriaController.PuntoDTO> serieGrupo = TesoreriaController.getSerieGrupo(new List<String>{ empresa });
        System.assert(serieGrupo.size() >= 2, 'La serie del grupo debe incluir sus fechas');
        System.assertEquals(0, TesoreriaController.getSerieGrupo(new List<String>()).size(), 'Sin empresas no hay serie');
    }

    @isTest
    static void testConciliacion() {
        String empresa = primerValorPicklist('Cuenta_bancaria__c', 'Empresa_titular_medios__c');
        Cuenta_bancaria__c cta = new Cuenta_bancaria__c(
            Tipo__c = 'Cuenta bancaria', Empresa_titular_medios__c = empresa, IBAN__c = 'ES00 CONC TEST');
        insert cta;
        List<Extracto_bancario__c> extractos = new List<Extracto_bancario__c>{
            new Extracto_bancario__c(Cuenta_bancaria_bancos__c = cta.Id, importe__c = 100,
                Fecha_movimiento__c = Date.today().addDays(-2), Concepto__c = 'Ingreso conc', Estado__c = 'Pendiente'),
            new Extracto_bancario__c(Cuenta_bancaria_bancos__c = cta.Id, importe__c = -40,
                Fecha_movimiento__c = Date.today().addDays(-1), Concepto__c = 'Cargo conc', Estado__c = 'Conciliado')
        };
        insert extractos;

        // PDF adjunto al primer movimiento
        ContentVersion cv = new ContentVersion(Title = 'Justificante conc',
            PathOnClient = 'justificante.pdf', VersionData = Blob.valueOf('PDF test'));
        insert cv;
        Id docId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id].ContentDocumentId;
        insert new ContentDocumentLink(LinkedEntityId = extractos[0].Id, ContentDocumentId = docId, ShareType = 'V');

        String empresaEfc = primerValorPicklist('Reclamaci_n_de_impagados__c', 'Empresa_titular__c');
        Account cli = new Account(Name = 'Cliente Conciliacion Test',
            Procedencia_del_cliente__c = 'Test conciliacion');
        insert cli;
        Reclamaci_n_de_impagados__c efecto = new Reclamaci_n_de_impagados__c(Empresa_titular__c = empresaEfc,
            Estado__c = 'Pendiente', Importe_factura__c = 100,
            Fecha_Vencimiento__c = Date.today().addDays(10), Cliente__c = cli.Id);
        insert efecto;
        // Efecto ya pagado: no debe salir al conciliar un ingreso, sí en un pago
        insert new Reclamaci_n_de_impagados__c(Empresa_titular__c = empresaEfc, Estado__c = 'Pagado',
            Importe_factura__c = 100, Fecha_Vencimiento__c = Date.today().addDays(10), Cliente__c = cli.Id);
        // Abono transferido en negativo: debe salir en un pago buscando el importe en positivo
        insert new Reclamaci_n_de_impagados__c(Empresa_titular__c = empresaEfc, Estado__c = 'Transferido',
            Importe_factura__c = -100, Fecha_Vencimiento__c = Date.today().addDays(10), Cliente__c = cli.Id);
        // Efecto de proveedor pendiente: debe salir en los ingresos
        insert new Efectos_proveedores__c(Estado__c = 'Pendiente', Importe_efecto__c = 100,
            Empresa__c = cli.Id, Fecha_vencimiento__c = Date.today().addDays(10),
            Empresa_titular__c = primerValorPicklist('Efectos_proveedores__c', 'Empresa_titular__c'));

        // Conciliación existente del segundo movimiento (línea de asiento con efecto)
        insert new Conciliacion_bancaria__c(Extracto_bancario__c = extractos[1].Id,
            Efectos_clientes__c = efecto.Id, Importe__c = 40, Descripci_n__c = 'Linea conc test');
        // Apunte contable asociado al extracto (con su asiento contable)
        Asiento_contable__c asiento = new Asiento_contable__c();
        insert asiento;
        insert new Linea_asiento_contable__c(Extracto_bancario__c = extractos[1].Id,
            Asientos_contable__c = asiento.Id, Debe__c = 40, Descripci_n__c = 'Apunte conc test');

        Test.startTest();
        TesoreriaController.ConciliacionCuentaDTO res = TesoreriaController.getExtractosCuenta(cta.Id);
        List<TesoreriaController.ConcEfectoDTO> porImporte = TesoreriaController.buscarEfectosConciliacion(100, null, false, false, null, null);
        List<TesoreriaController.ConcEfectoDTO> porTexto = TesoreriaController.buscarEfectosConciliacion(null, 'Conciliacion Test', false, false, null, null);
        List<TesoreriaController.ConcEfectoDTO> sinCriterios = TesoreriaController.buscarEfectosConciliacion(null, null, false, false, null, null);
        List<TesoreriaController.ConcEfectoDTO> deIngreso = TesoreriaController.buscarEfectosConciliacion(100, null, true, false, null, null);
        List<TesoreriaController.ConcEfectoDTO> dePago = TesoreriaController.buscarEfectosConciliacion(100, null, false, true, null, null);
        List<TesoreriaController.ConcEfectoDTO> soloProv = TesoreriaController.buscarEfectosConciliacion(100, null, true, false, 'proveedor', null);
        List<TesoreriaController.ConcEfectoDTO> soloCli = TesoreriaController.buscarEfectosConciliacion(100, null, true, false, 'cliente', null);
        // Con la cuenta informada, solo efectos de su misma empresa titular
        for (TesoreriaController.ConcEfectoDTO d : TesoreriaController.buscarEfectosConciliacion(100, null, false, false, null, cta.Id)) {
            System.assertEquals(empresa, d.empresaTitular,
                'Con cuenta bancaria, los efectos deben ser de su misma empresa titular');
        }
        List<TesoreriaController.ConcEfectoDTO> delCliente = TesoreriaController.getEfectosDeCliente(cli.Id);
        System.assertEquals(3, delCliente.size(), 'Debe devolver todos los efectos del cliente con cualquier estado');
        System.assertEquals(0, TesoreriaController.getEfectosDeCliente(null).size(), 'Sin cliente no hay efectos');
        List<TesoreriaController.ConcEfectoDTO> delProveedor = TesoreriaController.getEfectosDeProveedor(cli.Id);
        System.assertEquals(1, delProveedor.size(), 'Debe devolver todos los efectos de proveedores de la empresa');
        System.assertEquals('Proveedor', delProveedor[0].tipo);
        System.assertEquals(0, TesoreriaController.getEfectosDeProveedor(null).size(), 'Sin empresa no hay efectos');
        TesoreriaController.ConcExistenteDTO conc = TesoreriaController.getConciliacionMovimiento(extractos[1].Id);
        Test.stopTest();

        System.assertEquals(1, conc.lineas.size(), 'Debe devolver las líneas de la conciliación del movimiento');
        System.assertEquals(40, conc.lineas[0].debe);
        System.assertEquals(efecto.Id, conc.lineas[0].efectoId);
        System.assertEquals('Cliente Conciliacion Test', conc.lineas[0].clienteNombre);
        // Puede haber apuntes extra creados por automatizaciones de la org
        System.assert(conc.apuntes.size() >= 1, 'Debe devolver los apuntes contables del extracto');
        Boolean hayApunteTest = false;
        for (TesoreriaController.ConcApunteDTO a : conc.apuntes) {
            if (a.descripcion == 'Apunte conc test' && a.debe == 40) hayApunteTest = true;
        }
        System.assert(hayApunteTest, 'Debe incluir el apunte de test con su debe');
        System.assertNotEquals(null, conc.asientoId, 'Debe informar el asiento contable asociado');
        System.assertEquals(0, TesoreriaController.getConciliacionMovimiento(null).lineas.size(), 'Sin extracto no hay líneas');

        System.assertEquals(2, res.movimientos.size(), 'Debe devolver los movimientos de la cuenta');
        // Orden cronológico ascendente: el front acumula el saldo
        System.assertEquals(100, res.movimientos[0].importe, 'El primer movimiento es el más antiguo');
        System.assertEquals('Conciliado', res.movimientos[1].estado);
        System.assertEquals(docId, res.movimientos[0].pdfId, 'El movimiento con adjunto debe traer su PDF');
        System.assertEquals(null, res.movimientos[1].pdfId, 'El movimiento sin adjunto no trae PDF');
        System.assertNotEquals(null, res.ultimaSync, 'Debe informar la última sincronización');
        System.assertEquals(0, TesoreriaController.getExtractosCuenta(null).movimientos.size(), 'Sin cuenta no hay movimientos');

        System.assert(porImporte.size() >= 1, 'Debe encontrar el efecto por importe exacto');
        Boolean hayCliente = false;
        for (TesoreriaController.ConcEfectoDTO d : porTexto) {
            if (d.clienteNombre == 'Cliente Conciliacion Test') hayCliente = true;
        }
        System.assert(hayCliente, 'Debe encontrar el efecto por el nombre del cliente');
        System.assertEquals(0, sinCriterios.size(), 'Sin importe ni texto no hay búsqueda');
        // Al conciliar un ingreso solo valen los estados pendientes de cobro
        for (TesoreriaController.ConcEfectoDTO d : deIngreso) {
            System.assertNotEquals('Pagado', d.estado, 'Un efecto pagado no debe salir al conciliar un ingreso');
        }
        System.assert(deIngreso.size() >= 1, 'El efecto pendiente positivo sí debe salir');
        Boolean hayProveedor = false;
        for (TesoreriaController.ConcEfectoDTO d : deIngreso) {
            if (d.tipo == 'Proveedor') hayProveedor = true;
        }
        System.assert(hayProveedor, 'En los ingresos deben salir también los efectos de proveedores no conciliados');
        // El selector de tipo limita a clientes o a proveedores
        System.assert(soloProv.size() >= 1, 'Con tipo proveedor deben salir efectos de proveedores');
        for (TesoreriaController.ConcEfectoDTO d : soloProv) {
            System.assertEquals('Proveedor', d.tipo, 'Con tipo proveedor no deben salir clientes');
        }
        for (TesoreriaController.ConcEfectoDTO d : soloCli) {
            System.assertEquals('Cliente', d.tipo, 'Con tipo cliente no deben salir proveedores');
        }
        // En los pagos también salen proveedores no conciliados
        Boolean provEnPago = false;
        for (TesoreriaController.ConcEfectoDTO d : dePago) {
            if (d.tipo == 'Proveedor') provEnPago = true;
        }
        System.assert(provEnPago, 'En los pagos deben salir también los efectos de proveedores no conciliados');
        // Al conciliar un pago: los clientes solo en Pagado (remesado) o Transferido,
        // casando el importe en ambos signos
        Boolean hayPagado = false, hayTransferidoNeg = false;
        for (TesoreriaController.ConcEfectoDTO d : dePago) {
            if (d.tipo != 'Cliente') continue;
            System.assert(d.estado == 'Pagado' || d.estado == 'Transferido',
                'En un pago los clientes solo se admiten en Pagado o Transferido');
            if (d.estado == 'Pagado' && d.importe == 100) hayPagado = true;
            if (d.estado == 'Transferido' && d.importe == -100) hayTransferidoNeg = true;
        }
        System.assert(hayPagado, 'La devolución del remesado (+100) debe salir en el pago');
        System.assert(hayTransferidoNeg, 'El abono transferido (-100) debe salir buscando 100');

        // Nuevo movimiento manual: ingreso en positivo (con adjunto) y pago en negativo
        Id ingresoId = TesoreriaController.crearMovimientoBanco(cta.Id, Date.today(), 'Ingreso manual', 'Detalle', 50, 'ingreso',
            'justificante.pdf', EncodingUtil.base64Encode(Blob.valueOf('PDF adjunto test')));
        Id pagoId = TesoreriaController.crearMovimientoBanco(cta.Id, Date.today(), 'Pago manual', null, 20, 'pago', null, null);
        System.assertEquals(1, [SELECT COUNT() FROM ContentDocumentLink WHERE LinkedEntityId = :ingresoId],
            'El fichero debe quedar adjunto al movimiento creado');
        Map<Id, Extracto_bancario__c> nuevos = new Map<Id, Extracto_bancario__c>([
            SELECT importe__c, Estado__c, Cuenta_bancaria_bancos__c FROM Extracto_bancario__c WHERE Id IN (:ingresoId, :pagoId)
        ]);
        System.assertEquals(50, nuevos.get(ingresoId).importe__c, 'El ingreso se guarda en positivo');
        System.assertEquals(-20, nuevos.get(pagoId).importe__c, 'El pago se guarda en negativo');
        System.assertEquals('Pendiente', nuevos.get(ingresoId).Estado__c);
        System.assertEquals(cta.Id, nuevos.get(ingresoId).Cuenta_bancaria_bancos__c);
        try {
            TesoreriaController.crearMovimientoBanco(cta.Id, Date.today(), 'X', null, -5, 'ingreso', null, null);
            System.assert(false, 'El importe negativo debe rechazarse');
        } catch (AuraHandledException ex) { /* esperado */ }

        // Conciliar: crea la conciliación por efecto y marca el extracto (el flow crea el asiento)
        TesoreriaController.conciliarMovimiento(ingresoId, new List<Id>{ efecto.Id }, null, null, null);
        Extracto_bancario__c conciliado = [SELECT Estado__c, Tipo__c, Asientos_contable__c FROM Extracto_bancario__c WHERE Id = :ingresoId];
        System.assertEquals('Conciliado', conciliado.Estado__c, 'El extracto debe quedar conciliado');
        System.assertEquals('Cobro', conciliado.Tipo__c, 'Importe positivo -> tipo Cobro');
        List<Conciliacion_bancaria__c> concs = [SELECT Haber__c, Importe__c, Efectos_clientes__c FROM Conciliacion_bancaria__c WHERE Extracto_bancario__c = :ingresoId];
        System.assertEquals(1, concs.size(), 'Debe crear una conciliación por efecto');
        System.assertEquals(100, concs[0].Haber__c, 'Efecto positivo va al haber');
        System.assertEquals(efecto.Id, concs[0].Efectos_clientes__c);
        try {
            TesoreriaController.conciliarMovimiento(ingresoId, new List<Id>{ efecto.Id }, null, null, null);
            System.assert(false, 'No debe permitir conciliar dos veces');
        } catch (AuraHandledException ex) { /* esperado */ }

        // Conciliar sin efectos: solo se crea el asiento, con la línea manual como conciliación sin efecto
        TesoreriaController.LineaManualDTO lm = new TesoreriaController.LineaManualDTO();
        lm.haber = 20;
        lm.descripcion = 'Linea manual test';
        TesoreriaController.conciliarMovimiento(pagoId, null, null,
            JSON.serialize(new List<TesoreriaController.LineaManualDTO>{ lm }), null);
        Extracto_bancario__c pagoConc = [SELECT Estado__c FROM Extracto_bancario__c WHERE Id = :pagoId];
        System.assertEquals('Conciliado', pagoConc.Estado__c, 'Debe conciliar aunque no haya efectos');
        List<Conciliacion_bancaria__c> concsManuales = [SELECT Importe__c, Haber__c, Descripci_n__c, Efectos_clientes__c
            FROM Conciliacion_bancaria__c WHERE Extracto_bancario__c = :pagoId];
        System.assertEquals(1, concsManuales.size(), 'La línea manual se guarda como conciliación');
        System.assertEquals(null, concsManuales[0].Efectos_clientes__c, 'Sin efecto asociado');
        System.assertEquals(-20, concsManuales[0].Importe__c, 'En un pago la línea va a la columna Debe neteada');
        // El flow crea también el apunte contable de la conciliación sin efecto
        List<Linea_asiento_contable__c> apuntesManuales = [
            SELECT Debe__c, Haber__c, Asientos_contable__c FROM Linea_asiento_contable__c
            WHERE Extracto_bancario__c = :pagoId AND Descripci_n__c = 'Linea manual test'
        ];
        System.assertEquals(1, apuntesManuales.size(), 'La línea manual debe generar su apunte contable vía flow');
        System.assertNotEquals(null, apuntesManuales[0].Asientos_contable__c, 'Colgando del asiento creado por el flow');

        // Movimiento FATIR conciliado contra una remesa: una sola línea con la
        // remesa asignada, la cuenta de remesas y el importe del banco
        insert new Plan_general_contable__c(Name = '4310000001');
        CI_Remesa__c remesa = new CI_Remesa__c(
            CI_EmpresaTitular__c = primerValorPicklist('CI_Remesa__c', 'CI_EmpresaTitular__c'),
            CI_FechaRemesa__c = Date.today().addDays(-5));
        insert remesa;
        Id fatirId = TesoreriaController.crearMovimientoBanco(cta.Id, Date.today(),
            'FATIR123456789', null, 75, 'ingreso', null, null);
        TesoreriaController.conciliarMovimiento(fatirId, null, null, null, remesa.Id);
        List<Conciliacion_bancaria__c> concsRemesa = [
            SELECT Remesa__c, Haber__c, Descripci_n__c, Cuenta_contable__r.Name
            FROM Conciliacion_bancaria__c WHERE Extracto_bancario__c = :fatirId
        ];
        System.assertEquals(1, concsRemesa.size(), 'La remesa genera una única conciliación');
        System.assertEquals(remesa.Id, concsRemesa[0].Remesa__c, 'La remesa queda asignada en la conciliación');
        System.assertEquals(75, concsRemesa[0].Haber__c, 'El importe del banco va al haber');
        System.assertEquals('Ingreso remesa efectos', concsRemesa[0].Descripci_n__c);
        System.assertEquals('4310000001', concsRemesa[0].Cuenta_contable__r.Name, 'Cuenta de remesas de efectos');
        System.assertEquals('Conciliado',
            [SELECT Estado__c FROM Extracto_bancario__c WHERE Id = :fatirId].Estado__c);
        // La vista de la conciliación existente informa la remesa de la línea
        TesoreriaController.ConcExistenteDTO concFatir = TesoreriaController.getConciliacionMovimiento(fatirId);
        System.assertEquals(remesa.Id, concFatir.lineas[0].remesaId, 'La línea trae su remesa');
        System.assert(String.isNotBlank(concFatir.lineas[0].remesaNumero), 'Con el número de la remesa');

        // El listado de remesas pendientes filtra por la empresa titular de la cuenta
        // (la remesa de test no tiene pendiente de ingreso: es un campo de fórmula)
        System.assertNotEquals(null, TesoreriaController.getRemesasPendientes(cta.Id));
        System.assertEquals(0, TesoreriaController.getRemesasPendientes(null).size(), 'Sin cuenta no hay remesas');

        // Enlaces públicos de los PDFs: se crean la primera vez y se reutilizan después
        Map<Id, String> urls1 = TesoreriaController.getPdfPublicUrls(new List<Id>{ docId });
        Map<Id, String> urls2 = TesoreriaController.getPdfPublicUrls(new List<Id>{ docId });
        System.assert(String.isNotBlank(urls1.get(docId)), 'Debe devolver el enlace público del PDF');
        System.assertEquals(urls1.get(docId), urls2.get(docId), 'El segundo acceso reutiliza el enlace existente');
        System.assertEquals(0, TesoreriaController.getPdfPublicUrls(null).size(), 'Sin documentos no hay enlaces');
    }

    @isTest
    static void testCuentasSeguro() {
        insert new List<Plan_general_contable__c>{
            new Plan_general_contable__c(Name = '6250000000'),
            new Plan_general_contable__c(Name = '4802000000')
        };
        Test.startTest();
        TesoreriaController.CuentasSeguroDTO d = TesoreriaController.getCuentasSeguro();
        Test.stopTest();
        System.assertNotEquals(null, d.cuentaSeguroId, 'Debe localizar la cuenta del seguro');
        System.assertNotEquals(null, d.cuentaPeriodificacionId, 'Debe localizar la cuenta de periodificación');
    }

    @isTest
    static void testHojaCajaExtra() {
        Test.startTest();
        Id ingresoId = TesoreriaController.crearMovimientoHojaCaja(Date.today().addDays(-1), 'Ingreso caja test', 100, 'ingreso');
        Id gastoId = TesoreriaController.crearMovimientoHojaCaja(Date.today(), 'Gasto caja test', 40, 'gasto');
        Test.stopTest();

        List<TesoreriaController.HojaCajaDTO> movs = TesoreriaController.getHojaCajaExtra();
        System.assertEquals(2, movs.size(), 'Debe devolver los movimientos de la hoja de caja');
        System.assertEquals(ingresoId, movs[0].id, 'Orden cronológico ascendente');
        System.assertEquals(100, movs[0].haber, 'El ingreso va al haber');
        System.assertEquals(40, movs[1].debe, 'El gasto va al debe');
        try {
            TesoreriaController.crearMovimientoHojaCaja(Date.today(), 'X', -5, 'ingreso');
            System.assert(false, 'El importe negativo debe rechazarse');
        } catch (AuraHandledException ex) { /* esperado */ }
    }

    @isTest
    static void testEfectosClientesResumen() {
        String empresa = primerValorPicklist('Reclamaci_n_de_impagados__c', 'Empresa_titular__c');
        insert new List<Reclamaci_n_de_impagados__c>{
            new Reclamaci_n_de_impagados__c(Empresa_titular__c = empresa, Estado__c = 'Pendiente',
                Importe_factura__c = 100, Fecha_Vencimiento__c = Date.today().addDays(10),
                Forma_de_pago__c = primerValorPicklist('Reclamaci_n_de_impagados__c', 'Forma_de_pago__c')),
            new Reclamaci_n_de_impagados__c(Empresa_titular__c = empresa, Estado__c = 'Devuelto',
                Importe_factura__c = 50, Fecha_Vencimiento__c = Date.today().addDays(-10)),
            // Negativo: va a la columna Abonar
            new Reclamaci_n_de_impagados__c(Empresa_titular__c = empresa, Estado__c = 'Abono',
                Importe_factura__c = -30, Fecha_Vencimiento__c = Date.today().addDays(5)),
            // Monitorio vencido: va a la columna Monitorio, no a Vencido
            new Reclamaci_n_de_impagados__c(Empresa_titular__c = empresa, Estado__c = 'Monitorio',
                Importe_factura__c = 40, Fecha_Vencimiento__c = Date.today().addDays(-40)),
            // Estado fuera del resumen: no debe aparecer
            new Reclamaci_n_de_impagados__c(Empresa_titular__c = empresa, Estado__c = 'Conciliado',
                Importe_factura__c = 999, Fecha_Vencimiento__c = Date.today())
        };

        Test.startTest();
        List<TesoreriaController.EfectoCelDTO> res = TesoreriaController.getEfectosClientesResumen();
        Test.stopTest();

        // Mismo reparto que hace el componente: negativos -> Abonar,
        // Monitorio -> su columna, y el resto según la fecha de vencimiento
        Decimal enPlazo = 0, vencido = 0, abonar = 0, monitorio = 0, total = 0;
        for (TesoreriaController.EfectoCelDTO c : res) {
            total += c.importe;
            if (c.negativo) abonar += c.importe;
            else if (c.estado == 'Monitorio') monitorio += c.importe;
            else if (c.enPlazo) enPlazo += c.importe;
            else vencido += c.importe;
            System.assertNotEquals('Conciliado', c.estado, 'Los estados fuera del resumen no deben aparecer');
        }
        System.assertEquals(160, total, 'Suma de importes de los estados del resumen');
        System.assertEquals(100, enPlazo, 'Vencimiento futuro positivo cuenta como en plazo');
        System.assertEquals(50, vencido, 'Vencimiento pasado positivo (no monitorio) cuenta como vencido');
        System.assertEquals(-30, abonar, 'Los importes negativos van a Abonar');
        System.assertEquals(40, monitorio, 'El estado Monitorio va a su columna');
    }

    @isTest
    static void testEfectosClientesKpis() {
        String empresa = primerValorPicklist('Reclamaci_n_de_impagados__c', 'Empresa_titular__c');
        insert new List<Reclamaci_n_de_impagados__c>{
            // Remesable: pendiente + domiciliación + importe positivo + vencimiento hoy o anterior
            new Reclamaci_n_de_impagados__c(Empresa_titular__c = empresa, Estado__c = 'Pendiente',
                Forma_de_pago__c = 'Domiciliación bancaria', Importe_factura__c = 200,
                Fecha_Vencimiento__c = Date.today()),
            // No remesable: importe negativo
            new Reclamaci_n_de_impagados__c(Empresa_titular__c = empresa, Estado__c = 'Pendiente',
                Forma_de_pago__c = 'Domiciliación bancaria', Importe_factura__c = -30,
                Fecha_Vencimiento__c = Date.today()),
            // No remesable: vencimiento futuro
            new Reclamaci_n_de_impagados__c(Empresa_titular__c = empresa, Estado__c = 'Pendiente',
                Forma_de_pago__c = 'Domiciliación bancaria', Importe_factura__c = 500,
                Fecha_Vencimiento__c = Date.today().addDays(5)),
            // Vencido inicial hace 40 días -> tramo 31-60
            new Reclamaci_n_de_impagados__c(Empresa_titular__c = empresa, Estado__c = 'Devuelto',
                Importe_factura__c = 50, Fecha_Vencimiento__c = Date.today().addDays(-40),
                Fecha_de_vencimiento_inicial__c = Date.today().addDays(-40)),
            // Vencido inicial hace 200 días -> tramo +120
            new Reclamaci_n_de_impagados__c(Empresa_titular__c = empresa, Estado__c = 'Monitorio',
                Importe_factura__c = 75, Fecha_Vencimiento__c = Date.today().addDays(-200),
                Fecha_de_vencimiento_inicial__c = Date.today().addDays(-200))
        };

        Test.startTest();
        TesoreriaController.EfcKpisDTO k = TesoreriaController.getEfectosClientesKpis();
        Test.stopTest();

        TesoreriaController.EfcFiltroOpcionesDTO opts = TesoreriaController.getEfcFiltroOpciones();
        System.assert(opts.estados.size() > 0, 'Debe devolver todos los estados del picklist');
        System.assert(opts.empresas.size() > 0, 'Debe devolver las empresas titulares');

        // Listado con filtros
        List<TesoreriaController.EfectoListaDTO> lista = TesoreriaController.buscarEfectosClientes(
            empresa, 'Pendiente', null, null, 'Domiciliación bancaria', null, Date.today().addDays(30), null, null, null, null, null, null, false);
        System.assert(lista.size() >= 1, 'El listado debe devolver los pendientes domiciliados');
        System.assertEquals('Pendiente', lista[0].estado);
        // Filtro por importe exacto
        List<TesoreriaController.EfectoListaDTO> porImporte = TesoreriaController.buscarEfectosClientes(
            null, null, 200, null, null, null, null, null, null, null, null, null, null, false);
        System.assert(porImporte.size() >= 1, 'Debe filtrar por importe exacto');
        // Filtro por lista de estados (navegación desde la visión general)
        List<TesoreriaController.EfectoListaDTO> porEstados = TesoreriaController.buscarEfectosClientes(
            null, null, null, null, null, null, null, new List<String>{ 'Pendiente', 'Devuelto' }, null, null, null, null, null, false);
        System.assert(porEstados.size() >= 2, 'Debe filtrar por varios estados a la vez');
        // Filtro por rango de vencimiento inicial (tramos de antigüedad)
        List<TesoreriaController.EfectoListaDTO> porVencIni = TesoreriaController.buscarEfectosClientes(
            null, null, null, null, null, null, null, null,
            Date.today().addDays(-60), Date.today().addDays(-31), null, null, null, false);
        System.assert(porVencIni.size() >= 1, 'Debe filtrar por vencimiento inicial');
        // Filtro por agrupación (sin valores en test: no debe romper) y por grupo empresarial
        List<TesoreriaController.EfectoListaDTO> porGrupo = TesoreriaController.buscarEfectosClientes(
            null, null, null, null, null, null, null, null, null, null, null, 'GrupoInexistenteTest', null, false);
        System.assertEquals(0, porGrupo.size(), 'Sin clientes de ese grupo empresarial no hay resultados');

        System.assertEquals(200, k.totalRemesable, 'Solo los pendientes domiciliados con importe positivo');
        System.assertEquals(1, k.numRemesables);
        System.assertEquals(6, k.tramos.size(), 'En plazo mas cinco tramos de antiguedad');
        System.assertEquals('EN_PLAZO', k.tramos[0].clave, 'El primer tramo es En plazo');

        // Desglose por antigüedad y estado
        List<TesoreriaController.AntCelDTO> ant = TesoreriaController.getEfectosAntiguedadResumen();
        Boolean hayDevuelto3160 = false;
        for (TesoreriaController.AntCelDTO c : ant) {
            if (c.clave == '31-60' && c.estado == 'Devuelto') {
                hayDevuelto3160 = true;
                System.assertEquals(50, c.importe);
                System.assertEquals(1, c.numero);
            }
        }
        System.assert(hayDevuelto3160, 'El desglose debe incluir el Devuelto del tramo 31-60');
        for (TesoreriaController.TramoDTO t : k.tramos) {
            if (t.clave == '31-60') { System.assertEquals(50, t.importe); System.assertEquals(1, t.numero); }
            if (t.clave == '+120')  { System.assertEquals(75, t.importe); System.assertEquals(1, t.numero); }
            if (t.clave == '0-30')  { System.assertEquals(0, t.importe); }
        }
    }
}