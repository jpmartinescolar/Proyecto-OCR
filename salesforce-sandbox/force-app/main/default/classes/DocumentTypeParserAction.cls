/**
 * Flow action that parses document-classification JSON, records its detected
 * skills, and invokes the prompt template selected by the classification.
 */
public with sharing class DocumentTypeParserAction {

    /** Values supplied by the calling Flow. */
    public class Request {
        @InvocableVariable
        public String jsonInput;
        @InvocableVariable
        public String contentDocumentId;
        @InvocableVariable
        public String deedId;
        @InvocableVariable
        public String contactId;
    }

    /** Classification details returned to the calling Flow. */
    public class Response {
        @InvocableVariable
        public String documentTypeValue;
        @InvocableVariable
        public String promptTemplateName;
        @InvocableVariable
        public Boolean foundTemplate;
        @InvocableVariable
        public String summary;
    }

    /** Strongly typed representation of the classification JSON payload. */
    public class DocumentPayload {
        public String documentType;
        public String promptTemplateName;
        public String summary;
        public List<String> skill;
    }

    /**
     * Parses the first Flow request and starts prompt processing when a known
     * document type is detected.
     *
     * @param requests Flow requests; the first item is processed.
     * @return A response for a recognized type, otherwise an empty list.
     */
    @InvocableMethod(
        label='Parse Document Type JSON'
        description='Deserializes JSON and extracts documentType value'
    )
    public static List<Response> parseDocumentType(List<Request> requests) {

        List<Response> responses = new List<Response>();
        List<AI_Skills_asociados__c > skills = new List<AI_Skills_asociados__c >();
        AI_Skills_asociados__c skillRecord = new AI_Skills_asociados__c();

        Response res = new Response();
		Request req = requests.get(0);
        
        String jsonPayLoad =  req.jsonInput;
        String contentDocumentId = req.contentDocumentId;
        // Prompt responses can be enclosed in Markdown JSON code fences.
        jsonPayLoad = jsonPayLoad.removeStart('```json');
        jsonPayLoad = jsonPayLoad.removeEnd('```');
        
        if (String.isNotBlank(jsonPayLoad)) {
            DocumentPayload payload = (DocumentPayload) JSON.deserialize(jsonPayLoad,DocumentPayload.class);
            if (payload.documentType != 'Unknown') {
            	res.documentTypeValue = payload.documentType;
            	res.promptTemplateName = payload.promptTemplateName;
                res.foundTemplate = true;
                res.summary = payload.summary;
                
                // Prepare the detected skill relationships for bulk insertion.
                for (String sk:payload.skill) {
                  	skillRecord = new AI_Skills_asociados__c();
                    skillRecord.AI_Skill_AI__c = sk;
                    skillRecord.AI_Escritura_AI__c = req.deedId;
                    skills.add(skillRecord);
                }
                
                // The first detected skill is used as the prompt action input.
                DynamicPrompt.executePromptTemplate(contentDocumentId, res.promptTemplateName, payload.skill.get(0), req.deedId, req.contactId);
                responses.add(res);  
 
            } else {
               	res.foundTemplate = false;
            }
        }
        
        // Avoid issuing DML when the payload contains no skills.
        if (!skills.isEmpty()) {
           	insert skills; 
        }
        return responses;
    }
}