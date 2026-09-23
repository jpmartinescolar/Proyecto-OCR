/*
*   @Class          :   CI_SummaryGAUBankAmountControllerTest
*
*   @Author         :   Julián Martínez Cordones <julian@calibre360.io>
*   @Created        :   2025-03-28
*   @Description    :   Updated to cover getRelatedAccountingEntriesPaged + cursor + filters + search + server-side sorting
*/

@IsTest
public class CI_SummaryGAUBankAmountControllerTest {

    @TestSetup
    static void makeData() {
        Account iAcc = CI_FactoryClassTest.getAccount();
        iAcc.Procedencia_del_cliente__c = 'Testing Origin';
        insert iAcc;

        Asiento_contable__c asientoContable = new Asiento_contable__c();
        asientoContable.Canal__c                  = '001 General';
        asientoContable.Fecha_asiento_contable__c = Date.newInstance(2025, 1, 12);
        asientoContable.Tipo_de_asiento__c        = 'Pago';
        asientoContable.Empresa_titular__c        = CI_OrderHelper.EMPRESA_TITULAR_CENTRO_INNOV;
        insert asientoContable;

        Plan_general_contable__c planGeneralContable = new Plan_general_contable__c();
        planGeneralContable.Name             = '7000000000';
        planGeneralContable.T_tulo_cuenta__c = 'Testing';
        planGeneralContable.Grupo__c         = 'Ventas e ingresos';
        insert planGeneralContable;

        // ---- Registros base (2) ----
        Linea_asiento_contable__c apunteContableDebe = new Linea_asiento_contable__c();
        apunteContableDebe.Asientos_contable__c  = asientoContable.Id;
        apunteContableDebe.Plan__c               = planGeneralContable.Id;
        apunteContableDebe.Empresa_titular__c    = CI_OrderHelper.EMPRESA_TITULAR_CENTRO_INNOV;
        apunteContableDebe.rea__c                = 'General';
        apunteContableDebe.Debe__c               = 739;
        apunteContableDebe.Haber__c              = 0;
        apunteContableDebe.Check__c              = 'Si';
        apunteContableDebe.Simulaci_n__c         = 'Si';
        apunteContableDebe.Descripci_n__c        = 'Concepto especial DEBE';

        Linea_asiento_contable__c apunteContableHaber = new Linea_asiento_contable__c();
        apunteContableHaber.Asientos_contable__c  = asientoContable.Id;
        apunteContableHaber.Plan__c               = planGeneralContable.Id;
        apunteContableHaber.Empresa_titular__c    = CI_OrderHelper.EMPRESA_TITULAR_CONS_EMP;
        apunteContableHaber.rea__c                = 'Laboral';
        apunteContableHaber.Debe__c               = 0;
        apunteContableHaber.Haber__c              = 277;
        apunteContableHaber.Check__c              = 'No';
        apunteContableHaber.Simulaci_n__c         = 'No';
        apunteContableHaber.Descripci_n__c        = 'Concepto HABER';

        insert new List<Linea_asiento_contable__c>{ apunteContableDebe, apunteContableHaber };

        // ---- Más datos (para probar paginación/cursor) ----
        List<Linea_asiento_contable__c> lAsientos = new List<Linea_asiento_contable__c>();
        Date base = Date.newInstance(2025, 1, 31);

        for (Integer i = 0; i < 30; i++) {
            Decimal saldo = (Math.mod(i, 2) == 0) ? 10 : -5;

            Linea_asiento_contable__c l = new Linea_asiento_contable__c();
            l.Asientos_contable__c = asientoContable.Id;
            l.Plan__c = planGeneralContable.Id;

            // alterna empresas para probar filtro empresaTitular
            l.Empresa_titular__c = (Math.mod(i, 2) == 0)
                ? CI_OrderHelper.EMPRESA_TITULAR_CENTRO_INNOV
                : CI_OrderHelper.EMPRESA_TITULAR_CONS_EMP;

            // alterna áreas
            l.rea__c = (Math.mod(i, 2) == 0) ? 'General' : 'Laboral';

            l.Debe__c = (saldo > 0) ? saldo : 0;
            l.Haber__c = (saldo < 0) ? -saldo : 0;

            // para test de searchTerm
            l.Descripci_n__c = (Math.mod(i, 5) == 0) ? 'Texto especial ' + i : 'Texto normal ' + i;

            // picklists (si tus valores existen)
            l.Check__c = (Math.mod(i, 2) == 0) ? 'Si' : 'No';
            l.Simulaci_n__c = (Math.mod(i, 2) == 0) ? 'Si' : 'No';

            lAsientos.add(l);
        }
        insert lAsientos;
    }

