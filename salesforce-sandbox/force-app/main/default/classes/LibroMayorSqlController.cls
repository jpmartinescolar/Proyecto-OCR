/**
 * Libro mayor simplificado sobre la contabilidad externa de Sage 200,
 * consultada a través del endpoint SQL de Skyvia Connect (mismo conector
 * que PyGSqlController).
 *
 * Criterios de datos:
 *  - Se excluyen los asientos de cierre (Comentarios 'Cierre ejercicio' y
 *    'Cierre contabilidad', que saldan las cuentas del ejercicio cerrado).
 *  - Se incluyen los asientos de apertura para que el saldo sea real.
 *  - saldo = Debe - Haber (criterio clásico del libro mayor).
 */
public with sharing class LibroMayorSqlController {

    private static final String ENDPOINT = 'https://connect.skyvia.com/2v2l1qq7/execute';

    public class CuentaDTO {
        @AuraEnabled public String codigo;
        @AuraEnabled public String titulo;
    }

    public class MovDTO {
        @AuraEnabled public Date    fecha;
        @AuraEnabled public String  descripcion;
        @AuraEnabled public Decimal debe = 0;
        @AuraEnabled public Decimal haber = 0;
    }

    public class MayorDTO {
        @AuraEnabled public String  codigoCuenta;
        @AuraEnabled public String  titulo;
        @AuraEnabled public String  cuentaAnterior;
        @AuraEnabled public String  cuentaSiguiente;
        @AuraEnabled public Integer posicion = 0;
        @AuraEnabled public Integer totalCuentas = 0;
        @AuraEnabled public List<MovDTO> movimientos;
    }

    /** Tamaño de página del desplegable de cuentas (scroll infinito) */
    public static final Integer PAGINA_CUENTAS = 200;

    /**
     * Cuentas CON MOVIMIENTOS de la empresa que casan por código o por nombre
     * (el plan completo de Sage tiene ~200.000 cuentas por empresa y no se
     * puede precargar entero; las que tienen movimientos son las útiles).
     * desdeCodigo pagina por cursor: devuelve las siguientes a ese código.
     */
    @AuraEnabled
    public static List<CuentaDTO> buscarCuentas(Integer codigoEmpresa, String texto, String desdeCodigo) {
        if (codigoEmpresa == null) throw new AuraHandledException('Debes seleccionar una empresa.');
        String t = sane(texto);
        String filtro = String.isBlank(t) ? ''
            : 'AND (m.CodigoCuenta LIKE \'' + t + '%\' OR UPPER(p.Cuenta) LIKE \'%' + t.toUpperCase() + '%\') ';
        String desde = sane(desdeCodigo);
        String cursor = String.isBlank(desde) ? '' : 'AND m.CodigoCuenta > \'' + desde + '\' ';
        List<CuentaDTO> out = new List<CuentaDTO>();
        Set<String> vistos = new Set<String>();
        for (Object o : ejecutar(
            'SELECT TOP ' + PAGINA_CUENTAS + ' m.CodigoCuenta AS codigo, MAX(p.Cuenta) AS titulo '
            + 'FROM dbo.Movimientos m '
            + 'LEFT JOIN dbo.PlanCuentasPGC p ON p.CodigoEmpresa = ' + codigoEmpresa
            + ' AND p.CodigoCuenta = m.CodigoCuenta '
            + 'WHERE m.CodigoEmpresa = ' + codigoEmpresa + ' ' + filtro + cursor
            + 'GROUP BY m.CodigoCuenta ORDER BY m.CodigoCuenta')) {
            Map<String, Object> r = (Map<String, Object>) o;
            // Los códigos llegan con relleno de espacios: se limpian y dedupean
            String codigo = String.valueOf(r.get('codigo')).trim();
            if (vistos.contains(codigo)) continue;
            vistos.add(codigo);
            CuentaDTO c = new CuentaDTO();
            c.codigo = codigo;
            c.titulo = r.get('titulo') == null ? '' : String.valueOf(r.get('titulo')).trim();
            out.add(c);
        }
        return out;
    }

    /**
     * Movimientos de la cuenta en el periodo más su título, saldo anterior y
     * cuentas vecinas. Con soloConMovimientos, las vecinas y el recuento solo
     * consideran cuentas con movimientos dentro del periodo.
     */
    @AuraEnabled
    public static MayorDTO getMayor(Integer codigoEmpresa, String codigoCuenta, Date fechaDesde, Date fechaHasta,
                                    Boolean soloConMovimientos) {
        return obtenerMayor(codigoEmpresa, codigoCuenta, fechaDesde, fechaHasta, null, null, soloConMovimientos);
    }

    /**
     * Variante ligera para navegar entre cuentas. La posición y el total ya
     * se calcularon al abrir la primera cuenta, por lo que no se repiten los
     * dos COUNT(DISTINCT) sobre todo el histórico en cada pulsación.
     */
    @AuraEnabled
    public static MayorDTO getMayorNavegacion(
        Integer codigoEmpresa,
        String codigoCuenta,
        Date fechaDesde,
        Date fechaHasta,
        Integer posicion,
        Integer totalCuentas,
        Boolean soloConMovimientos
    ) {
        if (posicion == null || posicion < 1 || totalCuentas == null || totalCuentas < 1) {
            return obtenerMayor(codigoEmpresa, codigoCuenta, fechaDesde, fechaHasta, null, null, soloConMovimientos);
        }
        return obtenerMayor(codigoEmpresa, codigoCuenta, fechaDesde, fechaHasta, posicion, totalCuentas, soloConMovimientos);
    }

    private static MayorDTO obtenerMayor(
        Integer codigoEmpresa,
        String codigoCuenta,
        Date fechaDesde,
        Date fechaHasta,
        Integer posicionConocida,
        Integer totalConocido,
        Boolean soloConMovimientos
    ) {
        if (codigoEmpresa == null || String.isBlank(codigoCuenta)) {
            throw new AuraHandledException('Debes seleccionar una empresa y una cuenta contable.');
        }
        if (fechaDesde == null || fechaHasta == null) {
            throw new AuraHandledException('Debes indicar el periodo (Desde y Hasta).');
        }
        String cta = sane(codigoCuenta);

        MayorDTO out = new MayorDTO();
        out.codigoCuenta = cta;
        out.movimientos = new List<MovDTO>();

        // Con el check activo, vecinas y recuento solo miran movimientos del
        // periodo (mismos criterios que el listado: sin los asientos de cierre)
        String filtroMovs = soloConMovimientos == true
            ? ' AND m.Comentario NOT IN (\'Cierre ejercicio\', \'Cierre contabilidad\')'
                + ' AND m.FechaAsiento >= \'' + fechaSql(fechaDesde) + '\''
                + ' AND m.FechaAsiento < \'' + fechaSql(fechaHasta.addDays(1)) + '\''
            : '';

        Boolean navegacion = posicionConocida != null && totalConocido != null;
        String sqlPosicion = navegacion
            ? String.valueOf(posicionConocida)
            : '(SELECT COUNT(DISTINCT m.CodigoCuenta) FROM dbo.Movimientos m WHERE m.CodigoEmpresa = '
                + codigoEmpresa + ' AND m.CodigoCuenta <= \'' + cta + '\'' + filtroMovs + ')';
        String sqlTotal = navegacion
            ? String.valueOf(totalConocido)
            : '(SELECT COUNT(DISTINCT m.CodigoCuenta) FROM dbo.Movimientos m WHERE m.CodigoEmpresa = '
                + codigoEmpresa + filtroMovs + ')';

        // Un ÚNICO viaje al SQL: la latencia del conector (~1,2 s por petición)
        // domina el tiempo total, así que metadatos y movimientos van juntos en
        // una sola consulta (fila 'META' + filas 'MOV' vía UNION ALL).
        // El saldo arranca de cero: el asiento de apertura del ejercicio ya lo trae.
        String sql =
            'SELECT \'META\' AS tipo, CAST(NULL AS datetime) AS fecha, '
            + '(SELECT MAX(p.Cuenta) FROM dbo.PlanCuentasPGC p WHERE p.CodigoEmpresa = ' + codigoEmpresa
            + ' AND p.CodigoCuenta = \'' + cta + '\') AS texto, '
            + 'CAST(NULL AS varchar(1)) AS ca, CAST(NULL AS decimal(18,4)) AS imp, '
            + '(SELECT MAX(m.CodigoCuenta) FROM dbo.Movimientos m WHERE m.CodigoEmpresa = ' + codigoEmpresa
            + ' AND m.CodigoCuenta < \'' + cta + '\'' + filtroMovs + ') AS ant, '
            + '(SELECT MIN(m.CodigoCuenta) FROM dbo.Movimientos m WHERE m.CodigoEmpresa = ' + codigoEmpresa
            + ' AND m.CodigoCuenta > \'' + cta + '\'' + filtroMovs + ') AS sig, '
            + sqlPosicion + ' AS pos, '
            + sqlTotal + ' AS total '
            + 'UNION ALL '
            + 'SELECT TOP 2000 \'MOV\', m.FechaAsiento, m.Comentario, m.CargoAbono, m.ImporteAsiento, NULL, NULL, NULL, NULL '
            + 'FROM dbo.Movimientos m '
            + 'WHERE m.CodigoEmpresa = ' + codigoEmpresa + ' AND m.CodigoCuenta = \'' + cta + '\' '
            + 'AND m.Comentario NOT IN (\'Cierre ejercicio\', \'Cierre contabilidad\') '
            + 'AND m.FechaAsiento >= \'' + fechaSql(fechaDesde) + '\' '
            + 'AND m.FechaAsiento < \'' + fechaSql(fechaHasta.addDays(1)) + '\' '
            + 'ORDER BY tipo, fecha';

        for (Object o : ejecutar(sql)) {
            Map<String, Object> r = (Map<String, Object>) o;
            if (String.valueOf(r.get('tipo')) == 'META') {
                out.titulo = r.get('texto') == null ? '' : String.valueOf(r.get('texto')).trim();
                out.cuentaAnterior = r.get('ant') == null ? null : String.valueOf(r.get('ant')).trim();
                out.cuentaSiguiente = r.get('sig') == null ? null : String.valueOf(r.get('sig')).trim();
                out.posicion = r.get('pos') == null ? 0 : Integer.valueOf(String.valueOf(r.get('pos')));
                out.totalCuentas = r.get('total') == null ? 0 : Integer.valueOf(String.valueOf(r.get('total')));
                continue;
            }
            MovDTO m = new MovDTO();
            m.fecha = fechaDe(r.get('fecha'));
            m.descripcion = r.get('texto') == null ? '' : String.valueOf(r.get('texto'));
            Decimal imp = importe(r.get('imp'));
            if (String.valueOf(r.get('ca')) == 'D') m.debe = imp; else m.haber = imp;
            out.movimientos.add(m);
        }
        return out;
    }

    /** Solo se admiten letras y números en los literales que viajan al SQL */
    @TestVisible
    private static String sane(String s) {
        if (s == null) return '';
        return s.replaceAll('[^0-9A-Za-zÁÉÍÓÚÑáéíóúñ ]', '').trim();
    }

    private static Date fechaDe(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v);
        // Llega como '2026-08-03T00:00:00' o '2026-08-03 00:00:00'
        return Date.valueOf(s.substring(0, 10).replace('T', ' '));
    }

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