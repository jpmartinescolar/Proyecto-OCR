trigger RHX_Contrato_club_de_innovaci_n on Contrato_club_de_innovaci_n__c
    (after delete, after insert, after undelete, after update, before delete) {
  	 Type rollClass = System.Type.forName('rh2', 'ParentUtil');
	 if(rollClass != null) {
		rh2.ParentUtil pu = (rh2.ParentUtil) rollClass.newInstance();
		if (trigger.isAfter) {
			pu.performTriggerRollups(trigger.oldMap, trigger.newMap, new String[]{'Contrato_club_de_innovaci_n__c'}, null);
    	}
    }
}