import { createElement } from 'lwc';
import BandejaContableEmpresa from 'c/bandejaContableEmpresa';
import BandejaContableRiesgo from 'c/bandejaContableRiesgo';
import getDatosCliente from '@salesforce/apex/BandejaContableController.getDatosCliente';
import listarBandejas from '@salesforce/apex/BandejaContableController.listarBandejas';

jest.mock('@salesforce/apex/BandejaContableController.getDatosCliente', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/BandejaContableController.listarBandejas', () => ({ default: jest.fn() }), { virtual: true });

const CLIENTE = {
    empresaId: '001E', nombre: 'Talleres', cif: 'B12345678',
    perfil: [{ label: 'Régimen (estimación)', valor: 'Estimación Directa Normal', fuente: 'Contrato' }, { label: 'Operador intracomunitario', valor: 'Sí', fuente: 'Contrato' }]
};
// eslint-disable-next-line @lwc/lwc/no-async-operation
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('empresa y riesgo no prescrito', () => {
    afterEach(() => {
        while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
    });

    it('empresa: perfil real en la cabecera y editor de skills', async () => {
        getDatosCliente.mockResolvedValue(CLIENTE);
        listarBandejas.mockResolvedValue([]);
        const el = createElement('c-bandeja-contable-empresa', { is: BandejaContableEmpresa });
        el.empresaId = '001E';
        document.body.appendChild(el);
        await esperar();
        const r = el.shadowRoot;
        const pildoras = [...r.querySelectorAll('.bc-acciones .bc-pill')].map((p) => p.textContent);
        expect(pildoras).toContain('Estimación Directa Normal');
        expect(pildoras).toContain('Operador intracomunitario');

        const skills = r.querySelector('c-bandeja-contable-skills').shadowRoot;
        skills.querySelector('.skl-cab .bc-boton').click();
        await esperar();
        skills.querySelector('.skl-modal-pie .bc-boton').click();
        await esperar();
        expect(skills.querySelectorAll('.skl-error').length).toBeGreaterThan(0);
    });

    it('riesgo: KPIs y total de los ejercicios no prescritos', async () => {
        getDatosCliente.mockResolvedValue(CLIENTE);
        const el = createElement('c-bandeja-contable-riesgo', { is: BandejaContableRiesgo });
        el.empresaId = '001E';
        document.body.appendChild(el);
        await esperar();
        const r = el.shadowRoot;
        expect(r.querySelectorAll('.rsg-kpi')).toHaveLength(4);
        expect(r.querySelectorAll('tbody tr').length).toBeGreaterThan(1);
    });
});
