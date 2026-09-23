/**
 * Plan General Contable de la contabilidad externa de Sage 200 (SQL Server),
 * consultado a través del endpoint SQL de Skyvia Connect.
 *
 * Lista la tabla completa del plan de la empresa (dbo.PlanCuentasPGC), tenga
 * o no movimientos cada cuenta, enriquecida con el CIF y el código postal del
 * cliente o proveedor asociado (dbo.ClientesConta + dbo.Clientes/Proveedores).
 * El plan puede superar las 16.000 cuentas por empresa: se sirve por páginas
 * de 500 con cursor sobre el código y búsqueda por código o título.
 */
public with sharing class PlanGeneralSqlController {

    private static final String ENDPOINT = 'https://connect.skyvia.com/2v2l1qq7/execute';

    /** Tamaño de página (tope de filas por consulta del endpoint) */
    public static final Integer PAGINA = 500;

    public class CuentaPlanDTO {
        @AuraEnabled public String codigo;
        @AuraEnabled public String titulo;
        @AuraEnabled public String cif;
        @AuraEnabled public String codigoPostal;
    }

    /**
     * Página del plan de la empresa que casa con la búsqueda (código o título).
     * desdeCodigo pagina por cursor: devuelve las cuentas siguientes a ese código.
     */
    @AuraEnabled
    public static List<CuentaPlanDTO> getCuentas(Integer codigoEmpresa, String texto, String desdeCodigo) {
        if (codigoEmpresa == null) throw new AuraHandledException('Debes seleccionar una empresa.');
        String t = sane(texto);
        // Algunos códigos del plan llegan con espacios o tabuladores por
        // delante: se normalizan para ordenar y paginar bien (ojo: LTRIM de
        // SQL Server solo quita espacios, el tabulador hay que reemplazarlo)
        String cta = 'LTRIM(RTRIM(REPLACE(p.CodigoCuenta, CHAR(9), \'\')))';
        String filtro = String.isBlank(t) ? ''
            : 'AND (' + cta + ' LIKE \'' + t + '%\' OR UPPER(p.Cuenta) LIKE \'%' + t.toUpperCase() + '%\') ';
        String desde = sane(desdeCodigo);
        String cursor = String.isBlank(desde) ? '' : 'AND ' + cta + ' > \'' + desde + '\' ';

        List<CuentaPlanDTO> out = new List<CuentaPlanDTO>();
        for (Object o : ejecutar(
            'SELECT TOP ' + PAGINA + ' ' + cta + ' AS cuenta, MAX(p.Cuenta) AS titulo, '
            + 'MAX(cc.CifDni) AS cif, MAX(COALESCE(cli.CodigoPostal, prov.CodigoPostal)) AS cp '
            + 'FROM dbo.PlanCuentasPGC p '
            + 'LEFT JOIN dbo.ClientesConta cc ON cc.CodigoEmpresa = p.CodigoEmpresa AND cc.CodigoCuenta = p.CodigoCuenta '
            + 'LEFT JOIN dbo.Clientes cli ON cli.CodigoEmpresa = cc.CodigoEmpresa '
            + 'AND cli.CodigoCliente = cc.CodigoClienteProveedor AND cc.ClienteOproveedor = \'C\' '
            + 'LEFT JOIN dbo.Proveedores prov ON prov.CodigoEmpresa = cc.CodigoEmpresa '
            + 'AND prov.CodigoProveedor = cc.CodigoClienteProveedor AND cc.ClienteOproveedor = \'P\' '
            + 'WHERE p.CodigoEmpresa = ' + codigoEmpresa + ' ' + filtro + cursor
            + 'GROUP BY ' + cta + ' ORDER BY ' + cta)) {
            Map<String, Object> r = (Map<String, Object>) o;
            CuentaPlanDTO c = new CuentaPlanDTO();
            c.codigo = String.valueOf(r.get('cuenta')).trim();
            c.titulo = r.get('titulo') == null ? '' : String.valueOf(r.get('titulo')).trim();
            c.cif = r.get('cif') == null ? '' : String.valueOf(r.get('cif')).trim();
            c.codigoPostal = r.get('cp') == null ? '' : String.valueOf(r.get('cp')).trim();
            out.add(c);
        }
        return out;
    }

    /** Solo se admiten letras y números en los literales que viajan al SQL */
    @TestVisible
    private static String sane(String s) {
        if (s == null) return '';
        return s.replaceAll('[^0-9A-Za-zÁÉÍÓÚÑáéíóúñ ]', '').trim();
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
}