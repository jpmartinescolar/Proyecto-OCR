/**
*@Author 		Miguel Soares de Lima
*@Created date	4/28/2010
*/
public with sharing class CampaignCallDownSettingsController{

	private List<ColumnSettings> columnSettingsList;
	private CampaignColumns__c campaignColumns;
	public string backPage{ get; set; }
	
	/**
	*Constructor
	*/
	public CampaignCallDownSettingsController(){
		
		columnSettingsList = new ColumnSettings[]{};
		if( Apexpages.currentPage().getParameters().get( 'var' ) != null )
			backPage=Apexpages.currentPage().getParameters().get( 'var' );
		else
			backpage='/';
		  
		campaignColumns = CampaignColumns__c.getInstance();
		columnSettingsList.add( new ColumnSettings( 'Title', 			campaignColumns == null ? false : campaignColumns.TITLE__c ));
		columnSettingsList.add( new ColumnSettings( 'Company', 		campaignColumns == null ? false : campaignColumns.COMPANY__c ));
		columnSettingsList.add( new ColumnSettings( 'Phone', 			campaignColumns == null ? false : campaignColumns.PHONE__c ));
		columnSettingsList.add( new ColumnSettings( 'Email', 			campaignColumns == null ? false : campaignColumns.EMAIL__c ));
		columnSettingsList.add( new ColumnSettings( 'Fax', 			campaignColumns == null ? false : campaignColumns.FAX__c ));
		columnSettingsList.add( new ColumnSettings( 'Salutation', 	campaignColumns == null ? false : campaignColumns.SALUTATION__c ));
		columnSettingsList.add( new ColumnSettings( 'Owner', 			campaignColumns == null ? false : campaignColumns.OWNER__c ));
		columnSettingsList.add( new ColumnSettings( 'Address', 		campaignColumns == null ? false : campaignColumns.ADDRESS__c ));
	} 

	/**
	* Save settings
	*
	* @return 	a page reference to return to the original page
	*/
	public PageReference saveSettings(){
			
			if (campaignColumns == null) {
				campaignColumns = CampaignColumns__c.getInstance();
				
				if (campaignColumns == null) {
					campaignColumns = new CampaignColumns__c();
				}
			}
			
			if (campaignColumns.SetupOwnerId != Userinfo.getUserId()) {
				campaignColumns.Id = null;
				campaignColumns.SetupOwnerId = Userinfo.getUserId();
			}
		
			campaignColumns.ADDRESS__c 			= columnSettingsList[ 7 ].cValue;
			campaignColumns.COMPANY__c 			= columnSettingsList[ 1 ].cValue;
			campaignColumns.EMAIL__c 			= columnSettingsList[ 3 ].cValue;
			campaignColumns.PHONE__c 			= columnSettingsList[ 2 ].cValue;
			campaignColumns.FAX__c 			    = columnSettingsList[ 4 ].cValue;
			campaignColumns.SALUTATION__c  		= columnSettingsList[ 5 ].cValue;
			campaignColumns.TITLE__c 			= columnSettingsList[ 0 ].cValue;
	    	campaignColumns.OWNER__c 			= columnSettingsList[ 6 ].cValue;

			
     		 upsert campaignColumns;
		
		return new PageReference( backPage );
	}
	
  	/**
  	*Get columns settings
  	*@return columnSettingsList
  	*/
	public List<ColumnSettings> getcolumnSettingsList(){
		return columnSettingsList;
	}
  
	/**
	*@Author 		Miguel Soares de Lima
	*@Created date	4/28/2010
	*/
	public class  ColumnSettings{
  		public String cName{ get; set; }
  		public boolean cValue{ get; set; }
  	
	    /**
	    *constructor
	    */
	    public ColumnSettings( string colName, boolean colValue ){
	      	cName=colName;
	     	cValue=colValue;
	    }	
	}

}