/**
 * Pérdidas y Ganancias mensual sobre la contabilidad externa de Sage
 * (SQL Server vía Skyvia): el PyG de un ejercicio concreto desglosado en
 * 12 columnas, una por mes, más el total anual.
 *
 * Misma estructura de epígrafes y criterios que PyGSqlController (TipoMov 0,
 * sin asiento de cierre, saldo = Haber − Debe); la consulta agrupa por cuenta
 * con un par de sumas condicionales por mes para traerlo todo en un viaje.
 */
public with sharing class PyGSqlMensualController {

    private static final String ENDPOINT = 'https://connect.skyvia.com/2v2l1qq7/execute';

    public class FilaDTO {
        @AuraEnabled public String  key;
        @AuraEnabled public String  tipo;      // 'SECCION' | 'CUENTA' | 'SUBTOTAL'
        @AuraEnabled public Integer nivel;
        @AuraEnabled public String  codigoCuenta;
        @AuraEnabled public String  concepto;
        @AuraEnabled public List<Decimal> meses;
        @AuraEnabled public Decimal total;
        @AuraEnabled public Boolean esGasto;

        public FilaDTO() {
            this.meses = ceros();
            this.total = 0;
            this.esGasto = false;
        }
    }

    /** PyG por meses de un ejercicio para una o varias empresas de Sage */
    @AuraEnabled
    public static List<FilaDTO> generar(List<Integer> codigosEmpresa, Integer anio) {
        if (codigosEmpresa == null || codigosEmpresa.isEmpty()) {
            throw new AuraHandledException('Debes seleccionar al menos una empresa.');
        }
        if (anio == null || anio < 1990 || anio > 2100) {
            throw new AuraHandledException('Debes indicar el ejercicio.');
        }

        Map<String, List<Decimal>> saldos = new Map<String, List<Decimal>>();
        Map<String, String> titulos = new Map<String, String>();
        for (Object o : ejecutar(consultaMensual(codigosEmpresa, anio))) {
            Map<String, Object> r = (Map<String, Object>) o;
            String cuenta = String.valueOf(r.get('cuenta'));
            List<Decimal> meses = ceros();
            for (Integer m = 1; m <= 12; m++) {
                meses[m - 1] = importe(r.get('h' + m)) - importe(r.get('d' + m));
            }
            saldos.put(cuenta, meses);
            titulos.put(cuenta, r.get('titulo') == null ? '' : String.valueOf(r.get('titulo')));
        }

        return construirEstructura(titulos, saldos);
    }

    // ---------------------------------------------------------------------
    //  CONSULTA: un par de sumas condicionales Debe/Haber por mes y cuenta
    // ---------------------------------------------------------------------
    private static String consultaMensual(List<Integer> codigosEmpresa, Integer anio) {
        List<String> codigos = new List<String>();
        for (Integer c : codigosEmpresa) {
            if (c != null) codigos.add(String.valueOf(c));
        }
        String inEmpresas = '(' + String.join(codigos, ',') + ')';

        List<String> sumas = new List<String>();
        List<String> maximos = new List<String>();
        for (Integer m = 1; m <= 12; m++) {
            sumas.add('SUM(CASE WHEN MONTH(m.FechaAsiento) = ' + m
                + ' AND m.CargoAbono = \'D\' THEN m.ImporteAsiento ELSE 0 END) AS d' + m);
            sumas.add('SUM(CASE WHEN MONTH(m.FechaAsiento) = ' + m
                + ' AND m.CargoAbono = \'H\' THEN m.ImporteAsiento ELSE 0 END) AS h' + m);
            maximos.add('MAX(x.d' + m + ') AS d' + m);
            maximos.add('MAX(x.h' + m + ') AS h' + m);
        }

        return 'SELECT x.cuenta, MAX(p.Cuenta) AS titulo, ' + String.join(maximos, ', ') + ' FROM ('
             + 'SELECT m.CodigoCuenta AS cuenta, ' + String.join(sumas, ', ') + ' '
             + 'FROM dbo.Movimientos m '
             + 'WHERE m.TipoMov = 0 '
             + 'AND m.Comentario <> \'Cierre ejercicio\' '
             + 'AND m.CodigoEmpresa IN ' + inEmpresas + ' '
             + 'AND m.FechaAsiento >= \'' + anio + '0101\' AND m.FechaAsiento < \'' + (anio + 1) + '0101\' '
             + 'AND (m.CodigoCuenta LIKE \'6%\' OR m.CodigoCuenta LIKE \'7%\') '
             + 'GROUP BY m.CodigoCuenta'
             + ') x LEFT JOIN dbo.PlanCuentasPGC p ON p.CodigoEmpresa IN ' + inEmpresas + ' AND p.CodigoCuenta = x.cuenta '
             + 'GROUP BY x.cuenta';
    }

    // ---------------------------------------------------------------------
    //  ESTRUCTURA: misma lógica que PyGSqlController con importes por mes
    // ---------------------------------------------------------------------
    private static List<FilaDTO> construirEstructura(Map<String, String> titulos, Map<String, List<Decimal>> saldos) {
        List<PyGStructure.PyGSection> secciones = PyGStructure.estructura('PGC PYMES');

        Map<String, List<CuentaMensual>> seccionToCuentas = new Map<String, List<CuentaMensual>>();
        for (PyGStructure.PyGSection s : secciones) seccionToCuentas.put(s.key, new List<CuentaMensual>());

        for (String codigo : saldos.keySet()) {
            String secKey = PyGStructure.matchSeccion(codigo, secciones);
            if (secKey == null) continue;
            CuentaMensual cm = new CuentaMensual();
            cm.codigo = codigo;
            cm.titulo = titulos.containsKey(codigo) ? titulos.get(codigo) : '';
            cm.meses = saldos.get(codigo);
            seccionToCuentas.get(secKey).add(cm);
        }
        for (String k : seccionToCuentas.keySet()) seccionToCuentas.get(k).sort();

        List<FilaDTO> rows = new List<FilaDTO>();
        List<Decimal> expl = ceros();
        List<Decimal> fin  = ceros();
        List<Decimal> imp  = ceros();

        for (PyGStructure.PyGSection sec : secciones) {
            if (sec.esSubtotal) {
                FilaDTO r = new FilaDTO();
                r.key = sec.key;
                r.tipo = 'SUBTOTAL';
                r.nivel = 0;
                r.concepto = sec.label;
                for (Integer m = 0; m < 12; m++) {
                    if (sec.key == 'A1')      r.meses[m] = expl[m];
                    else if (sec.key == 'A2') r.meses[m] = fin[m];
                    else if (sec.key == 'A3') r.meses[m] = expl[m] + fin[m];
                    // Saldos con signo (Haber−Debe): el impuesto se SUMA
                    else if (sec.key == 'A4') r.meses[m] = expl[m] + fin[m] + imp[m];
                }
                r.total = suma(r.meses);
                rows.add(r);
                continue;
            }

            FilaDTO header = new FilaDTO();
            header.key = sec.key;
            header.tipo = 'SECCION';
            header.nivel = 0;
            header.concepto = sec.label;
            header.esGasto = sec.signo == -1;

            List<CuentaMensual> cuentas = seccionToCuentas.get(sec.key);
            for (CuentaMensual cm : cuentas) {
                for (Integer m = 0; m < 12; m++) {
                    header.meses[m] += cm.meses[m] == null ? 0 : cm.meses[m];
                }
            }
            header.total = suma(header.meses);
            rows.add(header);

            for (Integer m = 0; m < 12; m++) {
                if (sec.bucket == 'EXPL')     expl[m] += header.meses[m];
                else if (sec.bucket == 'FIN') fin[m]  += header.meses[m];
                else if (sec.bucket == 'IMP') imp[m]  += header.meses[m];
            }

            for (CuentaMensual cm : cuentas) {
                FilaDTO cr = new FilaDTO();
                cr.key = sec.key + '_' + cm.codigo;
                cr.tipo = 'CUENTA';
                cr.nivel = 1;
                cr.codigoCuenta = cm.codigo;
                cr.concepto = cm.titulo;
                cr.esGasto = cm.codigo.startsWith('6');
                cr.meses = cm.meses;
                cr.total = suma(cm.meses);
                rows.add(cr);
            }
        }
        return rows;
    }

    public class CuentaMensual implements Comparable {
        public String codigo;
        public String titulo;
        public List<Decimal> meses;
        public Integer compareTo(Object other) {
            CuentaMensual o = (CuentaMensual) other;
            if (this.codigo == o.codigo) return 0;
            return (this.codigo < o.codigo) ? -1 : 1;
        }
    }

    private static List<Decimal> ceros() {
        return new List<Decimal>{ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
    }

    private static Decimal suma(List<Decimal> meses) {
        Decimal t = 0;
        for (Decimal v : meses) t += v == null ? 0 : v;
        return t;
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

    private static Decimal importe(Object v) {
        if (v == null) return 0;
        return Decimal.valueOf(String.valueOf(v));
    }
}