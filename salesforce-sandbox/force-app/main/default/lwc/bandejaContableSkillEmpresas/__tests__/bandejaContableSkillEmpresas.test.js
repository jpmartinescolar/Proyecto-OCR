import { createElement } from 'lwc';
import BandejaContableSkillEmpresas from 'c/bandejaContableSkillEmpresas';
import buscarEmpresasYGrupos from '@salesforce/apex/BandejaContableController.buscarEmpresasYGrupos';

jest.mock('@salesforce/apex/BandejaContableController.buscarEmpresasYGrupos', () => ({ default: jest.fn() }), { virtual: true });

// eslint-disable-next-line @lwc/lwc/no-async-operation
const esperar = () => new Promise((r) => setTimeout(r, 0));
const A = { id: '001A', nombre: 'Talleres A', cif: 'B11111111' };
const B = { id: '001B', nombre: 'Distribuciones B', cif: 'B22222222' };
const GRUPO = { id: 'g1', nombre: 'Grupo AB', miembros: [A, B] };

async function montar(props = {}) {
    buscarEmpresasYGrupos.mockResolvedValue({ empresas: [A, B], grupos: [GRUPO] });
    const el = createElement('c-bandeja-contable-skill-empresas', { is: BandejaContableSkillEmpresas });
    Object.assign(el, { emps: [], grps: [], actualId: A.id, ...props });
    const cambios = [];
    el.addEventListener('cambio', (e) => cambios.push(e.detail));
    document.body.appendChild(el);
    el.shadowRoot.querySelector('.ske-anadir').click();
    await esperar();
    await esperar();
    return { el, cambios };
}

describe('c-bandeja-contable-skill-empresas', () => {
    afterEach(() => {
        while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
        jest.clearAllMocks();
    });

    it('carga empresas y grupos reales al abrir y elige una empresa', async () => {
        const { el, cambios } = await montar();
        expect(buscarEmpresasYGrupos).toHaveBeenCalledWith({ texto: '' });
        const opciones = el.shadowRoot.querySelectorAll('.ske-opcion');
        expect(opciones).toHaveLength(2);
        opciones[1].click();
        expect(cambios[0]).toEqual({ emps: [{ id: B.id, nombre: B.nombre }], grps: [] });
    });

    it('seleccionar todas y grupos; las empresas del grupo se cuentan como afectadas', async () => {
        const { el, cambios } = await montar({ grps: [GRUPO] });
        const r = el.shadowRoot;
        expect(r.querySelector('.ske-total').textContent).toBe('2');
        expect(r.querySelector('.ske-opcion .ske-sub').textContent).toBe('Incluida por grupo');
        r.querySelector('.ske-todas').click();
        expect(cambios[0].emps.map((e) => e.id)).toEqual(['001A', '001B']);
        r.querySelectorAll('.ske-pestana')[1].click();
        await esperar();
        r.querySelector('.ske-opcion').click();
        expect(cambios[1].grps).toEqual([]); // el grupo ya estaba elegido: se quita
    });

    it('quita un chip', async () => {
        const { el, cambios } = await montar({ emps: [A, B] });
        el.shadowRoot.querySelector('.ske-quitar[data-id="001A"]').click();
        expect(cambios[0].emps).toEqual([B]);
    });
});
