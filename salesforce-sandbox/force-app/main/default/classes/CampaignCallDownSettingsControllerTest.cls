/**
 * This class contains unit tests for validating the behavior of Apex classes
 * and triggers.
 *
 * Unit tests are class methods that verify whether a particular piece
 * of code is working properly. Unit test methods take no arguments,
 * commit no data to the database, and are flagged with the testMethod
 * keyword in the method definition.
 *
 * All test methods in an organization are executed whenever Apex code is deployed
 * to a production organization to confirm correctness, ensure code
 * coverage, and prevent regressions. All Apex classes are
 * required to have at least 75% code coverage in order to be deployed
 * to a production organization. In addition, all triggers must have some code coverage.
 * 
 * The @isTest class annotation indicates this class only contains test
 * methods. Classes defined with the @isTest annotation do not count against
 * the organization size limit for all Apex scripts.
 *
 * See the Apex Language Reference for more information about Testing and Code Coverage.
 */
@isTest
private class CampaignCallDownSettingsControllerTest {

    static testMethod void testNormalFlow() {

			CampaignColumns__c campaignColumns = CampaignColumns__c.getInstance();
			
			if(campaignColumns == null){
				campaignColumns = new CampaignColumns__c();
				campaignColumns.ADDRESS__c 			= true;
				campaignColumns.COMPANY__c 			= true;
				campaignColumns.EMAIL__c 			= true;
				campaignColumns.PHONE__c 			= true;
				campaignColumns.SALUTATION__c  		= true;
				campaignColumns.TITLE__c 			= true;
	    		campaignColumns.OWNER__c 			= true;
	    		upsert campaignColumns;
			}
			
			Boolean showTitle = !campaignColumns.TITLE__c;

		  	CampaignCallDownSettingsController ccsc = new CampaignCallDownSettingsController();		  	
		  	
		  	System.assert(ccsc.getColumnSettingsList()[0].cValue == !showTitle);
		  	
		  	PageReference p = ccsc.saveSettings();
		  	
			

	}
	
	static testMethod void testLackingOnesFlow() {
		  	
		  	CampaignColumns__c campaignColumns = CampaignColumns__c.getInstance();
			
			if(campaignColumns == null){
				campaignColumns = new CampaignColumns__c();
				campaignColumns.ADDRESS__c 			= true;
				campaignColumns.COMPANY__c 			= true;
				campaignColumns.EMAIL__c 			= true;
				campaignColumns.PHONE__c 			= true;
				campaignColumns.SALUTATION__c  		= true;
				campaignColumns.TITLE__c 			= true;
	    		campaignColumns.OWNER__c 			= true;
	    		upsert campaignColumns;
			}
		  	
		  	String backPage = '/ouch';
		  	Apexpages.currentPage().getParameters().put('var', backPage);
		  	
		  	CampaignCallDownSettingsController ccsc = new CampaignCallDownSettingsController();	
		  	
		  	System.assertEquals(ccsc.backPage,backPage);
		  	PageReference p = ccsc.saveSettings();
		  	
	}
}