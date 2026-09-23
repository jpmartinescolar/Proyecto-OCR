/**
 * Logica de los triggers del componente de nominas (un trigger por objeto delega aqui).
 */
public with sharing class Nom_TriggerHandler {

    /** Borrado en cascada de las lineas al borrar un recibo (la linea es lookup, no MD). */
    public static void cascadeDeleteLineas(List<Nom_Recibo__c> recibos) {
        if (recibos == null || recibos.isEmpty()) { return; }
        List<Nom_Linea__c> hijas = [SELECT Id FROM Nom_Linea__c WHERE Recibo__c IN :recibos];
        if (!hijas.isEmpty()) { delete hijas; }
    }

    /** Pobla la clave unica del concepto: GLOBAL-codigo o <empresaId>-codigo. */
    public static void poblarClaveUnica(List<Nom_Concepto__c> conceptos) {
        for (Nom_Concepto__c c : conceptos) {
            String ambito = (c.Empresa__c == null) ? 'GLOBAL' : String.valueOf(c.Empresa__c);
            String codigo = (c.Codigo__c == null) ? '' : c.Codigo__c;
            c.Clave_Unica__c = ambito + '-' + codigo;
        }
    }

    /** Valida que el convenio del contrato este declarado como aplicable para la empresa del empleado. */
    public static void validarConvenioContrato(List<Nom_Contrato__c> contratos) {
        Set<Id> empleadoIds = new Set<Id>();
        for (Nom_Contrato__c ct : contratos) {
            if (ct.Convenio__c != null && ct.Empleado__c != null) { empleadoIds.add(ct.Empleado__c); }
        }
        if (empleadoIds.isEmpty()) { return; }

        Map<Id, Id> empresaPorEmpleado = new Map<Id, Id>();
        for (Nom_Empleado__c e : [SELECT Id, Empresa__c FROM Nom_Empleado__c WHERE Id IN :empleadoIds]) {
            empresaPorEmpleado.put(e.Id, e.Empresa__c);
        }

        Set<Id> empresaIds = new Set<Id>(empresaPorEmpleado.values());
        Set<String> permitidos = new Set<String>();
        for (Nom_Convenio_Aplicable__c ca : [
                SELECT Empresa__c, Convenio__c FROM Nom_Convenio_Aplicable__c WHERE Empresa__c IN :empresaIds]) {
            permitidos.add(ca.Empresa__c + '|' + ca.Convenio__c);
        }

        for (Nom_Contrato__c ct : contratos) {
            if (ct.Convenio__c == null) { continue; }
            Id empresaId = empresaPorEmpleado.get(ct.Empleado__c);
            if (empresaId == null) { continue; }
            if (!permitidos.contains(empresaId + '|' + ct.Convenio__c)) {
                ct.addError('El convenio seleccionado no esta declarado como aplicable para la empresa del empleado. '
                    + 'Anadelo primero en "Convenios Aplicables" de la empresa.');
            }
        }
    }
}