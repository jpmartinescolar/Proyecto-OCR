/*
 * Created Date: September 2023
 * Author: Lester Romero Bernardo
 * -----
 * Copyright (c) 2023 Calibre360.io
 * -----
 * HISTORY:
 * Date      	By	Comments
 * ----------	---	---------------------------------------------------------
 */

public class CI_GenerarPedidoSubscripcionBatch implements Database.Batchable<SObject>, Database.AllowsCallouts, Database.Stateful, Schedulable{
    private String query;

    public CI_GenerarPedidoSubscripcionBatch() {
        query = Label.CI_GenerarPedidoSubscripcionLabel;
    }

    public CI_GenerarPedidoSubscripcionBatch(String sendQuery) {
        query = sendQuery;
    }

    public Database.QueryLocator start(Database.BatchableContext BC) {
    	return Database.getQueryLocator(query);
	}  

    public void execute(Database.BatchableContext BC, List<sObject> scope) {
        System.savePoint sp = Database.setSavePoint();
        try {
            List<contratos_suscripci_n__c> lstSubscripciones = (List<contratos_suscripci_n__c>)scope;
            
            if (!lstSubscripciones.isEmpty()) {
                CI_GenerarPedidoSubscripcionHelper.generarPedido(lstSubscripciones);
            }

            for(contratos_suscripci_n__c iSub: lstSubscripciones){
                iSub.CI_UltimaFechaPedido__c = System.Today();
            }

            update lstSubscripciones;
        } 
        catch (Exception e) {
            Database.rollback(sp); 
        }
    }
   
    public void execute(SchedulableContext sc) {
		Database.executeBatch(new CI_GenerarPedidoSubscripcionBatch(), 1);
	}
    
	public void finish(Database.BatchableContext BC){     
    }     
}