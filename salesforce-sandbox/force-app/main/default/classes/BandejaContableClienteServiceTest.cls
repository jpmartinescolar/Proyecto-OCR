/**
 * Los objetos fiscales de la org (contrato, obligaciones, actividades, locales, socios) tienen campos
 * obligatorios y reglas propias: el test comprueba la lectura sobre una cuenta sin esos hijos, que es
 * el caso que debe funcionar siempre (secciones vacías o marcadas como no disponibles, sin errores).
 */
@IsTest
private class BandejaContableClienteServiceTest {

    @TestSetup
    static void setup() {
        User asesor = BandejaContableTestData.crearAsesor();
        System.runAs(asesor) {
            Account a = BandejaContableTestData.crearEmpresa('Cliente fiscal', 'B11111111', asesor.Id);
            a.BillingStreet = 'Calle Mayor 1';
            a.BillingPostalCode = '28001';
            a.BillingCity = 'Madrid';
            update a;
        }
    }

    @IsTest
    static void leeLaCuentaAunqueNoTengaDatosFiscales() {
        System.runAs(BandejaContableTestData.asesor()) {
            Id empresaId = [SELECT Id FROM Account WHERE Name = 'Cliente fiscal' LIMIT 1].Id;
            BandejaContableClienteService.DatosClienteDTO d = BandejaContableController.getDatosCliente(empresaId);
            Assert.areEqual('B11111111', d.cif);
            Assert.areEqual('Calle Mayor 1', d.domicilio);
            Assert.areEqual('28001 Madrid', d.localidad);
            Assert.isTrue(d.modelos.isEmpty());
            Assert.isTrue(d.actividades.isEmpty());
            Assert.isTrue(d.locales.isEmpty());
            Assert.isTrue(d.vinculados.isEmpty());
            Assert.isFalse(d.perfil.isEmpty(), 'Siempre hay datos de la cuenta (censo VIES, grupo)');
            Assert.isFalse(d.pendientes.isEmpty(), 'Lo que no existe en Salesforce se lista para la pantalla');
            Assert.isTrue(String.join(d.noDisponibles, ' ').contains('Contrato'), 'Sin contrato abierto se indica');
        }
    }

    /** Registro en memoria con campos fórmula o de relación, que no se pueden asignar directamente */
    static SObject enMemoria(String json, System.Type tipo) {
        return (SObject) System.JSON.deserialize(json, tipo);
    }

    @IsTest
    static void convierteCadaRegistroFiscal() {
        BandejaContableClienteService.DatosClienteDTO d = new BandejaContableClienteService.DatosClienteDTO();
        BandejaContableClienteService.aplicarContrato(d, (Contrato_Contabilidad_y_Fiscal__c) enMemoria(
            '{"attributes":{"type":"Contrato_Contabilidad_y_Fiscal__c"},"Tipo_de_regimen__c":"Estimación Directa Normal",'
            + '"Operador_intracomunitario__c":"Sí","Territorio_fiscal__c":"Común","C_digo_ERP__c":"123"}',
            Contrato_Contabilidad_y_Fiscal__c.class));
        Assert.areEqual('Estimación Directa Normal', d.perfil[0].valor);
        Assert.areEqual('Contrato contable y fiscal', d.perfil[0].fuente);

        BandejaContableClienteService.ModeloDTO m = BandejaContableClienteService.toModelo((Impuestos__c) enMemoria(
            '{"attributes":{"type":"Impuestos__c"},"Modelos__c":"303","Periodicidad__c":"Trimestral"}', Impuestos__c.class));
        Assert.areEqual('303', m.modelo);
        Assert.areEqual('Trimestral', m.periodicidad);

        BandejaContableClienteService.ActividadDTO act = BandejaContableClienteService.toActividad((actividad_economica__c) enMemoria(
            '{"attributes":{"type":"actividad_economica__c"},"N_Ep_grafe__c":"691.2","Descripci_n_ep_grafe__c":"Reparación de vehículos",'
            + '"Ep_grafes_IAE__r":{"attributes":{"type":"Epigrafes__c"},"Seccion__c":"E"}}', actividad_economica__c.class));
        Assert.areEqual('691.2', act.epigrafe);
        Assert.areEqual('E', act.seccion);

        BandejaContableClienteService.LocalDTO l = BandejaContableClienteService.toLocal((Actividad_Economica_Local_afecto__c) enMemoria(
            '{"attributes":{"type":"Actividad_Economica_Local_afecto__c"},"afectaci_n__c":100,"C_digo_ep_grafe__c":"691.2",'
            + '"Local_afecto__r":{"attributes":{"type":"Local_afecto__c"},"Referencia_catastral__c":"2245103VK6724N0001XT",'
            + '"Localizaci_n__Street__s":"Calle de la Industria 14","Localizaci_n__PostalCode__s":"28850","Localizaci_n__City__s":"Torrejón"}}',
            Actividad_Economica_Local_afecto__c.class));
        Assert.areEqual('Calle de la Industria 14, 28850 Torrejón', l.direccion);
        Assert.areEqual(100, l.afectacion);

        BandejaContableClienteService.VinculadoDTO socio = BandejaContableClienteService.toVinculado((Socios__c) enMemoria(
            '{"attributes":{"type":"Socios__c"},"DNI__c":"B22222222","Empresa_Socio__r":{"attributes":{"type":"Account"},"Name":"Socio S.L."}}',
            Socios__c.class));
        Assert.areEqual('Socio S.L.', socio.nombre);
        Assert.areEqual('B22222222', socio.nif);

        BandejaContableClienteService.VinculadoDTO adm = BandejaContableClienteService.toVinculado((Administrador__c) enMemoria(
            '{"attributes":{"type":"Administrador__c"},"Tipo_de_cargo__c":"Administrador Único",'
            + '"Empresacargo__r":{"attributes":{"type":"Account"},"Name":"Holding S.L.","CIF__c":"B33333333"}}', Administrador__c.class));
        Assert.areEqual('Holding S.L.', adm.nombre);
        Assert.areEqual('Administrador Único', adm.relacion);
    }

    @IsTest
    static void empresaInaccesible() {
        System.runAs(BandejaContableTestData.asesor()) {
            try {
                BandejaContableController.getDatosCliente(Account.SObjectType.getDescribe().getKeyPrefix() + '000000000000');
                Assert.fail('No existe');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('No se encuentra la empresa'), e.getMessage());
            }
        }
    }
}
