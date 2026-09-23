public class RelatedRecordComponentCtr 
{

    @auraEnabled
    public static objectDetails getObjectDetails(String recId)
    {
        List<Account> relatedResult=new List<Account>();
        objectDetails obj=new objectDetails();
        String recordId= (String.isNotEmpty(recId)) ? String.escapeSingleQuotes(recId) : '' ;
        String sObjName = (id.valueof(recId)).getSObjectType().getDescribe().getName();
        String queryString='';
        Sobject result;
        String accountId='';
        Id nullId;
        
        if(sObjName!='Account')
        {
            queryString='SELECT AccountId FROM '+sObjName+' WHERE Id=:recordId';
            if(queryString!=null && queryString!=''){
            	 result=Database.query(String.escapeSingleQuotes(queryString));   
            }
            if(result.get('AccountId')!=null && result.get('AccountId') !='')
                accountId=(String)result.get('AccountId');
        }
        else{
            accountId=recordId;
        }
        
        //GETTING RELATED CONTACT AND CONTRACT ID
        if(accountId!=null && accountId!='')
        {
             String relatedQuery='SELECT name, (SELECT Id from Contacts),(SELECT Id from Contracts) from Account WHERE Id=:accountId';
             relatedResult=Database.query(String.escapeSingleQuotes(relatedQuery));
             if(relatedResult!=null && relatedResult.size()>0)
             {
                 for(Account acc : relatedResult)
                 {
                     List<Contact> contactList=acc.contacts;
                     obj.ParentContactId =(contactList.size() > 0)? contactList[0].Id :nullId ;
                     List<Contract> contractList=acc.contracts;
                     obj.ParentContractId =(contractList.size() > 0)? contractList[0].Id :nullId ;
                 }
             }
         }
        
         obj.ParentAccountId =accountId ;
         obj.IconName='standard:'+sObjName.toLowerCase();
        
         RETURN obj;
    }
    
    /*@AuraEnabled
     public static objectDetails getObjectDetailForCase(String caseId)
    {
        objectDetails obj=new objectDetails();
        
        String recordId= (String.isNotEmpty(caseId)) ? String.escapeSingleQuotes(caseId) : '' ;
        
        String queryString='SELECT AccountId ,ContactId FROM Case WHERE Id=:recordId';
        
        Sobject result=Database.query(String.escapeSingleQuotes(queryString));
        
        obj.ParentContactId = (String)result.get('ContactId');
        obj.ParentAccountId = (String)result.get('AccountId');
        RETURN obj;
    }*/
    
     public class objectDetails{
        @auraEnabled 
        public String IconName ;
        @auraEnabled 
        public String ParentAccountId ;
        @auraEnabled 
        public String ParentContactId ;
        @auraEnabled 
        public String ParentContractId ;

    }
}