/**
 * Controller del componente "Balance de Situación".
 *  - Mismo modelo de filtros/fechas que PyG (periodo actual + comparativo).
 *  - El saldo de cada cuenta de balance (grupos 1-5) es el acumulado de
 *    movimientos en el rango (el asiento de apertura aporta el saldo inicial).
 *  - La estructura oficial (Normal/PYMES/Abreviado) vive en BalanceStructure.
 *    Cada hoja suma sus cuentas por prefijo con signo y modo (Debe-Haber /
 *    Haber-Debe); los agregados/total acumulan a sus hijos.
 *  El modal de apuntes reutiliza PyGController.getMovimientos.
 */
public with sharing class BalanceController {

    public class FilterOptions {
        @AuraEnabled public List<String> empresasTitulares;
        @AuraEnabled public List<String> areas;
        @AuraEnabled public List<String> planesPGC;
    }

    public class BalRow {
        @AuraEnabled public String  key             { get; set; }
        @AuraEnabled public String  parentKey       { get; set; }
        @AuraEnabled public String  tipo            { get; set; }  // BANDA | TOTAL | AGG | CUENTA
        @AuraEnabled public Integer nivel           { get; set; }
        @AuraEnabled public String  concepto        { get; set; }
        @AuraEnabled public String  band            { get; set; }  // ACTIVO | PASIVO
        @AuraEnabled public String  codigoCuenta    { get; set; }  // sólo CUENTA
        @AuraEnabled public Id      cuentaId        { get; set; }  // sólo CUENTA
        @AuraEnabled public Boolean tieneHijos      { get; set; }
        @AuraEnabled public Decimal valorActual     { get; set; }
        @AuraEnabled public Decimal valorComparado  { get; set; }
        @AuraEnabled public List<Id> cuentaIds      { get; set; }

        public BalRow() {
            this.valorActual = 0;
            this.valorComparado = 0;
            this.tieneHijos = false;
            this.cuentaIds = new List<Id>();
        }
    }

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
        for (Schema.PicklistEntry e : t.getDescribe().fields.getMap().get(fieldApi).getDescribe().getPicklistValues()) {
            if (e.isActive()) out.add(e.getValue());
        }
        return out;
    }

    // ---------------------------------------------------------------------
    //  GENERAR
    // ---------------------------------------------------------------------
    @AuraEnabled
    public static List<BalRow> generar(
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

        // Cuentas de balance: grupos 1-5
        Map<Id, Plan_general_contable__c> cuentas = new Map<Id, Plan_general_contable__c>(
            [SELECT Id, Name, T_tulo_cuenta__c FROM Plan_general_contable__c
              WHERE Name LIKE '1%' OR Name LIKE '2%' OR Name LIKE '3%' OR Name LIKE '4%' OR Name LIKE '5%']
        );
        Set<Id> ids = cuentas.keySet();

        Map<Id, Decimal> netActual = new Map<Id, Decimal>();
        Map<Id, Decimal> netComp   = new Map<Id, Decimal>();
        agregarSaldosPeriodo(netActual, fechaDesde, fechaHasta, ids, empresasTitulares, area, directorFacturacionId, simulacion, extraordinarios, check);
        agregarSaldosPeriodo(netComp,   fechaCompDesde, fechaCompHasta, ids, empresasTitulares, area, directorFacturacionId, simulacion, extraordinarios, check);

        // Resultado del ejercicio pendiente de cierre = neto (Haber-Debe) de las cuentas 6/7
        // del periodo. Se calcula con un SUM agregado (ligero), sin cargar las 6/7 una a una,
        // y se inyecta en el epígrafe "Ingresos/Gastos pendiente cierre" de Fondos Propios.
        Set<Id> ids67 = new Map<Id, Plan_general_contable__c>(
            [SELECT Id FROM Plan_general_contable__c WHERE Name LIKE '6%' OR Name LIKE '7%']).keySet();
        Decimal net67A = sumaNeto67(ids67, fechaDesde, fechaHasta, empresasTitulares, area, directorFacturacionId, simulacion, extraordinarios, check);
        Decimal net67C = sumaNeto67(ids67, fechaCompDesde, fechaCompHasta, empresasTitulares, area, directorFacturacionId, simulacion, extraordinarios, check);

        // Cuentas con datos (en cualquiera de los dos periodos), con su nombre
        List<AccData> accs = new List<AccData>();
        Set<Id> conDatos = new Set<Id>();
        conDatos.addAll(netActual.keySet());
        conDatos.addAll(netComp.keySet());
        for (Id cid : conDatos) {
            Plan_general_contable__c p = cuentas.get(cid);
            if (p == null) continue;
            AccData a = new AccData();
            a.id = cid; a.name = p.Name; a.titulo = (p.T_tulo_cuenta__c == null ? '' : p.T_tulo_cuenta__c);
            a.netA = netActual.containsKey(cid) ? netActual.get(cid) : 0;
            a.netC = netComp.containsKey(cid)   ? netComp.get(cid)   : 0;
            accs.add(a);
        }

        return construir(planPGC, accs, net67A, net67C);
    }

    private class AccData implements Comparable {
        Id id; String name; String titulo; Decimal netA; Decimal netC;
        public Integer compareTo(Object o) {
            AccData x = (AccData) o;
            if (this.name == x.name) return 0;
            return (this.name < x.name) ? -1 : 1;
        }
    }

    // Valor calculado de una línea (por periodo) + ids de cuentas que aportan
    private class Calc {
        Decimal actual = 0;
        Decimal comparado = 0;
        Set<Id> ids = new Set<Id>();
    }

    private static List<BalRow> construir(String planPGC, List<AccData> accs, Decimal net67A, Decimal net67C) {
        List<BalanceStructure.BalLine> est = BalanceStructure.estructura(planPGC);

        // mapa de líneas y de padres (excluyendo totales, que re-referencian raíces)
        Map<String, BalanceStructure.BalLine> byKey = new Map<String, BalanceStructure.BalLine>();
        for (BalanceStructure.BalLine l : est) byKey.put(l.key, l);
        Map<String, String> parent = new Map<String, String>();
        for (BalanceStructure.BalLine l : est) {
            if (l.esTotal || l.esBanda) continue;
            for (BalanceStructure.BalChild h : l.hijos) parent.put(h.key, l.key);
        }

        // Cuentas de naturaleza DUAL (p.ej. 551 "c/c con socios"): aparecen tanto en un
        // epígrafe de Activo como de Pasivo. Hay que imputarlas a UNA sola banda según el
        // signo de su saldo (deudor -> Activo, acreedor -> Pasivo); si no, se cuentan dos
        // veces y el balance descuadra por el importe de la cuenta.
        Set<String> prefActivo = new Set<String>();
        Set<String> prefPasivo = new Set<String>();
        for (BalanceStructure.BalLine l : est) {
            if (!l.esLeaf) continue;
            for (BalanceStructure.BalAccount ba : l.cuentas) {
                if (l.band == 'ACTIVO') prefActivo.add(ba.prefijo); else prefPasivo.add(ba.prefijo);
            }
        }
        Map<Id, Boolean> esDual = new Map<Id, Boolean>();
        for (AccData a : accs) {
            Boolean inA = false, inP = false;
            if (a.name != null) {
                for (String p : prefActivo) { if (a.name.startsWith(p)) { inA = true; break; } }
                for (String p : prefPasivo) { if (a.name.startsWith(p)) { inP = true; break; } }
            }
            esDual.put(a.id, inA && inP);
        }

        // calcular hojas + filas de cuenta contable bajo cada hoja
        Map<String, Calc> calc = new Map<String, Calc>();
        Map<String, List<BalRow>> hojaCuentas = new Map<String, List<BalRow>>();
        for (BalanceStructure.BalLine l : est) {
            if (!l.esLeaf) continue;
            Calc c = new Calc();
            Map<Id, Decimal> accA = new Map<Id, Decimal>();
            Map<Id, Decimal> accC = new Map<Id, Decimal>();
            Map<Id, AccData> accInfo = new Map<Id, AccData>();
            Boolean bandActivo = (l.band == 'ACTIVO');
            for (BalanceStructure.BalAccount ba : l.cuentas) {
                for (AccData a : accs) {
                    if (a.name != null && a.name.startsWith(ba.prefijo)) {
                        // Cuentas duales: cada periodo se imputa solo a la banda que
                        // corresponde a su signo (deudor->Activo, acreedor->Pasivo).
                        Boolean addA = true, addC = true;
                        if (esDual.get(a.id) == true) {
                            addA = bandActivo ? (a.netA < 0) : (a.netA > 0);
                            addC = bandActivo ? (a.netC < 0) : (a.netC > 0);
                        }
                        Decimal vA = addA ? ba.signo * (ba.deudor ? -a.netA : a.netA) : 0;
                        Decimal vC = addC ? ba.signo * (ba.deudor ? -a.netC : a.netC) : 0;
                        if (vA == 0 && vC == 0) continue;
                        c.actual    += vA;
                        c.comparado += vC;
                        c.ids.add(a.id);
                        accA.put(a.id, (accA.containsKey(a.id) ? accA.get(a.id) : 0) + vA);
                        accC.put(a.id, (accC.containsKey(a.id) ? accC.get(a.id) : 0) + vC);
                        accInfo.put(a.id, a);
                    }
                }
            }
            calc.put(l.key, c);

            // filas de cuenta (sólo las que tengan importe en algún periodo), ordenadas por código
            List<AccData> contrib = new List<AccData>();
            for (Id aid : accInfo.keySet()) {
                Decimal va = accA.containsKey(aid) ? accA.get(aid) : 0;
                Decimal vc = accC.containsKey(aid) ? accC.get(aid) : 0;
                if ((va == null ? 0 : va) == 0 && (vc == null ? 0 : vc) == 0) continue;
                contrib.add(accInfo.get(aid));
            }
            contrib.sort();
            List<BalRow> filas = new List<BalRow>();
            for (AccData a : contrib) {
                BalRow cr = new BalRow();
                cr.key = l.key + '__' + a.id;
                cr.parentKey = l.key;
                cr.tipo = 'CUENTA';
                cr.nivel = l.nivel + 1;
                cr.band = l.band;
                cr.codigoCuenta = a.name;
                cr.cuentaId = a.id;
                cr.concepto = a.titulo;
                cr.valorActual = accA.get(a.id);
                cr.valorComparado = accC.get(a.id);
                cr.cuentaIds = new List<Id>{ a.id };
                filas.add(cr);
            }
            hojaCuentas.put(l.key, filas);
        }

        // Inyectar el resultado del ejercicio (neto 6/7) en el epígrafe "Ingresos/Gastos
        // pendiente cierre" (la hoja cuyas cuentas son los prefijos 6 y 7), para que suba
        // hasta Fondos Propios y el Balance cuadre. No se cargan las 6/7 cuenta a cuenta.
        for (BalanceStructure.BalLine l : est) {
            if (!l.esLeaf) continue;
            Boolean tiene67 = false;
            for (BalanceStructure.BalAccount ba : l.cuentas) {
                if (ba.prefijo == '6' || ba.prefijo == '7') { tiene67 = true; break; }
            }
            if (tiene67) {
                Calc c = calc.containsKey(l.key) ? calc.get(l.key) : new Calc();
                c.actual = (net67A == null ? 0 : net67A);
                c.comparado = (net67C == null ? 0 : net67C);
                calc.put(l.key, c);
            }
        }

        // calcular agregados / totales (recursivo con memo)
        for (BalanceStructure.BalLine l : est) {
            if (l.esLeaf || l.esBanda) continue;
            calcularAgregado(l.key, byKey, calc);
        }

        // construir filas en orden de documento
        List<BalRow> rows = new List<BalRow>();
        for (BalanceStructure.BalLine l : est) {
            BalRow r = new BalRow();
            r.key = l.key;
            r.parentKey = parent.get(l.key);
            r.tipo = l.esBanda ? 'BANDA' : (l.esTotal ? 'TOTAL' : (l.esLeaf ? 'HOJA' : 'AGG'));
            r.nivel = l.nivel;
            r.concepto = l.label;
            r.band = l.band;
            List<BalRow> filasCuenta = hojaCuentas.containsKey(l.key) ? hojaCuentas.get(l.key) : new List<BalRow>();
            if (l.esBanda || l.esTotal) {
                r.tieneHijos = false;
            } else if (l.esLeaf) {
                r.tieneHijos = !filasCuenta.isEmpty();
            } else {
                r.tieneHijos = !l.hijos.isEmpty();
            }
            if (!l.esBanda) {
                Calc c = calc.get(l.key);
                if (c != null) {
                    r.valorActual = c.actual;
                    r.valorComparado = c.comparado;
                    r.cuentaIds = new List<Id>(c.ids);
                }
            }
            rows.add(r);
            // filas de cuenta contable bajo la hoja
            for (BalRow cr : filasCuenta) rows.add(cr);
        }
        return rows;
    }

    private static Calc calcularAgregado(String key, Map<String, BalanceStructure.BalLine> byKey, Map<String, Calc> calc) {
        if (calc.containsKey(key)) return calc.get(key);
        BalanceStructure.BalLine l = byKey.get(key);
        Calc c = new Calc();
        if (l != null) {
            for (BalanceStructure.BalChild h : l.hijos) {
                Calc hc = calc.containsKey(h.key) ? calc.get(h.key) : calcularAgregado(h.key, byKey, calc);
                if (hc != null) {
                    c.actual    += h.signo * hc.actual;
                    c.comparado += h.signo * hc.comparado;
                    c.ids.addAll(hc.ids);
                }
            }
        }
        calc.put(key, c);
        return c;
    }

    // ---------------------------------------------------------------------
    //  AGREGACIÓN DE SALDOS PARA UN PERIODO  (net = Haber - Debe)
    // ---------------------------------------------------------------------
    private static void agregarSaldosPeriodo(
        Map<Id, Decimal> store, Date desde, Date hasta, Set<Id> ids,
        List<String> empresasTitulares, String area, Id directorFacturacionId,
        String simulacion, String extraordinarios, String check
    ) {
        Boolean incluirContables = (extraordinarios != 'Si');
        if (incluirContables) {
            String soql = 'SELECT Plan__c c, SUM(Debe__c) d, SUM(Haber__c) h FROM Linea_asiento_contable__c '
                        + 'WHERE Plan__c IN :ids '
                        + 'AND Asientos_contable__r.Fecha_asiento_contable__c >= :desde '
                        + 'AND Asientos_contable__r.Fecha_asiento_contable__c <= :hasta '
                        + 'AND Empresa_titular__c IN :empresasTitulares '
                        // El asiento de cierre salda las cuentas de balance: si se incluyera, el balance saldría a cero
                        + 'AND Tipo_de_asiento__c != \'Asiento de cierre\' ';
            if (String.isNotBlank(area))       soql += 'AND rea__c = :area ';
            if (directorFacturacionId != null) soql += 'AND Director_asignado_facturaci_n__c = :directorFacturacionId ';
            soql += simulacionClause(simulacion) + checkClause(check) + 'GROUP BY Plan__c';
            for (AggregateResult ar : Database.query(soql)) {
                Decimal d = (Decimal) ar.get('d'); Decimal h = (Decimal) ar.get('h');
                acumular(store, (Id) ar.get('c'), (h == null ? 0 : h) - (d == null ? 0 : d));
            }
        }
        Boolean incluirExtra = (extraordinarios == 'Si' || extraordinarios == 'Todas');
        if (incluirExtra) {
            String soql = 'SELECT Plan_general_contable__c c, SUM(Debe__c) d, SUM(Haber__c) h FROM Apuntes_extraodinarios__c '
                        + 'WHERE Plan_general_contable__c IN :ids '
                        + 'AND Fecha_apunte_extraordinario__c >= :desde '
                        + 'AND Fecha_apunte_extraordinario__c <= :hasta '
                        + 'AND Empresa_titular__c IN :empresasTitulares ';
            if (String.isNotBlank(area))       soql += 'AND rea__c = :area ';
            if (directorFacturacionId != null) soql += 'AND Director_facturaci_n_asignado__c = :directorFacturacionId ';
            soql += simulacionClause(simulacion) + checkClause(check) + 'GROUP BY Plan_general_contable__c';
            for (AggregateResult ar : Database.query(soql)) {
                Decimal d = (Decimal) ar.get('d'); Decimal h = (Decimal) ar.get('h');
                acumular(store, (Id) ar.get('c'), (h == null ? 0 : h) - (d == null ? 0 : d));
            }
        }
    }

    /** Neto (Haber-Debe) de las cuentas 6/7 en el periodo, con un SUM agregado (sin GROUP BY,
     *  por tanto ligero) — para el "Resultado del ejercicio pendiente de cierre".
     *  Solo apuntes contables (libro): es la partida doble que cuadra el balance. */
    private static Decimal sumaNeto67(Set<Id> ids67, Date desde, Date hasta,
        List<String> empresasTitulares, String area, Id directorFacturacionId,
        String simulacion, String extraordinarios, String check) {
        Decimal net = 0;
        if (ids67 == null || ids67.isEmpty() || desde == null || hasta == null) return net;
        String soql = 'SELECT SUM(Debe__c) d, SUM(Haber__c) h FROM Linea_asiento_contable__c '
                    + 'WHERE Plan__c IN :ids67 '
                    + 'AND Asientos_contable__r.Fecha_asiento_contable__c >= :desde '
                    + 'AND Asientos_contable__r.Fecha_asiento_contable__c <= :hasta '
                    + 'AND Empresa_titular__c IN :empresasTitulares ';
        if (String.isNotBlank(area))       soql += 'AND rea__c = :area ';
        if (directorFacturacionId != null) soql += 'AND Director_asignado_facturaci_n__c = :directorFacturacionId ';
        soql += simulacionClause(simulacion) + checkClause(check);
        for (AggregateResult ar : Database.query(soql)) {
            Decimal d=(Decimal)ar.get('d'), h=(Decimal)ar.get('h'); net += (h==null?0:h)-(d==null?0:d);
        }
        return net;
    }

    private static void acumular(Map<Id, Decimal> store, Id cuentaId, Decimal valor) {
        if (cuentaId == null) return;
        Decimal v = store.get(cuentaId);
        store.put(cuentaId, (v == null ? 0 : v) + (valor == null ? 0 : valor));
    }

    private static String simulacionClause(String simulacion) {
        if (simulacion == 'No') return 'AND (Simulaci_n__c = \'No\' OR Simulaci_n__c = null) ';
        if (simulacion == 'Si') return 'AND Simulaci_n__c = \'Si\' ';
        if (simulacion == 'Sí. Transferencia') return 'AND Simulaci_n__c = \'Sí. Transferencia\' ';
        return '';
    }
    private static String checkClause(String check) {
        if (check == 'Si') return 'AND Check__c = \'Si\' ';
        if (check == 'No') return 'AND (Check__c = \'No\' OR Check__c = null) ';
        return '';
    }
}