import { createElement } from 'lwc';
import BandejaContableDocumento from 'c/bandejaContableDocumento';
import getBandeja from '@salesforce/apex/BandejaContableController.getBandeja';
import getDatosCliente from '@salesforce/apex/BandejaContableController.getDatosCliente';
import listarArchivosGoogle from '@salesforce/apex/BandejaContableController.listarArchivosGoogle';
import listarDocumentosGoogle from '@salesforce/apex/BandejaContableController.listarDocumentosGoogle';
import obtenerDocumentoGoogle from '@salesforce/apex/BandejaContableController.obtenerDocumentoGoogle';

jest.mock('@salesforce/apex/BandejaContableController.getBandeja', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/BandejaContableController.getDatosCliente', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/BandejaContableController.listarArchivosGoogle', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/BandejaContableController.listarDocumentosGoogle', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/BandejaContableController.obtenerDocumentoGoogle', () => ({ default: jest.fn() }), { virtual: true });

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
    // Como la API: el listado sin enlace ni extracción; el documento completo, al abrirlo
    listarDocumentosGoogle.mockResolvedValue(docsGoogle.map((d) => ({ ...d, viewUrl: null, extraccion: null })));
    obtenerDocumentoGoogle.mockImplementation(({ documentoId }) => Promise.resolve(docsGoogle.find((d) => d.id === documentoId)));
    const el = createElement('c-bandeja-contable-documento', { is: BandejaContableDocumento });
    el.bandejaId = 'a00B';
    document.body.appendChild(el);
    await esperar();
    await esperar();
    return el;
}

const pulsar = async (el, selector) => {
    el.shadowRoot.querySelector(selector).click();
    await esperar();
};
const pulsarPestana = (el, k) => pulsar(el, `.doc-pestana[data-k="${k}"]`);
const pestanasVisibles = (el) => [...el.shadowRoot.querySelectorAll('.doc-pestana')].map((b) => b.dataset.k);

