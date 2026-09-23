@IsTest
private class StepsTest {

    private static final String DOCUMENT_TYPE =
        'Escritura_Publica_de_Compraventa';

    @IsTest
    static void getPasosByDocumentTypeReturnsActiveMatchingRecord() {
        Test.startTest();
        AI_Acciones__c activeAction = new AI_Acciones__c(
            AI_Tipo_de_Documento__c = DOCUMENT_TYPE,
            AI_Activo__c = true,
            AI_Prompt_Template__c = 'Active_Prompt_Template'
        );
        AI_Acciones__c inactiveAction = new AI_Acciones__c(
            AI_Tipo_de_Documento__c = DOCUMENT_TYPE,
            AI_Activo__c = false,
            AI_Prompt_Template__c = 'Inactive_Prompt_Template'
        );
        insert new List<AI_Acciones__c>{ activeAction, inactiveAction };

     	List<AI_Acciones__c> acciones = [Select Id From AI_Acciones__c];
        Assert.areEqual(2, acciones.size());
        
        AI_Acciones__c result = Steps.getPasosByDocumentType('Escritura_Publica_de_Compraventa');
        Assert.areEqual('Active_Prompt_Template',result.AI_Prompt_Template__c);
        Test.stopTest();
    }
   
}