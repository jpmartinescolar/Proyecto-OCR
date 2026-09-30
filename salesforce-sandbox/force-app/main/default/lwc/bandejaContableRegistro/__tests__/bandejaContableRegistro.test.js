import { createElement } from 'lwc';
import BandejaContableRegistro from 'c/bandejaContableRegistro';
import getBandeja from '@salesforce/apex/BandejaContableController.getBandeja';
import listarArchivosGoogle from '@salesforce/apex/BandejaContableController.listarArchivosGoogle';
import listarDocumentosGoogle from '@salesforce/apex/BandejaContableController.listarDocumentosGoogle';

jest.mock('@salesforce/apex/BandejaContableController.getBandeja', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/BandejaContableController.listarArchivosGoogle', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/BandejaContableController.listarDocumentosGoogle', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/BandejaContableController.reprocesarOcr', () => ({ default: jest.fn() }), { virtual: true });

const detalle = (estadoArchivo = 'Sincronizado') => ({
    resumen: { id: 'a00B', numero: 'BC-00008', empresaId: '001E', empresa: 'TESTEX', tipo: 'Recibida', tipoValor: 'Recibida', estado: 'Pendiente', estadoSubida: 'Completada', archivos: 1, fecha: '2026-09-28T12:38:00Z' },
    archivosSincronizados: estadoArchivo === 'Sincronizado' ? 1 : 0,
    archivos: [{ id: 'arc1', nombre: '15 FACTURAS VARIAS.pdf', estado: estadoArchivo, tamano: 1000, fecha: '2026-09-28T12:38:00Z' }]
});
// eslint-disable-next-line @lwc/lwc/no-async-operation
const esperar = () => new Promise((r) => setTimeout(r, 0));

async function montar(archivos, docs, estadoArchivo) {
    getBandeja.mockResolvedValue(detalle(estadoArchivo));
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
        jest.clearAllMocks();
    });

    it('pide la ficha y el procesamiento a la vez, y hasta que llega muestra filas de carga', async () => {
        getBandeja.mockResolvedValue(detalle());
        listarArchivosGoogle.mockReturnValue(new Promise(() => {}));
        listarDocumentosGoogle.mockReturnValue(new Promise(() => {}));
        const el = createElement('c-bandeja-contable-registro', { is: BandejaContableRegistro });
        el.bandejaId = 'a00B';
        document.body.appendChild(el);
        expect(listarArchivosGoogle).toHaveBeenCalled(); // sin esperar a la ficha
        await esperar();
        await esperar();
        const r = el.shadowRoot;
        expect(r.querySelector('.reg-carga')).not.toBeNull();
        expect(r.querySelector('.reg-procesamiento').textContent).toContain('Consultando');
        // Spinner de Salesforce en la cabecera de OCR documentos solo si la carga tarda más de 300 ms
        expect(r.querySelector('.reg-cargando')).toBeNull();
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        await new Promise((ok) => setTimeout(ok, 350));
        expect(r.querySelector('.reg-cargando lightning-spinner')).not.toBeNull();
        expect(r.querySelector('.reg-cargando').textContent).toContain('Cargando documentos');
        expect(r.textContent).not.toContain('No se han encontrado documentos');
    });

    it('mientras procesa lo dice en todas partes y no muestra documentos inventados', async () => {
        const el = await montar([{ archivoId: 'arc1', estado: 'PROCESANDO' }], []);
        const r = el.shadowRoot;
        expect(r.querySelector('.reg-procesamiento').textContent).toContain('Procesando');
        expect(r.querySelector('.reg-procesamiento').textContent).toContain('0 de 1 archivos terminados');
        expect(r.querySelector('.reg-archivo').textContent).toContain('Procesando');
        expect(r.querySelector('.reg-aviso-proceso').textContent).toContain('Estamos procesando los documentos');
        expect(r.querySelector('table')).toBeNull();
        expect(r.querySelector('[title="Vuelve a separar y leer todos los archivos de la bandeja"]').disabled).toBe(true);
        expect(r.textContent).not.toContain('Google');
    });

    it('mientras se sube el archivo, Cargando', async () => {
        const el = await montar([], [], 'Subiendo');
        const r = el.shadowRoot;
        expect(r.querySelector('.reg-procesamiento').textContent).toContain('Cargando');
        expect(r.querySelector('.reg-archivo').textContent).toContain('Cargando');
        expect(r.querySelector('.reg-aviso-proceso').textContent).toContain('Estamos recibiendo los archivos');
    });

    it('procesado: los documentos aparecen, con los que hay que revisar indicados aparte', async () => {
        const el = await montar(
            [{ archivoId: 'arc1', estado: 'PROCESADO_CON_INCIDENCIAS', procesamiento: { paginas: 19, documentos: 2, listos: 1, enRevision: 1, incidencias: [{ codigo: 'SIN_TEXTO', gravedad: 'INFO', veces: 1 }] } }],
            [
                { id: 'd1', numero: 1, nombre: 'BC-00008_D01.pdf', archivoOrigen: '15 FACTURAS VARIAS.pdf', sfArchivoId: 'arc1', paginaInicio: 1, paginaFin: 1, tipo: 'FACTURA', estado: 'LISTO', motivos: [], emisor: 'BigMat', numeroFactura: 'F1', total: '43,68' },
                { id: 'd2', numero: 2, nombre: 'BC-00008_D02.pdf', archivoOrigen: '15 FACTURAS VARIAS.pdf', sfArchivoId: 'arc1', paginaInicio: 2, paginaFin: 2, tipo: 'ALBARAN', estado: 'REQUIERE_REVISION', motivos: ['NO_PARECE_FACTURA'] }
            ]);
        const r = el.shadowRoot;
        const cabecera = r.querySelector('.reg-procesamiento').textContent;
        expect(cabecera).toContain('Procesado');
        expect(cabecera).toContain('1 por revisar');
        const archivo = r.querySelector('.reg-archivo').textContent;
        expect(archivo).toContain('Procesado');
        expect(archivo).toContain('19 páginas');
        expect(archivo).toContain('Escaneado: leído con visión artificial');
        expect(r.querySelector('.reg-aviso-proceso')).toBeNull();
        const filas = r.querySelectorAll('tbody tr');
        expect(filas).toHaveLength(2);
        expect(filas[0].textContent).toContain('BigMat · F1 · 43,68 €');
        expect(filas[0].textContent).toContain('Correcto');
        expect(filas[1].textContent).toContain('No parece una factura');
    });

    it('error de procesamiento: lo explica y deja reprocesar', async () => {
        const el = await montar([{ archivoId: 'arc1', estado: 'ERROR', procesamiento: { incidencias: [{ codigo: 'PDF_PROTEGIDO', gravedad: 'ERROR', veces: 1 }] } }], []);
        const r = el.shadowRoot;
        expect(r.querySelector('.reg-procesamiento').textContent).toContain('Error');
        expect(r.querySelector('.reg-archivo').textContent).toContain('PDF protegido con contraseña');
        expect(r.textContent).toContain('No se han podido procesar los archivos');
        expect(r.querySelector('[title="Vuelve a separar y leer todos los archivos de la bandeja"]').disabled).toBe(false);
    });
});
