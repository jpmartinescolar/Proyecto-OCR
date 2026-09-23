import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getFilterOptions from '@salesforce/apex/BalanceController.getFilterOptions';
import generar from '@salesforce/apex/BalanceController.generar';
import getMovimientos from '@salesforce/apex/PyGController.getMovimientos';
import updateMovimiento from '@salesforce/apex/PyGMensualController.updateMovimiento';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class BalanceSituacion extends NavigationMixin(LightningElement) {

    @track empresasTitulares = [];
    @track area = '';
    @track directorFacturacionId = null;
    @track planPGC = 'PGC PYMES';

    @track fechaDesde;
    @track fechaHasta;
    @track fechaCompDesde;
    @track fechaCompHasta;

    @track avisosParams = null;

    @track simulacion = 'Todas';
    @track extraordinarios = 'No';
    @track check = 'Todos';
    @track desplegado = 'No';       // Si = expandir todos los apartados (plan completo)
    @track balanceOficial = true;   // por defecto vista oficial
    @track conComparativo = true;   // interruptor: mostrar u ocultar el ejercicio comparado

    @track loading = false;
    @track generated = false;
    @track error;
    @track rows = [];
    @track expandedKeys = [];

    @track empresaOptionsBase = [];
    @track areaOptions = [];
    @track planOptions = [];

    @track showEmpresaDropdown = false;
    @track empresaFiltroBusqueda = '';

    // Modal de exportación a PDF
    @track showExportDialog = false;
    @track exportConComparativo = true;
    @track exportDesglosado = false;

    // Modal
    @track showModal = false;
    @track modalLoading = false;
    @track modalError;
    @track modalTitulo = '';
    @track modalSubtitulo = '';
    @track modalImporte = '';
    @track modalMovimientos = [];

    connectedCallback() {
        const y = new Date().getFullYear();
        this.fechaDesde     = `${y}-01-01`;
        this.fechaHasta     = `${y}-12-31`;
        this.fechaCompDesde = `${y - 1}-01-01`;
        this.fechaCompHasta = `${y - 1}-12-31`;
    }

    @wire(getFilterOptions)
    wiredOpts({ data, error }) {
        if (data) {
            this.empresaOptionsBase = (data.empresasTitulares || []).map(v => ({ label: v, value: v }));
            this.areaOptions = [{ label: 'Todas', value: '' }, ...((data.areas || []).map(v => ({ label: v, value: v })))];
            this.planOptions = (data.planesPGC || []).map(v => ({ label: v, value: v }));
        } else if (error) {
            this.error = this.reduceError(error);
        }
    }

    // -------------------------------------------------- getters de contexto
    get hasError()   { return !!this.error; }
    get hasRows()    { return this.generated && this.rows && this.rows.length > 0; }
    get emptyState() { return this.generated && (!this.rows || this.rows.length === 0); }
    get currencySimbolo() { return 'EUR'; }
    get showInicial() { return !this.generated && !this.loading && !this.hasError; }
    get textoInicial() {
        const f = [];
        if (this.empresasTitulares.length === 0) f.push('la(s) empresa(s) titular(es)');
        if (this.fechasIncompletas) f.push(this.conComparativo ? 'las cuatro fechas (periodo y comparativo)' : 'las fechas Desde y Hasta');
        if (!f.length) return 'Pulsa';
        return 'Selecciona ' + f.join(' y ') + ' y pulsa';
    }

    get empresaLabel() {
        if (!this.empresasTitulares.length) return '—';
        if (this.empresasTitulares.length === 1) return this.empresasTitulares[0];
        return `${this.empresasTitulares.length} empresas seleccionadas`;
    }
    get fechasIncompletas() {
        if (!this.fechaDesde || !this.fechaHasta) return true;
        return this.conComparativo && (!this.fechaCompDesde || !this.fechaCompHasta);
    }
    get periodoLabel()     { return `${this.fmtFecha(this.fechaDesde)} – ${this.fmtFecha(this.fechaHasta)}`; }
    get comparativoLabel() { return `${this.fmtFecha(this.fechaCompDesde)} – ${this.fmtFecha(this.fechaCompHasta)}`; }
    get headerActualLabel()    { return this.periodoLabel; }
    get headerComparadoLabel() { return this.comparativoLabel; }

    // -------------------------------------------------- multi-select empresa
    get empresaOptionsFiltradas() {
        const term = (this.empresaFiltroBusqueda || '').toLowerCase().trim();
        return (this.empresaOptionsBase || [])
            .filter(o => !term || o.label.toLowerCase().includes(term))
            .map(o => ({ ...o, optionClass: this.empresasTitulares.includes(o.value)
                ? 'pyg-ms-option pyg-ms-option-selected' : 'pyg-ms-option' }));
    }
    get empresaTriggerLabel() {
        if (!this.empresasTitulares.length) return 'Selecciona empresa...';
        if (this.empresasTitulares.length === 1) return this.empresasTitulares[0];
        return `${this.empresasTitulares.length} empresas seleccionadas`;
    }
    get empresaTriggerClass() { return this.empresasTitulares.length ? 'pyg-ms-trigger pyg-ms-trigger-filled' : 'pyg-ms-trigger'; }
    get empresaDropdownClass() { return this.showEmpresaDropdown ? 'pyg-ms-wrap pyg-ms-wrap-open' : 'pyg-ms-wrap'; }
    get empresaCount() { return `${this.empresasTitulares.length} / ${this.empresaOptionsBase.length}`; }

    toggleEmpresaDropdown(e) {
        e.stopPropagation();
        this.showEmpresaDropdown = !this.showEmpresaDropdown;
        if (this.showEmpresaDropdown) this.empresaFiltroBusqueda = '';
    }
    closeEmpresaDropdown() { this.showEmpresaDropdown = false; }
    stopProp(e) { e.stopPropagation(); }
    handleEmpresaBusqueda(e) { this.empresaFiltroBusqueda = e.target.value || ''; }
    handleEmpresaToggle(e) {
        const val = e.currentTarget.dataset.value;
        if (!val) return;
        const set = new Set(this.empresasTitulares);
        if (set.has(val)) set.delete(val); else set.add(val);
        this.empresasTitulares = Array.from(set);
    }
    handleEmpresaSelectAll() { this.empresasTitulares = this.empresaOptionsBase.map(o => o.value); }
    handleEmpresaClearAll()  { this.empresasTitulares = []; }

    // -------------------------------------------------- toggles
    handleAreaChange(e) { this.area = e.detail.value; }
    handlePlanChange(e) { this.planPGC = e.detail.value; this.handleRefresh(); }
    handleDirectorChange(e) { this.directorFacturacionId = e.detail && e.detail.recordId ? e.detail.recordId : null; }
    handleFechaDesdeChange(e)     { this.fechaDesde = e.detail.value || null; }
    handleFechaHastaChange(e)     { this.fechaHasta = e.detail.value || null; }
    handleFechaCompDesdeChange(e) { this.fechaCompDesde = e.detail.value || null; }
    handleFechaCompHastaChange(e) { this.fechaCompHasta = e.detail.value || null; }

    toggleBalanceOficial() {
        this.balanceOficial = !this.balanceOficial;
        if (this.balanceOficial) { this.simulacion = 'Todas'; this.extraordinarios = 'No'; }
        else { this.simulacion = 'No'; this.extraordinarios = 'Todas'; }   // vista analítica
        this.handleRefresh();
    }
    get balanceSwitchClass() { return this.balanceOficial ? 'pyg-switch pyg-switch-on' : 'pyg-switch'; }

    // Interruptor "Comparativo": muestra u oculta el ejercicio comparado (columnas y fechas)
    toggleComparativo() { this.conComparativo = !this.conComparativo; }
    get compSwitchClass() { return this.conComparativo ? 'pyg-switch pyg-switch-on' : 'pyg-switch'; }
    // Sin comparativo la columna de importes mantiene su ancho y posición (el hueco va a la derecha)
    get tablaClass() { return this.conComparativo ? 'pyg-tabla' : 'pyg-tabla pyg-tabla-sincomp'; }
    get lockedLabelCls() { return this.balanceOficial ? 'pyg-toggle-label pyg-label-dim' : 'pyg-toggle-label'; }

    setSimulacion(e)      { if (this.balanceOficial) return; this.simulacion = e.currentTarget.dataset.value; this.handleRefresh(); }
    setExtraordinarios(e) { if (this.balanceOficial) return; this.extraordinarios = e.currentTarget.dataset.value; this.handleRefresh(); }
    setCheck(e)           { if (this.balanceOficial) return; this.check = e.currentTarget.dataset.value; this.handleRefresh(); }

    get simTodasCls() { return this.toggleCls(this.simulacion === 'Todas'); }
    get simNoCls()    { return this.toggleCls(this.simulacion === 'No'); }
    get simIvaCls()   { return this.toggleCls(this.simulacion === 'Si'); }
    get simTransfCls(){ return this.toggleCls(this.simulacion === 'Sí. Transferencia'); }
    get extTodasCls() { return this.toggleCls(this.extraordinarios === 'Todas'); }
    get extSiCls()    { return this.toggleCls(this.extraordinarios === 'Si'); }
    get extNoCls()    { return this.toggleCls(this.extraordinarios === 'No'); }
    get chkTodosCls() { return this.toggleCls(this.check === 'Todos'); }
    get chkSiCls()    { return this.toggleCls(this.check === 'Si'); }
    get chkNoCls()    { return this.toggleCls(this.check === 'No'); }
    get despSiCls()   { return this.toggleCls(this.desplegado === 'Si'); }
    get despNoCls()   { return this.toggleCls(this.desplegado === 'No'); }
    toggleCls(active) { return active ? 'pyg-toggle pyg-toggle-active' : 'pyg-toggle'; }

    setDesplegado(e) { this.desplegado = e.currentTarget.dataset.value; this.aplicarDesplegado(); }
    // Recalcula qué filas están expandidas según el modo Desplegado
    aplicarDesplegado() {
        if (!this.rows || !this.rows.length) return;
        if (this.desplegado === 'Si') {
            this.expandedKeys = this.rows.filter(r => r.tieneHijos).map(r => r.key);
        } else {
            this.expandedKeys = this.rows.filter(r => r.tipo === 'AGG' && r.nivel <= 1).map(r => r.key);
        }
    }

    // -------------------------------------------------- GENERAR
    handleGenerar() {
        const faltan = [];
        if (this.empresasTitulares.length === 0) faltan.push('empresa titular');
        if (this.fechasIncompletas) faltan.push(this.conComparativo ? 'las cuatro fechas' : 'las fechas Desde y Hasta');
        if (faltan.length) { this.error = `Debes seleccionar ${faltan.join(' y ')}.`; return; }
        this.error = null;
        this.loading = true;
        this.generated = false;
        generar({
            empresasTitulares: this.empresasTitulares,
            area: this.area || null,
            directorFacturacionId: this.directorFacturacionId,
            fechaDesde: this.fechaDesde,
            fechaHasta: this.fechaHasta,
            fechaCompDesde: this.fechaCompDesde || this.fechaDesde,
            fechaCompHasta: this.fechaCompHasta || this.fechaHasta,
            planPGC: this.planPGC,
            simulacion: this.simulacion,
            extraordinarios: this.extraordinarios,
            check: this.check
        })
        .then(result => {
            this.rows = result || [];
            // expandir según el modo Desplegado (No = solo grupos A/B/C; Si = todo)
            this.aplicarDesplegado();
            this.avisosParams = {
                empresas: [...this.empresasTitulares],
                desde: this.fechaDesde,
                hasta: this.fechaHasta,
                desdeComparativa: this.fechaCompDesde || this.fechaDesde,
                hastaComparativa: this.fechaCompHasta || this.fechaHasta
            };
            this.generated = true;
        })
        .catch(err => { this.error = this.reduceError(err); this.rows = []; this.generated = true; })
        .finally(() => { this.loading = false; });
    }
    handleRefresh() { if (this.generated) this.handleGenerar(); }

    // -------------------------------------------------- EXPORTAR A PDF (Visualforce renderAs=pdf)
    handleExportClick() {
        const faltan = [];
        if (this.empresasTitulares.length === 0) faltan.push('empresa titular');
        if (!this.fechaDesde || !this.fechaHasta) faltan.push('fechas del periodo');
        if (faltan.length) {
            this.error = `Antes de exportar debes seleccionar ${faltan.join(' y ')}.`;
            return;
        }
        this.error = null;
        // Defaults según la vista actual
        this.exportConComparativo = this.conComparativo && !!(this.fechaCompDesde && this.fechaCompHasta);
        this.exportDesglosado = (this.desplegado === 'Si');
        this.showExportDialog = true;
    }
    closeExportDialog() { this.showExportDialog = false; }

    setExportComp(e) { this.exportConComparativo = (e.currentTarget.dataset.value === 'Si'); }
    setExportDesg(e) { this.exportDesglosado     = (e.currentTarget.dataset.value === 'Si'); }

    get expCompSiCls() { return this.expCls(this.exportConComparativo === true); }
    get expCompNoCls() { return this.expCls(this.exportConComparativo === false); }
    get expDesgSiCls() { return this.expCls(this.exportDesglosado === true); }
    get expDesgNoCls() { return this.expCls(this.exportDesglosado === false); }
    expCls(active) { return active ? 'pyg-pill pyg-pill-active' : 'pyg-pill'; }

    buildExportUrl() {
        if (this.exportConComparativo && (!this.fechaCompDesde || !this.fechaCompHasta)) {
            this.error = 'Para incluir comparativo debes informar Comparativo desde y hasta.';
            this.showExportDialog = false;
            return null;
        }
        const p = new URLSearchParams();
        p.append('e',  this.empresasTitulares.join('|'));
        p.append('d1', this.fechaDesde);
        p.append('d2', this.fechaHasta);
        p.append('cc', this.exportConComparativo ? '1' : '0');
        p.append('dg', this.exportDesglosado ? '1' : '0');
        if (this.exportConComparativo) {
            p.append('c1', this.fechaCompDesde);
            p.append('c2', this.fechaCompHasta);
        }
        p.append('p', this.planPGC);
        p.append('s', this.simulacion);
        p.append('x', this.extraordinarios);
        p.append('chk', this.check);
        if (this.area) p.append('a', this.area);
        if (this.directorFacturacionId) p.append('di', this.directorFacturacionId);
        return '/apex/BalanceExportPDF?' + p.toString();
    }

    confirmarExport() {
        const url = this.buildExportUrl();
        if (!url) return;
        this.showExportDialog = false;
        window.open(url, '_blank');
    }

    // Previsualizar: el PDF se abre inline en una pestaña nueva (sin descargarse)
    previsualizarExport() {
        const url = this.buildExportUrl();
        if (!url) return;
        this.showExportDialog = false;
        window.open(url + '&pv=1', '_blank');
    }

    // -------------------------------------------------- vista de filas (árbol)
    get filasView() {
        const exp = new Set(this.expandedKeys || []);
        const visible = {};
        const out = [];
        (this.rows || []).forEach((r, idx) => {
            let vis;
            if (!r.parentKey) vis = true;
            else vis = (visible[r.parentKey] === true) && exp.has(r.parentKey);
            visible[r.key] = vis;
            if (vis) out.push(this.mapFila(r, idx, exp));
        });
        return out;
    }

    mapFila(r, idx, exp) {
        const a = this.toNum(r.valorActual);
        const c = this.toNum(r.valorComparado);
        const delta = (a || 0) - (c || 0);
        let deltaPct = null;
        if (c != null && c !== 0) deltaPct = (delta / Math.abs(c)) * 100;

        const esBanda = r.tipo === 'BANDA';
        const clickable = !esBanda && r.cuentaIds && r.cuentaIds.length > 0;
        const isExpanded = exp.has(r.key);

        return {
            key: r.key || ('r' + idx),
            tipo: r.tipo,
            esBanda,
            rowClass: this.rowClass(r),
            indentStyle: `padding-left:${0.6 + (r.nivel || 0) * 1.1}rem`,
            concepto: r.concepto,
            conceptoClass: 'pyg-concepto' + (r.tieneHijos ? ' bal-concepto-click' : ''),
            tieneHijos: r.tieneHijos,
            chevronClass: isExpanded ? 'bal-chevron bal-chevron-open' : 'bal-chevron',
            showCodigo: r.tipo === 'CUENTA' && !!r.codigoCuenta,
            codigo: r.codigoCuenta,
            cuentaId: r.cuentaId || null,
            // celdas
            actualValue: esBanda ? '' : this.fmtCurrency(a),
            actualClass: this.cellClass(a, clickable),
            comparadoValue: esBanda ? '' : this.fmtCurrency(c),
            comparadoClass: this.cellClass(c, clickable),
            deltaValue: esBanda ? '' : this.fmtCurrencySigned(delta),
            deltaClass: this.deltaCellClass(delta),
            deltaPctValue: esBanda ? '' : (deltaPct == null ? '—' : this.fmtPct(deltaPct, true)),
            deltaPctBadgeClass: this.deltaPctBadgeClass(deltaPct),
            clickable
        };
    }

    handleConceptoClick(e) {
        const k = e.currentTarget.dataset.key;
        if (!k) return;
        const row = this.rows.find(r => r.key === k);
        if (!row || !row.tieneHijos) return;
        const set = new Set(this.expandedKeys);
        if (set.has(k)) set.delete(k); else set.add(k);
        this.expandedKeys = Array.from(set);
    }

    // ---- Cuadre del balance: Activo = Patrimonio Neto + Pasivo ----
    get cuadre() {
        if (!this.hasRows) return null;
        const act = this.rows.find(r => r.key === 'ACTIVO');
        const pas = this.rows.find(r => r.key === 'PASIVO');
        if (!act || !pas) return null;
        const aA = this.toNum(act.valorActual) || 0;
        const pA = this.toNum(pas.valorActual) || 0;
        const aC = this.toNum(act.valorComparado) || 0;
        const pC = this.toNum(pas.valorComparado) || 0;
        const dA = aA - pA;
        const dC = aC - pC;
        const okA = Math.abs(dA) < 0.01;
        const okC = Math.abs(dC) < 0.01;
        // Sin comparativo visible solo se valora el cuadre del periodo actual
        const ok = this.conComparativo ? (okA && okC) : okA;
        return {
            ok,
            showComp: this.conComparativo,
            boxClass: ok ? 'bal-cuadre bal-cuadre-ok' : 'bal-cuadre bal-cuadre-bad',
            activoActual: this.fmtCurrency(aA),
            pasivoActual: this.fmtCurrency(pA),
            difActual: this.fmtCurrencySigned(dA),
            okActual: okA,
            activoComp: this.fmtCurrency(aC),
            pasivoComp: this.fmtCurrency(pC),
            difComp: this.fmtCurrencySigned(dC),
            okComp: okC
        };
    }

    rowClass(r) {
        if (r.tipo === 'BANDA')  return r.key === 'SALTO2' ? 'pyg-row bal-banda bal-banda-sep' : 'pyg-row bal-banda';
        if (r.tipo === 'TOTAL')  return 'pyg-row bal-total';
        if (r.nivel <= 1)        return 'pyg-row bal-grupo';
        if (r.tipo === 'AGG' || r.tipo === 'HOJA') return 'pyg-row bal-agg';
        return 'pyg-row pyg-cuenta';
    }
    cellClass(v, clickable) {
        const base = clickable ? 'pyg-cell pyg-clickable' : 'pyg-cell';
        const n = (typeof v === 'number') ? v : Number(v);
        if (n == null || Number.isNaN(n) || n === 0) return base + ' pyg-zero';
        if (n < 0) return base + ' pyg-neg';
        return base + ' pyg-pos';
    }
    deltaCellClass(v) {
        const base = 'pyg-cell pyg-delta';
        if (v == null || v === 0) return base + ' pyg-zero';
        if (v > 0) return base + ' pyg-delta-pos';
        return base + ' pyg-delta-neg';
    }
    deltaPctBadgeClass(v) {
        if (v == null || v === 0) return 'pyg-cell pyg-delta-pct';
        if (v > 0) return 'pyg-cell pyg-delta-pct pyg-pct-pos';
        return 'pyg-cell pyg-delta-pct pyg-pct-neg';
    }

    // -------------------------------------------------- MODAL
    handleAmountClick(e) {
        const rowKey = e.currentTarget.dataset.rowkey;
        const periodo = e.currentTarget.dataset.periodo;
        const importe = e.currentTarget.dataset.value;
        const row = this.rows.find(r => r.key === rowKey);
        if (!row || !row.cuentaIds || !row.cuentaIds.length) return;

        const desde = periodo === 'comparado' ? this.fechaCompDesde : this.fechaDesde;
        const hasta = periodo === 'comparado' ? this.fechaCompHasta : this.fechaHasta;

        this.modalTitulo = row.concepto || '';
        this.modalSubtitulo = `${this.fmtFecha(desde)} – ${this.fmtFecha(hasta)}` + (periodo === 'comparado' ? ' (comparativo)' : '');
        this.modalImporte = importe;
        this.modalMovimientos = [];
        this.modalError = null;
        this.showModal = true;
        this.modalLoading = true;

        getMovimientos({
            cuentaIds: row.cuentaIds,
            desde, hasta,
            empresasTitulares: this.empresasTitulares,
            area: this.area || null,
            directorFacturacionId: this.directorFacturacionId,
            simulacion: this.simulacion,
            extraordinarios: this.extraordinarios,
            check: this.check,
            excluirTipos: ['Asiento de cierre']
        })
        .then(result => {
            this.modalMovimientos = (result || []).map((m, i) => ({
                key: 'mv' + i,
                recordId: m.recordId,
                extraordinario: !!m.extraordinario,
                objectApiName: m.extraordinario ? 'Apuntes_extraodinarios__c' : 'Linea_asiento_contable__c',
                fecha: this.fmtFecha(m.fecha),
                numero: m.numero || '',
                descripcion: m.descripcion || '',
                descLinkId: m.descLinkId || null,
                descLinkObject: m.descLinkObject || null,
                descLinkTitle: m.descLinkTitle || '',
                debe: this.fmtCurrency(m.debe),
                haber: this.fmtCurrency(m.haber),
                tipoAsiento: m.tipoAsiento || '',
                empresaTitular: m.empresaTitular || '',
                area: m.area || '',
                directorFacturacionId: m.directorFacturacionId || null,
                simulacion: m.simulacion || '',
                checkValue: m.checkValue || '',
                campaniaId: m.campaniaId || null
            }));
        })
        .catch(err => { this.modalError = this.reduceError(err); })
        .finally(() => { this.modalLoading = false; });
    }
    closeModal() { this.showModal = false; this.modalMovimientos = []; }

    get areaEditOptions() {
        const real = (this.areaOptions || []).filter(o => o.value);
        return [{ label: '— sin asignar —', value: '' }, ...real];
    }
    get simulacionEditOptions() {
        return [{ label: '— sin asignar —', value: '' }, { label: 'No', value: 'No' },
            { label: 'Sí', value: 'Si' }, { label: 'Sí. Transferencia', value: 'Sí. Transferencia' }];
    }
    get checkEditOptions() {
        return [{ label: '— sin asignar —', value: '' }, { label: 'No', value: 'No' }, { label: 'Sí', value: 'Si' }];
    }
    handleModalEdit(e) {
        const rid = e.currentTarget.dataset.rid;
        const fld = e.currentTarget.dataset.fld;
        const value = e.detail.value;
        const idx = this.modalMovimientos.findIndex(m => m.recordId === rid);
        if (idx < 0) return;
        const mv = { ...this.modalMovimientos[idx] };
        if (fld === 'area') mv.area = value;
        if (fld === 'simulacion') mv.simulacion = value;
        if (fld === 'check') mv.checkValue = value;
        this.modalMovimientos[idx] = mv;
        this.modalMovimientos = [...this.modalMovimientos];
        this.saveMovimientoInline(mv);
    }
    handleModalEditDirector(e) {
        const rid = e.currentTarget.dataset.rid;
        const directorId = e.detail && e.detail.recordId ? e.detail.recordId : null;
        const idx = this.modalMovimientos.findIndex(m => m.recordId === rid);
        if (idx < 0) return;
        const mv = { ...this.modalMovimientos[idx], directorFacturacionId: directorId };
        this.modalMovimientos[idx] = mv;
        this.modalMovimientos = [...this.modalMovimientos];
        this.saveMovimientoInline(mv);
    }
    handleModalEditCampania(e) {
        const rid = e.currentTarget.dataset.rid;
        const campaniaId = e.detail && e.detail.recordId ? e.detail.recordId : null;
        const idx = this.modalMovimientos.findIndex(m => m.recordId === rid);
        if (idx < 0) return;
        const mv = { ...this.modalMovimientos[idx], campaniaId: campaniaId };
        this.modalMovimientos[idx] = mv;
        this.modalMovimientos = [...this.modalMovimientos];
        this.saveMovimientoInline(mv);
    }
    saveMovimientoInline(mv) {
        updateMovimiento({
            recordId: mv.recordId,
            esExtraordinario: !!mv.extraordinario,
            area: mv.area || null,
            directorFacturacionId: mv.directorFacturacionId || null,
            simulacion: mv.simulacion || null,
            checkValue: mv.checkValue || null,
            campaniaId: mv.campaniaId || null
        })
        .then(() => this.dispatchEvent(new ShowToastEvent({ title: 'Guardado', message: 'Apunte actualizado', variant: 'success', mode: 'pester' })))
        .catch(err => this.dispatchEvent(new ShowToastEvent({ title: 'Error al guardar', message: this.reduceError(err), variant: 'error' })));
    }

    get hasMovimientos()    { return !!(this.modalMovimientos && this.modalMovimientos.length); }
    get noMovimientos()     { return !this.modalLoading && !this.modalError && !this.hasMovimientos; }
    get modalContentReady() { return !this.modalLoading && !this.modalError && this.hasMovimientos; }

    // Limpiar: vuelve al estado inicial (filtros por defecto, sin resultados)
    handleLimpiar() {
        this.empresasTitulares = [];
        this.area = '';
        this.directorFacturacionId = null;
        this.planPGC = 'PGC PYMES';
        const y = new Date().getFullYear();
        this.fechaDesde     = `${y}-01-01`;
        this.fechaHasta     = `${y}-12-31`;
        this.fechaCompDesde = `${y - 1}-01-01`;
        this.fechaCompHasta = `${y - 1}-12-31`;
        this.simulacion = 'Todas';
        this.extraordinarios = 'No';
        this.check = 'Todos';
        this.desplegado = 'No';
        this.balanceOficial = true;
        this.conComparativo = true;
        this.generated = false;
        this.loading = false;
        this.error = null;
        this.rows = [];
        this.expandedKeys = [];
        this.avisosParams = null;
        this.template.querySelectorAll('lightning-record-picker')
            .forEach(p => { if (p.clearSelection) p.clearSelection(); });
    }

    navigateToRecordNewTab(e) {
        e.preventDefault();
        e.stopPropagation();
        const recordId = e.currentTarget.dataset.recordid;
        const objectApiName = e.currentTarget.dataset.objectname;
        if (!recordId || !objectApiName) return;
        this[NavigationMixin.GenerateUrl]({
            type: 'standard__recordPage',
            attributes: { recordId, objectApiName, actionName: 'view' }
        }).then(url => {
            // Cuenta contable: arrastra empresas titulares y fechas (filtro normal, no el comparativo)
            if (objectApiName === 'Plan_general_contable__c') {
                const params = [];
                if (this.empresasTitulares.length) {
                    params.push('c__empresas=' + encodeURIComponent(JSON.stringify(this.empresasTitulares)));
                }
                if (this.fechaDesde) params.push('c__desde=' + encodeURIComponent(this.fechaDesde));
                if (this.fechaHasta) params.push('c__hasta=' + encodeURIComponent(this.fechaHasta));
                if (params.length) url += (url.includes('?') ? '&' : '?') + params.join('&');
            }
            window.open(url, '_blank');
        });
    }

    // -------------------------------------------------- FORMATO
    toNum(v) {
        if (v == null || v === '') return null;
        if (typeof v === 'number') return v;
        const n = Number(v);
        return Number.isNaN(n) ? null : n;
    }
    fmtCurrency(v) {
        const n = this.toNum(v);
        if (n == null) return '0,00 €';
        return this.fmtNumber(n, 2) + ' €';
    }
    fmtCurrencySigned(v) {
        const n = this.toNum(v);
        if (n == null || n === 0) return '0,00 €';
        const sign = n > 0 ? '+' : '';
        return sign + this.fmtNumber(n, 2) + ' €';
    }
    fmtNumber(v, decimals) {
        const n = this.toNum(v);
        if (n == null) return '0';
        const sign = n < 0 ? '-' : '';
        const abs = Math.abs(n).toFixed(decimals);
        const parts = abs.split('.');
        const intDots = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return decimals > 0 ? `${sign}${intDots},${parts[1]}` : `${sign}${intDots}`;
    }
    fmtPct(v, withSign) {
        const n = this.toNum(v);
        if (n == null) return null;
        const sign = withSign && n > 0 ? '+' : '';
        return `${sign}${this.fmtNumber(n, 1)}%`;
    }
    fmtFecha(d) {
        if (!d) return '';
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
        return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
    }

    reduceError(err) {
        if (!err) return 'Error desconocido';
        if (typeof err === 'string') return err;
        if (err.body) {
            if (Array.isArray(err.body)) return err.body.map(e => e.message).join(', ');
            if (err.body.message) return err.body.message;
        }
        return JSON.stringify(err);
    }
}