describe('c-bandeja-contable-documento', () => {
    afterEach(() => {
        while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
        jest.clearAllMocks();
    });

    it('muestra la cabecera, las tres capas y el desglose de IVA', async () => {
        const el = await montar();
        const r = el.shadowRoot;
        expect(r.querySelector('.doc-titulo').textContent).toMatch(/^Factura /);
        expect([...r.querySelectorAll('.doc-capa')].map((c) => c.dataset.k)).toEqual(['ext', 'intel', 'fin']);
        expect(r.querySelector('.doc-capa-on').dataset.k).toBe('ext');
        // Capa 1 · Inteligencia contable: solo sus pestañas
        expect(pestanasVisibles(el)).toEqual(['general', 'sk', 'prod', 'notas', 'tareas', 'mail']);
        expect(r.querySelectorAll('.doc-iva-fila').length).toBeGreaterThan(2);
        // El diseño ya no tiene el resumen de riesgos en Datos (se ve en la capa 2 y al validar)
        expect(r.querySelector('.doc-riesgos')).toBeNull();
        expect(r.querySelector('.doc-seccion-asiento')).not.toBeNull();
        expect(getDatosCliente).toHaveBeenCalledWith({ empresaId: '001E' });
    });

    it('abre cada pestaña de las tres capas sin errores', async () => {
        const el = await montar();
        for (const k of ['sk', 'prod', 'notas', 'tareas', 'mail', 'general']) {
            // eslint-disable-next-line no-await-in-loop
            await pulsarPestana(el, k);
        }
        expect(el.shadowRoot.querySelector('c-bandeja-contable-doc-colaboracion')).toBeNull();
        await pulsar(el, '.doc-capa[data-k="intel"]');
        expect(pestanasVisibles(el)).toEqual(['chk', 'pf', 'is', 'iae', 'loc', 'tur']);
        for (const k of ['pf', 'chk', 'is', 'loc', 'tur', 'iae']) {
            // eslint-disable-next-line no-await-in-loop
            await pulsarPestana(el, k);
        }
        const cliente = el.shadowRoot.querySelector('c-bandeja-contable-doc-cliente');
        expect(cliente.shadowRoot.textContent).toContain('691.2');
        await pulsar(el, '.doc-capa[data-k="fin"]');
        expect(pestanasVisibles(el)).toEqual(['tes', 'gas']);
        const analisis = el.shadowRoot.querySelector('c-bandeja-contable-doc-analisis');
        expect(analisis.shadowRoot.textContent).toContain('Pago previsto');
        await pulsarPestana(el, 'gas');
        expect(el.shadowRoot.querySelector('c-bandeja-contable-doc-analisis').shadowRoot.textContent).toContain('Evolución del gasto');
    });

    it('capas: la 2 se abre en Check y la 1 y la 3 recuerdan su pestaña', async () => {
        const el = await montar();
        const r = el.shadowRoot;
        await pulsarPestana(el, 'notas');
        await pulsar(el, '.doc-capa[data-k="intel"]');
        expect(r.querySelector('.doc-pestana-on').dataset.k).toBe('chk');
        await pulsarPestana(el, 'is');
        await pulsar(el, '.doc-capa[data-k="fin"]');
        await pulsarPestana(el, 'gas');
        await pulsar(el, '.doc-capa[data-k="ext"]');
        expect(r.querySelector('.doc-pestana-on').dataset.k).toBe('notas');
        await pulsar(el, '.doc-capa[data-k="fin"]');
        expect(r.querySelector('.doc-pestana-on').dataset.k).toBe('gas');
        await pulsar(el, '.doc-capa[data-k="intel"]');
        expect(r.querySelector('.doc-pestana-on').dataset.k).toBe('chk');
        // Cada tarjeta dice si está pre-validada o cuántas incidencias tiene
        [...r.querySelectorAll('.doc-capa-badge')].forEach((b) => expect(b.textContent).toMatch(/^(✓ Pre-validado|⚠ \d+ incidencias?)$/));
    });

    it('Rosetta IA abre el chat en lugar de las capas y "Volver" regresa a la pestaña', async () => {
        const el = await montar();
        const r = el.shadowRoot;
        await pulsarPestana(el, 'prod');
        await pulsar(el, '.doc-boton-rosetta');
        expect(r.querySelector('.doc-capas-card')).toBeNull();
        expect(r.querySelector('.doc-rosetta')).not.toBeNull();
        expect(r.querySelector('c-bandeja-contable-doc-colaboracion').vista).toBe('chat');
        await pulsar(el, '.doc-rosetta button');
        expect(r.querySelector('.doc-rosetta')).toBeNull();
        expect(r.querySelector('.doc-pestana-on').dataset.k).toBe('prod');
    });

    it('validar con riesgo: hay que elegir cómo se resuelve y queda anotado', async () => {
        const el = await montar();
        const r = el.shadowRoot;
        await pulsar(el, '.doc-acciones-cab .bc-boton');
        const aceptar = () => r.querySelector('.doc-modal-pie .doc-boton-peligro');
        expect(r.querySelector('.doc-modal-aviso')).not.toBeNull();
        expect(r.querySelectorAll('.doc-resolucion')).toHaveLength(3);
        expect(aceptar().disabled).toBe(true);
        await pulsar(el, '.doc-resolucion[data-opt="otros"]');
        expect(aceptar().disabled).toBe(true); // falta el motivo
        const motivo = r.querySelector('textarea[data-k="motivo"]');
        motivo.value = 'Criterio acordado con el cliente';
        motivo.dispatchEvent(new CustomEvent('input'));
        await esperar();
        expect(aceptar().disabled).toBe(false);
        expect(aceptar().textContent).toBe('Aceptar riesgo y validar');
        aceptar().click();
        await esperar();
        expect(r.querySelector('.doc-modal-aviso')).toBeNull();
        expect(r.querySelector('.doc-estado').textContent).toContain('Contabilizado');
    });

    it('Correos: lista los del documento y anota uno nuevo', async () => {
        const el = await montar();
        await pulsarPestana(el, 'mail');
        const col = () => el.shadowRoot.querySelector('c-bandeja-contable-doc-colaboracion').shadowRoot;
        const antes = col().querySelectorAll('.col-correo').length;
        expect(antes).toBeGreaterThan(0);
        col().querySelector('.col-correos-cab .bc-boton').click();
        await esperar();
        const escribir = (k, v) => {
            const campo = col().querySelector(`[data-k="${k}"]`);
            campo.value = v;
            campo.dispatchEvent(new CustomEvent('input'));
        };
        escribir('to', 'cliente@ejemplo.es');
        escribir('body', 'Necesitamos el contrato.');
        await esperar();
        col().querySelector('.col-correo-acciones .bc-boton').click();
        await esperar();
        expect(col().querySelectorAll('.col-correo')).toHaveLength(antes + 1);
        expect(el.shadowRoot.querySelector('.doc-pestana[data-k="mail"] .doc-pestana-n').textContent).toBe(String(antes + 1));
    });

    it('la contrapartida y la cuenta del asiento se eligen en el buscador de cuentas', async () => {
        const el = await montar();
        const r = el.shadowRoot;
        await pulsar(el, '.doc-iva-fila input[data-tipo="iva"]');
        const buscador = r.querySelector('c-bandeja-contable-cuentas');
        expect(buscador.grupo).toBe('Gastos');
        buscador.dispatchEvent(new CustomEvent('elegir', { detail: { valor: '6220000 Reparaciones y conservación' } }));
        await esperar();
        expect(r.querySelector('c-bandeja-contable-cuentas')).toBeNull();
        expect(r.querySelector('.doc-iva-fila input[data-tipo="iva"]').value).toBe('6220000 Reparaciones y conservación');
        expect(r.querySelector('.doc-aprender')).not.toBeNull(); // cuenta cambiada a mano: propone la regla

        await pulsar(el, 'input[data-tipo="asiento"]');
        const cuentas = r.querySelector('c-bandeja-contable-cuentas');
        expect(cuentas.soloCodigo).toBe(true);
        cuentas.dispatchEvent(new CustomEvent('elegir', { detail: { valor: '6290000' } }));
        await esperar();
        expect(r.querySelector('input[data-tipo="asiento"]').value).toBe('6290000');

        await pulsar(el, 'input[data-k="ctaProv"]');
        expect(r.querySelector('c-bandeja-contable-cuentas').grupo).toBe('Proveedores');
        r.querySelector('c-bandeja-contable-cuentas').dispatchEvent(new CustomEvent('cerrar'));
        await esperar();
        expect(r.querySelector('c-bandeja-contable-cuentas')).toBeNull();
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
            extraccion: JSON.stringify({ motor: 'vertex/gemini-2.5-flash-lite', motivos: [], datos: { tipo: 'FACTURA', emisor: { nombre: 'BRICOLAJE BRICOMAN', nif: 'B84406289' }, numero: '011-0004-027945', lineas_iva: [{ base: 147.8, tipo: 21, cuota: 31.04 }], total: 178.84, productos: [{ descripcion: 'Silicona neutra', cantidad: 2, precio_unitario: 50, tipo_iva: 21, importe: 100 }, { descripcion: 'Tacos', cantidad: 1, precio_unitario: 47.8, tipo_iva: 21, importe: 47.8 }], confianzas: {} } })
        }]);
        const r = el.shadowRoot;
        expect(r.querySelector('.doc-titulo').textContent).toBe('Factura 011-0004-027945');
        expect(r.querySelector('.doc-google').textContent).toContain('OBRAMAT');
        expect(r.querySelector('.doc-google').textContent).toContain('págs. 13–15');
        const visor = r.querySelector('c-bandeja-contable-visor');
        expect(visor.url).toBe('https://firmada/doc.pdf');
        expect(visor.mime).toBe('application/pdf');
        expect(visor.nombre).toBe('BC-00001_D03.pdf');
        expect(visor.paginas).toBe(3); // págs. 13–15 del PDF original
        expect(obtenerDocumentoGoogle).toHaveBeenCalledWith({ bandejaId: 'a00B', documentoId: 'doc_1' });
        const conceptos = r.querySelectorAll('.doc-concepto-fila:not(.doc-tabla-cab):not(.doc-tabla-pie)');
        expect(conceptos).toHaveLength(2);
        expect(conceptos[0].querySelector('input').value).toBe('Silicona neutra');
        expect(r.textContent).toContain('Los conceptos suman la base imponible.');
        expect(r.querySelector('.doc-google').textContent).toContain('leído la IA');
        const campos = [...r.querySelectorAll('.doc-campo input')].map((i) => i.value);
        expect(campos).toContain('BRICOLAJE BRICOMAN');
        expect(campos).toContain('178,84');
    });
});
