/**
 * Tests de LibroMayorSqlController (endpoint SQL externo simulado con HttpCalloutMock).
 */
@isTest
private class LibroMayorSqlControllerTest {
    private static String ultimoCuerpo;

    private class SkyviaMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            String cuerpo = req.getBody();
            ultimoCuerpo = cuerpo;
            HttpResponse r = new HttpResponse();
            r.setHeader('Content-Type', 'application/json');
            r.setStatusCode(200);
            if (!cuerpo.contains('UNION ALL')) {
                r.setBody('{"data":[{"codigo":"57200001","titulo":"Banco Caixabank"}]}');
            } else {
                // Consulta única: fila META + filas MOV
                String posicion = cuerpo.contains('4 AS pos') ? '4' : '3';
                r.setBody('{"data":['
                    + '{"tipo":"META","fecha":null,"texto":"Banco Caixabank","ca":null,"imp":null,"ant":"57000000","sig":"57200002","pos":' + posicion + ',"total":34},'
                    + '{"tipo":"MOV","fecha":"2026-01-10T00:00:00","texto":"Cobro factura","ca":"D","imp":"100.00","ant":null,"sig":null,"pos":null,"total":null},'
                    + '{"tipo":"MOV","fecha":"2026-01-15T00:00:00","texto":"Pago recibo","ca":"H","imp":"40.50","ant":null,"sig":null,"pos":null,"total":null}]}');
            }
            return r;
        }
    }

    @isTest
    static void testNavegacionNoRecalculaConteos() {
        Test.setMock(HttpCalloutMock.class, new SkyviaMock());

        Test.startTest();
        LibroMayorSqlController.MayorDTO mayor = LibroMayorSqlController.getMayorNavegacion(
            1, '57200002', Date.newInstance(2026, 1, 1), Date.newInstance(2026, 12, 31), 4, 34, false);
        Test.stopTest();

        System.assertEquals(4, mayor.posicion);
        System.assertEquals(34, mayor.totalCuentas);
        System.assert(!ultimoCuerpo.contains('COUNT(DISTINCT'),
            'Al navegar no se deben recorrer todas las cuentas para recalcular posición y total');
        System.assert(ultimoCuerpo.contains('4 AS pos'));
        System.assert(ultimoCuerpo.contains('34 AS total'));
    }

    @isTest
    static void testMayor() {
        Test.setMock(HttpCalloutMock.class, new SkyviaMock());

        Test.startTest();
        List<LibroMayorSqlController.CuentaDTO> cuentas = LibroMayorSqlController.buscarCuentas(1, 'caixa', null);
        List<LibroMayorSqlController.CuentaDTO> pagina2 = LibroMayorSqlController.buscarCuentas(1, 'caixa', '57200000');
        LibroMayorSqlController.MayorDTO mayor = LibroMayorSqlController.getMayor(
            1, '57200001', Date.newInstance(2026, 1, 1), Date.newInstance(2026, 12, 31), false);
        Test.stopTest();

        // Sin el check, solo el listado de movimientos filtra por los asientos de cierre
        System.assertEquals(1, ultimoCuerpo.countMatches('NOT IN (\'Cierre ejercicio\', \'Cierre contabilidad\')'),
            'Sin el check, las cuentas vecinas no filtran por periodo');

        System.assertEquals(1, cuentas.size());
        System.assertEquals('57200001', cuentas[0].codigo);
        System.assertEquals(1, pagina2.size(), 'La paginacion por cursor debe funcionar');
        System.assert(ultimoCuerpo != null, 'El mock debe registrar las consultas');

        System.assertEquals('Banco Caixabank', mayor.titulo);
        System.assertEquals('57000000', mayor.cuentaAnterior);
        System.assertEquals('57200002', mayor.cuentaSiguiente);
        System.assertEquals(3, mayor.posicion);
        System.assertEquals(34, mayor.totalCuentas);
        System.assertEquals(2, mayor.movimientos.size());
        System.assertEquals(100.00, mayor.movimientos[0].debe);
        System.assertEquals(40.50, mayor.movimientos[1].haber);
        System.assertEquals(Date.newInstance(2026, 1, 10), mayor.movimientos[0].fecha);
    }

    @isTest
    static void testSoloConMovimientos() {
        Test.setMock(HttpCalloutMock.class, new SkyviaMock());

        Test.startTest();
        LibroMayorSqlController.getMayor(
            1, '57200001', Date.newInstance(2026, 1, 1), Date.newInstance(2026, 12, 31), true);
        Test.stopTest();

        // Con el check, vecinas (ant y sig), posición y total también filtran
        // por periodo: movimientos + 4 subconsultas
        System.assertEquals(5, ultimoCuerpo.countMatches('NOT IN (\'Cierre ejercicio\', \'Cierre contabilidad\')'),
            'Con el check, vecinas y recuentos deben filtrar por movimientos del periodo');
        System.assertEquals(5, ultimoCuerpo.countMatches('FechaAsiento >= \'20260101\''),
            'El filtro de fechas debe aplicarse en vecinas y recuentos');
    }

    @isTest
    static void testValidacionesYSane() {
        System.assertEquals('572 DROP00001', LibroMayorSqlController.sane('572\'; DROP--00001'),
            'Las comillas y símbolos no viajan al SQL');
        try {
            LibroMayorSqlController.getMayor(null, null, null, null, false);
            System.assert(false, 'Sin empresa y cuenta debe fallar');
        } catch (AuraHandledException ex) { /* esperado */ }
        try {
            LibroMayorSqlController.getMayor(1, '572', null, null, false);
            System.assert(false, 'Sin fechas debe fallar');
        } catch (AuraHandledException ex) { /* esperado */ }
        try {
            LibroMayorSqlController.buscarCuentas(null, 'x', null);
            System.assert(false, 'Sin empresa debe fallar');
        } catch (AuraHandledException ex) { /* esperado */ }
    }
}