import { createElement } from 'lwc';
import BandejaContableVisor from 'c/bandejaContableVisor';
import { TextDecoder as DecodificadorNode } from 'util';

// eslint-disable-next-line @lwc/lwc/no-async-operation
const esperar = () => new Promise((r) => setTimeout(r, 0));
const esperarVarios = async () => {
    for (let i = 0; i < 5; i++) {
        // eslint-disable-next-line no-await-in-loop
        await esperar();
    }
};

// PDF de una página A5 apaisada (595 x 420 pt) o, si se indica, sin /MediaBox legible
function respuestaPdf(mediaBox = '/MediaBox [0 0 595.28 419.53]') {
    const bytes = Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Page ${mediaBox} >> endobj\n`, 'latin1');
    const blob = { arrayBuffer: () => Promise.resolve(bytes), tipo: 'pdf' };
    return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(blob) });
}

async function montar(props) {
    const el = createElement('c-bandeja-contable-visor', { is: BandejaContableVisor });
    Object.assign(el, { mime: 'application/pdf', nombre: 'factura.pdf', ...props });
    document.body.appendChild(el);
    await esperarVarios();
    return el;
}
const pulsar = async (el, selector) => {
    el.shadowRoot.querySelector(selector).click();
    await esperarVarios();
};
const texto = (el, selector) => el.shadowRoot.querySelector(selector).textContent;
const src = (el) => el.shadowRoot.querySelector('iframe').getAttribute('src');

describe('c-bandeja-contable-visor', () => {
    beforeAll(() => {
        if (!global.TextDecoder) global.TextDecoder = DecodificadorNode;
        // Mesa del visor de 818 x 600 px: al 100 % un A4 (595 pt) mide 794 px + 24 px del lector
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 818 });
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
    });
    afterAll(() => {
        delete HTMLElement.prototype.clientWidth; // vuelve a la de jsdom (Element.prototype)
        delete HTMLElement.prototype.clientHeight;
    });
    beforeEach(() => {
        global.fetch = jest.fn(() => respuestaPdf());
    });
    afterEach(() => {
        while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
    });

    it('abre el PDF sin la barra del lector, ajustado al ancho con el tamaño real de la página', async () => {
        const el = await montar({ url: 'https://firmada/doc.pdf?X-Goog-Signature=abc', paginas: 3 });
        expect(global.fetch).toHaveBeenCalledWith('https://firmada/doc.pdf?X-Goog-Signature=abc');
        expect(src(el)).toBe('https://firmada/doc.pdf?X-Goog-Signature=abc#toolbar=0&navpanes=0&page=1&zoom=100');
        expect(texto(el, '.vis-pagina')).toBe('Pág. 1/3');
        expect(texto(el, '.vis-zoom')).toBe('Ajustado');
    });

    it('una página más estrecha (ticket) se amplía para llenar el ancho', async () => {
        global.fetch = jest.fn(() => respuestaPdf('/MediaBox [0 0 226.77 600]'));
        const el = await montar({ url: 'https://firmada/ticket.pdf' });
        expect(src(el)).toContain('zoom=262'); // (818 − 24) / (226,77 × 96/72)
    });

    it('sin /MediaBox legible se ajusta como un A4', async () => {
        global.fetch = jest.fn(() => respuestaPdf(''));
        const el = await montar({ url: 'https://firmada/doc.pdf' });
        expect(src(el)).toContain('zoom=100');
    });

    it('las páginas y el zoom se pasan al lector (sin tocar la firma de la URL)', async () => {
        const el = await montar({ url: 'https://firmada/doc.pdf?X-Goog-Signature=abc', paginas: 3 });
        await pulsar(el, '[aria-label="Página siguiente"]');
        expect(texto(el, '.vis-pagina')).toBe('Pág. 2/3');
        expect(src(el)).toContain('page=2');
        await pulsar(el, '[aria-label="Aumentar el zoom"]');
        expect(texto(el, '.vis-zoom')).toBe('125 %');
        expect(src(el)).toBe('https://firmada/doc.pdf?X-Goog-Signature=abc#toolbar=0&navpanes=0&page=2&zoom=125');
        await pulsar(el, '[aria-label="Reducir el zoom"]');
        await pulsar(el, '[aria-label="Reducir el zoom"]');
        expect(texto(el, '.vis-zoom')).toBe('75 %');
        await pulsar(el, '.vis-zoom');
        expect(texto(el, '.vis-zoom')).toBe('Ajustado');
        expect(src(el)).toContain('zoom=100');
        await pulsar(el, '[aria-label="Página siguiente"]');
        expect(el.shadowRoot.querySelector('[aria-label="Página siguiente"]').disabled).toBe(true);
    });

    it('empieza en la página de #page=N y sin total conocido no muestra flechas', async () => {
        const el = await montar({ url: 'https://firmada/lote.pdf#page=4' });
        expect(texto(el, '.vis-pagina')).toBe('Pág. 4');
        expect(el.shadowRoot.querySelector('[aria-label="Página siguiente"]')).toBeNull();
        expect(src(el)).toContain('page=4');
    });

    it('girar gira el visor 90° y lo ajusta al nuevo ancho', async () => {
        const el = await montar({ url: 'https://firmada/doc.pdf' });
        await pulsar(el, '.vis-herramienta[title="Girar 90°"]');
        const marco = el.shadowRoot.querySelector('iframe');
        expect(marco.getAttribute('style')).toContain('rotate(90deg)');
        expect(marco.getAttribute('style')).toContain('width:600px');
        expect(src(el)).toContain('zoom=72'); // (600 − 24) / 794
    });

    it('descarga el PDF ya leído con su nombre, sin volver a bajarlo', async () => {
        global.URL.createObjectURL = jest.fn(() => 'blob:x');
        global.URL.revokeObjectURL = jest.fn();
        const el = await montar({ url: 'https://firmada/doc.pdf#page=2' });
        const clics = [];
        const original = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () { clics.push({ href: this.href, download: this.download }); };
        await pulsar(el, '.vis-descargar');
        HTMLAnchorElement.prototype.click = original;
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith('https://firmada/doc.pdf');
        expect(clics).toEqual([{ href: 'blob:x', download: 'factura.pdf' }]);
    });

    it('si no puede leer el PDF, lo abre igualmente ajustado como A4', async () => {
        global.fetch = jest.fn(() => Promise.reject(new TypeError('Failed to fetch')));
        const el = await montar({ url: 'https://firmada/doc.pdf' });
        expect(src(el)).toContain('zoom=100');
    });

    it('sin archivo muestra la vista de ejemplo y no deja descargar', async () => {
        const el = await montar({ url: undefined, mime: '' });
        expect(el.shadowRoot.querySelector('.vis-papel slot')).not.toBeNull();
        expect(el.shadowRoot.querySelector('iframe')).toBeNull();
        expect(el.shadowRoot.querySelector('.vis-descargar').disabled).toBe(true);
        expect(global.fetch).not.toHaveBeenCalled();
    });
    it('Ampliar abre el documento por debajo de la cabecera de Salesforce y se restaura con Esc, Restaurar o fuera', async () => {
        const el = await montar({ url: undefined, mime: '' });
        const r = el.shadowRoot;
        const ampliada = () => r.querySelector('.vis-mesa-ampliada');
        await pulsar(el, '.vis-mesa'); // en la vista de ejemplo basta con pulsar el documento
        expect(ampliada()).not.toBeNull();
        // Nunca pegado arriba: la cabecera fija de Salesforce taparía el encabezado del documento
        expect(r.querySelector('.vis-ampliado-barra').getAttribute('style')).toContain('top:106px');
        expect(ampliada().getAttribute('style')).toContain('top:146px');
        expect(r.querySelector('.vis-lupa')).toBeNull();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await esperarVarios();
        expect(ampliada()).toBeNull();
        await pulsar(el, '.vis-lupa'); // la lupa que aparece al pasar por el documento
        expect(r.querySelector('[aria-pressed]').getAttribute('aria-pressed')).toBe('true');
        await pulsar(el, '.vis-restaurar');
        expect(ampliada()).toBeNull();
        await pulsar(el, '[aria-pressed]');
        await pulsar(el, '.vis-fondo'); // clic fuera
        expect(ampliada()).toBeNull();
    });
});
