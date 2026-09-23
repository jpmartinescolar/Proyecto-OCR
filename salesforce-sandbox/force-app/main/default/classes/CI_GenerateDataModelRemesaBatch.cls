/*
*   @Class : CI_GenerateDataModelRemesaBatch
*
*   @Author             :   José Ernesto <jose@calibre360.io>
*   @Created            :   18 ene 2024
*   @Description        :   Genera el objeto Remesa y los juction Remesa & Efectos en base al registro Gestor de proceso
*/
global with sharing class CI_GenerateDataModelRemesaBatch implements Schedulable, Database.Stateful, Database.Batchable<SObject> {
    String query;
    Boolean processActive;
    Integer batchSize;
    Map<String, String> mRemesaByEmpresaTitular;
    Set<String> sUsedRemesa;
    List<String> estados;
    List<String> empresasTitulares;
    Date fechaDesde;
    Date fechaHasta;
 
 
    public CI_GenerateDataModelRemesaBatch() {
        this.query           = CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_DATA_MODEL_REMESA).CI_QueryBatch__c;
        this.processActive   = CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_DATA_MODEL_REMESA).CI_IsActive__c;
        this.batchSize       = Integer.valueOf(CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_DATA_MODEL_REMESA).CI_BatchSize__c);
    }
 
 
    public CI_GenerateDataModelRemesaBatch(Map<String, String> mRemesaByEmpresaTitular, List<String> estados, List<String> empresasTitulares, Date fechaDesde, Date fechaHasta) {
        this.mRemesaByEmpresaTitular    = mRemesaByEmpresaTitular;
        this.empresasTitulares          = new List<String>();
        for(String titular: mRemesaByEmpresaTitular.keySet()){
            this.empresasTitulares.add(titular);
        }
       
        this.estados                    = estados;
        this.fechaDesde                 = fechaDesde;
        this.fechaHasta                 = fechaHasta;
        this.query          = CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_DATA_MODEL_REMESA).CI_QueryBatch__c;
        this.processActive  = CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_DATA_MODEL_REMESA).CI_IsActive__c;
        this.batchSize      = Integer.valueOf(CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_DATA_MODEL_REMESA).CI_BatchSize__c);
        //Necesario para saber si debemos eliminar algún registro Remesa generado porque no existían Efectos para ese Titular
        sUsedRemesa         = new Set<String>();
    }
 
 
    global Database.QueryLocator start(Database.BatchableContext BC) {
        return Database.getQueryLocator(query);
    }
 
 
    global void execute(Database.BatchableContext BC, List<SObject> scope) {
        if (!processActive) {
            return;
        }
 
 
        System.savePoint sp = Database.setSavePoint();
        try {
            List<Reclamaci_n_de_impagados__c> lEfectos  = (List<Reclamaci_n_de_impagados__c>)scope;
            List<CI_RemesaEfecto__c> lNewJunctions      = new List<CI_RemesaEfecto__c>();
 
 
            for(Reclamaci_n_de_impagados__c iEfecto: lEfectos){
                CI_RemesaEfecto__c iNewJunction = new CI_RemesaEfecto__c();
                iNewJunction.CI_Remesa__c       = mRemesaByEmpresaTitular.get(iEfecto.Empresa_titular__c);
                iNewJunction.CI_Efecto__c       = iEfecto.Id;
                iNewJunction.CI_Estado__c       = CI_RemesaEfectoHelper.ESTADO_PENDIENTE;
                iNewJunction.CI_ImporteReal__c  = iEfecto.Importe_pendiente__c;
                iNewJunction.CI_BASeqTp__c      = iEfecto.CI_BASeqTp__c;
 
 
                lNewJunctions.add(iNewJunction);
                sUsedRemesa.add(mRemesaByEmpresaTitular.get(iEfecto.Empresa_titular__c));
            }
 
 
            if(!lNewJunctions.isEmpty()){
                insert lNewJunctions;
            }
            //Actualizar estado de Efectos de clientes procesados
            CI_EfectoClienteHelper.updateStatusToEnRemesa(lEfectos);
        }
        catch (Exception e) {
            Database.rollback(sp);
        }
    }
 
 
    global void execute(SchedulableContext scon) {
        Database.executeBatch(new CI_GenerateDataModelRemesaBatch(), batchSize);
    }
 
 
    global void finish(Database.BatchableContext BC) {
        Set<String> sDeleteRemesa = new Set<String>();
        //Si no he encontrado un efecto de cliente para un titular específico, debo eliminar la Remesa creada
        for(String titular: mRemesaByEmpresaTitular.keySet()){
            if(!sUsedRemesa.contains(mRemesaByEmpresaTitular.get(titular))){
                sDeleteRemesa.add(mRemesaByEmpresaTitular.get(titular));
            }
        }
 
 
        List<CI_Remesa__c> lToDelete = new List<CI_Remesa__c>([SELECT Id
                                                                FROM CI_Remesa__c
                                                                WHERE Id IN:sDeleteRemesa]);
 
 
        if(!lToDelete.isEmpty()){
            delete lToDelete;
        }
    }
}