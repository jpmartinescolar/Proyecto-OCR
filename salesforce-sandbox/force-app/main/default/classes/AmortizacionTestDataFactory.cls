@isTest
public class AmortizacionTestDataFactory {

    public static String obtenerEmpresaTitular() {
        Schema.DescribeFieldResult dfr = Inmovilizados__c.Empresa_titular__c.getDescribe();
        for (Schema.PicklistEntry pe : dfr.getPicklistValues()) {
            if (pe.isActive()) return pe.getValue();
        }
        return 'Empresa Test';
    }

    public static Plan_general_contable__c crearPlan(String prefijo10) {
        // El campo Name de Plan_general_contable__c tiene validación: 10 dígitos.
        Plan_general_contable__c p = new Plan_general_contable__c(Name = prefijo10);
        insert p;
        return p;
    }

    public static Inmovilizados__c crearInmovilizado(
        Decimal valorInicial, Decimal coef, Date fechaInicio,
        Id cuentaGasto, Id cuentaAcumulada, String empresa
    ) {
        Inmovilizados__c i = new Inmovilizados__c();
        i.Valor_inicial__c = valorInicial;
        i.Coeficiente__c = coef;
        i.Fecha_inicio_amortizaci_n__c = fechaInicio;
        i.Cuenta_contable_gasto_amortizacion__c = cuentaGasto;
        i.Cuenta_contable_amortizaci_n__c = cuentaAcumulada;
        i.Empresa_titular__c = empresa;
        i.Estado__c = 'Alta';
        insert i;
        return i;
    }

    public static Tabla_de_amortizaci_n__c crearTabla(Id inmovilizadoId, String ejercicio, Decimal maximo) {
        Tabla_de_amortizaci_n__c t = new Tabla_de_amortizaci_n__c();
        t.Inmovilizados__c = inmovilizadoId;
        t.Ejercicio__c = ejercicio;
        t.Maximo__c = maximo;
        insert t;
        return t;
    }
}