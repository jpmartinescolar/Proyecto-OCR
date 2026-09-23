/**
 * Flow action that stores an AI-generated document summary on an existing
 * Deed__c record and associates that deed with a Contact.
 *
 * The current implementation processes the first request in the collection.
 */
public with sharing class ParseDocumentJsonInvocable {

    /** Values supplied by the calling Flow. */
    public class Request {

        /** AI-generated content to save as the deed description. */
        @InvocableVariable
        public String jsonString;

        /** Contact Id to associate with the deed. */
        @InvocableVariable
        public String recordId;
        
        /** Id of the existing Deed__c record to update. */
        @InvocableVariable
        public String deedRecordId;
    }

    /** Result returned to the calling Flow. */
    public class Response {

        /** Contact Id received in the request. */
        @InvocableVariable
        public String recordId;
	
        /** Reserved for the document type extracted from structured JSON. */
        @InvocableVariable
        public String documentType;
        
        /** Processing result, currently either Success or Error. */
        @InvocableVariable
        public String status;

        /** Human-readable processing result or exception stack trace. */
        @InvocableVariable
        public String message;
    }
    
    

    /** Wrapper retained for JSON payloads that contain follow-up actions. */
    public class RootWrapper {
    	public List<ActionItem> actions;
	}

    /** Describes a potential Task from a structured AI response. */
    public class ActionItem {
        public String subject;
        public String description;
        public Boolean ai_generated;
    }
  
    /**
     * Updates a deed with the summary and Contact supplied by Flow.
     *
     * @param requests Flow requests; the first item is processed.
     * @return One response describing the processing result.
     */
    @InvocableMethod(label='Process Document JSON' description='Receives a JSON string and Record Id from Flow.')
    public static List<Response> processJson(List<Request> requests) {

        List<Response> responses = new List<Response>();
        List<Deed__c> deed = new List<Deed__c>();
        List<Task> tasks = new List<Task>();
        Task taskRecord = new Task();
        Deed__c deedRecord = new Deed__c();
        
        // Invocable methods receive a collection, but this action currently
        // handles only the first Flow request.
        Request req = requests.get(0);
        String jsonPayLoad =  req.jsonString;
        /*jsonPayLoad = jsonPayLoad.removeStart('```json');
        jsonPayLoad = jsonPayLoad.removeEnd('```');*/
     
        Response res = new Response();
        res.recordId = req.recordId;
        

        try {
            // The payload is currently stored verbatim as the summary. The
            // commented parsing code is retained for a future structured
            // response containing document type and follow-up actions.
            //Map<String, Object> payload =(Map<String,Object>) JSON.deserializeUntyped(jsonPayLoad);
            String summary = jsonPayLoad;//(STRING)payload.get('summary'); 
            //String documentType = (STRING)payload.get('documentType');        
            //Boolean nextActions = (Boolean)payload.get('nextActions');             
            //List<ActionItem> actions =(List<ActionItem>) JSON.deserialize(JSON.serialize(payload.get('actions')),List<ActionItem>.class);
     		
      		//res.documentType = documentType;
            deedRecord = new Deed__c();
            // Supplying an Id creates a partial record suitable for update
            // without querying the existing deed first.
            deedRecord.Id = req.deedRecordId;
            deedRecord.Contact__c = req.recordId;
            deedRecord.Description__c = summary;
            deedRecord.Is_Generated_by_AI__c = true;
            deed.add(deedRecord);
            
            /*if(nextActions || !actions.isEmpty()) {
                for (ActionItem item: actions) {
                    taskRecord = new Task();
                    taskRecord.Subject = item.subject;
                    taskRecord.Description = item.description;
                    taskRecord.WhoId = req.recordId;
                    taskRecord.Status = 'Not Started';
                    taskRecord.WhatId = req.deedRecordId;
                    if (item.ai_generated) {
                    	taskRecord.AI_Tarea_Generada_por_AI__c =item.ai_generated;
                    }    
                    tasks.add(taskRecord);
                }
            }*/
            
            res.status = 'Success';
            res.message = 'JSON processed successfully.';
            
        } catch (Exception e) {
            
            res.status = 'Error';
            res.message = e.getStackTraceString();
            system.debug('error'+res.message);
        }
        
        responses.add(res);
       
        
        // Perform one DML operation for all deed updates collected above.
        update deed;
        //insert tasks;
        return responses;
    }
    
}