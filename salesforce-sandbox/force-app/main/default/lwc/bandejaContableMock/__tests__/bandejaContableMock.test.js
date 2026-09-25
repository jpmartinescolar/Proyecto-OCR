import { documentosDeBandeja, datosExtraidos, datosEmpresa, aprenderRegla, cambiarEstadoDocumento } from 'c/bandejaContableMock';

const bandeja = (archivos, extra = {}) => ({
    resumen: { id: 'a00B', numero: 'BC-00001', empresaId: '001E', empresa: 'Empresa', tipoValor: 'Recibida', estado: 'Pendiente', fecha: '2026-09-25T10:00:00Z', ...extra },
    archivos
});
const archivo = (id, nombre, estado = 'Sincronizado', mime = 'application/pdf') => ({ id, nombre, estado, mime });

describe('documentosDeBandeja', () => {
    it('solo desglosa los archivos ya registrados en Google', () => {
        const docs = documentosDeBandeja(bandeja([archivo('a1', 'f.jpg', 'Sincronizado', 'image/jpeg'), archivo('a2', 'g.pdf', 'Error')]));
        expect(docs.every((d) => d.archivoId === 'a1')).toBe(true);
        expect(docs[0].formato).toBe('JPG');
    });

    it('un ZIP se separa en varias facturas y un Excel en dos', () => {
        expect(documentosDeBandeja(bandeja([archivo('z1', 'lote.zip')]))).toHaveLength(3);
        expect(documentosDeBandeja(bandeja([archivo('x1', 'libro.xlsx')]))).toHaveLength(2);
    });

    it('es determinista: mismo archivo, mismos documentos', () => {
        const b = bandeja([archivo('a1', 'factura.pdf')]);
        expect(documentosDeBandeja(b)).toEqual(documentosDeBandeja(b));
    });

    it('la categoría sale del tipo de la bandeja y los tickets usan la plantilla de ticket', () => {
        const [d] = documentosDeBandeja(bandeja([archivo('t1', 'ticket.png', 'Sincronizado', 'image/png')], { tipoValor: 'Ticket' }));
        expect(d.categoria).toBe('Tickets');
        expect(datosExtraidos(d).x.kind).toBe('FACTURA SIMPL.');
    });

    it('una bandeja completada tiene todos sus documentos contabilizados', () => {
        const docs = documentosDeBandeja(bandeja([archivo('z2', 'lote.zip')], { estado: 'Completado' }));
        expect(docs.every((d) => d.estado === 'Contabilizado')).toBe(true);
    });

    it('recuerda el estado que cambia el usuario', () => {
        const b = bandeja([archivo('c1', 'c.jpg', 'Sincronizado', 'image/jpeg')]);
        const [d] = documentosDeBandeja(b);
        cambiarEstadoDocumento(d.id, 'Cancelado');
        expect(documentosDeBandeja(b)[0].estado).toBe('Cancelado');
    });
});

describe('datos del cliente', () => {
    it('cada empresa tiene su propia copia y aprende reglas', () => {
        const antes = datosEmpresa('001X').reglas.length;
        aprenderRegla('001X', { nif: 'B99999999', prov: 'Nuevo S.L.', cuenta: '6290000', desc: 'Otros', iva: '21 %' });
        expect(datosEmpresa('001X').reglas).toHaveLength(antes + 1);
        expect(datosEmpresa('001X').reglas[0].origen).toBe('Aprendida');
        expect(datosEmpresa('001Y').reglas).toHaveLength(antes);
    });

    it('aprender sobre un proveedor existente actualiza su regla', () => {
        aprenderRegla('001Z', { nif: 'A81948077', prov: 'Endesa', cuenta: '6280002', desc: 'Suministros oficina', iva: '21 %' });
        const r = datosEmpresa('001Z').reglas.find((x) => x.nif === 'A81948077');
        expect(r.cuenta).toBe('6280002');
        expect(r.origen).toBe('Aprendida');
    });
});
