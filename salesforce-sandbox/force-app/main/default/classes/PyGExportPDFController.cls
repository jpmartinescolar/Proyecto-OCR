/**
 * Controlador de la Visualforce PyGExportPDF.
 * Lee parámetros de URL y llama a PyGController.generar para obtener las filas.
 *
 *  Parámetros de URL:
 *    e   = empresas titulares (separadas por '|')
 *    d1  = fecha desde (YYYY-MM-DD)
 *    d2  = fecha hasta (YYYY-MM-DD)
 *    c1  = comparativo desde (sólo si cc=1)
 *    c2  = comparativo hasta (sólo si cc=1)
 *    cc  = '1' o '0' (incluir comparativo)
 *    p   = plan PGC ('PGC PYMES' | 'PGC Abreviado' | 'PGC Normal')
 *    s   = simulación ('Todas' | 'No' | 'Si' | 'Sí. Transferencia')
 *    x   = extraordinarios ('Todas' | 'Si' | 'No')
 *    a   = área (opcional)
 *    di  = director Id (opcional)
 */
public with sharing class PyGExportPDFController {

    public List<PdfRow>               rows               { get; private set; }
    public List<String>               empresasTitulares  { get; private set; }
    public String                     empresaLabel       { get; private set; }
    public Date                       fechaDesde         { get; private set; }
    public Date                       fechaHasta         { get; private set; }
    public Date                       fechaCompDesde     { get; private set; }
    public Date                       fechaCompHasta     { get; private set; }
    public Boolean                    conComparativo     { get; private set; }
    public Boolean                    desglosado         { get; private set; }
    public String                     planPGC            { get; private set; }
    public String                     errorMsg           { get; private set; }
    public Datetime                   generadoEn         { get; private set; }
    // labels pre-formateados para la cabecera
    public String                     fechaDesdeLabel    { get; private set; }
    public String                     fechaHastaLabel    { get; private set; }
    public String                     fechaCompDesdeLabel{ get; private set; }
    public String                     fechaCompHastaLabel{ get; private set; }
    public String                     generadoEnLabel    { get; private set; }
    public String                     anioActual         { get; private set; }   // "2026"
    public String                     anioComparado      { get; private set; }   // "2025"

    /** Fila ya lista para renderizar en VF: importes preformateados en español */
    public class PdfRow {
        public String tipo             { get; set; }   // 'SECCION' | 'CUENTA' | 'SUBTOTAL'
        public String codigoCuenta     { get; set; }
        public String concepto         { get; set; }
        public String actualTexto      { get; set; }   // "1.234,56 €" o "0,00 €"
        public String actualSigno      { get; set; }   // 'pos' | 'neg' | 'zero'
        public String comparadoTexto   { get; set; }
        public String comparadoSigno   { get; set; }
        public String variacionTexto   { get; set; }   // "+1.234,56 €" (actual − comparado)
        public String variacionSigno   { get; set; }
        public Boolean isSeccion       { get; set; }
        public Boolean isCuenta        { get; set; }
        public Boolean isSubtotal      { get; set; }
        public String  rowClass        { get; set; }   // clase CSS de la fila (zebra precalculada)
    }

    /** Indicador destacado del resumen ejecutivo */
    public class Kpi {
        public String label          { get; set; }
        public String actualTexto    { get; set; }
        public String actualSigno    { get; set; }
        public String comparadoTexto { get; set; }
        public String variacionTexto { get; set; }
        public String variacionSigno { get; set; }
    }
    public List<Kpi> kpis { get; private set; }

    public PyGExportPDFController() {
        try {
            generadoEn = Datetime.now();
            Map<String, String> p = ApexPages.currentPage().getParameters();

            // ---- empresas (separadas por '|') ----
            empresasTitulares = new List<String>();
            String emp = p.get('e');
            if (String.isNotBlank(emp)) {
                for (String s : emp.split('\\|')) {
                    if (String.isNotBlank(s)) empresasTitulares.add(s.trim());
                }
            }
            empresaLabel = (empresasTitulares.isEmpty())
                ? ''
                : String.join(empresasTitulares, ', ');

            // ---- fechas principales ----
            fechaDesde = parseDate(p.get('d1'));
            fechaHasta = parseDate(p.get('d2'));

            // ---- comparativo ----
            conComparativo = (p.get('cc') == '1');
            // ---- desglose (mostrar cuentas) ----  Por defecto SI
            desglosado     = (p.get('dg') == '0') ? false : true;
            if (conComparativo) {
                fechaCompDesde = parseDate(p.get('c1'));
                fechaCompHasta = parseDate(p.get('c2'));
            } else {
                // Reutilizamos las fechas actuales para que el SOQL devuelva
                // los mismos saldos. La columna comparado no se mostrará.
                fechaCompDesde = fechaDesde;
                fechaCompHasta = fechaHasta;
            }

            // ---- resto ----
            planPGC         = (String.isBlank(p.get('p'))) ? 'PGC PYMES' : p.get('p');
            String sim      = (String.isBlank(p.get('s'))) ? 'No'        : p.get('s');
            String extr     = (String.isBlank(p.get('x'))) ? 'Todas'     : p.get('x');
            String chk      = (String.isBlank(p.get('chk'))) ? 'Todos'   : p.get('chk');
            String area     = p.get('a');
            String director = p.get('di');
            Id     directorId = String.isNotBlank(director) ? (Id) director : null;

            // Validaciones mínimas para evitar AuraHandledException dentro de VF
            if (empresasTitulares.isEmpty()) { errorMsg = 'No se han recibido empresas titulares.'; return; }
            if (fechaDesde == null || fechaHasta == null) { errorMsg = 'Fechas Desde / Hasta no válidas.'; return; }
            if (conComparativo && (fechaCompDesde == null || fechaCompHasta == null)) {
                errorMsg = 'Fechas de comparativo no válidas.';
                return;
            }

            List<PyGController.PyGRow> all = PyGController.generar(
                empresasTitulares, area, directorId,
                fechaDesde, fechaHasta, fechaCompDesde, fechaCompHasta,
                planPGC, sim, extr, chk
            );

            rows = new List<PdfRow>();
            kpis = new List<Kpi>();
            for (PyGController.PyGRow r : all) {
                if (!desglosado && r.tipo == 'CUENTA') continue;
                PdfRow pr = new PdfRow();
                pr.tipo = r.tipo;
                pr.codigoCuenta = r.codigoCuenta;
                pr.concepto = (r.tipo == 'SUBTOTAL') ? subtotalConcepto(r.concepto) : r.concepto;
                pr.actualTexto    = fmtEuros(r.valorActual);
                pr.actualSigno    = signoOf(r.valorActual);
                pr.comparadoTexto = fmtEuros(r.valorComparado);
                pr.comparadoSigno = signoOf(r.valorComparado);
                Decimal vAct = (r.valorActual == null) ? 0 : r.valorActual;
                Decimal vCmp = (r.valorComparado == null) ? 0 : r.valorComparado;
                Decimal dif  = vAct - vCmp;
                pr.variacionTexto = fmtEurosSigned(dif);
                pr.variacionSigno = signoOf(dif);
                pr.isSeccion  = (r.tipo == 'SECCION');
                pr.isCuenta   = (r.tipo == 'CUENTA');
                pr.isSubtotal = (r.tipo == 'SUBTOTAL');
                // Epígrafes en blanco, cuentas desglosadas sombreadas, subtotales en banda
                if (pr.isSubtotal)    pr.rowClass = 'row-subtotal';
                else if (pr.isCuenta) pr.rowClass = 'row-cuenta' + (esMayusculas(r.concepto) ? ' row-cuenta-mayus' : '');
                else                  pr.rowClass = 'row-item';
                rows.add(pr);

                // KPIs del resumen ejecutivo
                String cpto = (r.concepto == null) ? '' : r.concepto;
                if (r.tipo == 'SECCION' && cpto.toLowerCase().contains('cifra de negocios')) {
                    kpis.add(buildKpi('Cifra de negocios', vAct, vCmp));
                } else if (r.tipo == 'SUBTOTAL' && cpto.startsWith('A.1')) {
                    kpis.add(buildKpi('Resultado de explotación', vAct, vCmp));
                } else if (r.tipo == 'SUBTOTAL' && cpto.startsWith('A.3')) {
                    kpis.add(buildKpi('Resultado antes de impuestos', vAct, vCmp));
                } else if (r.tipo == 'SUBTOTAL' && cpto.startsWith('A.4')) {
                    kpis.add(buildKpi('Resultado del ejercicio', vAct, vCmp));
                }
            }

            // La última fila de subtotal (Resultado del ejercicio) se destaca como fila final
            for (Integer i = rows.size() - 1; i >= 0; i--) {
                if (rows[i].isSubtotal) { rows[i].rowClass = 'row-final'; break; }
            }

            // Etiquetas pre-formateadas (fechas dd/MM/yyyy)
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
                String fichero = 'PyG_' + anioActual + '_' + sanitizarNombre(empresaLabel) + '.pdf';
                ApexPages.currentPage().getHeaders().put('Content-Disposition', 'attachment; filename="' + fichero + '"');
            }
        } catch (Exception ex) {
            errorMsg = 'Error generando el PDF: ' + ex.getMessage();
            rows = new List<PdfRow>();
        }
    }

    private static Date parseDate(String s) {
        if (String.isBlank(s)) return null;
        try { return Date.valueOf(s); } catch (Exception e) { return null; }
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

    private Kpi buildKpi(String label, Decimal vAct, Decimal vCmp) {
        Kpi k = new Kpi();
        k.label          = label;
        k.actualTexto    = fmtEuros(vAct);
        k.actualSigno    = signoOf(vAct);
        k.comparadoTexto = fmtEuros(vCmp);
        k.variacionTexto = fmtEurosSigned(vAct - vCmp);
        k.variacionSigno = signoOf(vAct - vCmp);
        return k;
    }

    private static String signoOf(Decimal v) {
        if (v == null || v == 0) return 'zero';
        return v > 0 ? 'pos' : 'neg';
    }

    private static String fmtEurosSigned(Decimal v) {
        if (v == null || v == 0) return fmtEuros(0);
        return (v > 0 ? '+' : '') + fmtEuros(v);
    }

    /**
     * Formatea un Decimal como euros en convención española:
     *   1.234.567,89 €     (separador miles '.', decimal ',')
     *   -123,45 €
     *   0,00 €
     */
    private static String fmtEuros(Decimal v) {
        if (v == null) v = 0;
        Boolean negative = (v < 0);
        Decimal abs = v.abs().setScale(2, System.RoundingMode.HALF_UP);

        Long entero = abs.longValue();                  // parte entera
        Decimal decimalPart = (abs - Decimal.valueOf(entero)) * 100;
        Integer cents = Integer.valueOf(decimalPart.setScale(0, System.RoundingMode.HALF_UP));
        // Asegurar 2 dígitos
        String centStr = (cents < 10) ? '0' + String.valueOf(cents) : String.valueOf(cents);

        // Insertar separador de miles ('.') en la parte entera
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