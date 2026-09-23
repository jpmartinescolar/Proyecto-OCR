@IsTest
private class ParseDocumentJsonInvocableTest {

    @IsTest
    static void processJsonUpdatesDeedAndReturnsSuccess() {
        Contact contactRecord = new Contact(LastName = 'Test Contact', Departamento__c='Administración');
        insert contactRecord;

        Deed__c deedRecord = new Deed__c();
        insert deedRecord;

        ParseDocumentJsonInvocable.Request request =
            new ParseDocumentJsonInvocable.Request();
        request.jsonString = 'AI-generated document summary';
        request.recordId = contactRecord.Id;
        request.deedRecordId = deedRecord.Id;

        Test.startTest();
        List<ParseDocumentJsonInvocable.Response> responses =
            ParseDocumentJsonInvocable.processJson(
                new List<ParseDocumentJsonInvocable.Request>{ request }
            );
        Test.stopTest();

        System.assertEquals(1, responses.size());
        System.assertEquals('Success', responses[0].status);
        System.assertEquals('JSON processed successfully.', responses[0].message);
        System.assertEquals(contactRecord.Id, responses[0].recordId);

        Deed__c updatedDeed = [
            SELECT Contact__c, Description__c, Is_Generated_by_AI__c
            FROM Deed__c
            WHERE Id = :deedRecord.Id
        ];
        System.assertEquals(contactRecord.Id, updatedDeed.Contact__c);
        System.assertEquals(request.jsonString, updatedDeed.Description__c);
        System.assertEquals(true, updatedDeed.Is_Generated_by_AI__c);
    }

    @IsTest
    static void processJsonReturnsErrorForInvalidDeedId() {
        ParseDocumentJsonInvocable.Request request =
            new ParseDocumentJsonInvocable.Request();
        request.jsonString = 'Summary';
        request.recordId = null;
        request.deedRecordId = 'invalid-id';

        Test.startTest();
        List<ParseDocumentJsonInvocable.Response> responses =
            ParseDocumentJsonInvocable.processJson(
                new List<ParseDocumentJsonInvocable.Request>{ request }
            );
        Test.stopTest();

        System.assertEquals(1, responses.size());
        System.assertEquals('Error', responses[0].status);
        System.assertNotEquals(null, responses[0].message);
    }
}