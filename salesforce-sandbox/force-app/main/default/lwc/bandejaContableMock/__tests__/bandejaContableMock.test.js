import {
    documentosDeBandeja, datosExtraidos, datosEmpresa, aprenderRegla, cambiarEstadoDocumento, guardarSkill, eliminarSkill, anadirNota, notasDe, tareasDe,
    skillsDeEmpresa, empresasAfectadas, skillActiva
} from 'c/bandejaContableMock';

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
        cambiarEstadoDocumento(d.id, 'No contabilizado', { motivo: 'Duplicada' });
        const [otra] = documentosDeBandeja(b);
        expect(otra.estado).toBe('No contabilizado');
        expect(otra.motivo).toBe('Duplicada');
    });
});

describe('skills y colaboración', () => {
    it('crea, edita y elimina skills numerándolas', () => {
        const emp = { id: '001S', nombre: 'Empresa S' };
        const antes = skillsDeEmpresa(emp).length; // las de ejemplo se asignan a la primera empresa que las abre
        expect(antes).toBe(7);
        const s = guardarSkill({ title: 'Nueva', text: 'Texto', tipo: 'Todas', emps: [emp] });
        expect(s.num).toBe('SK-008');
        guardarSkill({ num: s.num, title: 'Editada' });
        expect(skillsDeEmpresa(emp).find((x) => x.num === s.num).title).toBe('Editada');
        eliminarSkill(s.num);
        expect(skillsDeEmpresa(emp)).toHaveLength(antes);
    });

    it('una skill afecta a las empresas elegidas y a las de sus grupos', () => {
        const grupo = { id: 'g1', nombre: 'Grupo', miembros: [{ id: '001A', nombre: 'A' }, { id: '001B', nombre: 'B' }] };
        const s = guardarSkill({ title: 'De grupo', text: 'x', emps: [{ id: '001A', nombre: 'A' }, { id: '001C', nombre: 'C' }], grps: [grupo] });
        expect(empresasAfectadas(s).map((e) => e.id)).toEqual(['001A', '001C', '001B']);
        expect(skillsDeEmpresa({ id: '001B' }).some((x) => x.num === s.num)).toBe(true);
        expect(skillsDeEmpresa({ id: '001Z' }).some((x) => x.num === s.num)).toBe(false);
        eliminarSkill(s.num);
    });

    it('una skill inactiva o con fecha de fin pasada no se aplica', () => {
        expect(skillActiva({ activa: true })).toBe(true);
        expect(skillActiva({ activa: false, fin: '2026-06-30' })).toBe(false);
        expect(skillActiva({ activa: true, fin: '2026-01-01' }, '2026-09-29')).toBe(false);
        expect(skillActiva({ activa: true, fin: '2026-12-31' }, '2026-09-29')).toBe(true);
    });

    it('notas y tareas son independientes por documento', () => {
        anadirNota('D1', { text: 'Hola', files: [] });
        expect(notasDe('D1')).toHaveLength(1);
        expect(notasDe('D2')).toHaveLength(0);
        tareasDe('D1').push({ id: 'x', text: 'T', done: false });
        expect(tareasDe('D1').length).toBe(tareasDe('D2').length + 1);
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

describe('datos extraídos reales', () => {
    it('convierte la extracción de Google al formato de las pantallas', () => {
        const { desdeExtraccion } = require('c/bandejaContableMock');
        const r = desdeExtraccion({
            motor: 'vertex/gemini-2.5-flash-lite', motivos: ['DESCUADRE'], tokensEntrada: 1000, tokensSalida: 200, coste: 0.0002,
            datos: {
                tipo: 'FACTURA', emisor: { nombre: 'OBRAMAT', nif: 'B84406289' }, numero: 'F-1', fecha_emision: '06/04/2026',
                lineas_iva: [{ base: 1234.5, tipo: 21, cuota: 259.25 }], retencion: { importe: 15 }, total: 1478.75,
                productos: [{ descripcion: 'Tornillos', cantidad: 3, importe: 12 }], confianzas: { emisor: 0.9, total: 0.75 }
            }
        });
        expect(r.real).toBe(true);
        expect(r.x.emisor).toBe('OBRAMAT');
        expect(r.x.ivas[0]).toEqual({ base: '1234,50', pct: '21', cuota: '259,25' }); // es-ES no agrupa miles con 4 cifras
        expect(r.x.irpf).toBe('15,00');
        expect(r.x.total).toBe('1478,75');
        expect(r.x.lineas[0]).toEqual({ c: 'Tornillos · 3 ud', i: '12,00 €' });
        expect(r.conf.total).toBe(75);
        expect(r.alertaTono).toBe('err');
    });
});
