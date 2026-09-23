import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getFilterOptions from '@salesforce/apex/PyGController.getFilterOptions';
import generar from '@salesforce/apex/PyGController.generar';
import getMovimientos from '@salesforce/apex/PyGController.getMovimientos';
import updateMovimiento from '@salesforce/apex/PyGMensualController.updateMovimiento';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class PerdidasGanancias extends NavigationMixin(LightningElement) {

    @track empresasTitulares = [];
    @track area = '';
    @track directorFacturacionId = null;
    @track planPGC = 'PGC PYMES';

    @track fechaDesde;
    @track fechaHasta;
    @track fechaCompDesde;
    @track fechaCompHasta;

    @track avisosParams = null;   // entrada para <c-avisos-cuadre>

    @track simulacion = 'Todas';
    @track extraordinarios = 'No';
    @track check = 'Todos';
    @track desplegado = 'No';   // Si = mostrar cuentas; No = solo secciones/subtotales

    @track loading = false;
    @track generated = false;
    @track error;
    @track rows = [];
    @track expandedSecciones = [];   // claves de secciones desplegadas (modo Desplegado=No)
    @track balanceOficial = true;    // interruptor vista oficial (bloquea sim/extra/check), activo por defecto
    @track conComparativo = true;    // interruptor: mostrar u ocultar el ejercicio comparado

    @track empresaOptionsBase = [];
    @track areaOptions = [];
    @track planOptions = [];

    @track showEmpresaDropdown = false;
    @track empresaFiltroBusqueda = '';

    // Modal de detalle de movimientos
    @track showModal = false;
    @track modalLoading = false;
    @track modalError;
    @track modalTitulo = '';
    @track modalSubtitulo = '';
    @track modalImporte = '';
    @track modalMovimientos = [];

    // Modal de exportación a PDF
    @track showExportDialog = false;
    @track exportConComparativo = true;
    @track exportDesglosado = true;

    connectedCallback() {
        const today = new Date();
        const y = today.getFullYear();
        this.fechaDesde     = `${y}-01-01`;
        this.fechaHasta     = `${y}-12-31`;
        this.fechaCompDesde = `${y - 1}-01-01`;
        this.fechaCompHasta = `${y - 1}-12-31`;
    }

    // ---------------------------------------------------------------
    @wire(getFilterOptions)
    wiredOpts({ data, error }) {
        if (data) {
            this.empresaOptionsBase = (data.empresasTitulares || []).map(v => ({ label: v, value: v }));
            this.areaOptions    = [{ label: 'Todas', value: '' }, ...((data.areas || []).map(v => ({ label: v, value: v })))];
            this.planOptions    = (data.planesPGC || []).map(v => ({ label: v, value: v }));
        } else if (error) {
            this.error = this.reduceError(error);
        }
    }

    // ---------------------------------------------------------------
    get hasError()       { return !!this.error; }
    get hasRows()        { return this.generated && this.rows && this.rows.length > 0; }
    get emptyState()     { return this.generated && (!this.rows || this.rows.length === 0); }
    get showInicial()    { return !this.generated && !this.loading && !this.hasError; }
    // Solo nombra lo que falta por informar (las fechas vienen predeterminadas)
    get textoInicial() {
        const f = [];
        if (this.empresasTitulares.length === 0) f.push('la(s) empresa(s) titular(es)');
        if (this.fechasIncompletas) f.push(this.conComparativo ? 'las cuatro fechas (periodo y comparativo)' : 'las fechas Desde y Hasta');
        if (!f.length) return 'Pulsa';
        return 'Selecciona ' + f.join(' y ') + ' y pulsa';
    }
    get currencySimbolo(){ return 'EUR'; }

    get empresaLabel() {
        if (!this.empresasTitulares.length) return '—';
        if (this.empresasTitulares.length === 1) return this.empresasTitulares[0];
        return `${this.empresasTitulares.length} empresas seleccionadas`;
    }
    get periodoLabel() {
        return `${this.fmtFecha(this.fechaDesde)} – ${this.fmtFecha(this.fechaHasta)}`;
    }
    get comparativoLabel() {
        return `${this.fmtFecha(this.fechaCompDesde)} – ${this.fmtFecha(this.fechaCompHasta)}`;
    }
    get headerActualLabel()  { return this.periodoLabel; }
    get headerComparadoLabel() { return this.comparativoLabel; }

    // --- multi-select empresa ---
    get empresaOptionsFiltradas() {
        const term = (this.empresaFiltroBusqueda || '').toLowerCase().trim();
        return (this.empresaOptionsBase || [])
            .filter(o => !term || o.label.toLowerCase().includes(term))
            .map(o => ({
                ...o,
                selected: this.empresasTitulares.includes(o.value),
                optionClass: this.empresasTitulares.includes(o.value)
                    ? 'pyg-ms-option pyg-ms-option-selected'
                    : 'pyg-ms-option'
            }));
    }
    get empresaTriggerLabel() {
        if (!this.empresasTitulares.length) return 'Selecciona empresa...';
        if (this.empresasTitulares.length === 1) return this.empresasTitulares[0];
        return `${this.empresasTitulares.length} empresas seleccionadas`;
    }
    get empresaTriggerClass() {
        return this.empresasTitulares.length
            ? 'pyg-ms-trigger pyg-ms-trigger-filled'
            : 'pyg-ms-trigger';
    }
    get empresaDropdownClass() {
        return this.showEmpresaDropdown ? 'pyg-ms-wrap pyg-ms-wrap-open' : 'pyg-ms-wrap';
    }
    get empresaCount() {
        return `${this.empresasTitulares.length} / ${this.empresaOptionsBase.length}`;
    }
    get empresaErrorClass() {
        return this.empresasTitulares.length === 0 ? 'pyg-required-empty' : '';
    }
    get fechasIncompletas() {
        if (!this.fechaDesde || !this.fechaHasta) return true;
        return this.conComparativo && (!this.fechaCompDesde || !this.fechaCompHasta);
    }

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
            // En modo "No", las cuentas sólo se ven si su sección está desplegada
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

        const clickable = r.tipo === 'CUENTA';
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
            cuentaId: r.cuentaId || null,
            concepto: r.concepto,
            showCodigo: r.tipo === 'CUENTA' && !!r.codigoCuenta,
            isSubtotal: r.tipo === 'SUBTOTAL',
            isSeccion: esSeccion,
            // celda actual
            actualValue: this.fmtCurrency(a),
            actualClass: this.cellClass(a, clickable),
            actualPct: this.fmtPct(pa, false),
            // celda comparada
            comparadoValue: this.fmtCurrency(c),
            comparadoClass: this.cellClass(c, clickable),
            comparadoPct: this.fmtPct(pc, false),
            // delta €
            deltaValue: this.fmtCurrencySigned(delta),
            deltaClass: this.deltaCellClass(delta),
            // delta %
            deltaPctValue: deltaPct == null ? '—' : this.fmtPct(deltaPct, true),
            deltaPctBadgeClass: this.deltaPctBadgeClass(deltaPct),
            // click
            actualClickable: clickable,
            comparadoClickable: clickable
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

    rowClass(r) {
        if (r.tipo === 'SECCION')   return 'pyg-row pyg-seccion';
        if (r.tipo === 'SUBTOTAL')  return 'pyg-row pyg-subtotal';
        return 'pyg-row pyg-cuenta';
    }
    conceptoClass(r) {
        if (r.tipo === 'SECCION')   return 'pyg-concepto pyg-concepto-seccion';
        if (r.tipo === 'SUBTOTAL')  return 'pyg-concepto pyg-concepto-subtotal';
        return 'pyg-concepto pyg-concepto-cuenta';
    }
    cellClass(v, clickable) {
        const base = clickable ? 'pyg-cell pyg-clickable' : 'pyg-cell';
        const n = (typeof v === 'number') ? v : Number(v);
        if (n == null || Number.isNaN(n) || n === 0) return base + ' pyg-zero';
        if (n < 0)  return base + ' pyg-neg';
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
    handleAreaChange(e)           { this.area = e.detail.value; }
    handlePlanChange(e)           { this.planPGC = e.detail.value; }
    handleDirectorChange(e) {
        this.directorFacturacionId = e.detail && e.detail.recordId ? e.detail.recordId : null;
    }
    handleFechaDesdeChange(e)     { this.fechaDesde = e.detail.value || null; }
    handleFechaHastaChange(e)     { this.fechaHasta = e.detail.value || null; }
    handleFechaCompDesdeChange(e) { this.fechaCompDesde = e.detail.value || null; }
    handleFechaCompHastaChange(e) { this.fechaCompHasta = e.detail.value || null; }

    // Interruptor "Balance oficial": al activarlo fija Simulación=Todas y Extraordinarios=No
    // y bloquea (desactiva) los toggles de Simulación, Extraordinarios y Check.
    toggleBalanceOficial() {
        this.balanceOficial = !this.balanceOficial;
        if (this.balanceOficial) {
            this.simulacion = 'Todas';
            this.extraordinarios = 'No';
        } else {
            // Al desmarcar: vista analítica
            this.simulacion = 'No';
            this.extraordinarios = 'Todas';
        }
        this.handleRefresh();
    }
    get balanceSwitchClass() {
        return this.balanceOficial ? 'pyg-switch pyg-switch-on' : 'pyg-switch';
    }

    // Interruptor "Comparativo": muestra u oculta el ejercicio comparado (columnas y fechas)
    toggleComparativo() {
        this.conComparativo = !this.conComparativo;
    }
    get compSwitchClass() {
        return this.conComparativo ? 'pyg-switch pyg-switch-on' : 'pyg-switch';
    }
    // Sin comparativo la columna de importes mantiene su ancho y posición (el hueco va a la derecha)
    get tablaClass() {
        return this.conComparativo ? 'pyg-tabla' : 'pyg-tabla pyg-tabla-sincomp';
    }
    get lockedLabelCls() {
        return this.balanceOficial ? 'pyg-toggle-label pyg-label-dim' : 'pyg-toggle-label';
    }

    setSimulacion(e)        { if (this.balanceOficial) return; this.simulacion = e.currentTarget.dataset.value; this.handleRefresh(); }
    setExtraordinarios(e)   { if (this.balanceOficial) return; this.extraordinarios = e.currentTarget.dataset.value; this.handleRefresh(); }
    setCheck(e)             { if (this.balanceOficial) return; this.check = e.currentTarget.dataset.value; this.handleRefresh(); }
    setDesplegado(e)        { this.desplegado = e.currentTarget.dataset.value; }

    toggleEmpresaDropdown(e) {
        e.stopPropagation();
        this.showEmpresaDropdown = !this.showEmpresaDropdown;
        if (this.showEmpresaDropdown) this.empresaFiltroBusqueda = '';
    }
    closeEmpresaDropdown() { this.showEmpresaDropdown = false; }
    stopProp(e)            { e.stopPropagation(); }
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

    // Toggles
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

    // Badge fiscal/analítico
    get esVistaFiscal() {
        return this.simulacion === 'Todas' && this.extraordinarios === 'No';
    }
    get vistaLabel() { return this.esVistaFiscal ? 'Fiscal' : 'Analítico'; }
    get vistaClass() {
        return this.esVistaFiscal
            ? 'pyg-vista-badge pyg-vista-fiscal'
            : 'pyg-vista-badge pyg-vista-analitico';
    }

    // ---------------------------------------------------------------
    //  GENERAR
    // ---------------------------------------------------------------
    handleGenerar() {
        const faltan = [];
        if (this.empresasTitulares.length === 0) faltan.push('empresa titular');
        if (this.fechasIncompletas)              faltan.push(this.conComparativo ? 'las cuatro fechas' : 'las fechas Desde y Hasta');
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
            empresasTitulares: this.empresasTitulares,
            area: this.area || null,
            directorFacturacionId: this.directorFacturacionId,
            fechaDesde:     this.fechaDesde,
            fechaHasta:     this.fechaHasta,
            fechaCompDesde: this.fechaCompDesde || this.fechaDesde,
            fechaCompHasta: this.fechaCompHasta || this.fechaHasta,
            planPGC: this.planPGC,
            simulacion: this.simulacion,
            extraordinarios: this.extraordinarios,
            check: this.check
        })
        .then(result => {
            this.rows = result || [];
            this.expandedSecciones = [];
            this.avisosParams = {
                empresas: [...this.empresasTitulares],
                desde: this.fechaDesde,
                hasta: this.fechaHasta,
                desdeComparativa: this.fechaCompDesde || this.fechaDesde,
                hastaComparativa: this.fechaCompHasta || this.fechaHasta
            };
            this.generated = true;
        })
        .catch(err => {
            this.error = this.reduceError(err);
            this.rows = [];
            this.generated = true;
        })
        .finally(() => { this.loading = false; });
    }
    handleRefresh() { if (this.generated) this.handleGenerar(); }

    // ---------------------------------------------------------------
    //  MODAL — al pinchar un importe de fila CUENTA
    // ---------------------------------------------------------------
    handleAmountClick(e) {
        const rowKey = e.currentTarget.dataset.rowkey;
        const periodo = e.currentTarget.dataset.periodo;  // 'actual' | 'comparado'
        const importe = e.currentTarget.dataset.value;
        const concepto = e.currentTarget.dataset.concepto;
        const row = this.rows.find(r => r.key === rowKey);
        if (!row || row.tipo !== 'CUENTA') return;
        if (!row.cuentaIds || !row.cuentaIds.length) return;

        const desde = periodo === 'comparado' ? this.fechaCompDesde : this.fechaDesde;
        const hasta = periodo === 'comparado' ? this.fechaCompHasta : this.fechaHasta;

        this.modalTitulo = concepto || row.concepto || '';
        this.modalSubtitulo = `${this.fmtFecha(desde)} – ${this.fmtFecha(hasta)}` + (periodo === 'comparado' ? ' (comparativo)' : '');
        this.modalImporte = importe;
        this.modalMovimientos = [];
        this.modalError = null;
        this.showModal = true;
        this.modalLoading = true;

        getMovimientos({
            cuentaIds: row.cuentaIds,
            desde: desde,
            hasta: hasta,
            empresasTitulares: this.empresasTitulares,
            area: this.area || null,
            directorFacturacionId: this.directorFacturacionId,
            simulacion: this.simulacion,
            extraordinarios: this.extraordinarios,
            check: this.check,
            excluirTipos: ['Asiento Reg. Cierre']
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
                directorFacturacion: m.directorFacturacion || '',
                simulacion: m.simulacion || '',
                checkValue: m.checkValue || '',
                campaniaId: m.campaniaId || null,
                campania: m.campania || ''
            }));
        })
        .catch(err => { this.modalError = this.reduceError(err); })
        .finally(() => { this.modalLoading = false; });
    }
    closeModal() { this.showModal = false; this.modalMovimientos = []; }

    // ---------------------------------------------------------------
    //  EDICIÓN INLINE EN EL MODAL
    // ---------------------------------------------------------------
    get areaEditOptions() {
        const real = (this.areaOptions || []).filter(o => o.value);
        return [{ label: '— sin asignar —', value: '' }, ...real];
    }
    get simulacionEditOptions() {
        return [
            { label: '— sin asignar —', value: '' },
            { label: 'No', value: 'No' },
            { label: 'Sí',  value: 'Si' },
            { label: 'Sí. Transferencia', value: 'Sí. Transferencia' }
        ];
    }
    get checkEditOptions() {
        return [
            { label: '— sin asignar —', value: '' },
            { label: 'No', value: 'No' },
            { label: 'Sí',  value: 'Si' }
        ];
    }

    handleModalEdit(e) {
        const rid   = e.currentTarget.dataset.rid;
        const fld   = e.currentTarget.dataset.fld;
        const value = e.detail.value;
        const idx = this.modalMovimientos.findIndex(m => m.recordId === rid);
        if (idx < 0) return;
        const mv = { ...this.modalMovimientos[idx] };
        if (fld === 'area')       mv.area = value;
        if (fld === 'simulacion') mv.simulacion = value;
        if (fld === 'check')      mv.checkValue = value;
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
        .then(() => {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Guardado',
                message: 'Apunte actualizado',
                variant: 'success',
                mode: 'pester'
            }));
        })
        .catch(err => {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error al guardar',
                message: this.reduceError(err),
                variant: 'error'
            }));
        });
    }

    // ---------------------------------------------------------------
    //  EXPORTAR A PDF (Visualforce renderAs=pdf)
    // ---------------------------------------------------------------
    handleExportClick() {
        const faltan = [];
        if (this.empresasTitulares.length === 0) faltan.push('empresa titular');
        if (!this.fechaDesde || !this.fechaHasta) faltan.push('fechas del periodo');
        if (faltan.length) {
            this.error = `Antes de exportar debes seleccionar ${faltan.join(' y ')}.`;
            return;
        }
        this.error = null;
        // Defaults: comparativo marcado (si hay fechas), desglose de cuentas no
        this.exportConComparativo = !!(this.fechaCompDesde && this.fechaCompHasta);
        this.exportDesglosado = false;
        this.showExportDialog = true;
    }
    closeExportDialog() { this.showExportDialog = false; }

    setExportComp(e)  { this.exportConComparativo = (e.currentTarget.dataset.value === 'Si'); }
    setExportDesg(e)  { this.exportDesglosado     = (e.currentTarget.dataset.value === 'Si'); }

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
        return '/apex/PyGExportPDF?' + p.toString();
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
        this.expandedSecciones = [];
        this.avisosParams = null;
        this.template.querySelectorAll('lightning-record-picker')
            .forEach(p => { if (p.clearSelection) p.clearSelection(); });
    }

    // Navegación universal (Lightning Experience y Experience Cloud)
    navigateToRecord(e) {
        e.preventDefault();
        e.stopPropagation();
        const recordId = e.currentTarget.dataset.recordid;
        const objectApiName = e.currentTarget.dataset.objectname;
        if (!recordId || !objectApiName) return;
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: recordId,
                objectApiName: objectApiName,
                actionName: 'view'
            }
        });
    }

    // Abre el registro en una pestaña/ventana nueva (cuenta contable)
    navigateToRecordNewTab(e) {
        e.preventDefault();
        e.stopPropagation();
        const recordId = e.currentTarget.dataset.recordid;
        const objectApiName = e.currentTarget.dataset.objectname;
        if (!recordId || !objectApiName) return;
        this[NavigationMixin.GenerateUrl]({
            type: 'standard__recordPage',
            attributes: {
                recordId: recordId,
                objectApiName: objectApiName,
                actionName: 'view'
            }
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