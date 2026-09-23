/*
*   @Class : CI_EfectoClienteHelper
*
*   @Author             :   José Ernesto <jose@calibre360.io>
*   @Created            :   18 ene 2024
*   @Description        :   Helper Class para los registro Reclamaci_n_de_impagados__c "Efectos de Cliente"
*/
public with sharing class CI_EfectoClienteHelper {
    public final static String ESTADO_PENDIENTE     = 'Pendiente';
    public final static String ESTADO_EN_REMESA     = 'En remesa';
    public final static String ESTADO_PAGADO        = 'Pagado';
    public final static String ESTADO_DEVUELTO      = 'Devuelto';

    public final static String TIPO_FRST        = 'FRST';
    public final static String TIPO_RCUR        = 'RCUR';

    /* @Method          :   updateStatusToEnRemesa
     * @Author          :   José Ernesto <jose@calibre360.io>
     * @Created         :   18 ene 2024
     * @Description     :   Actualizar estado de los Efectos incluidos en una Remesa
    */
    public static void updateStatusToEnRemesa(List<Reclamaci_n_de_impagados__c> lEfectosToUpdate) {
        for(Reclamaci_n_de_impagados__c iEfecto: lEfectosToUpdate){
            iEfecto.Estado__c = CI_EfectoClienteHelper.ESTADO_EN_REMESA;
        }
        
        if(!lEfectosToUpdate.isEmpty()){
            update lEfectosToUpdate;
        }
    }
}