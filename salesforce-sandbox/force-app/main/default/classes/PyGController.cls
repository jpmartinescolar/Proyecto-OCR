public with sharing class PyGController {

    // ---------------------------------------------------------------------
    //  WRAPPERS
    // ---------------------------------------------------------------------
    public class FilterOptions {
        @AuraEnabled public List<String> empresasTitulares;
        @AuraEnabled public List<String> areas;
        @AuraEnabled public List<String> planesPGC;
    }

    public class PyGRow {
        @AuraEnabled public String key                  { get; set; }
        @AuraEnabled public String tipo                 { get; set; }   // 'SECCION' | 'CUENTA' | 'SUBTOTAL'
        @AuraEnabled public Integer nivel               { get; set; }
        @AuraEnabled public Id     cuentaId             { get; set; }   // sólo CUENTA
        @AuraEnabled public String codigoCuenta         { get; set; }   // sólo CUENTA
        @AuraEnabled public String concepto             { get; set; }
        @AuraEnabled public Decimal valorActual         { get; set; }   // periodo desde-hasta
        @AuraEnabled public Decimal valorComparado      { get; set; }   // periodo comp_desde-comp_hasta
        @AuraEnabled public Decimal porcentajeActual    { get; set; }   // % s/CN (sólo subtotales)
        @AuraEnabled public Decimal porcentajeComparado { get; set; }   // % s/CN (sólo subtotales)
        @AuraEnabled public Boolean esGasto             { get; set; }
        @AuraEnabled public List<Id> cuentaIds          { get; set; }

        public PyGRow() {
            this.valorActual = 0;
            this.valorComparado = 0;
            this.porcentajeActual = null;
            this.porcentajeComparado = null;
            this.esGasto = false;
            this.cuentaIds = new List<Id>();
        }
    }

    public class Movimiento implements Comparable {
        @AuraEnabled public Id      recordId;
        @AuraEnabled public Boolean extraordinario;
        @AuraEnabled public Date    fecha;
        @AuraEnabled public String  numero;
        @AuraEnabled public String  descripcion;
        @AuraEnabled public Decimal debe;
        @AuraEnabled public Decimal haber;
        @AuraEnabled public String  tipoAsiento;
        @AuraEnabled public String  empresaTitular;
        @AuraEnabled public String  area;
        @AuraEnabled public String  directorFacturacion;
        @AuraEnabled public Id      directorFacturacionId;
        @AuraEnabled public String  simulacion;
        @AuraEnabled public String  checkValue;
        @AuraEnabled public Id      campaniaId;
        @AuraEnabled public String  campania;
        @AuraEnabled public Id      descLinkId;
        @AuraEnabled public String  descLinkObject;
        @AuraEnabled public String  descLinkTitle;

        public Integer compareTo(Object o) {
            Movimiento m = (Movimiento) o;
            if (this.fecha == m.fecha) {
                if (this.numero == m.numero) return 0;
                if (this.numero == null) return -1;
                if (m.numero == null) return 1;
                return this.numero < m.numero ? -1 : 1;
            }
            if (this.fecha == null) return -1;
            if (m.fecha == null) return 1;
            return this.fecha < m.fecha ? -1 : 1;
        }
    }

    // Enlace de la descripción del movimiento (nómina en cuentas 6x · factura recibida · nota · línea)
    private static void setDescLink(Movimiento m, String cuentaNum, Id nominaId, String nominaEmp,
                                    Id frId, String frDesc, Id notaId, Id lineaId) {
        if (cuentaNum != null && cuentaNum.startsWith('6') && nominaId != null) {
            m.descLinkId = nominaId; m.descLinkObject = 'N_minas_empleados__c';
            m.descLinkTitle = String.isNotBlank(nominaEmp) ? ('Empleado: ' + nominaEmp) : 'Abrir nómina en una pestaña nueva';
        } else if (frId != null) {
            m.descLinkId = frId; m.descLinkObject = 'Facturas_recibidas_eventos__c';
            m.descLinkTitle = String.isNotBlank(frDesc) ? ('Descripción factura recibida: ' + frDesc) : 'Abrir factura recibida en una pestaña nueva';
        } else if (notaId != null) {
            m.descLinkId = notaId; m.descLinkObject = 'Gastos_de_viaje_o_representaci_n__c';
            m.descLinkTitle = 'Abrir nota de gastos en una pestaña nueva';
        } else if (lineaId != null) {
            m.descLinkId = lineaId; m.descLinkObject = 'L_nea_de_factura__c';
            m.descLinkTitle = 'Abrir línea de factura emitida en una pestaña nueva';
        }
    }

    // ---------------------------------------------------------------------
    //  FILTER OPTIONS
    // ---------------------------------------------------------------------
    @AuraEnabled(cacheable=true)
    public static FilterOptions getFilterOptions() {
        FilterOptions opt = new FilterOptions();
        opt.empresasTitulares = getPicklistValues('Linea_asiento_contable__c', 'Empresa_titular__c');
        opt.areas             = getPicklistValues('Linea_asiento_contable__c', 'rea__c');
        opt.planesPGC         = new List<String>{ 'PGC Normal', 'PGC Abreviado', 'PGC PYMES' };
        return opt;
    }

    private static List<String> getPicklistValues(String objApi, String fieldApi) {
        List<String> out = new List<String>();
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objApi);
        if (t == null) return out;
        Schema.DescribeFieldResult fr = t.getDescribe().fields.getMap().get(fieldApi).getDescribe();
        for (Schema.PicklistEntry e : fr.getPicklistValues()) {
            if (e.isActive()) out.add(e.getValue());
        }
        return out;
    }

    // ---------------------------------------------------------------------
    //  GENERAR
    // ---------------------------------------------------------------------
    @AuraEnabled
    public static List<PyGRow> generar(
        List<String> empresasTitulares,
        String area,
        Id     directorFacturacionId,
        Date   fechaDesde,
        Date   fechaHasta,
        Date   fechaCompDesde,
        Date   fechaCompHasta,
        String planPGC,
        String simulacion,
        String extraordinarios,
        String check
    ) {
        if (empresasTitulares == null || empresasTitulares.isEmpty()) {
            throw new AuraHandledException('Debes seleccionar al menos una empresa titular.');
        }
        if (fechaDesde == null || fechaHasta == null || fechaCompDesde == null || fechaCompHasta == null) {
            throw new AuraHandledException('Debes indicar las cuatro fechas (Desde, Hasta, Comparativo desde, Comparativo hasta).');
        }

        // Cuentas PGC que empiezan por 6 o 7 (P&G)
        Map<Id, Plan_general_contable__c> cuentasPGC = new Map<Id, Plan_general_contable__c>(
            [SELECT Id, Name, T_tulo_cuenta__c
               FROM Plan_general_contable__c
              WHERE (Name LIKE '6%' OR Name LIKE '7%')]
        );
        Set<Id> idsCuentas = cuentasPGC.keySet();

        Map<Id, Decimal> saldoActual    = new Map<Id, Decimal>();
        Map<Id, Decimal> saldoComparado = new Map<Id, Decimal>();

        // Periodo actual
        agregarSaldosPeriodo(saldoActual, fechaDesde, fechaHasta, idsCuentas, empresasTitulares,
                              area, directorFacturacionId, simulacion, extraordinarios, check);
        // Periodo comparativo
        agregarSaldosPeriodo(saldoComparado, fechaCompDesde, fechaCompHasta, idsCuentas, empresasTitulares,
                              area, directorFacturacionId, simulacion, extraordinarios, check);

        return construirEstructura(planPGC, cuentasPGC, saldoActual, saldoComparado);
    }

    // ---------------------------------------------------------------------
    //  AGREGACIÓN DE SALDOS PARA UN PERIODO
    // ---------------------------------------------------------------------
    public static void agregarSaldosPeriodo(
        Map<Id, Decimal> store,
        Date desde,
        Date hasta,
        Set<Id> idsCuentas,
        List<String> empresasTitulares,
        String area,
        Id directorFacturacionId,
        String simulacion,
        String extraordinarios,
        String check
    ) {
        // --- Apuntes contables (agregado por cuenta para no superar el límite de filas) ---
        Boolean incluirContables = (extraordinarios != 'Si');
        if (incluirContables) {
            String soql = 'SELECT Plan__c c, SUM(Debe__c) d, SUM(Haber__c) h '
                        + 'FROM Linea_asiento_contable__c '
                        + 'WHERE Plan__c IN :idsCuentas '
                        + 'AND Asientos_contable__r.Fecha_asiento_contable__c >= :desde '
                        + 'AND Asientos_contable__r.Fecha_asiento_contable__c <= :hasta '
                        + 'AND Empresa_titular__c IN :empresasTitulares '
                        // El asiento de regularización salda las 6/7: si se incluyera, el PyG saldría a cero
                        + 'AND Tipo_de_asiento__c != \'Asiento Reg. Cierre\' ';
            if (String.isNotBlank(area))             soql += 'AND rea__c = :area ';
            if (directorFacturacionId != null)       soql += 'AND Director_asignado_facturaci_n__c = :directorFacturacionId ';
            soql += simulacionClause(simulacion);
            soql += checkClause(check);
            soql += 'GROUP BY Plan__c';

            for (AggregateResult ar : Database.query(soql)) {
                Decimal d = (Decimal) ar.get('d');
                Decimal h = (Decimal) ar.get('h');
                acumular(store, (Id) ar.get('c'), (h == null ? 0 : h) - (d == null ? 0 : d));
            }
        }

        // --- Apuntes extraordinarios (agregado por cuenta) ---
        Boolean incluirExtra = (extraordinarios == 'Si' || extraordinarios == 'Todas');
        if (incluirExtra) {
            String soql = 'SELECT Plan_general_contable__c c, SUM(Debe__c) d, SUM(Haber__c) h '
                        + 'FROM Apuntes_extraodinarios__c '
                        + 'WHERE Plan_general_contable__c IN :idsCuentas '
                        + 'AND Fecha_apunte_extraordinario__c >= :desde '
                        + 'AND Fecha_apunte_extraordinario__c <= :hasta '
                        + 'AND Empresa_titular__c IN :empresasTitulares ';
            if (String.isNotBlank(area))             soql += 'AND rea__c = :area ';
            if (directorFacturacionId != null)       soql += 'AND Director_facturaci_n_asignado__c = :directorFacturacionId ';
            soql += simulacionClause(simulacion);
            soql += checkClause(check);
            soql += 'GROUP BY Plan_general_contable__c';

            for (AggregateResult ar : Database.query(soql)) {
                Decimal d = (Decimal) ar.get('d');
                Decimal h = (Decimal) ar.get('h');
                acumular(store, (Id) ar.get('c'), (h == null ? 0 : h) - (d == null ? 0 : d));
            }
        }
    }

    private static void acumular(Map<Id, Decimal> store, Id cuentaId, Decimal valor) {
        if (cuentaId == null) return;
        Decimal v = store.get(cuentaId);
        store.put(cuentaId, (v == null ? 0 : v) + (valor == null ? 0 : valor));
    }

    private static String simulacionClause(String simulacion) {
        if (simulacion == 'No') {
            return 'AND (Simulaci_n__c = \'No\' OR Simulaci_n__c = null) ';
        } else if (simulacion == 'Si') {
            return 'AND Simulaci_n__c = \'Si\' ';
        } else if (simulacion == 'Sí. Transferencia') {
            return 'AND Simulaci_n__c = \'Sí. Transferencia\' ';
        }
        return '';
    }

    private static String checkClause(String check) {
        if (check == 'Si') return 'AND Check__c = \'Si\' ';
        if (check == 'No') return 'AND (Check__c = \'No\' OR Check__c = null) ';
        return '';
    }

    // ---------------------------------------------------------------------
    //  ESTRUCTURA
    // ---------------------------------------------------------------------
    public static List<PyGRow> construirEstructura(
        String planPGC,
        Map<Id, Plan_general_contable__c> cuentasPGC,
        Map<Id, Decimal> saldoActual,
        Map<Id, Decimal> saldoComparado
    ) {
        List<PyGStructure.PyGSection> secciones = PyGStructure.estructura(planPGC);

        Map<String, List<CuentaConSaldos>> seccionToCuentas = new Map<String, List<CuentaConSaldos>>();
        for (PyGStructure.PyGSection s : secciones) seccionToCuentas.put(s.key, new List<CuentaConSaldos>());

        // Combina ids con datos en cualquiera de los dos periodos
        Set<Id> idsConDatos = new Set<Id>();
        idsConDatos.addAll(saldoActual.keySet());
        idsConDatos.addAll(saldoComparado.keySet());

        for (Id cuentaId : idsConDatos) {
            Plan_general_contable__c p = cuentasPGC.get(cuentaId);
            if (p == null) continue;
            String secKey = PyGStructure.matchSeccion(p.Name, secciones);
            if (secKey == null) continue;
            CuentaConSaldos cs = new CuentaConSaldos();
            cs.cuentaId = cuentaId;
            cs.codigo = p.Name;
            cs.titulo = (p.T_tulo_cuenta__c == null) ? '' : p.T_tulo_cuenta__c;
            cs.actual = saldoActual.get(cuentaId);
            cs.comparado = saldoComparado.get(cuentaId);
            seccionToCuentas.get(secKey).add(cs);
        }

        for (String k : seccionToCuentas.keySet()) seccionToCuentas.get(k).sort();

        List<PyGRow> rows = new List<PyGRow>();

        // Cifra de negocios (base para %)
        Decimal CNa = 0, CNc = 0;
        // Acumuladores de subtotales
        Decimal explA = 0, explC = 0;
        Decimal finA  = 0, finC  = 0;
        Decimal impA  = 0, impC  = 0;
        List<Id> idsExpl = new List<Id>();
        List<Id> idsFin  = new List<Id>();
        List<Id> idsImp  = new List<Id>();

        for (PyGStructure.PyGSection sec : secciones) {
            if (sec.esSubtotal) {
                PyGRow r = new PyGRow();
                r.key = sec.key;
                r.tipo = 'SUBTOTAL';
                r.nivel = 0;
                r.concepto = sec.label;
                Decimal a = 0, c = 0;
                List<Id> rowIds = new List<Id>();
                if (sec.key == 'A1')      { a = explA; c = explC; rowIds.addAll(idsExpl); }
                else if (sec.key == 'A2') { a = finA;  c = finC;  rowIds.addAll(idsFin); }
                else if (sec.key == 'A3') { a = explA + finA; c = explC + finC; rowIds.addAll(idsExpl); rowIds.addAll(idsFin); }
                // Los saldos van con signo (Haber−Debe): el impuesto se SUMA
                // (gasto → negativo, resta; impuesto a favor → positivo, suma)
                else if (sec.key == 'A4') { a = explA + finA + impA; c = explC + finC + impC; rowIds.addAll(idsExpl); rowIds.addAll(idsFin); rowIds.addAll(idsImp); }
                r.valorActual = a;
                r.valorComparado = c;
                r.cuentaIds = rowIds;
                if (CNa != 0) r.porcentajeActual    = (a / CNa) * 100;
                if (CNc != 0) r.porcentajeComparado = (c / CNc) * 100;
                rows.add(r);
                continue;
            }

            // Sección normal
            PyGRow header = new PyGRow();
            header.key = sec.key;
            header.tipo = 'SECCION';
            header.nivel = 0;
            header.concepto = sec.label;
            header.esGasto = sec.signo == -1;

            List<CuentaConSaldos> cuentas = seccionToCuentas.get(sec.key);
            Decimal totalA = 0, totalC = 0;
            List<Id> idsSec = new List<Id>();
            for (CuentaConSaldos cs : cuentas) {
                Decimal va = (cs.actual    == null) ? 0 : cs.actual;
                Decimal vc = (cs.comparado == null) ? 0 : cs.comparado;
                totalA += va;
                totalC += vc;
                idsSec.add(cs.cuentaId);
            }
            header.valorActual = totalA;
            header.valorComparado = totalC;
            header.cuentaIds = idsSec;
            rows.add(header);

            if (sec.bucket == 'EXPL') {
                explA += totalA; explC += totalC; idsExpl.addAll(idsSec);
            } else if (sec.bucket == 'FIN') {
                finA += totalA; finC += totalC; idsFin.addAll(idsSec);
            } else if (sec.bucket == 'IMP') {
                impA += totalA; impC += totalC; idsImp.addAll(idsSec);
            }

            if (sec.esCN) { CNa += totalA; CNc += totalC; }

            // Filas de cuenta
            for (CuentaConSaldos cs : cuentas) {
                PyGRow cr = new PyGRow();
                cr.key = sec.key + '_' + cs.codigo;
                cr.tipo = 'CUENTA';
                cr.nivel = 1;
                cr.cuentaId = cs.cuentaId;
                cr.cuentaIds = new List<Id>{ cs.cuentaId };
                cr.codigoCuenta = cs.codigo;
                cr.concepto = cs.titulo;
                cr.esGasto = cs.codigo.startsWith('6');
                cr.valorActual = (cs.actual    == null) ? 0 : cs.actual;
                cr.valorComparado = (cs.comparado == null) ? 0 : cs.comparado;
                rows.add(cr);
            }
        }

        return rows;
    }

    public class CuentaConSaldos implements Comparable {
        public Id cuentaId;
        public String codigo;
        public String titulo;
        public Decimal actual;
        public Decimal comparado;
        public Integer compareTo(Object other) {
            CuentaConSaldos o = (CuentaConSaldos) other;
            if (this.codigo == o.codigo) return 0;
            return (this.codigo < o.codigo) ? -1 : 1;
        }
    }

    // ---------------------------------------------------------------------
    //  GET MOVIMIENTOS  (modal al pinchar un importe)
    // ---------------------------------------------------------------------
    @AuraEnabled
    public static List<Movimiento> getMovimientos(
        List<Id> cuentaIds,
        Date desde,
        Date hasta,
        List<String> empresasTitulares,
        String area,
        Id     directorFacturacionId,
        String simulacion,
        String extraordinarios,
        String check,
        List<String> excluirTipos    // tipos de asiento a excluir (p.ej. reg. cierre en PyG, cierre en Balance)
    ) {
        List<Movimiento> out = new List<Movimiento>();
        if (cuentaIds == null || cuentaIds.isEmpty()) return out;
        if (desde == null || hasta == null) return out;
        if (empresasTitulares == null || empresasTitulares.isEmpty()) return out;

        Set<Id> ids = new Set<Id>(cuentaIds);

        // --- Apuntes contables ---
        Boolean incluirContables = (extraordinarios != 'Si');
        if (incluirContables) {
            String soql = 'SELECT Id, Name, Fecha_asiento__c, Descripci_n__c, Debe__c, Haber__c, '
                        + 'Tipo_de_asiento__c, Empresa_titular__c, rea__c, Simulaci_n__c, Check__c, '
                        + 'Director_asignado_facturaci_n__c, Director_asignado_facturaci_n__r.Name, '
                        + 'Campa_a__c, Campa_a__r.Name, Plan__r.Name, '
                        + 'Facturas_recibidas__c, Facturas_recibidas__r.Descripci_n__c, '
                        + 'N_minas_empleados__c, N_minas_empleados__r.Nombre_empleado__c, '
                        + 'Nota_de_gastos__c, L_nea_de_facturas_emitidas__c '
                        + 'FROM Linea_asiento_contable__c '
                        + 'WHERE Plan__c IN :ids '
                        + 'AND Asientos_contable__r.Fecha_asiento_contable__c >= :desde '
                        + 'AND Asientos_contable__r.Fecha_asiento_contable__c <= :hasta '
                        + 'AND Empresa_titular__c IN :empresasTitulares ';
            if (String.isNotBlank(area))             soql += 'AND rea__c = :area ';
            if (directorFacturacionId != null)       soql += 'AND Director_asignado_facturaci_n__c = :directorFacturacionId ';
            if (excluirTipos != null && !excluirTipos.isEmpty()) soql += 'AND Tipo_de_asiento__c NOT IN :excluirTipos ';
            soql += simulacionClause(simulacion);
            soql += checkClause(check);
            soql += 'ORDER BY Fecha_asiento__c, Name LIMIT 2000';

            for (Linea_asiento_contable__c l : Database.query(soql)) {
                Movimiento m = new Movimiento();
                m.recordId        = l.Id;
                m.extraordinario  = false;
                m.fecha           = l.Fecha_asiento__c;
                m.numero          = l.Name;
                m.descripcion     = l.Descripci_n__c;
                m.debe            = l.Debe__c;
                m.haber           = l.Haber__c;
                m.tipoAsiento     = l.Tipo_de_asiento__c;
                m.empresaTitular  = l.Empresa_titular__c;
                m.area            = l.rea__c;
                m.directorFacturacionId = l.Director_asignado_facturaci_n__c;
                m.directorFacturacion = (l.Director_asignado_facturaci_n__r != null)
                    ? l.Director_asignado_facturaci_n__r.Name : '';
                m.simulacion      = l.Simulaci_n__c;
                m.checkValue      = l.Check__c;
                m.campaniaId      = l.Campa_a__c;
                m.campania        = (l.Campa_a__r != null) ? l.Campa_a__r.Name : '';
                setDescLink(m, (l.Plan__r != null ? l.Plan__r.Name : null),
                    l.N_minas_empleados__c, (l.N_minas_empleados__r != null ? l.N_minas_empleados__r.Nombre_empleado__c : null),
                    l.Facturas_recibidas__c, (l.Facturas_recibidas__r != null ? l.Facturas_recibidas__r.Descripci_n__c : null),
                    l.Nota_de_gastos__c, l.L_nea_de_facturas_emitidas__c);
                out.add(m);
            }
        }

        // --- Apuntes extraordinarios ---
        Boolean incluirExtra = (extraordinarios == 'Si' || extraordinarios == 'Todas');
        if (incluirExtra) {
            String soql = 'SELECT Id, Name, Fecha_apunte_extraordinario__c, Comentario__c, Debe__c, Haber__c, '
                        + 'Empresa_titular__c, rea__c, Simulaci_n__c, Check__c, '
                        + 'Director_facturaci_n_asignado__c, Director_facturaci_n_asignado__r.Name, '
                        + 'Campa_a__c, Campa_a__r.Name '
                        + 'FROM Apuntes_extraodinarios__c '
                        + 'WHERE Plan_general_contable__c IN :ids '
                        + 'AND Fecha_apunte_extraordinario__c >= :desde '
                        + 'AND Fecha_apunte_extraordinario__c <= :hasta '
                        + 'AND Empresa_titular__c IN :empresasTitulares ';
            if (String.isNotBlank(area))             soql += 'AND rea__c = :area ';
            if (directorFacturacionId != null)       soql += 'AND Director_facturaci_n_asignado__c = :directorFacturacionId ';
            soql += simulacionClause(simulacion);
            soql += checkClause(check);
            soql += 'ORDER BY Fecha_apunte_extraordinario__c, Name LIMIT 2000';

            for (Apuntes_extraodinarios__c e : Database.query(soql)) {
                Movimiento m = new Movimiento();
                m.recordId        = e.Id;
                m.extraordinario  = true;
                m.fecha           = e.Fecha_apunte_extraordinario__c;
                m.numero          = e.Name;
                m.descripcion     = e.Comentario__c;
                m.debe            = e.Debe__c;
                m.haber           = e.Haber__c;
                m.tipoAsiento     = 'Extraordinario';
                m.empresaTitular  = e.Empresa_titular__c;
                m.area            = e.rea__c;
                m.directorFacturacionId = e.Director_facturaci_n_asignado__c;
                m.directorFacturacion = (e.Director_facturaci_n_asignado__r != null)
                    ? e.Director_facturaci_n_asignado__r.Name : '';
                m.simulacion      = e.Simulaci_n__c;
                m.checkValue      = e.Check__c;
                m.campaniaId      = e.Campa_a__c;
                m.campania        = (e.Campa_a__r != null) ? e.Campa_a__r.Name : '';
                out.add(m);
            }
        }

        out.sort();
        return out;
    }
}