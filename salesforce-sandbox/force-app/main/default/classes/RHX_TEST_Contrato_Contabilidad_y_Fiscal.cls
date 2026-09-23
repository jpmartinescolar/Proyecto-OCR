@isTest(SeeAllData=true)
public class RHX_TEST_Contrato_Contabilidad_y_Fiscal {
	static testMethod void RHX_Testmethod() {
        List<sObject> sourceList = [SELECT Id 
			FROM Contrato_Contabilidad_y_Fiscal__c ORDER BY LastModifiedDate DESC LIMIT 1];
        if(sourceList.size() == 0) {
            sourceList.add(
                    new Contrato_Contabilidad_y_Fiscal__c()
            );
        }
    	

       rh2.ParentUtil.UpsertRollupTestRecords( sourceList );
    }
}