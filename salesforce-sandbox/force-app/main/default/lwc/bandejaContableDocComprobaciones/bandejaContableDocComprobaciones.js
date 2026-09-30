import { LightningElement, api } from 'lwc';
import { SUBGRUPOS, conIncidencia, aRevisar } from 'c/bandejaContableCalculos';

const ESTILO = {
    ok: { icono: '✓', clase: 'chk-punto chk-ok' },
    ko: { icono: '!', clase: 'chk-punto chk-ko' },
    warn: { icono: '!', clase: 'chk-punto chk-warn' }
};

/**
 * Pestaña "Check" del documento: lista las comprobaciones automáticas (bandejaContableCalculos)
 * agrupadas en riesgo fiscal (por subgrupos) y operativo, con filtro y búsqueda.
 * Una comprobación resuelta por una skill del cliente sale en ámbar con la skill ("Skill aplicada"):
 * no cuenta como incidencia, pero sí aparece en "Con incidencias" para que el asesor la vea.
 */
export default class BandejaContableDocComprobaciones extends LightningElement {
    @api items = [];

    // Filtro con el que se abre la pestaña (al entrar en la capa 2 con incidencias, "Con incidencias")
    _filtro = 'all';
    @api
    get filtroInicial() { return this._filtro; }
    set filtroInicial(v) { this._filtro = v === 'bad' ? 'bad' : 'all'; }

    busqueda = '';
    cerrados = {};

    get filtro() { return this._filtro; }
    get malas() { return this.items.filter(conIncidencia); }
    get resumen() { return this.malas.length ? `${this.malas.length} a revisar` : 'Todo correcto'; }

    get filtros() {
        const n = { all: this.items.length, bad: this.items.filter(aRevisar).length };
        return [['all', 'Todas'], ['bad', 'Con incidencias']].map(([k, label]) => {
            const on = this.filtro === k;
            const rojo = k === 'bad';
            return { k, label, n: n[k], clase: 'chk-filtro' + (rojo ? ' chk-filtro-rojo' : '') + (on ? ' chk-filtro-on' : '') };
        });
    }

    get grupos() {
        const q = this.busqueda.trim().toLowerCase();
        const mala = aRevisar;
        const visibles = this.items.filter((x) =>
            (this.filtro === 'all' || mala(x))
            && (!q || [x.titulo, x.status, x.texto].join(' ').toLowerCase().includes(q)));
        const abrirTodo = !!q || this.filtro === 'bad';
        // Resuelta por una skill: en ámbar, con la skill al lado
        const estilo = (x) => (x.skill ? 'warn' : x.estado);
        const decorar = (x) => ({ ...x, key: x.titulo, ...ESTILO[estilo(x)], claseStatus: 'chk-status chk-status-' + estilo(x), hayBarras: !!(x.barras && x.barras.length),
            skillTxt: x.skill ? 'Skill aplicada · ' + x.skill : '',
            barras: (x.barras || []).map((b) => ({ ...b, estilo: `height:${b.alto}px`, clase: 'chk-barra' + (b.actual ? (b.aviso ? ' chk-barra-aviso' : ' chk-barra-actual') : '') })) });
        return [['f', 'Riesgo fiscal', 'chk-grupo chk-grupo-f'], ['o', 'Riesgo operativo', 'chk-grupo chk-grupo-o']].map(([k, label, clase]) => {
            const its = visibles.filter((x) => x.k === k).sort((a, b) => mala(b) - mala(a));
            const nb = its.filter(conIncidencia).length;
            const subs = k === 'f'
                ? SUBGRUPOS.map(([sk, sl, titulos]) => {
                    const si = its.filter((x) => titulos.includes(x.titulo));
                    const sb = si.filter(conIncidencia).length;
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

    elegirFiltro(e) { this._filtro = e.currentTarget.dataset.k; }
    buscar(e) { this.busqueda = e.target.value || ''; }
    toggleSub(e) {
        const k = e.currentTarget.dataset.k;
        this.cerrados = { ...this.cerrados, [k]: !this.cerrados[k] };
    }
}
