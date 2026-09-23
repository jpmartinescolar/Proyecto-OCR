@isTest(SeeAllData=true)
public class RHX_TEST_Contrato_club_de_innovaci_n {
	static testMethod void RHX_Testmethod() {
        List<sObject> sourceList = [SELECT Id 
			FROM Contrato_club_de_innovaci_n__c ORDER BY LastModifiedDate DESC LIMIT 1];
        if(sourceList.size() == 0) {
            sourceList.add(
                    new Contrato_club_de_innovaci_n__c()
            );
        }
    	

       rh2.ParentUtil.UpsertRollupTestRecords( sourceList );
    }
}