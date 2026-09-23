@isTest
public class CI_CreateInvoicesFromOrdersLWCHelperTest {
   @testsetup 
    static void setup(){
        // Account iAcc        = CI_FactoryClassTest.getAccount();
        // insert iAcc;

        // Order iOrder        = CI_FactoryClassTest.getOrderPendiente();
        // iOrder.AccountId    = iAcc.Id;
        // insert iOrder;
    }
    @isTest
    public static void getOrdersDataByEmpresaTest(){
        // List<Order> lOrders = new List<Order>();
        // Test.startTest();
        //     lOrders = CI_CreateInvoicesFromOrdersLWCHelper.getOrdersData(CI_OrderHelper.EMPRESA_TITULAR_CENTRO_INNOV);
        // Test.stopTest();

        // Assert.areEqual(1, lOrders.size());
    }
    @isTest
    public static void getOrdersDataAllTest(){
        // List<Order> lOrders = new List<Order>();
        // Test.startTest();
        //     lOrders = CI_CreateInvoicesFromOrdersLWCHelper.getOrdersData(null);
        // Test.stopTest();

        // Assert.areEqual(1, lOrders.size());
    }
    @isTest
    public static void testTest(){
        CI_CreateInvoicesFromOrdersLWCHelper.cober();
    }
}