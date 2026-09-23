import { LightningElement, track } from 'lwc';
import getEmpresas from '@salesforce/apex/PyGSqlController.getEmpresas';
import generar from '@salesforce/apex/PyGSqlController.generar';

/**
 * Pérdidas y Ganancias sobre la contabilidad externa de Sage (SQL Server vía
 * Skyvia). Clon de perdidasGanancias sin los filtros de Salesforce (empresa
 * titular, área, director, balance oficial, simulación, extraordinarios,
 * check) ni hipervínculos de cuentas: el filtro es la empresa de Sage y las
 * fechas; la lógica de presentación del cuadro es la misma.
 */
export default class PerdidasGananciasSql extends LightningElement {

    @track codigosEmpresa = [];      // códigos (String) de las empresas seleccionadas
    @track empresaOptionsBase = [];
    @track showEmpresaDropdown = false;
    @track empresaFiltroBusqueda = '';
    @track empresaSoloSeleccionadas = false; // ver únicamente las empresas marcadas
    @track cargandoEmpresas = false;         // la consulta de empresas a Sage está en curso

    @track fechaDesde;
    @track fechaHasta;
    @track fechaCompDesde;
    @track fechaCompHasta;

    @track desplegado = 'No';     // Si = mostrar cuentas; No = solo secciones/subtotales
    @track conComparativo = true; // interruptor: mostrar u ocultar el ejercicio comparado

    @track loading = false;
    @track generated = false;
    @track error;
    @track rows = [];
    @track expandedSecciones = [];

