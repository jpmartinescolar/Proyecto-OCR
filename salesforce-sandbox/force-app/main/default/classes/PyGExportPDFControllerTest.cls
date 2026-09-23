@isTest
private class PyGExportPDFControllerTest {

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
        Plan_general_contable__c ingresos = new Plan_general_contable__c(Name = '7050000000', T_tulo_cuenta__c = 'Prestaciones de servicios');
        Plan_general_contable__c gastos   = new Plan_general_contable__c(Name = '6000000001', T_tulo_cuenta__c = 'Compras');
        insert new List<Plan_general_contable__c>{ ingresos, gastos };

        Integer yr = Date.today().year();
        Asiento_contable__c asiento = new Asiento_contable__c(
            Empresa_titular__c = EMPRESA, Tipo_de_asiento__c = 'Factura emitida',
            Fecha_asiento_contable__c = Date.newInstance(yr, 6, 15), Canal__c = '001 General');
        insert asiento;
        insert new List<Linea_asiento_contable__c>{
            new Linea_asiento_contable__c(Asientos_contable__c = asiento.Id, Plan__c = ingresos.Id,
                Debe__c = 0, Haber__c = 1000, Empresa_titular__c = EMPRESA, Simulaci_n__c = 'No', Check__c = 'Si'),
            new Linea_asiento_contable__c(Asientos_contable__c = asiento.Id, Plan__c = gastos.Id,
                Debe__c = 400, Haber__c = 0, Empresa_titular__c = EMPRESA, Simulaci_n__c = 'No', Check__c = 'Si')
        };
    }

    @isTest
    static void testConComparativoDesglosado() {
        Integer yr = Date.today().year();
        Test.setCurrentPage(Page.PyGExportPDF);
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
        PyGExportPDFController ctrl = new PyGExportPDFController();
        Test.stopTest();

        System.assertEquals(null, ctrl.errorMsg);
        System.assertEquals(EMPRESA, ctrl.empresaLabel);
        System.assertEquals(true, ctrl.conComparativo);
        System.assertEquals(true, ctrl.desglosado);
        System.assertEquals(String.valueOf(yr), ctrl.anioActual);
        System.assertEquals(String.valueOf(yr - 1), ctrl.anioComparado);
        System.assert(!ctrl.rows.isEmpty(), 'Debe generar filas del PyG');
        System.assert(!ctrl.kpis.isEmpty(), 'Debe generar los KPIs del resumen');
        Boolean hayCuenta = false, hayFinal = false;
        for (PyGExportPDFController.PdfRow r : ctrl.rows) {
            if (r.isCuenta) hayCuenta = true;
            if (r.rowClass == 'row-final') hayFinal = true;
        }
        System.assert(hayCuenta, 'Desglosado debe incluir filas de cuenta');
        System.assert(hayFinal, 'El último subtotal se marca como fila final');
    }

    @isTest
    static void testSinComparativoNiDesglose() {
        Integer yr = Date.today().year();
        Test.setCurrentPage(Page.PyGExportPDF);
        Map<String, String> p = ApexPages.currentPage().getParameters();
        p.put('e',  EMPRESA);
        p.put('d1', yr + '-01-01');
        p.put('d2', yr + '-12-31');
        p.put('cc', '0');
        p.put('dg', '0');

        PyGExportPDFController ctrl = new PyGExportPDFController();
        System.assertEquals(null, ctrl.errorMsg);
        System.assertEquals(false, ctrl.conComparativo);
        System.assertEquals(false, ctrl.desglosado);
        for (PyGExportPDFController.PdfRow r : ctrl.rows) {
            System.assert(!r.isCuenta, 'Sin desglose no debe haber filas de cuenta');
        }
    }

    @isTest
    static void testSinParametros() {
        Test.setCurrentPage(Page.PyGExportPDF);
        PyGExportPDFController ctrl = new PyGExportPDFController();
        System.assertNotEquals(null, ctrl.errorMsg, 'Sin empresas debe informar error');
    }
}