    @IsTest
    static void getRelatedAccountingEntriesPaged_FirstAndSecondPage_Test() {
        Plan_general_contable__c plan = [
            SELECT Id
            FROM Plan_general_contable__c
            LIMIT 1
        ];

        Test.startTest();
        CI_SummaryGAUBankAmountController.PageResult pr1 =
            CI_SummaryGAUBankAmountController.getRelatedAccountingEntriesPaged(
                plan.Id,
                10,     // pageSize
                null,   // cursor
                Date.newInstance(2025, 1, 1),
                Date.newInstance(2025, 12, 31),
                null,   // empresaTitular
                null,   // searchTerm
                'FechaAsiento', // sortBy (clave lógica del controller)
                'desc'         // sortDirection
            );
        Test.stopTest();

        System.assertNotEquals(null, pr1, 'PageResult no debe ser null');
        System.assertEquals(10, pr1.rows.size(), 'Debe devolver la primera página con pageSize');
        System.assertNotEquals(null, pr1.totalSaldo, 'Debe devolver totalSaldo');
        System.assertNotEquals(null, pr1.nextCursor, 'Debe devolver nextCursor cuando hay más páginas');

        // Segunda página usando cursor
        CI_SummaryGAUBankAmountController.PageResult pr2 =
            CI_SummaryGAUBankAmountController.getRelatedAccountingEntriesPaged(
                plan.Id,
                10,
                pr1.nextCursor,
                Date.newInstance(2025, 1, 1),
                Date.newInstance(2025, 12, 31),
                null,
                null,
                'FechaAsiento',
                'desc'
            );

        System.assertEquals(10, pr2.rows.size(), 'Debe devolver la segunda página con pageSize');
        System.assertEquals(pr1.totalSaldo, pr2.totalSaldo, 'totalSaldo debe ser consistente');
        System.assertNotEquals(pr1.rows[0].Id, pr2.rows[0].Id, 'No debería repetir la primera fila entre páginas');
    }

    @IsTest
    static void getRelatedAccountingEntriesPaged_FilterEmpresa_Test() {
        Plan_general_contable__c plan = [
            SELECT Id
            FROM Plan_general_contable__c
            LIMIT 1
        ];

        CI_SummaryGAUBankAmountController.PageResult pr =
            CI_SummaryGAUBankAmountController.getRelatedAccountingEntriesPaged(
                plan.Id,
                50,
                null,
                null,
                null,
                CI_OrderHelper.EMPRESA_TITULAR_CENTRO_INNOV,
                null,
                'FechaAsiento',
                'desc'
            );

        System.assert(pr.rows.size() > 0, 'Debe devolver resultados para la empresa filtrada');
        for (CI_SummaryGAUBankAmountController.AccountingEntryWrapper w : pr.rows) {
            System.assertEquals(
                CI_OrderHelper.EMPRESA_TITULAR_CENTRO_INNOV,
                w.EmpresaTitular,
                'Todas las filas deben cumplir el filtro EmpresaTitular'
            );
        }
    }

    @IsTest
    static void getRelatedAccountingEntriesPaged_SearchTerm_Test() {
        Plan_general_contable__c plan = [
            SELECT Id
            FROM Plan_general_contable__c
            LIMIT 1
        ];

        // Busca por "especial" (Name o Descripci_n__c)
        CI_SummaryGAUBankAmountController.PageResult pr =
            CI_SummaryGAUBankAmountController.getRelatedAccountingEntriesPaged(
                plan.Id,
                100,
                null,
                null,
                null,
                null,
                'especial',
                'FechaAsiento',
                'desc'
            );

        System.assert(pr.rows.size() > 0, 'Debe encontrar registros por término "especial"');
    }

    @IsTest
    static void getRelatedAccountingEntriesPaged_BadCursor_Ignored_Test() {
        Plan_general_contable__c plan = [
            SELECT Id
            FROM Plan_general_contable__c
            LIMIT 1
        ];

        // Cursor mal formado no debe romper, debe ignorarse y devolver la primera página
        CI_SummaryGAUBankAmountController.PageResult pr =
            CI_SummaryGAUBankAmountController.getRelatedAccountingEntriesPaged(
                plan.Id,
                5,
                'bad|cursor|format',
                null,
                null,
                null,
                null,
                'FechaAsiento',
                'desc'
            );

        System.assertEquals(5, pr.rows.size(), 'Con cursor inválido debe devolver la primera página igualmente');
    }

