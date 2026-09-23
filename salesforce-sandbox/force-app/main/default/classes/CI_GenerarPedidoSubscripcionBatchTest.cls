/*
 * Created Date: September 2023
 * Author: Lester Romero Bernardo
 * -----
 * Copyright (c) 2023 Calibre360.io
 * -----
 * HISTORY:
 * Date      	By	Comments
 * ----------	---	---------------------------------------------------------
 */
@isTest
public class CI_GenerarPedidoSubscripcionBatchTest {
    @TestSetup
    static void makeData(){
        Account empresa = new Account(
            Name = 'Test',
            Type = 'Particular',
            BillingState = 'Madrid',
            CIF__c = '60035445V', 
            Procedencia_del_cliente__c = 'Testing Origin 1'
        );
        insert empresa;

        Account iAcc = CI_FactoryClassTest.getAccount();
        iAcc.Procedencia_del_cliente__c         = 'Testing Origin 2';
        iAcc.BillingStreet                      = 'Testing street';
        iAcc.BillingCountryCode                 = 'ES';

        insert iAcc;

        Contact contact                         = new Contact(
            AccountId                           = iAcc.Id, 
            FirstName                           = 'Testing', 
            LastName                            = ' Contact', 
            Email                               = 'testBillingContact@example.io'
        );

        insert contact;

        Pricebook2 standardPricebook = new Pricebook2(
	        Id = Test.getStandardPricebookId(),
	        IsActive = true
        );
        update standardPricebook;

        standardPricebook = [SELECT IsStandard FROM Pricebook2 WHERE Id = :standardPricebook.Id];

        Product2 testProduct = new Product2(
            Name = 'Test Product', 
            IsActive = true
        );
        insert testProduct;

        PricebookEntry testPbe = new PricebookEntry(
            Pricebook2Id = standardPricebook.Id,
            Product2Id = testProduct.Id,
            UnitPrice = 100,
            IsActive = true
        );
        insert testPbe;

        Mandato_SEPA__c mandato                 = new Mandato_SEPA__c();
        mandato.Empresa_titular__c              = CI_OrderHelper.EMPRESA_TITULAR_CENTRO_INNOV;
        mandato.Empresa__c                      = iAcc.Id;
        mandato.Tipo__c                         = 'Manual';
        mandato.N_SEPA__c                       = 'ES52B871416360000000000000000014947';
        mandato.Fecha_firma__c                  = Date.today(); 
        mandato.IBAN_Cliente__c                 = 'ES920049456330281004702';

        insert mandato;

        contratos_suscripci_n__c sub = new contratos_suscripci_n__c(
            Empresa_Titular__c = 'Centro de Innovación de Despachos y Pymes, S.L',
            Productos_y_Servicios__c = testProduct.Id,
            Unidades__c = 1,
            Descripci_n_l_nea__c = 'test desc',
            Importe__c = 100,
            Periodicidad__c = CI_GenerarPedidoSubscripcionHelper.SUB_RECURR_FREC_ANUAL,
            Pr_xima_fecha_facturaci_n__c = Date.today(),
            Empresa__c = empresa.Id,
            Tipo_de_cobro__c = 'Avanzado',
            Estado__c = 'Activado', 
            Empresa_emisora__c = iAcc.Id, 
            Contacto_facturaci_n__c = contact.Id, 
            Mandato_SEPA__c = mandato.Id, 
            Cuenta_contable_IVA_repercutido__c = '47000000021', 
            Agrupaci_n__c = 'Fastbanc', 
            Tipo_comisi_n__c = 'Fijo', 
            Cuota_comisi_n__c = 30, 
            Id_Tipo_de_IVA__c = 'Test Id IVA', 
            Comisionista_2__c = iAcc.Id, 
            Tipo_comisi_n_2__c = 'Fijo', 
            comisi_n_2__c = 25, 
            Total_comisi_n_2__c = 49, 
            Estados_de_facturaci_n__c = 'Pendiente', 
            Operaci_n_vinculada__c = 'Si', 
            Tipo_operaci_n_vinculada__c = 'Servicios entre personas o entidades vinculadas', 
            operaci_n_intragrupo__c = 'No'
        );
        insert sub;
    }

    @IsTest
    static void GenerarStruct(){   
        Test.startTest();
            Database.executeBatch(new CI_GenerarPedidoSubscripcionBatch(), 1);
        Test.stopTest();

        contratos_suscripci_n__c org = [SELECT Id, Pr_xima_fecha_facturaci_n__c FROM contratos_suscripci_n__c WHERE Empresa_Titular__c = 'Centro de Innovación de Despachos y Pymes, S.L' LIMIT 1];

        System.assertEquals(Date.today(), [SELECT Id, EffectiveDate FROM Order WHERE Cuotas_recurrentes__c =: org.Id].EffectiveDate);
        System.assertEquals(Date.today().addYears(1), org.Pr_xima_fecha_facturaci_n__c);
    
    }

    @IsTest
    static void GenerarStructError(){   
        Test.startTest();
        try {
            Database.executeBatch(new CI_GenerarPedidoSubscripcionBatch('SELECT Id FROM Contact'), 1);
        } catch (Exception e) {
        }
        Test.stopTest();
    }

    @IsTest
    static void ScheduleTest(){
        Test.startTest();
            Datetime dt = Datetime.now().addMinutes(1);
            String CRON_EXP = '0 '+ dt.minute() + ' * ' + dt.day() + ' ' + dt.month() + ' ? ' + dt.year();
            System.schedule('OrderGen', CRON_EXP, new CI_GenerarPedidoSubscripcionBatch() );   
        Test.stopTest();
    }
}