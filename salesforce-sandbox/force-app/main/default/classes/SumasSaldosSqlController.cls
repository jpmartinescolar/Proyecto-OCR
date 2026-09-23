/**
 * Sumas y Saldos sobre la contabilidad externa de Sage 200 (SQL Server),
 * consultada a través del endpoint SQL de Skyvia Connect (mismo conector que
 * los demás componentes del ERP).
 *
 * Criterios de datos (mismos que el Libro mayor):
 *  - Se incluyen los asientos de apertura (aportan el saldo inicial).
 *  - Se excluyen los asientos de cierre ('Cierre ejercicio' y 'Cierre
 *    contabilidad'), que saldarían las cuentas del ejercicio cerrado.
 *  - saldo = Debe - Haber (criterio clásico del mayor).
 */
public with sharing class SumasSaldosSqlController {

    private static final String ENDPOINT = 'https://connect.skyvia.com/2v2l1qq7/execute';

    /** Skyvia devuelve como máximo 500 filas por consulta: se pagina por cursor */
    private static final Integer PAGINA = 500;

    public class CuentaSaldoDTO {
        @AuraEnabled public String  codigo;
        @AuraEnabled public String  titulo;
        @AuraEnabled public Decimal debe = 0;
        @AuraEnabled public Decimal haber = 0;
        @AuraEnabled public Decimal saldo = 0;
    }

    /** Sumas y saldos de todas las cuentas con movimientos de la empresa en el periodo */
    @AuraEnabled
    public static List<CuentaSaldoDTO> getSumasSaldos(Integer codigoEmpresa, Date fechaDesde, Date fechaHasta) {
        if (codigoEmpresa == null) {
            throw new AuraHandledException('Debes seleccionar una empresa.');
        }
        if (fechaDesde == null || fechaHasta == null) {
            throw new AuraHandledException('Debes indicar el periodo (Desde y Hasta).');
        }

        List<CuentaSaldoDTO> out = new List<CuentaSaldoDTO>();
        String cursor = '';
        for (Integer nPag = 0; nPag < 40; nPag++) {
            String filtroCursor = String.isBlank(cursor) ? '' : 'AND m.CodigoCuenta > \'' + cursor + '\' ';
            List<Object> filas = ejecutar(
                'SELECT TOP ' + PAGINA + ' x.cuenta, MAX(p.Cuenta) AS titulo, MAX(x.debe) AS debe, MAX(x.haber) AS haber FROM ('
                + 'SELECT m.CodigoCuenta AS cuenta, '
                + 'SUM(CASE WHEN m.CargoAbono = \'D\' THEN m.ImporteAsiento ELSE 0 END) AS debe, '
                + 'SUM(CASE WHEN m.CargoAbono = \'H\' THEN m.ImporteAsiento ELSE 0 END) AS haber '
                + 'FROM dbo.Movimientos m '
                + 'WHERE m.CodigoEmpresa = ' + codigoEmpresa + ' '
                + 'AND m.Comentario NOT IN (\'Cierre ejercicio\', \'Cierre contabilidad\') '
                + 'AND m.FechaAsiento >= \'' + fechaSql(fechaDesde) + '\' '
                + 'AND m.FechaAsiento < \'' + fechaSql(fechaHasta.addDays(1)) + '\' '
                + filtroCursor
                + 'GROUP BY m.CodigoCuenta'
                + ') x LEFT JOIN dbo.PlanCuentasPGC p ON p.CodigoEmpresa = ' + codigoEmpresa + ' AND p.CodigoCuenta = x.cuenta '
                + 'GROUP BY x.cuenta ORDER BY x.cuenta');
            for (Object o : filas) {
                Map<String, Object> r = (Map<String, Object>) o;
                CuentaSaldoDTO c = new CuentaSaldoDTO();
                c.codigo = String.valueOf(r.get('cuenta')).trim();
                c.titulo = r.get('titulo') == null ? '' : String.valueOf(r.get('titulo')).trim();
                c.debe = importe(r.get('debe'));
                c.haber = importe(r.get('haber'));
                c.saldo = c.debe - c.haber;
                out.add(c);
                cursor = c.codigo;
            }
            if (filas.size() < PAGINA) break;
        }
        return out;
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