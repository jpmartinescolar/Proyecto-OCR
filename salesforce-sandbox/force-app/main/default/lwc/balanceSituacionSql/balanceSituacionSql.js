import { LightningElement, track } from 'lwc';
import getEmpresas from '@salesforce/apex/PyGSqlController.getEmpresas';
import generar from '@salesforce/apex/BalanceSqlController.generar';

/**
 * Balance de Situación sobre la contabilidad externa de Sage (SQL Server vía
 * Skyvia). Clon de balanceSituacion sin los filtros de Salesforce (empresa
 * titular, área, director, simulación, extraordinarios, check) ni modal de
 * apuntes: el filtro es la empresa de Sage, las fechas y el plan del PGC;
 * la presentación del cuadro y el cuadre son los mismos.
 */
export default class BalanceSituacionSql extends LightningElement {

    @track codigosEmpresa = [];      // códigos (String) de las empresas seleccionadas
    @track empresaOptionsBase = [];
    @track showEmpresaDropdown = false;
    @track empresaFiltroBusqueda = '';
    @track empresaSoloSeleccionadas = false;
    @track cargandoEmpresas = false;         // la consulta de empresas a Sage está en curso

    @track planPGC = 'PGC PYMES';
    @track fechaDesde;
    @track fechaHasta;
    @track fechaCompDesde;
    @track fechaCompHasta;

    @track desplegado = 'No';       // Si = expandir todos los apartados (plan completo)
    @track conComparativo = true;   // interruptor: mostrar u ocultar el ejercicio comparado

    @track loading = false;
    @track generated = false;
    @track error;
    @track rows = [];
    @track expandedKeys = [];

    connectedCallback() {
        const y = new Date().getFullYear();
        this.fechaDesde     = `${y}-01-01`;
        this.fechaHasta     = `${y}-12-31`;
        this.fechaCompDesde = `${y - 1}-01-01`;
        this.fechaCompHasta = `${y - 1}-12-31`;
        this.cargarEmpresas();
    }

    cargarEmpresas() {
        this.cargandoEmpresas = true;
        getEmpresas()
            .then(res => {
                this.empresaOptionsBase = (res || []).map(e => ({
                    label: `${e.nombre} (${e.codigo})`,
                    value: String(e.codigo)
                }));
            })
            .catch(err => { this.error = this.reduceError(err); })
            .finally(() => { this.cargandoEmpresas = false; });
    }

    get planOptions() {
        return [
            { label: 'PGC Normal', value: 'PGC Normal' },
            { label: 'PGC Abreviado', value: 'PGC Abreviado' },
            { label: 'PGC PYMES', value: 'PGC PYMES' }
        ];
    }

    // -------------------------------------------------- multi-select empresa (Sage)
    get empresaOptionsFiltradas() {
        const term = (this.empresaFiltroBusqueda || '').toLowerCase().trim();
        return (this.empresaOptionsBase || [])
            .filter(o => !this.empresaSoloSeleccionadas || this.codigosEmpresa.includes(o.value))
            .filter(o => !term || o.label.toLowerCase().includes(term))
            .map(o => ({
                ...o,
                optionClass: this.codigosEmpresa.includes(o.value)
                    ? 'pyg-ms-option pyg-ms-option-selected'
                    : 'pyg-ms-option'
            }));
    }
    get empresaTriggerLabel() {
        if (!this.codigosEmpresa.length) return 'Selecciona empresa...';
        if (this.codigosEmpresa.length === 1) return this.nombreEmpresa(this.codigosEmpresa[0]);
        return `${this.codigosEmpresa.length} empresas seleccionadas`;
    }
    get empresaTriggerClass() {
        // Con más de una empresa marcada el campo se pinta en amarillo
        if (this.codigosEmpresa.length > 1) return 'pyg-ms-trigger pyg-ms-trigger-filled pyg-ms-trigger-multi';
        return this.codigosEmpresa.length
            ? 'pyg-ms-trigger pyg-ms-trigger-filled'
            : 'pyg-ms-trigger';
    }
    get empresaDropdownClass() {
        return this.showEmpresaDropdown ? 'pyg-ms-wrap pyg-ms-wrap-open' : 'pyg-ms-wrap';
    }
    get empresaCount() {
        if (this.cargandoEmpresas) return 'Buscando empresas...';
        return `${this.codigosEmpresa.length} / ${this.empresaOptionsBase.length}`;
    }
    nombreEmpresa(codigo) {
        const opt = this.empresaOptionsBase.find(o => o.value === codigo);
        return opt ? opt.label : codigo;
    }

