/**
 * Balance de Situación sobre la contabilidad externa de Sage 200 (SQL Server),
 * consultada a través del endpoint SQL de Skyvia Connect (mismo conector que
 * PyGSqlController y LibroMayorSqlController).
 *
 * Misma estructura oficial que BalanceController (reutiliza BalanceStructure),
 * pero los saldos salen de dbo.Movimientos y las cuentas se identifican por su
 * código (String). Sin filtros de simulación, extraordinarios, check, área,
 * director de facturación ni empresa titular: el filtro es la empresa de Sage.
 *
 * Criterios de datos:
 *  - Se incluye el asiento de apertura (aporta el saldo inicial del ejercicio).
 *  - Se excluyen los asientos de cierre: 'Cierre contabilidad' salda las
 *    cuentas de balance (grupos 1-5) y 'Cierre ejercicio' regulariza las 6/7;
 *    con cualquiera de los dos dentro, el ejercicio cerrado saldría a cero.
 *  - net = Haber - Debe por cuenta; cada hoja aplica signo y modo deudor de
 *    BalanceStructure, igual que BalanceController.
 *  - El neto de las cuentas 6/7 del periodo se inyecta en el epígrafe
 *    "Ingresos/Gastos pendiente cierre" para que el balance cuadre.
 */
public with sharing class BalanceSqlController {

    private static final String ENDPOINT = 'https://connect.skyvia.com/2v2l1qq7/execute';

    /** Skyvia devuelve como máximo 500 filas por consulta: se pagina por cursor */
    private static final Integer PAGINA = 500;

    public class BalRow {
        @AuraEnabled public String  key;
        @AuraEnabled public String  parentKey;
        @AuraEnabled public String  tipo;          // BANDA | TOTAL | AGG | HOJA | CUENTA
        @AuraEnabled public Integer nivel;
        @AuraEnabled public String  concepto;
        @AuraEnabled public String  band;          // ACTIVO | PASIVO
        @AuraEnabled public String  codigoCuenta;  // sólo CUENTA
        @AuraEnabled public Boolean tieneHijos;
        @AuraEnabled public Decimal valorActual;
        @AuraEnabled public Decimal valorComparado;

        public BalRow() {
            this.valorActual = 0;
            this.valorComparado = 0;
            this.tieneHijos = false;
        }
    }

    /** Genera el Balance de una o varias empresas Sage con periodo actual y comparativo */
    @AuraEnabled
    public static List<BalRow> generar(
        List<Integer> codigosEmpresa,
        Date fechaDesde,
        Date fechaHasta,
        Date fechaCompDesde,
        Date fechaCompHasta,
        String planPGC
    ) {
        if (codigosEmpresa == null || codigosEmpresa.isEmpty()) {
            throw new AuraHandledException('Debes seleccionar al menos una empresa.');
        }
        if (fechaDesde == null || fechaHasta == null || fechaCompDesde == null || fechaCompHasta == null) {
            throw new AuraHandledException('Debes indicar las cuatro fechas (Desde, Hasta, Comparativo desde, Comparativo hasta).');
        }

        List<String> codigos = new List<String>();
        for (Integer c : codigosEmpresa) {
            if (c != null) codigos.add(String.valueOf(c));
        }
        String inEmpresas = '(' + String.join(codigos, ',') + ')';
        String pa = '(m.FechaAsiento >= \'' + fechaSql(fechaDesde) + '\' AND m.FechaAsiento < \'' + fechaSql(fechaHasta.addDays(1)) + '\')';
        String pc = '(m.FechaAsiento >= \'' + fechaSql(fechaCompDesde) + '\' AND m.FechaAsiento < \'' + fechaSql(fechaCompHasta.addDays(1)) + '\')';

        // Resultado del ejercicio pendiente de cierre: neto 6/7 de cada periodo
        // en una sola fila agregada
        Decimal net67A = 0, net67C = 0;
        for (Object o : ejecutar(
            'SELECT ' + sumas(pa, pc)
            + 'FROM dbo.Movimientos m '
            + 'WHERE m.Comentario NOT IN (\'Cierre ejercicio\', \'Cierre contabilidad\') '
            + 'AND m.CodigoEmpresa IN ' + inEmpresas + ' '
            + 'AND (' + pa + ' OR ' + pc + ') '
            + 'AND (m.CodigoCuenta LIKE \'6%\' OR m.CodigoCuenta LIKE \'7%\')')) {
            Map<String, Object> r = (Map<String, Object>) o;
            net67A = importe(r.get('haberA')) - importe(r.get('debeA'));
            net67C = importe(r.get('haberC')) - importe(r.get('debeC'));
        }

        // Saldos por cuenta del resto de grupos, paginados por cursor sobre el
        // código de cuenta para sortear el tope de 500 filas de Skyvia
        List<AccData> accs = new List<AccData>();
        String cursor = '';
        // Ojo: Apex no distingue mayúsculas y la variable no puede llamarse
        // "pagina" o eclipsaría la constante PAGINA
        for (Integer nPag = 0; nPag < 40; nPag++) {
            String filtroCursor = String.isBlank(cursor) ? '' : 'AND m.CodigoCuenta > \'' + cursor + '\' ';
            List<Object> filas = ejecutar(
                'SELECT TOP ' + PAGINA + ' x.cuenta, MAX(p.Cuenta) AS titulo, '
                + 'MAX(x.debeA) AS debeA, MAX(x.haberA) AS haberA, MAX(x.debeC) AS debeC, MAX(x.haberC) AS haberC FROM ('
                + 'SELECT m.CodigoCuenta AS cuenta, ' + sumas(pa, pc)
                + 'FROM dbo.Movimientos m '
                + 'WHERE m.Comentario NOT IN (\'Cierre ejercicio\', \'Cierre contabilidad\') '
                + 'AND m.CodigoEmpresa IN ' + inEmpresas + ' '
                + 'AND (' + pa + ' OR ' + pc + ') '
                + 'AND m.CodigoCuenta NOT LIKE \'6%\' AND m.CodigoCuenta NOT LIKE \'7%\' '
                + filtroCursor
                + 'GROUP BY m.CodigoCuenta'
                + ') x LEFT JOIN dbo.PlanCuentasPGC p ON p.CodigoEmpresa IN ' + inEmpresas + ' AND p.CodigoCuenta = x.cuenta '
                + 'GROUP BY x.cuenta ORDER BY x.cuenta');
            for (Object o : filas) {
                Map<String, Object> r = (Map<String, Object>) o;
                AccData a = new AccData();
                a.codigo = String.valueOf(r.get('cuenta')).trim();
                a.titulo = r.get('titulo') == null ? '' : String.valueOf(r.get('titulo')).trim();
                a.netA = importe(r.get('haberA')) - importe(r.get('debeA'));
                a.netC = importe(r.get('haberC')) - importe(r.get('debeC'));
                accs.add(a);
                cursor = a.codigo;
            }
            if (filas.size() < PAGINA) break;
        }

        return construir(planPGC, accs, net67A, net67C);
    }

    /** Sumatorios Debe/Haber de los dos periodos con CASE condicional */
    private static String sumas(String pa, String pc) {
        return 'SUM(CASE WHEN ' + pa + ' AND m.CargoAbono = \'D\' THEN m.ImporteAsiento ELSE 0 END) AS debeA, '
             + 'SUM(CASE WHEN ' + pa + ' AND m.CargoAbono = \'H\' THEN m.ImporteAsiento ELSE 0 END) AS haberA, '
             + 'SUM(CASE WHEN ' + pc + ' AND m.CargoAbono = \'D\' THEN m.ImporteAsiento ELSE 0 END) AS debeC, '
             + 'SUM(CASE WHEN ' + pc + ' AND m.CargoAbono = \'H\' THEN m.ImporteAsiento ELSE 0 END) AS haberC ';
    }

    private class AccData implements Comparable {
        String codigo; String titulo; Decimal netA; Decimal netC;
        public Integer compareTo(Object o) {
            AccData x = (AccData) o;
            if (this.codigo == x.codigo) return 0;
            return (this.codigo < x.codigo) ? -1 : 1;
        }
    }

    // Valor calculado de una línea (por periodo)
    private class Calc {
        Decimal actual = 0;
        Decimal comparado = 0;
    }

    // ---------------------------------------------------------------------
    //  ESTRUCTURA (misma lógica que BalanceController.construir, con el
    //  código de cuenta como clave en lugar del Id de Salesforce)
    // ---------------------------------------------------------------------
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

        // Cuentas de naturaleza DUAL (p.ej. 551 "c/c con socios"): aparecen tanto
        // en un epígrafe de Activo como de Pasivo. Se imputan a UNA sola banda
        // según el signo de su saldo (deudor -> Activo, acreedor -> Pasivo).
        Set<String> prefActivo = new Set<String>();
        Set<String> prefPasivo = new Set<String>();
        for (BalanceStructure.BalLine l : est) {
            if (!l.esLeaf) continue;
            for (BalanceStructure.BalAccount ba : l.cuentas) {
                if (l.band == 'ACTIVO') prefActivo.add(ba.prefijo); else prefPasivo.add(ba.prefijo);
            }
        }
        Map<String, Boolean> esDual = new Map<String, Boolean>();
        for (AccData a : accs) {
            Boolean inA = false, inP = false;
            for (String p : prefActivo) { if (a.codigo.startsWith(p)) { inA = true; break; } }
            for (String p : prefPasivo) { if (a.codigo.startsWith(p)) { inP = true; break; } }
            esDual.put(a.codigo, inA && inP);
        }

        // calcular hojas + filas de cuenta contable bajo cada hoja
        Map<String, Calc> calc = new Map<String, Calc>();
        Map<String, List<BalRow>> hojaCuentas = new Map<String, List<BalRow>>();
        for (BalanceStructure.BalLine l : est) {
            if (!l.esLeaf) continue;
            Calc c = new Calc();
            Map<String, Decimal> accA = new Map<String, Decimal>();
            Map<String, Decimal> accC = new Map<String, Decimal>();
            Map<String, AccData> accInfo = new Map<String, AccData>();
            Boolean bandActivo = (l.band == 'ACTIVO');
            for (BalanceStructure.BalAccount ba : l.cuentas) {
                for (AccData a : accs) {
                    if (a.codigo.startsWith(ba.prefijo)) {
                        // Cuentas duales: cada periodo se imputa solo a la banda que
                        // corresponde a su signo (deudor->Activo, acreedor->Pasivo).
                        Boolean addA = true, addC = true;
                        if (esDual.get(a.codigo) == true) {
                            addA = bandActivo ? (a.netA < 0) : (a.netA > 0);
                            addC = bandActivo ? (a.netC < 0) : (a.netC > 0);
                        }
                        Decimal vA = addA ? ba.signo * (ba.deudor ? -a.netA : a.netA) : 0;
                        Decimal vC = addC ? ba.signo * (ba.deudor ? -a.netC : a.netC) : 0;
                        if (vA == 0 && vC == 0) continue;
                        c.actual    += vA;
                        c.comparado += vC;
                        accA.put(a.codigo, (accA.containsKey(a.codigo) ? accA.get(a.codigo) : 0) + vA);
                        accC.put(a.codigo, (accC.containsKey(a.codigo) ? accC.get(a.codigo) : 0) + vC);
                        accInfo.put(a.codigo, a);
                    }
                }
            }
            calc.put(l.key, c);

            // filas de cuenta (sólo las que tengan importe en algún periodo), ordenadas por código
            List<AccData> contrib = new List<AccData>();
            for (String cod : accInfo.keySet()) {
                Decimal va = accA.containsKey(cod) ? accA.get(cod) : 0;
                Decimal vc = accC.containsKey(cod) ? accC.get(cod) : 0;
                if (va == 0 && vc == 0) continue;
                contrib.add(accInfo.get(cod));
            }
            contrib.sort();
            List<BalRow> filas = new List<BalRow>();
            for (AccData a : contrib) {
                BalRow cr = new BalRow();
                cr.key = l.key + '__' + a.codigo;
                cr.parentKey = l.key;
                cr.tipo = 'CUENTA';
                cr.nivel = l.nivel + 1;
                cr.band = l.band;
                cr.codigoCuenta = a.codigo;
                cr.concepto = a.titulo;
                cr.valorActual = accA.get(a.codigo);
                cr.valorComparado = accC.get(a.codigo);
                filas.add(cr);
            }
            hojaCuentas.put(l.key, filas);
        }

        // Inyectar el resultado del ejercicio (neto 6/7) en el epígrafe
        // "Ingresos/Gastos pendiente cierre" para que el balance cuadre
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
                }
            }
        }
        calc.put(key, c);
        return c;
    }

    // ---------------------------------------------------------------------
    //  CALLOUT AL ENDPOINT SQL DE SKYVIA
    // ---------------------------------------------------------------------
    private static List<Object> ejecutar(String sql) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(ENDPOINT);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(120000);
        req.setBody(JSON.serialize(new Map<String, String>{ 'sql' => sql }));

        HttpResponse res;
        try {
            res = new Http().send(req);
        } catch (Exception ex) {
            throw new AuraHandledException('No se pudo conectar con la base de datos externa: ' + ex.getMessage());
        }
        if (res.getStatusCode() != 200) {
            throw new AuraHandledException('La consulta externa devolvió el estado ' + res.getStatusCode() + '.');
        }
        Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        if (body.get('data') == null) {
            String msg = (String) body.get('Message');
            throw new AuraHandledException('Error de la consulta SQL externa: ' + (String.isBlank(msg) ? res.getBody() : msg));
        }
        return (List<Object>) body.get('data');
    }

    /** Fecha en formato yyyymmdd: SQL Server la interpreta igual en cualquier idioma */
    private static String fechaSql(Date d) {
        return String.valueOf(d.year())
             + (d.month() < 10 ? '0' : '') + d.month()
             + (d.day()   < 10 ? '0' : '') + d.day();
    }

    private static Decimal importe(Object v) {
        if (v == null) return 0;
        return Decimal.valueOf(String.valueOf(v));
    }
}