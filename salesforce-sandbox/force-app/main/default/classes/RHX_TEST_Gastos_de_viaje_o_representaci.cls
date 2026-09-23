@isTest(SeeAllData=true)
public class RHX_TEST_Gastos_de_viaje_o_representaci {
	static testMethod void RHX_Testmethod() {
        List<sObject> sourceList = [SELECT Id 
			FROM Gastos_de_viaje_o_representaci_n__c ORDER BY LastModifiedDate DESC LIMIT 1];
        if(sourceList.size() == 0) {
            sourceList.add(
                    new Gastos_de_viaje_o_representaci_n__c()
            );
        }
    	

       rh2.ParentUtil.UpsertRollupTestRecords( sourceList );
    }
}