    toggleEmpresaDropdown(e) {
        e.stopPropagation();
        this.showEmpresaDropdown = !this.showEmpresaDropdown;
        if (this.showEmpresaDropdown) {
            this.empresaFiltroBusqueda = '';
            this.empresaSoloSeleccionadas = false;
        }
    }
    toggleEmpresaSoloSeleccionadas() {
        this.empresaSoloSeleccionadas = !this.empresaSoloSeleccionadas;
    }
    get empresaSeleccionadasCls() {
        return this.empresaSoloSeleccionadas ? 'pyg-ms-link pygsql-ms-link-activo' : 'pyg-ms-link';
    }
    closeEmpresaDropdown() { this.showEmpresaDropdown = false; }
    stopProp(e)            { e.stopPropagation(); }
    handleEmpresaBusqueda(e) { this.empresaFiltroBusqueda = e.target.value || ''; }

    handleEmpresaToggle(e) {
        const val = e.currentTarget.dataset.value;
        if (!val) return;
        const set = new Set(this.codigosEmpresa);
        if (set.has(val)) set.delete(val); else set.add(val);
        this.codigosEmpresa = Array.from(set);
    }
    handleEmpresaSelectAll() { this.codigosEmpresa = this.empresaOptionsBase.map(o => o.value); }
    handleEmpresaClearAll()  { this.codigosEmpresa = []; }

    // -------------------------------------------------- getters de contexto
    get hasError()   { return !!this.error; }
    get hasRows()    { return this.generated && this.rows && this.rows.length > 0; }
    get emptyState() { return this.generated && (!this.rows || this.rows.length === 0); }
    get currencySimbolo() { return 'EUR'; }
    get showInicial() { return !this.generated && !this.loading && !this.hasError; }
    get textoInicial() {
        const f = [];
        if (!this.codigosEmpresa.length) f.push('la(s) empresa(s)');
        if (this.fechasIncompletas) f.push(this.conComparativo ? 'las cuatro fechas (periodo y comparativo)' : 'las fechas Desde y Hasta');
        if (!f.length) return 'Pulsa';
        return 'Selecciona ' + f.join(' y ') + ' y pulsa';
    }

    get empresaLabel() {
        if (!this.codigosEmpresa.length) return '—';
        if (this.codigosEmpresa.length === 1) return this.nombreEmpresa(this.codigosEmpresa[0]);
        return `${this.codigosEmpresa.length} empresas seleccionadas`;
    }
    get fechasIncompletas() {
        if (!this.fechaDesde || !this.fechaHasta) return true;
        return this.conComparativo && (!this.fechaCompDesde || !this.fechaCompHasta);
    }
    get periodoLabel()     { return `${this.fmtFecha(this.fechaDesde)} – ${this.fmtFecha(this.fechaHasta)}`; }
    get comparativoLabel() { return `${this.fmtFecha(this.fechaCompDesde)} – ${this.fmtFecha(this.fechaCompHasta)}`; }
    get headerActualLabel()    { return this.periodoLabel; }
    get headerComparadoLabel() { return this.comparativoLabel; }

    // -------------------------------------------------- toggles
    handlePlanChange(e) { this.planPGC = e.detail.value; this.handleRefresh(); }
    handleFechaDesdeChange(e)     { this.fechaDesde = e.detail.value || null; }
    handleFechaHastaChange(e)     { this.fechaHasta = e.detail.value || null; }
    handleFechaCompDesdeChange(e) { this.fechaCompDesde = e.detail.value || null; }
    handleFechaCompHastaChange(e) { this.fechaCompHasta = e.detail.value || null; }

