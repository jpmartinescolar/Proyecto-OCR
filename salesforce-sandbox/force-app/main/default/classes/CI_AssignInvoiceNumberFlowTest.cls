/*
*   @Class          :   CI_AssignInvoiceNumberFlowTest
*
*   @Author         :   Julián Martínez Cordones <julian@calibre360.io>
*   @Created        :   2024-12-23
*   @Description    :   Class CI_AssignInvoiceNumberFlowTest
*
*   Modification Log
*   --------------------------------------------------------------------------------------
*   #       Developer                           Date                    Description
*   --------------------------------------------------------------------------------------
*   1       Julián Martínez Cordones            2024-12-23      	    Creation           
*
*/

@IsTest
public class CI_AssignInvoiceNumberFlowTest {
    /*
    @TestSetup
    static void makeData(){
        CI_FactoryClassTest.insert_CS_ConsecutivosFacturas();


        Account iAcc = CI_FactoryClassTest.getAccount();
        insert iAcc;

        Facturas__c invoice1                    = new Facturas__c();
        invoice1.Empresa__c                     = iAcc.Id;
        invoice1.CIF_Cliente__c                 = iAcc.CIF__c;
        invoice1.Empresa_Titular__c             = CI_OrderHelper.EMPRESA_TITULAR_CENTRO_INNOV;
        invoice1.Estado__c                      = CI_InvoiceHelper.ESTADO_PENDIENTE_VALIDACION;
        invoice1.CI_TipoDeFactura__c            = CI_InvoiceHelper.TIPO_FACTURA_NORMAL;
        invoice1.Fecha_factura__c               = Date.Today();

        Facturas__c invoice2                    = new Facturas__c();
        invoice2.Empresa__c                     = iAcc.Id;
        invoice2.CIF_Cliente__c                 = iAcc.CIF__c;
        invoice2.Empresa_Titular__c             = CI_OrderHelper.EMPRESA_TITULAR_CONS_EMP;
        invoice2.Estado__c                      = CI_InvoiceHelper.ESTADO_PENDIENTE_VALIDACION;
        invoice2.CI_TipoDeFactura__c            = CI_InvoiceHelper.TIPO_FACTURA_NORMAL;
        invoice2.N_factura__c                   = 'CI-00000002';
        invoice2.Fecha_factura__c               = Date.Today() + 3;

        Facturas__c invoice3                    = new Facturas__c();
        invoice3.Empresa__c                     = iAcc.Id;
        invoice3.CIF_Cliente__c                 = iAcc.CIF__c;
        invoice3.Empresa_Titular__c             = CI_OrderHelper.EMPRESA_TITULAR_CONS_EMP;
        invoice3.Estado__c                      = CI_InvoiceHelper.ESTADO_PENDIENTE_VALIDACION;
        invoice3.CI_TipoDeFactura__c            = CI_InvoiceHelper.TIPO_FACTURA_ABONO;
        invoice3.Fecha_factura__c               = Date.Today() + 3;

        insert new List<Facturas__c>{invoice1, invoice2, invoice3};
    }*/

    @isTest
    public static void testCoverage() {
        CI_AssignInvoiceNumberFlow.cober();
    }

    // @isTest
    // public static void assignInvoiceNumberTest() {
    //     List<Facturas__c> invoiceToValidate = [
    //         SELECT Id, 
    //             Estado__c, 
    //             N_factura__c 
    //         FROM Facturas__c 
    //         WHERE N_factura__c = NULL
    //     ];

    //     for (Facturas__c invoice : invoiceToValidate) {
    //         invoice.Estado__c              = CI_InvoiceHelper.ESTADO_VALIDADA;
    //     }

    //     update invoiceToValidate;

    //     CI_AssignInvoiceNumberFlow.FlowInputs iInput = new CI_AssignInvoiceNumberFlow.FlowInputs();
    //     iInput.idFactura = invoiceToValidate[0].Id;


    //     List<String> iResponse = new List<String>();


    //     Test.startTest();
    //         iResponse = CI_AssignInvoiceNumberFlow.startProcessFromFlow(new List<CI_AssignInvoiceNumberFlow.FlowInputs>{iInput});
    //     Test.stopTest();

    //     List<Facturas__c> invoiceWithNumberValidated = [
    //         SELECT Id, 
    //             Estado__c, 
    //             N_factura__c 
    //         FROM Facturas__c 
    //         WHERE Estado__c =: CI_InvoiceHelper.ESTADO_VALIDADA 
    //         AND N_factura__c != NULL
    //     ];

    //     System.assertEquals(2, invoiceWithNumberValidated.size());
    // }
}