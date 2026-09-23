@isTest
private class BuzonEmpresasServiceTest {

    @TestSetup
    static void setup() {
        insert new List<Account>{
            new Account(Name = 'Asignada', Procedencia_del_cliente__c = 'Test', CIF__c = 'B00000001',
                        Asesor_responsable_fiscal_actual__c = UserInfo.getUserId()),
            new Account(Name = 'Ajena', Procedencia_del_cliente__c = 'Test', CIF__c = 'B00000002')
        };
    }

    static Account cuenta(String nombre) {
        return [SELECT Id FROM Account WHERE Name = :nombre LIMIT 1];
    }

    @isTest
    static void listaSoloLasEmpresasAsignadas() {
        List<BuzonEmpresasService.EmpresaDTO> empresas = BuzonEmpresasService.getEmpresasPermitidas();
        System.assertEquals(1, empresas.size(), 'Solo la cuenta de la que es asesor');
        System.assertEquals('Asignada', empresas[0].nombre);
        System.assertEquals('B00000001', empresas[0].cif);
    }

    @isTest
    static void validaEmpresaAsignada() {
        Account a = BuzonEmpresasService.validarEmpresa(cuenta('Asignada').Id);
        System.assertEquals('B00000001', a.CIF__c);
    }

    @isTest
    static void rechazaEmpresaNoAsignada() {
        try {
            BuzonEmpresasService.validarEmpresa(cuenta('Ajena').Id);
            System.assert(false, 'Debe rechazar una empresa no asignada');
        } catch (BuzonEmpresasService.BuzonException e) {
            System.assert(e.getMessage().contains('No tienes permiso'), e.getMessage());
        }
    }

    @isTest
    static void rechazaIdQueNoEsDeCuenta() {
        try {
            BuzonEmpresasService.validarEmpresa(UserInfo.getUserId());
            System.assert(false, 'Un Id de usuario no es una empresa');
        } catch (BuzonEmpresasService.BuzonException e) {
            System.assertEquals('La empresa no es válida.', e.getMessage());
        }
    }

    @isTest
    static void modoLibrePermiteCualquierEmpresaVisible() {
        User yo = new User(Id = UserInfo.getUserId());
        PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name = 'Buzon_Test_Todas_Empresas'];
        System.runAs(yo) {
            insert new PermissionSetAssignment(AssigneeId = yo.Id, PermissionSetId = ps.Id);
        }
        System.runAs(yo) {
            System.assert(BuzonEmpresasService.esModoLibre(), 'El permiso activa el modo libre');
            System.assertEquals(0, BuzonEmpresasService.getEmpresasPermitidas().size(),
                'En modo libre se usa el buscador, no la lista');
            System.assertEquals('B00000002', BuzonEmpresasService.validarEmpresa(cuenta('Ajena').Id).CIF__c);
        }
    }
}
