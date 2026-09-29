@IsTest
private class BandejaContableEmpresasServiceTest {

    @TestSetup
    static void setup() {
        User asesor = BandejaContableTestData.crearAsesor();
        System.runAs(asesor) {
            BandejaContableTestData.crearEmpresa('Asignada', 'B00000001', asesor.Id);
            BandejaContableTestData.crearEmpresa('Ajena', 'B00000002', null);
        }
        // Grupo empresarial con una empresa del asesor y otra ajena (lo da de alta un administrador)
        Grupo_Empresarial__c g = new Grupo_Empresarial__c(Name = 'Grupo Bandeja Test');
        insert g;
        List<Account> miembros = [SELECT Id FROM Account WHERE Name IN ('Asignada', 'Ajena')];
        for (Account a : miembros) a.Grupo_Empresarial__c = g.Id;
        update miembros;
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

    @IsTest
    static void empresasYGruposDelAsesor() {
        System.runAs(BandejaContableTestData.asesor()) {
            BandejaContableEmpresasService.EmpresasYGruposDTO r = BandejaContableEmpresasService.buscarEmpresasYGrupos(null);
            Assert.areEqual(1, r.empresas.size(), 'Solo su empresa');
            Assert.areEqual('Asignada', r.empresas[0].nombre);
            Assert.areEqual('Grupo Bandeja Test', r.empresas[0].grupo);
            Assert.areEqual(1, r.grupos.size());
            Assert.areEqual(1, r.grupos[0].miembros.size(), 'Del grupo solo ve las empresas a su alcance');
            Assert.areEqual('Asignada', r.grupos[0].miembros[0].nombre);
        }
    }

    @IsTest
    static void buscaPorNombreOCif() {
        System.runAs(BandejaContableTestData.asesor()) {
            Assert.areEqual(1, BandejaContableController.buscarEmpresasYGrupos('B00000001').empresas.size());
            BandejaContableEmpresasService.EmpresasYGruposDTO nada = BandejaContableEmpresasService.buscarEmpresasYGrupos('zzz');
            Assert.areEqual(0, nada.empresas.size());
            Assert.areEqual(0, nada.grupos.size());
            Assert.areEqual(1, BandejaContableEmpresasService.buscarEmpresasYGrupos('Grupo Bandeja').grupos.size(), 'Busca grupos por nombre');
        }
    }

    @IsTest
    static void modoLibreVeTodasLasEmpresasDelGrupo() {
        User asesor = BandejaContableTestData.asesor();
        BandejaContableTestData.asignarPermiso(asesor.Id, 'Bandeja_Contable_Todas_Empresas');
        System.runAs(asesor) {
            BandejaContableEmpresasService.EmpresasYGruposDTO r = BandejaContableEmpresasService.buscarEmpresasYGrupos('Grupo Bandeja');
            Assert.areEqual(2, r.grupos[0].miembros.size());
        }
    }
}
