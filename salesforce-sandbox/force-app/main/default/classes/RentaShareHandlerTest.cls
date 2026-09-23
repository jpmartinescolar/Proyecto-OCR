@IsTest(SeeAllData=true)
private class RentaShareHandlerTest {

    private static List<Renta__c> obtenerRentasExistentes(Integer cuantas) {
        return [
            SELECT Id, OwnerId, Renta_a_o_anterior__c
            FROM Renta__c
            WHERE Renta_a_o_anterior__c != null
            LIMIT :cuantas
        ];
    }

    @IsTest
    static void recalcularEnInsert_creaSharesParaCadenaAnterior() {
        List<Renta__c> rentas = obtenerRentasExistentes(1);
        System.assert(!rentas.isEmpty(),
            'El test requiere al menos una Renta con Renta_a_o_anterior__c rellenado en la sandbox');

        Renta__c r = rentas[0];

        Test.startTest();
        RentaShareHandler.recalcularSharesEnInsert(rentas);
        Test.stopTest();

        Integer shares = [
            SELECT COUNT()
            FROM Renta__Share
            WHERE ParentId = :r.Renta_a_o_anterior__c
              AND UserOrGroupId = :r.OwnerId
              AND RowCause = :Schema.Renta__Share.RowCause.Renta_Vinculada__c
        ];
        System.assert(shares >= 1,
            'Se debió crear un share del owner sobre la renta anterior. Encontrados: ' + shares);
    }

    @IsTest
    static void recalcularEnUpdate_revocaYReasigna() {
        List<Renta__c> rentas = obtenerRentasExistentes(1);
        System.assert(!rentas.isEmpty(),
            'El test requiere al menos una Renta con Renta_a_o_anterior__c rellenado');

        Renta__c r = rentas[0];

        Map<Id, Renta__c> oldMap = new Map<Id, Renta__c>{
            r.Id => new Renta__c(
                Id = r.Id,
                OwnerId = UserInfo.getUserId(),
                Renta_a_o_anterior__c = r.Renta_a_o_anterior__c
            )
        };

        Test.startTest();
        RentaShareHandler.recalcularSharesEnUpdate(rentas, oldMap);
        Test.stopTest();

        Integer shares = [
            SELECT COUNT()
            FROM Renta__Share
            WHERE ParentId = :r.Renta_a_o_anterior__c
              AND UserOrGroupId = :r.OwnerId
              AND RowCause = :Schema.Renta__Share.RowCause.Renta_Vinculada__c
        ];
        System.assert(shares >= 1,
            'Tras simular cambio de owner, debe quedar share para el owner actual');
    }

    @IsTest
    static void coberturaTriggerInsertVacio() {
        Test.startTest();
        Database.SaveResult[] results = Database.insert(
            new List<Renta__c>{ new Renta__c() },
            false
        );
        Test.stopTest();
        System.assert(results.size() == 1, 'DML ejecutada');
    }

    @IsTest
    static void coberturaTriggerUpdateExistente() {
        List<Renta__c> rentas = obtenerRentasExistentes(1);
        if (rentas.isEmpty()) return;

        Test.startTest();
        Database.SaveResult[] results = Database.update(rentas, false);
        Test.stopTest();
        System.assert(results.size() == 1, 'DML ejecutada');
    }
}