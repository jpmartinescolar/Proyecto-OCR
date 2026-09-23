/**
 * Controlador de la Visualforce LibroMayorSqlExportPDF: libro mayor de una
 * cuenta de la contabilidad externa de Sage (LibroMayorSqlController) con el
 * mismo formato oficial que los PDFs del PyG y el Balance. Como los datos
 * llegan por callout y las callouts no se permiten en el constructor, la
 * carga vive en el método init() que la página invoca con action.
 *
 *  Parámetros de URL:
 *    e   = código de empresa Sage
 *    en  = nombre de empresa para la cabecera (texto)
 *    c   = código de cuenta contable
 *    d1  = fecha desde (YYYY-MM-DD)
 *    d2  = fecha hasta (YYYY-MM-DD)
 *    pv  = '1' para previsualizar inline (sin descarga)
 */
public with sharing class LibroMayorSqlExportPDFController {

    public List<PdfRow>  rows            { get; private set; }
    public String        empresaLabel    { get; private set; }
    public String        cuentaLabel     { get; private set; }
    public String        errorMsg        { get; private set; }
    public String        fechaDesdeLabel { get; private set; }
    public String        fechaHastaLabel { get; private set; }
    public String        generadoEnLabel { get; private set; }
    public String        anioActual      { get; private set; }
    public String        numMovs         { get; private set; }
    public String        totalDebe       { get; private set; }
    public String        totalHaber      { get; private set; }
    public String        totalSaldo      { get; private set; }
    public String        totalSaldoSigno { get; private set; }

    private Integer codigoEmpresa;
    private String codigoCuenta;
    private Date fechaDesde;
    private Date fechaHasta;

    /** Movimiento ya listo para renderizar en VF: importes preformateados en español */
    public class PdfRow {
        public Integer idx         { get; set; }
        public String  fecha       { get; set; }
        public String  descripcion { get; set; }
        public String  debe        { get; set; }
        public String  haber       { get; set; }
        public String  saldo       { get; set; }
        public String  saldoSigno  { get; set; }
    }

    public LibroMayorSqlExportPDFController() {
        rows = new List<PdfRow>();
        try {
            Datetime generadoEn = Datetime.now();
            Map<String, String> p = ApexPages.currentPage().getParameters();

            codigoEmpresa = String.isBlank(p.get('e')) ? null : Integer.valueOf(p.get('e').trim());
            empresaLabel = String.isBlank(p.get('en')) ? p.get('e') : p.get('en');
            codigoCuenta = p.get('c');
            fechaDesde = parseDate(p.get('d1'));
            fechaHasta = parseDate(p.get('d2'));

            if (codigoEmpresa == null || String.isBlank(codigoCuenta)) {
                errorMsg = 'No se han recibido la empresa y la cuenta.';
                return;
            }
            if (fechaDesde == null || fechaHasta == null) { errorMsg = 'Fechas Desde / Hasta no válidas.'; return; }

            fechaDesdeLabel = fmtFecha(fechaDesde);
            fechaHastaLabel = fmtFecha(fechaHasta);
            generadoEnLabel = generadoEn.format('dd/MM/yyyy HH:mm');
            anioActual      = String.valueOf(fechaDesde.year());

            Boolean preview = ('1' == p.get('pv'));
            if (!preview) {
                String fichero = 'Libro_Mayor_' + codigoCuenta + '_' + anioActual + '_' + sanitizarNombre(empresaLabel) + '.pdf';
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
            LibroMayorSqlController.MayorDTO mayor = LibroMayorSqlController.getMayor(
                codigoEmpresa, codigoCuenta, fechaDesde, fechaHasta, false);

            cuentaLabel = mayor.codigoCuenta + (String.isBlank(mayor.titulo) ? '' : ' · ' + mayor.titulo);

            // El saldo arranca de cero: el asiento de apertura ya trae el del ejercicio
            Decimal saldo = 0, debe = 0, haber = 0;
            Integer i = 0;
            for (LibroMayorSqlController.MovDTO m : mayor.movimientos) {
                Decimal d = (m.debe == null) ? 0 : m.debe;
                Decimal h = (m.haber == null) ? 0 : m.haber;
                saldo += d - h;
                debe += d;
                haber += h;
                PdfRow pr = new PdfRow();
                pr.idx = ++i;
                pr.fecha = fmtFecha(m.fecha);
                pr.descripcion = m.descripcion;
                pr.debe = fmtEuros(d);
                pr.haber = fmtEuros(h);
                pr.saldo = fmtEuros(saldo);
                pr.saldoSigno = signoOf(saldo);
                rows.add(pr);
            }
            numMovs = String.valueOf(rows.size());
            totalDebe = fmtEuros(debe);
            totalHaber = fmtEuros(haber);
            totalSaldo = fmtEuros(debe - haber);
            totalSaldoSigno = signoOf(debe - haber);
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