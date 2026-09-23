@isTest
public class CI_GenerarFacturasFromPedidosTest {
    @testsetup 
    static void setup(){
        // Account iAcc1           = CI_FactoryClassTest.getAccount();
        // Account iAcc2           = CI_FactoryClassTest.getAccount();
        // insert new List<Account>{iAcc1,iAcc2};

        // Order iOrder1           = CI_FactoryClassTest.getOrderPendiente();
        // iOrder1.Pricebook2Id    = CI_FactoryClassTest.updateGetStandardPricebookId();
        // iOrder1.AccountId       = iAcc1.Id;

        // Order iOrder2           = CI_FactoryClassTest.getOrderPendiente();
        // iOrder2.Pricebook2Id    = CI_FactoryClassTest.updateGetStandardPricebookId();
        // iOrder2.AccountId       = iAcc1.Id;

        // Order iOrder3               = CI_FactoryClassTest.getOrderPendiente();
        // iOrder3.Pricebook2Id    = CI_FactoryClassTest.updateGetStandardPricebookId();
        // iOrder3.AccountId           = iAcc1.Id;
        // iOrder3.Empresa_Titular__c  = CI_OrderHelper.EMPRESA_TITULAR_CONS_EMP;

        // Order iOrder4               = CI_FactoryClassTest.getOrderPendiente();
        // iOrder4.Pricebook2Id    = CI_FactoryClassTest.updateGetStandardPricebookId();
        // iOrder4.AccountId           = iAcc2.Id;

        // insert new List<Order>{iOrder1,iOrder2,iOrder3,iOrder4};

        // Product2 testProduct    = CI_FactoryClassTest.getActiveProduct();
        // insert testProduct;

        // PricebookEntry testPbe  = CI_FactoryClassTest.getActivePricebookEntry();
        // testPbe.Pricebook2Id    = CI_FactoryClassTest.updateGetStandardPricebookId();
        // testPbe.Product2Id      = testProduct.Id;
        // insert testPbe;

        // OrderItem iOrderItem1           = CI_FactoryClassTest.getOrderItem();
        // iOrderItem1.OrderId             = iOrder1.Id;
        // iOrderItem1.PricebookEntryId    = testPbe.Id;
        // iOrderItem1.Product2Id          = testProduct.Id;

        // OrderItem iOrderItem2           = CI_FactoryClassTest.getOrderItem();
        // iOrderItem2.OrderId             = iOrder2.Id;
        // iOrderItem2.PricebookEntryId    = testPbe.Id;
        // iOrderItem2.Product2Id          = testProduct.Id;

        // OrderItem iOrderItem3           = CI_FactoryClassTest.getOrderItem();
        // iOrderItem3.OrderId             = iOrder3.Id;
        // iOrderItem3.PricebookEntryId    = testPbe.Id;
        // iOrderItem3.Product2Id          = testProduct.Id;

        // OrderItem iOrderItem4           = CI_FactoryClassTest.getOrderItem();
        // iOrderItem4.OrderId             = iOrder4.Id;
        // iOrderItem4.PricebookEntryId    = testPbe.Id;
        // iOrderItem4.Product2Id          = testProduct.Id;

        // insert new List<OrderItem>{iOrderItem1,iOrderItem2,iOrderItem3,iOrderItem4};

        // CI_FactoryClassTest.insert_CS_ConsecutivosFacturas();
    }
    @isTest
    public static void generarFacturasFromPedidosTest(){
        // String orders = '';

        // for(Order iOrder: [SELECT Id FROM Order]){
        //     if(orders == ''){
        //         orders += iOrder.Id;
        //     }
        //     else{
        //         orders += ',' + iOrder.Id;
        //     }
        // }

        // CI_GenerarFacturasFromPedidosFlow.FlowInputs iBase = new CI_GenerarFacturasFromPedidosFlow.FlowInputs();
        // iBase.pedidosIds    = orders;
        // iBase.fechaEmision  = Date.Today();

        // List<String> lResult = new List<String>();
        // Test.startTest();
        //     lResult = CI_GenerarFacturasFromPedidosFlow.startProcessFromFlow(new List<CI_GenerarFacturasFromPedidosFlow.FlowInputs>{iBase});
        // Test.stopTest();

        // //Comprobar que el estado de los Pedidos ha sido actualizado
        // for(Order iOrder: [SELECT Id,Estado_Facturaci_n__c FROM Order]){
        //     Assert.areEqual(CI_OrderHelper.STATUS_INVOICE_FACTURADO, iOrder.Estado_Facturaci_n__c);
        // }
        // //Comprobar que el estado de las facturas han sido actualizadas
        // Integer contInvoices = 0;
        // for(Facturas__c iInv: [SELECT Id,Estado__c FROM Facturas__c]){
        //     Assert.areEqual(CI_InvoiceHelper.ESTADO_SIN_TRASPASAR, iInv.Estado__c);
        //     contInvoices++;
        // }
        // //Comprobar que se han creado las Facturas correctas
        // Assert.areEqual(3, contInvoices);
        // //Comprobar que se han creado las Líneas de Facturas correctas
        // AggregateResult[] result = [SELECT COUNT(Id) cantidad FROM L_nea_de_factura__c];
        // Assert.areEqual(4, result[0].get('cantidad'));
    }

    @isTest
    public static void testTest(){
        CI_GenerarFacturasFromPedidosFlow.cober();
    }
}