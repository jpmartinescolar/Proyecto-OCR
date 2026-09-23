trigger Nom_ConceptoTrigger on Nom_Concepto__c (before insert, before update) {
    Nom_TriggerHandler.poblarClaveUnica(Trigger.new);
}