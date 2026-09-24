import { validarArchivo, extension, formatearBytes, ACCEPT } from '../validacionArchivo';

const MB = 1024 * 1024;
const archivo = (name, type, size) => ({ name, type, size });

describe('validarArchivo', () => {
    it('acepta los formatos permitidos', () => {
        expect(validarArchivo(archivo('f.pdf', 'application/pdf', 10), 5 * MB)).toBeNull();
        expect(validarArchivo(archivo('f.ZIP', 'application/x-zip-compressed', 10), 5 * MB)).toBeNull();
        expect(validarArchivo(archivo('f.png', 'image/png', 10), 5 * MB)).toBeNull();
        expect(validarArchivo(archivo('f.jpeg', 'image/jpeg', 10), 5 * MB)).toBeNull();
        expect(validarArchivo(archivo('f.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 10), 5 * MB)).toBeNull();
        expect(validarArchivo(archivo('f.xls', 'application/vnd.ms-excel', 10), 5 * MB)).toBeNull();
    });

    it('acepta MIME vacío (el navegador no siempre lo sabe)', () => {
        expect(validarArchivo(archivo('f.zip', '', 10), 5 * MB)).toBeNull();
    });

    it('rechaza formatos no permitidos', () => {
        expect(validarArchivo(archivo('virus.exe', '', 10), 5 * MB)).toContain('Formato no permitido (.exe)');
        expect(validarArchivo(archivo('sin_extension', '', 10), 5 * MB)).toContain('Formato no permitido');
    });

    it('rechaza una extensión que no coincide con el tipo real', () => {
        expect(validarArchivo(archivo('falso.pdf', 'application/x-msdownload', 10), 5 * MB)).toContain('no coincide');
    });

    it('rechaza archivos vacíos o demasiado grandes', () => {
        expect(validarArchivo(archivo('f.pdf', 'application/pdf', 0), 5 * MB)).toBe('El archivo está vacío.');
        expect(validarArchivo(archivo('f.pdf', 'application/pdf', 6 * MB), 5 * MB)).toContain('el máximo es 5,0 MB');
    });

    it('pide archivo si no hay', () => {
        expect(validarArchivo(null, 5 * MB)).toBe('Adjunta un fichero.');
    });
});

describe('utilidades', () => {
    it('extension', () => {
        expect(extension('a.b.PDF')).toBe('pdf');
        expect(extension('nada')).toBe('');
    });

    it('formatearBytes', () => {
        expect(formatearBytes(500)).toBe('500 B');
        expect(formatearBytes(1536)).toBe('1,5 KB');
        expect(formatearBytes(2 * 1024 * MB)).toBe('2,00 GB');
    });

    it('accept del input', () => {
        expect(ACCEPT).toBe('.pdf,.zip,.png,.jpg,.jpeg,.xlsx,.xls');
    });
});
