/**
 * Interfaz de calculo de un concepto retributivo.
 * Las clases indicadas en Nom_Concepto__c.Clase_Apex__c (Forma_Calculo = Apex)
 * deben implementarla. El motor las instancia dinamicamente.
 */
public interface Nom_ICalculoConcepto {
    /**
     * @param ctx      contexto del calculo (contrato, empleado, config, devengos previos...)
     * @param concepto el concepto que se esta calculando
     * @return importe bruto del concepto
     */
    Decimal calcular(Nom_ContextoCalculo ctx, Nom_Concepto__c concepto);
}