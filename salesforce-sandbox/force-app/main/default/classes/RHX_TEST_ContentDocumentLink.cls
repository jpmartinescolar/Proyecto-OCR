@isTest(SeeAllData=true)
public class RHX_TEST_ContentDocumentLink {
	static testMethod void RHX_Testmethod() {
		ContentDocument cd = [SELECT Id FROM ContentDocument LIMIT 1][0];
		List<sObject> sourceList = [SELECT Id FROM ContentDocumentLink WHERE ContentDocumentId = :cd.Id];
        if(sourceList.size() == 0) {
            sourceList.add(
                    new ContentDocumentLink()
            );
        }
    	

       rh2.ParentUtil.UpsertRollupTestRecords( sourceList );
    }
}