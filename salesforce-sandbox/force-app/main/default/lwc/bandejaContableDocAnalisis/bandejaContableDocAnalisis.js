import { LightningElement, api } from 'lwc';

const TONO = { bien: ' ana-kpi-bien', mal: ' ana-kpi-mal', marca: ' ana-kpi-marca', actual: ' ana-kpi-actual' };
const conClase = (lista, base) => (lista || []).map((x) => ({ ...x, clase: base + (TONO[x.tono] || '') }));

/**
 * Pestañas "Impuesto de Sociedades", "Productos" (capas 1 y 2) y las de la capa 3 · Inteligencia financiera:
 * "Tesorería" y "Análisis de gasto". IS y productos los calcula bandejaContableCalculos sobre los datos
 * extraídos; los financieros son DE EJEMPLO (bandejaContableMock.datosFinancieros).
 * Al pasar por un producto se avisa al documento para resaltarlo en el visor (evento "resaltar").
 */
export default class BandejaContableDocAnalisis extends LightningElement {
    @api vista; // 'is' | 'prod' | 'tes' | 'gas'
    @api analisis;
    @api productos;
    @api financiero; // { tesoreria, gasto }
    @api resaltado; // índice del producto resaltado

    get esIs() { return this.vista === 'is'; }
    get esProductos() { return this.vista === 'prod'; }
    get esTesoreria() { return this.vista === 'tes'; }
    get esGasto() { return this.vista === 'gas'; }

    // ===== Inteligencia financiera =====
    get tes() {
        const t = (this.financiero && this.financiero.tesoreria) || {};
        return { kpis: conClase(t.kpis, 'ana-kpi-valor'), pago: conClase(t.pago, 'ana-linea-valor'), prevision: conClase(t.prevision, 'ana-linea-valor') };
    }
    get gas() {
        const g = (this.financiero && this.financiero.gasto) || {};
        return { kpis: conClase(g.kpis, 'ana-kpi-valor'), evolucion: conClase(g.evolucion, 'ana-linea-valor'), peso: conClase(g.peso, 'ana-linea-valor') };
    }

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
