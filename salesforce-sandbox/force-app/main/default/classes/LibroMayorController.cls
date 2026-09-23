/**
 * Controller del componente "Libro Mayor".
 *  - Lista los apuntes (contables y/o extraordinarios) de UNA cuenta del Plan
 *    General Contable, ordenados de fecha más reciente a más antigua.
 *  - El SALDO de cada fila es el acumulado real sobre TODO el histórico de la
 *    cuenta (estilo extracto bancario): el filtro de fechas sólo "ventana" las
 *    filas visibles, pero el saldo arrastra todo lo anterior.
 *  - Navegación Anterior/Siguiente por número de cuenta respetando los filtros,
 *    con opción de saltar a cuentas según su saldo acumulado.
 *  La edición inline (área, director, simulación, check) reutiliza
 *  PyGMensualController.updateMovimiento.
 */
public with sharing class LibroMayorController {

    // =====================================================================
    //  FILTER OPTIONS
    // =====================================================================
    public class PicklistOpt {
        @AuraEnabled public String value;
        @AuraEnabled public String label;
    }

    public class FilterOptions {
        @AuraEnabled public List<String> empresasTitulares;
        @AuraEnabled public List<String> areas;
        @AuraEnabled public List<PicklistOpt> simulaciones;
    }

    @AuraEnabled(cacheable=true)
    public static FilterOptions getFilterOptions() {
        FilterOptions o = new FilterOptions();
        o.empresasTitulares = picklist('Linea_asiento_contable__c', 'Empresa_titular__c');
        o.areas             = picklist('Linea_asiento_contable__c', 'rea__c');
        o.simulaciones      = picklistOpts('Linea_asiento_contable__c', 'Simulaci_n__c');
        return o;
    }

    private static List<PicklistOpt> picklistOpts(String objApi, String fieldApi) {
        List<PicklistOpt> out = new List<PicklistOpt>();
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objApi);
        if (t == null) return out;
        for (Schema.PicklistEntry e : t.getDescribe().fields.getMap().get(fieldApi).getDescribe().getPicklistValues()) {
            if (e.isActive()) {
                PicklistOpt p = new PicklistOpt();
                p.value = e.getValue();
                p.label = e.getLabel();
                out.add(p);
            }
        }
        return out;
    }

    private static List<String> picklist(String objApi, String fieldApi) {
        List<String> out = new List<String>();
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objApi);
        if (t == null) return out;
        for (Schema.PicklistEntry e : t.getDescribe().fields.getMap().get(fieldApi).getDescribe().getPicklistValues()) {
            if (e.isActive()) out.add(e.getValue());
        }
        return out;
    }

    // =====================================================================
    //  CUENTAS (para los dos filtros: por título y por número)
    // =====================================================================
    public class CuentaOpt {
        @AuraEnabled public Id     id;
        @AuraEnabled public String numero;
        @AuraEnabled public String titulo;
        @AuraEnabled public String apartado;
        @AuraEnabled public String subapartado;
    }

    @AuraEnabled
    public static List<CuentaOpt> getCuentas(List<String> empresasTitulares) {
        List<CuentaOpt> out = new List<CuentaOpt>();
        if (empresasTitulares == null || empresasTitulares.isEmpty()) return out;

        Set<Id> ids = new Set<Id>();
        for (AggregateResult ar : [
            SELECT Plan__c c FROM Linea_asiento_contable__c
            WHERE Empresa_titular__c IN :empresasTitulares AND Plan__c != null
            GROUP BY Plan__c LIMIT 5000
        ]) { ids.add((Id) ar.get('c')); }

        for (AggregateResult ar : [
            SELECT Plan_general_contable__c c FROM Apuntes_extraodinarios__c
            WHERE Empresa_titular__c IN :empresasTitulares AND Plan_general_contable__c != null
            GROUP BY Plan_general_contable__c LIMIT 5000
        ]) { ids.add((Id) ar.get('c')); }

        if (ids.isEmpty()) return out;

        for (Plan_general_contable__c p : [
            SELECT Id, Name, T_tulo_cuenta__c, Apartados__c, Categor_a_Anal_tica_PyG__c
            FROM Plan_general_contable__c
            WHERE Id IN :ids ORDER BY Name ASC LIMIT 5000
        ]) {
            CuentaOpt c = new CuentaOpt();
            c.id = p.Id; c.numero = p.Name; c.titulo = p.T_tulo_cuenta__c;
            c.apartado = p.Apartados__c;
            c.subapartado = p.Categor_a_Anal_tica_PyG__c;
            out.add(c);
        }
        return out;
    }

    // =====================================================================
    //  APUNTES DEL LIBRO MAYOR
    // =====================================================================
    public class Apunte implements Comparable {
        @AuraEnabled public Id      recordId;
        @AuraEnabled public Boolean extraordinario;
        @AuraEnabled public String  objectApiName;
        @AuraEnabled public Date    fecha;
        @AuraEnabled public String  numeroApunte;
        @AuraEnabled public String  numeroAsiento;
        @AuraEnabled public Id      asientoId;
        @AuraEnabled public Id      extractoBancarioId;
        @AuraEnabled public String  extractoBancarioNumero;
        @AuraEnabled public String  extractoBancarioConcepto;
        @AuraEnabled public String  extractoBancarioMasDatos;
        @AuraEnabled public Id      facturaRecibidaId;
        @AuraEnabled public String  facturaRecibidaDesc;
        @AuraEnabled public Id      nominaId;
        @AuraEnabled public String  nominaEmpleado;
        @AuraEnabled public Id      notaGastosId;
        @AuraEnabled public Id      lineaFacturaEmitidaId;
        @AuraEnabled public String  descripcion;
        @AuraEnabled public Decimal debe;
        @AuraEnabled public Decimal haber;
        @AuraEnabled public Decimal saldo;
        @AuraEnabled public String  empresaTitular;
        @AuraEnabled public String  area;
        @AuraEnabled public String  directorFacturacion;
        @AuraEnabled public Id      directorFacturacionId;
        @AuraEnabled public String  simulacion;
        @AuraEnabled public String  checkValue;
        @AuraEnabled public Id      campaniaId;
        @AuraEnabled public String  incidencia;

        // Orden cronológico ascendente (para acumular el saldo)
        public Integer compareTo(Object o) {
            Apunte m = (Apunte) o;
            if (this.fecha == m.fecha) {
                String a = this.numeroApunte == null ? '' : this.numeroApunte;
                String b = m.numeroApunte == null ? '' : m.numeroApunte;
                return a.compareTo(b);
            }
            if (this.fecha == null) return -1;
            if (m.fecha == null) return 1;
            return this.fecha < m.fecha ? -1 : 1;
        }
    }

    @AuraEnabled
    public static List<Apunte> getLibroMayor(
        Id cuentaId,
        List<String> empresasTitulares,
        Date desde,
        Date hasta,
        String simulacion,
        String extraordinarios,
        String check,
        String incidencia
    ) {
        List<Apunte> all = new List<Apunte>();
        if (cuentaId == null) return all;
        if (empresasTitulares == null || empresasTitulares.isEmpty()) return all;

        // --- Apuntes contables ---
        Boolean incluirContables = (extraordinarios != 'Si');
        if (incluirContables) {
            String soql = 'SELECT Id, Name, Fecha_asiento__c, Descripci_n__c, Debe__c, Haber__c, '
                        + 'Empresa_titular__c, rea__c, Simulaci_n__c, Check__c, '
                        + 'Director_asignado_facturaci_n__c, Director_asignado_facturaci_n__r.Name, '
                        + 'Asientos_contable__c, Asientos_contable__r.Name, '
                        + 'Extracto_bancario__c, Extracto_bancario__r.Name, Extracto_bancario__r.Concepto__c, Extracto_bancario__r.M_s_datos__c, '
                        + 'Facturas_recibidas__c, Facturas_recibidas__r.Descripci_n__c, '
                        + 'N_minas_empleados__c, N_minas_empleados__r.Nombre_empleado__c, Nota_de_gastos__c, Campa_a__c, L_nea_de_facturas_emitidas__c, Incidencia__c '
                        + 'FROM Linea_asiento_contable__c '
                        + 'WHERE Plan__c = :cuentaId AND Empresa_titular__c IN :empresasTitulares ';
            soql += simulacionClause(simulacion);
            soql += checkClause(check);
            soql += incidenciaClause(incidencia);
            soql += 'ORDER BY Fecha_asiento__c ASC NULLS FIRST, Name ASC LIMIT 5000';

            for (Linea_asiento_contable__c l : Database.query(soql)) {
                Apunte a = new Apunte();
                a.recordId       = l.Id;
                a.extraordinario = false;
                a.objectApiName  = 'Linea_asiento_contable__c';
                a.fecha          = l.Fecha_asiento__c;
                a.numeroApunte   = l.Name;
                a.numeroAsiento  = (l.Asientos_contable__r != null) ? l.Asientos_contable__r.Name : '';
                a.asientoId      = l.Asientos_contable__c;
                a.extractoBancarioId = l.Extracto_bancario__c;
                a.extractoBancarioNumero = (l.Extracto_bancario__r != null) ? l.Extracto_bancario__r.Name : '';
                a.extractoBancarioConcepto = (l.Extracto_bancario__r != null) ? l.Extracto_bancario__r.Concepto__c : null;
                a.extractoBancarioMasDatos = (l.Extracto_bancario__r != null) ? l.Extracto_bancario__r.M_s_datos__c : null;
                a.facturaRecibidaId = l.Facturas_recibidas__c;
                a.facturaRecibidaDesc = (l.Facturas_recibidas__r != null) ? l.Facturas_recibidas__r.Descripci_n__c : null;
                a.nominaId = l.N_minas_empleados__c;
                a.nominaEmpleado = (l.N_minas_empleados__r != null) ? l.N_minas_empleados__r.Nombre_empleado__c : null;
                a.notaGastosId      = l.Nota_de_gastos__c;
                a.lineaFacturaEmitidaId = l.L_nea_de_facturas_emitidas__c;
                a.descripcion    = l.Descripci_n__c;
                a.debe           = zero(l.Debe__c);
                a.haber          = zero(l.Haber__c);
                a.empresaTitular = l.Empresa_titular__c;
                a.area           = l.rea__c;
                a.directorFacturacionId = l.Director_asignado_facturaci_n__c;
                a.directorFacturacion   = (l.Director_asignado_facturaci_n__r != null)
                    ? l.Director_asignado_facturaci_n__r.Name : '';
                a.simulacion     = l.Simulaci_n__c;
                a.checkValue     = l.Check__c;
                a.campaniaId     = l.Campa_a__c;
                a.incidencia     = l.Incidencia__c;
                all.add(a);
            }
        }

        // --- Apuntes extraordinarios ---
        // No tienen campo Incidencia__c: si se filtra por incidencia 'Si' se excluyen.
        Boolean incluirExtra = (extraordinarios == 'Si' || extraordinarios == 'Todas') && incidencia != 'Si';
        if (incluirExtra) {
            String soql = 'SELECT Id, Name, Fecha_apunte_extraordinario__c, Comentario__c, Debe__c, Haber__c, '
                        + 'Empresa_titular__c, rea__c, Simulaci_n__c, Check__c, '
                        + 'Director_facturaci_n_asignado__c, Director_facturaci_n_asignado__r.Name, Campa_a__c '
                        + 'FROM Apuntes_extraodinarios__c '
                        + 'WHERE Plan_general_contable__c = :cuentaId AND Empresa_titular__c IN :empresasTitulares ';
            soql += simulacionClause(simulacion);
            soql += checkClause(check);
            soql += 'ORDER BY Fecha_apunte_extraordinario__c ASC NULLS FIRST, Name ASC LIMIT 5000';

            for (Apuntes_extraodinarios__c e : Database.query(soql)) {
                Apunte a = new Apunte();
                a.recordId       = e.Id;
                a.extraordinario = true;
                a.objectApiName  = 'Apuntes_extraodinarios__c';
                a.fecha          = e.Fecha_apunte_extraordinario__c;
                a.numeroApunte   = e.Name;
                a.numeroAsiento  = '';
                a.descripcion    = e.Comentario__c;
                a.debe           = zero(e.Debe__c);
                a.haber          = zero(e.Haber__c);
                a.empresaTitular = e.Empresa_titular__c;
                a.area           = e.rea__c;
                a.directorFacturacionId = e.Director_facturaci_n_asignado__c;
                a.directorFacturacion   = (e.Director_facturaci_n_asignado__r != null)
                    ? e.Director_facturaci_n_asignado__r.Name : '';
                a.simulacion     = e.Simulaci_n__c;
                a.checkValue     = e.Check__c;
                a.campaniaId     = e.Campa_a__c;
                all.add(a);
            }
        }

        // Orden cronológico asc y saldo acumulado sobre TODO el histórico
        all.sort();
        Decimal running = 0;
        for (Apunte a : all) {
            running += (a.debe - a.haber);
            a.saldo = running;
        }

        // Ventana por fechas (el saldo ya arrastra lo anterior)
        List<Apunte> visible = new List<Apunte>();
        for (Apunte a : all) {
            if (desde != null && a.fecha != null && a.fecha < desde) continue;
            if (hasta != null && a.fecha != null && a.fecha > hasta) continue;
            visible.add(a);
        }

        // De más reciente a más antigua
        List<Apunte> out = new List<Apunte>();
        for (Integer i = visible.size() - 1; i >= 0; i--) out.add(visible[i]);
        return out;
    }

    // =====================================================================
    //  NAVEGACIÓN ANTERIOR / SIGUIENTE por número de cuenta
    //  acumuladoFiltro: 'Todas' | 'NoCero' | 'Positivo'
    //  direccion:       'anterior' | 'siguiente'
    // =====================================================================
    @AuraEnabled
    public static CuentaOpt getAdjacentCuenta(
        Id cuentaId,
        String direccion,
        List<String> empresasTitulares,
        String simulacion,
        String extraordinarios,
        String check,
        String acumuladoFiltro,
        String incidencia
    ) {
        if (cuentaId == null) return null;
        if (empresasTitulares == null || empresasTitulares.isEmpty()) return null;

        List<Plan_general_contable__c> actuales = [
            SELECT Id, Name FROM Plan_general_contable__c WHERE Id = :cuentaId LIMIT 1
        ];
        if (actuales.isEmpty()) return null;
        String currentName = actuales[0].Name;

        // Saldo acumulado por cuenta (todo el histórico) respetando filtros
        Map<Id, Decimal> saldo = new Map<Id, Decimal>();

        Boolean incluirContables = (extraordinarios != 'Si');
        if (incluirContables) {
            String soql = 'SELECT Plan__c c, SUM(Debe__c) d, SUM(Haber__c) h FROM Linea_asiento_contable__c '
                        + 'WHERE Empresa_titular__c IN :empresasTitulares AND Plan__c != null ';
            soql += simulacionClause(simulacion) + checkClause(check) + incidenciaClause(incidencia);
            soql += 'GROUP BY Plan__c LIMIT 50000';
            for (AggregateResult ar : Database.query(soql)) {
                Id c = (Id) ar.get('c');
                Decimal s = (saldo.containsKey(c) ? saldo.get(c) : 0)
                          + (zero((Decimal) ar.get('d')) - zero((Decimal) ar.get('h')));
                saldo.put(c, s);
            }
        }
        Boolean incluirExtra = (extraordinarios == 'Si' || extraordinarios == 'Todas') && incidencia != 'Si';
        if (incluirExtra) {
            String soql = 'SELECT Plan_general_contable__c c, SUM(Debe__c) d, SUM(Haber__c) h FROM Apuntes_extraodinarios__c '
                        + 'WHERE Empresa_titular__c IN :empresasTitulares AND Plan_general_contable__c != null ';
            soql += simulacionClause(simulacion) + checkClause(check);
            soql += 'GROUP BY Plan_general_contable__c LIMIT 50000';
            for (AggregateResult ar : Database.query(soql)) {
                Id c = (Id) ar.get('c');
                Decimal s = (saldo.containsKey(c) ? saldo.get(c) : 0)
                          + (zero((Decimal) ar.get('d')) - zero((Decimal) ar.get('h')));
                saldo.put(c, s);
            }
        }
        if (saldo.isEmpty()) return null;

        // Cuentas que cumplen el criterio de acumulado
        Set<Id> qualify = new Set<Id>();
        for (Id c : saldo.keySet()) {
            Decimal s = saldo.get(c);
            Boolean ok = true;
            if (acumuladoFiltro == 'NoCero')        ok = (s != 0);
            else if (acumuladoFiltro == 'Positivo') ok = (s > 0);
            if (ok) qualify.add(c);
        }
        if (qualify.isEmpty()) return null;

        List<Plan_general_contable__c> cands = [
            SELECT Id, Name, T_tulo_cuenta__c, Apartados__c, Categor_a_Anal_tica_PyG__c
            FROM Plan_general_contable__c
            WHERE Id IN :qualify ORDER BY Name ASC
        ];

        Plan_general_contable__c target = null;
        if (direccion == 'siguiente') {
            for (Plan_general_contable__c p : cands) {
                if (p.Id != cuentaId && p.Name != null && p.Name.compareTo(currentName) > 0) { target = p; break; }
            }
        } else {
            for (Integer i = cands.size() - 1; i >= 0; i--) {
                if (cands[i].Id != cuentaId && cands[i].Name != null && cands[i].Name.compareTo(currentName) < 0) { target = cands[i]; break; }
            }
        }
        if (target == null) return null;

        CuentaOpt o = new CuentaOpt();
        o.id = target.Id; o.numero = target.Name; o.titulo = target.T_tulo_cuenta__c;
        o.apartado = target.Apartados__c;
        o.subapartado = target.Categor_a_Anal_tica_PyG__c;
        return o;
    }

    // =====================================================================
    //  MARCADO MASIVO DEL CHECK (apuntes en pantalla)
    // =====================================================================
    @AuraEnabled
    public static String marcarCheck(List<Id> lineaIds, List<Id> extraIds, String valor) {
        String v = String.isBlank(valor) ? null : valor;
        List<SObject> toUpdate = new List<SObject>();
        if (lineaIds != null) {
            for (Id i : lineaIds) toUpdate.add(new Linea_asiento_contable__c(Id = i, Check__c = v));
        }
        if (extraIds != null) {
            for (Id i : extraIds) toUpdate.add(new Apuntes_extraodinarios__c(Id = i, Check__c = v));
        }
        if (toUpdate.isEmpty()) return 'OK';
        try {
            update toUpdate;
            return 'OK';
        } catch (DmlException ex) {
            throw new AuraHandledException('Error al guardar: ' + ex.getDmlMessage(0));
        }
    }

    // =====================================================================
    //  Efectos de clientes de la cuenta (pestaña del Libro Mayor para 430)
    // =====================================================================
    // Estados que se consideran "cerrados" (la fila NO se marca en rojo)
    private static final Set<String> ESTADOS_EF_CERRADOS = new Set<String>{
        'En remesa', 'Conciliado', 'Tarjeta', 'Compensado', 'Incobrable', 'Pagado'
    };

    public class EfectoClienteDTO {
        @AuraEnabled public Id      id;
        @AuraEnabled public String  numero;
        @AuraEnabled public Decimal importe;
        @AuraEnabled public Date    fechaVencimientoInicial;
        @AuraEnabled public String  estado;
        @AuraEnabled public Id      facturaId;
        @AuraEnabled public String  facturaNumero;
        @AuraEnabled public Id      origenId;
        @AuraEnabled public String  origenNumero;
        @AuraEnabled public Id      compensadoId;
        @AuraEnabled public String  compensadoNumero;
        @AuraEnabled public Boolean abierto;   // true => fila en rojo
    }

    /**
     * Efectos de clientes cuyas empresas (Account) tienen como "Cuenta contable
     * cliente" la cuenta del Libro Mayor, de las empresas titulares seleccionadas.
     * Orden: fecha de vencimiento inicial descendente.
     */
    @AuraEnabled
    public static List<EfectoClienteDTO> getEfectosClientes(Id cuentaId, List<String> empresasTitulares) {
        List<EfectoClienteDTO> out = new List<EfectoClienteDTO>();
        if (cuentaId == null || empresasTitulares == null || empresasTitulares.isEmpty()) return out;

        Map<Id, Account> clientes = new Map<Id, Account>(
            [SELECT Id FROM Account WHERE Cuenta_contable_cliente__c = :cuentaId]);
        if (clientes.isEmpty()) return out;

        for (Reclamaci_n_de_impagados__c e : [
            SELECT Id, Name, Importe_factura__c, Fecha_de_vencimiento_inicial__c, Estado__c,
                   Facturas_emitidas__c, Facturas_emitidas__r.Name,
                   Origen_divisi_n__c, Origen_divisi_n__r.Name,
                   Efecto_compensado__c, Efecto_compensado__r.Name
            FROM Reclamaci_n_de_impagados__c
            WHERE Cliente__c IN :clientes.keySet()
              AND Empresa_titular__c IN :empresasTitulares
            ORDER BY Fecha_de_vencimiento_inicial__c DESC NULLS LAST, Name DESC
            LIMIT 1000
        ]) {
            EfectoClienteDTO d = new EfectoClienteDTO();
            d.id = e.Id;
            d.numero = e.Name;
            d.importe = zero(e.Importe_factura__c);
            d.fechaVencimientoInicial = e.Fecha_de_vencimiento_inicial__c;
            d.estado = e.Estado__c;
            d.facturaId = e.Facturas_emitidas__c;
            d.facturaNumero = (e.Facturas_emitidas__r == null) ? '' : e.Facturas_emitidas__r.Name;
            d.origenId = e.Origen_divisi_n__c;
            d.origenNumero = (e.Origen_divisi_n__r == null) ? '' : e.Origen_divisi_n__r.Name;
            d.compensadoId = e.Efecto_compensado__c;
            d.compensadoNumero = (e.Efecto_compensado__r == null) ? '' : e.Efecto_compensado__r.Name;
            d.abierto = !ESTADOS_EF_CERRADOS.contains(e.Estado__c);
            out.add(d);
        }
        return out;
    }

    // =====================================================================
    //  Efectos proveedores de la cuenta (pestaña del Libro Mayor para 410)
    // =====================================================================
    // Estados que se consideran "cerrados" (la fila NO se marca en rojo)
    private static final Set<String> ESTADOS_EFP_CERRADOS = new Set<String>{
        'Conciliado', 'Remesa', 'En remesa', 'Tarjeta'
    };

    public class EfectoProveedorDTO {
        @AuraEnabled public Id      id;
        @AuraEnabled public String  numero;
        @AuraEnabled public Decimal importe;
        @AuraEnabled public Date    fechaVencimiento;
        @AuraEnabled public String  estado;
        @AuraEnabled public String  tipoEfecto;
        @AuraEnabled public String  formaPago;
        @AuraEnabled public Id      facturaRecibidaId;
        @AuraEnabled public String  facturaRecibidaNumero;
        @AuraEnabled public Id      notaGastosId;
        @AuraEnabled public String  notaGastosNumero;
        @AuraEnabled public Id      pedidoCompraId;
        @AuraEnabled public String  pedidoCompraNumero;
        @AuraEnabled public Id      campaniaId;
        @AuraEnabled public String  campaniaNombre;
        @AuraEnabled public Boolean abierto;   // true => fila en rojo
    }

    /**
     * Efectos proveedores cuyas empresas (Account) tienen como "Cuenta contable
     * proveedor" la cuenta del Libro Mayor, de las empresas titulares seleccionadas.
     * Orden: fecha de vencimiento descendente.
     */
    @AuraEnabled
    public static List<EfectoProveedorDTO> getEfectosProveedores(Id cuentaId, List<String> empresasTitulares) {
        List<EfectoProveedorDTO> out = new List<EfectoProveedorDTO>();
        if (cuentaId == null || empresasTitulares == null || empresasTitulares.isEmpty()) return out;

        Map<Id, Account> proveedores = new Map<Id, Account>(
            [SELECT Id FROM Account WHERE Cuenta_contable_proveedor__c = :cuentaId]);
        if (proveedores.isEmpty()) return out;

        for (Efectos_proveedores__c e : [
            SELECT Id, Name, Importe_efecto__c, Fecha_vencimiento__c, Estado__c,
                   Tipo_de_efecto__c, Forma_de_pago__c,
                   Facturas_recibidas__c, Facturas_recibidas__r.Name,
                   Nota_de_gastos__c, Nota_de_gastos__r.Name,
                   Pedidos_de_compra__c, Pedidos_de_compra__r.Name,
                   Campa_a__c, Campa_a__r.Name
            FROM Efectos_proveedores__c
            WHERE Empresa__c IN :proveedores.keySet()
              AND Empresa_titular__c IN :empresasTitulares
            ORDER BY Fecha_vencimiento__c DESC NULLS LAST, Name DESC
            LIMIT 1000
        ]) {
            EfectoProveedorDTO d = new EfectoProveedorDTO();
            d.id = e.Id;
            d.numero = e.Name;
            d.importe = zero(e.Importe_efecto__c);
            d.fechaVencimiento = e.Fecha_vencimiento__c;
            d.estado = e.Estado__c;
            d.tipoEfecto = e.Tipo_de_efecto__c;
            d.formaPago = e.Forma_de_pago__c;
            d.facturaRecibidaId = e.Facturas_recibidas__c;
            d.facturaRecibidaNumero = (e.Facturas_recibidas__r == null) ? '' : e.Facturas_recibidas__r.Name;
            d.notaGastosId = e.Nota_de_gastos__c;
            d.notaGastosNumero = (e.Nota_de_gastos__r == null) ? '' : e.Nota_de_gastos__r.Name;
            d.pedidoCompraId = e.Pedidos_de_compra__c;
            d.pedidoCompraNumero = (e.Pedidos_de_compra__r == null) ? '' : e.Pedidos_de_compra__r.Name;
            d.campaniaId = e.Campa_a__c;
            d.campaniaNombre = (e.Campa_a__r == null) ? '' : e.Campa_a__r.Name;
            d.abierto = !ESTADOS_EFP_CERRADOS.contains(e.Estado__c);
            out.add(d);
        }
        return out;
    }

    // =====================================================================
    //  Helpers
    // =====================================================================
    private static Decimal zero(Decimal v) { return v == null ? 0 : v; }

    private static String checkClause(String check) {
        if (check == 'Si') return 'AND Check__c = \'Si\' ';
        if (check == 'No') return 'AND (Check__c = \'No\' OR Check__c = null) ';
        return '';
    }

    private static String incidenciaClause(String incidencia) {
        if (incidencia == 'Si') return 'AND Incidencia__c = \'Si\' ';
        if (incidencia == 'No') return 'AND (Incidencia__c = \'No\' OR Incidencia__c = null) ';
        return ''; // Todos
    }

    private static String simulacionClause(String simulacion) {
        if (simulacion == 'No') {
            return 'AND (Simulaci_n__c = \'No\' OR Simulaci_n__c = null) ';
        } else if (simulacion == 'Si') {
            return 'AND Simulaci_n__c = \'Si\' ';
        } else if (simulacion == 'Sí. Transferencia') {
            return 'AND Simulaci_n__c = \'Sí. Transferencia\' ';
        }
        return ''; // Todas
    }
}