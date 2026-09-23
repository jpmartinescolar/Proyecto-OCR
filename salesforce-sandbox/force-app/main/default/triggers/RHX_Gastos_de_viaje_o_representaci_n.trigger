trigger RHX_Gastos_de_viaje_o_representaci_n on Gastos_de_viaje_o_representaci_n__c
    (after delete, after insert, after undelete, after update, before delete) {
  	 Type rollClass = System.Type.forName('rh2', 'ParentUtil');
	 if(rollClass != null) {
		rh2.ParentUtil pu = (rh2.ParentUtil) rollClass.newInstance();
		if (trigger.isAfter) {
			pu.performTriggerRollups(trigger.oldMap, trigger.newMap, new String[]{'Gastos_de_viaje_o_representaci_n__c'}, null);
    	}
    }
}