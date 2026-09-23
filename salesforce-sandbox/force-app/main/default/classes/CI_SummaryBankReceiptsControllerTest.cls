/*
*   @Class          :   CI_SummaryBankReceiptsControllerTest
*
*   @Author         :   Julián Martínez Cordones <julian@calibre360.io>
*   @Created        :   2025-02-27
*   @Description    :   Class CI_SummaryBankReceiptsControllerTest
*
*   Modification Log
*   --------------------------------------------------------------------------------------
*   #       Developer                           Date                    Description
*   --------------------------------------------------------------------------------------
*   1       Julián Martínez Cordones            2025-02-27      	    Creation           
*
*/

@IsTest
public class CI_SummaryBankReceiptsControllerTest {
    
    @TestSetup
    static void makeData() {
        Account iAcc = CI_FactoryClassTest.getAccount();
        iAcc.Procedencia_del_cliente__c         = 'Testing Origin';
        insert iAcc;

        Bancos__c banco                              = new Bancos__c();
        banco.Banco__c                               = 'Caixabank';
        banco.Identificador_del_acreedor_SEPA__c     = 'ES000089B12345678';
        banco.BIC__c                                 = 'CBMATXXX';

        insert banco;

        Cuenta_bancaria__c cuentaBancaria            = new Cuenta_bancaria__c();
        cuentaBancaria.IBAN__c                       = 'ES00092039729832987123';
        cuentaBancaria.Bancos__c                     = banco.Id;

        insert cuentaBancaria;

        banco.Cuenta_bancaria_bancos__c         = cuentaBancaria.Id;

        update banco;

        Extracto_bancario__c extracto1              = new Extracto_bancario__c();
        extracto1.Concepto__c                       = 'Concepto test 1';
        extracto1.Cuenta_bancaria_bancos__c         = cuentaBancaria.Id;
        extracto1.Estado__c                         = 'Pendiente';
        extracto1.Fecha_movimiento__c               = Date.newInstance(2025, 1, 12);
        extracto1.importe__c                        = 289.32;

        Extracto_bancario__c extracto2              = new Extracto_bancario__c();
        extracto2.Concepto__c                       = 'Concepto test 2';
        extracto2.Cuenta_bancaria_bancos__c         = cuentaBancaria.Id;
        extracto2.Estado__c                         = 'Conciliado';
        extracto2.Fecha_movimiento__c               = Date.newInstance(2025, 1, 29);
        extracto2.importe__c                        = -289.32;

        insert new List<Extracto_bancario__c>{extracto1, extracto2};
    }
    
    @IsTest
    static void getRelatedExtractosTest() {
        Cuenta_bancaria__c testCuenta = [
            SELECT Id
            FROM Cuenta_bancaria__c
            LIMIT 1
        ];

        Test.startTest();
        CI_SummaryBankReceiptsController.PageResult result = CI_SummaryBankReceiptsController.getRelatedExtractosPaged(
            testCuenta.Id,
            500,
            null,
            null,
            null,
            null,
            null,
            'FechaMovimiento',
            'desc'
        );
        Test.stopTest();

        System.assertNotEquals(NULL, result, 'The result should not be null');
        System.assertNotEquals(NULL, result.rows, 'The rows should not be null');
        System.assertEquals(2, result.rows.size(), 'Expected two related Extracto Bancario records');
    }

    @IsTest
    static void getEstadoPicklistValuesTest() {
        List<Extracto_bancario__c> extractos = [
            SELECT Id,
                Estado__c
            FROM Extracto_bancario__c
        ];

        Test.startTest();
        List<String> estadosPicklistValues = CI_SummaryBankReceiptsController.getEstadoPicklistValues();
        Test.stopTest();

        System.assertEquals(TRUE, estadosPicklistValues.contains(extractos[0].Estado__c));
        System.assertEquals(TRUE, estadosPicklistValues.contains(extractos[1].Estado__c));
    }

    @IsTest
    static void getRelatedExtractosPagedNullIdTest() {
        Test.startTest();
        CI_SummaryBankReceiptsController.PageResult result = CI_SummaryBankReceiptsController.getRelatedExtractosPaged(
            null, 500, null, null, null, null, null, 'FechaMovimiento', 'desc'
        );
        Test.stopTest();

        System.assertNotEquals(null, result);
        System.assertEquals(0, result.rows.size());
        System.assertEquals(null, result.nextCursor);
        System.assertEquals(0, result.totalImporte);
    }

    @IsTest
    static void getRelatedExtractosPagedWithFiltersTest() {
        Cuenta_bancaria__c testCuenta = [SELECT Id FROM Cuenta_bancaria__c LIMIT 1];

        Test.startTest();
        // Con filtro de estado y fechas
        CI_SummaryBankReceiptsController.PageResult result = CI_SummaryBankReceiptsController.getRelatedExtractosPaged(
            testCuenta.Id,
            500,
            null,
            Date.newInstance(2025, 1, 1),
            Date.newInstance(2025, 12, 31),
            'Pendiente',
            null,
            'FechaMovimiento',
            'asc'
        );
        Test.stopTest();

        System.assertNotEquals(null, result);
        System.assertEquals(1, result.rows.size());
        System.assertEquals('Pendiente', result.rows[0].Estado);
    }

    @IsTest
    static void getRelatedExtractosPagedWithSearchTest() {
        Cuenta_bancaria__c testCuenta = [SELECT Id FROM Cuenta_bancaria__c LIMIT 1];

        Test.startTest();
        CI_SummaryBankReceiptsController.PageResult result = CI_SummaryBankReceiptsController.getRelatedExtractosPaged(
            testCuenta.Id,
            500,
            null,
            null,
            null,
            null,
            'Concepto test',
            'Concepto',
            'asc'
        );
        Test.stopTest();

        System.assertNotEquals(null, result);
        System.assertEquals(2, result.rows.size());
    }

    @IsTest
    static void getRelatedExtractosPagedWithCursorTest() {
        Cuenta_bancaria__c testCuenta = [SELECT Id FROM Cuenta_bancaria__c LIMIT 1];

        Test.startTest();
        // Primera página con pageSize=1 para generar cursor
        CI_SummaryBankReceiptsController.PageResult page1 = CI_SummaryBankReceiptsController.getRelatedExtractosPaged(
            testCuenta.Id, 1, null, null, null, null, null, 'FechaMovimiento', 'desc'
        );

        System.assertNotEquals(null, page1.nextCursor);

        // Segunda página usando el cursor
        CI_SummaryBankReceiptsController.PageResult page2 = CI_SummaryBankReceiptsController.getRelatedExtractosPaged(
            testCuenta.Id, 1, page1.nextCursor, null, null, null, null, 'FechaMovimiento', 'desc'
        );
        Test.stopTest();

        System.assertNotEquals(null, page2);
        System.assertEquals(1, page2.rows.size());
    }

    @IsTest
    static void getRelatedExtractosPagedSortByImporteTest() {
        Cuenta_bancaria__c testCuenta = [SELECT Id FROM Cuenta_bancaria__c LIMIT 1];

        Test.startTest();
        CI_SummaryBankReceiptsController.PageResult result = CI_SummaryBankReceiptsController.getRelatedExtractosPaged(
            testCuenta.Id, 500, null, null, null, null, null, 'Importe', 'desc'
        );
        Test.stopTest();

        System.assertNotEquals(null, result);
        System.assertEquals(2, result.rows.size());
    }
}