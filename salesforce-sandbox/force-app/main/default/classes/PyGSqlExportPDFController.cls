/**
 * Controlador de la Visualforce PyGSqlExportPDF: mismo PDF que PyGExportPDF
 * pero con los datos de la contabilidad externa de Sage (PyGSqlController).
 * Como los saldos llegan por callout y las callouts no se permiten en el
 * constructor, la carga vive en el método init() que la página invoca con
 * action.
 *
 *  Parámetros de URL:
 *    e   = códigos de empresa Sage (separados por '|')
 *    en  = nombres de empresa para la cabecera (texto)
 *    d1  = fecha desde (YYYY-MM-DD)
 *    d2  = fecha hasta (YYYY-MM-DD)
 *    c1  = comparativo desde (sólo si cc=1)
 *    c2  = comparativo hasta (sólo si cc=1)
 *    cc  = '1' o '0' (incluir comparativo)
 *    dg  = '1' o '0' (desglose completo hasta cuenta contable)
 *    pv  = '1' para previsualizar inline (sin descarga)
 */
public with sharing class PyGSqlExportPDFController {

    public List<PdfRow>  rows               { get; private set; }
    public String        empresaLabel       { get; private set; }
    public Boolean       conComparativo     { get; private set; }
    public String        errorMsg           { get; private set; }
    public String        fechaDesdeLabel    { get; private set; }
    public String        fechaHastaLabel    { get; private set; }
    public String        fechaCompDesdeLabel{ get; private set; }
    public String        fechaCompHastaLabel{ get; private set; }
    public String        generadoEnLabel    { get; private set; }
    public String        anioActual         { get; private set; }
    public String        anioComparado      { get; private set; }

    private List<Integer> codigosEmpresa;
    private Date fechaDesde;
    private Date fechaHasta;
    private Date fechaCompDesde;
    private Date fechaCompHasta;
    private Boolean desglosado;

    /** Fila ya lista para renderizar en VF: importes preformateados en español */
    public class PdfRow {
        public String  tipo            { get; set; }   // 'SECCION' | 'CUENTA' | 'SUBTOTAL'
        public String  codigoCuenta    { get; set; }
        public String  concepto        { get; set; }
        public String  actualTexto     { get; set; }
        public String  actualSigno     { get; set; }
        public String  comparadoTexto  { get; set; }
        public String  comparadoSigno  { get; set; }
        public Boolean isCuenta        { get; set; }
        public String  rowClass        { get; set; }
    }

    public PyGSqlExportPDFController() {
        rows = new List<PdfRow>();
        try {
            Datetime generadoEn = Datetime.now();
            Map<String, String> p = ApexPages.currentPage().getParameters();

            codigosEmpresa = new List<Integer>();
            String emp = p.get('e');
            if (String.isNotBlank(emp)) {
                for (String s : emp.split('\\|')) {
                    if (String.isNotBlank(s)) codigosEmpresa.add(Integer.valueOf(s.trim()));
                }
            }
            empresaLabel = String.isBlank(p.get('en')) ? emp : p.get('en');

            fechaDesde = parseDate(p.get('d1'));
            fechaHasta = parseDate(p.get('d2'));
            conComparativo = (p.get('cc') == '1');
            desglosado     = (p.get('dg') == '0') ? false : true;
            if (conComparativo) {
                fechaCompDesde = parseDate(p.get('c1'));
                fechaCompHasta = parseDate(p.get('c2'));
            } else {
                fechaCompDesde = fechaDesde;
                fechaCompHasta = fechaHasta;
            }

            if (codigosEmpresa.isEmpty()) { errorMsg = 'No se han recibido empresas.'; return; }
            if (fechaDesde == null || fechaHasta == null) { errorMsg = 'Fechas Desde / Hasta no válidas.'; return; }
            if (conComparativo && (fechaCompDesde == null || fechaCompHasta == null)) {
                errorMsg = 'Fechas de comparativo no válidas.';
                return;
            }

            fechaDesdeLabel     = fmtFecha(fechaDesde);
            fechaHastaLabel     = fmtFecha(fechaHasta);
            fechaCompDesdeLabel = conComparativo ? fmtFecha(fechaCompDesde) : null;
            fechaCompHastaLabel = conComparativo ? fmtFecha(fechaCompHasta) : null;
            generadoEnLabel     = generadoEn.format('dd/MM/yyyy HH:mm');
            anioActual          = String.valueOf(fechaDesde.year());
            anioComparado       = (conComparativo && fechaCompDesde != null) ? String.valueOf(fechaCompDesde.year()) : '';

            // Servir como descarga con nombre de archivo, salvo previsualización (pv=1)
            Boolean preview = ('1' == p.get('pv'));
            if (!preview) {
                String fichero = 'PyG_' + anioActual + '_' + sanitizarNombre(empresaLabel) + '.pdf';
                ApexPages.currentPage().getHeaders().put('Content-Disposition', 'attachment; filename="' + fichero + '"');
            }
        } catch (Exception ex) {
            errorMsg = 'Error preparando el PDF: ' + ex.getMessage();
        }
    }

    /** Carga de datos (callout a Sage): la invoca la página con action */
    public PageReference init() {
        if (errorMsg != null) return null;
        try {
            List<PyGSqlController.PyGSqlRow> all = PyGSqlController.generar(
                codigosEmpresa, fechaDesde, fechaHasta, fechaCompDesde, fechaCompHasta);

            for (PyGSqlController.PyGSqlRow r : all) {
                if (!desglosado && r.tipo == 'CUENTA') continue;
                PdfRow pr = new PdfRow();
                pr.tipo = r.tipo;
                pr.codigoCuenta = r.codigoCuenta;
                pr.concepto = (r.tipo == 'SUBTOTAL') ? subtotalConcepto(r.concepto) : r.concepto;
                pr.actualTexto    = fmtEuros(r.valorActual);
                pr.actualSigno    = signoOf(r.valorActual);
                pr.comparadoTexto = fmtEuros(r.valorComparado);
                pr.comparadoSigno = signoOf(r.valorComparado);
                pr.isCuenta   = (r.tipo == 'CUENTA');
                if (r.tipo == 'SUBTOTAL')    pr.rowClass = 'row-subtotal';
                else if (pr.isCuenta) pr.rowClass = 'row-cuenta' + (esMayusculas(r.concepto) ? ' row-cuenta-mayus' : '');
                else                  pr.rowClass = 'row-item';
                rows.add(pr);
            }

            // La última fila de subtotal (Resultado del ejercicio) se destaca como fila final
            for (Integer i = rows.size() - 1; i >= 0; i--) {
                if (rows[i].tipo == 'SUBTOTAL') { rows[i].rowClass = 'row-final'; break; }
            }
        } catch (Exception ex) {
            errorMsg = 'Error generando el PDF: ' + ex.getMessage();
            rows = new List<PdfRow>();
        }
        return null;
    }

    /** Nombre de archivo seguro: sin acentos, espacios ni signos */
    private static String sanitizarNombre(String s) {
        if (String.isBlank(s)) return 'informe';
        String limpio = s.replaceAll('[áàäâÁÀÄÂ]', 'a').replaceAll('[éèëêÉÈËÊ]', 'e')
                         .replaceAll('[íìïîÍÌÏÎ]', 'i').replaceAll('[óòöôÓÒÖÔ]', 'o')
                         .replaceAll('[úùüûÚÙÜÛ]', 'u').replaceAll('[ñÑ]', 'n')
                         .replaceAll('[^a-zA-Z0-9]+', '_').replaceAll('^_+|_+$', '');
        if (limpio.length() > 60) limpio = limpio.substring(0, 60);
        return String.isBlank(limpio) ? 'informe' : limpio;
    }

    /** Título escrito todo en mayúsculas (ocupa más que el propio código de cuenta) */
    private static Boolean esMayusculas(String s) {
        if (String.isBlank(s)) return false;
        return s == s.toUpperCase() && s != s.toLowerCase();
    }

    /** "A.1) RESULTADO DE EXPLOTACIÓN" -> "A.1) Resultado de explotación" */
    private static String subtotalConcepto(String c) {
        if (String.isBlank(c)) return c;
        Integer p = c.indexOf(') ');
        if (p < 0) return c.toLowerCase().capitalize();
        return c.substring(0, p + 2) + c.substring(p + 2).toLowerCase().capitalize();
    }

    private static Date parseDate(String s) {
        if (String.isBlank(s)) return null;
        try { return Date.valueOf(s); } catch (Exception e) { return null; }
    }

    private static String fmtFecha(Date d) {
        if (d == null) return '';
        return String.valueOf(d.day()).leftPad(2, '0') + '/'
             + String.valueOf(d.month()).leftPad(2, '0') + '/'
             + String.valueOf(d.year());
    }

    private static String signoOf(Decimal v) {
        if (v == null || v == 0) return 'zero';
        return v > 0 ? 'pos' : 'neg';
    }

    /** 1.234.567,89 € (separador de miles '.', decimal ',') */
    private static String fmtEuros(Decimal v) {
        if (v == null) v = 0;
        Boolean negative = (v < 0);
        Decimal abs = v.abs().setScale(2, System.RoundingMode.HALF_UP);
        Long entero = abs.longValue();
        Decimal decimalPart = (abs - Decimal.valueOf(entero)) * 100;
        Integer cents = Integer.valueOf(decimalPart.setScale(0, System.RoundingMode.HALF_UP));
        String centStr = (cents < 10) ? '0' + String.valueOf(cents) : String.valueOf(cents);
        String entStr = String.valueOf(entero);
        String entConPuntos = '';
        Integer len = entStr.length();
        for (Integer i = 0; i < len; i++) {
            if (i > 0 && Math.mod(len - i, 3) == 0) entConPuntos += '.';
            entConPuntos += entStr.substring(i, i + 1);
        }
        return (negative ? '-' : '') + entConPuntos + ',' + centStr + ' €';
    }
}