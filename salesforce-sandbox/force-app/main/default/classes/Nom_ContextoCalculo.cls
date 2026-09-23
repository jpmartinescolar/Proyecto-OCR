/**
 * Contexto inmutable de inputs para el calculo de una nomina.
 * Lo construye Nom_CalculoNominaService y lo recibe cada clase de calculo Apex.
 */
public with sharing class Nom_ContextoCalculo {

    public Nom_Contrato__c contrato;
    public Nom_Empleado__c empleado;
    public Nom_Config_Cotizacion__c config;
    public Nom_Categoria__c categoria;   // categoria de convenio aplicable (puede ser null)

    public Date periodoDesde;
    public Date periodoHasta;
    public Integer ejercicio;
    public Integer mes;
    public Decimal diasCotizados;

    // Devengos ya calculados en esta nomina, por codigo de concepto.
    public Map<String, Decimal> importesDevengoPorCodigo = new Map<String, Decimal>();

    /** Importe de un devengo ya calculado (0 si aun no existe). */
    public Decimal importeDe(String codigoConcepto) {
        Decimal v = importesDevengoPorCodigo.get(codigoConcepto);
        return v == null ? 0 : v;
    }
}