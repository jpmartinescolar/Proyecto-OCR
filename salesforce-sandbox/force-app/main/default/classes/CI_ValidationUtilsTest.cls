/*
*   @Class          :   CI_ValidationUtilsTest
*
*   @Author         :   Julián Martínez Cordones <julian@calibre360.io>
*   @Created        :   2025-01-06
*   @Description    :   Class CI_ValidationUtilsTest
*
*   Modification Log
*   --------------------------------------------------------------------------------------
*   #       Developer                           Date                    Description
*   --------------------------------------------------------------------------------------
*   1       Julián Martínez Cordones            2025-01-06      	    Creation           
*
*/

@IsTest
public class CI_ValidationUtilsTest {
    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    @isTest
    static void testValidIban() {
        // Example of a valid IBAN
        String validIban1 = 'GB82WEST12345698765432'; // UK IBAN
        String validIban2 = 'DE89370400440532013000'; // German IBAN
        String validIban3 = 'FR1420041010050500013M02606'; // French IBAN

        // Call the validateIban method and assert that the IBANs are valid
        System.assert(CI_ValidationUtils.validateIban(validIban1), 'Expected valid IBAN for validIban1');
        System.assert(CI_ValidationUtils.validateIban(validIban2), 'Expected valid IBAN for validIban2');
        System.assert(CI_ValidationUtils.validateIban(validIban3), 'Expected valid IBAN for validIban3');
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    @isTest
    static void testInvalidIban() {
        // Example of an invalid IBAN
        String invalidIban1 = 'GB82WEST12345698765433'; // Altered UK IBAN (last digit changed)
        String invalidIban2 = 'DE89370400440532013001'; // Altered German IBAN (last digit changed)

        // Call the validateIban method and assert that the IBANs are invalid
        System.assert(!CI_ValidationUtils.validateIban(invalidIban1), 'Expected invalid IBAN for invalidIban1');
        System.assert(!CI_ValidationUtils.validateIban(invalidIban2), 'Expected invalid IBAN for invalidIban2');
    }

    @isTest
    public static void testTest(){
        CI_ValidationUtils.cober();
    }
}