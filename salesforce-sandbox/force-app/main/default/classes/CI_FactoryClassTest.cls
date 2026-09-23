/*  @Class : CI_FactoryClassTest
*
*   @Author             :   José Ernesto <jose@calibre360.io>
*   @Created            :   20 Oct 2023
*   @Description        :   Factory Test General Class
*/
@isTest
public class CI_FactoryClassTest {
    /*  @Created            :   20 Oct 2023
    *   @Description        :   Devolver Account */
    @isTest
    public static Account getAccount(){
        Account iAcc            = new Account();
        iAcc.Name               = 'Empresa prueba';
        iAcc.CIF__c             = '60035445X';
        iAcc.Industry           = CI_AccountHelper.SECTOR_OTROS_SERVICIOS;
        iAcc.Type               = CI_AccountHelper.TIPO_PARTICULAR;
        iAcc.Subsectores__c     = CI_AccountHelper.SUB_SECTOR_OTROS_SERV_PERS;
        iAcc.BillingCity        = 'Madrid';
        iAcc.BillingState       = 'Madrid';
        iAcc.BillingPostalCode  = '28021';

        return iAcc;
    }
    /*  @Created            :   20 Oct 2023
    *   @Description        :   Devolver Order pendiente de facturación */
    @isTest
    public static Order getOrderPendiente(){
        Order iOrder                    = new Order();
        iOrder.Estado_Facturaci_n__c    = CI_OrderHelper.STATUS_INVOICE_PENDIENTE;
        iOrder.Status                   = CI_OrderHelper.STATUS_DRAFT;
        iOrder.Empresa_Titular__c       = CI_OrderHelper.EMPRESA_TITULAR_CENTRO_INNOV;
        iOrder.EffectiveDate            = Date.Today();

        return iOrder;
    }
    /*  @Created            :   20 Oct 2023
    *   @Description        :   Devolver OrderItem */
    @isTest
    public static OrderItem getOrderItem(){
        OrderItem iOrderItem        = new OrderItem();
        iOrderItem.Quantity         = 100;
        iOrderItem.UnitPrice        = 2;

        return iOrderItem;
    }
    /*  @Created            :   20 Oct 2023
    *   @Description        :   Devolver Producto activo */
    @isTest
    public static Product2 getActiveProduct(){
        Product2 iProd  = new Product2();
        iProd.Name      = 'Producto Test';
        iProd.IsActive  = true;

        return iProd;
    }
    /*  @Created            :   20 Oct 2023
    *   @Description        :   Devolver Pricebook entry */
    @isTest
    public static PricebookEntry getActivePricebookEntry(){
        PricebookEntry iPBE     = new PricebookEntry();
        iPBE.UnitPrice          = 100;
        iPBE.IsActive           = true;

        return iPBE;
    }
    /*  @Created            :   20 Oct 2023
    *   @Description        :   Devolver Standard Pricebook */
    @isTest
    public static Id updateGetStandardPricebookId(){
        Pricebook2 standardPricebook    = new Pricebook2();
        standardPricebook.Id            = Test.getStandardPricebookId();

        update standardPricebook;

        standardPricebook = [SELECT IsStandard FROM Pricebook2 WHERE Id = :standardPricebook.Id];

        return standardPricebook.Id;
    }
    /*  @Created            :   20 Oct 2023
    *   @Description        :   Insertar registros de la custom metadata ConsecutivosFacturas */
    @isTest
    public static void insert_CS_ConsecutivosFacturas(){
        CI_ConsecutivosFacturas__c iCF1     = new CI_ConsecutivosFacturas__c();
        iCF1.Name                           = 'iCF1';
        iCF1.CI_Empresa__c                  = CI_OrderHelper.EMPRESA_TITULAR_CENTRO_INNOV;
        iCF1.CI_ValorFijoFactNormal__c      = 'N';
        iCF1.CI_ValorFijoFactAbono__c       = 'A';
        iCF1.CI_ConsecutivoFacturaNormal__c = 1;
        iCF1.CI_ConsecutivoFacturaAbono__c  = 1;

        CI_ConsecutivosFacturas__c iCF2     = new CI_ConsecutivosFacturas__c();
        iCF2.Name                           = 'iCF2';
        iCF2.CI_Empresa__c                  = CI_OrderHelper.EMPRESA_TITULAR_CONS_EMP;
        iCF2.CI_ValorFijoFactNormal__c      = 'N';
        iCF2.CI_ValorFijoFactAbono__c       = 'A';
        iCF2.CI_ConsecutivoFacturaNormal__c = 1;
        iCF2.CI_ConsecutivoFacturaAbono__c  = 1;

        insert new List<CI_ConsecutivosFacturas__c>{iCF1,iCF2};
    }
    /*  @Created            :   30 Ene 2024
    *   @Description        :   Devolver registro Gestor de proceso creado 
                            :   los filtros se deberán completar en la clase test correspondiente según necesidad*/
    @isTest
    public static CI_GestorProcesos__c getGestorProcesoCreado(){
        CI_GestorProcesos__c iProcess           = new CI_GestorProcesos__c();
        iProcess.CI_Estado__c                   = CI_GestorProcesos.ESTADO_CREADO;
        iProcess.CI_TipoProceso__c              = CI_GestorProcesos.TIPO_REMESA;

        return iProcess;
    }
    /*  @Created            :   30 Ene 2024
    *   @Description        :   Devolver registro Efecto de cliente en estado Creado tipo FRST
                            :   se deberá especificar la empresa titular en el test
                            :   se deberá especificar la fecha vencimiento en el test*/
    @isTest
    public static Reclamaci_n_de_impagados__c getEfectoClienteCreadoFRST(){
        Reclamaci_n_de_impagados__c iEfecto = new Reclamaci_n_de_impagados__c();
        iEfecto.Estado__c                   = CI_EfectoClienteHelper.ESTADO_PENDIENTE;
        iEfecto.CI_BASeqTp__c               = CI_EfectoClienteHelper.TIPO_FRST;

        return iEfecto;
    }
    /*  @Created            :   30 Ene 2024
    *   @Description        :   Devolver registro Efecto de cliente en estado Creado tipo RCUR
                            :   se deberá especificar la empresa titular en el test
                            :   se deberá especificar la fecha vencimiento en el test*/
    @isTest
    public static Reclamaci_n_de_impagados__c getEfectoClienteCreadoRCUR(){
        Reclamaci_n_de_impagados__c iEfecto = new Reclamaci_n_de_impagados__c();
        iEfecto.Estado__c                   = CI_EfectoClienteHelper.ESTADO_PENDIENTE;
        iEfecto.CI_BASeqTp__c               = CI_EfectoClienteHelper.TIPO_RCUR;

        return iEfecto;
    }
    /*  @Created            :   30 Ene 2024
    *   @Description        :   Devolver registro Efecto de cliente en estado Creado de tipo FRST
                            :   se deberá especificar la empresa titular en el test
                            :   se deberá especificar la fecha vencimiento en el test*/
    @isTest
    public static Reclamaci_n_de_impagados__c getEfectoClienteRechazadoFRST(){
        Reclamaci_n_de_impagados__c iEfecto = new Reclamaci_n_de_impagados__c();
        iEfecto.Estado__c                   = CI_EfectoClienteHelper.ESTADO_DEVUELTO;
        iEfecto.CI_BASeqTp__c               = CI_EfectoClienteHelper.TIPO_FRST;

        return iEfecto;
    }
    /*  @Created            :   30 Ene 2024
    *   @Description        :   Devolver registro Efecto de cliente en estado Rechazado de tipo RCUR
                            :   se deberá especificar la empresa titular en el test
                            :   se deberá especificar la fecha vencimiento en el test*/
    @isTest
    public static Reclamaci_n_de_impagados__c getEfectoClienteRechazadoRCUR(){
        Reclamaci_n_de_impagados__c iEfecto = new Reclamaci_n_de_impagados__c();
        iEfecto.Estado__c                   = CI_EfectoClienteHelper.ESTADO_DEVUELTO;
        iEfecto.CI_BASeqTp__c               = CI_EfectoClienteHelper.TIPO_RCUR;

        return iEfecto;
    }
    /*  @Created            :   30 Ene 2024
    *   @Description        :   Devolver registro Remesa
                            :   se deberá especificar la empresa titular en el test*/
    @isTest
    public static CI_Remesa__c getRemesa(){
        CI_Remesa__c iRemesa        = new CI_Remesa__c();
        iRemesa.CI_FechaRemesa__c   = System.Today();

        return iRemesa;
    }
    /*  @Created            :   30 Ene 2024
    *   @Description        :   Devolver registro Junction Remesa-Efecto*/
    @isTest
    public static CI_RemesaEfecto__c getRemesaEfectoCreado(){
        CI_RemesaEfecto__c iRemesaEfecto = new CI_RemesaEfecto__c();
        iRemesaEfecto.CI_Estado__c       = CI_RemesaEfectoHelper.ESTADO_PENDIENTE;

        return iRemesaEfecto;
    }
}