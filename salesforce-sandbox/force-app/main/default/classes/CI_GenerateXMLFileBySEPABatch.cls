/*
*   @Class : CI_GenerateXMLFileBySEPABatch
*
*   @Author             :   José Ernesto <jose@calibre360.io>
*   @Created            :   25 ene 2024
*   @Description        :   Genera el fichero XML SEPA
*/
global with sharing class CI_GenerateXMLFileBySEPABatch implements Schedulable, Database.Stateful, Database.Batchable<SObject> {
    String query;
    Boolean processActive;
    Integer batchSize;
   
    private Id idRemesa;
    private String stringFRST = '';
    private String stringRCUR = '';
 
 
    public CI_GenerateXMLFileBySEPABatch() {
        this.query           = CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_XML_SEPA).CI_QueryBatch__c;
        this.processActive   = CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_XML_SEPA).CI_IsActive__c;
        this.batchSize       = Integer.valueOf(CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_XML_SEPA).CI_BatchSize__c);
    }
 
 
    public CI_GenerateXMLFileBySEPABatch(Id idRemesa) {
        this.idRemesa                   = idRemesa;
 
 
        this.query          = CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_XML_SEPA).CI_QueryBatch__c;
        this.processActive  = CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_XML_SEPA).CI_IsActive__c;
        this.batchSize      = Integer.valueOf(CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_XML_SEPA).CI_BatchSize__c);
    }
 
 
    global Database.QueryLocator start(Database.BatchableContext BC) {
        return Database.getQueryLocator(query);
    }
 
 
    global void execute(Database.BatchableContext BC, List<SObject> scope) {
        if (!processActive) {
            return;
        }
        //No activaré el try/catch hasta no tener objeto de logs
        // System.savePoint sp = Database.setSavePoint();
        // try {
            List<CI_RemesaEfecto__c> lJunctions     = (List<CI_RemesaEfecto__c>)scope;
            Set<Id> sEfectosToSearch                = new Set<Id>();
 
 
            for(CI_RemesaEfecto__c iJunct: lJunctions){
                CI_SEPAWRAPPER.SEPAXmlDrctDbtTxInf iSEPAXmlDrctDbtTxInf = CI_SEPAXMLGenerator.getSEPAXmlDrctDbtTxInf(iJunct);
 
 
                if (iJunct.CI_BASeqTp__c == 'FRST') {
                    stringFRST += CI_SEPAXMLGenerator.getChildNodeDrctDbtTxInf(iSEPAXmlDrctDbtTxInf);
                }
                else if (iJunct.CI_BASeqTp__c == 'RCUR') {
                    stringRCUR += CI_SEPAXMLGenerator.getChildNodeDrctDbtTxInf(iSEPAXmlDrctDbtTxInf);
                }
                //Actualizar estado del junction a Pagado
                iJunct.CI_Estado__c = CI_RemesaEfectoHelper.ESTADO_PAGADO;
               
                sEfectosToSearch.add(iJunct.CI_Efecto__c);
            }
 
 
            List<Reclamaci_n_de_impagados__c> lEfectosToUpdate = new List<Reclamaci_n_de_impagados__c>();
            for(Reclamaci_n_de_impagados__c iRecImp: [SELECT Id,Estado__c FROM Reclamaci_n_de_impagados__c WHERE Id IN:sEfectosToSearch]){
                iRecImp.Estado__c = CI_EfectoClienteHelper.ESTADO_PAGADO;
                //Actualizar estado de efecto de cliente a Pagado
                lEfectosToUpdate.add(iRecImp);
            }
           
            update lJunctions;
           
            if(!lEfectosToUpdate.isEmpty()){
                update lEfectosToUpdate;
            }
        // }
        // catch (Exception e) {
        //     Database.rollback(sp);
        // }
    }
 
 
    global void execute(SchedulableContext scon) {
        Database.executeBatch(new CI_GenerateXMLFileBySEPABatch(), batchSize);
    }
 
 
    global void finish(Database.BatchableContext BC) {
        Savepoint sp = Database.setSavepoint();
 
 
        try {
            CI_SEPAXMLGenerator.generateWrappersFromSEPAs(idRemesa, stringFRST, stringRCUR);
        }
        catch(Exception e) {
            Database.rollback(sp);
        }
    }
}