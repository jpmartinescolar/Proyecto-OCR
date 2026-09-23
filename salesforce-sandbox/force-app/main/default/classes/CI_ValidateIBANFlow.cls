/*
*   @Class          :   CI_ValidateIBANFlow
*
*   @Author         :   Julián Martínez Cordones <julian@calibre360.io>
*   @Created        :   2025-01-06
*   @Description    :   Class CI_ValidateIBANFlow
*
*   Modification Log
*   --------------------------------------------------------------------------------------
*   #       Developer                           Date                    Description
*   --------------------------------------------------------------------------------------
*   1       Julián Martínez Cordones            2025-01-06      	    Creation           
*
*/

global class CI_ValidateIBANFlow {

    @InvocableMethod(label = 'Validar IBAN' description = 'Valida si un nº IBAN es correcto o no')
    global static List<String> validateIBANFlow(List<String> ibansList) {
        List<String> results = new List<String>();

        for (String ibanFlowInput : ibansList) {
            Boolean isvalid = CI_ValidationUtils.validateIban(ibanFlowInput);
            String result = isvalid ? 'OK' : NULL;

            results.add(result);
        }

        return results;
    }

    global class IBANFlowInput {
        @InvocableVariable
        public String iban;
    }
}