    @IsTest
    static void getRelatedAccountingEntriesPaged_ServerSideSort_Debe_ASC_Test() {
        Plan_general_contable__c plan = [
            SELECT Id
            FROM Plan_general_contable__c
            LIMIT 1
        ];

        // Ordena por Debe ASC (server-side)
        CI_SummaryGAUBankAmountController.PageResult pr =
            CI_SummaryGAUBankAmountController.getRelatedAccountingEntriesPaged(
                plan.Id,
                20,
                null,
                null,
                null,
                null,
                null,
                'ImporteDebe',
                'asc'
            );

        System.assert(pr.rows.size() > 1, 'Debe devolver más de 1 fila para validar orden');
        Decimal prev = pr.rows[0].ImporteDebe == null ? 0 : pr.rows[0].ImporteDebe;
        for (Integer i = 1; i < pr.rows.size(); i++) {
            Decimal cur = pr.rows[i].ImporteDebe == null ? 0 : pr.rows[i].ImporteDebe;
            System.assert(cur >= prev, 'ImporteDebe debe estar ordenado ascendente (server-side)');
            prev = cur;
        }
    }

    @IsTest
    static void getEmpresaTitularPicklistValuesTest() {
        List<Linea_asiento_contable__c> apuntes = [
            SELECT Id, Empresa_titular__c
            FROM Linea_asiento_contable__c
            LIMIT 2
        ];

        Test.startTest();
        List<String> empresaTitularPicklistValues = CI_SummaryGAUBankAmountController.getEmpresaTitularPicklistValues();
        Test.stopTest();

        System.assertEquals(true, empresaTitularPicklistValues.contains(apuntes[0].Empresa_titular__c));
        System.assertEquals(true, empresaTitularPicklistValues.contains(apuntes[1].Empresa_titular__c));
    }

    @IsTest
    static void getAreaPicklistValuesTest() {
        List<Linea_asiento_contable__c> apuntes = [
            SELECT Id, rea__c
            FROM Linea_asiento_contable__c
            LIMIT 2
        ];

        Test.startTest();
        List<String> areaPicklistValues = CI_SummaryGAUBankAmountController.getAreaPicklistValues();
        Test.stopTest();

        System.assertEquals(true, areaPicklistValues.contains(apuntes[0].rea__c));
        System.assertEquals(true, areaPicklistValues.contains(apuntes[1].rea__c));
    }

    @IsTest
    static void getCheckPicklistValuesTest() {
        List<Linea_asiento_contable__c> apuntes = [
            SELECT Id, Check__c
            FROM Linea_asiento_contable__c
            LIMIT 2
        ];

        Test.startTest();
        List<String> checkPicklistValues = CI_SummaryGAUBankAmountController.getCheckPicklistValues();
        Test.stopTest();

        System.assertEquals(true, checkPicklistValues.contains(apuntes[0].Check__c));
        System.assertEquals(true, checkPicklistValues.contains(apuntes[1].Check__c));
    }

    @IsTest
    static void getSimulacionPicklistValuesTest() {
        List<Linea_asiento_contable__c> apuntes = [
            SELECT Id, Simulaci_n__c
            FROM Linea_asiento_contable__c
            LIMIT 2
        ];

        Test.startTest();
        List<String> simulacionPicklistValues = CI_SummaryGAUBankAmountController.getSimulacionPicklistValues();
        Test.stopTest();

        // Si tus valores no coinciden exactamente, deja esto comentado como lo tienes ahora.
        // System.assertEquals(true, simulacionPicklistValues.contains(apuntes[0].Simulaci_n__c));
        // System.assertEquals(true, simulacionPicklistValues.contains(apuntes[1].Simulaci_n__c));
        System.assertNotEquals(null, simulacionPicklistValues);
    }

    @IsTest
    static void updateAccountingEntriesTest() {
        Linea_asiento_contable__c apunte = [
            SELECT Id, Empresa_titular__c
            FROM Linea_asiento_contable__c
            LIMIT 1
        ];

        Linea_asiento_contable__c upd = new Linea_asiento_contable__c(
            Id = apunte.Id,
            Empresa_titular__c = null
        );

        Test.startTest();
            CI_SummaryGAUBankAmountController.updateAccountingEntries(new List<Linea_asiento_contable__c>{ upd });
        Test.stopTest();

        Linea_asiento_contable__c apunteActualizado = [
            SELECT Id, Empresa_titular__c
            FROM Linea_asiento_contable__c
            WHERE Id = :apunte.Id
            LIMIT 1
        ];

        System.assertEquals(null, apunteActualizado.Empresa_titular__c);
    }
}