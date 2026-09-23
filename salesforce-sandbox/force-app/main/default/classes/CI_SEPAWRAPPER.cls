/*
*   @Class : CI_SEPAWRAPPER
*
*   @Author             :   José Ernesto <jose@calibre360.io>
*   @Created            :   25 ene 2024
*   @Description        :   WRAPPER Class de la estructura de etiquetas del fichero XML SEPA
*/
public with sharing class CI_SEPAWRAPPER {
    public class SEPAXmlBase {
		public SEPAXmlGrpHdr iGrpHdr;
		public List<SEPAXmlPmtInf> iPmtInfList;
	}

	public class SEPAXmlGrpHdr {
		public String iMsgId;
		public DateTime iCreDtTm;
		public String iNbOfTxs;
		public Decimal iCtrlSum;
        
        //InitgPty -- Id -- OrgId -- Othr -- Issr
        public String iIssr;
        
        //InitgPty -- Id -- OrgId -- Othr -- SchmeNm -- Prtry
        public String iInitgPtyPrtry;

		//InitgPty -- Nm
		public String iNm;

		//InitgPty -- Id -- OrgId -- Othr -- Id
		public String iId;
	}

	public class SEPAXmlPmtInf {
		public String iPmtInfId;
		public String iPmtMtd;
		public String iNbOfTxs;
		public Decimal iCtrlSum;

		//PmtTpInf -- SvcLvl -- Cd
		public String iPmtTpInfSvcLvlCd;

		//PmtTpInf -- SvcLvl -- SeqTp
		public String iPmtTpInfSeqTp;
        
		//PmtTpInf -- LclInstrm -- Cd
		public String iPmtTpInfLclInstrmCd;

		public DateTime iReqdColltnDt;

		//Cdtr -- Nm
		public String iCdtrNm;
        
        //Cdtr -- PstlAdr -- Ctry
		public String iCdtrCtry;
        
        //Cdtr -- PstlAdr -- AdrLine1
		public String iCdtrAdrLine1;
        
        //Cdtr -- PstlAdr -- AdrLine2
		public String iCdtrAdrLine2;

		//CdtrAcct -- Id -- IBAN
		public String iCdtrAcctIdIBAN;
        
		//CdtrAcct -- Ccy
		public String iCdtrAcctCcy;

		//CdtrAgt -- FinInstnId -- BIC
		public String iCdtrAgtFinInstnIdBIC;

		//CdtrSchmeId -- Id -- PrvtId -- Othr -- Id
		public String iCdtrSchmeId;
        
		//CdtrSchmeId -- Id -- PrvtId -- Othr -- SchmeNm -- Prtry
		public String iCdtrSchmePrtry;

		public List<SEPAXmlDrctDbtTxInf> iDrctDbtTxInfList;
	}

	public class SEPAXmlDrctDbtTxInf {
		//PmtId -- EndToEndId
		public String iEndToEndId;
        
		//PmtId -- InstrId
		public String iPmtIdInstrId;

		public Decimal iInstdAmt;
		
		//DrctDbtTx -- MndtRltdInf -- MndtId
		public String iMndtId;

		//DrctDbtTx -- MndtRltdInf -- DtOfSgntr
		public DateTime iDtOfSgntr;  

		//DrctDbtTx -- MndtRltdInf -- AmdmntInd
		public String iAmdmntInd;

		//DbtrAgt -- FinInstnId -- BIC
		public String iDbtrAgtFinInstnIdBIC;

		//Dbtr -- Nm
		public String iDbtrNm;
        
		//Dbtr -- PstlAdr -- Ctry
		public String iDbtrPstlAdrCtry;

		//Dbtr -- PstlAdr -- AdrLine
		public String iDbtrPstlAdrAdrLine;

		//DbtrAcct -- Id -- IBAN
		public String iDbtrAcctIdIBAN;
        
        //RmtInf -- Ustrd
		public String iRmtInfUstrd;
	}
}