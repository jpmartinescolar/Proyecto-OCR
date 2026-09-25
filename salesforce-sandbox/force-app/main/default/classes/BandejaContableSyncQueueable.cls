/**
 * Reintento en segundo plano de la confirmación en Google de un Bandeja_Contable_Archivo__c cuyo archivo
 * ya está en Cloud Storage. Espera 1, 5 y 10 minutos; tras el último intento queda en Error.
 * La confirmación es idempotente en Google (upsert por Id de Salesforce), así que reintentar no duplica.
 */
public with sharing class BandejaContableSyncQueueable implements Queueable, Database.AllowsCallouts {

    public static final Integer MAX_INTENTOS = 3;
    /** Minutos de espera antes de cada intento (índice = número de intento - 1) */
    private static final List<Integer> ESPERA_MINUTOS = new List<Integer>{ 1, 5, 10 };

    private final Id archivoId;
    private final Integer intento;

    public BandejaContableSyncQueueable(Id archivoId, Integer intento) {
        this.archivoId = archivoId;
        this.intento = intento;
    }

    public static Id encolar(Id archivoId, Integer intento) {
        Integer espera = ESPERA_MINUTOS[Math.min(intento, ESPERA_MINUTOS.size()) - 1];
        // En tests no hay retardo ni encadenamiento real de colas
        if (Test.isRunningTest()) espera = 0;
        return System.enqueueJob(new BandejaContableSyncQueueable(archivoId, intento), espera);
    }

    public void execute(QueueableContext ctx) {
        Bandeja_Contable_Archivo__c a = BandejaContableController.cargar(archivoId);
        if (a.Estado__c == BandejaContableController.ESTADO_SINCRONIZADO) return;
        a.Intentos__c = (a.Intentos__c == null ? 0 : a.Intentos__c) + 1;
        try {
            BandejaContableController.aplicarConfirmacion(a, BandejaContableGcpService.confirmar(a));
        } catch (BandejaContableGcpService.GcpException e) {
            Boolean quedanIntentos = e.reintentable && intento < MAX_INTENTOS;
            a.Ultimo_error__c = ('Intento ' + intento + ' de ' + MAX_INTENTOS + ': ' + e.getMessage()).left(32768);
            a.Estado__c = quedanIntentos ? BandejaContableController.ESTADO_SUBIDO : BandejaContableController.ESTADO_ERROR;
            BandejaContableController.actualizar(a);
            if (quedanIntentos && !Test.isRunningTest()) encolar(archivoId, intento + 1);
        }
    }
}
