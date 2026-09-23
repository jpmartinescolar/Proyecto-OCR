trigger Nom_ContratoTrigger on Nom_Contrato__c (before insert, before update) {
    Nom_TriggerHandler.validarConvenioContrato(Trigger.new);
}