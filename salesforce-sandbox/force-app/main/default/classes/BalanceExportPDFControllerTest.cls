@isTest
private class BalanceExportPDFControllerTest {

    private static final String EMPRESA = primerValorPicklist('Linea_asiento_contable__c', 'Empresa_titular__c');

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
        Plan_general_contable__c capital = new Plan_general_contable__c(Name = '1000000000', T_tulo_cuenta__c = 'Capital social');
        Plan_general_contable__c bancos  = new Plan_general_contable__c(Name = '5720000000', T_tulo_cuenta__c = 'Bancos');
        insert new List<Plan_general_contable__c>{ capital, bancos };

        Integer yr = Date.today().year();
        Asiento_contable__c asiento = new Asiento_contable__c(
            Empresa_titular__c = EMPRESA, Tipo_de_asiento__c = 'Apunte',
            Fecha_asiento_contable__c = Date.newInstance(yr, 2, 10), Canal__c = '001 General');
        insert asiento;
        insert new List<Linea_asiento_contable__c>{
            new Linea_asiento_contable__c(Asientos_contable__c = asiento.Id, Plan__c = bancos.Id,
                Debe__c = 3000, Haber__c = 0, Empresa_titular__c = EMPRESA, Simulaci_n__c = 'No', Check__c = 'Si'),
            new Linea_asiento_contable__c(Asientos_contable__c = asiento.Id, Plan__c = capital.Id,
                Debe__c = 0, Haber__c = 3000, Empresa_titular__c = EMPRESA, Simulaci_n__c = 'No', Check__c = 'Si')
        };
    }

    @isTest
    static void testConComparativoDesglosado() {
        Integer yr = Date.today().year();
        Test.setCurrentPage(Page.BalanceExportPDF);
        Map<String, String> p = ApexPages.currentPage().getParameters();
        p.put('e',  EMPRESA);
        p.put('d1', yr + '-01-01');
        p.put('d2', yr + '-12-31');
        p.put('cc', '1');
        p.put('c1', (yr - 1) + '-01-01');
        p.put('c2', (yr - 1) + '-12-31');
        p.put('dg', '1');
        p.put('p',  'PGC PYMES');
        p.put('s',  'Todas');
        p.put('x',  'No');
        p.put('chk','Todos');

        Test.startTest();
        BalanceExportPDFController ctrl = new BalanceExportPDFController();
        Test.stopTest();

        System.assertEquals(null, ctrl.errorMsg);
        System.assertEquals(EMPRESA, ctrl.empresaLabel);
        System.assertEquals(true, ctrl.conComparativo);
        System.assertEquals(true, ctrl.desglosado);
        System.assertEquals(String.valueOf(yr), ctrl.anioActual);
        System.assertEquals(String.valueOf(yr - 1), ctrl.anioComparado);
        System.assert(!ctrl.rows.isEmpty(), 'Debe generar filas del balance');
        Boolean hayBanda = false, hayFinal = false, hayCuenta = false;
        for (BalanceExportPDFController.PdfRow r : ctrl.rows) {
            if (r.isBanda) hayBanda = true;
            if (r.rowClass == 'row-final') hayFinal = true;
            if (r.isCuenta) hayCuenta = true;
        }
        System.assert(hayBanda, 'Debe incluir las bandas ACTIVO / PASIVO');
        System.assert(hayFinal, 'Debe incluir los totales como fila final');
        System.assert(hayCuenta, 'Desglosado debe incluir filas de cuenta');
    }

    @isTest
    static void testSinComparativoNiDesglose() {
        Integer yr = Date.today().year();
        Test.setCurrentPage(Page.BalanceExportPDF);
        Map<String, String> p = ApexPages.currentPage().getParameters();
        p.put('e',  EMPRESA);
        p.put('d1', yr + '-01-01');
        p.put('d2', yr + '-12-31');
        p.put('cc', '0');
        p.put('dg', '0');

        BalanceExportPDFController ctrl = new BalanceExportPDFController();
        System.assertEquals(null, ctrl.errorMsg);
        System.assertEquals(false, ctrl.conComparativo);
        System.assertEquals(false, ctrl.desglosado);
        for (BalanceExportPDFController.PdfRow r : ctrl.rows) {
            System.assert(!r.isCuenta, 'Sin desglose no debe haber filas de cuenta');
        }
    }

    @isTest
    static void testSinParametros() {
        Test.setCurrentPage(Page.BalanceExportPDF);
        BalanceExportPDFController ctrl = new BalanceExportPDFController();
        System.assertNotEquals(null, ctrl.errorMsg, 'Sin empresas debe informar error');
    }
}