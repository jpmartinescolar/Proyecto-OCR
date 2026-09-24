@isTest
private class GcpBandejaServiceTest {

    @isTest
    static void rutaGcsSaneaCifYNombre() {
        Id fakeId = Bandeja_Contable__c.SObjectType.getDescribe().getKeyPrefix() + '000000000001';
        String ruta = GcpBandejaService.rutaGcs('00DORG', 'b-0000 0001', fakeId, 'Factura enero ñ (1).pdf');
        System.assertEquals('00DORG/B00000001/' + fakeId + '/Factura_enero____1_.pdf', ruta);
    }

    @isTest
    static void rutaGcsSinCifNiNombre() {
        Id fakeId = Bandeja_Contable__c.SObjectType.getDescribe().getKeyPrefix() + '000000000001';
        System.assertEquals('ORG/SIN-CIF/' + fakeId + '/archivo', GcpBandejaService.rutaGcs('ORG', null, fakeId, ''));
    }

    @isTest
    static void rutaGcsRecortaNombresLargos() {
        Id fakeId = Bandeja_Contable__c.SObjectType.getDescribe().getKeyPrefix() + '000000000001';
        String ruta = GcpBandejaService.rutaGcs('ORG', 'B1', fakeId, 'a'.repeat(300) + '.pdf');
        System.assert(ruta.endsWith('.pdf'), 'Se conserva la extensión');
        System.assertEquals(120, ruta.substringAfterLast('/').length());
    }

    @isTest
    static void maxBytesSegunConfiguracion() {
        GcpBandejaService.configOverride = new Bandeja_Contable_Config__mdt(Modo_simulado__c = true, Tamano_maximo_MB__c = 5);
        System.assertEquals(5L * 1024 * 1024, GcpBandejaService.maxBytes());
        System.assert(GcpBandejaService.esSimulado());
        GcpBandejaService.configOverride = new Bandeja_Contable_Config__mdt(Modo_simulado__c = false);
        System.assertEquals(2048L * 1024 * 1024, GcpBandejaService.maxBytes(), 'Sin valor se usan 2 GB');
        System.assert(!GcpBandejaService.esSimulado());
    }

    @isTest
    static void configSinOverrideNuncaLlamaAGooglePorError() {
        System.assertNotEquals(null, GcpBandejaService.config());
    }
}
