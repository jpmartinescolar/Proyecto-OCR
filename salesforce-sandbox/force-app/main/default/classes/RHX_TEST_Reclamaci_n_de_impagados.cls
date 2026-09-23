@isTest(SeeAllData=true)
public class RHX_TEST_Reclamaci_n_de_impagados {
	static testMethod void RHX_Testmethod() {
        List<sObject> sourceList = [SELECT Id 
			FROM Reclamaci_n_de_impagados__c ORDER BY LastModifiedDate DESC LIMIT 1];
        if(sourceList.size() == 0) {
            sourceList.add(
                    new Reclamaci_n_de_impagados__c()
            );
        }
    	

       rh2.ParentUtil.UpsertRollupTestRecords( sourceList );
    }
}