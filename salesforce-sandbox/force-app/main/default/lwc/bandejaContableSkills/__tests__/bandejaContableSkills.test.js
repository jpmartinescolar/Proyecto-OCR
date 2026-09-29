import { createElement } from 'lwc';
import BandejaContableSkills from 'c/bandejaContableSkills';
import { textoPlano } from 'c/bandejaContableUtils';
import { skillsDeEmpresa } from 'c/bandejaContableMock';

jest.mock('@salesforce/apex/BandejaContableController.buscarEmpresasYGrupos', () => ({ default: jest.fn() }), { virtual: true });

// eslint-disable-next-line @lwc/lwc/no-async-operation
const esperar = () => new Promise((r) => setTimeout(r, 0));
const EMPRESA = { id: '001K', nombre: 'Talleres K' };

function montar(props = {}) {
    const el = createElement('c-bandeja-contable-skills', { is: BandejaContableSkills });
    Object.assign(el, { empresaId: EMPRESA.id, empresaNombre: EMPRESA.nombre, ...props });
    const mensajes = [];
    el.addEventListener('cambio', (e) => mensajes.push(e.detail.mensaje));
    document.body.appendChild(el);
    return { el, mensajes };
}
const pulsar = async (el, selector) => {
    el.shadowRoot.querySelector(selector).click();
    await esperar();
};

describe('c-bandeja-contable-skills', () => {
    afterEach(() => {
        while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
    });

    it('lista: estado, "Finalizada el" y empresas afectadas desplegables', async () => {
        const { el } = montar();
        await esperar();
        const r = el.shadowRoot;
        const sk4 = r.querySelector('[data-num="SK-004"]');
        expect(sk4.className).toContain('skl-inactiva');
        expect(sk4.textContent).toContain('Inactiva');
        expect(sk4.textContent).toContain('Finalizada el 30/06/2026');
        const boton = r.querySelector('.skl-empresas-boton[data-num="SK-001"]');
        expect(boton.textContent).toContain('1 empresa');
        boton.click();
        await esperar();
        expect(r.querySelector('.skl-emp-actual').textContent).toBe('Talleres K');
        expect(r.querySelector('.skl-editor')).toBeNull(); // desplegar no abre el editor
    });

    it('pestaña: editor a la derecha; inactiva exige fecha y al menos una empresa', async () => {
        const { el, mensajes } = montar();
        await esperar();
        await pulsar(el, '.skl-cab .bc-boton');
        const r = el.shadowRoot;
        expect(r.querySelector('.skl-pestana-editor')).not.toBeNull();
        expect(r.querySelector('lightning-input-rich-text')).not.toBeNull();

        const titulo = r.querySelector('.skl-titulo-ed');
        titulo.value = 'Nueva regla';
        titulo.dispatchEvent(new CustomEvent('change'));
        const editor = r.querySelector('lightning-input-rich-text');
        editor.value = '<p>Todo a la <b>6290000</b></p>';
        editor.dispatchEvent(new CustomEvent('change'));
        await pulsar(el, '.skl-estado[data-v="false"]');
        const fecha = r.querySelector('.skl-fecha');
        expect(fecha.value).not.toBe(''); // propone hoy
        fecha.value = '';
        fecha.dispatchEvent(new CustomEvent('change'));
        r.querySelector('c-bandeja-contable-skill-empresas').dispatchEvent(new CustomEvent('cambio', { detail: { emps: [], grps: [] } }));
        await esperar();
        await pulsar(el, '.skl-editor-cab .bc-boton');
        expect(r.textContent).toContain('Indica la fecha de finalización');
        expect(r.textContent).toContain('Elige al menos una empresa o grupo');

        fecha.value = '2026-12-31';
        fecha.dispatchEvent(new CustomEvent('change'));
        r.querySelector('c-bandeja-contable-skill-empresas').dispatchEvent(new CustomEvent('cambio', { detail: { emps: [EMPRESA], grps: [] } }));
        await esperar();
        await pulsar(el, '.skl-editor-cab .bc-boton');
        expect(mensajes[0]).toMatch(/creada/);
        const guardada = skillsDeEmpresa(EMPRESA).find((s) => s.title === 'Nueva regla');
        expect(guardada.text).toBe('Todo a la 6290000');
        expect(guardada.html).toContain('<b>6290000</b>');
        expect(guardada.activa).toBe(false);
        expect(guardada.fin).toBe('2026-12-31');
    });

    it('tarjetas: ventana con los campos nuevos', async () => {
        const { el } = montar({ modo: 'tarjetas' });
        await esperar();
        await pulsar(el, '[data-num="SK-002"]');
        const r = el.shadowRoot;
        expect(r.querySelector('.skl-modal')).not.toBeNull();
        expect(r.querySelector('.skl-modal c-bandeja-contable-skill-empresas')).not.toBeNull();
        expect(r.querySelectorAll('.skl-modal .skl-estado')).toHaveLength(2);
    });

    it('texto plano del editor con formato', () => {
        expect(textoPlano('<p>Hola &amp; adiós</p><ul><li>uno</li><li>dos</li></ul>')).toBe('Hola & adiós\n• uno\n• dos');
    });
});
