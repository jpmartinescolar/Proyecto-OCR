import { LightningElement, api } from 'lwc';

const BLOQUES = [
    ['noDeducibles', 'Gastos no deducibles', 'ana-bloque-mal', 'Todos los gastos de la factura son fiscalmente deducibles.'],
    ['ajustes', 'Ajustes fiscales', 'ana-bloque-aviso', 'El resultado contable coincide con el fiscal para esta factura.'],
    ['deducciones', 'Posibles deducciones e incentivos', 'ana-bloque-bien', 'No se detectan deducciones ni incentivos aplicables.']
];

/**
 * Pestañas "IS" (Impuesto sobre Sociedades) y "Productos" del documento. Los datos los calcula
 * bandejaContableCalculos (analisisIs, productos) sobre los datos extraídos, que hoy son de ejemplo.
 * Al pasar por un producto se avisa al documento para resaltarlo en el visor (evento "resaltar").
 */
export default class BandejaContableDocAnalisis extends LightningElement {
    @api vista; // 'is' | 'prod'
    @api analisis;
    @api productos;
    @api resaltado; // índice del producto resaltado

    get esIs() { return this.vista === 'is'; }
    get esProductos() { return this.vista === 'prod'; }

    get kpis() {
        return ((this.analisis && this.analisis.kpis) || []).map((k) => ({ ...k, clase: 'ana-kpi-valor' + (k.tono ? ' ana-kpi-' + k.tono : '') }));
    }

    get bloques() {
        const is = this.analisis || {};
        return BLOQUES.map(([k, titulo, clase, vacio]) => {
            const items = (is[k] || []).map((x, i) => ({
                ...x, key: k + i,
                claseImporte: 'ana-importe' + (/^\+/.test(x.importe) ? ' ana-kpi-mal' : /^−/.test(x.importe) ? ' ana-kpi-bien' : '')
            }));
            return {
                k, titulo, vacio, items,
                hay: items.length > 0,
                resumen: items.length ? `${items.length} ${items.length === 1 ? 'partida' : 'partidas'}` : 'Ninguna',
                claseCab: 'ana-bloque-cab' + (items.length ? ' ' + clase : '')
            };
        });
    }

    get filas() {
        return ((this.productos && this.productos.filas) || []).map((p) => ({ ...p, clase: 'ana-fila' + (p.i === this.resaltado ? ' ana-fila-on' : '') }));
    }
    get numFilas() { return this.filas.length; }
    get total() { return this.productos ? this.productos.total : ''; }

    entrar(e) { this.avisar(Number(e.currentTarget.dataset.i)); }
    salir() { this.avisar(null); }
    avisar(i) { this.dispatchEvent(new CustomEvent('resaltar', { detail: { i } })); }
}