    connectedCallback() {
        const today = new Date();
        const y = today.getFullYear();
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

    // --- multi-select de empresas con buscador ---
    get empresaOptionsFiltradas() {
        const term = (this.empresaFiltroBusqueda || '').toLowerCase().trim();
        return (this.empresaOptionsBase || [])
            .filter(o => !this.empresaSoloSeleccionadas || this.codigosEmpresa.includes(o.value))
            .filter(o => !term || o.label.toLowerCase().includes(term))
            .map(o => ({
                ...o,
                selected: this.codigosEmpresa.includes(o.value),
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

    // ---------------------------------------------------------------
    get hasError()    { return !!this.error; }
    get hasRows()     { return this.generated && this.rows && this.rows.length > 0; }
    get emptyState()  { return this.generated && (!this.rows || this.rows.length === 0); }
    get showInicial() { return !this.generated && !this.loading && !this.hasError; }
    get textoInicial() {
        const f = [];
        if (!this.codigosEmpresa.length) f.push('la(s) empresa(s)');
        if (this.fechasIncompletas) f.push(this.conComparativo ? 'las cuatro fechas (periodo y comparativo)' : 'las fechas Desde y Hasta');
        if (!f.length) return 'Pulsa';
        return 'Selecciona ' + f.join(' y ') + ' y pulsa';
    }
    get currencySimbolo() { return 'EUR'; }

    get empresaLabel() {
        if (!this.codigosEmpresa.length) return '—';
        if (this.codigosEmpresa.length === 1) return this.nombreEmpresa(this.codigosEmpresa[0]);
        return `${this.codigosEmpresa.length} empresas seleccionadas`;
    }
    get periodoLabel() {
        return `${this.fmtFecha(this.fechaDesde)} – ${this.fmtFecha(this.fechaHasta)}`;
    }
    get comparativoLabel() {
        return `${this.fmtFecha(this.fechaCompDesde)} – ${this.fmtFecha(this.fechaCompHasta)}`;
    }
    get headerActualLabel()    { return this.periodoLabel; }
    get headerComparadoLabel() { return this.comparativoLabel; }
    get fechasIncompletas() {
        if (!this.fechaDesde || !this.fechaHasta) return true;
        return this.conComparativo && (!this.fechaCompDesde || !this.fechaCompHasta);
    }
    get empresaErrorClass() { return this.codigosEmpresa.length ? '' : 'pyg-required-empty'; }

    // ---------------------------------------------------------------
    //  FORMATO ESPAÑOL
    // ---------------------------------------------------------------
    fmtCurrency(v) {
        const n = (typeof v === 'number') ? v : Number(v);
        if (n == null || Number.isNaN(n)) return '0,00 €';
        return this.fmtNumber(n, 2) + ' €';
    }
    fmtCurrencySigned(v) {
        const n = (typeof v === 'number') ? v : Number(v);
        if (n == null || Number.isNaN(n) || n === 0) return '0,00 €';
        const sign = n > 0 ? '+' : '';
        return sign + this.fmtNumber(n, 2) + ' €';
    }
    fmtNumber(v, decimals) {
        const n = (typeof v === 'number') ? v : Number(v);
        if (n == null || Number.isNaN(n)) return '0';
        const sign = n < 0 ? '-' : '';
        const abs = Math.abs(n);
        const fixed = abs.toFixed(decimals);
        const parts = fixed.split('.');
        const intDots = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return decimals > 0 ? `${sign}${intDots},${parts[1]}` : `${sign}${intDots}`;
    }
    fmtPct(v, withSign) {
        const n = (typeof v === 'number') ? v : Number(v);
        if (n == null || Number.isNaN(n)) return null;
        const sign = withSign && n > 0 ? '+' : '';
        return `${sign}${this.fmtNumber(n, 1)}%`;
    }
    fmtFecha(d) {
        if (!d) return '';
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        return String(d);
    }

    // ---------------------------------------------------------------
    get filasView() {
        const ocultarCuentas = this.desplegado === 'No';
        const expanded = this.expandedSecciones || [];
        const out = [];
        let curSec = null;
        (this.rows || []).forEach((r, idx) => {
            if (r.tipo === 'SECCION') curSec = r.key;
            if (ocultarCuentas && r.tipo === 'CUENTA' && !expanded.includes(curSec)) return;
            out.push(this.mapFila(r, idx, ocultarCuentas, expanded));
        });
        return out;
    }

    mapFila(r, idx, ocultarCuentas, expanded) {
        const a = this.toNum(r.valorActual);
        const c = this.toNum(r.valorComparado);
        const delta = (a == null ? 0 : a) - (c == null ? 0 : c);
        let deltaPct = null;
        if (c != null && c !== 0) deltaPct = (delta / Math.abs(c)) * 100;

        const pa = this.toNum(r.porcentajeActual);
        const pc = this.toNum(r.porcentajeComparado);

        const esSeccion = r.tipo === 'SECCION';
        const expandable = esSeccion && ocultarCuentas;
        const isExpanded = expandable && expanded.includes(r.key);

        let conceptoClass = this.conceptoClass(r);
        if (expandable) {
            conceptoClass += ' pyg-seccion-click' + (isExpanded ? '' : ' pyg-seccion-colapsada');
        }

        return {
            key: r.key || ('r' + idx),
            tipo: r.tipo,
            rowClass: this.rowClass(r),
            conceptoClass: conceptoClass,
            seccionKey: esSeccion ? r.key : null,
            codigo: r.codigoCuenta,
            concepto: r.concepto,
            showCodigo: r.tipo === 'CUENTA' && !!r.codigoCuenta,
            // El código enlaza al libro mayor solo con una única empresa marcada
            // (con varias, el importe agrega empresas y un mayor no lo representa)
            mayorLink: r.tipo === 'CUENTA' && !!r.codigoCuenta && this.codigosEmpresa.length === 1,
            isSubtotal: r.tipo === 'SUBTOTAL',
            isSeccion: esSeccion,
            actualValue: this.fmtCurrency(a),
            actualClass: this.cellClass(a),
            actualPct: this.fmtPct(pa, false),
            comparadoValue: this.fmtCurrency(c),
            comparadoClass: this.cellClass(c),
            comparadoPct: this.fmtPct(pc, false),
            deltaValue: this.fmtCurrencySigned(delta),
            deltaClass: this.deltaCellClass(delta),
            deltaPctValue: deltaPct == null ? '—' : this.fmtPct(deltaPct, true),
            deltaPctBadgeClass: this.deltaPctBadgeClass(deltaPct)
        };
    }

    handleConceptoClick(e) {
        if (this.desplegado !== 'No') return;
        const k = e.currentTarget.dataset.seckey;
        if (!k) return;
        const set = new Set(this.expandedSecciones);
        if (set.has(k)) set.delete(k); else set.add(k);
        this.expandedSecciones = Array.from(set);
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

    rowClass(r) {
        if (r.tipo === 'SECCION')  return 'pyg-row pyg-seccion';
        if (r.tipo === 'SUBTOTAL') return 'pyg-row pyg-subtotal';
        return 'pyg-row pyg-cuenta';
    }
    conceptoClass(r) {
        if (r.tipo === 'SECCION')  return 'pyg-concepto pyg-concepto-seccion';
        if (r.tipo === 'SUBTOTAL') return 'pyg-concepto pyg-concepto-subtotal';
        return 'pyg-concepto pyg-concepto-cuenta';
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
        if (v == null) return 'pyg-cell pyg-delta-pct';
        if (v === 0)   return 'pyg-cell pyg-delta-pct';
        if (v > 0)     return 'pyg-cell pyg-delta-pct pyg-pct-pos';
        return 'pyg-cell pyg-delta-pct pyg-pct-neg';
    }
    toNum(v) {
        if (v == null || v === '') return null;
        if (typeof v === 'number') return v;
        const n = Number(v);
        return Number.isNaN(n) ? null : n;
    }

    // ---------------------------------------------------------------
    //  HANDLERS
    // ---------------------------------------------------------------
    handleFechaDesdeChange(e)     { this.fechaDesde = e.detail.value || null; }
    handleFechaHastaChange(e)     { this.fechaHasta = e.detail.value || null; }
    handleFechaCompDesdeChange(e) { this.fechaCompDesde = e.detail.value || null; }
    handleFechaCompHastaChange(e) { this.fechaCompHasta = e.detail.value || null; }

    toggleComparativo() { this.conComparativo = !this.conComparativo; }
    get compSwitchClass() {
        return this.conComparativo ? 'pyg-switch pyg-switch-on' : 'pyg-switch';
    }
    get tablaClass() {
        return this.conComparativo ? 'pyg-tabla' : 'pyg-tabla pyg-tabla-sincomp';
    }

    setDesplegado(e) { this.desplegado = e.currentTarget.dataset.value; }

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
        return '/apex/PyGSqlExportPDF?' + p.toString();
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
    get despSiCls() { return this.toggleCls(this.desplegado === 'Si'); }
    get despNoCls() { return this.toggleCls(this.desplegado === 'No'); }
    toggleCls(active) { return active ? 'pyg-toggle pyg-toggle-active' : 'pyg-toggle'; }

    // ---------------------------------------------------------------
    //  GENERAR
    // ---------------------------------------------------------------
    handleGenerar() {
        const faltan = [];
        if (!this.codigosEmpresa.length) faltan.push('empresa');
        if (this.fechasIncompletas) faltan.push(this.conComparativo ? 'las cuatro fechas' : 'las fechas Desde y Hasta');
        if (faltan.length) {
            this.error = faltan.length === 1
                ? `Debes seleccionar ${faltan[0]}.`
                : `Debes seleccionar ${faltan.join(' y ')} antes de generar.`;
            return;
        }
        this.error = null;
        this.loading = true;
        this.generated = false;
        generar({
            codigosEmpresa: this.codigosEmpresa.map(c => Number(c)),
            fechaDesde:     this.fechaDesde,
            fechaHasta:     this.fechaHasta,
            fechaCompDesde: this.fechaCompDesde || this.fechaDesde,
            fechaCompHasta: this.fechaCompHasta || this.fechaHasta
        })
        .then(result => {
            this.rows = result || [];
            this.expandedSecciones = [];
            this.generated = true;
        })
        .catch(err => {
            this.error = this.reduceError(err);
            this.rows = [];
            this.generated = true;
        })
        .finally(() => { this.loading = false; });
    }
    handleRefresh() {
        this.cargarEmpresas();   // recoge también las empresas nuevas de Sage
        if (this.generated) this.handleGenerar();
    }

    // Limpiar: vuelve al estado inicial
    handleLimpiar() {
        this.codigosEmpresa = [];
        this.empresaFiltroBusqueda = '';
        this.showEmpresaDropdown = false;
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
        this.expandedSecciones = [];
        this.cargarEmpresas();   // lista de empresas siempre al día
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