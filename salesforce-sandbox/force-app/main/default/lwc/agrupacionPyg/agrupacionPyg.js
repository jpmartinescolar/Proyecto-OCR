import { LightningElement, track } from 'lwc';

export default class AgrupacionPyg extends LightningElement {

    @track tab = 'pyg';
    // Cada pestaña se instancia la primera vez que se visita y después se
    // mantiene viva (oculta con CSS) para no perder filtros ni resultados.
    @track visited = { pyg: true, mensual: false, analitico: false, grupo: false, historico: false };

    setTab(e) {
        const v = e.currentTarget.dataset.value;
        this.tab = v;
        if (!this.visited[v]) {
            this.visited = { ...this.visited, [v]: true };
        }
    }

    tabCls(v)   { return this.tab === v ? 'apyg-tab apyg-tab-active' : 'apyg-tab'; }
    panelCls(v) { return this.tab === v ? 'apyg-panel' : 'apyg-panel apyg-hidden'; }

    get tabPygCls()       { return this.tabCls('pyg'); }
    get tabMensualCls()   { return this.tabCls('mensual'); }
    get tabAnaliticoCls() { return this.tabCls('analitico'); }
    get tabGrupoCls()     { return this.tabCls('grupo'); }
    get tabHistoricoCls() { return this.tabCls('historico'); }

    get panelPygCls()       { return this.panelCls('pyg'); }
    get panelMensualCls()   { return this.panelCls('mensual'); }
    get panelAnaliticoCls() { return this.panelCls('analitico'); }
    get panelGrupoCls()     { return this.panelCls('grupo'); }
    get panelHistoricoCls() { return this.panelCls('historico'); }

    get visitedPyg()       { return this.visited.pyg; }
    get visitedMensual()   { return this.visited.mensual; }
    get visitedAnalitico() { return this.visited.analitico; }
    get visitedGrupo()     { return this.visited.grupo; }
    get visitedHistorico() { return this.visited.historico; }
}