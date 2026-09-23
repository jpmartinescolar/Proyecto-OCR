/**
 * Pérdidas y Ganancias sobre la contabilidad externa de Sage 200 (SQL Server),
 * consultada a través del endpoint SQL de Skyvia Connect.
 *
 * Misma estructura de epígrafes del PGC que PyGController (reutiliza
 * PyGStructure), pero los saldos salen de dbo.Movimientos (CargoAbono D/H,
 * ImporteAsiento) en lugar de Linea_asiento_contable__c, y las cuentas se
 * identifican por su código (String) porque no existen como registros de
 * Plan_general_contable__c.
 *
 * Criterios de datos:
 *  - TipoMov = 0 (sin asientos de apertura).
 *  - Se excluye el asiento de cierre (Comentario 'Cierre ejercicio'), que
 *    salda las cuentas 6/7 y dejaría el PyG a cero.
 *  - saldo = Haber - Debe (ingresos positivos, gastos negativos), como en
 *    el PyG de Salesforce.
 */
public with sharing class PyGSqlController {

    private static final String ENDPOINT = 'https://connect.skyvia.com/2v2l1qq7/execute';

    public class EmpresaDTO {
        @AuraEnabled public Integer codigo;
        @AuraEnabled public String  nombre;
    }

    public class PyGSqlRow {
        @AuraEnabled public String  key;
        @AuraEnabled public String  tipo;      // 'SECCION' | 'CUENTA' | 'SUBTOTAL'
        @AuraEnabled public Integer nivel;
        @AuraEnabled public String  codigoCuenta;
        @AuraEnabled public String  concepto;
        @AuraEnabled public Decimal valorActual;
        @AuraEnabled public Decimal valorComparado;
        @AuraEnabled public Decimal porcentajeActual;
        @AuraEnabled public Decimal porcentajeComparado;
        @AuraEnabled public Boolean esGasto;

        public PyGSqlRow() {
            this.valorActual = 0;
            this.valorComparado = 0;
            this.esGasto = false;
        }
    }

    /** Empresas que nunca deben aparecer en los selectores */
    private static final String EMPRESAS_EXCLUIDAS = '(19, 87, 306)';

    /**
     * Empresas de Sage para el filtro. El endpoint de Skyvia devuelve como
     * máximo 500 filas por consulta, así que se pagina por cursor sobre el
     * código de empresa hasta traerlas todas.
     */
    @AuraEnabled
    public static List<EmpresaDTO> getEmpresas() {
        List<EmpresaDTO> out = new List<EmpresaDTO>();
        Integer ultimo = -1;
        for (Integer pagina = 0; pagina < 10; pagina++) {
            List<Object> filas = ejecutar('SELECT TOP 500 CodigoEmpresa, Empresa FROM dbo.Empresas '
                + 'WHERE Empresa IS NOT NULL AND LTRIM(RTRIM(Empresa)) <> \'\' '
                + 'AND CodigoEmpresa NOT IN ' + EMPRESAS_EXCLUIDAS + ' '
                + 'AND CodigoEmpresa > ' + ultimo + ' ORDER BY CodigoEmpresa');
            for (Object o : filas) {
                Map<String, Object> r = (Map<String, Object>) o;
                EmpresaDTO e = new EmpresaDTO();
                e.codigo = Integer.valueOf(String.valueOf(r.get('CodigoEmpresa')));
                e.nombre = String.valueOf(r.get('Empresa'));
                out.add(e);
            }
            if (filas.size() < 500) break;
            ultimo = out[out.size() - 1].codigo;
        }
        // Orden alfabético por nombre
        Map<String, EmpresaDTO> porClave = new Map<String, EmpresaDTO>();
        List<String> claves = new List<String>();
        for (EmpresaDTO e : out) {
            String k = e.nombre + '·' + e.codigo;
            porClave.put(k, e);
            claves.add(k);
        }
        claves.sort();
        List<EmpresaDTO> ordenadas = new List<EmpresaDTO>();
        for (String k : claves) ordenadas.add(porClave.get(k));
        return ordenadas;
    }

    /** Genera el PyG de una o varias empresas Sage con periodo actual y comparativo */
    @AuraEnabled
    public static List<PyGSqlRow> generar(
        List<Integer> codigosEmpresa,
        Date fechaDesde,
        Date fechaHasta,
        Date fechaCompDesde,
        Date fechaCompHasta
    ) {
        if (codigosEmpresa == null || codigosEmpresa.isEmpty()) {
            throw new AuraHandledException('Debes seleccionar al menos una empresa.');
        }
        if (fechaDesde == null || fechaHasta == null || fechaCompDesde == null || fechaCompHasta == null) {
            throw new AuraHandledException('Debes indicar las cuatro fechas (Desde, Hasta, Comparativo desde, Comparativo hasta).');
        }

        // Una sola consulta trae los dos periodos y los títulos: un único viaje HTTP
        Map<String, Decimal> saldoActual    = new Map<String, Decimal>();
        Map<String, Decimal> saldoComparado = new Map<String, Decimal>();
        Map<String, String>  titulos        = new Map<String, String>();
        for (Object o : ejecutar(consultaCombinada(codigosEmpresa, fechaDesde, fechaHasta, fechaCompDesde, fechaCompHasta))) {
            Map<String, Object> r = (Map<String, Object>) o;
            String cuenta = String.valueOf(r.get('cuenta'));
            saldoActual.put(cuenta,    importe(r.get('haberA')) - importe(r.get('debeA')));
            saldoComparado.put(cuenta, importe(r.get('haberC')) - importe(r.get('debeC')));
            titulos.put(cuenta, r.get('titulo') == null ? '' : String.valueOf(r.get('titulo')));
        }

        return construirEstructura(titulos, saldoActual, saldoComparado);
    }

    // ---------------------------------------------------------------------
    //  CONSULTA COMBINADA: saldos del periodo actual y del comparativo por
    //  cuenta (CASE condicional) más el título del plan contable, en un solo
    //  viaje al SQL Server. FechaAsiento es datetime: rangos [desde, hasta+1)
    // ---------------------------------------------------------------------
    private static String consultaCombinada(List<Integer> codigosEmpresa, Date d1, Date d2, Date c1, Date c2) {
        String pa = '(m.FechaAsiento >= \'' + fechaSql(d1) + '\' AND m.FechaAsiento < \'' + fechaSql(d2.addDays(1)) + '\')';
        String pc = '(m.FechaAsiento >= \'' + fechaSql(c1) + '\' AND m.FechaAsiento < \'' + fechaSql(c2.addDays(1)) + '\')';
        // Los códigos de empresa son Integer: la lista IN es segura frente a inyección
        List<String> codigos = new List<String>();
        for (Integer c : codigosEmpresa) {
            if (c != null) codigos.add(String.valueOf(c));
        }
        String inEmpresas = '(' + String.join(codigos, ',') + ')';
        // Se agrega primero y el título se une después sobre el resultado (pocas filas)
        return 'SELECT x.cuenta, MAX(p.Cuenta) AS titulo, MAX(x.debeA) AS debeA, MAX(x.haberA) AS haberA, '
             + 'MAX(x.debeC) AS debeC, MAX(x.haberC) AS haberC FROM ('
             + 'SELECT m.CodigoCuenta AS cuenta, '
             + 'SUM(CASE WHEN ' + pa + ' AND m.CargoAbono = \'D\' THEN m.ImporteAsiento ELSE 0 END) AS debeA, '
             + 'SUM(CASE WHEN ' + pa + ' AND m.CargoAbono = \'H\' THEN m.ImporteAsiento ELSE 0 END) AS haberA, '
             + 'SUM(CASE WHEN ' + pc + ' AND m.CargoAbono = \'D\' THEN m.ImporteAsiento ELSE 0 END) AS debeC, '
             + 'SUM(CASE WHEN ' + pc + ' AND m.CargoAbono = \'H\' THEN m.ImporteAsiento ELSE 0 END) AS haberC '
             + 'FROM dbo.Movimientos m '
             + 'WHERE m.TipoMov = 0 '
             + 'AND m.Comentario <> \'Cierre ejercicio\' '
             + 'AND m.CodigoEmpresa IN ' + inEmpresas + ' '
             + 'AND (' + pa + ' OR ' + pc + ') '
             + 'AND (m.CodigoCuenta LIKE \'6%\' OR m.CodigoCuenta LIKE \'7%\') '
             + 'GROUP BY m.CodigoCuenta'
             + ') x LEFT JOIN dbo.PlanCuentasPGC p ON p.CodigoEmpresa IN ' + inEmpresas + ' AND p.CodigoCuenta = x.cuenta '
             + 'GROUP BY x.cuenta';
    }

    // ---------------------------------------------------------------------
    //  ESTRUCTURA (misma lógica que PyGController.construirEstructura,
    //  con el código de cuenta como clave en lugar del Id de Salesforce)
    // ---------------------------------------------------------------------
    private static List<PyGSqlRow> construirEstructura(
        Map<String, String> titulos,
        Map<String, Decimal> saldoActual,
        Map<String, Decimal> saldoComparado
    ) {
        List<PyGStructure.PyGSection> secciones = PyGStructure.estructura('PGC PYMES');

        Map<String, List<CuentaConSaldos>> seccionToCuentas = new Map<String, List<CuentaConSaldos>>();
        for (PyGStructure.PyGSection s : secciones) seccionToCuentas.put(s.key, new List<CuentaConSaldos>());

        Set<String> codigos = new Set<String>();
        codigos.addAll(saldoActual.keySet());
        codigos.addAll(saldoComparado.keySet());

        for (String codigo : codigos) {
            String secKey = PyGStructure.matchSeccion(codigo, secciones);
            if (secKey == null) continue;
            CuentaConSaldos cs = new CuentaConSaldos();
            cs.codigo = codigo;
            cs.titulo = titulos.containsKey(codigo) ? titulos.get(codigo) : '';
            cs.actual = saldoActual.get(codigo);
            cs.comparado = saldoComparado.get(codigo);
            seccionToCuentas.get(secKey).add(cs);
        }

        for (String k : seccionToCuentas.keySet()) seccionToCuentas.get(k).sort();

        List<PyGSqlRow> rows = new List<PyGSqlRow>();

        Decimal CNa = 0, CNc = 0;
        Decimal explA = 0, explC = 0;
        Decimal finA  = 0, finC  = 0;
        Decimal impA  = 0, impC  = 0;

        for (PyGStructure.PyGSection sec : secciones) {
            if (sec.esSubtotal) {
                PyGSqlRow r = new PyGSqlRow();
                r.key = sec.key;
                r.tipo = 'SUBTOTAL';
                r.nivel = 0;
                r.concepto = sec.label;
                Decimal a = 0, c = 0;
                if (sec.key == 'A1')      { a = explA; c = explC; }
                else if (sec.key == 'A2') { a = finA;  c = finC;  }
                else if (sec.key == 'A3') { a = explA + finA; c = explC + finC; }
                // Los saldos van con signo (Haber−Debe): el impuesto se SUMA
                else if (sec.key == 'A4') { a = explA + finA + impA; c = explC + finC + impC; }
                r.valorActual = a;
                r.valorComparado = c;
                if (CNa != 0) r.porcentajeActual    = (a / CNa) * 100;
                if (CNc != 0) r.porcentajeComparado = (c / CNc) * 100;
                rows.add(r);
                continue;
            }

            PyGSqlRow header = new PyGSqlRow();
            header.key = sec.key;
            header.tipo = 'SECCION';
            header.nivel = 0;
            header.concepto = sec.label;
            header.esGasto = sec.signo == -1;

            List<CuentaConSaldos> cuentas = seccionToCuentas.get(sec.key);
            Decimal totalA = 0, totalC = 0;
            for (CuentaConSaldos cs : cuentas) {
                totalA += (cs.actual    == null) ? 0 : cs.actual;
                totalC += (cs.comparado == null) ? 0 : cs.comparado;
            }
            header.valorActual = totalA;
            header.valorComparado = totalC;
            rows.add(header);

            if (sec.bucket == 'EXPL')      { explA += totalA; explC += totalC; }
            else if (sec.bucket == 'FIN')  { finA  += totalA; finC  += totalC; }
            else if (sec.bucket == 'IMP')  { impA  += totalA; impC  += totalC; }
            if (sec.esCN) { CNa += totalA; CNc += totalC; }

            for (CuentaConSaldos cs : cuentas) {
                PyGSqlRow cr = new PyGSqlRow();
                cr.key = sec.key + '_' + cs.codigo;
                cr.tipo = 'CUENTA';
                cr.nivel = 1;
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