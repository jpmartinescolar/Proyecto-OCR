@IsTest
private class DocumentTypeParserActionTest {

    @IsTest
    static void parseDocumentTypeReturnsNoResponseForBlankInput() {
        DocumentTypeParserAction.Request request =
            new DocumentTypeParserAction.Request();
        request.jsonInput = '';

        Test.startTest();
        List<DocumentTypeParserAction.Response> responses =
            DocumentTypeParserAction.parseDocumentType(
                new List<DocumentTypeParserAction.Request>{ request }
            );
        Test.stopTest();

        System.assertEquals(0, responses.size());
    }

    @IsTest
    static void parseDocumentTypeHandlesUnknownDocumentType() {
        DocumentTypeParserAction.Request request =
            new DocumentTypeParserAction.Request();
        request.jsonInput =
            '```json' +
            '{"documentType":"Unknown","skill":[]}' +
            '```';

        Test.startTest();
        List<DocumentTypeParserAction.Response> responses =
            DocumentTypeParserAction.parseDocumentType(
                new List<DocumentTypeParserAction.Request>{ request }
            );
        Test.stopTest();

        System.assertEquals(0, responses.size());
    }

    @IsTest
    static void parseDocumentTypePropagatesPromptExecutionError() {
        DocumentTypeParserAction.Request request =
            new DocumentTypeParserAction.Request();
        request.jsonInput = JSON.serialize(new Map<String, Object>{
            'documentType' => 'Supported_Type',
            'promptTemplateName' =>
                'Definitely_Missing_Template_For_Unit_Test',
            'summary' => 'Test summary',
            'skill' => new List<Object>{ null }
        });

        Boolean exceptionThrown = false;

        Test.startTest();
        try {
            DocumentTypeParserAction.parseDocumentType(
                new List<DocumentTypeParserAction.Request>{ request }
            );
        } catch (Exception ex) {
            exceptionThrown = true;
        }
        Test.stopTest();

        System.assertEquals(
            true,
            exceptionThrown,
            'Errors from the downstream prompt execution should be propagated.'
        );
    }
}