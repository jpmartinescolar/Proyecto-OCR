import { createElement } from 'lwc';
import BandejaContableRegistro from 'c/bandejaContableRegistro';
import getBandeja from '@salesforce/apex/BandejaContableController.getBandeja';
import listarArchivosGoogle from '@salesforce/apex/BandejaContableController.listarArchivosGoogle';
import listarDocumentosGoogle from '@salesforce/apex/BandejaContableController.listarDocumentosGoogle';

jest.mock('@salesforce/apex/BandejaContableController.getBandeja', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/BandejaContableController.listarArchivosGoogle', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/BandejaContableController.listarDocumentosGoogle', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/BandejaContableController.reprocesarOcr', () => ({ default: jest.fn() }), { virtual: true });

const DETALLE = {
    resumen: { id: 'a00B', numero: 'BC-00008', empresaId: '001E', empresa: 'TESTEX', tipo: 'Recibida', tipoValor: 'Recibida', estado: 'Pendiente', estadoSubida: 'Completada', archivos: 1, fecha: '2026-09-28T12:38:00Z' },
    archivosSincronizados: 1,
    archivos: [{ id: 'arc1', nombre: '15 FACTURAS VARIAS.pdf', estado: 'Sincronizado', tamano: 1000, fecha: '2026-09-28T12:38:00Z' }]
};
// eslint-disable-next-line @lwc/lwc/no-async-operation
const esperar = () => new Promise((r) => setTimeout(r, 0));

async function montar(archivos, docs) {
    getBandeja.mockResolvedValue(DETALLE);
    listarArchivosGoogle.mockResolvedValue(archivos);
    listarDocumentosGoogle.mockResolvedValue(docs);
    const el = createElement('c-bandeja-contable-registro', { is: BandejaContableRegistro });
    el.bandejaId = 'a00B';
    document.body.appendChild(el);
    await esperar();
    await esperar();
    return el;
}

describe('c-bandeja-contable-registro', () => {
    afterEach(() => {
        while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
    });

    it('mientras Google procesa no muestra documentos inventados', async () => {
        const el = await montar([{ archivoId: 'arc1', estado: 'PROCESANDO' }], []);
        const r = el.shadowRoot;
        expect(r.querySelector('.reg-procesamiento').textContent).toContain('Procesando en Google');
        expect(r.querySelector('.reg-archivo').textContent).toContain('Procesando');
        expect(r.textContent).toContain('Google está separando los archivos');
        expect(r.querySelector('table')).toBeNull();
    });

    it('terminado: estado ámbar "revisar", incidencias legibles y documentos reales', async () => {
        const el = await montar(
            [{ archivoId: 'arc1', estado: 'PROCESADO_CON_INCIDENCIAS', procesamiento: { paginas: 19, documentos: 2, listos: 1, enRevision: 1, incidencias: [{ codigo: 'SIN_TEXTO', gravedad: 'INFO', veces: 1 }] } }],
            [
                { id: 'd1', numero: 1, nombre: 'BC-00008_D01.pdf', archivoOrigen: '15 FACTURAS VARIAS.pdf', sfArchivoId: 'arc1', paginaInicio: 1, paginaFin: 1, tipo: 'FACTURA', estado: 'LISTO', motivos: [], emisor: 'BigMat', numeroFactura: 'F1', total: '43,68' },
                { id: 'd2', numero: 2, nombre: 'BC-00008_D02.pdf', archivoOrigen: '15 FACTURAS VARIAS.pdf', sfArchivoId: 'arc1', paginaInicio: 2, paginaFin: 2, tipo: 'ALBARAN', estado: 'REQUIERE_REVISION', motivos: ['NO_PARECE_FACTURA'] }
            ]);
        const r = el.shadowRoot;
        expect(r.querySelector('.reg-procesamiento').textContent).toContain('Terminado · revisar');
        const archivo = r.querySelector('.reg-archivo').textContent;
        expect(archivo).toContain('Procesado · revisar');
        expect(archivo).toContain('19 páginas');
        expect(archivo).toContain('Escaneado: leído con visión artificial');
        const filas = r.querySelectorAll('tbody tr');
        expect(filas).toHaveLength(2);
        expect(filas[0].textContent).toContain('BigMat · F1 · 43,68 €');
        expect(filas[1].textContent).toContain('No parece una factura');
    });
});
