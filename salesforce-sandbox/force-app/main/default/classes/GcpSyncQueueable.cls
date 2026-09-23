/**
 * Reintento en segundo plano de la confirmación en Google de un Buzon_test__c cuyo archivo
 * ya está en Cloud Storage. Backoff de 1, 5 y 10 minutos; tras el último intento queda en Error.
 * La confirmación es idempotente en Google (UPSERT por sf_record_id), así que reintentar no duplica.
 */
public with sharing class GcpSyncQueueable implements Queueable, Database.AllowsCallouts {

    public static final Integer MAX_INTENTOS = 3;
    /** Minutos de espera antes de cada intento (índice = número de intento - 1) */
    private static final List<Integer> ESPERA_MINUTOS = new List<Integer>{ 1, 5, 10 };

    private final Id recordId;
    private final Integer intento;

    public GcpSyncQueueable(Id recordId, Integer intento) {
        this.recordId = recordId;
        this.intento = intento;
    }

    public static Id encolar(Id recordId, Integer intento) {
        Integer espera = ESPERA_MINUTOS[Math.min(intento, ESPERA_MINUTOS.size()) - 1];
        // En tests no hay retardo ni encadenamiento real de colas
        if (Test.isRunningTest()) espera = 0;
        return System.enqueueJob(new GcpSyncQueueable(recordId, intento), espera);
    }

    public void execute(QueueableContext ctx) {
        Buzon_test__c r = SubirFacturasController.cargar(recordId);
        if (r.Estado_sincronizacion__c == SubirFacturasController.ESTADO_SINCRONIZADO) return;
        r.Intentos__c = (r.Intentos__c == null ? 0 : r.Intentos__c) + 1;
        try {
            SubirFacturasController.aplicarConfirmacion(r, GcpBuzonService.confirmar(r, r.Empresa__r.CIF__c));
            Database.update(r, AccessLevel.USER_MODE);
        } catch (GcpBuzonService.GcpBuzonException e) {
            Boolean quedanIntentos = e.reintentable && intento < MAX_INTENTOS;
            r.Ultimo_error__c = ('Intento ' + intento + ' de ' + MAX_INTENTOS + ': ' + e.getMessage()).left(32768);
            r.Estado_sincronizacion__c = quedanIntentos
                ? SubirFacturasController.ESTADO_SUBIDO
                : SubirFacturasController.ESTADO_ERROR;
            Database.update(r, AccessLevel.USER_MODE);
            // Para producción: al quedar en Error, avisar al administrador (Custom Notification o Platform Event)
            if (quedanIntentos && !Test.isRunningTest()) encolar(recordId, intento + 1);
        }
    }
}
