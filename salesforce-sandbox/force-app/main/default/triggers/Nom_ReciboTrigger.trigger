trigger Nom_ReciboTrigger on Nom_Recibo__c (before delete) {
    if (Trigger.isBefore && Trigger.isDelete) {
        Nom_TriggerHandler.cascadeDeleteLineas(Trigger.old);
    }
}