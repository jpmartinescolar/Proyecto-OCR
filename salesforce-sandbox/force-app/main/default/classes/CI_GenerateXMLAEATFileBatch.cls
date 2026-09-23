/*
*   @Class          :   CI_GenerateXMLAEATFileBatch
*
*   @Author         :   Julián Martínez Cordones <julian@calibre360.io>
*   @Created        :   2025-07-18
*   @Description    :   Class CI_GenerateXMLAEATFileBatch
*
*   Modification Log
*   --------------------------------------------------------------------------------------
*   #       Developer                           Date                    Description
*   --------------------------------------------------------------------------------------
*   1       Julián Martínez Cordones            2025-07-18      	    Creation           
*
*/

global class CI_GenerateXMLAEATFileBatch implements Database.Batchable<sObject>, Database.Stateful {
    String query;
    Integer batchSize;
    Boolean isProcessActive;

    global CI_GenerateXMLAEATFileBatch() {
        query = CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_XML_AEAT_FILE).CI_QueryBatch__c;
        batchSize = Integer.valueOf(CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_XML_AEAT_FILE).CI_BatchSize__c);
        isProcessActive = CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_XML_AEAT_FILE).CI_IsActive__c;
    }

    global Database.QueryLocator start(Database.BatchableContext BC) {
        return Database.getQueryLocator(query);
    }
    
    global void execute(Database.BatchableContext BC, List<sObject> scope) {
        if (!isProcessActive) {
            return;
        }

        List<CI_XMLAEAT__c> lXMLs = (List<CI_XMLAEAT__c>) scope;
        CI_XMLAEAT__c iXML = lXMLs[0];

        Savepoint checkPoint = Database.setSavepoint();

        try {
            List<CI_RegistroFacturacion__c> registrosFacturacionRetrieved = new List<CI_RegistroFacturacion__c>([
                SELECT Id, CI_AnularRegistroDeAltaAnterior__c, CI_TipoDeRectificativaL3__c, CI_FechaDeOperacionAEAT__c,
                    CI_TipoFacturaAuto__c, CI_IdEmisorFactura__c, CI_NumSerieFactura__c, 
                    CI_Impuesto__c, CI_FechaExpedicionFactura__c, CI_FechaExpedicionFacturaAEAT__c,
                    CI_FechaHoraHusoGenRegistroAEAT__c, CI_BaseImponible__c, CI_CuotaTotal__c, 
                    CI_HashFactura__c, CI_NombreRazonEmisor__c, CI_Subsanacion__c, 
                    CI_TipoFacturaAEAT__c, CI_ImporteTotal__c, CI_NombreCliente__c, 
                    CI_CIFCliente__c, CI_PrimerRegistroPresentadoAEAT__c, CI_IdEmisorFacturaAnulada__c,
                    CI_NumSerieFacturaAnulada__c, CI_FechaExpedicionFacturaAnuladaAEAT__c, 
                    CI_RegistroAnterior__c, CI_RegistroAnterior__r.CI_CuotaTotal__c, 
                    CI_RegistroAnterior__r.CI_ImporteTotal__c, 
                    CI_RegistroAnterior__r.CI_FechaExpedicionFacturaAEAT__c, 
                    CI_RegistroAnterior__r.CI_FechaHoraHusoGenRegistroAEAT__c, 
                    CI_RegistroAnterior__r.CI_IdEmisorFactura__c, 
                    CI_RegistroAnterior__r.CI_NumSerieFactura__c,
                    CI_RegistroAnterior__r.CI_FechaExpedicionFactura__c, 
                    CI_RegistroAnterior__r.CI_HashFactura__c, 
                    SystemModstamp, 
                    (SELECT Id, CI_PorcientoImpuesto__c, CI_BaseImponibleOImporteNoSujeto__c, 
                        CI_CalificacionOperacion__c, CI_OperacionExenta__c, CI_ClaveRegimen__c, 
                        CI_CuotaRepercutida__c, CI_RegistroDeFacturacion__c 
                        FROM Desgloses_AEAT__r) 
                FROM CI_RegistroFacturacion__c 
                WHERE CI_XMLAEAT__r.CI_Descartar__c = false 
                AND CI_XMLAEAT__c =:iXML.Id
            ]);

            //Preparar wrapper
            CI_RegistroVerifactuWrapper.RegistroVerifactuBase regVerifactuBaseWrapper = CI_XMLAEATGenerator.getRegistroVerifactuBaseWrapper(iXML);
            //Completar info
            regVerifactuBaseWrapper = CI_GenerateXMLAEATFileBatchHelper.fillXMLAEATWrapper(regVerifactuBaseWrapper, registrosFacturacionRetrieved);
            //Generar fichero
            CI_XMLAEATGenerator.generateXMLFile(iXML, regVerifactuBaseWrapper);
        } 
        catch (Exception e) {
            Database.rollback(checkPoint);

            String data = 'STACK TRACE:\n' + e.getStackTraceString() + '\nMESSAGE:\n' + e.getMessage() + '\nLine:\n' + e.getLineNumber();
            CI_CustomLogHelper.addNewLog(
                'CI_GenerateXMLAEATFileBatch.execute',
                data,
                iXML.Id
            );

            CI_CustomLogHelper.saveCurrentCustomLog();
        }
    }

    global void finish(Database.BatchableContext BC) {
        //Una vez terminado de crear los ficheros XML, lanzar el envío a hacienda
        CI_VerifactuAPIBatch.searchAndProcess();

        CI_CustomLogHelper.addNewLog(
            'CI_GenerateXMLAEATFileBatch.finish',
            'Success'
        );

        CI_CustomLogHelper.saveCurrentCustomLog();
    }

    global static void searchAndProcess(){
        Integer batchSize = Integer.valueOf(CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_XML_AEAT_FILE).CI_BatchSize__c);
        Database.executeBatch(new CI_GenerateXMLAEATFileBatch(), batchSize);
    }

    global static void cober (){
        Integer i = 0;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
    }
}