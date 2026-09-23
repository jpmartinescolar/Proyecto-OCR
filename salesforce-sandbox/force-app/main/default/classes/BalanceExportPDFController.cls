/**
 * Controlador de la Visualforce BalanceExportPDF.
 * Lee parámetros de URL y llama a BalanceController.generar para obtener el árbol del balance.
 *
 *  Parámetros de URL (mismos que PyGExportPDF):
 *    e   = empresas titulares (separadas por '|')
 *    d1  = fecha desde (YYYY-MM-DD)
 *    d2  = fecha hasta (YYYY-MM-DD)
 *    c1  = comparativo desde (sólo si cc=1)
 *    c2  = comparativo hasta (sólo si cc=1)
 *    cc  = '1' o '0' (incluir comparativo)
 *    dg  = '1' o '0' (desglose completo hasta cuenta contable)
 *    p   = plan PGC ('PGC PYMES' | 'PGC Abreviado' | 'PGC Normal')
 *    s   = simulación · x = extraordinarios · chk = check
 *    a   = área (opcional) · di = director Id (opcional)
 */
public with sharing class BalanceExportPDFController {

    public List<PdfRow>  rows               { get; private set; }
    public List<String>  empresasTitulares  { get; private set; }
    public String        empresaLabel       { get; private set; }
    public Date          fechaDesde         { get; private set; }
    public Date          fechaHasta         { get; private set; }
    public Date          fechaCompDesde     { get; private set; }
    public Date          fechaCompHasta     { get; private set; }
    public Boolean       conComparativo     { get; private set; }
    public Boolean       desglosado         { get; private set; }
    public String        planPGC            { get; private set; }
    public String        errorMsg           { get; private set; }
    public Datetime      generadoEn         { get; private set; }
    public String        fechaDesdeLabel    { get; private set; }
    public String        fechaHastaLabel    { get; private set; }
    public String        fechaCompDesdeLabel{ get; private set; }
    public String        fechaCompHastaLabel{ get; private set; }
    public String        generadoEnLabel    { get; private set; }
    public String        anioActual         { get; private set; }
    public String        anioComparado      { get; private set; }

    /** Fila ya lista para renderizar en VF: importes preformateados en español */
    public class PdfRow {
        public String  concepto        { get; set; }
        public String  codigoCuenta    { get; set; }
        public String  actualTexto     { get; set; }
        public String  actualSigno     { get; set; }
        public String  comparadoTexto  { get; set; }
        public String  comparadoSigno  { get; set; }
        public Boolean isCuenta        { get; set; }
        public Boolean isBanda         { get; set; }
        public String  rowClass        { get; set; }
        public String  indentStyle     { get; set; }
    }

    public BalanceExportPDFController() {
        try {
            generadoEn = Datetime.now();
            Map<String, String> p = ApexPages.currentPage().getParameters();

            empresasTitulares = new List<String>();
            String emp = p.get('e');
            if (String.isNotBlank(emp)) {
                for (String s : emp.split('\\|')) {
                    if (String.isNotBlank(s)) empresasTitulares.add(s.trim());
                }
            }
            empresaLabel = empresasTitulares.isEmpty() ? '' : String.join(empresasTitulares, ', ');

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

            planPGC         = (String.isBlank(p.get('p'))) ? 'PGC PYMES' : p.get('p');
            String sim      = (String.isBlank(p.get('s'))) ? 'Todas'     : p.get('s');
            String extr     = (String.isBlank(p.get('x'))) ? 'No'        : p.get('x');
            String chk      = (String.isBlank(p.get('chk'))) ? 'Todos'   : p.get('chk');
            String area     = p.get('a');
            String director = p.get('di');
            Id     directorId = String.isNotBlank(director) ? (Id) director : null;

            if (empresasTitulares.isEmpty()) { errorMsg = 'No se han recibido empresas titulares.'; return; }
            if (fechaDesde == null || fechaHasta == null) { errorMsg = 'Fechas Desde / Hasta no válidas.'; return; }
            if (conComparativo && (fechaCompDesde == null || fechaCompHasta == null)) {
                errorMsg = 'Fechas de comparativo no válidas.';
                return;
            }

            List<BalanceController.BalRow> all = BalanceController.generar(
                empresasTitulares, area, directorId,
                fechaDesde, fechaHasta, fechaCompDesde, fechaCompHasta,
                planPGC, sim, extr, chk
            );

            // Visibilidad: replica el árbol del componente.
            //  - Desglosado: todo expandido (hasta cuenta contable).
            //  - Sin desglose: sólo grupos principales (AGG de nivel <= 1) expandidos.
            Set<String> expanded = new Set<String>();
            for (BalanceController.BalRow r : all) {
                if (desglosado) {
                    if (r.tieneHijos == true) expanded.add(r.key);
                } else if (r.tipo == 'AGG' && r.nivel != null && r.nivel <= 1) {
                    expanded.add(r.key);
                }
            }
            Map<String, Boolean> visible = new Map<String, Boolean>();
            rows = new List<PdfRow>();
            for (BalanceController.BalRow r : all) {
                Boolean vis = (r.parentKey == null)
                    ? true
                    : (visible.get(r.parentKey) == true && expanded.contains(r.parentKey));
                visible.put(r.key, vis);
                if (!vis) continue;
                if (r.tipo == 'BANDA' && String.isBlank(r.concepto)) continue;  // separadores

                PdfRow pr = new PdfRow();
                pr.concepto       = r.concepto;
                pr.codigoCuenta   = r.codigoCuenta;
                pr.isCuenta       = (r.tipo == 'CUENTA');
                pr.isBanda        = (r.tipo == 'BANDA');
                if (pr.isBanda) {
                    pr.actualTexto = ''; pr.actualSigno = 'zero';
                    pr.comparadoTexto = ''; pr.comparadoSigno = 'zero';
                } else {
                    pr.actualTexto    = fmtEuros(r.valorActual);
                    pr.actualSigno    = signoOf(r.valorActual);
                    pr.comparadoTexto = fmtEuros(r.valorComparado);
                    pr.comparadoSigno = signoOf(r.valorComparado);
                }
                if (r.tipo == 'BANDA')      pr.rowClass = 'row-banda';
                else if (r.tipo == 'TOTAL') pr.rowClass = 'row-final';
                else if (r.tipo == 'AGG' && r.nivel != null && r.nivel <= 1) pr.rowClass = 'row-grupo';
                else if (r.tipo == 'CUENTA') pr.rowClass = 'row-cuenta' + (esMayusculas(r.concepto) ? ' row-cuenta-mayus' : '');
                else                        pr.rowClass = 'row-item';
                Integer nivel = (r.nivel == null) ? 0 : r.nivel;
                Decimal indent = 0.25 + 0.38 * nivel;
                pr.indentStyle = (pr.isBanda || r.tipo == 'TOTAL') ? '' : 'padding-left: ' + indent + 'cm;';
                rows.add(pr);
            }

            fechaDesdeLabel     = fmtFecha(fechaDesde);
            fechaHastaLabel     = fmtFecha(fechaHasta);
            fechaCompDesdeLabel = conComparativo ? fmtFecha(fechaCompDesde) : null;
            fechaCompHastaLabel = conComparativo ? fmtFecha(fechaCompHasta) : null;
            generadoEnLabel     = fmtDatetime(generadoEn);
            anioActual          = String.valueOf(fechaDesde.year());
            anioComparado       = (conComparativo && fechaCompDesde != null) ? String.valueOf(fechaCompDesde.year()) : '';

            // Servir como descarga con nombre de archivo, salvo previsualización (pv=1),
            // que se abre inline en el visor de PDF del navegador
            Boolean preview = ('1' == ApexPages.currentPage().getParameters().get('pv'));
            if (!preview) {
                String fichero = 'Balance_Situacion_' + anioActual + '_' + sanitizarNombre(empresaLabel) + '.pdf';
                ApexPages.currentPage().getHeaders().put('Content-Disposition', 'attachment; filename="' + fichero + '"');
            }
        } catch (Exception ex) {
            errorMsg = 'Error generando el PDF: ' + ex.getMessage();
            rows = new List<PdfRow>();
        }
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

    private static String fmtDatetime(Datetime dt) {
        if (dt == null) return '';
        return dt.format('dd/MM/yyyy HH:mm');
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