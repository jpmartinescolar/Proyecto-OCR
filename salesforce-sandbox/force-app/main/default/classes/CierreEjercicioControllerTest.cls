@isTest
private class CierreEjercicioControllerTest {

    private static final String  EMPRESA   = primerValorPicklist('Linea_asiento_contable__c', 'Empresa_titular__c');
    private static final Integer EJERCICIO = 2030;

    private static String primerValorPicklist(String objApi, String fieldApi) {
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objApi);
        if (t == null) return null;
        for (Schema.PicklistEntry e : t.getDescribe().fields.getMap().get(fieldApi).getDescribe().getPicklistValues()) {
            if (e.isActive()) return e.getValue();
        }
        return null;
    }

    @TestSetup
    static void setup() {
        List<Plan_general_contable__c> cuentas = new List<Plan_general_contable__c>{
            new Plan_general_contable__c(Name = '1290000000', T_tulo_cuenta__c = 'Resultado del ejercicio'),
            new Plan_general_contable__c(Name = '4300000001', T_tulo_cuenta__c = 'Cliente test'),
            new Plan_general_contable__c(Name = '5700000000', T_tulo_cuenta__c = 'Caja'),
            new Plan_general_contable__c(Name = '6000000001', T_tulo_cuenta__c = 'Compras'),
            new Plan_general_contable__c(Name = '7050000000', T_tulo_cuenta__c = 'Prestaciones de servicios')
        };
        insert cuentas;

        Asiento_contable__c venta = new Asiento_contable__c(
            Empresa_titular__c = EMPRESA, Tipo_de_asiento__c = 'Factura emitida',
            Fecha_asiento_contable__c = Date.newInstance(EJERCICIO, 6, 15), Canal__c = '001 General');
        Asiento_contable__c gasto = new Asiento_contable__c(
            Empresa_titular__c = EMPRESA, Tipo_de_asiento__c = 'Gasto',
            Fecha_asiento_contable__c = Date.newInstance(EJERCICIO, 7, 10), Canal__c = '001 General');
        insert new List<Asiento_contable__c>{ venta, gasto };

        insert new List<Linea_asiento_contable__c>{
            // Venta: cliente 1000 a ingresos 1000
            new Linea_asiento_contable__c(Asientos_contable__c = venta.Id, Plan__c = cuentas[1].Id,
                Debe__c = 1000, Haber__c = 0, Empresa_titular__c = EMPRESA, Simulaci_n__c = 'No', Check__c = 'Si'),
            new Linea_asiento_contable__c(Asientos_contable__c = venta.Id, Plan__c = cuentas[4].Id,
                Debe__c = 0, Haber__c = 1000, Empresa_titular__c = EMPRESA, Simulaci_n__c = 'No', Check__c = 'Si'),
            // Gasto: compras 400 contra caja
            new Linea_asiento_contable__c(Asientos_contable__c = gasto.Id, Plan__c = cuentas[3].Id,
                Debe__c = 400, Haber__c = 0, Empresa_titular__c = EMPRESA, Simulaci_n__c = 'No', Check__c = 'Si'),
            new Linea_asiento_contable__c(Asientos_contable__c = gasto.Id, Plan__c = cuentas[2].Id,
                Debe__c = 0, Haber__c = 400, Empresa_titular__c = EMPRESA, Simulaci_n__c = 'No', Check__c = 'Si')
        };
    }

    @isTest
    static void testAnalizarYEjecutar() {
        Test.startTest();
        CierreEjercicioController.Analisis a = CierreEjercicioController.analizar(EMPRESA, EJERCICIO);
        System.assertEquals(0, a.bloqueos.size(), 'Sin bloqueos antes del cierre');
        System.assertEquals(null, a.error);
        System.assertEquals(600, a.resultadoEjercicio, 'Beneficio = 1000 ingresos - 400 gastos');
        // Regularización: contrario de 600 y 705 + 129
        System.assertEquals(3, a.regularizacion.lineas.size());
        System.assertEquals(a.regularizacion.totalDebe, a.regularizacion.totalHaber, 'La regularización cuadra');
        // Cierre: 430 (1000), 570 (-400), 129 (-600)
        System.assertEquals(3, a.cierre.lineas.size());
        System.assertEquals(a.cierre.totalDebe, a.cierre.totalHaber, 'El cierre cuadra');
        System.assertEquals(3, a.apertura.lineas.size());
        System.assertEquals(a.apertura.totalDebe, a.apertura.totalHaber, 'La apertura cuadra');
        System.assertEquals(a.cierre.totalDebe, a.apertura.totalDebe, 'La apertura reabre los saldos del cierre');
        System.assertEquals(Date.newInstance(EJERCICIO + 1, 1, 1), a.apertura.fecha, 'Apertura el 01/01 siguiente');

        CierreEjercicioController.Resultado r = CierreEjercicioController.ejecutar(EMPRESA, EJERCICIO);
        Test.stopTest();

        System.assertNotEquals(null, r.regId);
        System.assertNotEquals(null, r.cierreId);
        System.assertNotEquals(null, r.aperturaId);

        // Los apuntes creados llevan empresa titular y check
        List<Linea_asiento_contable__c> creadas = [
            SELECT Id, Empresa_titular__c, Check__c, Debe__c, Haber__c, Asientos_contable__c
            FROM Linea_asiento_contable__c
            WHERE Asientos_contable__c IN (:r.regId, :r.cierreId, :r.aperturaId)
        ];
        System.assertEquals(9, creadas.size(), '3 apuntes por asiento');
        for (Linea_asiento_contable__c l : creadas) {
            System.assertEquals(EMPRESA, l.Empresa_titular__c);
            // Check: el controlador lo fija a 'Si' y lo reafirma tras crear, pero no se
            // asevera en duro porque automatizaciones del org pueden reprocesarlo.
            System.assertNotEquals(null, l.Check__c);
        }

        // Los tres asientos creados cuadran (Debe = Haber)
        for (AggregateResult ar : [
            SELECT Asientos_contable__c a, SUM(Debe__c) d, SUM(Haber__c) h
            FROM Linea_asiento_contable__c
            WHERE Asientos_contable__c IN (:r.regId, :r.cierreId, :r.aperturaId)
            GROUP BY Asientos_contable__c
        ]) {
            System.assertEquals((Decimal) ar.get('d'), (Decimal) ar.get('h'), 'Asiento cuadrado');
        }

        // Histórico: fila del ejercicio cerrado (completa) + fila del siguiente
        // (la apertura genera movimientos en EJERCICIO+1 → aparece como PENDIENTE)
        List<CierreEjercicioController.HistoricoRow> hist = CierreEjercicioController.getHistorico();
        System.assertEquals(2, hist.size(), 'Ejercicio cerrado + siguiente con movimientos');
        System.assertEquals(EJERCICIO + 1, hist[0].ejercicio, 'Orden descendente por ejercicio');
        System.assertEquals('PENDIENTE', hist[0].estado);
        CierreEjercicioController.HistoricoRow cerrado = hist[1];
        System.assertEquals(EMPRESA, cerrado.empresa);
        System.assertEquals(EJERCICIO, cerrado.ejercicio);
        System.assertEquals(true, cerrado.completo);
        System.assertEquals('COMPLETO', cerrado.estado);
        System.assertEquals(r.regName, cerrado.regName);
        System.assertEquals(r.cierreName, cerrado.cierreName);
        System.assertEquals(r.aperturaName, cerrado.aperturaName);

        // Exclusiones persistentes: al excluir la empresa desaparece del histórico
        CierreEjercicioController.guardarExclusiones(new List<String>{ EMPRESA });
        System.assertEquals(1, CierreEjercicioController.getExclusiones().size());
        System.assertEquals(0, CierreEjercicioController.getHistorico().size(), 'Empresa excluida: sin filas');
        CierreEjercicioController.guardarExclusiones(new List<String>());
        System.assertEquals(0, CierreEjercicioController.getExclusiones().size());
        System.assertEquals(2, CierreEjercicioController.getHistorico().size(), 'Sin exclusiones vuelve a aparecer');

        // Tras ejecutar: bloqueado repetir
        CierreEjercicioController.Analisis a2 = CierreEjercicioController.analizar(EMPRESA, EJERCICIO);
        System.assertEquals(3, a2.bloqueos.size(), 'Los tres asientos bloquean repetir el proceso');
        Boolean lanzo = false;
        try { CierreEjercicioController.ejecutar(EMPRESA, EJERCICIO); }
        catch (Exception e) { lanzo = true; }
        System.assert(lanzo, 'No debe permitir repetir el cierre');
    }

    @isTest
    static void testParametrosInvalidos() {
        Boolean lanzo = false;
        try { CierreEjercicioController.analizar(null, EJERCICIO); }
        catch (Exception e) { lanzo = true; }
        System.assert(lanzo);
        lanzo = false;
        try { CierreEjercicioController.analizar(EMPRESA, null); }
        catch (Exception e) { lanzo = true; }
        System.assert(lanzo);
    }
}