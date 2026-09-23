/*
*   @Class : CI_GenerateDataModelRemesaFlowTest
*
*   @Author             :   José Ernesto <jose@calibre360.io>
*   @Created            :   30 ene 2024
*   @Description        :   Test class para proceso de generación de estructura de Remesa
*/
@isTest
public with sharing class CI_GenerateDataModelRemesaFlowTest {
   @TestSetup
   static void makeData(){
       CI_ProcessControlHelper.PROCESS_CONTROL_MAP.put(
           CI_ProcessControlHelper.GENERATE_DATA_MODEL_REMESA,
           new CI_ControlProcesos__mdt(
               DeveloperName = CI_ProcessControlHelper.GENERATE_DATA_MODEL_REMESA,
               CI_IsActive__c = TRUE,
               CI_BatchSize__c = 1,
               CI_QueryBatch__c = CI_ProcessControlHelper.PROCESS_CONTROL_MAP.get(CI_ProcessControlHelper.GENERATE_DATA_MODEL_REMESA).CI_QueryBatch__c
           )
       );


       Account iAcc = CI_FactoryClassTest.getAccount();
       insert iAcc;


       CI_GestorProcesos__c iProcess           = CI_FactoryClassTest.getGestorProcesoCreado();
       iProcess.CI_FilterEmpresasTitulares__c  = 'Connectorfy, S.L;Centro de Innovación de Despachos y Pymes, S.L;GM Consulting Empresarial, S.L';
       iProcess.CI_FilterEstados__c            = 'Pendiente;Devuelto';
       iProcess.CI_FilterFechaDesde__c         = Date.Today();
       iProcess.CI_FilterFechaHasta__c         = Date.Today() + 30;
      
       insert iProcess;

       Facturas__c invoice1                    = new Facturas__c();
       invoice1.Empresa__c                     = iAcc.Id;
       invoice1.CIF_Cliente__c                 = iAcc.CIF__c;
       invoice1.Empresa_Titular__c             = CI_OrderHelper.EMPRESA_TITULAR_CENTRO_INNOV;
       invoice1.Estado__c                      = CI_InvoiceHelper.ESTADO_NUEVA;
       invoice1.CI_TipoDeFactura__c            = CI_InvoiceHelper.TIPO_FACTURA_NORMAL;
       invoice1.N_factura__c                   = 'CI-00000001';
       invoice1.Fecha_factura__c               = Date.Today();

       Facturas__c invoice2                    = new Facturas__c();
       invoice2.Empresa__c                     = iAcc.Id;
       invoice2.CIF_Cliente__c                 = iAcc.CIF__c;
       invoice2.Empresa_Titular__c             = CI_OrderHelper.EMPRESA_TITULAR_CONS_EMP;
       invoice2.Estado__c                      = CI_InvoiceHelper.ESTADO_NUEVA;
       invoice2.CI_TipoDeFactura__c            = CI_InvoiceHelper.TIPO_FACTURA_NORMAL;
       invoice2.N_factura__c                   = 'CI-00000002';
       invoice2.Fecha_factura__c               = Date.Today() + 3;

       Facturas__c invoice3                    = new Facturas__c();
       invoice3.Empresa__c                     = iAcc.Id;
       invoice3.CIF_Cliente__c                 = iAcc.CIF__c;
       invoice3.Empresa_Titular__c             = 'Connectorfy, S.L';
       invoice3.Estado__c                      = CI_InvoiceHelper.ESTADO_NUEVA;
       invoice3.CI_TipoDeFactura__c            = CI_InvoiceHelper.TIPO_FACTURA_NORMAL;
       invoice3.N_factura__c                   = 'CI-00000003';
       invoice3.Fecha_factura__c               = Date.Today() + 3;

       insert new List<Facturas__c>{invoice1, invoice2, invoice3};

       Reclamaci_n_de_impagados__c iEfecto1IN  = CI_FactoryClassTest.getEfectoClienteCreadoFRST();
       iEfecto1IN.Cliente__c                   = iAcc.Id;
       iEfecto1IN.Empresa_titular__c           = 'Centro de Innovación de Despachos y Pymes, S.L';
       iEfecto1IN.Fecha_Vencimiento__c         = Date.Today() + 2;
       iEfecto1IN.Importe_factura__c           = 20;
       iEfecto1IN.Facturas_emitidas__c         = invoice1.Id;
       iEfecto1IN.Estado__c                    = CI_EfectoClienteHelper.ESTADO_PENDIENTE;
       iEfecto1IN.Forma_de_pago__c             = 'Domiciliación bancaria';



       Reclamaci_n_de_impagados__c iEfecto2IN  = CI_FactoryClassTest.getEfectoClienteRechazadoFRST();
       iEfecto2IN.Cliente__c                   = iAcc.Id;
       iEfecto2IN.Empresa_titular__c           = 'Connectorfy, S.L';
       iEfecto2IN.Fecha_Vencimiento__c         = Date.Today() + 10;
       iEfecto2IN.Importe_factura__c           = 20;
       iEfecto2IN.Facturas_emitidas__c         = invoice3.Id;
       iEfecto2IN.Estado__c                    = CI_EfectoClienteHelper.ESTADO_PENDIENTE;
       iEfecto2IN.Forma_de_pago__c             = 'Domiciliación bancaria'; 


       Reclamaci_n_de_impagados__c iEfecto3IN  = CI_FactoryClassTest.getEfectoClienteCreadoRCUR();
       iEfecto3IN.Cliente__c                   = iAcc.Id;
       iEfecto3IN.Empresa_titular__c           = 'GM Consulting Empresarial, S.L';
       iEfecto3IN.Fecha_Vencimiento__c         = Date.Today() + 15;
       iEfecto3IN.Importe_factura__c           = 30;
       iEfecto3IN.Facturas_emitidas__c         = invoice2.Id;
       iEfecto3IN.Estado__c                    = CI_EfectoClienteHelper.ESTADO_PENDIENTE;
       iEfecto3IN.Forma_de_pago__c             = 'Domiciliación bancaria';


       Reclamaci_n_de_impagados__c iEfecto4IN  = CI_FactoryClassTest.getEfectoClienteRechazadoRCUR();
       iEfecto4IN.Cliente__c                   = iAcc.Id;
       iEfecto4IN.Empresa_titular__c           = 'GM Consulting Empresarial, S.L';
       iEfecto4IN.Fecha_Vencimiento__c         = Date.Today() + 20;
       iEfecto4IN.Importe_factura__c           = 30;
       iEfecto4IN.Facturas_emitidas__c         = invoice2.Id;
       iEfecto4IN.Estado__c                    = CI_EfectoClienteHelper.ESTADO_PENDIENTE;
       iEfecto4IN.Forma_de_pago__c             = 'Domiciliación bancaria';


       Reclamaci_n_de_impagados__c iEfecto1OUT = CI_FactoryClassTest.getEfectoClienteCreadoFRST();
       iEfecto1OUT.Cliente__c                  = iAcc.Id;
       iEfecto1OUT.Empresa_titular__c          = '';
       iEfecto1OUT.Fecha_Vencimiento__c        = Date.Today() + 60;
       iEfecto1OUT.Importe_factura__c          = 100;
       iEfecto1OUT.Facturas_emitidas__c        = invoice1.Id;
       iEfecto1OUT.Estado__c                   = CI_EfectoClienteHelper.ESTADO_PENDIENTE;
       iEfecto1OUT.Forma_de_pago__c            = 'Domiciliación bancaria';


       insert new List<Reclamaci_n_de_impagados__c>{iEfecto1IN,iEfecto2IN,iEfecto3IN,iEfecto4IN,iEfecto1OUT};
   }
   @isTest
   public static void generateDataModelRemesaTest(){
       CI_GestorProcesos__c iProcess = [SELECT Id FROM CI_GestorProcesos__c LIMIT 1];


       CI_GenerateDataModelRemesaFlow.FlowInputs iInput = new CI_GenerateDataModelRemesaFlow.FlowInputs();
       iInput.idProceso = iProcess.Id;


       List<String> iResponse = new List<String>();


       Test.startTest();
           iResponse = CI_GenerateDataModelRemesaFlow.startProcessFromFlow(new List<CI_GenerateDataModelRemesaFlow.FlowInputs>{iInput});
       Test.stopTest();


       List<CI_Remesa__c> lRemesas                 = new List<CI_Remesa__c>([SELECT Id FROM CI_Remesa__c]);
       List<Reclamaci_n_de_impagados__c> lEfectos  = new List<Reclamaci_n_de_impagados__c>([SELECT Id,Estado__c FROM Reclamaci_n_de_impagados__c]);
       List<CI_RemesaEfecto__c> lJunctions         = new List<CI_RemesaEfecto__c>([SELECT Id,CI_Estado__c FROM CI_RemesaEfecto__c]);


       Assert.areEqual(3, lRemesas.size());
       Assert.areEqual(4, lJunctions.size());


       Integer cont_EnRemesa   = 0;
       Integer cont_Otros      = 0;
       for(Reclamaci_n_de_impagados__c iEfecto: lEfectos){
           if(iEfecto.Estado__c == CI_EfectoClienteHelper.ESTADO_EN_REMESA){
               cont_EnRemesa++;
           }
           else{
               cont_Otros++;
           }
       }


       Assert.areEqual(4, cont_EnRemesa);
       Assert.areEqual(1, cont_Otros);


       Integer cont_Creado = 0;
       cont_Otros          = 0;
       for(CI_RemesaEfecto__c iJunct: lJunctions){
           if(iJunct.CI_Estado__c == CI_RemesaEfectoHelper.ESTADO_PENDIENTE){
               cont_Creado++;
           }
           else{
               cont_Otros++;
           }
       }


       Assert.areEqual(4, cont_Creado);
       Assert.areEqual(0, cont_Otros);
   }
}