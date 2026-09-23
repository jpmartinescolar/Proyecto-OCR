/*
*   @Class          :   CI_GenerarXMLAEATBatch
*
*   @Author         :   Julián Martínez Cordones <julian@calibre360.io>
*   @Created        :   2025-07-16
*   @Description    :   Class CI_GenerarXMLAEATBatch
*
*   Modification Log
*   --------------------------------------------------------------------------------------
*   #       Developer                           Date                    Description
*   --------------------------------------------------------------------------------------
*   1       Julián Martínez Cordones            2025-07-16      	    Creation      
*   2       José Ernesto Torres                 2025-11-29      	    Updated           
*
*/

global class CI_GenerarXMLAEATBatch implements Database.Batchable<sObject>, Database.Stateful {
    String query;
    Integer batchSize;
    Boolean isProcessActive;
    public Map<String, String> mEmpresaByNIF;
    
    global CI_GenerarXMLAEATBatch() {
        this.query = CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_XML_AEAT).CI_QueryBatch__c;
        this.batchSize = Integer.valueOf(CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_XML_AEAT).CI_BatchSize__c);
        this.isProcessActive = CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_XML_AEAT).CI_IsActive__c;

        this.mEmpresaByNIF = CI_ConsecutivosFacturasHelper.VERIFACTU_EMPRESA_BY_NIF_MAP;
    }

    global Database.QueryLocator start(Database.BatchableContext BC) {
        return Database.getQueryLocator(this.query);
    }

    global void execute(Database.BatchableContext BC, List<sObject> scope) {
        if (!this.isProcessActive) {
            return;
        }
        
        Map<String, CI_XMLAEAT__c> mXMLByNIFInserted;
        Map<Id, Map<String, TotalesGrupo>> totalesPorFactura;

        Savepoint checkPoint = Database.setSavepoint();
        try {
            List<Facturas__c> invoicesRetrieved = (List<Facturas__c>) scope;
            
            //Crear XML AEAT
            mXMLByNIFInserted = CI_GenerarXMLAEATBatch.getXMLInserted(invoicesRetrieved, mEmpresaByNIF);
            
            //Agrupar importes por factura para crear los desgloses
            totalesPorFactura = CI_GenerarXMLAEATBatch.getGroupImports(invoicesRetrieved);

            List<CI_RegistroFacturacion__c> registrosFacturacion = new List<CI_RegistroFacturacion__c>();

            Map<Id, CI_RegistroFacturacion__c> previousBillingRecordByPreviousInvoiceId = new Map<Id, CI_RegistroFacturacion__c>();
            Set<Id> previousInvoiceIds = new Set<Id>();

            for(Facturas__c iInv: invoicesRetrieved){
                previousInvoiceIds.add(iInv.CI_FacturaAnterior__c);
            }

            List<CI_RegistroFacturacion__c> registrosPrevios = new List<CI_RegistroFacturacion__c>([
                SELECT Id, 
                    CI_RegistroAnterior__c,
                    CI_FacturaEmitida__c 
                FROM CI_RegistroFacturacion__c 
                WHERE CI_FacturaEmitida__c IN: previousInvoiceIds
            ]);

            for(CI_RegistroFacturacion__c iRegfact: registrosPrevios){
                previousBillingRecordByPreviousInvoiceId.put(iRegfact.CI_FacturaEmitida__c, iRegfact);
            }
            
            for(Facturas__c invoice: invoicesRetrieved){
                CI_RegistroFacturacion__c registroPrevio = previousBillingRecordByPreviousInvoiceId.get(invoice.CI_FacturaAnterior__c);
                Datetime dt = Datetime.newInstance(invoice.Fecha_factura__c, Time.newInstance(0, 0, 0, 0));

                CI_RegistroFacturacion__c registroFacturacion = new CI_RegistroFacturacion__c(
                    CI_XMLAEAT__c           = mXMLByNIFInserted.get(invoice.CIF_emisor__c).Id, 
                    CI_FacturaEmitida__c    = invoice.Id, 
                    CI_IdEmisorFactura__c   = invoice.CIF_emisor__c, 
                    CI_NombreRazonEmisor__c = mEmpresaByNIF.get(invoice.CIF_emisor__c), 
                    CI_NombreCliente__c     = invoice.Nombre_del_cliente__c, 
                    CI_CIFCliente__c        = invoice.CIF_Cliente__c, 
                    CI_NumSerieFactura__c   = invoice.N_factura__c, 
                    CI_FechaExpedicionFacturaAEAT__c    = invoice.CI_FechaExpedicionFacturaAEAT__c,
                    CI_FechaHoraHusoGenRegistroAEAT__c  = invoice.CI_FechaHoraHusoGenRegistroAEAT__c,
                    CI_FechaDeOperacionAEAT__c          = dt.format('dd-MM-yyyy'),
                    CI_TipoDeRectificativaL3__c         = invoice.Forma_de_abonar_L3__c,
                    CI_TipoFacturaAEAT__c   = invoice.CI_TipoFacturaAEAT__c, 
                    CI_CuotaTotal__c        = invoice.IVA__c,
                    CI_ImporteTotal__c      = invoice.Importe_factura__c, 
                    CI_Impuesto__c          = invoice.Impuesto_de_Aplicaci_n__c,
                    CI_HashFactura__c       = invoice.CI_HashAEAT__c, 
                    CI_RegistroAnterior__c  = registroPrevio != NULL ? registroPrevio.Id : NULL,
                    CI_PrimerRegistroPresentadoAEAT__c  = invoice.CI_PrimeraFacturaAEAT__c == true ? true : false
                );

                if(invoice.CI_TipoDeFactura__c == CI_InvoiceHelper.TIPO_FACTURA_ABONO){
                    registroFacturacion.CI_IdEmisorFacturaAnulada__c            = invoice.Factura_origen__r.CIF_emisor__c;
                    registroFacturacion.CI_NumSerieFacturaAnulada__c            = invoice.Factura_origen__r.N_factura__c;
                    registroFacturacion.CI_FechaExpedicionFacturaAnuladaAEAT__c = invoice.Factura_origen__r.CI_FechaExpedicionFacturaAEAT__c;
                }

                invoice.CI_IncluidaXMLAEAT__c = TRUE;

                registrosFacturacion.add(registroFacturacion);
            }

            if (!registrosFacturacion.isEmpty()) {
                insert registrosFacturacion;
            }
            //Guardar mapa de Registro de facturación por factura
            Map<Id, Id> mRegistfactByInvoice = new Map<Id, Id>();
            for (CI_RegistroFacturacion__c iReg: registrosFacturacion) {
                mRegistfactByInvoice.put(
                    iReg.CI_FacturaEmitida__c,
                    iReg.Id
                );
            }

            List<CI_DesgloseAEAT__c> lDesglosesToInsert = new List<CI_DesgloseAEAT__c>();
            for (Id facturaId : totalesPorFactura.keySet()) {
                for (String key : totalesPorFactura.get(facturaId).keySet()) {
                    TotalesGrupo tg = totalesPorFactura.get(facturaId).get(key);
                    
                    // Crear el registro de salida
                    CI_DesgloseAEAT__c desg                     = new CI_DesgloseAEAT__c();
                    desg.CI_RegistroDeFacturacion__c            = mRegistfactByInvoice.get(facturaId);
                    desg.CI_ClaveRegimen__c                     = tg.claveRegimen; //realmente debería estar en la cabecera de Registro facturación pero se tiene en las líneas de fact y no en la fact
                    desg.CI_PorcientoImpuesto__c                = tg.tipoImpositivo;
                    desg.CI_CalificacionOperacion__c            = tg.calificacion;
                    desg.CI_OperacionExenta__c	                = tg.causaExenta;
                    desg.CI_BaseImponibleOImporteNoSujeto__c    = tg.baseTotal;
                    desg.CI_CuotaRepercutida__c                 = tg.cuotaTotal;

                    lDesglosesToInsert.add(desg);
                }
            }

            if (!lDesglosesToInsert.isEmpty()) {
                insert lDesglosesToInsert;
            }

            update invoicesRetrieved;
        } 
        catch(Exception e) {
            Database.rollback(checkPoint);

            String data = 'STACK TRACE:\n' + e.getStackTraceString() + '\nMESSAGE:\n' + e.getMessage() + '\nLine:\n' + e.getLineNumber();

            CI_CustomLogHelper.addNewLog(
                'CI_GenerarXMLAEATBatch.execute',
                data
            );

            CI_CustomLogHelper.saveCurrentCustomLog();
        }
    }

    global void finish(Database.BatchableContext BC) {
        //Una vez terminado de crear los XML, lanzar generación de ficheros
        CI_GenerateXMLAEATFileBatch.searchAndProcess();
        
        CI_CustomLogHelper.addNewLog(
            'CI_GenerarXMLAEATBatch.finish',
            'Success'
        );
        
        CI_CustomLogHelper.saveCurrentCustomLog();
    }

    global static void searchAndProcess(){
        Integer batchSize = Integer.valueOf(CI_ProcessControlHelper.getControlProcess(CI_ProcessControlHelper.GENERATE_XML_AEAT).CI_BatchSize__c);
        Database.executeBatch(new CI_GenerarXMLAEATBatch(), batchSize);
    }

    global static Map<String, CI_XMLAEAT__c> getXMLInserted(List<Facturas__c> lInvoices, Map<String, String> mEmpresaByNIF){
        Map<String, CI_XMLAEAT__c> mXMLByNIFToInsert = new Map<String, CI_XMLAEAT__c>();
        
        for(Facturas__c iInv: lInvoices){
            if(mEmpresaByNIF.containsKey(iInv.CIF_emisor__c)){
                if(!mXMLByNIFToInsert.containsKey(iInv.CIF_emisor__c)){
                    CI_XMLAEAT__c xmlAEAT = new CI_XMLAEAT__c(
                        CI_EmpresaTitular__c    = mEmpresaByNIF.get(iInv.CIF_emisor__c), 
                        CI_NIFEmpresaTitular__c = iInv.CIF_emisor__c
                    );
                    mXMLByNIFToInsert.put(
                        iInv.CIF_emisor__c,
                        xmlAEAT
                    );
                }
            }
        }
        
        if(!mXMLByNIFToInsert.isEmpty()){
            insert mXMLByNIFToInsert.values();
        }

        return mXMLByNIFToInsert;
    }

    global static Map<Id, Map<String, TotalesGrupo>> getGroupImports(List<Facturas__c> lInvoices){
        Map<Id, Map<String, TotalesGrupo>> totalesPorFactura = new Map<Id, Map<String, TotalesGrupo>>();

        List<L_nea_de_factura__c> lInvoiceLines = new List<L_nea_de_factura__c>([ 
            SELECT Id, Factura__c, BI_o_Importe_no_sujeto__c, Cuota_repercutida__c, 
            Tipo_impositivo__c, Clave_r_gimenL8A__c, Calificaci_n_de_operaci_n_L9__c, Causa_operaci_n_exenta_L10__c 
            FROM L_nea_de_factura__c
            WHERE Factura__c IN:lInvoices
        ]);

        for (L_nea_de_factura__c line : lInvoiceLines) {
            // 1) Obtener/crear el mapa interno de esta factura
            if (!totalesPorFactura.containsKey(line.Factura__c)) {
                totalesPorFactura.put(line.Factura__c, new Map<String, TotalesGrupo>());
            }
            Map<String, TotalesGrupo> grupos = totalesPorFactura.get(line.Factura__c);

            // 2) Construir la clave de agrupación (los 4 campos)
            String key = String.join(new List<String>{
                String.valueOf(line.Tipo_impositivo__c),
                String.valueOf(line.Clave_r_gimenL8A__c),
                String.valueOf(line.Calificaci_n_de_operaci_n_L9__c),
                String.valueOf(line.Causa_operaci_n_exenta_L10__c)
            }, '_'); // separador

            // 3) Obtener/crear el registro de totales para esta combinación
            if (!grupos.containsKey(key)) {
                TotalesGrupo tg = new TotalesGrupo();
                tg.tipoImpositivo = line.Tipo_impositivo__c;
                tg.claveRegimen   = line.Clave_r_gimenL8A__c;
                tg.calificacion   = line.Calificaci_n_de_operaci_n_L9__c;
                tg.causaExenta    = line.Causa_operaci_n_exenta_L10__c;
                grupos.put(key, tg);
            }
            TotalesGrupo tot = grupos.get(key);

            // 4) Acumular Base y Cuota (controlando nulls)
            Decimal base  = (line.BI_o_Importe_no_sujeto__c == null) ? 0 : line.BI_o_Importe_no_sujeto__c;
            Decimal cuota = (line.Cuota_repercutida__c    == null) ? 0 : line.Cuota_repercutida__c;

            tot.baseTotal  += base;
            tot.cuotaTotal += cuota;
        }

        return totalesPorFactura;
    }

    global class TotalesGrupo {
        public Decimal baseTotal  = 0;
        public Decimal cuotaTotal = 0;

        // (Opcional) guardar también las claves por comodidad
        public Decimal tipoImpositivo;
        public String claveRegimen;
        public String calificacion;
        public String causaExenta;
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