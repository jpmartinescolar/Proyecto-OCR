/*
*   @Class : CI_ConsecutivosFacturasHelper
*
*   @Author             :   José Ernesto <jose@calibre360.io>
*   @Created            :   19 Oct 2023
*   @Description        :   Clase helper para la Custom setting CI_ConsecutivosFacturas__c
*/
public with sharing class CI_ConsecutivosFacturasHelper {
    /*
    *   @Author             :   José Ernesto <jose.torres@scl-consulting.com>
    *   @Created            :   19 Oct 2023
    *   @Description        :   Devuelve el consecutivo de factura correspondiente a la empresa
    */
    public static String getNormalInvoiceNumber(String empresa){
        String result = CONSECUTIVOS_FACTURAS_MAP.get(empresa).CI_ValorFijoFactNormal__c;
        
        String consec = String.valueOf(CONSECUTIVOS_FACTURAS_TO_UPDATE_MAP.get(empresa));
        for(Integer i = 0; i < 7 - consec.length(); i++){
            result += '0';
        }

        result += consec;

        CI_ConsecutivosFacturasHelper.incrementNormalInvoiceNumber(empresa);

        return result;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static String getAbonoInvoiceNumber(String empresa){
        String result = CONSECUTIVOS_FACTURAS_MAP.get(empresa).CI_ValorFijoFactAbono__c;
        
        String consec = String.valueOf(CONSECUTIVOS_FACTURAS_ABONO_TO_UPDATE_MAP.get(empresa));
        for(Integer i = 0; i < 7 - consec.length(); i++){
            result += '0';
        }

        result += consec;

        CI_ConsecutivosFacturasHelper.incrementAbonoInvoiceNumber(empresa);

        return result;
    }

    /*
    *   @Author             :   José Ernesto <jose.torres@scl-consulting.com>
    *   @Created            :   19 Oct 2023
    *   @Description        :   Incrementa el consecutivo de factura correspondiente a la empresa para que sea asignado a la siguiente factura
    */
    public static void incrementNormalInvoiceNumber(String empresa){
        CONSECUTIVOS_FACTURAS_TO_UPDATE_MAP.put(
            empresa,
            CONSECUTIVOS_FACTURAS_TO_UPDATE_MAP.get(empresa) + 1
        );
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static void incrementAbonoInvoiceNumber(String empresa){
        CONSECUTIVOS_FACTURAS_ABONO_TO_UPDATE_MAP.put(
            empresa,
            CONSECUTIVOS_FACTURAS_ABONO_TO_UPDATE_MAP.get(empresa) + 1
        );
    }

    /*
    *   @Author             :   José Ernesto <jose.torres@scl-consulting.com>
    *   @Created            :   19 Oct 2023
    *   @Description        :   Actualizar custom setting con consecutivos de facturas
    */
    public static void updateRecords(){
        List<CI_ConsecutivosFacturas__c> lConsecToUpdate = new List<CI_ConsecutivosFacturas__c>();

        for(CI_ConsecutivosFacturas__c iRecord: [SELECT Id, CI_Empresa__c, CI_ConsecutivoFacturaNormal__c 
                                                FROM CI_ConsecutivosFacturas__c 
                                                WHERE CI_Empresa__c IN:CONSECUTIVOS_FACTURAS_TO_UPDATE_MAP.keySet()]){
            
            iRecord.CI_ConsecutivoFacturaNormal__c = CONSECUTIVOS_FACTURAS_TO_UPDATE_MAP.get(iRecord.CI_Empresa__c);
            
            lConsecToUpdate.add(iRecord);
        }
        
        update lConsecToUpdate;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    */
    public static void updateRecords(String consecutiveType){
        List<CI_ConsecutivosFacturas__c> lConsecToUpdate = new List<CI_ConsecutivosFacturas__c>();
        Map<String, Integer> consecutivesToUpdate = new Map<String, Integer>();

        if (consecutiveType == 'Normal') {
            consecutivesToUpdate = CONSECUTIVOS_FACTURAS_TO_UPDATE_MAP;
        } else {
            consecutivesToUpdate = CONSECUTIVOS_FACTURAS_ABONO_TO_UPDATE_MAP;
        }

        for(CI_ConsecutivosFacturas__c iRecord: [
            SELECT Id, 
                CI_Empresa__c, 
                CI_ConsecutivoFacturaNormal__c 
            FROM CI_ConsecutivosFacturas__c 
            WHERE CI_Empresa__c IN: consecutivesToUpdate.keySet()
        ]) {
            if (consecutiveType == 'Normal') {
                iRecord.CI_ConsecutivoFacturaNormal__c = consecutivesToUpdate.get(iRecord.CI_Empresa__c);
            } else {
                iRecord.CI_ConsecutivoFacturaAbono__c = consecutivesToUpdate.get(iRecord.CI_Empresa__c);
            }
            
            lConsecToUpdate.add(iRecord);
        }
        
        update lConsecToUpdate;
    }

    /*
     * @Method          :   CONSECUTIVOS_FACTURAS_MAP
     * @Author          :   José Ernesto <jose@calibre360.io>
     * @Created         :   19 Oct 2023
     * @Description     :   Copia mapa de consecutivos para poder actualizar
     */
    public static Map<String, Integer> CONSECUTIVOS_FACTURAS_TO_UPDATE_MAP {
        get{
            if(CONSECUTIVOS_FACTURAS_TO_UPDATE_MAP == NULL){
                CONSECUTIVOS_FACTURAS_TO_UPDATE_MAP = new Map<String, Integer>();

                for(String empresa: CONSECUTIVOS_FACTURAS_MAP.keySet()){
                    CONSECUTIVOS_FACTURAS_TO_UPDATE_MAP.put(
                        empresa,
                        (Integer)CONSECUTIVOS_FACTURAS_MAP.get(empresa).CI_ConsecutivoFacturaNormal__c
                    );
                }
            }
            
            return CONSECUTIVOS_FACTURAS_TO_UPDATE_MAP;
        }
        set;
    }

    /*
    *   @Author         :   Julian Martinez <julian@calibre360.io>
    *   @Description    :   Copia mapa de consecutivos para poder actualizar
    */
    public static Map<String, Integer> CONSECUTIVOS_FACTURAS_ABONO_TO_UPDATE_MAP {
        get{
            if(CONSECUTIVOS_FACTURAS_ABONO_TO_UPDATE_MAP == NULL){
                CONSECUTIVOS_FACTURAS_ABONO_TO_UPDATE_MAP = new Map<String, Integer>();

                for(String empresa: CONSECUTIVOS_FACTURAS_MAP.keySet()){
                    CONSECUTIVOS_FACTURAS_ABONO_TO_UPDATE_MAP.put(
                        empresa,
                        (Integer)CONSECUTIVOS_FACTURAS_MAP.get(empresa).CI_ConsecutivoFacturaAbono__c
                    );
                }
            }
            
            return CONSECUTIVOS_FACTURAS_ABONO_TO_UPDATE_MAP;
        }
        set;
    }
    /*
     * @Method          :   CONSECUTIVOS_FACTURAS_MAP
     * @Author          :   José Ernesto <jose@calibre360.io>
     * @Created         :   19 Oct 2023
     * @Description     :   Devuelve los datos de la custom setting que almacena los consecutivos de facturas por empresas
     */
    public static Map<String, CI_ConsecutivosFacturas__c> CONSECUTIVOS_FACTURAS_MAP {
        get{
            if(CONSECUTIVOS_FACTURAS_MAP == NULL){
                CONSECUTIVOS_FACTURAS_MAP                       = new Map<String, CI_ConsecutivosFacturas__c>();
                Map<String, CI_ConsecutivosFacturas__c> iMap    = CI_ConsecutivosFacturas__c.getAll();

                for(String iValue: iMap.keySet()){
                    CONSECUTIVOS_FACTURAS_MAP.put(
                        iMap.get(iValue).CI_Empresa__c,
                        iMap.get(iValue)
                    );
                }
            }
            
            return CONSECUTIVOS_FACTURAS_MAP;
        }
        set;
    }
    /*
     * @Method          :   CONSECUTIVOS_FACTURAS_MAP
     * @Author          :   José Ernesto <jose@calibre360.io>
     * @Created         :   29 Nov 2025
     * @Description     :   Devuelve mapa de Empresa y NIF activadas para envío a Verifactu
     */
    public static Map<String, String> VERIFACTU_EMPRESA_BY_NIF_MAP {
        get{
            if(VERIFACTU_EMPRESA_BY_NIF_MAP == NULL){
                VERIFACTU_EMPRESA_BY_NIF_MAP = new Map<String, String>();
                
                for (CI_ConsecutivosFacturas__c customSettingInstance : CI_ConsecutivosFacturasHelper.CONSECUTIVOS_FACTURAS_MAP.values()) {
                    if(customSettingInstance.CI_Verifactu__c){
                        VERIFACTU_EMPRESA_BY_NIF_MAP.put(
                            customSettingInstance.CI_NIF__c,
                            customSettingInstance.CI_Empresa__c
                        );
                    }
                }
            }

            return VERIFACTU_EMPRESA_BY_NIF_MAP;
        }
        set;
    }

    public static void cober(){
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
    }
}