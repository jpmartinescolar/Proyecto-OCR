import { createElement } from 'lwc';
import BandejaContableDocumento from 'c/bandejaContableDocumento';
import getBandeja from '@salesforce/apex/BandejaContableController.getBandeja';
import getDatosCliente from '@salesforce/apex/BandejaContableController.getDatosCliente';
import listarArchivosGoogle from '@salesforce/apex/BandejaContableController.listarArchivosGoogle';
import listarDocumentosGoogle from '@salesforce/apex/BandejaContableController.listarDocumentosGoogle';

jest.mock('@salesforce/apex/BandejaContableController.getBandeja', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/BandejaContableController.getDatosCliente', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/BandejaContableController.listarArchivosGoogle', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/BandejaContableController.listarDocumentosGoogle', () => ({ default: jest.fn() }), { virtual: true });

const DETALLE = {
    resumen: { id: 'a00B', numero: 'BC-00001', empresaId: '001E', empresa: 'Talleres', cif: 'B12345678', tipoValor: 'Recibida', estado: 'Pendiente', origen: 'Manual', fecha: '2026-09-25T10:00:00Z' },
    archivos: [{ id: 'arc1', nombre: 'lote.zip', estado: 'Sincronizado', mime: 'application/zip', fecha: '2026-09-25T10:00:00Z' }]
};
const CLIENTE = {
    empresaId: '001E', nombre: 'Talleres', cif: 'B12345678', domicilio: 'Calle de la Industria 14', localidad: '28850 Torrejón',
    perfil: [{ label: 'Régimen (estimación)', valor: 'Estimación Directa Normal', fuente: 'Contrato' }],
    modelos: [], actividades: [{ epigrafe: '691.2', descripcion: 'Reparación de vehículos automóviles' }], locales: [], vinculados: [], noDisponibles: [], pendientes: ['Prorrata']
};

// eslint-disable-next-line @lwc/lwc/no-async-operation
const esperar = () => new Promise((r) => setTimeout(r, 0));

async function montar(docsGoogle = []) {
    getBandeja.mockResolvedValue(DETALLE);
    getDatosCliente.mockResolvedValue(CLIENTE);
    listarArchivosGoogle.mockResolvedValue([]);
    listarDocumentosGoogle.mockResolvedValue(docsGoogle);
    const el = createElement('c-bandeja-contable-documento', { is: BandejaContableDocumento });
    el.bandejaId = 'a00B';
    document.body.appendChild(el);
    await esperar();
    await esperar();
    return el;
}

const pulsarPestana = async (el, k) => {
    el.shadowRoot.querySelector(`.doc-pestana[data-k="${k}"]`).click();
    await esperar();
};

describe('c-bandeja-contable-documento', () => {
    afterEach(() => {
        while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
        jest.clearAllMocks();
    });

    it('muestra la cabecera, el desglose de IVA y los riesgos', async () => {
        const el = await montar();
        const r = el.shadowRoot;
        expect(r.querySelector('.doc-titulo').textContent).toMatch(/^Factura /);
        expect(r.querySelectorAll('.doc-pestana')).toHaveLength(12);
        expect(r.querySelectorAll('.doc-iva-fila').length).toBeGreaterThan(2);
        expect(r.querySelector('.doc-riesgos')).not.toBeNull();
        expect(getDatosCliente).toHaveBeenCalledWith({ empresaId: '001E' });
    });

    it('abre cada pestaña sin errores', async () => {
        const el = await montar();
        for (const k of ['pf', 'chk', 'is', 'prod', 'notas', 'tareas', 'chat', 'iae', 'loc', 'tur', 'sk', 'general']) {
            // eslint-disable-next-line no-await-in-loop
            await pulsarPestana(el, k);
        }
        await pulsarPestana(el, 'iae');
        const cliente = el.shadowRoot.querySelector('c-bandeja-contable-doc-cliente');
        expect(cliente.shadowRoot.textContent).toContain('691.2');
    });

    it('no contabilizar exige motivo y bloquea la factura', async () => {
        const el = await montar();
        const r = el.shadowRoot;
        r.querySelector('.doc-boton-nc').click();
        await esperar();
        r.querySelector('.doc-motivo[data-motivo="Duplicada"]').click();
        await esperar();
        r.querySelector('.doc-popover-pie .doc-boton-peligro').click();
        await esperar();
        expect(r.querySelector('.doc-bloqueo')).not.toBeNull();
        expect(r.querySelector('.doc-estado').textContent).toContain('No contabilizado · Duplicada');
    });
});

describe('c-bandeja-contable-documento con documentos de Google', () => {
    afterEach(() => {
        while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
    });

    it('usa el documento real: título, lectura y visor del PDF separado', async () => {
        const el = await montar([{
            id: 'doc_1', numero: 3, nombre: 'BC-00001_D03.pdf', archivoOrigen: 'lote.zip', archivoSubido: 'lote.zip', sfArchivoId: 'arc1',
            paginaInicio: 13, paginaFin: 15, tipo: 'FACTURA', confianza: 0.9, estado: 'LISTO', motivos: [], emisor: 'OBRAMAT',
            numeroFactura: '011-0004-027945', fecha: '06/04/2026', total: '178,84', dudas: [], separado: true, viewUrl: 'https://firmada/doc.pdf',
            motor: 'vertex/gemini-2.5-flash-lite',
            extraccion: JSON.stringify({ motor: 'vertex/gemini-2.5-flash-lite', motivos: [], datos: { tipo: 'FACTURA', emisor: { nombre: 'BRICOLAJE BRICOMAN', nif: 'B84406289' }, numero: '011-0004-027945', lineas_iva: [{ base: 147.8, tipo: 21, cuota: 31.04 }], total: 178.84, productos: [], confianzas: {} } })
        }]);
        const r = el.shadowRoot;
        expect(r.querySelector('.doc-titulo').textContent).toBe('Factura 011-0004-027945');
        expect(r.querySelector('.doc-google').textContent).toContain('OBRAMAT');
        expect(r.querySelector('.doc-google').textContent).toContain('págs. 13–15');
        expect(r.querySelector('.doc-iframe').getAttribute('src')).toBe('https://firmada/doc.pdf');
        expect(r.querySelector('.doc-google').textContent).toContain('leído la IA');
        const campos = [...r.querySelectorAll('.doc-campo input')].map((i) => i.value);
        expect(campos).toContain('BRICOLAJE BRICOMAN');
        expect(campos).toContain('178,84');
    });
});
