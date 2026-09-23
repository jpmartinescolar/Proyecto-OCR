/*
*   @Class : CI_GenerateXMLSepaFlow
*
*   @Author             :   José Ernesto <jose@calibre360.io>
*   @Created            :   25 ene 2024
*   @Description        :   Método que se llamma desde el botón "Generar SEPA" en la ficha de detalle de los registros Remesa
*/
global with sharing class CI_GenerateXMLSepaFlow {
    @InvocableMethod(label='Generar XML SEPA' description='Generar XML SEPA')
    public static List<string> startProcessFromFlow(List<FlowInputs> inputParams) {
        List<string> flowResponse                   = new List<string>();
       
        System.savePoint sp = Database.setSavePoint();
        try {
            CI_Remesa__c iRemesa = [SELECT Id
                                    FROM CI_Remesa__c
                                    WHERE Id =:inputParams[0].idRemesa
                                    LIMIT 1];
 
 
            Integer batchSize = Integer.valueOf(CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_XML_SEPA).CI_BatchSize__c);
            CI_GenerateXMLFileBySEPABatch iBatch = new CI_GenerateXMLFileBySEPABatch(iRemesa.Id);
           
            Database.executeBatch(iBatch, batchSize);
       
            flowResponse.add('El proceso se ha iniciado. Espere unos minutos antes de poder ver el resultado.');
        }
        catch (Exception e) {
            Database.rollback(sp);
 
 
            String data = 'STACK TRACE:\n' + e.getStackTraceString() + '\nMESSAGE:\n' + e.getMessage() + '\nLine:\n' + e.getLineNumber();
            flowResponse.add(data);
        }
 
 
        return flowResponse;
    }
    global class FlowInputs {
        @InvocableVariable
        public String idRemesa;
    }
}