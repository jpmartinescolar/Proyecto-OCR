/**
 * Tests de PlanGeneralSqlController (endpoint SQL externo simulado con HttpCalloutMock).
 */
@isTest
private class PlanGeneralSqlControllerTest {

    private static String ultimoCuerpo;

    private class SkyviaMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            ultimoCuerpo = req.getBody();
            HttpResponse r = new HttpResponse();
            r.setHeader('Content-Type', 'application/json');
            r.setStatusCode(200);
            r.setBody('{"data":['
                + '{"cuenta":"4000000001","titulo":"MAKRO SA","cif":"A28647451","cp":"28005"},'
                + '{"cuenta":"5700000000","titulo":"Caja","cif":null,"cp":null}]}');
            return r;
        }
    }

    @isTest
    static void testGetCuentas() {
        Test.setMock(HttpCalloutMock.class, new SkyviaMock());

        Test.startTest();
        List<PlanGeneralSqlController.CuentaPlanDTO> cuentas = PlanGeneralSqlController.getCuentas(1, 'mak', null);
        List<PlanGeneralSqlController.CuentaPlanDTO> pagina2 = PlanGeneralSqlController.getCuentas(1, 'mak', '4000000001');
        Test.stopTest();

        System.assertEquals(2, cuentas.size());
        System.assertEquals('4000000001', cuentas[0].codigo);
        System.assertEquals('MAKRO SA', cuentas[0].titulo);
        System.assertEquals('A28647451', cuentas[0].cif);
        System.assertEquals('28005', cuentas[0].codigoPostal);
        System.assertEquals('', cuentas[1].cif, 'Sin cliente asociado el CIF viaja vacio');
        System.assertEquals(2, pagina2.size(), 'La paginacion por cursor debe funcionar');
        System.assert(ultimoCuerpo.contains('> \'4000000001\''),
            'El cursor debe viajar al SQL sobre el codigo normalizado');
        System.assert(ultimoCuerpo.contains('ClientesConta'), 'El CIF sale del maestro de clientes/proveedores');
    }

    @isTest
    static void testValidaciones() {
        System.assertEquals('570 DROP', PlanGeneralSqlController.sane('570\'; DROP--'),
            'Las comillas y símbolos no viajan al SQL');
        try {
            PlanGeneralSqlController.getCuentas(null, 'x', null);
            System.assert(false, 'Sin empresa debe fallar');
        } catch (AuraHandledException ex) { /* esperado */ }
    }
}