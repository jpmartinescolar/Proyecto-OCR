/**
 * Controller de "Pérdidas y Ganancias Histórico anual".
 * Una columna por ejercicio (año, en orden ascendente) aplicando a cada año
 * los meses seleccionados. Reutiliza PyGController (agregación de saldos y
 * construcción de la estructura) para que las filas coincidan con el resto
 * de componentes PyG y se alineen por su 'key'.
 */
public with sharing class PyGHistoricoController {

    public class HistCell {
        @AuraEnabled public Decimal valor;
        @AuraEnabled public Decimal pct;
    }

    public class HistRow {
        @AuraEnabled public String key;
        @AuraEnabled public String tipo;            // SECCION | CUENTA | SUBTOTAL
        @AuraEnabled public String concepto;
        @AuraEnabled public String codigoCuenta;
        @AuraEnabled public Id     cuentaId;
        @AuraEnabled public List<Id> cuentaIds;
        @AuraEnabled public List<HistCell> anios;   // una celda por año (mismo orden que res.anios)
    }

    public class HistResult {
        @AuraEnabled public List<Integer> anios;    // años en orden ascendente
        @AuraEnabled public List<HistRow> rows;
    }

    @AuraEnabled
    public static HistResult generarHistorico(
        List<String> empresasTitulares,
        String area,
        Id     directorFacturacionId,
        List<Integer> anios,
        List<Integer> meses,            // 1-12; vacío o null = todos
        String planPGC,
        String simulacion,
        String extraordinarios,
        String check
    ) {
        if (empresasTitulares == null || empresasTitulares.isEmpty()) {
            throw new AuraHandledException('Debes seleccionar al menos una empresa titular.');
        }
        if (anios == null || anios.isEmpty()) {
            throw new AuraHandledException('Debes seleccionar al menos un ejercicio.');
        }

        // Años únicos en orden ascendente (de menor a mayor)
        List<Integer> ys = new List<Integer>(new Set<Integer>(anios));
        ys.sort();

        // Meses válidos (1-12); vacío = todos
        Set<Integer> ms = new Set<Integer>();
        if (meses != null) {
            for (Integer m : meses) { if (m != null && m >= 1 && m <= 12) ms.add(m); }
        }
        if (ms.isEmpty()) {
            for (Integer m = 1; m <= 12; m++) ms.add(m);
        }

        // Cuentas PGC que empiezan por 6 o 7 (P&G)
        Map<Id, Plan_general_contable__c> cuentasPGC = new Map<Id, Plan_general_contable__c>(
            [SELECT Id, Name, T_tulo_cuenta__c
               FROM Plan_general_contable__c
              WHERE (Name LIKE '6%' OR Name LIKE '7%')]
        );
        Set<Id> idsCuentas = cuentasPGC.keySet();

        // Saldos por año (aplicando los meses seleccionados como rangos contiguos)
        Map<Integer, Map<Id, Decimal>> saldoPorAnio = new Map<Integer, Map<Id, Decimal>>();
        Map<Id, Decimal> saldoTotal = new Map<Id, Decimal>();
        for (Integer y : ys) {
            Map<Id, Decimal> store = new Map<Id, Decimal>();
            for (List<Date> rango : rangosMeses(y, ms)) {
                PyGController.agregarSaldosPeriodo(store, rango[0], rango[1], idsCuentas,
                    empresasTitulares, area, directorFacturacionId, simulacion, extraordinarios, check);
            }
            saldoPorAnio.put(y, store);
            for (Id c : store.keySet()) {
                Decimal v = saldoTotal.get(c);
                saldoTotal.put(c, (v == null ? 0 : v) + store.get(c));
            }
        }

        // La suma de todos los años define la estructura y el orden de las filas
        Map<Id, Decimal> vacio = new Map<Id, Decimal>();
        List<PyGController.PyGRow> base = PyGController.construirEstructura(planPGC, cuentasPGC, saldoTotal, vacio);

        // Filas de cada año indexadas por key
        Map<Integer, Map<String, PyGController.PyGRow>> porAnio = new Map<Integer, Map<String, PyGController.PyGRow>>();
        for (Integer y : ys) {
            Map<String, PyGController.PyGRow> m = new Map<String, PyGController.PyGRow>();
            for (PyGController.PyGRow r : PyGController.construirEstructura(planPGC, cuentasPGC, saldoPorAnio.get(y), vacio)) {
                m.put(r.key, r);
            }
            porAnio.put(y, m);
        }

        HistResult res = new HistResult();
        res.anios = ys;
        res.rows = new List<HistRow>();
        for (PyGController.PyGRow br : base) {
            HistRow hr = new HistRow();
            hr.key          = br.key;
            hr.tipo         = br.tipo;
            hr.concepto     = br.concepto;
            hr.codigoCuenta = br.codigoCuenta;
            hr.cuentaId     = br.cuentaId;
            hr.cuentaIds    = br.cuentaIds;
            hr.anios = new List<HistCell>();
            for (Integer y : ys) {
                PyGController.PyGRow r = porAnio.get(y).get(br.key);
                HistCell cell = new HistCell();
                if (r != null) {
                    cell.valor = r.valorActual;
                    cell.pct   = r.porcentajeActual;
                }
                hr.anios.add(cell);
            }
            res.rows.add(hr);
        }
        return res;
    }

    /** Convierte el set de meses en rangos de fechas contiguos dentro del año */
    @TestVisible
    private static List<List<Date>> rangosMeses(Integer anio, Set<Integer> meses) {
        List<List<Date>> out = new List<List<Date>>();
        Integer m = 1;
        while (m <= 12) {
            if (!meses.contains(m)) { m++; continue; }
            Integer ini = m;
            while (m <= 12 && meses.contains(m)) m++;
            Integer fin = m - 1;
            out.add(new List<Date>{
                Date.newInstance(anio, ini, 1),
                Date.newInstance(anio, fin, Date.daysInMonth(anio, fin))
            });
        }
        return out;
    }
}