/**
 * Tests de BalanceSqlController (endpoint SQL externo simulado con HttpCalloutMock).
 */
@isTest
private class BalanceSqlControllerTest {

    private static Integer llamadas = 0;
    private static Integer llamadasCuentas = 0;

    private class SkyviaMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            String cuerpo = req.getBody();
            llamadas++;
            if (cuerpo.contains('NOT LIKE')) llamadasCuentas++;
            HttpResponse r = new HttpResponse();
            r.setHeader('Content-Type', 'application/json');
            r.setStatusCode(200);
            if (cuerpo.contains('NOT LIKE')) {
                // Saldos por cuenta de los grupos de balance (net = Haber - Debe):
                // Caja 5000 D, Cliente 2000 D, Capital 3000 H, Proveedor 4000 H
                r.setBody('{"data":['
                    + '{"cuenta":"1000000000","titulo":"Capital","debeA":"0","haberA":"3000","debeC":"0","haberC":"1000"},'
                    + '{"cuenta":"4000000001","titulo":"Proveedor","debeA":"0","haberA":"4000","debeC":"0","haberC":"0"},'
                    + '{"cuenta":"4300000001","titulo":"Cliente","debeA":"2000","haberA":"0","debeC":"0","haberC":"0"},'
                    + '{"cuenta":"5700000000","titulo":"Caja","debeA":"5000","haberA":"0","debeC":"1000","haberC":"0"}]}');
            } else {
                // Neto 6/7 del periodo (resultado pendiente de cierre) = 0
                r.setBody('{"data":[{"debeA":"0","haberA":"0","debeC":"0","haberC":"0"}]}');
            }
            return r;
        }
    }

    private static Map<String, BalanceSqlController.BalRow> porKey(List<BalanceSqlController.BalRow> rows) {
        Map<String, BalanceSqlController.BalRow> m = new Map<String, BalanceSqlController.BalRow>();
        for (BalanceSqlController.BalRow r : rows) m.put(r.key, r);
        return m;
    }

    @isTest
    static void testGenerarPymes() {
        Test.setMock(HttpCalloutMock.class, new SkyviaMock());

        Test.startTest();
        List<BalanceSqlController.BalRow> rows = BalanceSqlController.generar(
            new List<Integer>{ 1 },
            Date.newInstance(2026, 1, 1), Date.newInstance(2026, 12, 31),
            Date.newInstance(2025, 1, 1), Date.newInstance(2025, 12, 31),
            'PGC PYMES');
        Test.stopTest();

        System.assert(rows.size() > 0, 'Debe devolver la estructura del balance');
        Map<String, BalanceSqlController.BalRow> m = porKey(rows);

        System.assertEquals(2, llamadas, 'Una llamada para el neto 6/7 y una sola pagina de cuentas');
        System.assertEquals(1, llamadasCuentas, 'Con menos de 500 cuentas no debe paginar');
        System.assertEquals(5000, m.get('AC60').valorActual, 'Caja (57x) deudor = 5000');
        System.assertEquals(2000, m.get('AC21').valorActual, 'Clientes (430) deudor = 2000');
        System.assertEquals(3000, m.get('PNA111').valorActual, 'Capital (100) acreedor = 3000');
        System.assertEquals(4000, m.get('PC41').valorActual, 'Proveedores (400) acreedor = 4000');
        System.assertEquals(7000, m.get('ACTIVO').valorActual, 'TOTAL ACTIVO = Caja + Clientes = 7000');
        System.assertEquals(1000, m.get('AC60').valorComparado, 'El comparativo viaja en la misma consulta');
        System.assertEquals('BANDA', m.get('SALTO1').tipo);
        System.assertEquals('TOTAL', m.get('ACTIVO').tipo);

        // Las cuentas cuelgan de su hoja como filas CUENTA
        BalanceSqlController.BalRow caja = m.get('AC60__5700000000');
        System.assertNotEquals(null, caja, 'La cuenta de caja debe colgar de su hoja');
        System.assertEquals('CUENTA', caja.tipo);
        System.assertEquals('Caja', caja.concepto);
    }

    @isTest
    static void testPlanesNormalAbreviado() {
        Test.setMock(HttpCalloutMock.class, new SkyviaMock());

        Test.startTest();
        List<BalanceSqlController.BalRow> n = BalanceSqlController.generar(
            new List<Integer>{ 1 },
            Date.newInstance(2026, 1, 1), Date.newInstance(2026, 12, 31),
            Date.newInstance(2025, 1, 1), Date.newInstance(2025, 12, 31),
            'PGC Normal');
        List<BalanceSqlController.BalRow> a = BalanceSqlController.generar(
            new List<Integer>{ 1 },
            Date.newInstance(2026, 1, 1), Date.newInstance(2026, 12, 31),
            Date.newInstance(2025, 1, 1), Date.newInstance(2025, 12, 31),
            'PGC Abreviado');
        Test.stopTest();
        System.assert(n.size() > 0, 'Normal devuelve estructura');
        System.assert(a.size() > 0, 'Abreviado devuelve estructura');
    }

    @isTest
    static void testValidaciones() {
        try {
            BalanceSqlController.generar(new List<Integer>(), Date.today(), Date.today(), Date.today(), Date.today(), 'PGC PYMES');
            System.assert(false, 'Sin empresa debe fallar');
        } catch (AuraHandledException ex) { /* esperado */ }
        try {
            BalanceSqlController.generar(new List<Integer>{ 1 }, null, null, null, null, 'PGC PYMES');
            System.assert(false, 'Sin fechas debe fallar');
        } catch (AuraHandledException ex) { /* esperado */ }
    }
}