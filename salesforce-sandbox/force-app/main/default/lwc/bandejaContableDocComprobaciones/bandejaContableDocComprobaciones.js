import { LightningElement, api } from 'lwc';
import { SUBGRUPOS } from 'c/bandejaContableCalculos';

const ESTILO = {
    ok: { icono: '✓', clase: 'chk-punto chk-ok' },
    ko: { icono: '!', clase: 'chk-punto chk-ko' },
    warn: { icono: '!', clase: 'chk-punto chk-warn' }
};

/**
 * Pestaña "Comprobaciones" del documento: lista las comprobaciones automáticas (bandejaContableCalculos)
 * agrupadas en riesgo fiscal (por subgrupos) y operativo, con filtros y búsqueda.
 */
export default class BandejaContableDocComprobaciones extends LightningElement {
    @api items = [];

    filtro = 'all';
    busqueda = '';
    cerrados = {};

    get malas() { return this.items.filter((x) => x.estado !== 'ok'); }
    get resumen() { return this.malas.length ? `${this.malas.length} a revisar` : 'Todo correcto'; }

    get filtros() {
        const n = { all: this.items.length, bad: this.malas.length, f: this.items.filter((x) => x.k === 'f').length, o: this.items.filter((x) => x.k === 'o').length };
        return [['all', 'Todas'], ['bad', 'Con incidencias'], ['f', 'Riesgo fiscal'], ['o', 'Riesgo operativo']].map(([k, label]) => {
            const on = this.filtro === k;
            const rojo = k === 'bad';
            return { k, label, n: n[k], clase: 'chk-filtro' + (rojo ? ' chk-filtro-rojo' : '') + (on ? ' chk-filtro-on' : '') };
        });
    }

    get grupos() {
        const q = this.busqueda.trim().toLowerCase();
        const mala = (x) => x.estado !== 'ok';
        const visibles = this.items.filter((x) =>
            (this.filtro === 'all' || (this.filtro === 'bad' ? mala(x) : x.k === this.filtro))
            && (!q || [x.titulo, x.status, x.texto].join(' ').toLowerCase().includes(q)));
        const abrirTodo = !!q || this.filtro === 'bad';
        const decorar = (x) => ({ ...x, key: x.titulo, ...ESTILO[x.estado], claseStatus: 'chk-status chk-status-' + x.estado, hayBarras: !!(x.barras && x.barras.length),
            barras: (x.barras || []).map((b) => ({ ...b, estilo: `height:${b.alto}px`, clase: 'chk-barra' + (b.actual ? (b.aviso ? ' chk-barra-aviso' : ' chk-barra-actual') : '') })) });
        return [['f', 'Riesgo fiscal', 'chk-grupo chk-grupo-f'], ['o', 'Riesgo operativo', 'chk-grupo chk-grupo-o']].map(([k, label, clase]) => {
            const its = visibles.filter((x) => x.k === k).sort((a, b) => mala(b) - mala(a));
            const nb = its.filter(mala).length;
            const subs = k === 'f'
                ? SUBGRUPOS.map(([sk, sl, titulos]) => {
                    const si = its.filter((x) => titulos.includes(x.titulo));
                    const sb = si.filter(mala).length;
                    const key = k + sk;
                    const abierto = abrirTodo || !this.cerrados[key];
                    return {
                        key, cabecera: true, label: sl, abierto, items: si.map(decorar),
                        claseFlecha: 'chk-flecha' + (abierto ? ' chk-flecha-abierta' : ''),
                        resumen: sb ? `${sb} incidencia${sb === 1 ? '' : 's'}` : `${si.length} correcta${si.length === 1 ? '' : 's'}`,
                        claseResumen: 'bc-pill bc-pill-peq ' + (sb ? 'bc-pill-error' : 'bc-pill-ok')
                    };
                }).filter((s) => s.items.length)
                : [{ key: k + 'todo', cabecera: false, abierto: true, items: its.map(decorar) }];
            return {
                k, label, clase, subs,
                resumen: `${its.length} ${its.length === 1 ? 'comprobación' : 'comprobaciones'} · ${nb ? `${nb} con incidencia${nb === 1 ? '' : 's'}` : 'todas correctas'}`,
                vacio: !its.length
            };
        }).filter((g) => !g.vacio);
    }
    get sinResultados() { return this.grupos.length === 0; }

    elegirFiltro(e) { this.filtro = e.currentTarget.dataset.k; }
    buscar(e) { this.busqueda = e.target.value || ''; }
    toggleSub(e) {
        const k = e.currentTarget.dataset.k;
        this.cerrados = { ...this.cerrados, [k]: !this.cerrados[k] };
    }
}
