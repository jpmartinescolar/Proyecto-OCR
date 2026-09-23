/**

Last update 2010-07-15
labs@salesforce.com

* with sharing added
* squashed bugs around single / multiple updates
* added limits to SOQL -- 100 for Campaigns 1000 for Campaign Members
* fixed custom settings manager
* updated Static Resources 

*/
public with sharing class CampaignCallDownController{
	
	//setup appropriate variables
	private Boolean 			hasCampaignID = false;
	private string 				thisCampaign;
  	private Lead[] 				lead; 
  	private Contact[] 			contact;
	private CampaignMember[] 	members; //the members for that campaign
	private Lead[] 				relevantLeads; 
	private List<leadPlusTaskPlusContact> 	leadPlusTasks;
	private Map<String, Boolean> 			callDownColumns;	
	private List<Campaign> 		activeCampaigns;
	public String 				camp { get;set; } //campaign ID
	public String 				status{ get;set; } //status ID
	private Map<String, String> cStatusMap;
	private boolean 			cStatusMapIsSet;
	public string 				campBackup;
	public string 				backRef{ get; set; }
	public list<SelectOption> 	owners;
	public string 				ownerId{ get; set; }

	
	/**
	*Constructor
	*/
	public CampaignCallDownController(){
		
		relevantLeads = new Lead[ 0 ];
		leadPlusTasks = new leadPlusTaskPlusContact[]{};
		callDownColumns = new Map<String, Boolean>();
		
		//get columns settings and set to Map
		if( ApexPages.currentPage().getUrl() != null ){
		  	camp = ApexPages.currentPage().getUrl().substring( 1 );
		}
		campBackup = camp;
		backRef = '/apex/CampaignCallDownSettings?var=/' + camp;
		cStatusMap = new Map<String, String>();
		cStatusMapIsSet = false;
		owners = new list<SelectOption>();
	}
	
	/**
	*Return if has campaign id
	*@return hasCampaignID boolean flag
	*/
	public Boolean gethasCampaignID(){
		return hasCampaignID;
	}
	
	/**
	*Return the list of owners
	*@return owners
	*/
	public List<SelectOption> getowners(){
		return owners;
	}
	
	public void setowners( List<SelectOption> l ){
		owners = l;
	}
	
	/**
	*Update all status and log , retuen page reference for redirection
	*@return null
	*/
	public PageReference updateAll(){
		List<leadPlusTaskPlusContact> cleanRecords = new List<leadPlusTaskPlusContact>();
	
	 	 for( leadPlusTaskPlusContact current :leadPlusTasks ){
	 	  //status
	 	  boolean updated = false;
	 	  if(current.statusUpdate != null && current.statusUpdate != current.memStatus){
		    //update status
		    CampaignMember cm = [Select Id, Status From CampaignMember Where id = :current.MemberId limit 1];
		    cm.status = current.statusUpdate;
		    update cm;
		    
		    updated = true;
		  }
		  if (updated || (current.t.Description != '' && current.t.Description != null)) {
		  //log a call
			current.t.Subject = 'Call--Campaign: '+this.getCampaignName();
			insert current.t;
			updated = true;
		  }
		  if (!updated) {
		  	cleanRecords.add(current);
		  }		 

		 } 
		 leadPlusTasks = cleanRecords;
	 	return null;
	}
	
	/**
	*Filter Owners for leads
	*/
	private void filterOwner(){
		if( ownerId == null || ownerId == '--ALL--' || leadPlusTasks.size() < 1 )
		  return;
		else{
			list<leadPlusTaskPlusContact> newLptList = new list<leadPlusTaskPlusContact>();
			for( leadPlusTaskPlusContact lpt : leadPlusTasks ){
				if( lpt.ownerId == ownerId )
				  newLptList.add(lpt);
			}
			leadPlusTasks = newLptList;
		}
	}
	
	/**
	*Refresh campaign list
	*@return page reference
	*/
	public PageReference campaignRefresh(){
		Map<String, String>ownerMap = new Map<String, String>();
		relevantLeads.clear(); leadPlusTasks.clear(); 
		cStatusMapIsSet = false;
		if ( camp != null && camp.length( ) >3 ){
			//set some variable values
	   		hasCampaignID = true;   		
	   		try{
		   		if( status == null || status == '--ALL--' )
		   			members = [select Id, ContactId, LeadId, Status, CampaignId, Campaign.Name,
		   			Lead.Id, Lead.Salutation, Lead.Title, Lead.Name, Lead.Company, Lead.Phone, 
		   			Lead.Street, Lead.State, Lead.PostalCode, Lead.Country, Lead.City, Lead.Fax, 
		   			Lead.Email, Lead.OwnerId, Lead.Owner.FirstName, Lead.Owner.LastName, Lead.Owner.Id,
		   			Contact.ID, Contact.AccountId, Contact.Salutation, Contact.Title, Contact.Name, 
		   			Contact.Phone, Contact.MailingStreet, Contact.MailingState, Contact.MailingPostalCode, 
		   			Contact.MailingCountry, Contact.MailingCity, Contact.Fax, Contact.Email, Contact.OwnerId,
		   			Contact.Owner.FirstName, Contact.Owner.LastName, Contact.Owner.Id, Contact.Account.name
		   			from CampaignMember where CampaignId = :camp LIMIT 1000];
	 		    else
	 		      members = [ select Id, ContactId, LeadId, Status, CampaignId, Campaign.Name,
	 		      Lead.Id, Lead.Salutation, Lead.Title, Lead.Name, Lead.Company, Lead.Phone, 
	 		      Lead.Street, Lead.State, Lead.PostalCode, Lead.Country, Lead.City, Lead.Fax, 
	 		      Lead.Email, Lead.OwnerId, Lead.Owner.FirstName, Lead.Owner.LastName, Lead.Owner.Id,
	          Contact.ID, Contact.AccountId, Contact.Salutation, Contact.Title, Contact.Name, 
	          Contact.Phone, Contact.MailingStreet, Contact.MailingState, Contact.MailingPostalCode,
	           Contact.MailingCountry, Contact.MailingCity, Contact.Fax, Contact.Email, Contact.OwnerId,
	          Contact.Owner.FirstName, Contact.Owner.LastName, Contact.Owner.Id, Contact.Account.name
	          from CampaignMember where CampaignId = :camp and Status = :status LIMIT 1000];
	   		}catch( Exception e ){
	   			ApexPages.addMessages( e );
	   		}
	        if( members.size() > 0 ) 			
	 			thisCampaign = members[ 0 ].Campaign.Name;
	 		else
	 			thisCampaign ='';
	 			    
	 			//loop through all leads, add relevent leads and their status
	 		for ( CampaignMember m : members ){
		        leadPlusTaskPlusContact lpt = new leadPlusTaskPlusContact( m, getcStatusMap( camp ), camp );
		        leadPlusTasks.add( lpt );
		        ownerMap.put( lpt.ownerId, lpt.ownerFirstName + ' ' + lpt.ownerLastName );
	 		}
	 			
			//set owners
	 		owners = ownerMapToSelectOption( ownerMap );
	     	//filter for owner
	     	filterOwner();
	 		if( leadPlusTasks.size() > 1 )
	    		quickSort( 'NAME',0, leadPlusTasks.size()-1 );
 		}else{ 
 			hasCampaignID=false;
 			camp=this.campBackup;
 		}
 		return null;
	}
	
	/**
	*With a map of owners and return a list of select option
	*@param ownerMap
	*@return returnVal
	*/
	private List<SelectOption> ownerMapToSelectOption( Map<String, String> ownerMap ){
		List<SelectOption> returnVal=new List<SelectOption>();
		Set<String> keys = new Set<String>();
		keys = ownerMap.keySet();
		returnVal.add( new SelectOption( '--ALL--', '--ALL--' ));
		for ( String s: keys ){
			returnVal.add( new SelectOption(s, ownerMap.get( s )));
		}
		
		return returnVal;
	}
	
	/**
	*Sort by name
	*@return null
	*/
	public PageReference sortByName(){
		if( leadPlusTasks.size() > 1 )
     		quickSort( 'NAME',0, leadPlusTasks.size()-1 );
		return null;
	}

	/**
	*Sort by title
	*@return null
	*/
	public PageReference sortByTitle(){
	    if( leadPlusTasks.size() > 1 )
	     	quickSort( 'TITLE',0, leadPlusTasks.size()-1 );
	    return null;
	}	

	/**
	*Sort by Company
	*@return PageReference = null
	*/
	public PageReference sortByCompany(){
    	if( leadPlusTasks.size() > 1 )
     		quickSort( 'COMPANY',0, leadPlusTasks.size()-1 );
    	return null;
  	} 
  
	/**
	*Sort by Status
	*@return PageReference = null
	*/
	public PageReference sortByStatus(){
    	if( leadPlusTasks.size() > 1 )
     		quickSort( 'STATUS',0, leadPlusTasks.size()-1 );
    	return null;
    } 
  	
  	/**
  	*Implementation of Quick sort
  	*@param key
  	*@param left
  	*@param right
  	*/
	private void quickSort( String key, integer left, integer right ){
      integer index = partition( key, left, right );
      if ( left < index - 1 )
        quickSort( key, left, index - 1 );
      if (index < right )
        quickSort( key, index, right );
	}
	
	/**
	*Aux method for implement Quick Sort
  	*@param key
  	*@param left
  	*@param right
	*@return i
	*/
	private integer partition( String key, integer left, integer right ){
      integer i = left, j = right;
      leadPlusTaskPlusContact tmp;
      leadPlusTaskPlusContact pivot = leadPlusTasks[( left + right ) / 2 ];
      while ( i <= j ){
        while ( compare( key, leadPlusTasks[ i ], pivot ))
          i++;
        while ( compare( key, pivot,leadPlusTasks[ j ]))
          j--;
        if ( i <= j ){
          tmp = leadPlusTasks[ i ];
          leadPlusTasks[  i] = leadPlusTasks[ j ];
          leadPlusTasks[ j ] = tmp;
          i++;
          j--;
        }
      }
      return i;
  }
	
	/**
	*Compare 2 leads
	*@sortKey
	*leadPlusTaskPlusContact
	*leadPlusTaskPlusContact
	*@return Boolean
	*/
	private boolean compare( string sortKey, leadPlusTaskPlusContact r1, leadPlusTaskPlusContact r2 ){
	   if( sortKey=='TITLE' )
	     return r1.TITLE < r2.TITLE;
	   else if( sortKey == 'COMPANY' )
	     return r1.COMPANY < r2.COMPANY;
	   else if( sortKey == 'STATUS')
	     return r1.memStatus < r2.memStatus;
	   else 
	     return r1.NAME < r2.NAME;
	}
	
	/**
	*Return a status map
	*@param cId
	*@return cStatusMap
	*/
	public Map<String,String> getcStatusMap( string cId ){
		if( !cStatusMapIsSet ){
		   	CampaignMemberStatus[] cStatus = [ Select Label From CampaignMemberStatus where campaignId =: cId ]; 
        	cStatusMap.clear();
       	 	for ( CampaignMemberStatus s:cStatus )
        		cStatusMap.put( s.Label, '' );
        	cStatusMapIsSet = true;
		}  
		return cStatusMap;
	}
	
	/**
	*Return campaign items
	*@return options
	*/
	public List<SelectOption> getcampaignItems(){
		List<SelectOption> options = new List<SelectOption>();
		options.add(new SelectOption( '1', 'SELECT' ));
		for( Campaign c:getactiveCampaigns()){
			options.add( new SelectOption( c.ID, c.Name ));
		}
		return options;
	}
   
    /**
    *Return status items option list 
    *@return options
    */
	public List<Selectoption> getstatusItems(){
		List<SelectOption> options = new List<SelectOption>();
		options.add( new SelectOption( '--ALL--', '--ALL--' ));
		if ( camp == null || camp == '1' ){
			return options;
			}
		else	{
			for ( String k : getcStatusMap( camp ).keySet())
				options.add( new SelectOption( k, k ));
			return options;
		}
			 
	}

	/**
	*Return a list of campaigns options
	*@return activeCampaigns
	*/
	public List<Campaign> getactiveCampaigns(){
		if( activeCampaigns == null ){
			activeCampaigns = [ Select Name, Id From Campaign where isActive = true order by name LIMIT 100];
		}
		return activeCampaigns;
	}
	
	/**
	*Return the name
	*@retutn callDownColumns.get('Name')
	*/
	public Boolean getName(){
		return callDownColumns.get( 'Name' );
	}
	
	/**
	*Return the campaign name
	*/
	public String getCampaignName(){
		if ( hasCampaignID ){
			return thisCampaign;
		} else{
			return 'All Leads';
		}	
	}
		
	/**
	*Return lead Plus Task
	*/
	public List<leadPlusTaskPlusContact> getLeadPlusTasks(){
		return leadPlusTasks;	
	}

	
	/**
	* Inner class to wrap Lead or Contact sobject.
	*/
	public class leadPlusTaskPlusContact{
		//variable for each piece of the combined record

		public Task t;
		public String memStatus      {get; set;}
		public Map<String, String> localCStatusMap;
		public string ID             {get; set;}
		public string NAME           {get; set;}
		public string TITLE          {get; set;}
		public string SALUTATION     {get; set;}
		public string PHONE          {get; set;}
		public string COMPANY        {get; set;}
		public boolean isAContact    {get; set;}
		public string cORl           {get; set;}
		public string statusUpdate   {get; set;}
		public string memberID       {get; set;}
		public string ADDRESS        {get; set;}
		public string EMAIL          {get; set;}
		public string FAX            {get; set;}
		public string ownerFirstName {get; set;}
		public string ownerLastName  {get; set;}
		public string ownerId        {get; set;}
	    public string accountName    {get; set;}
	    public string callType       {get; set;}
	
		/**
		*Constructor
		*@param m is a campaign member
		*@param statusMap a map of atatuses
		*@param camp id of campaign
		*/	
	    public leadPlusTaskPlusContact( CampaignMember m, Map<String, String> statusMap, string camp ){
	       	if ( m.Lead.id != null ){
				cORl = 'lead';
				//l=incomingLead;
				ID = m.Lead.Id;
				NAME = m.Lead.Name;
				TITLE = m.Lead.Title;
				SALUTATION=m.Lead.Salutation;
				PHONE = m.Lead.Phone;
				COMPANY = m.Lead.Company;
				if( m.Lead.Street != null ){
					ADDRESS = m.Lead.Street + '<br>';
				 	if(m.Lead.City != null){
				 		ADDRESS += ', ' +m.Lead.City;
				 	}
				 	if(m.Lead.State != null){
				 		ADDRESS += ', ' +m.Lead.State;
				 	}
				 	if(m.Lead.PostalCode != null){
				 		ADDRESS += ', ' +m.Lead.PostalCode;
				 	}
				 	if(m.Lead.Country != null){
				 		ADDRESS += '<br>'+m.Lead.Country;
				 	}
				}	
				else
				  	ADDRESS=' ';
				 
					if(m.Lead.Email != null){
						EMAIL = '<a href="mailto:' + m.Lead.Email+'">' + m.Lead.Email + ' </a>';	
					}else{
						EMAIL =' ';
					}
					FAX=m.Lead.Fax;
					ownerFirstName = m.Lead.Owner.FirstName; ownerLastName = m.Lead.Owner.LastName; 
		       		ownerId = m.Lead.OwnerId; 
			}else{
				cORl = 'contact';
	       
		       	if( m.Contact.MailingStreet != null ){
		       		ADDRESS = m.Contact.MailingStreet + '<br>';
		       		if(m.Contact.MailingCity != null){
		       			ADDRESS += ', '+m.Contact.MailingCity;
		       		}
		       		if(m.Contact.MailingState != null){
		       			ADDRESS += ', '+m.Contact.MailingState;
		       		}
		       		if(m.Contact.mailingPostalCode != null){
		       			ADDRESS += ', '+m.Contact.mailingPostalCode;
		       		}
		       		if(m.Contact.MailingCountry != null){
		       			ADDRESS += '<br>' + m.Contact.MailingCountry;
		       		}
		       }else{
		       		ADDRESS = ' ';
		       }
		        
		       ID 				= m.Contact.Id;
		       NAME 			= m.Contact.Name;
		       TITLE 			= m.Contact.Title;
		       SALUTATION		= m.Contact.Salutation;
		       PHONE 			= m.Contact.Phone;
		       if(m.Contact.Email != null){
		       		EMAIL = '<a href="mailto:' + m.Contact.Email + '">' + m.Contact.Email + '</a>';		
		       }else{
		       		EMAIL = ' ';
		       }
		       
		       FAX				= m.Contact.Fax;
		       ownerFirstName 	= m.Contact.Owner.FirstName; ownerLastName = m.Contact.Owner.LastName; 
		       ownerId 			= m.Contact.OwnerId;
		       if ( m.Contact.Account.name != null )
		        	COMPANY = m.Contact.Account.name;
		       else
		          COMPANY = '';
			}
			t = new Task();
			t.ActivityDate = System.today();
			t.WhoId = ID;
			t.Status = 'Completed';
			t.Subject = '';
			t.Description = '';
			if ( m.Lead.id == null ){
				t.WhatId = camp;
			}
			memberID = m.ID;
			memStatus = m.Status;
			localCStatusMap = statusMap;
		}

		/**
		*Return a task
		*@return t
		*/
	    public Task gett(){
	    	return t;
	    }
	    
		/**
		*Set the task propertie
		*@param tsk
		*/
		public Void sett( Task tsk ){
			t = tsk;
		}
		
		/**
		*Return member status
		*@return memStatus
		*/
		public String getmemStatus(){
			return memStatus;
		}

		/**
		*Return a list of members status values
		*/
	    public List<SelectOption> getmemStatusValue(){
	        List<SelectOption> options = new List<SelectOption>();
	        options.add( new SelectOption( memStatus, memStatus )); 
	        for( String k: localCStatusMap.keySet()){
	      		if( k != memStatus )
	      	 		options.add( new SelectOption( k, k ));
	      	}
	    	return options;
  		}
   
	}
}