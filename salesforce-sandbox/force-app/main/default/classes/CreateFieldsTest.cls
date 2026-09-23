@IsTest
private class CreateFieldsTest {

    @IsTest
    static void fieldsCreatesStructuredDataFromFencedJson() {
        Deed__c deedRecord = new Deed__c();
        insert deedRecord;

        String jsonBody =
            '```json' +
            '[{"campo":"Amount","valor":"1000"},' +
            '{"campo":"Currency","valor":"EUR"}]' +
            '```';

        Test.startTest();
        CreateFields.fields(jsonBody, deedRecord.Id);
        Test.stopTest();

        List<Datos_estructurados__c> createdRecords = [
            SELECT Name, Valor__c, Escritura__c
            FROM Datos_estructurados__c
            WHERE Escritura__c = :deedRecord.Id
        ];
        System.assertEquals(2, createdRecords.size());

        Map<String, Datos_estructurados__c> recordsByName =
            new Map<String, Datos_estructurados__c>();
        for (Datos_estructurados__c createdRecord : createdRecords) {
            recordsByName.put(createdRecord.Name, createdRecord);
            System.assertEquals(deedRecord.Id, createdRecord.Escritura__c);
        }

        System.assertEquals('1000', recordsByName.get('Amount').Valor__c);
        System.assertEquals('EUR', recordsByName.get('Currency').Valor__c);
    }

    @IsTest
    static void fieldsPropagatesInvalidJsonError() {
        Boolean exceptionThrown = false;

        Test.startTest();
        try {
            CreateFields.fields('not valid JSON', null);
        } catch (JSONException ex) {
            exceptionThrown = true;
        }
        Test.stopTest();

        System.assertEquals(
            true,
            exceptionThrown,
            'Invalid JSON should result in a parsing exception.'
        );
    }
}