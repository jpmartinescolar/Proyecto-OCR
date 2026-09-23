/**
 * Tests para las 5 clases del módulo PyG:
 *   - PyGStructure
 *   - PyGMensualController
 *   - PyGController
 *   - PyGAnaliticoController
 *   - PyGExportPDFController
 */
@isTest
private class PyGControllersTest {

    // Elegimos el primer valor activo del picklist en runtime — sirve en cualquier entorno
    private static final String EMPRESA = primerValorPicklist('Linea_asiento_contable__c', 'Empresa_titular__c');
    private static final String AREA    = primerValorPicklist('Linea_asiento_contable__c', 'rea__c');

    private static String primerValorPicklist(String objApi, String fieldApi) {
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objApi);
        if (t == null) return null;
        Schema.DescribeFieldResult fr = t.getDescribe().fields.getMap().get(fieldApi).getDescribe();
        for (Schema.PicklistEntry e : fr.getPicklistValues()) {
            if (e.isActive()) return e.getValue();
        }
        return null;
    }

    @TestSetup
    static void setup() {
        // Cuentas PGC: 7xx (ingresos), 6xx (gastos), 64x (personal), 705 con apartado/subapartado para el analítico
        List<Plan_general_contable__c> cuentas = new List<Plan_general_contable__c>();

        Plan_general_contable__c p705 = new Plan_general_contable__c(
            Name = '7050000000', T_tulo_cuenta__c = 'Prestaciones de servicios',
            Apartados__c = '01. Operaciones',
            Categor_a_Anal_tica_PyG__c = '01. Ingresos servicios profesionales'
        );
        cuentas.add(p705);

        Plan_general_contable__c p700 = new Plan_general_contable__c(
            Name = '7000000000', T_tulo_cuenta__c = 'Ventas de mercaderías',
            Apartados__c = '01. Operaciones',
            Categor_a_Anal_tica_PyG__c = '06. Distribución oficial de Fastbanc'
        );
        cuentas.add(p700);

        Plan_general_contable__c p62 = new Plan_general_contable__c(
            Name = '6210000000', T_tulo_cuenta__c = 'Arrendamientos y cánones',
            Apartados__c = '02. Alquileres e Instalaciones'
        );
        cuentas.add(p62);

        Plan_general_contable__c p64 = new Plan_general_contable__c(
            Name = '6400000000', T_tulo_cuenta__c = 'Sueldos y salarios',
            Apartados__c = '03. Recursos Humanos'
        );
        cuentas.add(p64);

        Plan_general_contable__c p68 = new Plan_general_contable__c(
            Name = '6800000000', T_tulo_cuenta__c = 'Amortización inmovilizado',
            Apartados__c = '07. Amortización'
        );
        cuentas.add(p68);

        // Financiero (sin subapartado específico para evitar restricciones de picklist) — entrará en "Rendimiento finanzas"
        Plan_general_contable__c p669 = new Plan_general_contable__c(
            Name = '6690000000', T_tulo_cuenta__c = 'Otros gastos financieros',
            Apartados__c = '08. Financiero'
        );
        cuentas.add(p669);

        // Impuestos
        Plan_general_contable__c p630 = new Plan_general_contable__c(
            Name = '6300000000', T_tulo_cuenta__c = 'Impuesto sobre beneficios',
            Apartados__c = '09. Impuestos'
        );
        cuentas.add(p630);

        // Cuenta sin apartado para alimentar el caso "Sin clasificar analíticamente"
        Plan_general_contable__c pSin = new Plan_general_contable__c(
            Name = '7590000000', T_tulo_cuenta__c = 'Otros ingresos sin clasificar'
        );
        cuentas.add(pSin);

        insert cuentas;

        Integer yr = Date.today().year();
        // Fecha_asiento__c en Linea es fórmula -> necesitamos un Asiento_contable__c por fecha.
        // También seteamos Empresa_titular__c en el padre porque un trigger
        // probablemente sobrescribe el de la línea con el del asiento.
        List<Asiento_contable__c> asientos = new List<Asiento_contable__c>();
        for (Integer i = 0; i < 10; i++) {
            asientos.add(new Asiento_contable__c(Empresa_titular__c = EMPRESA));
        }
        asientos[0].Fecha_asiento_contable__c = Date.newInstance(yr, 1, 15);
        asientos[1].Fecha_asiento_contable__c = Date.newInstance(yr, 2, 5);
        asientos[2].Fecha_asiento_contable__c = Date.newInstance(yr, 3, 1);
        asientos[3].Fecha_asiento_contable__c = Date.newInstance(yr, 4, 1);
        asientos[4].Fecha_asiento_contable__c = Date.newInstance(yr, 5, 31);
        asientos[5].Fecha_asiento_contable__c = Date.newInstance(yr - 1, 6, 15);
        asientos[6].Fecha_asiento_contable__c = Date.newInstance(yr, 6, 10);
        asientos[7].Fecha_asiento_contable__c = Date.newInstance(yr, 7, 20);
        asientos[8].Fecha_asiento_contable__c = Date.newInstance(yr, 9, 15);
        asientos[9].Fecha_asiento_contable__c = Date.newInstance(yr, 10, 5);
        insert asientos;

        List<Linea_asiento_contable__c> lineas = new List<Linea_asiento_contable__c>();
        lineas.add(new Linea_asiento_contable__c(
            Plan__c = p705.Id, Asientos_contable__c = asientos[0].Id,
            Debe__c = 0, Haber__c = 10000,
            Empresa_titular__c = EMPRESA, rea__c = AREA,
            Simulaci_n__c = 'No', Check__c = 'Si'
        ));
        lineas.add(new Linea_asiento_contable__c(
            Plan__c = p700.Id, Asientos_contable__c = asientos[1].Id,
            Debe__c = 0, Haber__c = 4000,
            Empresa_titular__c = EMPRESA, rea__c = AREA,
            Simulaci_n__c = 'No', Check__c = 'No'
        ));
        lineas.add(new Linea_asiento_contable__c(
            Plan__c = p62.Id, Asientos_contable__c = asientos[2].Id,
            Debe__c = 2000, Haber__c = 0,
            Empresa_titular__c = EMPRESA, rea__c = AREA,
            Simulaci_n__c = 'Si', Check__c = 'No'
        ));
        lineas.add(new Linea_asiento_contable__c(
            Plan__c = p64.Id, Asientos_contable__c = asientos[3].Id,
            Debe__c = 5000, Haber__c = 0,
            Empresa_titular__c = EMPRESA, rea__c = AREA,
            Simulaci_n__c = 'Sí. Transferencia', Check__c = 'Si'
        ));
        lineas.add(new Linea_asiento_contable__c(
            Plan__c = p68.Id, Asientos_contable__c = asientos[4].Id,
            Debe__c = 1500, Haber__c = 0,
            Empresa_titular__c = EMPRESA, rea__c = AREA,
            Simulaci_n__c = 'No', Check__c = 'Si'
        ));
        // Línea del año anterior para alimentar el comparativo del rango
        lineas.add(new Linea_asiento_contable__c(
            Plan__c = p705.Id, Asientos_contable__c = asientos[5].Id,
            Debe__c = 0, Haber__c = 8000,
            Empresa_titular__c = EMPRESA, rea__c = AREA,
            Simulaci_n__c = 'No', Check__c = 'Si'
        ));
        // Financiero (Rendimiento finanzas)
        lineas.add(new Linea_asiento_contable__c(
            Plan__c = p669.Id, Asientos_contable__c = asientos[7].Id,
            Debe__c = 200, Haber__c = 0,
            Empresa_titular__c = EMPRESA, rea__c = AREA,
            Simulaci_n__c = 'No', Check__c = 'Si'
        ));
        // Impuestos
        lineas.add(new Linea_asiento_contable__c(
            Plan__c = p630.Id, Asientos_contable__c = asientos[8].Id,
            Debe__c = 1200, Haber__c = 0,
            Empresa_titular__c = EMPRESA, rea__c = AREA,
            Simulaci_n__c = 'No', Check__c = 'Si'
        ));
        // Cuenta sin apartado -> Sin clasificar analíticamente
        lineas.add(new Linea_asiento_contable__c(
            Plan__c = pSin.Id, Asientos_contable__c = asientos[9].Id,
            Debe__c = 0, Haber__c = 350,
            Empresa_titular__c = EMPRESA, rea__c = AREA,
            Simulaci_n__c = 'No', Check__c = 'Si'
        ));
        insert lineas;

        // Apuntes extraordinarios
        List<Apuntes_extraodinarios__c> extras = new List<Apuntes_extraodinarios__c>();
        extras.add(new Apuntes_extraodinarios__c(
            Plan_general_contable__c = p705.Id,
            Debe__c = 0, Haber__c = 1500,
            Fecha_apunte_extraordinario__c = Date.newInstance(yr, 7, 10),
            Empresa_titular__c = EMPRESA,
            rea__c = AREA,
            Simulaci_n__c = 'No', Check__c = 'Si'
        ));
        extras.add(new Apuntes_extraodinarios__c(
            Plan_general_contable__c = p62.Id,
            Debe__c = 600, Haber__c = 0,
            Fecha_apunte_extraordinario__c = Date.newInstance(yr, 8, 20),
            Empresa_titular__c = EMPRESA,
            rea__c = AREA,
            Simulaci_n__c = 'No', Check__c = 'No'
        ));
        insert extras;
    }

    // =================================================================
    //  PyGStructure
    // =================================================================
    @isTest
    static void testPyGStructure() {
        List<PyGStructure.PyGSection> pymes     = PyGStructure.estructura('PGC PYMES');
        List<PyGStructure.PyGSection> abreviado = PyGStructure.estructura('PGC Abreviado');
        List<PyGStructure.PyGSection> normal    = PyGStructure.estructura('PGC Normal');
        System.assert(pymes.size() > 10);
        System.assert(abreviado.size() > 10);
        System.assert(normal.size() > 10);

        // matchSeccion: una cuenta 705 debe encajar en cifra de negocios; una 621 en otros gastos
        String secCN  = PyGStructure.matchSeccion('7050000000', pymes);
        String secGto = PyGStructure.matchSeccion('6210000000', pymes);
        System.assertEquals('CN', secCN);
        System.assertNotEquals(null, secGto);

        // Match con código nulo o vacío
        System.assertEquals(null, PyGStructure.matchSeccion(null, pymes));
        System.assertEquals(null, PyGStructure.matchSeccion('', pymes));
        // Código que no encaja con ninguna sección
        System.assertEquals(null, PyGStructure.matchSeccion('1000000', pymes));
    }

    // =================================================================
    //  PyGMensualController
    // =================================================================
    @isTest
    static void testMensualFilterOptions() {
        Test.startTest();
        PyGMensualController.FilterOptions opts = PyGMensualController.getFilterOptions();
        Test.stopTest();
        System.assertNotEquals(null, opts.empresasTitulares);
        System.assertNotEquals(null, opts.ejercicios);
    }

    @isTest
    static void testMensualGenerarBasico() {
        Integer yr = Date.today().year();
        List<String> empresas = new List<String>{ EMPRESA };
        Test.startTest();
        List<PyGMensualController.PyGRow> rows = PyGMensualController.generar(
            empresas, null, null, yr, 'PGC PYMES', 'Todas', 'Todas', 'Todos'
        );
        Test.stopTest();
        System.assert(rows.size() > 0);
    }

    @isTest
    static void testMensualFiltrosCombinados() {
        Integer yr = Date.today().year();
        List<String> empresas = new List<String>{ EMPRESA };
        Test.startTest();
        // Probamos los 3 planes + todas las combinaciones de los toggles
        PyGMensualController.generar(empresas, AREA, null, yr, 'PGC PYMES',     'No',                'No',    'Si');
        PyGMensualController.generar(empresas, null,  null, yr, 'PGC Normal',    'Si',                'Si',    'No');
        PyGMensualController.generar(empresas, null,  null, yr, 'PGC Abreviado', 'Sí. Transferencia', 'Todas', 'Todos');
        Test.stopTest();
    }

    @isTest
    static void testMensualErroresValidacion() {
        Integer yr = Date.today().year();
        Boolean cazado1 = false, cazado2 = false;
        Test.startTest();
        try {
            PyGMensualController.generar(null, null, null, yr, 'PGC PYMES', 'Todas', 'Todas', 'Todos');
        } catch (AuraHandledException ex) { cazado1 = true; }
        try {
            PyGMensualController.generar(new List<String>{ EMPRESA }, null, null, null, 'PGC PYMES', 'Todas', 'Todas', 'Todos');
        } catch (AuraHandledException ex) { cazado2 = true; }
        Test.stopTest();
        System.assert(cazado1, 'Debe lanzar AuraHandledException con empresas null');
        System.assert(cazado2, 'Debe lanzar AuraHandledException con ejercicio null');
    }

    @isTest
    static void testMensualGetMovimientos() {
        Plan_general_contable__c p = [SELECT Id FROM Plan_general_contable__c WHERE Name = '7050000000' LIMIT 1];
        Integer yr = Date.today().year();
        List<String> empresas = new List<String>{ EMPRESA };
        Test.startTest();
        // Sin mes (todo el año)
        List<PyGMensualController.Movimiento> r1 = PyGMensualController.getMovimientos(
            new List<Id>{ p.Id }, yr, null, null, empresas, null, null, 'Todas', 'Todas', 'Todos', 'Todos'
        );
        // Mes concreto
        List<PyGMensualController.Movimiento> r2 = PyGMensualController.getMovimientos(
            new List<Id>{ p.Id }, yr, 1, 1, empresas, AREA, null, 'No', 'No', 'Si', 'Si'
        );
        // Rango acumulado (mesInicio < mes)
        List<PyGMensualController.Movimiento> r3 = PyGMensualController.getMovimientos(
            new List<Id>{ p.Id }, yr, 6, 1, empresas, null, null, 'Todas', 'Si', 'Todos', 'No'
        );
        // Lista vacía -> 0 resultados
        List<PyGMensualController.Movimiento> rVacio = PyGMensualController.getMovimientos(
            new List<Id>(), yr, null, null, empresas, null, null, 'Todas', 'Todas', 'Todos', 'Todos'
        );
        Test.stopTest();
        System.assert(r1.size() >= 1);
        System.assertNotEquals(null, r2);
        System.assertNotEquals(null, r3);
        System.assertEquals(0, rVacio.size());
    }

    @isTest
    static void testUpdateMovimiento() {
        Linea_asiento_contable__c l = [SELECT Id FROM Linea_asiento_contable__c LIMIT 1];
        Apuntes_extraodinarios__c e = [SELECT Id FROM Apuntes_extraodinarios__c LIMIT 1];
        Campaign camp = new Campaign(Name = 'Camp Test PyG');
        insert camp;
        Test.startTest();
        String r1 = PyGMensualController.updateMovimiento(l.Id, false, AREA, null, 'No', 'No', camp.Id);
        String r2 = PyGMensualController.updateMovimiento(e.Id, true,  AREA, null, 'Si', 'Si', camp.Id);
        // Borrar valores (todos null)
        String r3 = PyGMensualController.updateMovimiento(l.Id, false, null, null, null, null, null);
        Boolean cazado = false;
        try {
            PyGMensualController.updateMovimiento(null, false, null, null, null, null, null);
        } catch (AuraHandledException ex) { cazado = true; }
        Test.stopTest();
        System.assertEquals('OK', r1);
        System.assertEquals('OK', r2);
        System.assertEquals('OK', r3);
        System.assert(cazado, 'Debe lanzar excepción con recordId null');
    }

    // =================================================================
    //  PyGController (rango con comparativo)
    // =================================================================
    @isTest
    static void testRangoFilterOptions() {
        Test.startTest();
        PyGController.FilterOptions opts = PyGController.getFilterOptions();
        Test.stopTest();
        System.assertNotEquals(null, opts);
    }

    @isTest
    static void testRangoGenerar() {
        Integer yr = Date.today().year();
        List<String> empresas = new List<String>{ EMPRESA };
        Date d1 = Date.newInstance(yr, 1, 1);
        Date d2 = Date.newInstance(yr, 12, 31);
        Date c1 = Date.newInstance(yr - 1, 1, 1);
        Date c2 = Date.newInstance(yr - 1, 12, 31);
        Test.startTest();
        List<PyGController.PyGRow> r1 = PyGController.generar(
            empresas, null, null, d1, d2, c1, c2, 'PGC PYMES', 'Todas', 'Todas', 'Todos'
        );
        List<PyGController.PyGRow> r2 = PyGController.generar(
            empresas, AREA, null, d1, d2, c1, c2, 'PGC Normal', 'No', 'Si', 'Si'
        );
        Test.stopTest();
        System.assert(r1.size() > 0);
        System.assert(r2.size() > 0);
    }

    @isTest
    static void testRangoGenerarErrores() {
        Integer yr = Date.today().year();
        Date d1 = Date.newInstance(yr, 1, 1);
        Date d2 = Date.newInstance(yr, 12, 31);
        Boolean cazado1 = false, cazado2 = false;
        Test.startTest();
        try {
            PyGController.generar(null, null, null, d1, d2, d1, d2, 'PGC PYMES', 'Todas', 'Todas', 'Todos');
        } catch (AuraHandledException ex) { cazado1 = true; }
        try {
            PyGController.generar(new List<String>{ EMPRESA }, null, null, null, d2, d1, d2, 'PGC PYMES', 'Todas', 'Todas', 'Todos');
        } catch (AuraHandledException ex) { cazado2 = true; }
        Test.stopTest();
        System.assert(cazado1);
        System.assert(cazado2);
    }

    // A.4 = A.3 + impuesto CON SIGNO: el gasto por impuesto (negativo) resta y un
    // abono/impuesto diferido a favor (positivo) suma. Antes se restaba el bucket,
    // invirtiendo el efecto en ambos casos.
    @isTest
    static void testResultadoEjercicioConImpuesto() {
        Integer yr = Date.today().year();
        Date d1 = Date.newInstance(yr, 1, 1), d2 = Date.newInstance(yr, 12, 31);
        List<PyGController.PyGRow> rows = PyGController.generar(
            new List<String>{ EMPRESA }, null, null, d1, d2, d1, d2, 'PGC PYMES', 'Todas', 'No', 'Todos');
        Decimal a3, a4, imp;
        for (PyGController.PyGRow r : rows) {
            if (r.tipo == 'SUBTOTAL' && r.concepto.startsWith('A.3')) a3 = r.valorActual;
            if (r.tipo == 'SUBTOTAL' && r.concepto.startsWith('A.4')) a4 = r.valorActual;
            if (r.tipo == 'SECCION' && r.concepto.startsWith('Impuesto')) imp = r.valorActual;
        }
        System.assertEquals(-1200, imp, 'El gasto por impuesto va con signo negativo (Haber-Debe)');
        System.assertEquals(a3 + imp, a4, 'A.4 = A.3 + impuesto con signo');
    }

    @isTest
    static void testRangoGetMovimientos() {
        Integer yr = Date.today().year();
        Plan_general_contable__c p = [SELECT Id FROM Plan_general_contable__c LIMIT 1];
        List<String> empresas = new List<String>{ EMPRESA };
        Test.startTest();
        List<PyGController.Movimiento> mvs = PyGController.getMovimientos(
            new List<Id>{ p.Id },
            Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31),
            empresas, null, null, 'Todas', 'Todas', 'Todos',
            new List<String>{ 'Asiento Reg. Cierre' }
        );
        // Sin cuentaIds -> 0
        List<PyGController.Movimiento> vacio = PyGController.getMovimientos(
            new List<Id>(),
            Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31),
            empresas, null, null, 'Todas', 'Todas', 'Todos', null
        );
        Test.stopTest();
        System.assertNotEquals(null, mvs);
        System.assertEquals(0, vacio.size());
    }

    // =================================================================
    //  PyGAnaliticoController
    // =================================================================
    @isTest
    static void testAnaliticoFilterOptions() {
        Test.startTest();
        PyGAnaliticoController.FilterOptions opts = PyGAnaliticoController.getFilterOptions();
        Test.stopTest();
        System.assertNotEquals(null, opts);
    }

    @isTest
    static void testAnaliticoGenerar() {
        Integer yr = Date.today().year();
        List<String> empresas = new List<String>{ EMPRESA };
        Test.startTest();
        List<PyGAnaliticoController.PyGRow> r1 = PyGAnaliticoController.generar(
            empresas, null, null, yr, 'Todas', 'Todas', 'Todos', 'Todos'
        );
        List<PyGAnaliticoController.PyGRow> r2 = PyGAnaliticoController.generar(
            empresas, AREA, null, yr, 'No', 'No', 'Si', 'Si'
        );
        PyGAnaliticoController.MBOComparativo comp = PyGAnaliticoController.getComparativoMargenBruto(
            empresas, null, null, yr, 'Todas', 'Todas', 'Todos', 'Todos'
        );
        Test.stopTest();
        System.assert(r1.size() > 0);
        System.assert(r2.size() > 0);
        System.assertNotEquals(null, comp);
        System.assertEquals(yr, comp.ejercicioActual);
        System.assertEquals(yr - 1, comp.ejercicioAnterior);
        System.assertEquals(12, comp.mesesActual.size());
        System.assertEquals(12, comp.mesesAnterior.size());

        PyGAnaliticoController.OperacionesComparativo op = PyGAnaliticoController.getComparativoOperaciones(
            empresas, null, null, yr, 'Todas', 'Todas', 'Todos', 'Todos'
        );
        System.assertNotEquals(null, op);
        System.assertEquals(yr, op.ejercicioActual);
        System.assertEquals(yr - 1, op.ejercicioAnterior);
        System.assertNotEquals(null, op.celdas);

        // Verificamos que hay al menos un GRUPO y un SUBTOTAL en el resultado
        Boolean hayGrupo = false;
        Boolean haySubtotal = false;
        for (PyGAnaliticoController.PyGRow r : r1) {
            if (r.tipo == 'GRUPO')    hayGrupo    = true;
            if (r.tipo == 'SUBTOTAL') haySubtotal = true;
        }
        System.assert(hayGrupo);
        System.assert(haySubtotal);
    }

    @isTest
    static void testAnaliticoGetMovimientos() {
        Integer yr = Date.today().year();
        Plan_general_contable__c p = [SELECT Id FROM Plan_general_contable__c LIMIT 1];
        List<String> empresas = new List<String>{ EMPRESA };
        Test.startTest();
        List<PyGMensualController.Movimiento> mvs = PyGAnaliticoController.getMovimientos(
            new List<Id>{ p.Id }, yr, 1, 1, empresas, null, null, 'Todas', 'Todas', 'Todos', 'Todos'
        );
        Test.stopTest();
        System.assertNotEquals(null, mvs);
    }

    @isTest
    static void testAnaliticoErroresValidacion() {
        Integer yr = Date.today().year();
        Boolean cazado1 = false, cazado2 = false;
        Test.startTest();
        try {
            PyGAnaliticoController.generar(new List<String>{ EMPRESA }, null, null, null, 'Todas', 'Todas', 'Todos', 'Todos');
        } catch (AuraHandledException ex) { cazado1 = true; }
        try {
            PyGAnaliticoController.generar(null, null, null, yr, 'Todas', 'Todas', 'Todos', 'Todos');
        } catch (AuraHandledException ex) { cazado2 = true; }
        Test.stopTest();
        System.assert(cazado1);
        System.assert(cazado2);
    }

    @isTest
    static void testAnaliticoConstruirEstructuraDirecto() {
        // Llama directamente a construirEstructura con datos sintéticos.
        // Esto cubre todas las ramas del layout (grupos, subgrupos, subtotales con/sin %,
        // sin clasificar, acumulado) sin depender de queries reales — útil para garantizar
        // cobertura en producción donde triggers/sharing pueden filtrar los registros.
        Map<Id, Plan_general_contable__c> cuentasPGC = new Map<Id, Plan_general_contable__c>([
            SELECT Id, Name, T_tulo_cuenta__c, Apartados__c, Categor_a_Anal_tica_PyG__c
            FROM Plan_general_contable__c
            WHERE Name LIKE '6%' OR Name LIKE '7%'
        ]);
        // Saldos sintéticos: 12 meses con valores variados (positivos y negativos)
        Map<Id, Decimal[]> saldos = new Map<Id, Decimal[]>();
        Integer idx = 0;
        for (Id cId : cuentasPGC.keySet()) {
            Decimal[] mes = new Decimal[]{ 100*(idx+1), -50*(idx+1), 200, 0, 0, 75, -25, 0, 0, 0, 0, 0 };
            saldos.put(cId, mes);
            idx++;
        }
        Test.startTest();
        List<PyGAnaliticoController.PyGRow> rows = PyGAnaliticoController.construirEstructura(cuentasPGC, saldos);
        Test.stopTest();
        System.assertNotEquals(null, rows);
        System.assert(rows.size() > 0, 'Debe haber al menos una fila');
        // Comprobar que hay distintos tipos de fila
        Set<String> tipos = new Set<String>();
        for (PyGAnaliticoController.PyGRow r : rows) tipos.add(r.tipo);
        System.assert(tipos.contains('GRUPO'));
        System.assert(tipos.contains('SUBTOTAL'));
        System.assert(tipos.contains('ACUMULADO'));
    }

    @isTest
    static void testAnaliticoGastosPersonalFijo() {
        // Cuenta 640 dentro de "Operaciones servicios" (apartado 01, subapartado prefijo 1-5)
        // para cubrir el subapartado calculado "Gastos de personal fijo".
        insert new Plan_general_contable__c(
            Name = '6400000099', T_tulo_cuenta__c = 'Sueldos operativo',
            Apartados__c = '01. Operaciones',
            Categor_a_Anal_tica_PyG__c = '01. Ingresos servicios profesionales');

        Map<Id, Plan_general_contable__c> cuentasPGC = new Map<Id, Plan_general_contable__c>([
            SELECT Id, Name, T_tulo_cuenta__c, Apartados__c, Categor_a_Anal_tica_PyG__c
            FROM Plan_general_contable__c WHERE Name LIKE '6%' OR Name LIKE '7%'
        ]);
        Map<Id, Decimal[]> saldos = new Map<Id, Decimal[]>();
        for (Id cId : cuentasPGC.keySet()) {
            saldos.put(cId, new Decimal[]{ 100,100,100,100,100,100,100,100,100,100,100,100 });
        }

        Test.startTest();
        List<PyGAnaliticoController.PyGRow> rows = PyGAnaliticoController.construirEstructura(cuentasPGC, saldos);
        Test.stopTest();

        Boolean hayPF = false;
        for (PyGAnaliticoController.PyGRow r : rows) {
            if (r.tipo == 'SUBGRUPO' && r.concepto == 'Gastos de personal fijo') {
                hayPF = true;
                System.assertEquals(true, r.mostrarPorcentaje, 'El subapartado debe mostrar %');
            }
        }
        System.assert(hayPF, 'Debe crearse el subapartado "Gastos de personal fijo" en Operaciones servicios');
    }

    @isTest
    static void testAnaliticoSoloExtraordinarios() {
        Integer yr = Date.today().year();
        List<String> empresas = new List<String>{ EMPRESA };
        Test.startTest();
        // extraordinarios='Si' -> solo apuntes extraordinarios, no Linea_asiento_contable__c
        List<PyGAnaliticoController.PyGRow> rows = PyGAnaliticoController.generar(
            empresas, null, null, yr, 'Todas', 'Si', 'Todos', 'Todos'
        );
        Test.stopTest();
        System.assertNotEquals(null, rows);
    }

    // =================================================================
    //  PyGExportPDFController
    // =================================================================
    @isTest
    static void testExportPDFController() {
        Integer yr = Date.today().year();
        PageReference pr = Page.PyGExportPDF;
        pr.getParameters().put('e',   EMPRESA);
        pr.getParameters().put('d1',  String.valueOf(Date.newInstance(yr, 1, 1)));
        pr.getParameters().put('d2',  String.valueOf(Date.newInstance(yr, 12, 31)));
        pr.getParameters().put('cc',  '1');
        pr.getParameters().put('c1',  String.valueOf(Date.newInstance(yr - 1, 1, 1)));
        pr.getParameters().put('c2',  String.valueOf(Date.newInstance(yr - 1, 12, 31)));
        pr.getParameters().put('dg',  '1');
        pr.getParameters().put('p',   'PGC PYMES');
        pr.getParameters().put('s',   'Todas');
        pr.getParameters().put('x',   'Todas');
        pr.getParameters().put('chk', 'Todos');
        pr.getParameters().put('a',   AREA);
        Test.setCurrentPage(pr);

        Test.startTest();
        PyGExportPDFController ctrl = new PyGExportPDFController();
        Test.stopTest();
        System.assertNotEquals(null, ctrl.rows);
        System.assertNotEquals(null, ctrl.empresaLabel);
        System.assertEquals(true, ctrl.conComparativo);
    }

    @isTest
    static void testExportPDFControllerSinComparativoYSinDesglose() {
        Integer yr = Date.today().year();
        PageReference pr = Page.PyGExportPDF;
        pr.getParameters().put('e',   EMPRESA);
        pr.getParameters().put('d1',  String.valueOf(Date.newInstance(yr, 1, 1)));
        pr.getParameters().put('d2',  String.valueOf(Date.newInstance(yr, 12, 31)));
        pr.getParameters().put('cc',  '0');  // sin comparativo
        pr.getParameters().put('dg',  '0');  // sin desglose
        Test.setCurrentPage(pr);

        Test.startTest();
        PyGExportPDFController ctrl = new PyGExportPDFController();
        Test.stopTest();
        System.assertEquals(false, ctrl.conComparativo);
        System.assertEquals(false, ctrl.desglosado);
    }

    @isTest
    static void testExportPDFControllerSinEmpresa() {
        PageReference pr = Page.PyGExportPDF;
        // No ponemos 'e' -> debe rellenar errorMsg
        Test.setCurrentPage(pr);
        Test.startTest();
        PyGExportPDFController ctrl = new PyGExportPDFController();
        Test.stopTest();
        System.assertNotEquals(null, ctrl.errorMsg);
    }
}