    // Interruptor "Comparativo": muestra u oculta el ejercicio comparado (columnas y fechas)
    toggleComparativo() { this.conComparativo = !this.conComparativo; }
    get compSwitchClass() { return this.conComparativo ? 'pyg-switch pyg-switch-on' : 'pyg-switch'; }
    // Sin comparativo la columna de importes mantiene su ancho y posición (el hueco va a la derecha)
    get tablaClass() { return this.conComparativo ? 'pyg-tabla' : 'pyg-tabla pyg-tabla-sincomp'; }

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
        if (!this.codigosEmpresa.length) faltan.push('empresa');
        if (this.fechasIncompletas) faltan.push(this.conComparativo ? 'las cuatro fechas' : 'las fechas Desde y Hasta');
        if (faltan.length) { this.error = `Debes seleccionar ${faltan.join(' y ')}.`; return; }
        this.error = null;
        this.loading = true;
        this.generated = false;
        generar({
            codigosEmpresa: this.codigosEmpresa.map(c => Number(c)),
            fechaDesde: this.fechaDesde,
            fechaHasta: this.fechaHasta,
            fechaCompDesde: this.fechaCompDesde || this.fechaDesde,
            fechaCompHasta: this.fechaCompHasta || this.fechaHasta,
            planPGC: this.planPGC
        })
        .then(result => {
            this.rows = result || [];
            // expandir según el modo Desplegado (No = solo grupos A/B/C; Si = todo)
            this.aplicarDesplegado();
            this.generated = true;
        })
        .catch(err => { this.error = this.reduceError(err); this.rows = []; this.generated = true; })
        .finally(() => { this.loading = false; });
    }
    handleRefresh() { if (this.generated) this.handleGenerar(); }

    // -------------------------------------------------- EXPORTAR A PDF (Visualforce renderAs=pdf)
    @track showExportDialog = false;
    @track exportConComparativo = true;
    @track exportDesglosado = false;

    handleExportClick() {
        const faltan = [];
        if (!this.codigosEmpresa.length) faltan.push('empresa');
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
        p.append('e',  this.codigosEmpresa.join('|'));
        // Nombre sin el código entre paréntesis: en el PDF solo va la razón social
        p.append('en', this.codigosEmpresa
            .map(c => this.nombreEmpresa(c).replace(/\s*\(\d+\)\s*$/, ''))
            .join(', '));
        p.append('d1', this.fechaDesde);
        p.append('d2', this.fechaHasta);
        p.append('cc', this.exportConComparativo ? '1' : '0');
        p.append('dg', this.exportDesglosado ? '1' : '0');
        if (this.exportConComparativo) {
            p.append('c1', this.fechaCompDesde);
            p.append('c2', this.fechaCompHasta);
        }
        p.append('p', this.planPGC);
        return '/apex/BalanceSqlExportPDF?' + p.toString();
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

    // Limpiar: vuelve al estado inicial (filtros por defecto, sin resultados)
    handleLimpiar() {
        this.codigosEmpresa = [];
        this.planPGC = 'PGC PYMES';
        const y = new Date().getFullYear();
        this.fechaDesde     = `${y}-01-01`;
        this.fechaHasta     = `${y}-12-31`;
        this.fechaCompDesde = `${y - 1}-01-01`;
        this.fechaCompHasta = `${y - 1}-12-31`;
        this.desplegado = 'No';
        this.conComparativo = true;
        this.generated = false;
        this.loading = false;
        this.error = null;
        this.rows = [];
        this.expandedKeys = [];
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
            // El código enlaza al libro mayor solo con una única empresa marcada
            mayorLink: r.tipo === 'CUENTA' && !!r.codigoCuenta && this.codigosEmpresa.length === 1,
            codigo: r.codigoCuenta,
            actualValue: esBanda ? '' : this.fmtCurrency(a),
            actualClass: this.cellClass(a),
            comparadoValue: esBanda ? '' : this.fmtCurrency(c),
            comparadoClass: this.cellClass(c),
            deltaValue: esBanda ? '' : this.fmtCurrencySigned(delta),
            deltaClass: this.deltaCellClass(delta),
            deltaPctValue: esBanda ? '' : (deltaPct == null ? '—' : this.fmtPct(deltaPct, true)),
            deltaPctBadgeClass: this.deltaPctBadgeClass(deltaPct)
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

    // Abre el libro mayor de la cuenta pinchada: misma empresa y, con
    // comparativo, el rango que abarca los dos ejercicios
    handleCuentaMayor(e) {
        e.stopPropagation();
        const codigo = e.currentTarget.dataset.codigo;
        if (!codigo || this.codigosEmpresa.length !== 1) return;
        let desde = this.fechaDesde;
        let hasta = this.fechaHasta;
        if (this.conComparativo && this.fechaCompDesde && this.fechaCompDesde < desde) desde = this.fechaCompDesde;
        if (this.conComparativo && this.fechaCompHasta && this.fechaCompHasta > hasta) hasta = this.fechaCompHasta;
        this.dispatchEvent(new CustomEvent('abrirmayor', { detail: {
            codigoEmpresa: Number(this.codigosEmpresa[0]),
            codigoCuenta: codigo,
            fechaDesde: desde,
            fechaHasta: hasta
        } }));
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
    cellClass(v) {
        const base = 'pyg-cell';
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
        return err.message || JSON.stringify(err);
    }
}