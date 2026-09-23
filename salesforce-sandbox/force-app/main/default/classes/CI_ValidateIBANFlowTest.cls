/*
*   @Class          :   CI_ValidateIBANFlowTest
*
*   @Author         :   Julián Martínez Cordones <julian@calibre360.io>
*   @Created        :   2025-01-06
*   @Description    :   Class CI_ValidateIBANFlowTest
*
*   Modification Log
*   --------------------------------------------------------------------------------------
*   #       Developer                           Date                    Description
*   --------------------------------------------------------------------------------------
*   1       Julián Martínez Cordones            2025-01-06      	    Creation           
*
*/

@IsTest
public class CI_ValidateIBANFlowTest {
    
    @IsTest
    static void testValidIBANFlow() {

        List<String> validIbans = new List<String>{
            'GB82WEST12345698765432', // UK IBAN
            'DE89370400440532013000', // German IBAN
            'FR1420041010050500013M02606' // French IBAN
        };
        
        List<String> results = CI_ValidateIBANFlow.validateIBANFlow(validIbans);
        
        for (String result : results) {
            System.assertEquals('OK', result, 'Expected OK for valid IBAN');
        }
    }
    
    @IsTest
    static void testInvalidIBANFlow() {
        List<String> invalidIbans = new List<String>{
            'GB82WEST12345698765433', // Altered UK IBAN
            'DE89370400440532013001'  // Altered German IBAN
        };
        
        List<String> results = CI_ValidateIBANFlow.validateIBANFlow(invalidIbans);
        
        for (String result : results) {
            System.assertEquals(null, result, 'Expected NULL for invalid IBAN');
        }
    }

    @IsTest
    static void testMixedIBANFlow() {
        List<String> mixedIbans = new List<String>{
            'GB82WEST12345698765432', // Valid UK IBAN
            'DE89370400440532013001', // Invalid German IBAN
            'FR1420041010050500013M02606', // Valid French IBAN
            'GB82WEST12345698765433' // Invalid UK IBAN
        };
        
        List<String> results = CI_ValidateIBANFlow.validateIBANFlow(mixedIbans);
        
        System.assertEquals('OK', results[0], 'Expected OK for valid IBAN');
        System.assertEquals(null, results[1], 'Expected NULL for invalid IBAN');
        System.assertEquals('OK', results[2], 'Expected OK for valid IBAN');
        System.assertEquals(null, results[3], 'Expected NULL for invalid IBAN');
    }
}