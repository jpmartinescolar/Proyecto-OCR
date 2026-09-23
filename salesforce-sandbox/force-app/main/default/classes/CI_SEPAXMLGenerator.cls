/*
*   @Class : CI_SEPAXMLGenerator
*
*   @Author             :   José Ernesto <jose@calibre360.io>
*   @Created            :   25 ene 2024
*   @Description        :   Clase principal para la confección del XML
*/
public with sharing class CI_SEPAXMLGenerator {
    public final static String FRST         = 'FRST';
    public final static String RCUR         = 'RCUR';
    public final static String ConfigName   = 'SEPA008';
 
 
    /*
     *  @Author          : José Ernesto <jose@calibre360.io>
     *  @Created         : 25 ene 2024
     *  @Description     : Creates Wrapper by SEPA Map
     */
    public static void generateWrappersFromSEPAs(Id idRemesa, String stringFRST, String stringRCUR){
        CI_Remesa__c iRemesa =  [
            SELECT
                Id,CI_XMLMsgId__c,CreatedDate,CI_NumeroEfectos__c,CI_ImporteRemesa__c,
                CI_FechaRemesa__c,CI_FRSTNbOfTxs__c,CI_FRSTCtrlSum__c,CI_RCURNbOfTxs__c,
                CI_RCURCtrlSum__c, CI_EmpresaTitular__c, Estado__c, 
                (SELECT Id, 
                    CI_Efecto__r.Mandato_SEPA__r.Bancos__r.Banco__c, 
                    CI_Efecto__r.Mandato_SEPA__r.Bancos__r.IBAN_domiciliaci_n__c, 
                    CI_Efecto__r.Mandato_SEPA__r.Bancos__r.BIC__c, 
                    CI_Efecto__r.Mandato_SEPA__r.Bancos__r.Identificador_del_acreedor_SEPA__c
                FROM RemesasEfectos__r)
            FROM CI_Remesa__c
            WHERE Id =:idRemesa
            LIMIT 1
        ];
 
        Mandato_SEPA__c mandato = iRemesa.RemesasEfectos__r[0].CI_Efecto__r.Mandato_SEPA__r;
 
        //***hay que obtener los datos de la empresa titular relacionada al registro Remesa que se está procesando */
        // GALP_SEPA_Configuration__c conf = [
        //     SELECT Name, GALP_CompanyName__c, GALP_CompanyId__c, GALP_BANumber__c, GALP_BABIC__c, GALP_BAName__c,
        //      GALP_Ctry__c, GALP_AdrLine1__c, GALP_AdrLine2__c, GALP_DaysToReqdColltnDt__c
        //  FROM GALP_SEPA_Configuration__c WHERE Name =: ConfigName LIMIT 1
        // ];
 
 
        List<CI_SEPAWRAPPER.SEPAXmlPmtInf> iWrapperPmtInfList = new List<CI_SEPAWRAPPER.SEPAXmlPmtInf>();
 
 
        if (stringFRST != NULL && stringFRST != '') {
            iWrapperPmtInfList.add(BuildSEPAXmlPmtInfNode(iRemesa, mandato, FRST));
        }
        if (stringRCUR != NULL && stringRCUR != '') {
            iWrapperPmtInfList.add(BuildSEPAXmlPmtInfNode(iRemesa, mandato, RCUR));
        }
 
 
        CI_SEPAWRAPPER.SEPAXmlGrpHdr iWrapperHdr = new CI_SEPAWRAPPER.SEPAXmlGrpHdr();
        iWrapperHdr.iMsgId          = iRemesa.CI_XMLMsgId__c;
        iWrapperHdr.iCreDtTm        = iRemesa.CreatedDate;
        iWrapperHdr.iNbOfTxs        = iRemesa.CI_NumeroEfectos__c != null ? String.valueOf(iRemesa.CI_NumeroEfectos__c) : '';
        iWrapperHdr.iCtrlSum        = iRemesa.CI_ImporteRemesa__c;
        iWrapperHdr.iNm             = iRemesa.CI_EmpresaTitular__c;
        iWrapperHdr.iId             = mandato.Bancos__r.Identificador_del_acreedor_SEPA__c;
        iWrapperHdr.iInitgPtyPrtry  = 'SEPA';
        iWrapperHdr.iIssr           = 'ISO';
 
 
        CI_SEPAWRAPPER.SEPAXmlBase iWrapper = new CI_SEPAWRAPPER.SEPAXmlBase();
        iWrapper.iGrpHdr        = iWrapperHdr;
        iWrapper.iPmtInfList    = iWrapperPmtInfList;
 
 
        String result = generateSEPAXmlBase(iWrapper);
       
        if (!String.isBlank(stringFRST)) {
            result = result.replace('<__etiquetaParastringFRST__ />', stringFRST );
        }
        if (!String.isBlank(stringRCUR)) {
            result = result.replace('<__etiquetaParastringRCUR__ />', stringRCUR );
        }
       
        Attachment attachment   = new Attachment();
        attachment.ParentId     = iRemesa.Id;
        attachment.Name         = iRemesa.CI_XMLMsgId__c;
        attachment.Body         = Blob.valueOf(result);
 
 
        if (attachment != NULL) {
            insert attachment;
            CleanAttachment(attachment);
        }

        iRemesa.Estado__c       = 'Generado SEPA';

        update iRemesa;
    }
    /*
     *  @Author          : José Ernesto <jose@calibre360.io>
     *  @Created         : 25 ene 2024
     *  @Description     : Delete all Attachment with the current Sepa.Id, but not the last one.
     */
     public static void CleanAttachment(Attachment lastAttachment){
        List<Attachment> lstAtt = [SELECT Id FROM Attachment WHERE ParentId =: lastAttachment.ParentId];
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
     *  @Author          : José Ernesto <jose@calibre360.io>
     *  @Created         : 25 ene 2024
     *  @Description     : Create CI_SEPAWRAPPER.SEPAXmlDrctDbtTxInf Instance
     */
    public static CI_SEPAWRAPPER.SEPAXmlDrctDbtTxInf getSEPAXmlDrctDbtTxInf(CI_RemesaEfecto__c iEfecto){
        CI_SEPAWRAPPER.SEPAXmlDrctDbtTxInf iSEPAXmlDrctDbtTxInf = new CI_SEPAWRAPPER.SEPAXmlDrctDbtTxInf();
        iSEPAXmlDrctDbtTxInf.iEndToEndId    = iEfecto.Id;
        // iSEPAXmlDrctDbtTxInf.iPmtIdInstrId  = iEfecto.GALP_AutoNumberFinal__c;//no parece necesario
        iSEPAXmlDrctDbtTxInf.iInstdAmt      = iEfecto.CI_ImporteReal__c;
        iSEPAXmlDrctDbtTxInf.iMndtId        = iEfecto.CI_Efecto__r.Mandato_SEPA__r.N_SEPA__c;
        iSEPAXmlDrctDbtTxInf.iDtOfSgntr     = Date.Today();
        iSEPAXmlDrctDbtTxInf.iAmdmntInd     = 'false';
 
 
        iSEPAXmlDrctDbtTxInf.iDbtrNm                = iEfecto.CI_Efecto__r.Cliente__r.Name;
        iSEPAXmlDrctDbtTxInf.iDbtrAcctIdIBAN        = iEfecto.CI_Efecto__r.Mandato_SEPA__r.IBAN_Cliente__c;
        iSEPAXmlDrctDbtTxInf.iDbtrAgtFinInstnIdBIC  = iEfecto.CI_Efecto__r.Mandato_SEPA__r.Bancos__r.BIC__c;
 
 
        //NO DEBEN SER NECSARIOS***
        // iSEPAXmlDrctDbtTxInf.iDbtrPstlAdrCtry       = iEfecto.GALP_DbtrPstlAdrCtry__c;
        // iSEPAXmlDrctDbtTxInf.iDbtrPstlAdrAdrLine    = iEfecto.GALP_DbtrPstlAdrAdrLine__c;
        // iSEPAXmlDrctDbtTxInf.iRmtInfUstrd           = iEfecto.GALP_Invoice__r.GALP_InvoiceNumber__c != null ? sepaPaymentObj.GALP_Invoice__r.GALP_InvoiceNumber__c : null;
 
 
        return iSEPAXmlDrctDbtTxInf;
    }
    /*
     *  @Author          : José Ernesto <jose@calibre360.io>
     *  @Created         : 25 ene 2024
     *  @Description     : Creates Wrapper by SEPA Map
     */
    public static CI_SEPAWRAPPER.SEPAXmlPmtInf BuildSEPAXmlPmtInfNode(
        CI_Remesa__c iRemesa,
        Mandato_SEPA__c mandato,
        String iType
    ){
 
 
        CI_SEPAWRAPPER.SEPAXmlPmtInf iSEPAXmlPmtInf = new CI_SEPAWRAPPER.SEPAXmlPmtInf();
        iSEPAXmlPmtInf.iPmtInfId                = iRemesa.Id + '-' + iType;
        iSEPAXmlPmtInf.iPmtMtd                  = 'DD';
        iSEPAXmlPmtInf.iPmtTpInfSvcLvlCd        = 'SEPA';
        iSEPAXmlPmtInf.iReqdColltnDt            = iRemesa.CI_FechaRemesa__c;
        ///***Datos de la empresa titular que corresponda
        iSEPAXmlPmtInf.iCdtrNm                  = iRemesa.CI_EmpresaTitular__c;
        iSEPAXmlPmtInf.iCdtrAcctIdIBAN          = mandato.Bancos__r.IBAN_domiciliaci_n__c;
        iSEPAXmlPmtInf.iCdtrAgtFinInstnIdBIC    = mandato.Bancos__r.BIC__c;
        iSEPAXmlPmtInf.iCdtrSchmeId             = mandato.Bancos__r.Identificador_del_acreedor_SEPA__c;
        iSEPAXmlPmtInf.iCdtrSchmePrtry          = 'SEPA';
        iSEPAXmlPmtInf.iPmtTpInfLclInstrmCd     = 'CORE';
 
 
        //***no deben ser necesarios pero mantenerlo para estar seguro tras pruebas */
        // iSEPAXmlPmtInf.iCdtrCtry            = iConf.GALP_Ctry__c;
        // iSEPAXmlPmtInf.iCdtrAdrLine1        = iConf.GALP_AdrLine1__c;
        // iSEPAXmlPmtInf.iCdtrAdrLine2        = iConf.GALP_AdrLine2__c;
        // iSEPAXmlPmtInf.iCdtrAcctCcy         = iSepa.GALP_CdtrAcctCcy__c;
 
 
        if (iType == FRST) {
            iSEPAXmlPmtInf.iNbOfTxs         = iRemesa.CI_FRSTNbOfTxs__c != null ? String.valueOf(iRemesa.CI_FRSTNbOfTxs__c) : '';
            iSEPAXmlPmtInf.iCtrlSum         = iRemesa.CI_FRSTCtrlSum__c;
            iSEPAXmlPmtInf.iPmtTpInfSeqTp   = FRST;                
        }
        else {
            iSEPAXmlPmtInf.iNbOfTxs         = iRemesa.CI_RCURNbOfTxs__c != null ? String.valueOf(iRemesa.CI_RCURNbOfTxs__c) : '';
            iSEPAXmlPmtInf.iCtrlSum         = iRemesa.CI_RCURCtrlSum__c;
            iSEPAXmlPmtInf.iPmtTpInfSeqTp   = RCUR;
        }
 
 
        return iSEPAXmlPmtInf;
    }
    /*
     *  @Author          : José Ernesto <jose@calibre360.io>
     *   @Created        : 25 ene 2024
     *  @Description     : Creates the SEPA XML general information
     */
    public static String generateSEPAXmlBase(CI_SEPAWRAPPER.SEPAXmlBase wrapper) {
        Dom.Document doc        = new Dom.Document();
        Dom.Xmlnode rootNode    = doc.createRootElement('Document', '', '');
        rootNode.setNamespace('xsi','http://www.w3.org/2001/XMLSchema-instance'); 
        rootNode.setNamespace('xsd','http://www.w3.org/2001/XMLSchema'); 
        rootNode.setNamespace('','urn:iso:std:iso:20022:tech:xsd:pain.008.001.02');
        Dom.Xmlnode headerNode  = rootNode.addChildElement('CstmrDrctDbtInitn', null, null);
       
        Dom.Xmlnode childNodeGrpHdr = getChildNodeGrpHdr(headerNode, wrapper);
 
 
        for(CI_SEPAWRAPPER.SEPAXmlPmtInf iPmt: wrapper.iPmtInfList){
            Dom.Xmlnode childNodePmtInf = getChildNodePmtInf(headerNode, iPmt);
        }
 
 
        String xmlString = doc.toXmlString();
     
        return xmlString;
    }
    /*
     *  @Author          : José Ernesto <jose@calibre360.io>
     *   @Created        : 25 ene 2024
     *  @Description     : Creates the SEPA XML header information
     */
    public static Dom.Xmlnode getChildNodeGrpHdr(Dom.Xmlnode headerNode, CI_SEPAWRAPPER.SEPAXmlBase wrapper){
        Dom.Xmlnode childNodeGrpHdr = headerNode.addChildElement('GrpHdr', null, null);
       
        Dom.Xmlnode childNodeGrpHdrMsgId    = childNodeGrpHdr.addChildElement('MsgId', null, null);
        Dom.Xmlnode childNodeCreDtTm        = childNodeGrpHdr.addChildElement('CreDtTm', null, null);
        Dom.Xmlnode childNodeNbOfTxs        = childNodeGrpHdr.addChildElement('NbOfTxs', null, null);
        Dom.Xmlnode childNodeCtrlSum        = childNodeGrpHdr.addChildElement('CtrlSum', null, null);
       
        Dom.Xmlnode childNodeInitgPty       = getChildNodeInitgPty(childNodeGrpHdr, wrapper);
 
 
        childNodeGrpHdrMsgId.addTextNode(CI_XMLUtils.cleanTextNode(wrapper.iGrpHdr.iMsgId));
        childNodeCreDtTm.addTextNode(wrapper.iGrpHdr.iCreDtTm != null ? CI_XMLUtils.cleanTextNode(wrapper.iGrpHdr.iCreDtTm.format('yyyy-MM-dd\'T\'HH:mm:ss')) : '');
        childNodeNbOfTxs.addTextNode(CI_XMLUtils.cleanTextNode(wrapper.iGrpHdr.iNbOfTxs));
        childNodeCtrlSum.addTextNode(CI_XMLUtils.cleanTextNode(String.valueOf(wrapper.iGrpHdr.iCtrlSum)));
 
 
        CI_XMLUtils.removeIfNotHasChild(childNodeGrpHdr);
 
 
        return childNodeGrpHdr;
    }
    /*
     *  @Author          : José Ernesto <jose@calibre360.io>
     *   @Created        : 25 ene 2024
     *  @Description     : Creates the SEPA XML children Grp information
     */
    public static Dom.Xmlnode getChildNodeInitgPty(Dom.Xmlnode childNodeGrpHdr, CI_SEPAWRAPPER.SEPAXmlBase wrapper){
        Dom.Xmlnode childNodeInitgPty           = childNodeGrpHdr.addChildElement('InitgPty', null, null);
       
        Dom.Xmlnode childNodeNm                 = childNodeInitgPty.addChildElement('Nm', null, null);
       
        Dom.Xmlnode childNodeId                 = childNodeInitgPty.addChildElement('Id', null, null);
        Dom.Xmlnode childNodeOrgId              = childNodeId.addChildElement('OrgId', null, null);
        Dom.Xmlnode childNodeOthr               = childNodeOrgId.addChildElement('Othr', null, null);
        Dom.Xmlnode childNodeOthrId             = childNodeOthr.addChildElement('Id', null, null);     
        Dom.Xmlnode childNodeOthrSchmeNm        = childNodeOthr.addChildElement('SchmeNm', null, null);
        Dom.Xmlnode childNodeOthrSchmeNmPrtry   = childNodeOthrSchmeNm.addChildElement('Prtry', null, null);
        Dom.Xmlnode childNodeOthrIssr           = childNodeOthr.addChildElement('Issr', null, null);
       
        childNodeNm.addTextNode(CI_XMLUtils.cleanTextNode(wrapper.iGrpHdr.iNm));
        childNodeOthrId.addTextNode(CI_XMLUtils.cleanTextNode(wrapper.iGrpHdr.iId));
        childNodeOthrSchmeNmPrtry.addTextNode(CI_XMLUtils.cleanTextNode(wrapper.iGrpHdr.iInitgPtyPrtry));
        childNodeOthrIssr.addTextNode(CI_XMLUtils.cleanTextNode(wrapper.iGrpHdr.iIssr));
 
 
        CI_XMLUtils.removeIfNotHasChild(childNodeInitgPty);
 
 
        return childNodeInitgPty;
    }
    /*
     *  @Author          : José Ernesto <jose@calibre360.io>
     *   @Created        : 25 ene 2024
     *  @Description     : Creates the SEPA XML children Pmt information
     */
    public static Dom.Xmlnode getChildNodePmtInf(Dom.Xmlnode headerNode, CI_SEPAWRAPPER.SEPAXmlPmtInf iPmtInfList){
        Dom.Xmlnode childNodePmtInf         = headerNode.addChildElement('PmtInf', null, null);
   
        Dom.Xmlnode childNodePmtInfId       = childNodePmtInf.addChildElement('PmtInfId', null, null);
        Dom.Xmlnode childNodePmtMtd         = childNodePmtInf.addChildElement('PmtMtd', null, null);
        Dom.Xmlnode childNodeNbOfTxs        = childNodePmtInf.addChildElement('NbOfTxs', null, null);
        Dom.Xmlnode childNodeCtrlSum        = childNodePmtInf.addChildElement('CtrlSum', null, null);
       
        Dom.Xmlnode childNodePmtTpInf       = childNodePmtInf.addChildElement('PmtTpInf', null, null);
        Dom.Xmlnode childNodeSvcLvl         = childNodePmtTpInf.addChildElement('SvcLvl', null, null);
        Dom.Xmlnode childNodeSvcLvlCd       = childNodeSvcLvl.addChildElement('Cd', null, null);
        Dom.Xmlnode childNodeLclInstrm      = childNodePmtTpInf.addChildElement('LclInstrm', null, null);
        Dom.Xmlnode childNodeLclInstrmCd    = childNodeLclInstrm.addChildElement('Cd', null, null);    
        Dom.Xmlnode childNodeSeqTp          = childNodePmtTpInf.addChildElement('SeqTp', null, null);
       
        Dom.Xmlnode childNodeReqdColltnDt   = childNodePmtInf.addChildElement('ReqdColltnDt', null, null);
       
        Dom.Xmlnode childNodeCdtr           = childNodePmtInf.addChildElement('Cdtr', null, null);
        Dom.Xmlnode childNodeCdtrNm         = childNodeCdtr.addChildElement('Nm', null, null);
        // Dom.Xmlnode childNodeCdtrPstlAdr         = childNodeCdtr.addChildElement('PstlAdr', null, null);
        // Dom.Xmlnode childNodeCdtrPstlAdrCtry     = childNodeCdtrPstlAdr.addChildElement('Ctry', null, null);
        // Dom.Xmlnode childNodeCdtrPstlAdrAdrLine1 = childNodeCdtrPstlAdr.addChildElement('AdrLine', null, null);
        // Dom.Xmlnode childNodeCdtrPstlAdrAdrLine2 = childNodeCdtrPstlAdr.addChildElement('AdrLine', null, null);
       
        Dom.Xmlnode childNodeCdtrAcct       = childNodePmtInf.addChildElement('CdtrAcct', null, null);
        Dom.Xmlnode childNodeCdtrAcctId     = childNodeCdtrAcct.addChildElement('Id', null, null);
        Dom.Xmlnode childNodeFinInstnIdIBAN = childNodeCdtrAcctId.addChildElement('IBAN', null, null);
        // Dom.Xmlnode childNodeCdtrAcctCcy    = childNodeCdtrAcct.addChildElement('Ccy', null, null);
 
 
        Dom.Xmlnode childNodeCdtrAgt        = childNodePmtInf.addChildElement('CdtrAgt', null, null);
        Dom.Xmlnode childNodeFinInstnId     = childNodeCdtrAgt.addChildElement('FinInstnId', null, null);
        Dom.Xmlnode childNodeFinInstnIdBIC  = childNodeFinInstnId.addChildElement('BIC', null, null);
 
 
        Dom.Xmlnode childNodeCdtrSchmeId        = childNodePmtInf.addChildElement('CdtrSchmeId', null, null);
        Dom.Xmlnode childNodeCdtrSchmeIdId      = childNodeCdtrSchmeId.addChildElement('Id', null, null);
        Dom.Xmlnode childNodeCdtrSchmeIdPrvtId  = childNodeCdtrSchmeIdId.addChildElement('PrvtId', null, null);
        Dom.Xmlnode childNodeCdtrSchmeIdOthr    = childNodeCdtrSchmeIdPrvtId.addChildElement('Othr', null, null);
        Dom.Xmlnode childNodeCdtrSchmeIdOthrId  = childNodeCdtrSchmeIdOthr.addChildElement('Id', null, null);
        Dom.Xmlnode childNodeCdtrSchmeIdOthrSchmeNm         = childNodeCdtrSchmeIdOthr.addChildElement('SchmeNm', null, null);
        Dom.Xmlnode childNodeCdtrSchmeIdOthrSchmeNmPrtry    = childNodeCdtrSchmeIdOthrSchmeNm.addChildElement('Prtry', null, null);
 
 
        if (iPmtInfList.iPmtTpInfSeqTp == FRST) {
            Dom.Xmlnode etiquetaParastringFRST = childNodePmtInf.addChildElement('__etiquetaParastringFRST__', null, null);
        } else if (iPmtInfList.iPmtTpInfSeqTp == RCUR) {
            Dom.Xmlnode etiquetaParastringRCUR = childNodePmtInf.addChildElement('__etiquetaParastringRCUR__', null, null);
        }
 
 
        childNodePmtInfId.addTextNode(CI_XMLUtils.cleanTextNode(iPmtInfList.iPmtInfId));
        childNodePmtMtd.addTextNode(CI_XMLUtils.cleanTextNode(iPmtInfList.iPmtMtd));
        childNodeNbOfTxs.addTextNode(CI_XMLUtils.cleanTextNode(iPmtInfList.iNbOfTxs));
        childNodeCtrlSum.addTextNode(CI_XMLUtils.cleanTextNode(String.valueOf(iPmtInfList.iCtrlSum)));
        childNodeSvcLvlCd.addTextNode(CI_XMLUtils.cleanTextNode(iPmtInfList.iPmtTpInfSvcLvlCd));
        childNodeSeqTp.addTextNode(CI_XMLUtils.cleanTextNode(iPmtInfList.iPmtTpInfSeqTp));
        childNodeReqdColltnDt.addTextNode(iPmtInfList.iReqdColltnDt != null ? CI_XMLUtils.cleanTextNode(iPmtInfList.iReqdColltnDt.format('yyyy-MM-dd')) : '');
        childNodeCdtrNm.addTextNode(CI_XMLUtils.cleanTextNode(iPmtInfList.iCdtrNm));
        childNodeFinInstnIdIBAN.addTextNode(CI_XMLUtils.cleanTextNode(iPmtInfList.iCdtrAcctIdIBAN));
        childNodeFinInstnIdBIC.addTextNode(CI_XMLUtils.cleanTextNode(iPmtInfList.iCdtrAgtFinInstnIdBIC));
        childNodeCdtrSchmeIdOthrId.addTextNode(CI_XMLUtils.cleanTextNode(iPmtInfList.iCdtrSchmeId));
        childNodeLclInstrmCd.addTextNode(iPmtInfList.iPmtTpInfLclInstrmCd == null ? '' : CI_XMLUtils.cleanTextNode(iPmtInfList.iPmtTpInfLclInstrmCd));
        childNodeCdtrSchmeIdOthrSchmeNmPrtry.addTextNode(iPmtInfList.iCdtrSchmePrtry == null ? '' : CI_XMLUtils.cleanTextNode(iPmtInfList.iCdtrSchmePrtry));
        // childNodeCdtrPstlAdrCtry.addTextNode(iPmtInfList.iCdtrCtry == null ? '' : CI_XMLUtils.cleanTextNode(iPmtInfList.iCdtrCtry));
        // childNodeCdtrPstlAdrAdrLine1.addTextNode(iPmtInfList.iCdtrAdrLine1 == null ? '' : CI_XMLUtils.cleanTextNode(iPmtInfList.iCdtrAdrLine1));
        // childNodeCdtrPstlAdrAdrLine2.addTextNode(iPmtInfList.iCdtrAdrLine2 == null ? '' : CI_XMLUtils.cleanTextNode(iPmtInfList.iCdtrAdrLine2));
        // childNodeCdtrAcctCcy.addTextNode(iPmtInfList.iCdtrAcctCcy == null ? '' : CI_XMLUtils.cleanTextNode(iPmtInfList.iCdtrAcctCcy));
 
 
        return childNodePmtInf;
    }
    /*
     *  @Author          : José Ernesto <jose@calibre360.io>
     *   @Created        : 25 ene 2024
     *  @Description     : Creates the SEPA XML children DrctDbtTx information
     */
    public static String getChildNodeDrctDbtTxInf(CI_SEPAWRAPPER.SEPAXmlDrctDbtTxInf iSEPAXmlDrctDbtTxInf){
        DOM.Document doc = new DOM.Document();
        dom.XmlNode childNodeDrctDbtTxInf   = doc.createRootElement('DrctDbtTxInf', null, null);
 
 
        Dom.Xmlnode childNodePmtId          = childNodeDrctDbtTxInf.addChildElement('PmtId', null, null);
        Dom.Xmlnode childNodeInstrId        = childNodePmtId.addChildElement('InstrId', null, null);
        Dom.Xmlnode childNodeEndToEndId     = childNodePmtId.addChildElement('EndToEndId', null, null);
       
        Dom.Xmlnode childNodeInstdAmt       = childNodeDrctDbtTxInf.addChildElement('InstdAmt', null, null);
 
 
        Dom.Xmlnode childNodeDrctDbtTx      = childNodeDrctDbtTxInf.addChildElement('DrctDbtTx', null, null);
        Dom.Xmlnode childNodeMndtRltdInf    = childNodeDrctDbtTx.addChildElement('MndtRltdInf', null, null);
        Dom.Xmlnode childNodeMndtId         = childNodeMndtRltdInf.addChildElement('MndtId', null, null);
        Dom.Xmlnode childNodeDtOfSgntr      = childNodeMndtRltdInf.addChildElement('DtOfSgntr', null, null);
        Dom.Xmlnode childNodeAmdmntInd      = childNodeMndtRltdInf.addChildElement('AmdmntInd', null, null);
 
 
        Dom.Xmlnode childNodeDbtrAgt        = childNodeDrctDbtTxInf.addChildElement('DbtrAgt', null, null);
        Dom.Xmlnode childNodeFinInstnId     = childNodeDbtrAgt.addChildElement('FinInstnId', null, null);
        Dom.Xmlnode childNodeBIC            = childNodeFinInstnId.addChildElement('BIC', null, null);
 
 
        Dom.Xmlnode childNodeDbtr           = childNodeDrctDbtTxInf.addChildElement('Dbtr', null, null);
        Dom.Xmlnode childNodeDbtrNm         = childNodeDbtr.addChildElement('Nm', null, null);
        Dom.Xmlnode childNodeDbtrPstlAdr    = childNodeDbtr.addChildElement('PstlAdr', null, null);
        Dom.Xmlnode childNodeDbtrPstlAdrCtry    = childNodeDbtrPstlAdr.addChildElement('Ctry', null, null);
        Dom.Xmlnode childNodeDbtrPstlAdrAdrLine = childNodeDbtrPstlAdr.addChildElement('AdrLine', null, null);
 
 
        Dom.Xmlnode childNodeDbtrAcct   = childNodeDrctDbtTxInf.addChildElement('DbtrAcct', null, null);
        Dom.Xmlnode childNodeDbtrId     = childNodeDbtrAcct.addChildElement('Id', null, null);
        Dom.Xmlnode childNodeIBAN       = childNodeDbtrId.addChildElement('IBAN', null, null);
       
        Dom.Xmlnode childNodeRmtInf     = childNodeDrctDbtTxInf.addChildElement('RmtInf', null, null);
        Dom.Xmlnode childNodeUstrd      = childNodeRmtInf.addChildElement('Ustrd', null, null);
       
        if (iSEPAXmlDrctDbtTxInf.iEndToEndId != NULL) {
            childNodeEndToEndId.addTextNode(CI_XMLUtils.cleanTextNode(iSEPAXmlDrctDbtTxInf.iEndToEndId));
        }
        childNodeInstdAmt.setAttribute('Ccy','EUR');
        if(iSEPAXmlDrctDbtTxInf.iInstdAmt != NULL){
            childNodeInstdAmt.addTextNode(CI_XMLUtils.cleanTextNode(String.valueOf(iSEPAXmlDrctDbtTxInf.iInstdAmt)));  
        }
        if(iSEPAXmlDrctDbtTxInf.iMndtId != NULL){
            childNodeMndtId.addTextNode(CI_XMLUtils.cleanTextNode(iSEPAXmlDrctDbtTxInf.iMndtId));
        }
        if(iSEPAXmlDrctDbtTxInf.iDtOfSgntr != null){
            childNodeDtOfSgntr.addTextNode(iSEPAXmlDrctDbtTxInf.iDtOfSgntr != null ? CI_XMLUtils.cleanTextNode(iSEPAXmlDrctDbtTxInf.iDtOfSgntr.format('yyyy-MM-dd')) : '');
        }
        if (iSEPAXmlDrctDbtTxInf.iAmdmntInd != NULL) {
            childNodeAmdmntInd.addTextNode(CI_XMLUtils.cleanTextNode(iSEPAXmlDrctDbtTxInf.iAmdmntInd));
        }
        if (iSEPAXmlDrctDbtTxInf.iDbtrAgtFinInstnIdBIC != NULL) {
            childNodeBIC.addTextNode(CI_XMLUtils.cleanTextNode(iSEPAXmlDrctDbtTxInf.iDbtrAgtFinInstnIdBIC));
        }
        if (iSEPAXmlDrctDbtTxInf.iDbtrNm != NULL) {
            childNodeDbtrNm.addTextNode(CI_XMLUtils.cleanTextNode(iSEPAXmlDrctDbtTxInf.iDbtrNm));
        }
        if (iSEPAXmlDrctDbtTxInf.iDbtrAcctIdIBAN !=NULL) {
            childNodeIBAN.addTextNode(CI_XMLUtils.cleanTextNode(iSEPAXmlDrctDbtTxInf.iDbtrAcctIdIBAN));
        } 
        if (iSEPAXmlDrctDbtTxInf.iRmtInfUstrd !=NULL) {
            childNodeUstrd.addTextNode(CI_XMLUtils.cleanTextNode(iSEPAXmlDrctDbtTxInf.iRmtInfUstrd));
        } 
        if (iSEPAXmlDrctDbtTxInf.iPmtIdInstrId != null){
            childNodeInstrId.addTextNode(CI_XMLUtils.cleanTextNode(iSEPAXmlDrctDbtTxInf.iPmtIdInstrId));           
        }
        if (iSEPAXmlDrctDbtTxInf.iDbtrPstlAdrCtry != null){
            childNodeDbtrPstlAdrCtry.addTextNode(CI_XMLUtils.cleanTextNode(iSEPAXmlDrctDbtTxInf.iDbtrPstlAdrCtry));           
        }
        if (iSEPAXmlDrctDbtTxInf.iDbtrPstlAdrAdrLine != null){
            childNodeDbtrPstlAdrAdrLine.addTextNode(CI_XMLUtils.cleanTextNode(iSEPAXmlDrctDbtTxInf.iDbtrPstlAdrAdrLine));           
        }
 
 
        CI_XMLUtils.removeIfNotHasChild(childNodeDrctDbtTxInf);
 
 
        String stringNode   = doc.toXmlString();
        stringNode          = stringNode.replace('<?xml version="1.0" encoding="UTF-8"?>', '');
        return stringNode;
    }
}