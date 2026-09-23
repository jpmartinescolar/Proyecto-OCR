@isTest
private class LibroMayorExportControllerTest {

    @isTest
    static void testExportarXlsx() {
        LibroMayorExportController.ExportRow r1 = new LibroMayorExportController.ExportRow();
        r1.fecha = '15/06/2026';
        r1.numeroApunte = 'AP-001';
        r1.numeroAsiento = 'AS-001';
        r1.descripcion = 'Venta con & < > "comillas"';
        r1.debe = 1234.56;
        r1.haber = 0;
        r1.saldo = 1234.56;
        r1.empresaTitular = 'GM Consulting';

        String filasJson = JSON.serialize(new List<LibroMayorExportController.ExportRow>{ r1 });

        Test.startTest();
        String b64 = LibroMayorExportController.exportarLibroMayorXlsx(
            'GM Consulting', '01/01/2026', '31/12/2026', '7050000000', 'Prestaciones de servicios', filasJson);
        // lista vacía: también debe generar un fichero válido
        String b64Vacio = LibroMayorExportController.exportarLibroMayorXlsx(
            'GM', '01/01/2026', '31/12/2026', '700', 'Ventas', '[]');
        // null: no debe romper
        String b64Null = LibroMayorExportController.exportarLibroMayorXlsx(
            'GM', null, null, null, null, null);
        Test.stopTest();

        System.assert(String.isNotBlank(b64), 'Debe devolver base64');
        // Un .xlsx es un ZIP: en base64 su cabecera (PK\x03\x04) empieza por "UEsD"
        System.assert(b64.startsWith('UEsD'), 'Debe ser un ZIP válido (.xlsx)');
        System.assert(String.isNotBlank(b64Vacio));
        System.assert(String.isNotBlank(b64Null));
    }
}