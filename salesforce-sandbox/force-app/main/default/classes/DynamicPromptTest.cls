@IsTest
private class DynamicPromptTest {

    @IsTest
    static void executePromptTemplatePropagatesConnectApiError() {
        Boolean exceptionThrown = false;

        Test.startTest();
        try {
            DynamicPrompt.executePromptTemplate(
                '069000000000001AAA',
                'Definitely_Missing_Template_For_Unit_Test',
                'a00000000000001AAA',
                'a01000000000001AAA',
                '003000000000001AAA'
            );
        } catch (Exception ex) {
            exceptionThrown = true;
        }
        Test.stopTest();

        System.assertEquals(
            true,
            exceptionThrown,
            'DynamicPrompt should propagate errors from the Connect API.'
        );
    }
}