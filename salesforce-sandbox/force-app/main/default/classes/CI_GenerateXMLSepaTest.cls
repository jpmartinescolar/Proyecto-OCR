/*
*   @Class : CI_GenerateXMLSepaTest
*
*   @Author             :   José Ernesto <jose@calibre360.io>
*   @Created            :   30 ene 2024
*   @Description        :   Test class para proceso de generación del XML SEPA
*/
@isTest
public with sharing class CI_GenerateXMLSepaTest {
   @TestSetup
   static void makeData(){
       CI_ProcessControlHelper.PROCESS_CONTROL_MAP.put(
           CI_ProcessControlHelper.GENERATE_XML_SEPA,
           new CI_ControlProcesos__mdt(
               DeveloperName = CI_ProcessControlHelper.GENERATE_XML_SEPA,
               CI_IsActive__c = TRUE,
               CI_BatchSize__c = 1,
               CI_QueryBatch__c = CI_ProcessControlHelper.PROCESS_CONTROL_MAP.get(CI_ProcessControlHelper.GENERATE_XML_SEPA).CI_QueryBatch__c
           )
       );


       Account iAcc = CI_FactoryClassTest.getAccount();
       iAcc.Procedencia_del_cliente__c         = 'Testing Origin';
       insert iAcc;


       CI_GestorProcesos__c iProcess           = CI_FactoryClassTest.getGestorProcesoCreado();
       iProcess.CI_FilterEmpresasTitulares__c  = 'Connectorfy, S.L;Centro de Innovación de Despachos y Pymes, S.L;GM Consulting Empresarial, S.L';
       iProcess.CI_FilterEstados__c            = 'Pendiente;Devuelto';
       iProcess.CI_FilterFechaDesde__c         = Date.Today();
       iProcess.CI_FilterFechaHasta__c         = Date.Today() + 30;
       insert iProcess;

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

       Mandato_SEPA__c mandato1                 = new Mandato_SEPA__c();
       mandato1.Empresa_titular__c              = CI_OrderHelper.EMPRESA_TITULAR_CENTRO_INNOV;
       mandato1.Empresa__c                      = iAcc.Id;
       mandato1.Bancos__c                       = banco.Id;
       mandato1.Tipo__c                         = 'Manual';
       mandato1.N_SEPA__c                       = 'ES52B871416360000000000000000014947';
       mandato1.Fecha_firma__c                  = Date.today(); 
       mandato1.IBAN_Cliente__c                 = 'ES920049456330281004702';

       Mandato_SEPA__c mandato2                 = new Mandato_SEPA__c();
       mandato2.Empresa_titular__c              = 'Connectorfy, S.L';
       mandato2.Empresa__c                      = iAcc.Id;
       mandato2.Bancos__c                       = banco.Id;
       mandato2.Tipo__c                         = 'Manual';
       mandato2.N_SEPA__c                       = 'ES52B871416360000000000000000014946';
       mandato2.Fecha_firma__c                  = Date.today();
       mandato2.IBAN_Cliente__c                 = 'ES920049456330281004701';

       insert new List<Mandato_SEPA__c>{mandato1, mandato2};

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
       invoice2.Empresa_Titular__c             = 'Connectorfy, S.L';
       invoice2.Estado__c                      = CI_InvoiceHelper.ESTADO_NUEVA;
       invoice2.CI_TipoDeFactura__c            = CI_InvoiceHelper.TIPO_FACTURA_NORMAL;
       invoice2.N_factura__c                   = 'CI-00000002';
       invoice2.Fecha_factura__c               = Date.Today() + 3;

       insert new List<Facturas__c>{invoice1, invoice2};

       Reclamaci_n_de_impagados__c iEfecto1IN  = CI_FactoryClassTest.getEfectoClienteCreadoFRST();
       iEfecto1IN.Cliente__c                   = iAcc.Id;
       iEfecto1IN.Empresa_titular__c           = 'Centro de Innovación de Despachos y Pymes, S.L';
       iEfecto1IN.Fecha_Vencimiento__c         = Date.Today() + 2;
       iEfecto1IN.Importe_factura__c           = 20;
       iEfecto1IN.Facturas_emitidas__c         = invoice1.Id;
       iEfecto1IN.Estado__c                    = CI_EfectoClienteHelper.ESTADO_PENDIENTE;
       iEfecto1IN.Forma_de_pago__c             = 'Domiciliación bancaria';
       iEfecto1IN.Mandato_SEPA__c              = mandato1.Id;


       Reclamaci_n_de_impagados__c iEfecto3IN  = CI_FactoryClassTest.getEfectoClienteCreadoRCUR();
       iEfecto3IN.Cliente__c                   = iAcc.Id;
       iEfecto3IN.Empresa_titular__c           = 'Connectorfy, S.L';
       iEfecto3IN.Fecha_Vencimiento__c         = Date.Today() + 15;
       iEfecto3IN.Importe_factura__c           = 30;
       iEfecto3IN.Facturas_emitidas__c         = invoice2.Id;
       iEfecto3IN.Estado__c                    = CI_EfectoClienteHelper.ESTADO_PENDIENTE;
       iEfecto3IN.Forma_de_pago__c             = 'Domiciliación bancaria';
       iEfecto3IN.Mandato_SEPA__c              = mandato2.Id;
      
       insert new List<Reclamaci_n_de_impagados__c>{iEfecto1IN,iEfecto3IN};
      
       CI_Remesa__c iRemesa1                    = CI_FactoryClassTest.getRemesa();
       iRemesa1.CI_GestorProceso__c             = iProcess.Id;
       iRemesa1.CI_EmpresaTitular__c            = 'Centro de Innovación de Despachos y Pymes, S.L';


       CI_Remesa__c iRemesa2                    = CI_FactoryClassTest.getRemesa();
       iRemesa2.CI_GestorProceso__c             = iProcess.Id;
       iRemesa2.CI_EmpresaTitular__c            = 'Connectorfy, S.L';


       insert new List<CI_Remesa__c>{iRemesa1,iRemesa2};
      
       CI_RemesaEfecto__c iJunct1 = CI_FactoryClassTest.getRemesaEfectoCreado();
       iJunct1.CI_Remesa__c       = iRemesa1.Id;
       iJunct1.CI_Efecto__c       = iEfecto1IN.Id;
       iJunct1.CI_ImporteReal__c  = iEfecto1IN.Importe_factura__c;
       iJunct1.CI_BASeqTp__c      = iEfecto1IN.CI_BASeqTp__c;
       iJunct1.CI_Estado__c       = 'Pendiente';


       CI_RemesaEfecto__c iJunct3 = CI_FactoryClassTest.getRemesaEfectoCreado();
       iJunct3.CI_Remesa__c       = iRemesa2.Id;
       iJunct3.CI_Efecto__c       = iEfecto3IN.Id;
       iJunct3.CI_ImporteReal__c  = iEfecto3IN.Importe_factura__c;
       iJunct3.CI_BASeqTp__c      = iEfecto3IN.CI_BASeqTp__c;
       iJunct3.CI_Estado__c       = 'Pendiente';
      
       insert new List<CI_RemesaEfecto__c>{iJunct1,iJunct3};
   }


   @isTest
   public static void generateXMLSEPA_FRST_Test(){
       CI_Remesa__c iRemesa = [SELECT Id FROM CI_Remesa__c WHERE CI_EmpresaTitular__c = 'Centro de Innovación de Despachos y Pymes, S.L' LIMIT 1];


       CI_GenerateXMLSepaFlow.FlowInputs iInput = new CI_GenerateXMLSepaFlow.FlowInputs();
       iInput.idRemesa = iRemesa.Id;


       List<String> iResponse = new List<String>();


       Test.startTest();
           iResponse = CI_GenerateXMLSepaFlow.startProcessFromFlow(new List<CI_GenerateXMLSepaFlow.FlowInputs>{iInput});
       Test.stopTest();


       List<Reclamaci_n_de_impagados__c> lEfectos  = new List<Reclamaci_n_de_impagados__c>([SELECT Id,Estado__c FROM Reclamaci_n_de_impagados__c]);
       List<CI_RemesaEfecto__c> lJunctions         = new List<CI_RemesaEfecto__c>([SELECT Id,CI_Estado__c FROM CI_RemesaEfecto__c]);


       Integer cont_Pagado = 0;
       Integer cont_Otros  = 0;
       for(Reclamaci_n_de_impagados__c iEfecto: lEfectos){
           if(iEfecto.Estado__c == CI_EfectoClienteHelper.ESTADO_PAGADO){
               cont_Pagado++;
           }
           else{
               cont_Otros++;
           }
       }


       Assert.areEqual(1, cont_Pagado);
       Assert.areEqual(1, cont_Otros);


       cont_Pagado = 0;
       cont_Otros  = 0;
       for(CI_RemesaEfecto__c iJunct: lJunctions){
           if(iJunct.CI_Estado__c == CI_RemesaEfectoHelper.ESTADO_PAGADO){
               cont_Pagado++;
           }
           else{
               cont_Otros++;
           }
       }


       Assert.areEqual(1, cont_Pagado);
       Assert.areEqual(1, cont_Otros);


       Attachment attachment   = [SELECT Id FROM Attachment WHERE ParentId =:iRemesa.Id];
       Assert.areNotEqual(null, attachment);
   }


   @isTest
   public static void generateXMLSEPA_RCUR_Test(){
       CI_Remesa__c iRemesa = [SELECT Id FROM CI_Remesa__c WHERE CI_EmpresaTitular__c = 'Connectorfy, S.L' LIMIT 1];


       CI_GenerateXMLSepaFlow.FlowInputs iInput = new CI_GenerateXMLSepaFlow.FlowInputs();
       iInput.idRemesa = iRemesa.Id;


       List<String> iResponse = new List<String>();


       Test.startTest();
           iResponse = CI_GenerateXMLSepaFlow.startProcessFromFlow(new List<CI_GenerateXMLSepaFlow.FlowInputs>{iInput});
       Test.stopTest();


       List<Reclamaci_n_de_impagados__c> lEfectos  = new List<Reclamaci_n_de_impagados__c>([SELECT Id,Estado__c FROM Reclamaci_n_de_impagados__c]);
       List<CI_RemesaEfecto__c> lJunctions         = new List<CI_RemesaEfecto__c>([SELECT Id,CI_Estado__c FROM CI_RemesaEfecto__c]);


       Integer cont_Pagado = 0;
       Integer cont_Otros  = 0;
       for(Reclamaci_n_de_impagados__c iEfecto: lEfectos){
           if(iEfecto.Estado__c == CI_EfectoClienteHelper.ESTADO_PAGADO){
               cont_Pagado++;
           }
           else{
               cont_Otros++;
           }
       }


       Assert.areEqual(1, cont_Pagado);
       Assert.areEqual(1, cont_Otros);


       cont_Pagado = 0;
       cont_Otros  = 0;
       for(CI_RemesaEfecto__c iJunct: lJunctions){
           if(iJunct.CI_Estado__c == CI_RemesaEfectoHelper.ESTADO_PAGADO){
               cont_Pagado++;
           }
           else{
               cont_Otros++;
           }
       }


       Assert.areEqual(1, cont_Pagado);
       Assert.areEqual(1, cont_Otros);


       Attachment attachment   = [SELECT Id FROM Attachment WHERE ParentId =:iRemesa.Id];
       Assert.areNotEqual(null, attachment);
   }


   @isTest
   public static void generateXMLSEPAErrorTest(){
       // CI_Remesa__c iRemesa        = [SELECT Id FROM CI_Remesa__c LIMIT 1];


       CI_GenerateXMLSepaFlow.FlowInputs iInput = new CI_GenerateXMLSepaFlow.FlowInputs();
       // iInput.idRemesa = iRemesa.Id;


       List<String> iResponse = new List<String>();


       Test.startTest();
           iResponse = CI_GenerateXMLSepaFlow.startProcessFromFlow(new List<CI_GenerateXMLSepaFlow.FlowInputs>{iInput});
       Test.stopTest();
   }
}