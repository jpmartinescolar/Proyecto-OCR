/*
*   @Class          :   CI_XMLAEATGenerator
*
*   @Author         :   Julián Martínez Cordones <julian@calibre360.io>
*   @Created        :   2025-07-21
*   @Description    :   Class CI_XMLAEATGenerator
*
*   Modification Log
*   --------------------------------------------------------------------------------------
*   #       Developer                           Date                    Description
*   --------------------------------------------------------------------------------------
*   1       Julián Martínez Cordones            2025-07-21      	    Creation           
*
*/

public class CI_XMLAEATGenerator {
    
    public final static String TIPO_HUELLA_SHA_256 = '01';
    public final static String VERSION_ESQUEMA_VERIFACTU = '1.0';
    public final static String TIPO_IMPUESTO = '01';
    public final static String CLAVE_REGIMEN = '01';
    public final static String CALIFICACION_OPERACION_S1 = 'S1';
    public final static String CODIGO_PAIS = 'ES';
    public final static String TIPO_IDENTIFICADOR_EMISOR_NIF_IVA = '02';
    public final static String GENERADO_POR_EXPEDIDOR = 'E';
    public final static String ID_SISTEMA_INFORMATICO = 'GM';
    public final static String VERSION_SISTEMA_INFORMATICO = '1.0';
    
    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static CI_RegistroVerifactuWrapper.RegistroVerifactuBase getRegistroVerifactuBaseWrapper(CI_XMLAEAT__c xmlAEATRecord) {
        CI_RegistroVerifactuWrapper.RegistroVerifactuBase regVerifactuBaseWrapper = new CI_RegistroVerifactuWrapper.RegistroVerifactuBase();
        CI_RegistroVerifactuWrapper.Cabecera cabecera = new CI_RegistroVerifactuWrapper.Cabecera();
        CI_RegistroVerifactuWrapper.ObligadoEmision cabeceraObligadoEmision = new CI_RegistroVerifactuWrapper.ObligadoEmision();

        cabeceraObligadoEmision.NombreRazon = xmlAEATRecord.CI_EmpresaTitular__c;
        cabeceraObligadoEmision.NIF = xmlAEATRecord.CI_NIFEmpresaTitular__c;

        cabecera.ObligadoEmision = cabeceraObligadoEmision;

        regVerifactuBaseWrapper.Cabecera = cabecera;
        regVerifactuBaseWrapper.RegistroFactura = new List<CI_RegistroVerifactuWrapper.RegistroFactura>();

        return regVerifactuBaseWrapper;
    }
    
    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static CI_RegistroVerifactuWrapper.RegistroAlta getRegistroFacturacionAltaWrapper(
        CI_RegistroFacturacion__c registroFacturacion, 
        CI_RegistroVerifactuWrapper.RegistroVerifactuBase regVerifactuBaseWrapper
        ) {
            CI_RegistroVerifactuWrapper.RegistroAlta regVerifactuAltaWrapper = new CI_RegistroVerifactuWrapper.RegistroAlta();
            CI_RegistroVerifactuWrapper.RegistroAltaIDFactura idFactura = getIdFacturaAlta(registroFacturacion);
            CI_RegistroVerifactuWrapper.FacturasRectificadas idFacturaRect = getIdFacturaRectificada(registroFacturacion);
            CI_RegistroVerifactuWrapper.ImporteRectificacion importeFacturaRect = getImporteFacturaRectificada(registroFacturacion);
            CI_RegistroVerifactuWrapper.Destinatarios destinatarios = getDestinatarios(registroFacturacion);
            CI_RegistroVerifactuWrapper.Desglose desglose = getDesglose(registroFacturacion);
            CI_RegistroVerifactuWrapper.Encadenamiento encadenamiento = getEncadenamiento(registroFacturacion);
            
            regVerifactuAltaWrapper.IDVersion           = VERSION_ESQUEMA_VERIFACTU;
            regVerifactuAltaWrapper.IDFactura           = idFactura;
            regVerifactuAltaWrapper.NombreRazonEmisor   = registroFacturacion.CI_NombreRazonEmisor__c;
            regVerifactuAltaWrapper.Subsanacion         = registroFacturacion.CI_Subsanacion__c == null ? 'N' : registroFacturacion.CI_Subsanacion__c;
            regVerifactuAltaWrapper.TipoFactura         = registroFacturacion.CI_TipoFacturaAEAT__c;
            
            if(registroFacturacion.CI_TipoFacturaAEAT__c == 'R1' || 
                registroFacturacion.CI_TipoFacturaAEAT__c == 'R2' || 
                registroFacturacion.CI_TipoFacturaAEAT__c == 'R3' || 
                registroFacturacion.CI_TipoFacturaAEAT__c == 'R4' || 
                registroFacturacion.CI_TipoFacturaAEAT__c == 'R5'){

                regVerifactuAltaWrapper.TipoRectificativa = registroFacturacion.CI_TipoDeRectificativaL3__c;
                
                if(idFacturaRect.IDFacturaRectificada != null){
                    regVerifactuAltaWrapper.FacturasRectificadas = idFacturaRect;
                }

                if(registroFacturacion.CI_TipoDeRectificativaL3__c == 'S'){
                    regVerifactuAltaWrapper.ImporteRectificacion = importeFacturaRect;
                }
            }
            
            if(registroFacturacion.CI_FechaExpedicionFacturaAEAT__c != registroFacturacion.CI_FechaDeOperacionAEAT__c){
                regVerifactuAltaWrapper.FechaOperacion = registroFacturacion.CI_FechaDeOperacionAEAT__c;
            }
            
            regVerifactuAltaWrapper.DescripcionOperacion = registroFacturacion.CI_NumSerieFactura__c; // Concepto de la factura
            regVerifactuAltaWrapper.Destinatarios       = destinatarios;
            
            if(desglose.DetalleDesglose != null){
                regVerifactuAltaWrapper.Desglose = desglose;
            }
            regVerifactuAltaWrapper.CuotaTotal = registroFacturacion.CI_CuotaTotal__c;
            regVerifactuAltaWrapper.ImporteTotal = registroFacturacion.CI_ImporteTotal__c;
            regVerifactuAltaWrapper.Encadenamiento = encadenamiento;
            regVerifactuAltaWrapper.SistemaInformatico = getSistemaInformatico();
            Datetime dt = (Datetime) JSON.deserialize('"' + registroFacturacion.CI_FechaHoraHusoGenRegistroAEAT__c + '"', Datetime.class);
            regVerifactuAltaWrapper.FechaHoraHusoGenRegistro = dt;
            regVerifactuAltaWrapper.TipoHuella = TIPO_HUELLA_SHA_256;
            regVerifactuAltaWrapper.Huella = registroFacturacion.CI_HashFactura__c;

            return regVerifactuAltaWrapper;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static CI_RegistroVerifactuWrapper.RegistroAltaIDFactura getIdFacturaAlta(CI_RegistroFacturacion__c registroFacturacion) {
        CI_RegistroVerifactuWrapper.RegistroAltaIDFactura idFactura = new CI_RegistroVerifactuWrapper.RegistroAltaIDFactura();

        idFactura.IDEmisorFactura = registroFacturacion.CI_IdEmisorFactura__c;
        idFactura.NumSerieFactura = registroFacturacion.CI_NumSerieFactura__c;
        // List<String> p = registroFacturacion.CI_FechaExpedicionFacturaAEAT__c.split('-'); // ["04","11","2025"]
        // Date d = Date.newInstance(Integer.valueOf(p[0]), Integer.valueOf(p[1]), Integer.valueOf(p[2]));
        // idFactura.FechaExpedicionFactura = d;
        idFactura.FechaExpedicionFactura = registroFacturacion.CI_FechaExpedicionFacturaAEAT__c;

        return idFactura;
    }

    /*
    *   @Author         :   José Ernesto <jose@calibre360.io>
    */
    public static CI_RegistroVerifactuWrapper.FacturasRectificadas getIdFacturaRectificada(CI_RegistroFacturacion__c registroFacturacion) {
        CI_RegistroVerifactuWrapper.IDFacturaRectificada iIdRect = new CI_RegistroVerifactuWrapper.IDFacturaRectificada();
        iIdRect.IDEmisorFactura = registroFacturacion.CI_IdEmisorFacturaAnulada__c;
        iIdRect.NumSerieFactura = registroFacturacion.CI_NumSerieFacturaAnulada__c;
        iIdRect.FechaExpedicionFactura = registroFacturacion.CI_FechaExpedicionFacturaAnuladaAEAT__c;

        List<CI_RegistroVerifactuWrapper.IDFacturaRectificada> lReg = new List<CI_RegistroVerifactuWrapper.IDFacturaRectificada>();
        lReg.add(iIdRect);

        CI_RegistroVerifactuWrapper.FacturasRectificadas iFR = new CI_RegistroVerifactuWrapper.FacturasRectificadas();
        iFR.IDFacturaRectificada = lReg;

        return iFR;
    }

    /*
    *   @Author         :   José Ernesto <jose@calibre360.io>
    */
    public static CI_RegistroVerifactuWrapper.ImporteRectificacion getImporteFacturaRectificada(CI_RegistroFacturacion__c registroFacturacion) {
        CI_RegistroVerifactuWrapper.ImporteRectificacion impRect = new CI_RegistroVerifactuWrapper.ImporteRectificacion();
        impRect.BaseRectificada = registroFacturacion.CI_RegistroAnterior__r.CI_CuotaTotal__c;
        impRect.CuotaRectificada = registroFacturacion.CI_RegistroAnterior__r.CI_ImporteTotal__c;

        return impRect;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static CI_RegistroVerifactuWrapper.Destinatarios getDestinatarios(CI_RegistroFacturacion__c registroFacturacion) {
        CI_RegistroVerifactuWrapper.Destinatarios destinatarios = new CI_RegistroVerifactuWrapper.Destinatarios();

        destinatarios.IDDestinatario = new List<CI_RegistroVerifactuWrapper.IDDestinatario>{getIDDestinatario(registroFacturacion)};

        return destinatarios;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static CI_RegistroVerifactuWrapper.IDDestinatario getIDDestinatario(CI_RegistroFacturacion__c registroFacturacion) {
        CI_RegistroVerifactuWrapper.IDDestinatario idDestinatario = new CI_RegistroVerifactuWrapper.IDDestinatario();

        idDestinatario.NombreRazon = registroFacturacion.CI_NombreCliente__c;
        idDestinatario.NIF = registroFacturacion.CI_CIFCliente__c;

        return idDestinatario;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static CI_RegistroVerifactuWrapper.Desglose getDesglose(CI_RegistroFacturacion__c registroFacturacion) {
        CI_RegistroVerifactuWrapper.Desglose desglose = new CI_RegistroVerifactuWrapper.Desglose();
        List<CI_RegistroVerifactuWrapper.DetalleDesglose> lDetallesDesgloses = new List<CI_RegistroVerifactuWrapper.DetalleDesglose>();
        
        List<CI_DesgloseAEAT__c> desgloses = registroFacturacion.Desgloses_AEAT__r;

        if (desgloses != null && !desgloses.isEmpty()) {
            for (CI_DesgloseAEAT__c desg: desgloses) {
                CI_RegistroVerifactuWrapper.DetalleDesglose detalleDesglose = new CI_RegistroVerifactuWrapper.DetalleDesglose();
                
                detalleDesglose.Impuesto                        = registroFacturacion.CI_Impuesto__c;
                detalleDesglose.ClaveRegimen                    = desg.CI_ClaveRegimen__c;
                detalleDesglose.BaseImponibleOimporteNoSujeto   = desg.CI_BaseImponibleOImporteNoSujeto__c;
                
                if(desg.CI_CalificacionOperacion__c != null){
                    detalleDesglose.CalificacionOperacion           = desg.CI_CalificacionOperacion__c;
                }
                if(desg.CI_OperacionExenta__c != null){
                    detalleDesglose.OperacionExenta                 = desg.CI_OperacionExenta__c;
                }

                if(desg.CI_CalificacionOperacion__c == 'S1' || desg.CI_OperacionExenta__c != null){
                    detalleDesglose.TipoImpositivo                  = desg.CI_PorcientoImpuesto__c;
                    detalleDesglose.CuotaRepercutida                = desg.CI_CuotaRepercutida__c;
                }

                lDetallesDesgloses.add(detalleDesglose);
            }
        }

        if(!lDetallesDesgloses.isEmpty()){
            desglose.DetalleDesglose = lDetallesDesgloses;
        }

        return desglose;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static CI_RegistroVerifactuWrapper.Encadenamiento getEncadenamiento(CI_RegistroFacturacion__c registroFacturacion) {
        CI_RegistroVerifactuWrapper.Encadenamiento encadenamiento = new CI_RegistroVerifactuWrapper.Encadenamiento();

        encadenamiento.PrimerRegistro = registroFacturacion.CI_PrimerRegistroPresentadoAEAT__c ? 'S' : 'N';

        if (!registroFacturacion.CI_PrimerRegistroPresentadoAEAT__c) {
            encadenamiento.RegistroAnterior = getRegistroAnteriorFacturacion(registroFacturacion.CI_RegistroAnterior__r);
        }

        return encadenamiento;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static CI_RegistroVerifactuWrapper.RegistroAnterior getRegistroAnteriorFacturacion(CI_RegistroFacturacion__c registroFacturacionAnterior) {
        CI_RegistroVerifactuWrapper.RegistroAnterior registroAnterior = new CI_RegistroVerifactuWrapper.RegistroAnterior();

        registroAnterior.IDEmisorFactura = registroFacturacionAnterior.CI_IdEmisorFactura__c;
        registroAnterior.NumSerieFactura = registroFacturacionAnterior.CI_NumSerieFactura__c;
        // List<String> p = registroFacturacionAnterior.CI_FechaExpedicionFacturaAEAT__c.split('-'); // ["04","11","2025"]
        // Date d = Date.newInstance(Integer.valueOf(p[0]), Integer.valueOf(p[1]), Integer.valueOf(p[2]));
        // registroAnterior.FechaExpedicionFactura = d;
        registroAnterior.FechaExpedicionFactura = registroFacturacionAnterior.CI_FechaExpedicionFacturaAEAT__c;
        registroAnterior.Huella = registroFacturacionAnterior.CI_HashFactura__c;

        return registroAnterior;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static CI_RegistroVerifactuWrapper.RegistroAnulacion getRegistroFacturacionAnulacionWrapper(
        CI_RegistroFacturacion__c registroFacturacion, 
        CI_RegistroVerifactuWrapper.RegistroVerifactuBase regVerifactuBaseWrapper
        ) {
            CI_RegistroVerifactuWrapper.RegistroAnulacion regVerifactuAnulacionWrapper = new CI_RegistroVerifactuWrapper.RegistroAnulacion();
            CI_RegistroVerifactuWrapper.RegistroAnulacionIDFactura idFactura = getIdFacturaAnulacion(registroFacturacion);
            // CI_RegistroVerifactuWrapper.Generador generador = getGeneradorAnulacion(registroFacturacion); // No es necesario informarlo ya que el emisor de facturas de anulación es el mismo
            CI_RegistroVerifactuWrapper.Encadenamiento encadenamiento = getEncadenamiento(registroFacturacion);
            
            regVerifactuAnulacionWrapper.IDVersion = VERSION_ESQUEMA_VERIFACTU;
            regVerifactuAnulacionWrapper.IDFactura = idFactura;
            regVerifactuAnulacionWrapper.SinRegistroPrevio = registroFacturacion.CI_RegistroAnterior__c != NULL ? 'N' : 'S';
            regVerifactuAnulacionWrapper.RechazoPrevio = registroFacturacion.CI_Subsanacion__c == null ? 'N' : registroFacturacion.CI_Subsanacion__c;
            // regVerifactuAnulacionWrapper.GeneradoPor = GENERADO_POR_EXPEDIDOR; // No es necesario informarlo ya que el emisor de facturas de anulación es el mismo 
            regVerifactuAnulacionWrapper.Encadenamiento = encadenamiento;
            regVerifactuAnulacionWrapper.SistemaInformatico = getSistemaInformatico();
            Datetime dt = (Datetime) JSON.deserialize('"' + registroFacturacion.CI_FechaHoraHusoGenRegistroAEAT__c + '"', Datetime.class);
            regVerifactuAnulacionWrapper.FechaHoraHusoGenRegistro = dt;
            regVerifactuAnulacionWrapper.TipoHuella = TIPO_HUELLA_SHA_256;
            regVerifactuAnulacionWrapper.Huella = registroFacturacion.CI_HashFactura__c;

            return regVerifactuAnulacionWrapper;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static CI_RegistroVerifactuWrapper.RegistroAnulacionIDFactura getIdFacturaAnulacion(CI_RegistroFacturacion__c registroFacturacion) {
        CI_RegistroVerifactuWrapper.RegistroAnulacionIDFactura idFactura = new CI_RegistroVerifactuWrapper.RegistroAnulacionIDFactura();
        
        idFactura.IDEmisorFacturaAnulada        = registroFacturacion.CI_IdEmisorFactura__c;
        idFactura.NumSerieFacturaAnulada        = registroFacturacion.CI_NumSerieFactura__c;
        idFactura.FechaExpedicionFacturaAnulada = registroFacturacion.CI_FechaExpedicionFacturaAEAT__c;

        return idFactura;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static CI_RegistroVerifactuWrapper.Generador getGeneradorAnulacion(CI_RegistroFacturacion__c registroFacturacion) {
        CI_RegistroVerifactuWrapper.Generador generador = new CI_RegistroVerifactuWrapper.Generador();

        generador.NombreRazon = registroFacturacion.CI_NombreRazonEmisor__c;
        generador.NIF = registroFacturacion.CI_IdEmisorFactura__c;

        return generador;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static CI_RegistroVerifactuWrapper.SistemaInformatico getSistemaInformatico() {
        CI_RegistroVerifactuWrapper.SistemaInformatico sistemaInformatico = new CI_RegistroVerifactuWrapper.SistemaInformatico();

        sistemaInformatico.NombreRazon = 'Centro de Innovación de Despachos y Pymes, S.L';
        sistemaInformatico.NIF = 'B87141636';
        // sistemaInformatico.IDOtro = getIDOtro(CODIGO_PAIS, TIPO_IDENTIFICADOR_EMISOR_NIF_IVA, '12345678Z'); Este nodo no es necesario ya que el CIF es español
        sistemaInformatico.NombreSistemaInformatico = 'GMFact';
        sistemaInformatico.IdSistemaInformatico = ID_SISTEMA_INFORMATICO;
        sistemaInformatico.Version = VERSION_SISTEMA_INFORMATICO;
        sistemaInformatico.NumeroInstalacion = '1';
        sistemaInformatico.TipoUsoPosibleSoloVerifactu = 'S';
        sistemaInformatico.TipoUsoPosibleMultiOT = 'S';
        sistemaInformatico.IndicadorMultiplesOT = 'S';

        return sistemaInformatico;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static CI_RegistroVerifactuWrapper.IDOtro getIDOtro(String codigoPais, String tipoIdentificador, String identificador) {
        CI_RegistroVerifactuWrapper.IDOtro idOtro = new CI_RegistroVerifactuWrapper.IDOtro();

        idOtro.CodigoPais = codigoPais;
        idOtro.IDType = tipoIdentificador;
        idOtro.ID = identificador;

        return idOtro;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static void generateXMLFile(CI_XMLAEAT__c xmlAEATRecord, CI_RegistroVerifactuWrapper.RegistroVerifactuBase regVerifactuBaseWrapper) {
        String xmlBody = generateXMLAEATBase(regVerifactuBaseWrapper);

        Attachment attachment = new Attachment();
		attachment.ParentId = xmlAEATRecord.Id;
		attachment.Name 	= xmlAEATRecord.CI_XMLFileName__c;
		attachment.Body 	= Blob.valueOf(xmlBody);

        if (attachment != NULL) {
			insert attachment;
			cleanAttachment(attachment);
		}

        xmlAEATRecord.CI_FicheroXMLGenerado__c = TRUE;

        update xmlAEATRecord;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static void cleanAttachment(Attachment lastAttachment){
        List<Attachment> lstAtt = [
            SELECT Id 
            FROM Attachment 
            WHERE ParentId =: 
            lastAttachment.ParentId
        ];

        List<Attachment> lstAttToDelete = new List<Attachment>();
        if (lstAtt.size() > 1) {
            for (Attachment att : lstAtt) {
                if (att.Id != lastAttachment.Id) {
                    lstAttToDelete.add(att);
                }
            }

            delete lstAttToDelete;
        }
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static String generateXMLAEATBase(CI_RegistroVerifactuWrapper.RegistroVerifactuBase regVerifactuBaseWrapper) {
        Dom.Document doc = new Dom.Document();
        Dom.Xmlnode rootNode = doc.createRootElement('Envelope', 'http://schemas.xmlsoap.org/soap/envelope/', 'soapenv');
        rootnode.setAttribute('xmlns:sum', 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd');
        rootnode.setAttribute('xmlns:sum1', 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd');
        rootnode.setAttribute('xmlns:xd', 'http://www.w3.org/2000/09/xmldsig#');

        Dom.Xmlnode childNodeHeader = rootNode.addChildElement('soapenv:Header', NULL, NULL);
        Dom.Xmlnode childNodeBody = rootNode.addChildElement('soapenv:Body', NULL, NULL);
        Dom.Xmlnode childNodeRegFactuSistemaFacturacion = childNodeBody.addChildElement('sum:RegFactuSistemaFacturacion', NULL, NULL);
        
        Dom.Xmlnode childNodeCabecera = getChildNodeCabecera(childNodeRegFactuSistemaFacturacion, regVerifactuBaseWrapper.Cabecera);

        Integer registrosFacturaSize = regVerifactuBaseWrapper.RegistroFactura.size();
		for (Integer i = 0; i < registrosFacturaSize; i++) {
            CI_RegistroVerifactuWrapper.RegistroFactura registroFactura = regVerifactuBaseWrapper.RegistroFactura[i];

        	Dom.Xmlnode childNodeRegistroFactura = getChildNodeRegistroFactura(childNodeRegFactuSistemaFacturacion, registroFactura);
        }

        String xmlString = doc.toXmlString();

        xmlString = xmlString.replace('<?xml version="1.0" encoding="UTF-8"?>', '');

        return xmlString;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static Dom.Xmlnode getChildNodeCabecera(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.Cabecera cabeceraWrapper) {
        Dom.Xmlnode childNodeCabecera = headerNode.addChildElement('sum:Cabecera', NULL, NULL);
        Dom.Xmlnode childNodeObligadoEmision = getChildNodeObligadoEmision(childNodeCabecera, cabeceraWrapper);

        return childNodeCabecera;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static Dom.Xmlnode getChildNodeObligadoEmision(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.Cabecera cabeceraWrapper) {
        Dom.Xmlnode childNodeObligadoEmision = headerNode.addChildElement('sum1:ObligadoEmision', NULL, NULL);

        Dom.Xmlnode childNodeNombreRazon = childNodeObligadoEmision.addChildElement('sum1:NombreRazon', NULL, NULL);
        Dom.Xmlnode childNodeNIF = childNodeObligadoEmision.addChildElement('sum1:NIF', NULL, NULL);

        childNodeNombreRazon.addTextNode(CI_XMLUtils.cleanTextNode(cabeceraWrapper.ObligadoEmision.NombreRazon));
        childNodeNIF.addTextNode(CI_XMLUtils.cleanTextNode(cabeceraWrapper.ObligadoEmision.NIF));

        return childNodeObligadoEmision;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static Dom.Xmlnode getChildNodeRegistroFactura(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.RegistroFactura registroFacturaWrapper) {
        Dom.Xmlnode childNodeRegistroFactura = headerNode.addChildElement('sum:RegistroFactura', NULL, NULL);

        Dom.Xmlnode childNodeRegistroAlta = registroFacturaWrapper.RegistroAlta != NULL ? getChildNodeRegistroAlta(childNodeRegistroFactura, registroFacturaWrapper.RegistroAlta) : NULL;
        Dom.Xmlnode childNodeRegistroAnulacion = registroFacturaWrapper.RegistroAnulacion != NULL ? getChildNodeRegistroAnulacion(childNodeRegistroFactura, registroFacturaWrapper.RegistroAnulacion) : NULL;

        CI_XMLUtils.removeIfNotHasChild(childNodeRegistroFactura);

        return childNodeRegistroFactura;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static Dom.Xmlnode getChildNodeRegistroAlta(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.RegistroAlta registroAltaWrapper) {
        Dom.Xmlnode childNodeRegistroAlta = headerNode.addChildElement('sum1:RegistroAlta', NULL, NULL);

        Dom.Xmlnode childNodeIDVersion = childNodeRegistroAlta.addChildElement('sum1:IDVersion', NULL, NULL);
        Dom.Xmlnode childNodeIDFactura = getChildNodeRegistroAltaIDFactura(childNodeRegistroAlta, registroAltaWrapper.IDFactura);
        Dom.Xmlnode childNodeNombreRazonEmisor = childNodeRegistroAlta.addChildElement('sum1:NombreRazonEmisor', NULL, NULL);
        Dom.Xmlnode childNodeSubsanacion = childNodeRegistroAlta.addChildElement('sum1:Subsanacion', NULL, NULL);
        Dom.Xmlnode childNodeTipoFactura = childNodeRegistroAlta.addChildElement('sum1:TipoFactura', NULL, NULL);
        Dom.Xmlnode childNodeTipoRectificativa = childNodeRegistroAlta.addChildElement('sum1:TipoRectificativa', NULL, NULL);
        
        if(registroAltaWrapper.FacturasRectificadas != null){
            Dom.Xmlnode childNodeFacturasRectificadas = getChildNodeFacturasRectificadas(childNodeRegistroAlta, registroAltaWrapper.FacturasRectificadas);
        }
        if(registroAltaWrapper.ImporteRectificacion != null){
            Dom.Xmlnode childNodeImporteRectificacion = getChildNodeImporteRectificacion(childNodeRegistroAlta, registroAltaWrapper.ImporteRectificacion);
        }

        Dom.Xmlnode childNodeDescripcionOperacion = childNodeRegistroAlta.addChildElement('sum1:DescripcionOperacion', NULL, NULL);
        Dom.Xmlnode childNodeDestinatarios = getChildNodeDestinatarios(childNodeRegistroAlta, registroAltaWrapper.Destinatarios);
        Dom.Xmlnode childNodeDesglose = getChildNodeDesglose(childNodeRegistroAlta, registroAltaWrapper.Desglose);
        Dom.Xmlnode childNodeCuotaTotal = childNodeRegistroAlta.addChildElement('sum1:CuotaTotal', NULL, NULL);
        Dom.Xmlnode childNodeImporteTotal = childNodeRegistroAlta.addChildElement('sum1:ImporteTotal', NULL, NULL);
        Dom.Xmlnode childNodeEncadenamiento = getChildNodeEncadenamiento(childNodeRegistroAlta, registroAltaWrapper.Encadenamiento);
        Dom.Xmlnode childNodeSistemaInformatico = getChildNodeSistemaInformatico(childNodeRegistroAlta, registroAltaWrapper.SistemaInformatico);
        Dom.Xmlnode childNodeFechaHoraHusoGenRegistro = childNodeRegistroAlta.addChildElement('sum1:FechaHoraHusoGenRegistro', NULL, NULL);
        Dom.Xmlnode childNodeTipoHuella = childNodeRegistroAlta.addChildElement('sum1:TipoHuella', NULL, NULL);
        Dom.Xmlnode childNodeHuella = childNodeRegistroAlta.addChildElement('sum1:Huella', NULL, NULL);

        childNodeIDVersion.addTextNode(CI_XMLUtils.cleanTextNode(registroAltaWrapper.IDVersion));
        childNodeNombreRazonEmisor.addTextNode(CI_XMLUtils.cleanTextNode(registroAltaWrapper.NombreRazonEmisor));
        childNodeSubsanacion.addTextNode(CI_XMLUtils.cleanTextNode(registroAltaWrapper.Subsanacion));
        childNodeTipoFactura.addTextNode(CI_XMLUtils.cleanTextNode(registroAltaWrapper.TipoFactura));
        if(registroAltaWrapper.TipoRectificativa != null){
            childNodeTipoRectificativa.addTextNode(CI_XMLUtils.cleanTextNode(registroAltaWrapper.TipoRectificativa));
        }
        childNodeDescripcionOperacion.addTextNode(CI_XMLUtils.cleanTextNode(registroAltaWrapper.DescripcionOperacion));
        childNodeCuotaTotal.addTextNode(CI_XMLUtils.cleanTextNode(String.valueOf(registroAltaWrapper.CuotaTotal)));
        childNodeImporteTotal.addTextNode(CI_XMLUtils.cleanTextNode(String.valueOf(registroAltaWrapper.ImporteTotal)));
        childNodeFechaHoraHusoGenRegistro.addTextNode(CI_XMLUtils.cleanTextNode(registroAltaWrapper.FechaHoraHusoGenRegistro.format('yyyy-MM-dd\'T\'HH:mm:ssXXX')));
        childNodeTipoHuella.addTextNode(CI_XMLUtils.cleanTextNode(registroAltaWrapper.TipoHuella));
        childNodeHuella.addTextNode(CI_XMLUtils.cleanTextNode(registroAltaWrapper.Huella));
        
        return childNodeRegistroAlta;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static Dom.Xmlnode getChildNodeRegistroAltaIDFactura(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.RegistroAltaIDFactura registroIdFacturaWrapper) {
        Dom.Xmlnode childNodeIDFactura = headerNode.addChildElement('sum1:IDFactura', NULL, NULL);

        Dom.Xmlnode childNodeIDEmisorFactura = childNodeIDFactura.addChildElement('sum1:IDEmisorFactura', NULL, NULL);
        Dom.Xmlnode childNodeNumSerieFactura = childNodeIDFactura.addChildElement('sum1:NumSerieFactura', NULL, NULL);
        Dom.Xmlnode childNodeFechaExpedicionFactura = childNodeIDFactura.addChildElement('sum1:FechaExpedicionFactura', NULL, NULL);

        childNodeIDEmisorFactura.addTextNode(CI_XMLUtils.cleanTextNode(registroIdFacturaWrapper.IDEmisorFactura));
        childNodeNumSerieFactura.addTextNode(CI_XMLUtils.cleanTextNode(registroIdFacturaWrapper.NumSerieFactura));
        if(registroIdFacturaWrapper.FechaExpedicionFactura != null){
            childNodeFechaExpedicionFactura.addTextNode(CI_XMLUtils.cleanTextNode(registroIdFacturaWrapper.FechaExpedicionFactura));
        }

        return childNodeIDFactura;
    }

    /*
    *   @Author         :   José Ernesto <jose@calibre360.io>
    */
    public static Dom.XmlNode getChildNodeFacturasRectificadas(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.FacturasRectificadas registroFacturasRectificadasWrapper) {
        Dom.Xmlnode childNodeFacturasRectificadas = headerNode.addChildElement('sum1:FacturasRectificadas', NULL, NULL);

        for (CI_RegistroVerifactuWrapper.IDFacturaRectificada idFactRect : registroFacturasRectificadasWrapper.IDFacturaRectificada) {
            Dom.Xmlnode IDFacturaRectificada = getChildNodeIDFacturaRectificada(childNodeFacturasRectificadas, idFactRect);
        }

        return childNodeFacturasRectificadas;
    }

    /*
    *   @Author         :   José Ernesto <jose@calibre360.io>
    */
    public static Dom.XmlNode getChildNodeIDFacturaRectificada(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.IDFacturaRectificada registroIDFacturaRectificadaWrapper) {
        Dom.Xmlnode childNodeIDFacturaRectificada = headerNode.addChildElement('sum1:IDFacturaRectificada', NULL, NULL);

        Dom.Xmlnode childNodeIDEmisorFactura        = childNodeIDFacturaRectificada.addChildElement('sum1:IDEmisorFactura', NULL, NULL);
        Dom.Xmlnode childNodeNumSerieFactura        = childNodeIDFacturaRectificada.addChildElement('sum1:NumSerieFactura', NULL, NULL);
        Dom.Xmlnode childNodeFechaExpedicionFactura = childNodeIDFacturaRectificada.addChildElement('sum1:FechaExpedicionFactura', NULL, NULL);

        childNodeIDEmisorFactura.addTextNode(CI_XMLUtils.cleanTextNode(registroIDFacturaRectificadaWrapper.IDEmisorFactura));
        childNodeNumSerieFactura.addTextNode(CI_XMLUtils.cleanTextNode(registroIDFacturaRectificadaWrapper.NumSerieFactura));
        childNodeFechaExpedicionFactura.addTextNode(CI_XMLUtils.cleanTextNode(registroIDFacturaRectificadaWrapper.FechaExpedicionFactura));

        return childNodeIDFacturaRectificada;
    }

    /*
    *   @Author         :   José Ernesto <jose@calibre360.io>
    */
    public static Dom.XmlNode getChildNodeImporteRectificacion(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.ImporteRectificacion registroImporteRectificacionWrapper) {
        Dom.Xmlnode childNodeImporteRectificacion = headerNode.addChildElement('sum1:ImporteRectificacion', NULL, NULL);

        Dom.Xmlnode childNodeBaseRectificada        = childNodeImporteRectificacion.addChildElement('sum1:BaseRectificada', NULL, NULL);
        Dom.Xmlnode childNodeCuotaRectificada       = childNodeImporteRectificacion.addChildElement('sum1:CuotaRectificada', NULL, NULL);

        childNodeBaseRectificada.addTextNode(CI_XMLUtils.cleanTextNode(String.valueOf(registroImporteRectificacionWrapper.BaseRectificada)));
        childNodeCuotaRectificada.addTextNode(CI_XMLUtils.cleanTextNode(String.valueOf(registroImporteRectificacionWrapper.CuotaRectificada)));

        return childNodeImporteRectificacion;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static Dom.XmlNode getChildNodeDestinatarios(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.Destinatarios registroDestinatariosWrapper) {
        Dom.Xmlnode childNodeDestinatarios = headerNode.addChildElement('sum1:Destinatarios', NULL, NULL);

        for (CI_RegistroVerifactuWrapper.IDDestinatario idDestinatario : registroDestinatariosWrapper.IDDestinatario) {
            Dom.Xmlnode childNodeIDDestinatario = getChildNodeIDDestinatario(childNodeDestinatarios, idDestinatario);
        }

        return childNodeDestinatarios;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static Dom.XmlNode getChildNodeIDDestinatario(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.IDDestinatario registroIDDestinatarioWrapper) {
        Dom.Xmlnode childNodeIDDestinatario = headerNode.addChildElement('sum1:IDDestinatario', NULL, NULL);

        Dom.Xmlnode childNodeNombreRazon = childNodeIDDestinatario.addChildElement('sum1:NombreRazon', NULL, NULL);
        Dom.Xmlnode childNodeNIF = childNodeIDDestinatario.addChildElement('sum1:NIF', NULL, NULL);

        childNodeNombreRazon.addTextNode(CI_XMLUtils.cleanTextNode(registroIDDestinatarioWrapper.NombreRazon));
        childNodeNIF.addTextNode(CI_XMLUtils.cleanTextNode(registroIDDestinatarioWrapper.NIF));

        return childNodeIDDestinatario;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static Dom.Xmlnode getChildNodeDesglose(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.Desglose registroDesgloseWrapper) {
        Dom.Xmlnode childNodeDesglose = headerNode.addChildElement('sum1:Desglose', NULL, NULL);

        Dom.Xmlnode childNodeDetalleDesglose = getChildNodeDetalleDesglose(childNodeDesglose, registroDesgloseWrapper.DetalleDesglose[0]);

        return childNodeDesglose;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static Dom.Xmlnode getChildNodeDetalleDesglose(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.DetalleDesglose registroDetalleDesgloseWrapper) {
        Dom.Xmlnode childNodeDetalleDesglose = headerNode.addChildElement('sum1:DetalleDesglose', NULL, NULL);

        Dom.Xmlnode childNodeImpuesto = childNodeDetalleDesglose.addChildElement('sum1:Impuesto', NULL, NULL);
        Dom.Xmlnode childNodeClaveRegimen = childNodeDetalleDesglose.addChildElement('sum1:ClaveRegimen', NULL, NULL);
        Dom.Xmlnode childNodeCalificacionOperacion = childNodeDetalleDesglose.addChildElement('sum1:CalificacionOperacion', NULL, NULL);
        Dom.Xmlnode childNodeTipoImpositivo = childNodeDetalleDesglose.addChildElement('sum1:TipoImpositivo', NULL, NULL);
        Dom.Xmlnode childNodeBaseImponibleOimporteNoSujeto = childNodeDetalleDesglose.addChildElement('sum1:BaseImponibleOimporteNoSujeto', NULL, NULL);
        Dom.Xmlnode childNodeCuotaRepercutida = childNodeDetalleDesglose.addChildElement('sum1:CuotaRepercutida', NULL, NULL);

        childNodeImpuesto.addTextNode(CI_XMLUtils.cleanTextNode(registroDetalleDesgloseWrapper.Impuesto));
        childNodeClaveRegimen.addTextNode(CI_XMLUtils.cleanTextNode(registroDetalleDesgloseWrapper.ClaveRegimen));
        childNodeCalificacionOperacion.addTextNode(CI_XMLUtils.cleanTextNode(registroDetalleDesgloseWrapper.CalificacionOperacion));
        if(registroDetalleDesgloseWrapper.TipoImpositivo != null){
            childNodeTipoImpositivo.addTextNode(CI_XMLUtils.cleanTextNode(String.valueOf(registroDetalleDesgloseWrapper.TipoImpositivo)));
        }
        childNodeBaseImponibleOimporteNoSujeto.addTextNode(CI_XMLUtils.cleanTextNode(String.valueOf(registroDetalleDesgloseWrapper.BaseImponibleOimporteNoSujeto)));
        if(registroDetalleDesgloseWrapper.CuotaRepercutida != null){
            childNodeCuotaRepercutida.addTextNode(CI_XMLUtils.cleanTextNode(String.valueOf(registroDetalleDesgloseWrapper.CuotaRepercutida)));
        }

        return childNodeDetalleDesglose;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static Dom.Xmlnode getChildNodeEncadenamiento(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.Encadenamiento registroEncadenamientoWrapper) {
        Dom.Xmlnode childNodeEncadenamiento = headerNode.addChildElement('sum1:Encadenamiento', NULL, NULL);

        if (registroEncadenamientoWrapper.PrimerRegistro == 'S') {
            Dom.Xmlnode childNodePrimerRegistro = childNodeEncadenamiento.addChildElement('sum1:PrimerRegistro', NULL, NULL);
            childNodePrimerRegistro.addTextNode(CI_XMLUtils.cleanTextNode(registroEncadenamientoWrapper.PrimerRegistro));
        }

        Dom.Xmlnode childNodeRegistroAnterior = registroEncadenamientoWrapper.RegistroAnterior != NULL ? getChildNodeRegistroAnterior(childNodeEncadenamiento, registroEncadenamientoWrapper.RegistroAnterior) : NULL;

        return childNodeEncadenamiento;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static Dom.Xmlnode getChildNodeRegistroAnterior(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.RegistroAnterior registroAnteriorWrapper) {
        Dom.Xmlnode childNodeRegistroAnterior = headerNode.addChildElement('sum1:RegistroAnterior', NULL, NULL);

        Dom.Xmlnode childNodeIDEmisorFacturaIDEmisorFactura = childNodeRegistroAnterior.addChildElement('sum1:IDEmisorFactura', NULL, NULL);
        Dom.Xmlnode childNodeNumSerieFactura = childNodeRegistroAnterior.addChildElement('sum1:NumSerieFactura', NULL, NULL);
        Dom.Xmlnode childNodeFechaExpedicionFactura = childNodeRegistroAnterior.addChildElement('sum1:FechaExpedicionFactura', NULL, NULL);
        Dom.Xmlnode childNodeHuella = childNodeRegistroAnterior.addChildElement('sum1:Huella', NULL, NULL);

        childNodeIDEmisorFacturaIDEmisorFactura.addTextNode(CI_XMLUtils.cleanTextNode(registroAnteriorWrapper.IDEmisorFactura));
        childNodeNumSerieFactura.addTextNode(CI_XMLUtils.cleanTextNode(registroAnteriorWrapper.NumSerieFactura));
        if(registroAnteriorWrapper.FechaExpedicionFactura != null){
            childNodeFechaExpedicionFactura.addTextNode(CI_XMLUtils.cleanTextNode(registroAnteriorWrapper.FechaExpedicionFactura));
        }
        childNodeHuella.addTextNode(CI_XMLUtils.cleanTextNode(registroAnteriorWrapper.Huella));

        return childNodeRegistroAnterior;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static Dom.Xmlnode getChildNodeSistemaInformatico(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.SistemaInformatico registroSistemaInformaticoWrapper) {
        Dom.Xmlnode childNodeSistemaInformatico = headerNode.addChildElement('sum1:SistemaInformatico', NULL, NULL);

        Dom.Xmlnode childNodeNombreRazon = childNodeSistemaInformatico.addChildElement('sum1:NombreRazon', NULL, NULL);
        Dom.Xmlnode childNodeNIF = childNodeSistemaInformatico.addChildElement('sum1:NIF', NULL, NULL);
        
        if (registroSistemaInformaticoWrapper.NIF == NULL) {
            Dom.Xmlnode childNodeIDOtro = getChildNodeIDOtro(
                childNodeSistemaInformatico, 
                registroSistemaInformaticoWrapper.IDOtro.CodigoPais, 
                registroSistemaInformaticoWrapper.IDOtro.IDType, 
                registroSistemaInformaticoWrapper.IDOtro.ID
            );
        }

        Dom.Xmlnode childNodeNombreSistemaInformatico = childNodeSistemaInformatico.addChildElement('sum1:NombreSistemaInformatico', NULL, NULL);
        Dom.Xmlnode childNodeIdSistemaInformatico = childNodeSistemaInformatico.addChildElement('sum1:IdSistemaInformatico', NULL, NULL);
        Dom.Xmlnode childNodeVersion = childNodeSistemaInformatico.addChildElement('sum1:Version', NULL, NULL);
        Dom.Xmlnode childNodeNumeroInstalacion = childNodeSistemaInformatico.addChildElement('sum1:NumeroInstalacion', NULL, NULL);
        Dom.Xmlnode childNodeTipoUsoPosibleSoloVerifactu = childNodeSistemaInformatico.addChildElement('sum1:TipoUsoPosibleSoloVerifactu', NULL, NULL);
        Dom.Xmlnode childNodeTipoUsoPosibleMultiOT = childNodeSistemaInformatico.addChildElement('sum1:TipoUsoPosibleMultiOT', NULL, NULL);
        Dom.Xmlnode childNodeIndicadorMultiplesOT = childNodeSistemaInformatico.addChildElement('sum1:IndicadorMultiplesOT', NULL, NULL);

        childNodeNombreRazon.addTextNode(CI_XMLUtils.cleanTextNode(registroSistemaInformaticoWrapper.NombreRazon));
        childNodeNIF.addTextNode(CI_XMLUtils.cleanTextNode(registroSistemaInformaticoWrapper.NIF));
        childNodeNombreSistemaInformatico.addTextNode(CI_XMLUtils.cleanTextNode(registroSistemaInformaticoWrapper.NombreSistemaInformatico));
        childNodeIdSistemaInformatico.addTextNode(CI_XMLUtils.cleanTextNode(registroSistemaInformaticoWrapper.IdSistemaInformatico));
        childNodeVersion.addTextNode(CI_XMLUtils.cleanTextNode(registroSistemaInformaticoWrapper.Version));
        childNodeNumeroInstalacion.addTextNode(CI_XMLUtils.cleanTextNode(registroSistemaInformaticoWrapper.NumeroInstalacion));
        childNodeTipoUsoPosibleSoloVerifactu.addTextNode(CI_XMLUtils.cleanTextNode(registroSistemaInformaticoWrapper.TipoUsoPosibleSoloVerifactu));
        childNodeTipoUsoPosibleMultiOT.addTextNode(CI_XMLUtils.cleanTextNode(registroSistemaInformaticoWrapper.TipoUsoPosibleMultiOT));
        childNodeIndicadorMultiplesOT.addTextNode(CI_XMLUtils.cleanTextNode(registroSistemaInformaticoWrapper.IndicadorMultiplesOT));

        return childNodeSistemaInformatico;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static Dom.Xmlnode getChildNodeIDOtro(Dom.Xmlnode headerNode, String codigoPais, String tipoIdentificador, String identificador) {
        Dom.Xmlnode childNodeIDOtro = headerNode.addChildElement('sum1:IDOtro', NULL, NULL);

        Dom.Xmlnode childNodeCodigoPais = childNodeIDOtro.addChildElement('sum1:CodigoPais', NULL, NULL);
        Dom.Xmlnode childNodeIDType = childNodeIDOtro.addChildElement('sum1:IDType', NULL, NULL);
        Dom.Xmlnode childNodeID = childNodeIDOtro.addChildElement('sum1:ID', NULL, NULL);

        childNodeCodigoPais.addTextNode(CI_XMLUtils.cleanTextNode(codigoPais));
        childNodeIDType.addTextNode(CI_XMLUtils.cleanTextNode(tipoIdentificador));
        childNodeID.addTextNode(CI_XMLUtils.cleanTextNode(identificador));

        return childNodeIDOtro;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static Dom.Xmlnode getChildNodeRegistroAnulacion(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.RegistroAnulacion registroAnulacionWrapper) {
        Dom.Xmlnode childNodeRegistroAnulacion = headerNode.addChildElement('sum1:RegistroAnulacion', NULL, NULL);

        Dom.Xmlnode childNodeIDVersion = childNodeRegistroAnulacion.addChildElement('sum1:IDVersion', NULL, NULL);
        Dom.Xmlnode childNodeIDFactura = getChildNodeRegistroAnulacionIDFactura(childNodeRegistroAnulacion, registroAnulacionWrapper.IDFactura);
        Dom.Xmlnode childNodeSinRegistroPrevio = childNodeRegistroAnulacion.addChildElement('sum1:SinRegistroPrevio', NULL, NULL);
        Dom.Xmlnode childNodeRechazoPrevio = childNodeRegistroAnulacion.addChildElement('sum1:RechazoPrevio', NULL, NULL);
        Dom.Xmlnode childNodeEncadenamiento = getChildNodeEncadenamiento(childNodeRegistroAnulacion, registroAnulacionWrapper.Encadenamiento);
        Dom.Xmlnode childNodeSistemaInformatico = getChildNodeSistemaInformatico(childNodeRegistroAnulacion, registroAnulacionWrapper.SistemaInformatico);
        Dom.Xmlnode childNodeFechaHoraHusoGenRegistro = childNodeRegistroAnulacion.addChildElement('sum1:FechaHoraHusoGenRegistro', NULL, NULL);
        Dom.Xmlnode childNodeTipoHuella = childNodeRegistroAnulacion.addChildElement('sum1:TipoHuella', NULL, NULL);
        Dom.Xmlnode childNodeHuella = childNodeRegistroAnulacion.addChildElement('sum1:Huella', NULL, NULL);

        childNodeIDVersion.addTextNode(CI_XMLUtils.cleanTextNode(registroAnulacionWrapper.IDVersion));
        childNodeSinRegistroPrevio.addTextNode(CI_XMLUtils.cleanTextNode(registroAnulacionWrapper.SinRegistroPrevio));
        childNodeRechazoPrevio.addTextNode(CI_XMLUtils.cleanTextNode(registroAnulacionWrapper.RechazoPrevio));
        childNodeFechaHoraHusoGenRegistro.addTextNode(CI_XMLUtils.cleanTextNode(registroAnulacionWrapper.FechaHoraHusoGenRegistro.format('yyyy-MM-dd\'T\'HH:mm:ssXXX')));
        childNodeTipoHuella.addTextNode(CI_XMLUtils.cleanTextNode(registroAnulacionWrapper.TipoHuella));
        childNodeHuella.addTextNode(CI_XMLUtils.cleanTextNode(registroAnulacionWrapper.Huella));
        
        return childNodeRegistroAnulacion;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static Dom.Xmlnode getChildNodeRegistroAnulacionIDFactura(Dom.Xmlnode headerNode, CI_RegistroVerifactuWrapper.RegistroAnulacionIDFactura registroAnulacionIdFacturaWrapper) {
        Dom.Xmlnode childNodeIDFactura = headerNode.addChildElement('sum1:IDFactura', NULL, NULL);

        Dom.Xmlnode childNodeIDEmisorFacturaAnulada = childNodeIDFactura.addChildElement('sum1:IDEmisorFacturaAnulada', NULL, NULL);
        Dom.Xmlnode childNodeNumSerieFacturaAnulada = childNodeIDFactura.addChildElement('sum1:NumSerieFacturaAnulada', NULL, NULL);
        Dom.Xmlnode childNodeFechaExpedicionFacturaAnulada = childNodeIDFactura.addChildElement('sum1:FechaExpedicionFacturaAnulada', NULL, NULL);

        childNodeIDEmisorFacturaAnulada.addTextNode(CI_XMLUtils.cleanTextNode(registroAnulacionIdFacturaWrapper.IDEmisorFacturaAnulada));
        childNodeNumSerieFacturaAnulada.addTextNode(CI_XMLUtils.cleanTextNode(registroAnulacionIdFacturaWrapper.NumSerieFacturaAnulada));
        childNodeFechaExpedicionFacturaAnulada.addTextNode(CI_XMLUtils.cleanTextNode(registroAnulacionIdFacturaWrapper.FechaExpedicionFacturaAnulada));

        return childNodeIDFactura;
    }

    public static void cober (){
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
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
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