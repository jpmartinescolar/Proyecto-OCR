public with sharing class PyGMensualController {

    // ---------------------------------------------------------------------
    //  WRAPPERS
    // ---------------------------------------------------------------------
    public class FilterOptions {
        @AuraEnabled public List<String> empresasTitulares;
        @AuraEnabled public List<String> areas;
        @AuraEnabled public List<Integer> ejercicios;
        @AuraEnabled public List<String> planesPGC;
    }

    public class PyGRow {
        @AuraEnabled public String key;                 // identificador único de fila
        @AuraEnabled public String tipo;                // 'SECCION' | 'CUENTA' | 'SUBTOTAL' | 'ACUMULADO'
        @AuraEnabled public Integer nivel;              // 0 = sección, 1 = cuenta
        @AuraEnabled public Id     cuentaId;            // sólo en CUENTA (para el hyperlink)
        @AuraEnabled public String codigoCuenta;        // sólo en CUENTA
        @AuraEnabled public String concepto;            // texto a mostrar
        @AuraEnabled public Decimal[] meses;            // 12 importes (enero -> diciembre)
        @AuraEnabled public Decimal total;              // suma anual
        @AuraEnabled public Decimal[] porcentajes;      // % s/CN por mes (sólo subtotales)
        @AuraEnabled public Decimal porcentajeTotal;    // % s/CN total (sólo subtotales)
        @AuraEnabled public Boolean esGasto;            // 6xx -> rojo, 7xx -> azul/normal
        @AuraEnabled public List<Id> cuentaIds;         // ids de Plan agregados en esta fila
        @AuraEnabled public Boolean acumulado;          // true para la fila final de saldo acumulado

        public PyGRow() {
            this.meses = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
            this.total = 0;
            this.porcentajes = null;
            this.porcentajeTotal = null;
            this.esGasto = false;
            this.cuentaIds = new List<Id>();
            this.acumulado = false;
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
        opt.ejercicios        = getEjerciciosConDatos();
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

    private static List<Integer> getEjerciciosConDatos() {
        Set<Integer> yrs = new Set<Integer>();
        for (AggregateResult ar : [
            SELECT CALENDAR_YEAR(Fecha_asiento__c) yr
            FROM Linea_asiento_contable__c
            WHERE Fecha_asiento__c != NULL
            GROUP BY CALENDAR_YEAR(Fecha_asiento__c)
        ]) {
            Object v = ar.get('yr');
            if (v != null) yrs.add(Integer.valueOf(v));
        }
        for (AggregateResult ar : [
            SELECT CALENDAR_YEAR(Fecha_apunte_extraordinario__c) yr
            FROM Apuntes_extraodinarios__c
            WHERE Fecha_apunte_extraordinario__c != NULL
            GROUP BY CALENDAR_YEAR(Fecha_apunte_extraordinario__c)
        ]) {
            Object v = ar.get('yr');
            if (v != null) yrs.add(Integer.valueOf(v));
        }
        List<Integer> out = new List<Integer>(yrs);
        out.sort();
        Integer current = Date.today().year();
        if (!out.contains(current)) {
            out.add(current);
            out.sort();
        }
        // descending order para que el más reciente quede primero en el combo
        List<Integer> ordered = new List<Integer>();
        for (Integer i = out.size() - 1; i >= 0; i--) ordered.add(out[i]);
        return ordered;
    }

    // ---------------------------------------------------------------------
    //  CORE GENERAR
    // ---------------------------------------------------------------------
    @AuraEnabled
    public static List<PyGRow> generar(
        List<String> empresasTitulares,
        String area,
        Id     directorFacturacionId,
        Integer ejercicio,
        String planPGC,           // 'PGC Normal' | 'PGC Abreviado' | 'PGC PYMES'
        String simulacion,        // 'Todas' | 'No' | 'Si' | 'Sí. Transferencia'
        String extraordinarios,   // 'Todas' | 'Si' | 'No'
        String check              // 'Todos' | 'Si' | 'No'
    ) {
        if (ejercicio == null) {
            throw new AuraHandledException('Debes seleccionar un ejercicio.');
        }
        if (empresasTitulares == null || empresasTitulares.isEmpty()) {
            throw new AuraHandledException('Debes seleccionar al menos una empresa titular.');
        }

        Date desde = Date.newInstance(ejercicio, 1, 1);
        Date hasta = Date.newInstance(ejercicio, 12, 31);

        // accId -> codigo + título de la cuenta del PGC (filtrada por 6xx/7xx)
        Map<Id, Plan_general_contable__c> cuentasPGC = new Map<Id, Plan_general_contable__c>(
            [SELECT Id, Name, T_tulo_cuenta__c
               FROM Plan_general_contable__c
              WHERE (Name LIKE '6%' OR Name LIKE '7%')]
        );
        Set<Id> idsCuentas = cuentasPGC.keySet();

        // saldosByCuentaMes[cuentaId][mes 0-11] = suma
        Map<Id, Decimal[]> saldosByCuentaMes = new Map<Id, Decimal[]>();

        // --- Apuntes contables ---
        // Importe = Haber - Debe  (positivo = ingreso/azul, negativo = gasto/rojo)
        Boolean incluirContables = (extraordinarios != 'Si');
        if (incluirContables) {
            String soql = 'SELECT Plan__c, Debe__c, Haber__c, Fecha_asiento__c '
                        + 'FROM Linea_asiento_contable__c '
                        + 'WHERE Plan__c IN :idsCuentas '
                        + 'AND Asientos_contable__r.Fecha_asiento_contable__c >= :desde '
                        + 'AND Asientos_contable__r.Fecha_asiento_contable__c <= :hasta '
                        + 'AND Empresa_titular__c IN :empresasTitulares '
                        // El asiento de regularización salda las 6/7: si se incluyera, el PyG saldría a cero
                        + 'AND Tipo_de_asiento__c != \'Asiento Reg. Cierre\' ';
            if (String.isNotBlank(area))                soql += 'AND rea__c = :area ';
            if (directorFacturacionId != null)          soql += 'AND Director_asignado_facturaci_n__c = :directorFacturacionId ';
            soql += simulacionClause(simulacion);
            soql += checkClause(check);

            for (Linea_asiento_contable__c l : Database.query(soql)) {
                Decimal d = l.Debe__c  == null ? 0 : l.Debe__c;
                Decimal h = l.Haber__c == null ? 0 : l.Haber__c;
                acumular(saldosByCuentaMes, l.Plan__c, l.Fecha_asiento__c, h - d);
            }
        }

        // --- Apuntes extraordinarios ---
        Boolean incluirExtra = (extraordinarios == 'Si' || extraordinarios == 'Todas');
        if (incluirExtra) {
            String soql = 'SELECT Plan_general_contable__c, Debe__c, Haber__c, Fecha_apunte_extraordinario__c '
                        + 'FROM Apuntes_extraodinarios__c '
                        + 'WHERE Plan_general_contable__c IN :idsCuentas '
                        + 'AND Fecha_apunte_extraordinario__c >= :desde '
                        + 'AND Fecha_apunte_extraordinario__c <= :hasta '
                        + 'AND Empresa_titular__c IN :empresasTitulares ';
            if (String.isNotBlank(area))                soql += 'AND rea__c = :area ';
            if (directorFacturacionId != null)          soql += 'AND Director_facturaci_n_asignado__c = :directorFacturacionId ';
            soql += simulacionClause(simulacion);
            soql += checkClause(check);

            for (Apuntes_extraodinarios__c e : Database.query(soql)) {
                Decimal d = e.Debe__c  == null ? 0 : e.Debe__c;
                Decimal h = e.Haber__c == null ? 0 : e.Haber__c;
                acumular(saldosByCuentaMes, e.Plan_general_contable__c, e.Fecha_apunte_extraordinario__c, h - d);
            }
        }

        // Generamos la estructura del PyG según el plan elegido
        return construirEstructura(planPGC, cuentasPGC, saldosByCuentaMes);
    }

    // Devuelve el fragmento SOQL para filtrar por Simulaci_n__c según la opción del UI.
    // Picklist real: 'No' | 'Si' | 'Sí. Transferencia'
    // UI:  'Todas' | 'No' | 'Si' (= Sí. IVA) | 'Sí. Transferencia'
    /** Filtro por el campo Check (Sí / No / Todos). */
    private static String checkClause(String check) {
        if (check == 'Si') return 'AND Check__c = \'Si\' ';
        if (check == 'No') return 'AND (Check__c = \'No\' OR Check__c = null) ';
        return '';
    }

    /** Filtro por el campo Incidencia (Sí / No / Todos). Solo aplica a apuntes contables. */
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

    private static void acumular(Map<Id, Decimal[]> store, Id cuentaId, Date fecha, Decimal saldo) {
        if (cuentaId == null || fecha == null || saldo == null) return;
        Decimal[] arr = store.get(cuentaId);
        if (arr == null) {
            arr = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
            store.put(cuentaId, arr);
        }
        Integer m = fecha.month() - 1;
        arr[m] = (arr[m] == null ? 0 : arr[m]) + saldo;
    }

    // ---------------------------------------------------------------------
    //  CONSTRUCCIÓN DE LA ESTRUCTURA
    // ---------------------------------------------------------------------
    private static List<PyGRow> construirEstructura(
        String planPGC,
        Map<Id, Plan_general_contable__c> cuentasPGC,
        Map<Id, Decimal[]> saldosByCuentaMes
    ) {
        // Definimos los epígrafes en orden, con prefijos de cuenta que aplican
        // En PyG el signo de presentación es:  display = -saldo
        //   -> 6xx (gasto)  saldo positivo  ->  negativo (rojo)
        //   -> 7xx (ingreso) saldo negativo ->  positivo (azul)
        List<PyGStructure.PyGSection> secciones = PyGStructure.estructura(planPGC);

        // Bucketing: para cada cuenta encontrada, asignamos a la primera sección cuyo
        // patrón de prefijos haga match. Cuentas sin match quedan fuera (no son P&G).
        Map<String, List<CuentaConSaldos>> seccionToCuentas = new Map<String, List<CuentaConSaldos>>();
        for (PyGStructure.PyGSection s : secciones) seccionToCuentas.put(s.key, new List<CuentaConSaldos>());

        for (Id cuentaId : saldosByCuentaMes.keySet()) {
            Plan_general_contable__c p = cuentasPGC.get(cuentaId);
            if (p == null) continue;
            String codigo = p.Name;
            String secKey = PyGStructure.matchSeccion(codigo, secciones);
            if (secKey == null) continue;
            CuentaConSaldos cs = new CuentaConSaldos();
            cs.cuentaId = cuentaId;
            cs.codigo = codigo;
            cs.titulo = (p.T_tulo_cuenta__c == null) ? '' : p.T_tulo_cuenta__c;
            cs.saldosMes = saldosByCuentaMes.get(cuentaId);
            seccionToCuentas.get(secKey).add(cs);
        }

        // Orden alfabético por código de cuenta dentro de cada sección
        for (String k : seccionToCuentas.keySet()) {
            seccionToCuentas.get(k).sort();
        }

        // Construcción de filas + cálculo de subtotales (A.1, A.2, A.3, A.4)
        List<PyGRow> rows = new List<PyGRow>();

        // Importe neto cifra negocio (para % s/CN)
        Decimal[] CN = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
        // Acumuladores de los subtotales
        Decimal[] explotacion = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
        Decimal[] financiero  = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
        Decimal[] impuesto    = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};

        // Acumuladores de cuentaIds por bucket (para drill-down en subtotales)
        List<Id> idsExpl = new List<Id>();
        List<Id> idsFin  = new List<Id>();
        List<Id> idsImp  = new List<Id>();

        for (PyGStructure.PyGSection sec : secciones) {
            if (sec.esSubtotal) {
                // Emitimos un subtotal acumulado
                PyGRow r = new PyGRow();
                r.key = sec.key;
                r.tipo = 'SUBTOTAL';
                r.nivel = 0;
                r.concepto = sec.label;
                Decimal[] base = null;
                if (sec.key == 'A1')      { base = explotacion; r.cuentaIds = new List<Id>(idsExpl); }
                else if (sec.key == 'A2') { base = financiero;  r.cuentaIds = new List<Id>(idsFin); }
                else if (sec.key == 'A3') {
                    base = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
                    for (Integer i = 0; i < 12; i++) base[i] = explotacion[i] + financiero[i];
                    r.cuentaIds = new List<Id>();
                    r.cuentaIds.addAll(idsExpl);
                    r.cuentaIds.addAll(idsFin);
                } else if (sec.key == 'A4') {
                    base = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
                    // Saldos con signo (Haber−Debe): el impuesto se SUMA (gasto negativo resta)
                    for (Integer i = 0; i < 12; i++) base[i] = explotacion[i] + financiero[i] + impuesto[i];
                    r.cuentaIds = new List<Id>();
                    r.cuentaIds.addAll(idsExpl);
                    r.cuentaIds.addAll(idsFin);
                    r.cuentaIds.addAll(idsImp);
                }
                r.meses = base;
                Decimal sum = 0;
                for (Decimal v : base) sum += v;
                r.total = sum;
                // % s/CN en subtotal
                Decimal[] pct = new Decimal[]{null,null,null,null,null,null,null,null,null,null,null,null};
                for (Integer i = 0; i < 12; i++) {
                    if (CN[i] != 0) pct[i] = (base[i] / CN[i]) * 100;
                }
                Decimal sumCN = 0;
                for (Decimal v : CN) sumCN += v;
                if (sumCN != 0) r.porcentajeTotal = (sum / sumCN) * 100;
                r.porcentajes = pct;
                rows.add(r);
                continue;
            }

            // Sección normal: cabecera + cuentas
            PyGRow header = new PyGRow();
            header.key = sec.key;
            header.tipo = 'SECCION';
            header.nivel = 0;
            header.concepto = sec.label;
            header.esGasto = sec.signo == -1;

            List<CuentaConSaldos> cuentas = seccionToCuentas.get(sec.key);

            // Totales del epígrafe (los importes ya vienen como Haber-Debe)
            Decimal[] totalSec = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
            for (CuentaConSaldos cs : cuentas) {
                for (Integer i = 0; i < 12; i++) {
                    Decimal v = (cs.saldosMes[i] == null) ? 0 : cs.saldosMes[i];
                    totalSec[i] += v;
                }
            }
            Decimal tSum = 0;
            for (Decimal v : totalSec) tSum += v;
            header.meses = totalSec;
            header.total = tSum;
            rows.add(header);

            // IDs de las cuentas de esta sección (para drill-down)
            List<Id> idsSec = new List<Id>();
            for (CuentaConSaldos cs : cuentas) idsSec.add(cs.cuentaId);
            header.cuentaIds = idsSec;

            // Si la sección agrega a un subtotal, lo apuntamos
            if (sec.bucket == 'EXPL') {
                for (Integer i=0;i<12;i++) explotacion[i] += totalSec[i];
                idsExpl.addAll(idsSec);
            } else if (sec.bucket == 'FIN') {
                for (Integer i=0;i<12;i++) financiero[i]  += totalSec[i];
                idsFin.addAll(idsSec);
            } else if (sec.bucket == 'IMP') {
                for (Integer i=0;i<12;i++) impuesto[i]    += totalSec[i];
                idsImp.addAll(idsSec);
            }

            // Si es la cifra de negocios, la guardamos como base para % s/CN
            if (sec.esCN) {
                for (Integer i = 0; i < 12; i++) CN[i] += totalSec[i];
            }

            // Filas de cuenta (los importes ya vienen como Haber-Debe)
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
                Decimal cTot = 0;
                Decimal[] disp = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
                for (Integer i = 0; i < 12; i++) {
                    Decimal v = (cs.saldosMes[i] == null) ? 0 : cs.saldosMes[i];
                    disp[i] = v;
                    cTot += disp[i];
                }
                cr.meses = disp;
                cr.total = cTot;
                rows.add(cr);
            }
        }

        // -------------------------------------------------------------
        //  Fila final: SALDO ACUMULADO del ejercicio (running total de A.4)
        // -------------------------------------------------------------
        PyGRow acum = new PyGRow();
        acum.key = 'ACUM';
        acum.tipo = 'ACUMULADO';
        acum.nivel = 0;
        acum.concepto = 'Saldo acumulado del ejercicio';
        acum.acumulado = true;
        Decimal[] acumMeses = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
        Decimal running = 0;
        for (Integer i = 0; i < 12; i++) {
            Decimal a4Mes = explotacion[i] + financiero[i] + impuesto[i];
            running += a4Mes;
            acumMeses[i] = running;
        }
        acum.meses = acumMeses;
        acum.total = running;
        // cuentaIds: todas las cuentas de los buckets EXPL + FIN + IMP
        List<Id> idsAcum = new List<Id>();
        idsAcum.addAll(idsExpl);
        idsAcum.addAll(idsFin);
        idsAcum.addAll(idsImp);
        acum.cuentaIds = idsAcum;
        rows.add(acum);

        return rows;
    }

    // ---------------------------------------------------------------------
    //  Helper class for sorting accounts by codigo
    // ---------------------------------------------------------------------
    public class CuentaConSaldos implements Comparable {
        public Id cuentaId;
        public String codigo;
        public String titulo;
        public Decimal[] saldosMes;
        public Integer compareTo(Object other) {
            CuentaConSaldos o = (CuentaConSaldos) other;
            if (this.codigo == o.codigo) return 0;
            return (this.codigo < o.codigo) ? -1 : 1;
        }
    }

    // =====================================================================
    //   GET MOVIMIENTOS  (modal al pinchar un importe)
    // =====================================================================
    @AuraEnabled
    public static List<Movimiento> getMovimientos(
        List<Id> cuentaIds,
        Integer ejercicio,
        Integer mes,                  // 1..12 o null para todo el año (mes hasta)
        Integer mesInicio,            // 1..12 o null -> defecto = mes (un único mes)
        List<String> empresasTitulares,
        String area,
        Id     directorFacturacionId,
        String simulacion,
        String extraordinarios,
        String check,
        String incidencia
    ) {
        List<Movimiento> out = new List<Movimiento>();
        if (cuentaIds == null || cuentaIds.isEmpty() || ejercicio == null) return out;
        if (empresasTitulares == null || empresasTitulares.isEmpty()) return out;

        Date desde;
        Date hasta;
        if (mes != null && mes >= 1 && mes <= 12) {
            Integer mIni = (mesInicio != null && mesInicio >= 1 && mesInicio <= mes) ? mesInicio : mes;
            desde = Date.newInstance(ejercicio, mIni, 1);
            Integer lastDay = Date.daysInMonth(ejercicio, mes);
            hasta = Date.newInstance(ejercicio, mes, lastDay);
        } else {
            desde = Date.newInstance(ejercicio, 1, 1);
            hasta = Date.newInstance(ejercicio, 12, 31);
        }

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
                        + 'AND Empresa_titular__c IN :empresasTitulares '
                        + 'AND Tipo_de_asiento__c != \'Asiento Reg. Cierre\' ';
            if (String.isNotBlank(area))                soql += 'AND rea__c = :area ';
            if (directorFacturacionId != null)          soql += 'AND Director_asignado_facturaci_n__c = :directorFacturacionId ';
            soql += simulacionClause(simulacion);
            soql += checkClause(check);
            soql += incidenciaClause(incidencia);
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
                    ? l.Director_asignado_facturaci_n__r.Name
                    : '';
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

        // --- Apuntes extraordinarios (sin campo Incidencia: excluidos si se filtra por 'Si') ---
        Boolean incluirExtra = (extraordinarios == 'Si' || extraordinarios == 'Todas') && incidencia != 'Si';
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
            if (String.isNotBlank(area))                soql += 'AND rea__c = :area ';
            if (directorFacturacionId != null)          soql += 'AND Director_facturaci_n_asignado__c = :directorFacturacionId ';
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
                    ? e.Director_facturaci_n_asignado__r.Name
                    : '';
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

    // ---------------------------------------------------------------------
    //  UPDATE inline desde el modal de detalle
    // ---------------------------------------------------------------------
    @AuraEnabled
    public static String updateMovimiento(
        Id      recordId,
        Boolean esExtraordinario,
        String  area,
        Id      directorFacturacionId,
        String  simulacion,
        String  checkValue,
        Id      campaniaId
    ) {
        if (recordId == null) throw new AuraHandledException('Falta el recordId del apunte.');
        try {
            if (esExtraordinario == true) {
                Apuntes_extraodinarios__c e = new Apuntes_extraodinarios__c(Id = recordId);
                e.rea__c = String.isBlank(area) ? null : area;
                e.Director_facturaci_n_asignado__c = directorFacturacionId;
                e.Simulaci_n__c = String.isBlank(simulacion) ? null : simulacion;
                e.Check__c = String.isBlank(checkValue) ? null : checkValue;
                e.Campa_a__c = campaniaId;
                update e;
            } else {
                Linea_asiento_contable__c l = new Linea_asiento_contable__c(Id = recordId);
                l.rea__c = String.isBlank(area) ? null : area;
                l.Director_asignado_facturaci_n__c = directorFacturacionId;
                l.Simulaci_n__c = String.isBlank(simulacion) ? null : simulacion;
                l.Check__c = String.isBlank(checkValue) ? null : checkValue;
                l.Campa_a__c = campaniaId;
                update l;
            }
            return 'OK';
        } catch (DmlException ex) {
            throw new AuraHandledException('Error al guardar: ' + ex.getDmlMessage(0));
        }
    }
}