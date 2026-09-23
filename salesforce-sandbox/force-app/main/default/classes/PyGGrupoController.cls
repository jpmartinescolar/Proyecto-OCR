/**
 * Controller de "Pérdidas y Ganancias grupo".
 * Reutiliza PyGController.generar() llamándolo una vez por empresa titular
 * (para el desglose por empresa) y otra con todas (columna "Total grupo").
 * Como todas las llamadas usan el mismo planPGC, la estructura (secciones,
 * subtotales, %) coincide y las filas se alinean por su 'key'.
 */
public with sharing class PyGGrupoController {

    public class GrupoCell {
        @AuraEnabled public Decimal actual;
        @AuraEnabled public Decimal comparado;
        @AuraEnabled public Decimal pctActual;
        @AuraEnabled public Decimal pctComparado;
    }

    public class GrupoRow {
        @AuraEnabled public String key;
        @AuraEnabled public String tipo;            // SECCION | CUENTA | SUBTOTAL
        @AuraEnabled public String concepto;
        @AuraEnabled public String codigoCuenta;
        @AuraEnabled public Id     cuentaId;
        @AuraEnabled public List<Id> cuentaIds;
        @AuraEnabled public List<GrupoCell> empresas;   // una celda por empresa (mismo orden que res.empresas)
        @AuraEnabled public GrupoCell total;            // suma del grupo
    }

    public class GrupoResult {
        @AuraEnabled public List<String> empresas;      // nombres en orden
        @AuraEnabled public List<GrupoRow> rows;
    }

    @AuraEnabled
    public static GrupoResult generarGrupo(
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

        GrupoResult res = new GrupoResult();
        res.empresas = empresasTitulares;

        // Filas por empresa (clave -> PyGRow)
        List<Map<String, PyGController.PyGRow>> perEmpresa = new List<Map<String, PyGController.PyGRow>>();
        for (String emp : empresasTitulares) {
            List<PyGController.PyGRow> filas = PyGController.generar(
                new List<String>{ emp }, area, directorFacturacionId,
                fechaDesde, fechaHasta, fechaCompDesde, fechaCompHasta,
                planPGC, simulacion, extraordinarios, check
            );
            Map<String, PyGController.PyGRow> m = new Map<String, PyGController.PyGRow>();
            for (PyGController.PyGRow r : filas) m.put(r.key, r);
            perEmpresa.add(m);
        }

        // Total del grupo (todas las empresas) — define también la estructura/orden
        List<PyGController.PyGRow> totalRows = PyGController.generar(
            empresasTitulares, area, directorFacturacionId,
            fechaDesde, fechaHasta, fechaCompDesde, fechaCompHasta,
            planPGC, simulacion, extraordinarios, check
        );

        res.rows = new List<GrupoRow>();
        for (PyGController.PyGRow tr : totalRows) {
            GrupoRow gr = new GrupoRow();
            gr.key          = tr.key;
            gr.tipo         = tr.tipo;
            gr.concepto     = tr.concepto;
            gr.codigoCuenta = tr.codigoCuenta;
            gr.cuentaId     = tr.cuentaId;
            gr.cuentaIds    = tr.cuentaIds;

            gr.empresas = new List<GrupoCell>();
            for (Map<String, PyGController.PyGRow> m : perEmpresa) {
                PyGController.PyGRow er = m.get(tr.key);
                GrupoCell cell = new GrupoCell();
                if (er != null) {
                    cell.actual       = er.valorActual;
                    cell.comparado    = er.valorComparado;
                    cell.pctActual    = er.porcentajeActual;
                    cell.pctComparado = er.porcentajeComparado;
                }
                gr.empresas.add(cell);
            }

            GrupoCell tcell = new GrupoCell();
            tcell.actual       = tr.valorActual;
            tcell.comparado    = tr.valorComparado;
            tcell.pctActual    = tr.porcentajeActual;
            tcell.pctComparado = tr.porcentajeComparado;
            gr.total = tcell;

            res.rows.add(gr);
        }
        return res;
    }
}