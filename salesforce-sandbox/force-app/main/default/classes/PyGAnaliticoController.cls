public with sharing class PyGAnaliticoController {

    // ---------------------------------------------------------------------
    //  WRAPPERS
    // ---------------------------------------------------------------------
    public class FilterOptions {
        @AuraEnabled public List<String> empresasTitulares;
        @AuraEnabled public List<String> areas;
        @AuraEnabled public List<Integer> ejercicios;
    }

    public class PyGRow {
        @AuraEnabled public String key                  { get; set; }
        @AuraEnabled public String tipo                 { get; set; }
        @AuraEnabled public Integer nivel               { get; set; }
        @AuraEnabled public Id     cuentaId             { get; set; }
        @AuraEnabled public String codigoCuenta         { get; set; }
        @AuraEnabled public String concepto             { get; set; }
        @AuraEnabled public Decimal[] meses             { get; set; }
        @AuraEnabled public Decimal total               { get; set; }
        @AuraEnabled public Boolean esGasto             { get; set; }
        @AuraEnabled public List<Id> cuentaIds          { get; set; }
        @AuraEnabled public Boolean acumulado           { get; set; }
        @AuraEnabled public Decimal[] porcentajes       { get; set; }   // % s/ingresos 7xx por mes (sólo MBO/MNO/MBN)
        @AuraEnabled public Decimal porcentajeTotal     { get; set; }   // % s/ingresos 7xx total
        @AuraEnabled public Boolean mostrarPorcentaje   { get; set; }
        @AuraEnabled public Decimal[] meses7            { get; set; }   // contribución 7xx por mes (sólo MBO/MNO/MBN, para recalc % al filtrar)

        public PyGRow() {
            this.meses = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
            this.total = 0;
            this.esGasto = false;
            this.cuentaIds = new List<Id>();
            this.acumulado = false;
            this.porcentajes = null;
            this.porcentajeTotal = null;
            this.mostrarPorcentaje = false;
        }
    }

    /** Definición de una entrada del layout fijo. */
    private class LayoutEntry {
        public String type;
        public String label;
        public Set<String> apartados;
        public Set<Integer> includePrefixes;
        public Set<Integer> excludePrefixes;
        public Boolean mostrarPorcentaje = false;            // SUBTOTAL: muestra % sobre ingresos acumulados
        public Set<String> denominadorPrefixesSubtotal;      // SUBTOTAL: prefijos del denominador (null -> cualquier 7xx)
        public Boolean mostrarPorcentajeGrupo = false;       // GROUP/SUBGRUPO: % s/ingresos del propio grupo
        public String  denominadorPrefijo;                   // GROUP: prefijo p.ej. '705'
        public Boolean subagrupar        = false;
        public String  personalSubgrupoLabel;                // GROUP: si != null, agrupa cuentas 640-642 en un subapartado con esta etiqueta
        public Boolean personalSubgrupoPct = false;          // GROUP: el subapartado de personal muestra % sobre ventas 7xx del grupo
    }

    // ---------------------------------------------------------------------
    //  FILTER OPTIONS
    // ---------------------------------------------------------------------
    @AuraEnabled(cacheable=true)
    public static FilterOptions getFilterOptions() {
        FilterOptions opt = new FilterOptions();
        opt.empresasTitulares = getPicklistValues('Linea_asiento_contable__c', 'Empresa_titular__c');
        opt.areas             = getPicklistValues('Linea_asiento_contable__c', 'rea__c');
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
        if (!out.contains(current)) { out.add(current); out.sort(); }
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
        String simulacion,
        String extraordinarios,
        String check,
        String incidencia
    ) {
        if (ejercicio == null) {
            throw new AuraHandledException('Debes seleccionar un ejercicio.');
        }
        if (empresasTitulares == null || empresasTitulares.isEmpty()) {
            throw new AuraHandledException('Debes seleccionar al menos una empresa titular.');
        }

        // Cuentas PGC 6xx/7xx con su apartado/subapartado/título
        Map<Id, Plan_general_contable__c> cuentasPGC = new Map<Id, Plan_general_contable__c>(
            [SELECT Id, Name, T_tulo_cuenta__c, Apartados__c, Categor_a_Anal_tica_PyG__c
               FROM Plan_general_contable__c
              WHERE (Name LIKE '6%' OR Name LIKE '7%')]
        );
        Map<Id, Decimal[]> saldos = calcularSaldos(
            cuentasPGC.keySet(), empresasTitulares, area, directorFacturacionId,
            ejercicio, simulacion, extraordinarios, check, incidencia);

        return construirEstructura(cuentasPGC, saldos);
    }

    /** Saldos (Haber-Debe) por cuenta y mes, para un ejercicio concreto. */
    private static Map<Id, Decimal[]> calcularSaldos(
        Set<Id> idsCuentas, List<String> empresasTitulares, String area, Id directorFacturacionId,
        Integer ejercicio, String simulacion, String extraordinarios, String check, String incidencia
    ) {
        Date desde = Date.newInstance(ejercicio, 1, 1);
        Date hasta = Date.newInstance(ejercicio, 12, 31);
        Map<Id, Decimal[]> saldos = new Map<Id, Decimal[]>();

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
            if (String.isNotBlank(area))             soql += 'AND rea__c = :area ';
            if (directorFacturacionId != null)       soql += 'AND Director_asignado_facturaci_n__c = :directorFacturacionId ';
            soql += simulacionClause(simulacion);
            soql += checkClause(check);
            soql += incidenciaClause(incidencia);

            for (Linea_asiento_contable__c l : Database.query(soql)) {
                Decimal d = l.Debe__c  == null ? 0 : l.Debe__c;
                Decimal h = l.Haber__c == null ? 0 : l.Haber__c;
                acumular(saldos, l.Plan__c, l.Fecha_asiento__c, h - d);
            }
        }

        // Los apuntes extraordinarios no tienen campo Incidencia: si se filtra por 'Si' se excluyen.
        Boolean incluirExtra = (extraordinarios == 'Si' || extraordinarios == 'Todas') && incidencia != 'Si';
        if (incluirExtra) {
            String soql = 'SELECT Plan_general_contable__c, Debe__c, Haber__c, Fecha_apunte_extraordinario__c '
                        + 'FROM Apuntes_extraodinarios__c '
                        + 'WHERE Plan_general_contable__c IN :idsCuentas '
                        + 'AND Fecha_apunte_extraordinario__c >= :desde '
                        + 'AND Fecha_apunte_extraordinario__c <= :hasta '
                        + 'AND Empresa_titular__c IN :empresasTitulares ';
            if (String.isNotBlank(area))             soql += 'AND rea__c = :area ';
            if (directorFacturacionId != null)       soql += 'AND Director_facturaci_n_asignado__c = :directorFacturacionId ';
            soql += simulacionClause(simulacion);
            soql += checkClause(check);

            for (Apuntes_extraodinarios__c e : Database.query(soql)) {
                Decimal d = e.Debe__c  == null ? 0 : e.Debe__c;
                Decimal h = e.Haber__c == null ? 0 : e.Haber__c;
                acumular(saldos, e.Plan_general_contable__c, e.Fecha_apunte_extraordinario__c, h - d);
            }
        }
        return saldos;
    }

    // ---------------------------------------------------------------------
    //  COMPARATIVO "Margen bruto Operaciones": ejercicio actual vs anterior
    // ---------------------------------------------------------------------
    public class MBOComparativo {
        @AuraEnabled public Integer ejercicioActual;
        @AuraEnabled public Integer ejercicioAnterior;
        @AuraEnabled public Decimal[] mesesActual;
        @AuraEnabled public Decimal[] pctActual;
        @AuraEnabled public Decimal[] mesesAnterior;
        @AuraEnabled public Decimal[] pctAnterior;
    }

    @AuraEnabled
    public static MBOComparativo getComparativoMargenBruto(
        List<String> empresasTitulares, String area, Id directorFacturacionId,
        Integer ejercicio, String simulacion, String extraordinarios, String check, String incidencia
    ) {
        if (ejercicio == null) throw new AuraHandledException('Debes seleccionar un ejercicio.');
        if (empresasTitulares == null || empresasTitulares.isEmpty()) {
            throw new AuraHandledException('Debes seleccionar al menos una empresa titular.');
        }
        Map<Id, Plan_general_contable__c> cuentasPGC = new Map<Id, Plan_general_contable__c>(
            [SELECT Id, Name, T_tulo_cuenta__c, Apartados__c, Categor_a_Anal_tica_PyG__c
               FROM Plan_general_contable__c
              WHERE (Name LIKE '6%' OR Name LIKE '7%')]
        );
        Set<Id> ids = cuentasPGC.keySet();

        PyGRow rowAct = margenBrutoRow(cuentasPGC, ids, empresasTitulares, area, directorFacturacionId, ejercicio, simulacion, extraordinarios, check, incidencia);
        PyGRow rowAnt = margenBrutoRow(cuentasPGC, ids, empresasTitulares, area, directorFacturacionId, ejercicio - 1, simulacion, extraordinarios, check, incidencia);

        MBOComparativo r = new MBOComparativo();
        r.ejercicioActual   = ejercicio;
        r.ejercicioAnterior = ejercicio - 1;
        r.mesesActual   = (rowAct != null && rowAct.meses != null) ? rowAct.meses : ceros();
        r.pctActual     = (rowAct != null && rowAct.porcentajes != null) ? rowAct.porcentajes : nulos();
        r.mesesAnterior = (rowAnt != null && rowAnt.meses != null) ? rowAnt.meses : ceros();
        r.pctAnterior   = (rowAnt != null && rowAnt.porcentajes != null) ? rowAnt.porcentajes : nulos();
        return r;
    }

    private static PyGRow margenBrutoRow(
        Map<Id, Plan_general_contable__c> cuentasPGC, Set<Id> ids,
        List<String> empresasTitulares, String area, Id directorFacturacionId,
        Integer ejercicio, String simulacion, String extraordinarios, String check, String incidencia
    ) {
        Map<Id, Decimal[]> saldos = calcularSaldos(ids, empresasTitulares, area, directorFacturacionId, ejercicio, simulacion, extraordinarios, check, incidencia);
        for (PyGRow r : construirEstructura(cuentasPGC, saldos)) {
            if (r.key == 'ST_Margen bruto Operaciones') return r;
        }
        return null;
    }

    private static Decimal[] ceros() { return new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0}; }
    private static Decimal[] nulos() { return new Decimal[]{null,null,null,null,null,null,null,null,null,null,null,null}; }

    // ---------------------------------------------------------------------
    //  COMPARATIVO OPERACIONES por DIRECTOR y por ÁREA (mes a mes, 2 años)
    //  Importe = margen de Operaciones servicios + Operaciones distribución
    //  (cuentas del apartado '01. Operaciones', subapartado 1..10)
    // ---------------------------------------------------------------------
    public class Celda {
        @AuraEnabled public String director;
        @AuraEnabled public Id directorId;
        @AuraEnabled public String area;
        @AuraEnabled public Decimal[] mesesActual;     // margen (7xx + 6xx) de operaciones
        @AuraEnabled public Decimal[] mesesAnterior;
        @AuraEnabled public Decimal[] ingActual;       // solo ingresos (7xx) de operaciones
        @AuraEnabled public Decimal[] ingAnterior;
    }
    public class OperacionesComparativo {
        @AuraEnabled public Integer ejercicioActual;
        @AuraEnabled public Integer ejercicioAnterior;
        @AuraEnabled public List<Celda> celdas;   // matriz (director × área) con meses por año
    }

    @AuraEnabled
    public static OperacionesComparativo getComparativoOperaciones(
        List<String> empresasTitulares, String area, Id directorFacturacionId,
        Integer ejercicio, String simulacion, String extraordinarios, String check, String incidencia
    ) {
        if (ejercicio == null) throw new AuraHandledException('Debes seleccionar un ejercicio.');
        if (empresasTitulares == null || empresasTitulares.isEmpty()) {
            throw new AuraHandledException('Debes seleccionar al menos una empresa titular.');
        }

        // Cuentas de Operaciones (apartado 01, subapartado 1..10).
        // ingIds = subconjunto de cuentas de ingreso (Name 7xx) para calcular el % s/ingresos.
        Set<Id> opIds = new Set<Id>();
        Set<Id> ingIds = new Set<Id>();
        for (Plan_general_contable__c p : [
            SELECT Id, Name, Categor_a_Anal_tica_PyG__c FROM Plan_general_contable__c
            WHERE Apartados__c = '01. Operaciones'
        ]) {
            Integer pref = prefijoSubapartado(p.Categor_a_Anal_tica_PyG__c);
            if (pref != null && pref >= 1 && pref <= 10) {
                opIds.add(p.Id);
                if (p.Name != null && p.Name.startsWith('7')) ingIds.add(p.Id);
            }
        }

        OperacionesComparativo r = new OperacionesComparativo();
        r.ejercicioActual = ejercicio;
        r.ejercicioAnterior = ejercicio - 1;
        r.celdas = new List<Celda>();
        if (opIds.isEmpty()) return r;

        Date ini = Date.newInstance(ejercicio - 1, 1, 1);
        Date fin = Date.newInstance(ejercicio, 12, 31);

        Map<String, Celda> celdas = new Map<String, Celda>();

        Boolean incluirContables = (extraordinarios != 'Si');
        // Los apuntes extraordinarios no tienen campo Incidencia: si se filtra por 'Si' se excluyen.
        Boolean incluirExtra = (extraordinarios == 'Si' || extraordinarios == 'Todas') && incidencia != 'Si';

        if (incluirContables) {
            // Filtrar/agrupar por la fecha NATIVA del asiento (indexable y selectiva).
            // El campo fórmula Fecha_asiento__c es cross-object: no es selectivo y hace
            // que la consulta escanee de más, superando el límite de 50.000 con varias empresas.
            String comun = 'AND Empresa_titular__c IN :empresasTitulares '
                  + 'AND Asientos_contable__r.Fecha_asiento_contable__c >= :ini '
                  + 'AND Asientos_contable__r.Fecha_asiento_contable__c <= :fin '
                  + 'AND Tipo_de_asiento__c != \'Asiento Reg. Cierre\' ';
            if (String.isNotBlank(area))       comun += 'AND rea__c = :area ';
            if (directorFacturacionId != null) comun += 'AND Director_asignado_facturaci_n__c = :directorFacturacionId ';
            comun += simulacionClause(simulacion) + checkClause(check) + incidenciaClause(incidencia);
            String sel = 'SELECT Plan__c acc, Director_asignado_facturaci_n__c dirId, Director_asignado_facturaci_n__r.Name dir, rea__c ar, '
                       + 'CALENDAR_YEAR(Asientos_contable__r.Fecha_asiento_contable__c) yr, CALENDAR_MONTH(Asientos_contable__r.Fecha_asiento_contable__c) mo, SUM(Debe__c) d, SUM(Haber__c) h '
                       + 'FROM Linea_asiento_contable__c ';
            String grp = 'GROUP BY Plan__c, Director_asignado_facturaci_n__c, Director_asignado_facturaci_n__r.Name, rea__c, CALENDAR_YEAR(Asientos_contable__r.Fecha_asiento_contable__c), CALENDAR_MONTH(Asientos_contable__r.Fecha_asiento_contable__c)';
            // UNA sola pasada: el margen usa todas las cuentas de operaciones; los ingresos (7xx)
            // se separan en memoria con ingIds, evitando re-escanear y duplicar la lectura.
            procesarCeldasCombinado(Database.query(sel + 'WHERE Plan__c IN :opIds ' + comun + grp), celdas, ejercicio, ingIds);
        }

        if (incluirExtra) {
            String comunX = 'AND Empresa_titular__c IN :empresasTitulares '
                          + 'AND Fecha_apunte_extraordinario__c >= :ini AND Fecha_apunte_extraordinario__c <= :fin ';
            if (String.isNotBlank(area))       comunX += 'AND rea__c = :area ';
            if (directorFacturacionId != null) comunX += 'AND Director_facturaci_n_asignado__c = :directorFacturacionId ';
            comunX += simulacionClause(simulacion) + checkClause(check);
            String selX = 'SELECT Plan_general_contable__c acc, Director_facturaci_n_asignado__c dirId, Director_facturaci_n_asignado__r.Name dir, rea__c ar, '
                        + 'CALENDAR_YEAR(Fecha_apunte_extraordinario__c) yr, CALENDAR_MONTH(Fecha_apunte_extraordinario__c) mo, SUM(Debe__c) d, SUM(Haber__c) h '
                        + 'FROM Apuntes_extraodinarios__c ';
            String grpX = 'GROUP BY Plan_general_contable__c, Director_facturaci_n_asignado__c, Director_facturaci_n_asignado__r.Name, rea__c, CALENDAR_YEAR(Fecha_apunte_extraordinario__c), CALENDAR_MONTH(Fecha_apunte_extraordinario__c)';
            procesarCeldasCombinado(Database.query(selX + 'WHERE Plan_general_contable__c IN :opIds ' + comunX + grpX), celdas, ejercicio, ingIds);
        }

        r.celdas = celdas.values();
        return r;
    }

    /**
     * Una sola pasada: cada grupo aporta al MARGEN (todas las cuentas de operaciones) y,
     * si la cuenta es de ingresos (está en ingIds, 7xx), también a los INGRESOS.
     * Evita la segunda consulta que re-escaneaba las cuentas 7xx.
     */
    private static void procesarCeldasCombinado(List<AggregateResult> ars, Map<String, Celda> celdas, Integer ejercicio, Set<Id> ingIds) {
        for (AggregateResult ar : ars) {
            Object yo = ar.get('yr'); Object moo = ar.get('mo');
            if (yo == null || moo == null) continue;
            Integer yr = Integer.valueOf(yo);
            Integer mo = Integer.valueOf(moo);
            Decimal d = (ar.get('d') == null) ? 0 : (Decimal) ar.get('d');
            Decimal h = (ar.get('h') == null) ? 0 : (Decimal) ar.get('h');
            Decimal v = h - d;
            String dir = (String) ar.get('dir'); if (String.isBlank(dir)) dir = 'Sin director';
            Id dirId = (Id) ar.get('dirId');
            String are = (String) ar.get('ar');  if (String.isBlank(are)) are = 'Sin área';
            Id acc = (Id) ar.get('acc');
            String key = (dirId == null ? 'NULL' : dirId) + '||' + are;
            Celda c = celdas.get(key);
            if (c == null) {
                c = new Celda();
                c.director = dir; c.directorId = dirId; c.area = are;
                c.mesesActual = ceros(); c.mesesAnterior = ceros();
                c.ingActual = ceros(); c.ingAnterior = ceros();
                celdas.put(key, c);
            }
            // Margen: todas las cuentas de operaciones
            Decimal[] mArr = (yr == ejercicio) ? c.mesesActual : ((yr == ejercicio - 1) ? c.mesesAnterior : null);
            if (mArr != null) mArr[mo - 1] = (mArr[mo - 1] == null ? 0 : mArr[mo - 1]) + v;
            // Ingresos: solo cuentas 7xx (las de ingIds)
            if (acc != null && ingIds != null && ingIds.contains(acc)) {
                Decimal[] iArr = (yr == ejercicio) ? c.ingActual : ((yr == ejercicio - 1) ? c.ingAnterior : null);
                if (iArr != null) iArr[mo - 1] = (iArr[mo - 1] == null ? 0 : iArr[mo - 1]) + v;
            }
        }
    }


    private static String simulacionClause(String simulacion) {
        if (simulacion == 'No') return 'AND (Simulaci_n__c = \'No\' OR Simulaci_n__c = null) ';
        if (simulacion == 'Si') return 'AND Simulaci_n__c = \'Si\' ';
        if (simulacion == 'Sí. Transferencia') return 'AND Simulaci_n__c = \'Sí. Transferencia\' ';
        return '';
    }

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

    private static void acumular(Map<Id, Decimal[]> store, Id cuentaId, Date fecha, Decimal valor) {
        if (cuentaId == null || fecha == null || valor == null) return;
        Decimal[] arr = store.get(cuentaId);
        if (arr == null) {
            arr = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
            store.put(cuentaId, arr);
        }
        Integer m = fecha.month() - 1;
        arr[m] = (arr[m] == null ? 0 : arr[m]) + valor;
    }

    // ---------------------------------------------------------------------
    //  LAYOUT FIJO (hardcoded según especificación del cliente)
    // ---------------------------------------------------------------------
    private static List<LayoutEntry> getLayout() {
        List<LayoutEntry> L = new List<LayoutEntry>();

        // 1) Operaciones servicios  (% sobre cuentas 7xx del propio grupo)
        LayoutEntry g1 = new LayoutEntry();
        g1.type = 'GROUP'; g1.label = 'Operaciones servicios';
        g1.apartados = new Set<String>{'01. Operaciones'};
        g1.includePrefixes = new Set<Integer>{1,2,3,4,5};
        g1.mostrarPorcentajeGrupo = true;
        g1.personalSubgrupoLabel = 'Gastos de personal fijo';   // subapartado (cuentas 640-642) con % sobre ventas
        g1.personalSubgrupoPct = true;
        // denominadorPrefijo null = cualquier cuenta 7xx
        L.add(g1);

        // 2) Operaciones distribución (con sub-agrupación + % sobre cuentas 705x del grupo/subgrupo)
        LayoutEntry g2 = new LayoutEntry();
        g2.type = 'GROUP'; g2.label = 'Operaciones distribución';
        g2.apartados = new Set<String>{'01. Operaciones'};
        g2.includePrefixes = new Set<Integer>{6,7,8,9,10};
        g2.subagrupar = true;
        g2.mostrarPorcentajeGrupo = true;
        g2.denominadorPrefijo = '705';
        L.add(g2);

        LayoutEntry s1 = new LayoutEntry();
        s1.type = 'SUBTOTAL'; s1.label = 'Margen bruto Operaciones';
        s1.mostrarPorcentaje = true;
        L.add(s1);

        // 3) Retribución variable (Bonus operativo)
        LayoutEntry g3 = new LayoutEntry();
        g3.type = 'GROUP'; g3.label = 'Retribución variable';
        g3.apartados = new Set<String>{'06. Retribución variable'};
        L.add(g3);

        LayoutEntry s2 = new LayoutEntry();
        s2.type = 'SUBTOTAL'; s2.label = 'Margen neto Operaciones';
        s2.mostrarPorcentaje = true;
        L.add(s2);

        // 4) Informática
        LayoutEntry g4 = new LayoutEntry();
        g4.type = 'GROUP'; g4.label = 'Informática';
        g4.apartados = new Set<String>{'04. Informática'};
        L.add(g4);

        LayoutEntry s3 = new LayoutEntry();
        s3.type = 'SUBTOTAL'; s3.label = 'Margen bruto negocio';
        s3.mostrarPorcentaje = true;
        L.add(s3);

        // 5) Alquileres
        LayoutEntry g5 = new LayoutEntry();
        g5.type = 'GROUP'; g5.label = 'Alquileres e instalaciones';
        g5.apartados = new Set<String>{'02. Alquileres e Instalaciones'};
        L.add(g5);

        // 6) Administración
        LayoutEntry g6 = new LayoutEntry();
        g6.type = 'GROUP'; g6.label = 'Administración';
        g6.apartados = new Set<String>{'02. Administración'};
        g6.personalSubgrupoLabel = 'Gastos de personal';   // subapartado (cuentas 640-642), solo suma
        L.add(g6);

        // 7) RRHH
        LayoutEntry g7 = new LayoutEntry();
        g7.type = 'GROUP'; g7.label = 'Recursos Humanos';
        g7.apartados = new Set<String>{'03. Recursos Humanos'};
        g7.personalSubgrupoLabel = 'Gastos de personal';   // subapartado (cuentas 640-642), solo suma
        L.add(g7);

        // 8) Corporate (asunción — confirmar)
        LayoutEntry g8 = new LayoutEntry();
        g8.type = 'GROUP'; g8.label = 'Corporate';
        g8.apartados = new Set<String>{'06. Corporate'};
        L.add(g8);

        // 9) Marketing
        LayoutEntry g9 = new LayoutEntry();
        g9.type = 'GROUP'; g9.label = 'Marketing';
        g9.apartados = new Set<String>{'05. Marketing'};
        L.add(g9);

        LayoutEntry s4 = new LayoutEntry();
        s4.type = 'SUBTOTAL'; s4.label = 'Ebitda';
        s4.mostrarPorcentaje = true;
        s4.denominadorPrefixesSubtotal = new Set<String>{'700','705'};
        L.add(s4);

        // 10) Amortizaciones
        LayoutEntry g10 = new LayoutEntry();
        g10.type = 'GROUP'; g10.label = 'Amortizaciones';
        g10.apartados = new Set<String>{'07. Amortización'};
        L.add(g10);

        LayoutEntry s5 = new LayoutEntry();
        s5.type = 'SUBTOTAL'; s5.label = 'Rdto. de explotación';
        s5.mostrarPorcentaje = true;
        s5.denominadorPrefixesSubtotal = new Set<String>{'700','705'};
        L.add(s5);

        // 11) Diferencias divisas (subapartado 25 del Apartado Financiero)
        LayoutEntry g11 = new LayoutEntry();
        g11.type = 'GROUP'; g11.label = 'Diferencias divisas';
        g11.apartados = new Set<String>{'08. Financiero'};
        g11.includePrefixes = new Set<Integer>{25};
        L.add(g11);

        // 12) Rendimiento finanzas (resto del Apartado Financiero)
        LayoutEntry g12 = new LayoutEntry();
        g12.type = 'GROUP'; g12.label = 'Rendimiento finanzas';
        g12.apartados = new Set<String>{'08. Financiero'};
        g12.excludePrefixes = new Set<Integer>{25};
        L.add(g12);

        LayoutEntry s6 = new LayoutEntry();
        s6.type = 'SUBTOTAL'; s6.label = 'Rdto. antes de impuestos';
        s6.mostrarPorcentaje = true;
        s6.denominadorPrefixesSubtotal = new Set<String>{'700','705'};
        L.add(s6);

        // 13) Impuestos
        LayoutEntry g13 = new LayoutEntry();
        g13.type = 'GROUP'; g13.label = 'Impuestos';
        g13.apartados = new Set<String>{'09. Impuestos'};
        L.add(g13);

        LayoutEntry s7 = new LayoutEntry();
        s7.type = 'SUBTOTAL'; s7.label = 'Resultado ejercicio';
        s7.mostrarPorcentaje = true;
        s7.denominadorPrefixesSubtotal = new Set<String>{'700','705'};
        L.add(s7);

        return L;
    }

    /** Devuelve true si la cuenta encaja en el filtro de la entrada (apartado + prefijo). */
    private static Boolean matchEntry(LayoutEntry e, Plan_general_contable__c p) {
        if (p == null || e == null) return false;
        if (e.apartados != null && !e.apartados.isEmpty()) {
            if (!e.apartados.contains(p.Apartados__c)) return false;
        }
        Integer prefijo = prefijoSubapartado(p.Categor_a_Anal_tica_PyG__c);
        if (e.includePrefixes != null && !e.includePrefixes.isEmpty()) {
            if (prefijo == null || !e.includePrefixes.contains(prefijo)) return false;
        }
        if (e.excludePrefixes != null && !e.excludePrefixes.isEmpty()) {
            if (prefijo != null && e.excludePrefixes.contains(prefijo)) return false;
        }
        return true;
    }

    private static Integer prefijoSubapartado(String s) {
        if (String.isBlank(s)) return null;
        String pref = s.substringBefore('.');
        if (String.isBlank(pref) || !pref.isNumeric()) return null;
        return Integer.valueOf(pref);
    }

    /** ¿La cuenta cuenta como denominador (ingreso) para el % del grupo? */
    private static Boolean esDenominador(String codigo, String denominadorPrefijo) {
        if (String.isBlank(codigo)) return false;
        if (String.isNotBlank(denominadorPrefijo)) {
            return codigo.startsWith(denominadorPrefijo);
        }
        return codigo.startsWith('7');
    }

    /** Rellena los campos de % en una fila a partir de los valores acumulados y el denominador. */
    private static void aplicarPorcentaje(PyGRow row, Decimal[] valores, Decimal[] denominador) {
        Decimal[] pcts = new Decimal[]{null,null,null,null,null,null,null,null,null,null,null,null};
        Decimal sumValores = 0;
        Decimal sumDenom   = 0;
        for (Integer i = 0; i < 12; i++) {
            Decimal d = (denominador[i] == null) ? 0 : denominador[i];
            Decimal v = (valores[i]    == null) ? 0 : valores[i];
            if (d != 0) pcts[i] = (v / d) * 100;
            sumDenom += d;
            sumValores += v;
        }
        row.mostrarPorcentaje = true;
        row.porcentajes = pcts;
        row.porcentajeTotal = (sumDenom != 0) ? (sumValores / sumDenom) * 100 : null;
        row.meses7 = denominador;
    }

    // ---------------------------------------------------------------------
    //  ESTRUCTURA  con layout fijo + subtotales nombrados
    // ---------------------------------------------------------------------
    @TestVisible
    private static List<PyGRow> construirEstructura(
        Map<Id, Plan_general_contable__c> cuentasPGC,
        Map<Id, Decimal[]> saldos
    ) {
        List<LayoutEntry> layout = getLayout();
        List<PyGRow> rows = new List<PyGRow>();

        // Construimos un set de cuentaId asignadas a algún grupo para luego saber cuáles no encajan
        Set<Id> asignadas = new Set<Id>();

        // Acumuladores del subtotal corrido
        Decimal[] cum     = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
        // Acumulador SOLO de las cuentas 7xx (ingresos) — base para % en MBO/MNO/MBN
        Decimal[] cum7    = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
        // Acumulador de cuentas 700* + 705* — base para % en Ebitda / Rdto. de explotación / Rdto. antes de impuestos / Resultado ejercicio
        Decimal[] cum700_705 = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
        List<Id>  cumIds  = new List<Id>();
        Decimal[] totalGlobal = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
        List<Id>  idsTotalGlobal = new List<Id>();

        Integer groupIdx = 0;

        for (LayoutEntry entry : layout) {
            if (entry.type == 'GROUP') {
                groupIdx++;
                // Recolectar cuentas que matchean la entrada
                List<CuentaConSaldos> cuentas = new List<CuentaConSaldos>();
                for (Id cuentaId : saldos.keySet()) {
                    Plan_general_contable__c p = cuentasPGC.get(cuentaId);
                    if (p == null) continue;
                    if (asignadas.contains(cuentaId)) continue;
                    if (!matchEntry(entry, p)) continue;
                    CuentaConSaldos cs = new CuentaConSaldos();
                    cs.cuentaId = cuentaId;
                    cs.codigo   = p.Name;
                    cs.titulo   = (p.T_tulo_cuenta__c == null) ? '' : p.T_tulo_cuenta__c;
                    cs.subapartado = p.Categor_a_Anal_tica_PyG__c;
                    cs.saldosMes = saldos.get(cuentaId);
                    cuentas.add(cs);
                    asignadas.add(cuentaId);
                }
                cuentas.sort();

                // Cabecera del grupo (totales se rellenan al final)
                PyGRow grpRow = new PyGRow();
                grpRow.key = 'G' + groupIdx;
                grpRow.tipo = 'GRUPO';
                grpRow.nivel = 0;
                grpRow.concepto = entry.label;
                rows.add(grpRow);
                Integer grpIdx = rows.size() - 1;
                Decimal[] grpTotal = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
                Decimal[] grpDenom = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
                List<Id>  grpIds = new List<Id>();

                if (entry.subagrupar == true) {
                    // Agrupar cuentas por subapartado y emitir SUBGRUPO + cuentas
                    Map<String, List<CuentaConSaldos>> bySub = new Map<String, List<CuentaConSaldos>>();
                    for (CuentaConSaldos cs : cuentas) {
                        String sa = String.isBlank(cs.subapartado) ? 'Sin subapartado' : cs.subapartado;
                        if (!bySub.containsKey(sa)) bySub.put(sa, new List<CuentaConSaldos>());
                        bySub.get(sa).add(cs);
                    }
                    // Ordenar subapartados por prefijo numérico
                    List<String> subapartadosOrdenados = ordenarSubapartados(new List<String>(bySub.keySet()));

                    Integer sgIdx = 0;
                    for (String sa : subapartadosOrdenados) {
                        sgIdx++;
                        List<CuentaConSaldos> css = bySub.get(sa);

                        PyGRow sgRow = new PyGRow();
                        sgRow.key = 'G' + groupIdx + '_SG' + sgIdx;
                        sgRow.tipo = 'SUBGRUPO';
                        sgRow.nivel = 1;
                        sgRow.concepto = sa;
                        rows.add(sgRow);
                        Integer sgRowIdx = rows.size() - 1;
                        Decimal[] sgTotal = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
                        Decimal[] sgDenom = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
                        List<Id>  sgIds = new List<Id>();

                        for (CuentaConSaldos cs : css) {
                            PyGRow cr = new PyGRow();
                            cr.key = 'G' + groupIdx + '_SG' + sgIdx + '_' + cs.codigo;
                            cr.tipo = 'CUENTA';
                            cr.nivel = 2;
                            cr.cuentaId = cs.cuentaId;
                            cr.cuentaIds = new List<Id>{ cs.cuentaId };
                            cr.codigoCuenta = cs.codigo;
                            cr.concepto = cs.titulo;
                            cr.esGasto = cs.codigo.startsWith('6');
                            Decimal cTot = 0;
                            Decimal[] disp = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
                            Boolean es7        = cs.codigo != null && cs.codigo.startsWith('7');
                            Boolean es700_705  = cs.codigo != null && (cs.codigo.startsWith('700') || cs.codigo.startsWith('705'));
                            Boolean esDen      = esDenominador(cs.codigo, entry.denominadorPrefijo);
                            for (Integer i = 0; i < 12; i++) {
                                Decimal v = (cs.saldosMes[i] == null) ? 0 : cs.saldosMes[i];
                                disp[i] = v;
                                sgTotal[i] += v;
                                if (esDen) sgDenom[i] += v;
                                grpTotal[i] += v;
                                if (esDen) grpDenom[i] += v;
                                cum[i] += v;
                                if (es7) cum7[i] += v;
                                if (es700_705) cum700_705[i] += v;
                                totalGlobal[i] += v;
                                cTot += v;
                            }
                            cr.meses = disp;
                            cr.total = cTot;
                            rows.add(cr);
                            sgIds.add(cs.cuentaId);
                            grpIds.add(cs.cuentaId);
                            cumIds.add(cs.cuentaId);
                            idsTotalGlobal.add(cs.cuentaId);
                        }

                        Decimal sgSum = 0;
                        for (Decimal v : sgTotal) sgSum += v;
                        rows[sgRowIdx].meses = sgTotal;
                        rows[sgRowIdx].total = sgSum;
                        rows[sgRowIdx].cuentaIds = sgIds;
                        if (entry.mostrarPorcentajeGrupo == true) {
                            aplicarPorcentaje(rows[sgRowIdx], sgTotal, sgDenom);
                        }
                    }
                } else {
                    // Sin sub-agrupación — cuentas directamente bajo el grupo.
                    // Si procede, las cuentas 640-642 se agrupan en un subapartado de personal
                    // (cabecera con suma; con % s/ventas 7xx del grupo solo si se ha pedido).
                    Boolean wantPF = String.isNotBlank(entry.personalSubgrupoLabel);
                    Integer pfRowIdx = -1;
                    Decimal[] pfTotal = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
                    List<Id>  pfIds = new List<Id>();

                    for (CuentaConSaldos cs : cuentas) {
                        Boolean esPF = wantPF && cs.codigo != null &&
                            (cs.codigo.startsWith('640') || cs.codigo.startsWith('641') || cs.codigo.startsWith('642'));

                        // Al llegar a la primera cuenta de personal fijo, emitimos la cabecera del subapartado
                        if (esPF && pfRowIdx == -1) {
                            PyGRow pfRow = new PyGRow();
                            pfRow.key = 'G' + groupIdx + '_PF';
                            pfRow.tipo = 'SUBGRUPO';
                            pfRow.nivel = 1;
                            pfRow.concepto = entry.personalSubgrupoLabel;
                            rows.add(pfRow);
                            pfRowIdx = rows.size() - 1;
                        }

                        PyGRow cr = new PyGRow();
                        cr.key = 'G' + groupIdx + '_' + cs.codigo;
                        cr.tipo = 'CUENTA';
                        cr.nivel = esPF ? 2 : 1;
                        cr.cuentaId = cs.cuentaId;
                        cr.cuentaIds = new List<Id>{ cs.cuentaId };
                        cr.codigoCuenta = cs.codigo;
                        cr.concepto = cs.titulo;
                        cr.esGasto = cs.codigo.startsWith('6');
                        Decimal cTot = 0;
                        Decimal[] disp = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
                        Boolean es7        = cs.codigo != null && cs.codigo.startsWith('7');
                        Boolean es700_705  = cs.codigo != null && (cs.codigo.startsWith('700') || cs.codigo.startsWith('705'));
                        Boolean esDen      = esDenominador(cs.codigo, entry.denominadorPrefijo);
                        for (Integer i = 0; i < 12; i++) {
                            Decimal v = (cs.saldosMes[i] == null) ? 0 : cs.saldosMes[i];
                            disp[i] = v;
                            grpTotal[i] += v;
                            if (esDen) grpDenom[i] += v;
                            cum[i] += v;
                            if (es7) cum7[i] += v;
                            if (es700_705) cum700_705[i] += v;
                            totalGlobal[i] += v;
                            cTot += v;
                            if (esPF) pfTotal[i] += v;
                        }
                        cr.meses = disp;
                        cr.total = cTot;
                        rows.add(cr);
                        grpIds.add(cs.cuentaId);
                        cumIds.add(cs.cuentaId);
                        idsTotalGlobal.add(cs.cuentaId);
                        if (esPF) pfIds.add(cs.cuentaId);
                    }

                    // Rellenar la cabecera del subapartado con la suma y el % sobre las ventas (7xx) del grupo
                    if (pfRowIdx != -1) {
                        Decimal pfSum = 0;
                        for (Decimal v : pfTotal) pfSum += v;
                        rows[pfRowIdx].meses = pfTotal;
                        rows[pfRowIdx].total = pfSum;
                        rows[pfRowIdx].cuentaIds = pfIds;
                        if (entry.personalSubgrupoPct == true) {
                            aplicarPorcentaje(rows[pfRowIdx], pfTotal, grpDenom);
                        }
                    }
                }

                Decimal grpSum = 0;
                for (Decimal v : grpTotal) grpSum += v;
                rows[grpIdx].meses = grpTotal;
                rows[grpIdx].total = grpSum;
                rows[grpIdx].cuentaIds = grpIds;
                if (entry.mostrarPorcentajeGrupo == true) {
                    aplicarPorcentaje(rows[grpIdx], grpTotal, grpDenom);
                }
            } else if (entry.type == 'SUBTOTAL') {
                PyGRow stRow = new PyGRow();
                stRow.key = 'ST_' + entry.label;
                stRow.tipo = 'SUBTOTAL';
                stRow.nivel = 0;
                stRow.concepto = entry.label;
                Decimal[] copy = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
                for (Integer i = 0; i < 12; i++) copy[i] = cum[i];
                stRow.meses = copy;
                Decimal sumSt = 0;
                for (Decimal v : copy) sumSt += v;
                stRow.total = sumSt;
                stRow.cuentaIds = new List<Id>(cumIds);

                if (entry.mostrarPorcentaje == true) {
                    stRow.mostrarPorcentaje = true;
                    // Si la entrada especifica prefijos concretos -> usar cum700_705; en caso contrario, cum7
                    Decimal[] denom = (entry.denominadorPrefixesSubtotal != null
                                       && !entry.denominadorPrefixesSubtotal.isEmpty())
                                      ? cum700_705 : cum7;
                    Decimal[] pcts = new Decimal[]{null,null,null,null,null,null,null,null,null,null,null,null};
                    Decimal[] m7   = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
                    for (Integer i = 0; i < 12; i++) {
                        m7[i] = (denom[i] == null) ? 0 : denom[i];
                        if (denom[i] != null && denom[i] != 0) {
                            pcts[i] = (cum[i] / denom[i]) * 100;
                        }
                    }
                    Decimal denomTot = 0;
                    for (Decimal v : denom) denomTot += v;
                    stRow.porcentajes = pcts;
                    stRow.porcentajeTotal = (denomTot != 0) ? (sumSt / denomTot) * 100 : null;
                    stRow.meses7 = m7;
                }
                rows.add(stRow);
            }
        }

        // Sin clasificar: cuentas que no encajaron en ningún grupo del layout
        List<CuentaConSaldos> noMatch = new List<CuentaConSaldos>();
        for (Id cuentaId : saldos.keySet()) {
            if (asignadas.contains(cuentaId)) continue;
            Plan_general_contable__c p = cuentasPGC.get(cuentaId);
            if (p == null) continue;
            CuentaConSaldos cs = new CuentaConSaldos();
            cs.cuentaId = cuentaId;
            cs.codigo   = p.Name;
            cs.titulo   = (p.T_tulo_cuenta__c == null) ? '' : p.T_tulo_cuenta__c;
            cs.saldosMes = saldos.get(cuentaId);
            noMatch.add(cs);
        }
        if (!noMatch.isEmpty()) {
            noMatch.sort();
            PyGRow sc = new PyGRow();
            sc.key = 'SIN_CLAS';
            sc.tipo = 'SIN_CLASIFICAR';
            sc.nivel = 0;
            sc.concepto = 'Sin clasificar analíticamente';
            rows.add(sc);
            Integer scIdx = rows.size() - 1;
            Decimal[] scTotal = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
            List<Id> scIds = new List<Id>();
            for (CuentaConSaldos cs : noMatch) {
                PyGRow cr = new PyGRow();
                cr.key = 'SC_' + cs.codigo;
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
                    scTotal[i] += v;
                    totalGlobal[i] += v;
                    cTot += v;
                }
                cr.meses = disp;
                cr.total = cTot;
                rows.add(cr);
                scIds.add(cs.cuentaId);
                idsTotalGlobal.add(cs.cuentaId);
            }
            Decimal scSum = 0;
            for (Decimal v : scTotal) scSum += v;
            rows[scIdx].meses = scTotal;
            rows[scIdx].total = scSum;
            rows[scIdx].cuentaIds = scIds;
        }

        // (Se omite intencionadamente la fila TOTAL EJERCICIO — sólo dejamos el acumulado mensual)

        // ACUMULADO mensual: guardamos la contribución mensual cruda (el running lo hace el LWC dentro del rango filtrado)
        PyGRow acum = new PyGRow();
        acum.key = 'ACUM';
        acum.tipo = 'ACUMULADO';
        acum.nivel = 0;
        acum.concepto = 'Saldo acumulado del ejercicio';
        acum.acumulado = true;
        Decimal[] acMeses = new Decimal[]{0,0,0,0,0,0,0,0,0,0,0,0};
        Decimal totalAcum = 0;
        for (Integer i = 0; i < 12; i++) {
            acMeses[i] = totalGlobal[i];
            totalAcum += totalGlobal[i];
        }
        acum.meses = acMeses;
        acum.total = totalAcum;
        acum.cuentaIds = idsTotalGlobal;
        rows.add(acum);

        return rows;
    }

    public class CuentaConSaldos implements Comparable {
        public Id cuentaId;
        public String codigo;
        public String titulo;
        public String subapartado;
        public Decimal[] saldosMes;
        public Integer compareTo(Object other) {
            CuentaConSaldos o = (CuentaConSaldos) other;
            // Orden dentro del grupo: 7xx (ingresos) -> 6xx (gastos) -> resto
            Integer myPrio    = prioCuenta(this.codigo);
            Integer otherPrio = prioCuenta(o.codigo);
            if (myPrio != otherPrio) return (myPrio < otherPrio) ? -1 : 1;
            if (this.codigo == o.codigo) return 0;
            return (this.codigo < o.codigo) ? -1 : 1;
        }
    }

    private static Integer prioCuenta(String codigo) {
        if (String.isBlank(codigo)) return 9;
        if (codigo.startsWith('7')) return 0;
        if (codigo.startsWith('6')) return 1;
        return 2;
    }

    /** Ordena subapartados por prefijo numérico y deja 'Sin subapartado' al final. */
    private static List<String> ordenarSubapartados(List<String> input) {
        List<SubKV> kvs = new List<SubKV>();
        for (String s : input) {
            Integer prio = 999;
            if (s == 'Sin subapartado') {
                prio = 9999;
            } else {
                Integer p = prefijoSubapartado(s);
                if (p != null) prio = p;
            }
            SubKV k = new SubKV(); k.prio = prio; k.label = s; kvs.add(k);
        }
        kvs.sort();
        List<String> out = new List<String>();
        for (SubKV k : kvs) out.add(k.label);
        return out;
    }
    public class SubKV implements Comparable {
        public Integer prio;
        public String  label;
        public Integer compareTo(Object o) {
            SubKV other = (SubKV) o;
            if (this.prio == other.prio) {
                if (this.label == other.label) return 0;
                return (this.label < other.label) ? -1 : 1;
            }
            return (this.prio < other.prio) ? -1 : 1;
        }
    }

    // ---------------------------------------------------------------------
    //  MOVIMIENTOS — delegamos al de PyGMensualController (misma lógica)
    // ---------------------------------------------------------------------
    @AuraEnabled
    public static List<PyGMensualController.Movimiento> getMovimientos(
        List<Id> cuentaIds,
        Integer ejercicio,
        Integer mes,
        Integer mesInicio,
        List<String> empresasTitulares,
        String area,
        Id     directorFacturacionId,
        String simulacion,
        String extraordinarios,
        String check,
        String incidencia
    ) {
        return PyGMensualController.getMovimientos(
            cuentaIds, ejercicio, mes, mesInicio,
            empresasTitulares, area, directorFacturacionId,
            simulacion, extraordinarios, check, incidencia
        );
    }
}