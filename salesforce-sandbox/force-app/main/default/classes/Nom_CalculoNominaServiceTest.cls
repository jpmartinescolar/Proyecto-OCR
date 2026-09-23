@isTest
private class Nom_CalculoNominaServiceTest {

    @TestSetup
    static void setup() {
        Account empresa = new Account(Name = 'Empresa Test SL',
            Procedencia_del_cliente__c = 'Test automatizado');
        insert empresa;

        Nom_Empleado__c emp = new Nom_Empleado__c(
            Name = 'Juan Perez', Empresa__c = empresa.Id,
            NIF__c = '12345678Z', Situacion_Familiar_IRPF__c = '3');
        insert emp;

        Nom_Contrato__c ct = new Nom_Contrato__c(
            Empleado__c = emp.Id, Tipo_Contrato__c = '100',
            Fecha_Inicio__c = Date.newInstance(2010, 1, 1),
            Jornada__c = 'Completa', Tipo_IRPF__c = 15, Activo__c = true);
        insert ct;

        insert new Nom_Config_Cotizacion__c(
            Ejercicio__c = Date.today().year(),
            Tipo_CC_Trabajador__c = 4.70, Tipo_Desempleo_Trabajador__c = 1.55,
            Tipo_FP_Trabajador__c = 0.10, Tipo_HHEE_Normales_Trab__c = 4.70,
            Tipo_HHEE_FuerzaMayor_Trab__c = 2.00,
            Base_Maxima__c = 4909.50, Base_Minima__c = 1000);

        Nom_Concepto__c salarioBase = new Nom_Concepto__c(
            Name = 'Salario base', Codigo__c = '001', Tipo__c = 'Devengo',
            Naturaleza__c = 'Salarial', Activo__c = true, Orden__c = 1,
            Base_CC__c = true, Base_CP_AT__c = true, Base_Conjunta__c = true,
            Tributa_IRPF__c = true, Forma_Calculo__c = 'ImporteFijo', Importe_Fijo__c = 2000);
        insert salarioBase;

        insert new Nom_Condiciones__c(
            Contrato__c = ct.Id, Concepto__c = salarioBase.Id,
            Importe__c = 2000, Activo__c = true);
    }

    private static Date inicioMes() { return Date.today().toStartOfMonth(); }
    private static Date finMes() { return Date.today().toStartOfMonth().addMonths(1).addDays(-1); }

    @isTest
    static void testCalculoNominaBasica() {
        Nom_Contrato__c ct = [SELECT Id FROM Nom_Contrato__c LIMIT 1];

        Test.startTest();
        Nom_Recibo__c r = Nom_CalculoNominaService.calcular(ct.Id, inicioMes(), finMes());
        Test.stopTest();

        System.assertEquals(2000, r.Total_Devengado__c, 'Total devengado');
        System.assertEquals(2000, r.Base_CC__c, 'Base contingencias comunes');
        System.assertEquals(94.00, r.Cuota_Trab_CC__c, 'Cuota CC = 2000 * 4,70%');
        // Deducciones: CC 94 + desempleo 31 + FP 2 + IRPF 300 = 427
        System.assertEquals(427.00, r.Total_Deducciones__c, 'Total deducciones');
        System.assertEquals(1573.00, r.Liquido__c, 'Liquido = 2000 - 427');

        Integer nLineas = [SELECT COUNT() FROM Nom_Linea__c WHERE Recibo__c = :r.Id];
        System.assert(nLineas >= 2, 'Debe haber lineas de devengo y deduccion');
    }

    @isTest
    static void testRecalculoIdempotente() {
        Nom_Contrato__c ct = [SELECT Id FROM Nom_Contrato__c LIMIT 1];
        Nom_CalculoNominaService.calcular(ct.Id, inicioMes(), finMes());
        Nom_CalculoNominaService.calcular(ct.Id, inicioMes(), finMes());
        Integer n = [SELECT COUNT() FROM Nom_Recibo__c WHERE Contrato__c = :ct.Id];
        System.assertEquals(1, n, 'El recalculo de un borrador no debe duplicar el recibo');
    }

    @isTest
    static void testCascadeDelete() {
        Nom_Contrato__c ct = [SELECT Id FROM Nom_Contrato__c LIMIT 1];
        Nom_Recibo__c r = Nom_CalculoNominaService.calcular(ct.Id, inicioMes(), finMes());
        delete r;
        System.assertEquals(0, [SELECT COUNT() FROM Nom_Linea__c WHERE Recibo__c = :r.Id],
            'Las lineas deben borrarse en cascada');
    }

    @isTest
    static void testCalculoAntiguedadApex() {
        Nom_ContextoCalculo ctx = new Nom_ContextoCalculo();
        ctx.contrato = new Nom_Contrato__c(Fecha_Inicio__c = Date.newInstance(2010, 1, 1));
        ctx.periodoHasta = Date.newInstance(2025, 1, 1);
        Decimal importe = new Nom_CalculoAntiguedad().calcular(ctx, new Nom_Concepto__c());
        System.assert(importe > 0, 'La antiguedad tras 15 anos debe ser positiva');
    }

    @isTest
    static void testConvenioNoAplicableError() {
        Account empresa = [SELECT Id FROM Account LIMIT 1];
        Nom_Empleado__c emp = [SELECT Id FROM Nom_Empleado__c LIMIT 1];
        Nom_Convenio__c conv = new Nom_Convenio__c(Name = 'Convenio no declarado');
        insert conv;

        Nom_Contrato__c ct = new Nom_Contrato__c(
            Empleado__c = emp.Id, Tipo_Contrato__c = '100',
            Fecha_Inicio__c = Date.today(), Convenio__c = conv.Id);

        Test.startTest();
        Boolean fallo = false;
        try { insert ct; } catch (DmlException e) { fallo = true; }
        Test.stopTest();

        System.assert(fallo, 'Debe impedir un convenio no declarado como aplicable');
    }
}