/**
 * Genera un fichero Excel (.xlsx) real del Libro Mayor a partir de las filas
 * que el usuario tiene en pantalla (con sus filtros). Un .xlsx es un ZIP de
 * varios XML, que se construye con Compression.ZipWriter (API >= 62).
 *
 * Devuelve el contenido del .xlsx codificado en base64 para que el LWC lo
 * descargue mediante un data URI (compatible con Lightning Locker).
 */
public with sharing class LibroMayorExportController {

    // Fila tal y como la envía el LWC (8 columnas visibles)
    public class ExportRow {
        @AuraEnabled public String  fecha;
        @AuraEnabled public String  numeroApunte;
        @AuraEnabled public String  numeroAsiento;
        @AuraEnabled public String  descripcion;
        @AuraEnabled public Decimal debe;
        @AuraEnabled public Decimal haber;
        @AuraEnabled public Decimal saldo;
        @AuraEnabled public String  empresaTitular;
    }

    private static final String COLS = 'ABCDEFGH';

    @AuraEnabled
    public static String exportarLibroMayorXlsx(String empresa, String desde, String hasta,
                                                String cuentaNumero, String cuentaTitulo,
                                                String filasJson) {
        // Las filas llegan como JSON (más fiable que List<clase anidada> en el binding LWC→Apex)
        List<ExportRow> filas = String.isBlank(filasJson)
            ? new List<ExportRow>()
            : (List<ExportRow>) JSON.deserialize(filasJson, List<ExportRow>.class);

        // ---- Hoja (sheet1.xml) ----
        List<String> rows = new List<String>();
        Integer rn = 1;

        // Cabecera con los datos del informe
        rows.add(rowCells(rn, new String[]{
            tc('A', rn, 'Empresa titular:'), tc('B', rn, empresa) })); rn++;
        rows.add(rowCells(rn, new String[]{
            tc('A', rn, 'Desde:'), tc('B', rn, desde),
            tc('C', rn, 'Hasta:'), tc('D', rn, hasta) })); rn++;
        rows.add(rowCells(rn, new String[]{
            tc('A', rn, 'Cuenta contable:'), tc('B', rn, cuentaNumero),
            tc('C', rn, 'Título de la cuenta:'), tc('D', rn, cuentaTitulo) })); rn++;
        rows.add('<row r="' + rn + '"/>'); rn++;

        // Cabecera de columnas
        String[] heads = new String[]{ 'Fecha', 'Nº apunte', 'Nº asiento', 'Descripción',
                                       'Debe', 'Haber', 'Saldo', 'Empresa titular' };
        String[] headCells = new String[]{};
        for (Integer i = 0; i < heads.size(); i++) {
            headCells.add(tc(String.valueOf(COLS.substring(i, i + 1)), rn, heads[i]));
        }
        rows.add(rowCells(rn, headCells)); rn++;

        // Datos
        for (ExportRow r : filas) {
            String[] cells = new String[]{
                tc('A', rn, r.fecha),
                tc('B', rn, r.numeroApunte),
                tc('C', rn, r.numeroAsiento),
                tc('D', rn, r.descripcion),
                nc('E', rn, r.debe),
                nc('F', rn, r.haber),
                nc('G', rn, r.saldo),
                tc('H', rn, r.empresaTitular)
            };
            rows.add(rowCells(rn, cells));
            rn++;
        }

        String sheet =
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
          + '<sheetData>' + String.join(rows, '') + '</sheetData></worksheet>';

        String contentTypes =
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
          + '<Default Extension="xml" ContentType="application/xml"/>'
          + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
          + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
          + '</Types>';

        String rels =
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
          + '</Relationships>';

        String workbook =
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
          + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
          + '<sheets><sheet name="Libro Mayor" sheetId="1" r:id="rId1"/></sheets></workbook>';

        String wbRels =
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
          + '</Relationships>';

        Compression.ZipWriter zw = new Compression.ZipWriter();
        zw.addEntry('[Content_Types].xml', Blob.valueOf(contentTypes));
        zw.addEntry('_rels/.rels', Blob.valueOf(rels));
        zw.addEntry('xl/workbook.xml', Blob.valueOf(workbook));
        zw.addEntry('xl/_rels/workbook.xml.rels', Blob.valueOf(wbRels));
        zw.addEntry('xl/worksheets/sheet1.xml', Blob.valueOf(sheet));

        return EncodingUtil.base64Encode(zw.getArchive());
    }

    // ---- helpers de construcción de celdas/filas ----
    private static String rowCells(Integer rn, String[] cells) {
        return '<row r="' + rn + '">' + String.join(cells, '') + '</row>';
    }
    // celda de texto (inlineStr)
    private static String tc(String col, Integer rn, String val) {
        return '<c r="' + col + rn + '" t="inlineStr"><is><t xml:space="preserve">'
             + esc(val) + '</t></is></c>';
    }
    // celda numérica
    private static String nc(String col, Integer rn, Decimal val) {
        return '<c r="' + col + rn + '"><v>' + (val == null ? '0' : String.valueOf(val)) + '</v></c>';
    }
    private static String esc(String s) {
        if (s == null) return '';
        return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                .replace('"', '&quot;').replace('\'', '&apos;');
    }
}