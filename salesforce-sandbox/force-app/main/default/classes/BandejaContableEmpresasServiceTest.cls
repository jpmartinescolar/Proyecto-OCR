@IsTest
private class BandejaContableEmpresasServiceTest {

    @TestSetup
    static void setup() {
        User asesor = BandejaContableTestData.crearAsesor();
        System.runAs(asesor) {
            BandejaContableTestData.crearEmpresa('Asignada', 'B00000001', asesor.Id);
            BandejaContableTestData.crearEmpresa('Ajena', 'B00000002', null);
        }
    }

    static Account cuenta(String nombre) {
        return [SELECT Id FROM Account WHERE Name = :nombre LIMIT 1];
    }

    @IsTest
    static void listaSoloLasEmpresasAsignadas() {
        System.runAs(BandejaContableTestData.asesor()) {
            List<BandejaContableEmpresasService.EmpresaDTO> empresas = BandejaContableEmpresasService.getEmpresasPermitidas();
            Assert.areEqual(1, empresas.size(), 'Solo la cuenta de la que es asesor');
            Assert.areEqual('Asignada', empresas[0].nombre);
            Assert.areEqual('B00000001', empresas[0].cif);
        }
    }

    @IsTest
    static void validaEmpresaAsignada() {
        System.runAs(BandejaContableTestData.asesor()) {
            Account a = BandejaContableEmpresasService.validarEmpresa(cuenta('Asignada').Id);
            Assert.areEqual('B00000001', a.CIF__c);
        }
    }

    @IsTest
    static void rechazaEmpresaNoAsignada() {
        System.runAs(BandejaContableTestData.asesor()) {
            try {
                BandejaContableEmpresasService.validarEmpresa(cuenta('Ajena').Id);
                Assert.fail('Debe rechazar una empresa no asignada');
            } catch (BandejaContableEmpresasService.BandejaContableException e) {
                Assert.isTrue(e.getMessage().contains('No tienes permiso'), e.getMessage());
            }
        }
    }

    @IsTest
    static void rechazaIdQueNoEsDeCuenta() {
        System.runAs(BandejaContableTestData.asesor()) {
            try {
                BandejaContableEmpresasService.validarEmpresa(UserInfo.getUserId());
                Assert.fail('Un Id de usuario no es una empresa');
            } catch (BandejaContableEmpresasService.BandejaContableException e) {
                Assert.areEqual('La empresa no es válida.', e.getMessage());
            }
        }
    }

    @IsTest
    static void modoLibrePermiteCualquierEmpresaVisible() {
        User asesor = BandejaContableTestData.asesor();
        BandejaContableTestData.asignarPermiso(asesor.Id, 'Bandeja_Contable_Todas_Empresas');
        System.runAs(asesor) {
            Assert.isTrue(BandejaContableEmpresasService.esModoLibre(), 'El permiso activa el modo libre');
            Assert.areEqual(0, BandejaContableEmpresasService.getEmpresasPermitidas().size(),
                'En modo libre se usa el buscador, no la lista');
            Assert.areEqual('B00000002', BandejaContableEmpresasService.validarEmpresa(cuenta('Ajena').Id).CIF__c);
        }
    }
}
