trigger RentaShareTrigger on Renta__c (after insert, after update) {
    if (Trigger.isAfter) {
        if (Trigger.isInsert) {
            RentaShareHandler.recalcularSharesEnInsert(Trigger.new);
        } else if (Trigger.isUpdate) {
            RentaShareHandler.recalcularSharesEnUpdate(Trigger.new, Trigger.oldMap);
        }
    }
}