/**
 * Ejemplo de calculo Apex de un concepto: antiguedad por trienios.
 * Demostracion de la salida "Apex" de Forma_Calculo. Importe por trienio meramente
 * ilustrativo; en real vendria de la tabla de convenio.
 */
public with sharing class Nom_CalculoAntiguedad implements Nom_ICalculoConcepto {

    @TestVisible private static Decimal importeTrienio = 30;

    public Decimal calcular(Nom_ContextoCalculo ctx, Nom_Concepto__c concepto) {
        if (ctx == null || ctx.contrato == null || ctx.contrato.Fecha_Inicio__c == null) {
            return 0;
        }
        Integer meses = ctx.contrato.Fecha_Inicio__c.monthsBetween(ctx.periodoHasta);
        if (meses < 0) {
            return 0;
        }
        Integer trienios = meses / 36;
        return (importeTrienio * trienios).setScale(2, System.RoundingMode.HALF_UP);
    }
}