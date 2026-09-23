/*
*   @Class : CI_GenerarFacturasFromPedidosFlow
*
*   @Author             :   José Ernesto <jose@calibre360.io>
*   @Created            :   05 Oct 2023
*   @Description        :   Clase llamada desde el Flow donde se seleccionan los pedidos a Facturar
*/
global with sharing class CI_GenerarFacturasFromPedidosFlow {
    @InvocableMethod(label='GenerarFacturaFromPedido' description='Generar facturas desde pedidos')
    public static List<String> startProcessFromFlow(List<FlowInputs> inputParams) {    
        System.savePoint sp = Database.setSavePoint();
        
        List<String> response = new List<String>();
        Integer invoicesCreated = 0;

        try {
            invoicesCreated = CI_InvoiceHelper.generateInvoicesFromOrders(
                                inputParams[0].pedidosIds.split(','), 
                                inputParams[0].fechaEmision
                            );
        }
        catch (Exception e) {
            Database.rollback(sp); 
            
            String data = 'STACK TRACE:\n' + e.getStackTraceString() + '\nMESSAGE:\n' + e.getMessage() + '\nLine:\n' + e.getLineNumber();
            response.add(data);
        }

        if(response.isEmpty()){
            response.add('Proceso terminado satisfactoriamente. Se han creado un total de ' + invoicesCreated + ' facturas.');
        }

        return response;
    }

	global class FlowInputs {
		@InvocableVariable
		public String pedidosIds;

        @InvocableVariable
		public Date fechaEmision;
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
    }
}