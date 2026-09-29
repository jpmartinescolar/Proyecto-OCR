import { LightningElement, api } from 'lwc';

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

    /** Gastos no deducibles: cada uno es una diferencia permanente (ajuste positivo en el modelo 200) */
    get noDeducibles() {
        return ((this.analisis && this.analisis.noDeducibles) || []).map((x, i) => ({ ...x, key: 'nd' + i }));
    }
    get hayNoDeducibles() { return this.noDeducibles.length > 0; }
    get resumenNoDeducibles() {
        const n = this.noDeducibles.length;
        return n ? `${n} ${n === 1 ? 'partida' : 'partidas'}` : 'Ninguna';
    }
    get claseCabNoDeducibles() { return 'ana-bloque-cab' + (this.hayNoDeducibles ? ' ana-bloque-mal' : ''); }

    get filas() {
        return ((this.productos && this.productos.filas) || []).map((p) => ({ ...p, clase: 'ana-fila' + (p.i === this.resaltado ? ' ana-fila-on' : '') }));
    }
    get numFilas() { return this.filas.length; }
    get total() { return this.productos ? this.productos.total : ''; }

    entrar(e) { this.avisar(Number(e.currentTarget.dataset.i)); }
    salir() { this.avisar(null); }
    avisar(i) { this.dispatchEvent(new CustomEvent('resaltar', { detail: { i } })); }
}
