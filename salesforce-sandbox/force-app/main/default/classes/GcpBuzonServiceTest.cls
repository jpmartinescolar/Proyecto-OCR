@isTest
private class GcpBuzonServiceTest {

    @isTest
    static void rutaGcsSaneaCifYNombre() {
        Id fakeId = Buzon_test__c.SObjectType.getDescribe().getKeyPrefix() + '000000000001';
        String ruta = GcpBuzonService.rutaGcs('00DORG', 'b-0000 0001', fakeId, 'Factura enero ñ (1).pdf');
        System.assertEquals('00DORG/B00000001/' + fakeId + '/Factura_enero____1_.pdf', ruta);
    }

    @isTest
    static void rutaGcsSinCifNiNombre() {
        Id fakeId = Buzon_test__c.SObjectType.getDescribe().getKeyPrefix() + '000000000001';
        System.assertEquals('ORG/SIN-CIF/' + fakeId + '/archivo', GcpBuzonService.rutaGcs('ORG', null, fakeId, ''));
    }

    @isTest
    static void rutaGcsRecortaNombresLargos() {
        Id fakeId = Buzon_test__c.SObjectType.getDescribe().getKeyPrefix() + '000000000001';
        String ruta = GcpBuzonService.rutaGcs('ORG', 'B1', fakeId, 'a'.repeat(300) + '.pdf');
        System.assert(ruta.endsWith('.pdf'), 'Se conserva la extensión');
        System.assertEquals(120, ruta.substringAfterLast('/').length());
    }

    @isTest
    static void maxBytesSegunConfiguracion() {
        GcpBuzonService.configOverride = new Buzon_Test_Config__mdt(Modo_simulado__c = true, Tamano_maximo_MB__c = 5);
        System.assertEquals(5L * 1024 * 1024, GcpBuzonService.maxBytes());
        System.assert(GcpBuzonService.esSimulado());
        GcpBuzonService.configOverride = new Buzon_Test_Config__mdt(Modo_simulado__c = false);
        System.assertEquals(2048L * 1024 * 1024, GcpBuzonService.maxBytes(), 'Sin valor se usan 2 GB');
        System.assert(!GcpBuzonService.esSimulado());
    }

    @isTest
    static void configSinOverrideNuncaLlamaAGooglePorError() {
        System.assertNotEquals(null, GcpBuzonService.config());
    }
}
