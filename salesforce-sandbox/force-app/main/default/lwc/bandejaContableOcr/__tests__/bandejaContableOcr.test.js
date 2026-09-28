import { createElement } from 'lwc';
import BandejaContableOcr from 'c/bandejaContableOcr';
import listarBandejasConArchivos from '@salesforce/apex/BandejaContableController.listarBandejasConArchivos';

jest.mock('@salesforce/apex/BandejaContableController.listarBandejasConArchivos', () => ({ default: jest.fn() }), { virtual: true });

const bandeja = (id, empresaId, empresa, tipoValor) => ({
    resumen: { id, numero: 'BC-' + id, empresaId, empresa, tipoValor, estado: 'Pendiente', origen: 'Manual', fecha: '2026-09-25T10:00:00Z' },
    archivos: [{ id: 'z' + id, nombre: 'lote.zip', estado: 'Sincronizado', mime: 'application/zip' }]
});
// eslint-disable-next-line @lwc/lwc/no-async-operation
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('c-bandeja-contable-ocr', () => {
    afterEach(() => {
        while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
    });

    it('filtra por tipo, agrupa por empresa y muestra la situación fiscal', async () => {
        listarBandejasConArchivos.mockResolvedValue([bandeja('1', '001A', 'Alfa', 'Recibida'), bandeja('2', '001B', 'Beta', 'Emitida')]);
        const el = createElement('c-bandeja-contable-ocr', { is: BandejaContableOcr });
        document.body.appendChild(el);
        await esperar();
        const r = el.shadowRoot;
        r.querySelector('.bc-filtros button[data-valor="Todos"]').click();
        await esperar();
        expect(r.querySelectorAll('tbody tr')).toHaveLength(6);
        expect(r.querySelectorAll('.ocr-sit').length).toBe(6);

        r.querySelector('.ocr-tipo[data-valor="Facturas emitidas"]').click();
        await esperar();
        expect(r.querySelectorAll('tbody tr')).toHaveLength(3);

        r.querySelector('.ocr-tipo[data-valor="Todas"]').click();
        r.querySelector('.bc-cabecera .bc-boton-sec').click();
        await esperar();
        expect(r.querySelectorAll('.ocr-grupo')).toHaveLength(2);
    });
});
