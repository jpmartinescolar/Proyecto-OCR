/**
 * Controller de "Sumas y Saldos" (balance de comprobación).
 *  - Asiento de apertura: apuntes contables cuyo Tipo de asiento = 'Asiento de apertura',
 *    dentro del rango de fechas seleccionado.
 *  - Periodo: el resto de apuntes (no apertura) dentro del rango.
 *  - Saldo actual: Debe − Haber acumulado sobre TODO el histórico de la cuenta (sin filtro de fechas).
 *  Todos los saldos = Debe − Haber.
 *  Reutiliza LibroMayorController.getFilterOptions y getCuentas para los filtros.
 */
public with sharing class SumasSaldosController {

    private static final String APERTURA = 'Asiento de apertura';

    // Asientos del proceso de cierre: fuera de los controles de incidencias y cuadres de facturas
    private static final List<String> TIPOS_CIERRE = new List<String>{
        'Asiento de apertura', 'Asiento de cierre', 'Asiento Reg. Cierre'
    };

    // Estados de efecto "abiertos" (pendientes de cobro/pago) para los cuadres de efectos.
    // Clientes (Reclamaci_n_de_impagados__c): incluye 'Abono' (importes negativos, notas de abono).
    private static final List<String> ESTADOS_EF_CLIENTE = new List<String>{
        'Pendiente', 'Error o bloqueo', 'Devuelto',
        'Reclamación 1ª', 'Reclamación 2ª', 'Monitorio', 'Incobrable', 'Abono'
    };
    // Proveedores (Efectos_proveedores__c): abiertos = aún sin pagar.
    private static final List<String> ESTADOS_EF_PROVEEDOR = new List<String>{
        'Pendiente', 'Pago autorizado', 'Domiciliación bancaria'
    };

    public class SumaRow {
        @AuraEnabled public Id     cuentaId;
        @AuraEnabled public String numero;
        @AuraEnabled public String titulo;
        @AuraEnabled public Decimal aperturaDebe;
        @AuraEnabled public Decimal aperturaHaber;
        @AuraEnabled public Decimal aperturaSaldo;
        @AuraEnabled public Decimal periodoDebe;
        @AuraEnabled public Decimal periodoHaber;
        @AuraEnabled public Decimal periodoSaldo;
        @AuraEnabled public Decimal acumuladoDebe;
        @AuraEnabled public Decimal acumuladoHaber;
        @AuraEnabled public Decimal acumuladoSaldo;
        @AuraEnabled public Decimal saldoActual;
        @AuraEnabled public Decimal efectosClientes;
        @AuraEnabled public Decimal efectosProveedores;
        @AuraEnabled public Decimal diferenciaEfectos;
    }

    @AuraEnabled
    public static List<SumaRow> generar(
        List<String> empresasTitulares,
        Date   desde,
        Date   hasta,
        Id     cuentaId,
        String numeroDesde,
        String numeroHasta,
        String simulacion,
        String extraordinarios,
        String check,
        String cuentasModo
    ) {
        List<SumaRow> out = new List<SumaRow>();
        if (empresasTitulares == null || empresasTitulares.isEmpty()) return out;
        if (desde == null || hasta == null) return out;

        // Cuentas a mostrar: una concreta o todas las del plan (orden por nº)
        List<Plan_general_contable__c> cuentas;
        if (cuentaId != null) {
            cuentas = [SELECT Id, Name, T_tulo_cuenta__c FROM Plan_general_contable__c WHERE Id = :cuentaId];
        } else {
            String soql = 'SELECT Id, Name, T_tulo_cuenta__c FROM Plan_general_contable__c WHERE Name != null ';
            if (String.isNotBlank(numeroDesde)) soql += 'AND Name >= :numeroDesde ';
            if (String.isNotBlank(numeroHasta)) soql += 'AND Name <= :numeroHasta ';
            soql += 'ORDER BY Name ASC LIMIT 10000';
            cuentas = Database.query(soql);
        }
        if (cuentas.isEmpty()) return out;
        Set<Id> planIds = (new Map<Id, Plan_general_contable__c>(cuentas)).keySet();

        Boolean incluirContables = (extraordinarios != 'Si');
        Boolean incluirExtra     = (extraordinarios == 'Si' || extraordinarios == 'Todas');
        String  sim   = simulacionClause(simulacion);
        String  chk   = checkClause(check);

        Map<Id, Decimal> apD = new Map<Id, Decimal>(), apH = new Map<Id, Decimal>();
        Map<Id, Decimal> peD = new Map<Id, Decimal>(), peH = new Map<Id, Decimal>();
        Map<Id, Decimal> hsD = new Map<Id, Decimal>(), hsH = new Map<Id, Decimal>();
        Set<Id> conApuntesContables = new Set<Id>();

        if (incluirContables) {
            // Apertura (dentro del rango)
            for (AggregateResult ar : Database.query(
                'SELECT Plan__c c, SUM(Debe__c) d, SUM(Haber__c) h FROM Linea_asiento_contable__c '
              + 'WHERE Plan__c IN :planIds AND Empresa_titular__c IN :empresasTitulares '
              + 'AND Tipo_de_asiento__c = \'' + APERTURA + '\' '
              + 'AND Asientos_contable__r.Fecha_asiento_contable__c >= :desde '
              + 'AND Asientos_contable__r.Fecha_asiento_contable__c <= :hasta '
              + sim + chk + 'GROUP BY Plan__c')) {
                add(apD, (Id) ar.get('c'), (Decimal) ar.get('d'));
                add(apH, (Id) ar.get('c'), (Decimal) ar.get('h'));
            }
            // Periodo (no apertura, dentro del rango)
            for (AggregateResult ar : Database.query(
                'SELECT Plan__c c, SUM(Debe__c) d, SUM(Haber__c) h FROM Linea_asiento_contable__c '
              + 'WHERE Plan__c IN :planIds AND Empresa_titular__c IN :empresasTitulares '
              + 'AND Tipo_de_asiento__c != \'' + APERTURA + '\' '
              + 'AND Asientos_contable__r.Fecha_asiento_contable__c >= :desde '
              + 'AND Asientos_contable__r.Fecha_asiento_contable__c <= :hasta '
              + sim + chk + 'GROUP BY Plan__c')) {
                add(peD, (Id) ar.get('c'), (Decimal) ar.get('d'));
                add(peH, (Id) ar.get('c'), (Decimal) ar.get('h'));
            }
            // Saldo actual (todo el histórico)
            for (AggregateResult ar : Database.query(
                'SELECT Plan__c c, SUM(Debe__c) d, SUM(Haber__c) h FROM Linea_asiento_contable__c '
              + 'WHERE Plan__c IN :planIds AND Empresa_titular__c IN :empresasTitulares '
              + sim + chk + 'GROUP BY Plan__c')) {
                add(hsD, (Id) ar.get('c'), (Decimal) ar.get('d'));
                add(hsH, (Id) ar.get('c'), (Decimal) ar.get('h'));
                conApuntesContables.add((Id) ar.get('c'));
            }
        }

        if (incluirExtra) {
            // Periodo (extraordinarios dentro del rango)
            for (AggregateResult ar : Database.query(
                'SELECT Plan_general_contable__c c, SUM(Debe__c) d, SUM(Haber__c) h FROM Apuntes_extraodinarios__c '
              + 'WHERE Plan_general_contable__c IN :planIds AND Empresa_titular__c IN :empresasTitulares '
              + 'AND Fecha_apunte_extraordinario__c >= :desde AND Fecha_apunte_extraordinario__c <= :hasta '
              + sim + chk + 'GROUP BY Plan_general_contable__c')) {
                add(peD, (Id) ar.get('c'), (Decimal) ar.get('d'));
                add(peH, (Id) ar.get('c'), (Decimal) ar.get('h'));
            }
            // Saldo actual (extraordinarios, todo el histórico)
            for (AggregateResult ar : Database.query(
                'SELECT Plan_general_contable__c c, SUM(Debe__c) d, SUM(Haber__c) h FROM Apuntes_extraodinarios__c '
              + 'WHERE Plan_general_contable__c IN :planIds AND Empresa_titular__c IN :empresasTitulares '
              + sim + chk + 'GROUP BY Plan_general_contable__c')) {
                add(hsD, (Id) ar.get('c'), (Decimal) ar.get('d'));
                add(hsH, (Id) ar.get('c'), (Decimal) ar.get('h'));
            }
        }

        // ----- Efectos clientes: vía Account.Cuenta_contable_cliente__c y Reclamaci_n_de_impagados__c -----
        Map<Id, Set<Id>> cuentaToClientes = new Map<Id, Set<Id>>();   // cuenta contable -> Account(s) cliente
        Set<Id> clienteIds = new Set<Id>();
        for (Account a : [SELECT Id, Cuenta_contable_cliente__c FROM Account WHERE Cuenta_contable_cliente__c IN :planIds]) {
            if (!cuentaToClientes.containsKey(a.Cuenta_contable_cliente__c)) cuentaToClientes.put(a.Cuenta_contable_cliente__c, new Set<Id>());
            cuentaToClientes.get(a.Cuenta_contable_cliente__c).add(a.Id);
            clienteIds.add(a.Id);
        }
        Map<Id, Decimal> efClientesPorCliente = new Map<Id, Decimal>();
        if (!clienteIds.isEmpty()) {
            for (AggregateResult ar : [
                SELECT Cliente__c c, SUM(Importe_pendiente__c) t
                FROM Reclamaci_n_de_impagados__c
                WHERE Cliente__c IN :clienteIds
                  AND Empresa_titular__c IN :empresasTitulares
                  AND Estado__c IN :ESTADOS_EF_CLIENTE
                GROUP BY Cliente__c
            ]) {
                efClientesPorCliente.put((Id) ar.get('c'), z((Decimal) ar.get('t')));
            }
        }

        // ----- Efectos proveedores abiertos: enlazados por nº de cuenta (fórmula Cuenta_contable_efecto__c) -----
        Map<String, Id> numeroToPlan = new Map<String, Id>();
        for (Plan_general_contable__c p : cuentas) numeroToPlan.put(p.Name, p.Id);
        Map<Id, Decimal> efProvPorCuenta = new Map<Id, Decimal>();
        for (Efectos_proveedores__c e : [
            SELECT Cuenta_contable_efecto__c, Importe_efecto__c
            FROM Efectos_proveedores__c
            WHERE Empresa_titular__c IN :empresasTitulares
              AND (Estado__c IN :ESTADOS_EF_PROVEEDOR OR Estado__c = null)
              AND Cuenta_contable_efecto__c != null
        ]) {
            Id planId = numeroToPlan.get(e.Cuenta_contable_efecto__c);
            if (planId != null) add(efProvPorCuenta, planId, e.Importe_efecto__c);
        }

        for (Plan_general_contable__c p : cuentas) {
            if (cuentasModo == 'Con' && !conApuntesContables.contains(p.Id)) continue;
            if (cuentasModo == 'Sin' &&  conApuntesContables.contains(p.Id)) continue;
            SumaRow r = new SumaRow();
            r.cuentaId = p.Id;
            r.numero   = p.Name;
            r.titulo   = (p.T_tulo_cuenta__c == null) ? '' : p.T_tulo_cuenta__c;
            r.aperturaDebe  = z(apD.get(p.Id));
            r.aperturaHaber = z(apH.get(p.Id));
            r.aperturaSaldo = r.aperturaDebe - r.aperturaHaber;
            r.periodoDebe   = z(peD.get(p.Id));
            r.periodoHaber  = z(peH.get(p.Id));
            r.periodoSaldo  = r.periodoDebe - r.periodoHaber;
            r.acumuladoDebe  = r.aperturaDebe  + r.periodoDebe;
            r.acumuladoHaber = r.aperturaHaber + r.periodoHaber;
            r.acumuladoSaldo = r.acumuladoHaber - r.acumuladoDebe;
            r.saldoActual   = z(hsD.get(p.Id)) - z(hsH.get(p.Id));
            Decimal efCli = 0;
            if (cuentaToClientes.containsKey(p.Id)) {
                for (Id cliId : cuentaToClientes.get(p.Id)) efCli += z(efClientesPorCliente.get(cliId));
            }
            r.efectosClientes    = efCli;
            r.efectosProveedores = z(efProvPorCuenta.get(p.Id));
            // Clientes: saldo (Debe−Haber) positivo vs efectos pendientes de cobro (positivos).
            // Proveedores: saldo negativo vs efectos pendientes de pago (positivos) → se suman.
            r.diferenciaEfectos  = r.saldoActual - r.efectosClientes + r.efectosProveedores;
            out.add(r);
        }
        return out;
    }

    public class AsientoRef {
        @AuraEnabled public Id     id;
        @AuraEnabled public String numero;
    }
    public class AvisoResult {
        @AuraEnabled public Integer total;
        @AuraEnabled public List<AsientoRef> asientos;
    }

    // Apuntes contables con incidencia (Incidencia__c = 'Si'): total + asientos implicados
    @AuraEnabled
    public static AvisoResult getIncidencias(List<String> empresasTitulares) {
        AvisoResult r = new AvisoResult();
        r.total = 0; r.asientos = new List<AsientoRef>();
        if (empresasTitulares == null || empresasTitulares.isEmpty()) return r;
        r.total = [
            SELECT COUNT() FROM Linea_asiento_contable__c
            WHERE Empresa_titular__c IN :empresasTitulares AND Incidencia__c = 'Si'
              AND Tipo_de_asiento__c NOT IN :TIPOS_CIERRE
        ];
        for (AggregateResult ar : [
            SELECT Asientos_contable__c c, MAX(Asientos_contable__r.Name) n
            FROM Linea_asiento_contable__c
            WHERE Empresa_titular__c IN :empresasTitulares AND Incidencia__c = 'Si'
              AND Tipo_de_asiento__c NOT IN :TIPOS_CIERRE
              AND Asientos_contable__c != null
            GROUP BY Asientos_contable__c LIMIT 500
        ]) {
            AsientoRef a = new AsientoRef();
            a.id = (Id) ar.get('c'); a.numero = (String) ar.get('n');
            r.asientos.add(a);
        }
        return r;
    }

    // Asientos contables descuadrados (Debe ≠ Haber): total + asientos implicados
    @AuraEnabled
    public static AvisoResult contarDescuadrados(List<String> empresasTitulares) {
        AvisoResult r = new AvisoResult();
        r.total = 0; r.asientos = new List<AsientoRef>();
        if (empresasTitulares == null || empresasTitulares.isEmpty()) return r;
        r.total = [
            SELECT COUNT()
            FROM Asiento_contable__c
            WHERE Empresa_titular__c IN :empresasTitulares AND Diferencia__c != 0
        ];
        for (Asiento_contable__c a : [
            SELECT Id, Name FROM Asiento_contable__c
            WHERE Empresa_titular__c IN :empresasTitulares AND Diferencia__c != 0
            ORDER BY Name LIMIT 500
        ]) {
            AsientoRef ref = new AsientoRef();
            ref.id = a.Id; ref.numero = a.Name;
            r.asientos.add(ref);
        }
        return r;
    }

    // Apuntes contables SIN cuenta contable (Plan__c vacío): total + asientos implicados
    @AuraEnabled
    public static AvisoResult getSinCuenta(List<String> empresasTitulares) {
        AvisoResult r = new AvisoResult();
        r.total = 0; r.asientos = new List<AsientoRef>();
        if (empresasTitulares == null || empresasTitulares.isEmpty()) return r;
        r.total = [
            SELECT COUNT() FROM Linea_asiento_contable__c
            WHERE Empresa_titular__c IN :empresasTitulares AND Plan__c = null
        ];
        for (AggregateResult ar : [
            SELECT Asientos_contable__c c, MAX(Asientos_contable__r.Name) n
            FROM Linea_asiento_contable__c
            WHERE Empresa_titular__c IN :empresasTitulares AND Plan__c = null
              AND Asientos_contable__c != null
            GROUP BY Asientos_contable__c LIMIT 500
        ]) {
            AsientoRef a = new AsientoRef();
            a.id = (Id) ar.get('c'); a.numero = (String) ar.get('n');
            r.asientos.add(a);
        }
        return r;
    }

    // Nº de apuntes contables SIN check (Check__c != 'Si'), todo el histórico de las empresas seleccionadas
    @AuraEnabled
    public static Integer contarSinCheck(List<String> empresasTitulares) {
        if (empresasTitulares == null || empresasTitulares.isEmpty()) return 0;
        return [
            SELECT COUNT()
            FROM Linea_asiento_contable__c
            WHERE Empresa_titular__c IN :empresasTitulares AND Check__c != 'Si'
        ];
    }

    // Nº de extractos bancarios PENDIENTES (sin conciliar) en el rango de fechas, de las empresas seleccionadas
    @AuraEnabled
    public static Integer contarExtractosPendientes(List<String> empresasTitulares, Date desde, Date hasta) {
        if (empresasTitulares == null || empresasTitulares.isEmpty() || desde == null || hasta == null) return 0;
        return [
            SELECT COUNT()
            FROM Extracto_bancario__c
            WHERE Estado__c = 'Pendiente'
              AND Fecha_movimiento__c >= :desde AND Fecha_movimiento__c <= :hasta
              AND Cuenta_bancaria_bancos__r.Empresa_titular__c IN :empresasTitulares
        ];
    }

    // Cuadre: base imponible de facturas emitidas vs saldo (Haber−Debe) de cuentas concretas, todo el histórico
    public class CuadreResult {
        @AuraEnabled public Decimal baseImponible;
        @AuraEnabled public Decimal saldoCuentas;
        @AuraEnabled public Decimal diferencia;
    }

    @AuraEnabled
    public static CuadreResult cuadreFacturas(List<String> empresasTitulares) {
        CuadreResult r = new CuadreResult();
        r.baseImponible = 0; r.saldoCuentas = 0; r.diferencia = 0;
        if (empresasTitulares == null || empresasTitulares.isEmpty()) return r;

        for (AggregateResult ar : [
            SELECT SUM(Subtotal__c) s FROM Facturas__c
            WHERE Empresa_Titular__c IN :empresasTitulares
        ]) { r.baseImponible = z((Decimal) ar.get('s')); }

        List<String> cuentaIds = new List<String>{
            'a7HP50000000lTZMAY','a7HP50000001t5hMAA','a7HP50000001t7JMAQ','a7HP50000001t8vMAA',
            'a7HP50000001tAXMAY','a7HP50000001tKDMAY','a7HP50000001tIbMAI','a7HP50000001tFNMAY',
            'a7HP50000001tGzMAI','a7HP50000002nCjMAI','a7HP50000002sE1MAI','a7HP50000001t45MAA',
            'a7HP50000005Y13MAE','a7HP50000005goDMAQ',
            'a7HP50000006NunMAE','a7HP50000006NwPMAU','a7HP50000006NtBMAU','a7HP50000006NrZMAU'
        };
        Decimal dd = 0, hh = 0;
        for (AggregateResult ar : [
            SELECT SUM(Debe__c) d, SUM(Haber__c) h FROM Linea_asiento_contable__c
            WHERE Empresa_titular__c IN :empresasTitulares AND Plan__c IN :cuentaIds
              AND Tipo_de_asiento__c NOT IN :TIPOS_CIERRE
        ]) { dd = z((Decimal) ar.get('d')); hh = z((Decimal) ar.get('h')); }
        r.saldoCuentas = hh - dd;
        r.diferencia = r.baseImponible - r.saldoCuentas;
        return r;
    }

    // Cuadre: base imponible de facturas RECIBIDAS (por fecha de CREACIÓN) vs Debe de apuntes
    // en cuentas de compras/gastos, inmov. materiales, 4802000000 o que empiecen por 561 o 113
    @AuraEnabled
    public static CuadreResult cuadreRecibidas(List<String> empresasTitulares) {
        CuadreResult r = new CuadreResult();
        r.baseImponible = 0; r.saldoCuentas = 0; r.diferencia = 0;
        if (empresasTitulares == null || empresasTitulares.isEmpty()) return r;

        // Corte por fecha de CREACIÓN del registro (no la fecha de factura): 01/01/2025 incluido.
        Datetime corteRecibidas = Datetime.newInstanceGmt(2025, 1, 1, 0, 0, 0);
        // Facturas recibidas excluidas manualmente del cuadre.
        List<String> facturasExcluidas = new List<String>{ 'aFyP5000002watBKAQ' };
        for (AggregateResult ar : [
            SELECT SUM(Base_Imponible__c) s FROM Facturas_recibidas_eventos__c
            WHERE Empresa_titular__c IN :empresasTitulares
              AND CreatedDate >= :corteRecibidas
              AND Id NOT IN :facturasExcluidas
        ]) { r.baseImponible = z((Decimal) ar.get('s')); }

        Set<Id> cuentas = new Set<Id>();
        for (Plan_general_contable__c p : [
            SELECT Id FROM Plan_general_contable__c
            WHERE Grupo__c = 'Compras y gastos'
               OR Tipo__c = '21. Inmovilizaciones materiales'
               OR Name = '4802000000'
               OR Name LIKE '561%'
               OR Name LIKE '113%'
        ]) { cuentas.add(p.Id); }

        Decimal dd = 0;
        if (!cuentas.isEmpty()) {
            for (AggregateResult ar : [
                SELECT SUM(Debe__c) d FROM Linea_asiento_contable__c
                WHERE Empresa_titular__c IN :empresasTitulares AND Plan__c IN :cuentas
                  AND Facturas_recibidas__c != null
            ]) { dd = z((Decimal) ar.get('d')); }
        }
        r.saldoCuentas = dd;
        r.diferencia = r.baseImponible - r.saldoCuentas;
        return r;
    }

    // Cuadre Saldo cuentas & Saldo efectos: nº de cuentas con diferencia (saldo actual − efectos),
    // separando Proveedores/Acreedores (400/410) de Clientes (430). Reutilizable por varios componentes.
    public class DifEfectosResult {
        @AuraEnabled public Integer total;
        @AuraEnabled public Integer proveedores;   // cuentas 400 / 410
        @AuraEnabled public Integer clientes;       // cuentas 430
    }

    @AuraEnabled
    public static DifEfectosResult diferenciaEfectos(List<String> empresasTitulares) {
        DifEfectosResult r = new DifEfectosResult();
        r.total = 0; r.proveedores = 0; r.clientes = 0;
        if (empresasTitulares == null || empresasTitulares.isEmpty()) return r;

        Map<Id, String> cuentaNum = new Map<Id, String>();
        Map<String, Id> numeroToPlan = new Map<String, Id>();
        for (Plan_general_contable__c p : [
            SELECT Id, Name FROM Plan_general_contable__c
            WHERE Name LIKE '400%' OR Name LIKE '410%' OR Name LIKE '430%'
        ]) { cuentaNum.put(p.Id, p.Name); numeroToPlan.put(p.Name, p.Id); }
        if (cuentaNum.isEmpty()) return r;
        Set<Id> ids = cuentaNum.keySet();

        // Saldo actual (Debe − Haber) de todo el histórico por cuenta
        Map<Id, Decimal> saldo = new Map<Id, Decimal>();
        for (AggregateResult ar : [
            SELECT Plan__c c, SUM(Debe__c) d, SUM(Haber__c) h FROM Linea_asiento_contable__c
            WHERE Empresa_titular__c IN :empresasTitulares AND Plan__c IN :ids
            GROUP BY Plan__c
        ]) { saldo.put((Id) ar.get('c'), z((Decimal) ar.get('d')) - z((Decimal) ar.get('h'))); }

        // Efectos clientes por cuenta (430) vía Account.Cuenta_contable_cliente__c
        Map<Id, Set<Id>> cuentaToClientes = new Map<Id, Set<Id>>();
        Set<Id> clienteIds = new Set<Id>();
        for (Account a : [SELECT Id, Cuenta_contable_cliente__c FROM Account WHERE Cuenta_contable_cliente__c IN :ids]) {
            if (!cuentaToClientes.containsKey(a.Cuenta_contable_cliente__c)) cuentaToClientes.put(a.Cuenta_contable_cliente__c, new Set<Id>());
            cuentaToClientes.get(a.Cuenta_contable_cliente__c).add(a.Id);
            clienteIds.add(a.Id);
        }
        Map<Id, Decimal> efClientesPorCliente = new Map<Id, Decimal>();
        if (!clienteIds.isEmpty()) {
            for (AggregateResult ar : [
                SELECT Cliente__c c, SUM(Importe_pendiente__c) t FROM Reclamaci_n_de_impagados__c
                WHERE Cliente__c IN :clienteIds AND Empresa_titular__c IN :empresasTitulares AND Estado__c IN :ESTADOS_EF_CLIENTE
                GROUP BY Cliente__c
            ]) { efClientesPorCliente.put((Id) ar.get('c'), z((Decimal) ar.get('t'))); }
        }

        // Efectos proveedores abiertos por cuenta (400/410) vía fórmula Cuenta_contable_efecto__c
        Map<Id, Decimal> efProvPorCuenta = new Map<Id, Decimal>();
        for (Efectos_proveedores__c e : [
            SELECT Cuenta_contable_efecto__c, Importe_efecto__c
            FROM Efectos_proveedores__c
            WHERE Empresa_titular__c IN :empresasTitulares
              AND (Estado__c IN :ESTADOS_EF_PROVEEDOR OR Estado__c = null)
              AND Cuenta_contable_efecto__c != null
        ]) {
            Id planId = numeroToPlan.get(e.Cuenta_contable_efecto__c);
            if (planId != null) add(efProvPorCuenta, planId, e.Importe_efecto__c);
        }

        for (Id cId : cuentaNum.keySet()) {
            String num = cuentaNum.get(cId);
            Decimal sal = saldo.containsKey(cId) ? saldo.get(cId) : 0;
            Decimal dif;
            if (num.startsWith('430')) {
                // Cliente: saldo deudor (Debe−Haber) debe coincidir con los efectos pendientes de cobro
                Decimal efCli = 0;
                if (cuentaToClientes.containsKey(cId)) {
                    for (Id acc : cuentaToClientes.get(cId)) efCli += z(efClientesPorCliente.get(acc));
                }
                dif = sal - efCli;
            } else {
                // Proveedor/acreedor: saldo acreedor (negativo) + efectos pendientes de pago = 0 si cuadra
                dif = sal + z(efProvPorCuenta.get(cId));
            }
            if (dif.abs() >= 0.005) {
                if (num.startsWith('430')) r.clientes++;
                else r.proveedores++;
            }
        }
        r.total = r.proveedores + r.clientes;
        return r;
    }

    private static Decimal z(Decimal v) { return v == null ? 0 : v; }
    private static void add(Map<Id, Decimal> m, Id k, Decimal v) {
        if (k == null) return;
        m.put(k, (m.containsKey(k) ? m.get(k) : 0) + (v == null ? 0 : v));
    }

    private static String checkClause(String check) {
        if (check == 'Si') return 'AND Check__c = \'Si\' ';
        if (check == 'No') return 'AND (Check__c = \'No\' OR Check__c = null) ';
        return '';
    }
    private static String simulacionClause(String simulacion) {
        if (simulacion == 'No') return 'AND (Simulaci_n__c = \'No\' OR Simulaci_n__c = null) ';
        if (simulacion == 'Si') return 'AND Simulaci_n__c = \'Si\' ';
        if (simulacion == 'Sí. Transferencia') return 'AND Simulaci_n__c = \'Sí. Transferencia\' ';
        return '';
    }
}