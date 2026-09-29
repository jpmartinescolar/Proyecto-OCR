import { createElement } from 'lwc';
import BandejaContableCuentas from 'c/bandejaContableCuentas';

// eslint-disable-next-line @lwc/lwc/no-async-operation
const esperar = () => new Promise((r) => setTimeout(r, 0));

function montar(props = {}) {
    const el = createElement('c-bandeja-contable-cuentas', { is: BandejaContableCuentas });
    Object.assign(el, { ancla: { top: 100, bottom: 120, left: 50, width: 200 }, ...props });
    const elegidas = [];
    el.addEventListener('elegir', (e) => elegidas.push(e.detail.valor));
    const cerrado = jest.fn();
    el.addEventListener('cerrar', cerrado);
    document.body.appendChild(el);
    return { el, elegidas, cerrado };
}

const escribir = async (el, texto) => {
    const input = el.shadowRoot.querySelector('.cta-buscar');
    input.value = texto;
    input.dispatchEvent(new CustomEvent('input'));
    await esperar();
};
const tecla = async (el, key) => {
    el.shadowRoot.querySelector('.cta-buscar').dispatchEvent(new KeyboardEvent('keydown', { key }));
    await esperar();
};
const codigos = (el) => [...el.shadowRoot.querySelectorAll('.cta-fila .cta-codigo')].map((s) => s.textContent);

describe('c-bandeja-contable-cuentas', () => {
    afterEach(() => {
        while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
    });

    it('filtra por grupo y por código o nombre, y resalta la cuenta actual', async () => {
        const { el } = montar({ grupo: 'Proveedores', valor: '4000001 Endesa Energía S.A.U.' });
        await esperar();
        expect(codigos(el).every((c) => c.startsWith('4'))).toBe(true);
        expect(el.shadowRoot.querySelector('.cta-fila-actual .cta-codigo').textContent).toBe('4000001');
        el.shadowRoot.querySelector('.cta-chip[data-g="Todas"]').click();
        await escribir(el, 'suministros');
        expect(codigos(el)).toEqual(['6280000', '6280002']);
    });

    it('Enter elige la primera; en el asiento devuelve solo el código', async () => {
        const { el, elegidas } = montar({ soloCodigo: true });
        await escribir(el, 'telefon');
        await tecla(el, 'Enter');
        expect(elegidas).toEqual(['6290000']);
    });

    it('fuera del asiento devuelve código y nombre', async () => {
        const { el, elegidas } = montar({ grupo: 'Gastos' });
        await escribir(el, '6220000');
        el.shadowRoot.querySelector('.cta-fila').click();
        expect(elegidas).toEqual(['6220000 Reparaciones y conservación']);
    });

    it('permite usar una cuenta nueva y Esc cierra', async () => {
        const { el, elegidas, cerrado } = montar();
        await escribir(el, '6299999');
        expect(el.shadowRoot.querySelector('.cta-vacio')).not.toBeNull();
        el.shadowRoot.querySelector('.cta-nueva').click();
        expect(elegidas).toEqual(['6299999']);
        await tecla(el, 'Escape');
        expect(cerrado).toHaveBeenCalled();
    });

    it('se abre hacia arriba si no cabe debajo', async () => {
        const alto = window.innerHeight;
        const { el } = montar({ ancla: { top: alto - 40, bottom: alto - 20, left: 10, width: 200 } });
        await esperar();
        expect(el.shadowRoot.querySelector('.cta-caja').getAttribute('style')).toMatch(/^bottom:/);
    });
});
