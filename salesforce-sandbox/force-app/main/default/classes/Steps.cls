/**
 * Provides access to active AI action configuration by document type.
 */
public with sharing class Steps {

    /**
     * Finds the first active AI action configured for a document type.
     *
     * @param documentType API value stored in AI_Tipo_de_Documento__c.
     * @return The matching action, or an unsaved empty record when none exists.
     */
    public static AI_Acciones__c getPasosByDocumentType(String documentType) {

        AI_Acciones__c response = new AI_Acciones__c();
        // A SOQL-for loop allows the method to return an empty record when the
        // query has no result instead of throwing a QueryException.
        for (AI_Acciones__c  acciones : [Select Id, AI_Prompt_Template__c From AI_Acciones__c 
                                        Where AI_Tipo_de_Documento__c =: documentType
                                        And AI_Activo__c = true
                                        Limit 1]) {
            response = acciones;
        }
		
        return response;
    }

 
}