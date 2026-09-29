import { LightningElement, api } from 'lwc';
import { PLAN_CUENTAS, GRUPOS_CUENTA } from 'c/bandejaContableMock';

const ALTO_MAX = 360;

/**
 * Buscador de cuentas contables (diseño v2 Híbrido): se abre al pulsar un campo de cuenta, filtra por
 * código o nombre y por grupo, y devuelve la cuenta elegida con el evento "elegir" ({ valor }).
 * El plan de cuentas es DE EJEMPLO (bandejaContableMock.PLAN_CUENTAS) hasta integrar el de Sage.
 *
 * `ancla`: rectángulo del campo que lo abre (getBoundingClientRect); se abre debajo o, si no cabe,
 * encima. `soloCodigo`: en el asiento se escribe solo el código; en el resto, "código nombre".
 */
export default class BandejaContableCuentas extends LightningElement {
    @api valor = '';
    @api soloCodigo = false;
    @api ancla;

    _grupo = 'Todas';
    @api
    get grupo() { return this._grupo; }
    set grupo(v) { this._grupo = GRUPOS_CUENTA.includes(v) ? v : 'Todas'; }

    busqueda = '';
    enfocado = false;

    renderedCallback() {
        if (this.enfocado) return;
        const input = this.template.querySelector('.cta-buscar');
        if (input) {
            input.focus();
            this.enfocado = true;
        }
    }

    get estilo() {
        const r = this.ancla || { top: 100, bottom: 120, left: 100, width: 360 };
        const alto = window.innerHeight || 800;
        const ancho = Math.max(r.width || 0, 360);
        const debajo = alto - r.bottom - 8;
        const encima = r.top - 8;
        const arriba = debajo < ALTO_MAX && encima > debajo;
        const max = Math.max(160, Math.min(ALTO_MAX, arriba ? encima : debajo));
        const izquierda = Math.max(8, Math.min(r.left, (window.innerWidth || 1200) - ancho - 8));
        const vertical = arriba ? `bottom:${alto - r.top + 4}px` : `top:${r.bottom + 4}px`;
        return `${vertical};left:${izquierda}px;width:${ancho}px;max-height:${max}px`;
    }

    get codigoActual() { return String(this.valor || '').trim().split(' ')[0]; }

    get lista() {
        const q = this.busqueda.trim().toLowerCase();
        return PLAN_CUENTAS.filter((c) => (this._grupo === 'Todas' || c.grupo === this._grupo) && (!q || `${c.codigo} ${c.nombre}`.toLowerCase().includes(q)));
    }

    get filas() {
        return this.lista.map((c) => ({ ...c, clase: 'cta-fila' + (c.codigo === this.codigoActual ? ' cta-fila-actual' : '') }));
    }
    get vacio() { return this.lista.length === 0; }
    get puedeNueva() { return !!this.busqueda.trim() && !PLAN_CUENTAS.some((c) => c.codigo === this.busqueda.trim()); }

    get grupos() {
        return GRUPOS_CUENTA.map((g) => ({ g, clase: 'cta-chip' + (g === this._grupo ? ' cta-chip-on' : '') }));
    }

    buscar(e) { this.busqueda = e.target.value || ''; }
    elegirGrupo(e) { this._grupo = e.currentTarget.dataset.g; }

    tecla(e) {
        if (e.key === 'Escape') this.cerrar();
        if (e.key === 'Enter' && this.lista.length) this.devolver(this.lista[0]);
    }

    elegir(e) {
        this.devolver(PLAN_CUENTAS.find((c) => c.codigo === e.currentTarget.dataset.codigo));
    }

    usarNueva() {
        this.dispatchEvent(new CustomEvent('elegir', { detail: { valor: this.busqueda.trim() } }));
    }

    devolver(c) {
        if (!c) return;
        this.dispatchEvent(new CustomEvent('elegir', { detail: { valor: this.soloCodigo ? c.codigo : `${c.codigo} ${c.nombre}` } }));
    }

    cerrar() {
        this.dispatchEvent(new CustomEvent('cerrar'));
    }
}
