/*
*   @Class : CI_GenerateDataModelRemesaFlow
*
*   @Author             :   José Ernesto <jose@calibre360.io>
*   @Created            :   18 ene 2024
*   @Description        :   Método que se llama desde el botón "Generar Remesa" en la ficha de detalle de los registros Gestor de Proceso
*/
global with sharing class CI_GenerateDataModelRemesaFlow {
    @InvocableMethod(label='Generar estructura de Remesa' description='Generar estructura de Remesa')
    public static List<string> startProcessFromFlow(List<FlowInputs> inputParams) {
        List<string> flowResponse                   = new List<string>();
        Map<String, String> mRemesaByEmpresaTitular = new Map<String, String>();
        List<CI_Remesa__c> lRemesasToInsert         = new List<CI_Remesa__c>();
       
        System.savePoint sp = Database.setSavePoint();
        try {
            CI_GestorProcesos__c iProcess = [SELECT Id,CI_Estado__c,
                                                CI_FilterEmpresasTitulares__c,CI_FilterEstados__c,
                                                CI_FilterFechaDesde__c,CI_FilterFechaHasta__c
                                                FROM CI_GestorProcesos__c
                                                WHERE Id =:inputParams[0].idProceso
                                                LIMIT 1];
           
            if(iProcess.CI_Estado__c != CI_GestorProcesos.ESTADO_CREADO){
                flowResponse.add('Un proceso sólo puede ser iniciado si su estado es Creado.');
                return flowResponse;
            }
            //Actualizamos el estado del proceso para que se sepa que se ha iniciado el proceso
            iProcess.CI_Estado__c = CI_GestorProcesos.ESTADO_EN_PROCESO;
            update iProcess;
                                               
            List<String> empresasTitulares  = iProcess.CI_FilterEmpresasTitulares__c.split(';');
            List<String> estados            = iProcess.CI_FilterEstados__c.split(';');
           
            for(String iEmp: empresasTitulares){
                CI_Remesa__c iNewRemesa         = new CI_Remesa__c();
                iNewRemesa.CI_GestorProceso__c  = iProcess.Id;
                iNewRemesa.CI_EmpresaTitular__c = iEmp;
                iNewRemesa.CI_FechaRemesa__c    = System.Today();
 
 
                lRemesasToInsert.add(iNewRemesa);
            }
           
            if(!lRemesasToInsert.isEmpty()){
                insert lRemesasToInsert;
            }
 
 
            for(CI_Remesa__c iRemesa: lRemesasToInsert){
                mRemesaByEmpresaTitular.put(
                    iRemesa.CI_EmpresaTitular__c,
                    iRemesa.Id
                );
            }
 
 
            Integer batchSize = Integer.valueOf(CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_DATA_MODEL_REMESA).CI_BatchSize__c);
            CI_GenerateDataModelRemesaBatch iBatch = new CI_GenerateDataModelRemesaBatch(
                mRemesaByEmpresaTitular,
                estados,
                empresasTitulares,
                iProcess.CI_FilterFechaDesde__c,
                iProcess.CI_FilterFechaHasta__c
            );
           
            Database.executeBatch(iBatch, batchSize);
       
            flowResponse.add('El proceso se ha iniciado. Espere unos minutos antes de poder ver el resultado.');
 
 
            iProcess = [SELECT Id,CI_Estado__c
                        FROM CI_GestorProcesos__c
                        WHERE Id =:inputParams[0].idProceso
                        LIMIT 1];
           
            iProcess.CI_Estado__c = CI_GestorProcesos.ESTADO_FINALIZADO;
            update iProcess;
        }
        catch (Exception e) {
            Database.rollback(sp);
        }
 
 
        return flowResponse;
    }
    global class FlowInputs {
        @InvocableVariable
        public String idProceso;
    }
}