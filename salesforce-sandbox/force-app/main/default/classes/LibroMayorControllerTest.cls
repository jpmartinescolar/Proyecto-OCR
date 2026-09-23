@isTest
private class LibroMayorControllerTest {

    private static final String EMPRESA = primerValorPicklist('Linea_asiento_contable__c', 'Empresa_titular__c');
    private static final String AREA    = primerValorPicklist('Linea_asiento_contable__c', 'rea__c');

    private static String primerValorPicklist(String objApi, String fieldApi) {
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objApi);
        if (t == null) return null;
        for (Schema.PicklistEntry e : t.getDescribe().fields.getMap().get(fieldApi).getDescribe().getPicklistValues()) {
            if (e.isActive()) return e.getValue();
        }
        return null;
    }

    @TestSetup
    static void setup() {
        List<Plan_general_contable__c> cuentas = new List<Plan_general_contable__c>{
            new Plan_general_contable__c(Name = '7050000000', T_tulo_cuenta__c = 'Prestaciones de servicios'),
            new Plan_general_contable__c(Name = '7000000000', T_tulo_cuenta__c = 'Ventas de mercaderías'),
            new Plan_general_contable__c(Name = '6210000000', T_tulo_cuenta__c = 'Arrendamientos y cánones')
        };
        insert cuentas;
        Id p705 = cuentas[0].Id, p700 = cuentas[1].Id, p62 = cuentas[2].Id;

        Integer yr = Date.today().year();
        List<Asiento_contable__c> asientos = new List<Asiento_contable__c>();
        for (Integer i = 0; i < 4; i++) asientos.add(new Asiento_contable__c(Empresa_titular__c = EMPRESA));
        asientos[0].Fecha_asiento_contable__c = Date.newInstance(yr, 1, 15);
        asientos[1].Fecha_asiento_contable__c = Date.newInstance(yr, 3, 10);
        asientos[2].Fecha_asiento_contable__c = Date.newInstance(yr, 6, 20);
        asientos[3].Fecha_asiento_contable__c = Date.newInstance(yr - 1, 11, 5);
        insert asientos;

        insert new List<Linea_asiento_contable__c>{
            new Linea_asiento_contable__c(Plan__c = p705, Asientos_contable__c = asientos[0].Id,
                Debe__c = 0, Haber__c = 10000, Empresa_titular__c = EMPRESA, rea__c = AREA,
                Simulaci_n__c = 'No', Check__c = 'Si'),
            new Linea_asiento_contable__c(Plan__c = p705, Asientos_contable__c = asientos[1].Id,
                Debe__c = 2500, Haber__c = 0, Empresa_titular__c = EMPRESA, rea__c = AREA,
                Simulaci_n__c = 'No', Check__c = 'No'),
            new Linea_asiento_contable__c(Plan__c = p705, Asientos_contable__c = asientos[3].Id,
                Debe__c = 0, Haber__c = 4000, Empresa_titular__c = EMPRESA, rea__c = AREA,
                Simulaci_n__c = 'No', Check__c = 'Si'),
            new Linea_asiento_contable__c(Plan__c = p700, Asientos_contable__c = asientos[2].Id,
                Debe__c = 1000, Haber__c = 0, Empresa_titular__c = EMPRESA, rea__c = AREA,
                Simulaci_n__c = 'No', Check__c = 'Si'),
            new Linea_asiento_contable__c(Plan__c = p62, Asientos_contable__c = asientos[2].Id,
                Debe__c = 800, Haber__c = 0, Empresa_titular__c = EMPRESA, rea__c = AREA,
                Simulaci_n__c = 'No', Check__c = 'Si')
        };

        insert new List<Apuntes_extraodinarios__c>{
            new Apuntes_extraodinarios__c(Plan_general_contable__c = p705,
                Debe__c = 0, Haber__c = 1500, Fecha_apunte_extraordinario__c = Date.newInstance(yr, 7, 10),
                Empresa_titular__c = EMPRESA, rea__c = AREA, Simulaci_n__c = 'No', Check__c = 'Si')
        };
    }

    @isTest
    static void testGetFilterOptionsYCuentas() {
        Test.startTest();
        LibroMayorController.FilterOptions o = LibroMayorController.getFilterOptions();
        List<LibroMayorController.CuentaOpt> cuentas =
            LibroMayorController.getCuentas(new List<String>{ EMPRESA });
        Test.stopTest();
        System.assert(o.empresasTitulares != null);
        System.assert(cuentas.size() >= 3, 'Debe devolver las cuentas con apuntes');
        // getCuentas con empresa vacía => vacío
        System.assertEquals(0, LibroMayorController.getCuentas(new List<String>()).size());
    }

    @isTest
    static void testGetLibroMayorSaldoAcumulado() {
        Id p705 = [SELECT Id FROM Plan_general_contable__c WHERE Name = '7050000000' LIMIT 1].Id;
        Integer yr = Date.today().year();
        Test.startTest();
        List<LibroMayorController.Apunte> rows = LibroMayorController.getLibroMayor(
            p705, new List<String>{ EMPRESA },
            Date.newInstance(yr, 1, 1), Date.newInstance(yr, 12, 31),
            'Todas', 'Todas', 'Todos', 'Todos'
        );
        Test.stopTest();
        // Año en curso: 3 apuntes (contables 2 + extra 1) dentro del rango; el del año anterior queda fuera
        System.assertEquals(3, rows.size());
        // Orden descendente: primera fila = más reciente
        System.assert(rows[0].fecha >= rows[rows.size() - 1].fecha);
        // Saldo acumulado arrastra el histórico (incluye -4000 del año anterior):
        // -4000 (año ant) -10000 +2500 -1500 = -13000 al final (fila más reciente)
        System.assertEquals(-13000, rows[0].saldo);
    }

    @isTest
    static void testGetLibroMayorVacios() {
        Test.startTest();
        System.assertEquals(0, LibroMayorController.getLibroMayor(
            null, new List<String>{ EMPRESA }, null, null, 'Todas', 'Todas', 'Todos', 'Todos').size());
        Id p705 = [SELECT Id FROM Plan_general_contable__c WHERE Name = '7050000000' LIMIT 1].Id;
        System.assertEquals(0, LibroMayorController.getLibroMayor(
            p705, new List<String>(), null, null, 'Todas', 'Todas', 'Todos', 'Todos').size());
        Test.stopTest();
    }

    @isTest
    static void testMarcarCheck() {
        List<Id> lineaIds = new List<Id>();
        for (Linea_asiento_contable__c l : [SELECT Id FROM Linea_asiento_contable__c LIMIT 3]) lineaIds.add(l.Id);
        List<Id> extraIds = new List<Id>();
        for (Apuntes_extraodinarios__c e : [SELECT Id FROM Apuntes_extraodinarios__c]) extraIds.add(e.Id);
        Test.startTest();
        String r = LibroMayorController.marcarCheck(lineaIds, extraIds, 'Si');
        String r2 = LibroMayorController.marcarCheck(new List<Id>(), null, 'Si'); // sin registros
        Test.stopTest();
        System.assertEquals('OK', r);
        System.assertEquals('OK', r2);
        System.assertEquals('Si', [SELECT Check__c FROM Linea_asiento_contable__c WHERE Id = :lineaIds[0]].Check__c);
    }

    @isTest
    static void testGetAdjacentCuenta() {
        Id p700 = [SELECT Id FROM Plan_general_contable__c WHERE Name = '7000000000' LIMIT 1].Id;
        Id p705 = [SELECT Id FROM Plan_general_contable__c WHERE Name = '7050000000' LIMIT 1].Id;
        List<String> emp = new List<String>{ EMPRESA };
        Test.startTest();
        // Siguiente de 7000 => 7050
        LibroMayorController.CuentaOpt sig = LibroMayorController.getAdjacentCuenta(
            p700, 'siguiente', emp, 'Todas', 'Todas', 'Todos', 'Todas', 'Todos');
        System.assertEquals('7050000000', sig.numero);
        // Anterior de 7050 => 7000
        LibroMayorController.CuentaOpt ant = LibroMayorController.getAdjacentCuenta(
            p705, 'anterior', emp, 'Todas', 'Todas', 'Todos', 'Todas', 'Todos');
        System.assertEquals('7000000000', ant.numero);
        // Con filtro Positivo (>0): 7050 tiene saldo negativo => no debe ser destino desde 7000 siguiente
        LibroMayorController.CuentaOpt pos = LibroMayorController.getAdjacentCuenta(
            p700, 'siguiente', emp, 'Todas', 'Todas', 'Todos', 'Positivo', 'Todos');
        System.assertEquals(null, pos, '7050 es negativa, no debe navegarse con filtro >0');
        // Filtro NoCero y casos nulos
        LibroMayorController.getAdjacentCuenta(p705, 'anterior', emp, 'Todas', 'Todas', 'Todos', 'NoCero', 'Todos');
        System.assertEquals(null, LibroMayorController.getAdjacentCuenta(
            null, 'siguiente', emp, 'Todas', 'Todas', 'Todos', 'Todas', 'Todos'));
        Test.stopTest();
    }

    @isTest
    static void testEfectosClientes() {
        Plan_general_contable__c c430 = new Plan_general_contable__c(Name = '4300000099', T_tulo_cuenta__c = 'Cliente efectos');
        insert c430;
        Account cli = new Account(
            Name = 'Cliente Efectos Test',
            Cuenta_contable_cliente__c = c430.Id,
            Procedencia_del_cliente__c = 'Test unitario');
        insert cli;
        insert new List<Reclamaci_n_de_impagados__c>{
            new Reclamaci_n_de_impagados__c(Cliente__c = cli.Id, Empresa_titular__c = EMPRESA,
                Estado__c = 'Pendiente', Importe_factura__c = 121,
                Fecha_de_vencimiento_inicial__c = Date.today()),
            new Reclamaci_n_de_impagados__c(Cliente__c = cli.Id, Empresa_titular__c = EMPRESA,
                Estado__c = 'Conciliado', Importe_factura__c = 50,
                Fecha_de_vencimiento_inicial__c = Date.today().addDays(-30))
        };

        Test.startTest();
        List<LibroMayorController.EfectoClienteDTO> efs =
            LibroMayorController.getEfectosClientes(c430.Id, new List<String>{ EMPRESA });
        Test.stopTest();

        System.assertEquals(2, efs.size(), 'Dos efectos del cliente de la cuenta');
        System.assertEquals(true,  efs[0].abierto, 'Pendiente (más reciente) va primero y en rojo');
        System.assertEquals(false, efs[1].abierto, 'Conciliado no se marca en rojo');
        System.assert(efs[0].fechaVencimientoInicial >= efs[1].fechaVencimientoInicial, 'Orden por vencimiento descendente');
        System.assertEquals(0, LibroMayorController.getEfectosClientes(null, new List<String>{ EMPRESA }).size());
        System.assertEquals(0, LibroMayorController.getEfectosClientes(c430.Id, new List<String>()).size());
    }

    @isTest
    static void testEfectosProveedores() {
        Plan_general_contable__c c410 = new Plan_general_contable__c(Name = '4100000099', T_tulo_cuenta__c = 'Proveedor efectos');
        insert c410;
        Account prov = new Account(
            Name = 'Proveedor Efectos Test',
            Cuenta_contable_proveedor__c = c410.Id,
            Procedencia_del_cliente__c = 'Test unitario');
        insert prov;
        insert new List<Efectos_proveedores__c>{
            new Efectos_proveedores__c(Empresa__c = prov.Id, Empresa_titular__c = EMPRESA,
                Estado__c = 'Pendiente', Importe_efecto__c = 200,
                Fecha_vencimiento__c = Date.today()),
            new Efectos_proveedores__c(Empresa__c = prov.Id, Empresa_titular__c = EMPRESA,
                Estado__c = 'Conciliado', Importe_efecto__c = 75,
                Fecha_vencimiento__c = Date.today().addDays(-30))
        };

        Test.startTest();
        List<LibroMayorController.EfectoProveedorDTO> efs =
            LibroMayorController.getEfectosProveedores(c410.Id, new List<String>{ EMPRESA });
        Test.stopTest();

        System.assertEquals(2, efs.size(), 'Dos efectos del proveedor de la cuenta');
        System.assertEquals(true,  efs[0].abierto, 'Pendiente (más reciente) va primero y en rojo');
        System.assertEquals(false, efs[1].abierto, 'Conciliado no se marca en rojo');
        System.assert(efs[0].fechaVencimiento >= efs[1].fechaVencimiento, 'Orden por vencimiento descendente');
        System.assertEquals(0, LibroMayorController.getEfectosProveedores(null, new List<String>{ EMPRESA }).size());
        System.assertEquals(0, LibroMayorController.getEfectosProveedores(c410.Id, new List<String>()).size());
    }
}