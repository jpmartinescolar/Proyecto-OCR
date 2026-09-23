import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getFilterOptions from '@salesforce/apex/PyGController.getFilterOptions';
import generarGrupo from '@salesforce/apex/PyGGrupoController.generarGrupo';
import getMovimientos from '@salesforce/apex/PyGController.getMovimientos';
import updateMovimiento from '@salesforce/apex/PyGMensualController.updateMovimiento';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class PerdidasGananciasGrupo extends NavigationMixin(LightningElement) {

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
    @track desplegado = 'No';
    @track comparativo = 'No';       // Si | No  (por defecto No)

    @track loading = false;
    @track generated = false;
    @track error;
    @track rows = [];                // GrupoRow[]
    @track empresasResultado = [];   // nombres de empresa (columnas), congelado al generar
    @track expandedSecciones = [];
    @track balanceOficial = true;   // vista oficial por defecto

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

    // ---------------------------------------------------------------
    get hasError()   { return !!this.error; }
    get hasRows()    { return this.generated && this.rows && this.rows.length > 0; }
    get emptyState() { return this.generated && (!this.rows || this.rows.length === 0); }
    get esComparativo() { return this.comparativo === 'Si'; }
    get showInicial() { return !this.generated && !this.loading && !this.hasError; }
    get textoInicial() {
        const f = [];
        if (this.empresasTitulares.length === 0) f.push('la(s) empresa(s) titular(es)');
        if (!this.fechaDesde || !this.fechaHasta) f.push('las fechas del ejercicio');
        if (this.esComparativo && (!this.fechaCompDesde || !this.fechaCompHasta)) f.push('las fechas del comparativo');
        if (!f.length) return 'Pulsa';
        return 'Selecciona ' + f.join(' y ') + ' y pulsa';
    }

    get empresaLabel() {
        if (!this.empresasTitulares.length) return '—';
        if (this.empresasTitulares.length === 1) return this.empresasTitulares[0];
        return `${this.empresasTitulares.length} empresas seleccionadas`;
    }
    get periodoLabel() { return `${this.fmtFecha(this.fechaDesde)} – ${this.fmtFecha(this.fechaHasta)}`; }
    get comparativoLabel() { return `${this.fmtFecha(this.fechaCompDesde)} – ${this.fmtFecha(this.fechaCompHasta)}`; }

    // --- multi-select empresa ---
    get empresaOptionsFiltradas() {
        const term = (this.empresaFiltroBusqueda || '').toLowerCase().trim();
        return (this.empresaOptionsBase || [])
            .filter(o => !term || o.label.toLowerCase().includes(term))
            .map(o => ({
                ...o,
                optionClass: this.empresasTitulares.includes(o.value)
                    ? 'pyg-ms-option pyg-ms-option-selected' : 'pyg-ms-option'
            }));
    }
    get empresaTriggerLabel() {
        if (!this.empresasTitulares.length) return 'Selecciona empresa...';
        if (this.empresasTitulares.length === 1) return this.empresasTitulares[0];
        return `${this.empresasTitulares.length} empresas seleccionadas`;
    }
    get empresaTriggerClass() {
        return this.empresasTitulares.length ? 'pyg-ms-trigger pyg-ms-trigger-filled' : 'pyg-ms-trigger';
    }
    get empresaDropdownClass() { return this.showEmpresaDropdown ? 'pyg-ms-wrap pyg-ms-wrap-open' : 'pyg-ms-wrap'; }
    get empresaCount() { return `${this.empresasTitulares.length} / ${this.empresaOptionsBase.length}`; }

    // ---------------------------------------------------------------
    //  CABECERAS DINÁMICAS (por empresa + total grupo)
    // ---------------------------------------------------------------
    get gruposCabecera() {
        const span = this.esComparativo ? 2 : 1;
        const out = (this.empresasResultado || []).map((n, i) => ({ key: 'g' + i, name: n, colspan: span, cls: 'lm-grp-emp' }));
        out.push({ key: 'gtot', name: 'Total grupo', colspan: span, esTotal: true, cls: 'lm-grp-emp lm-grp-total' });
        return out;
    }
    get subCabecera() {
        const cols = [];
        const comp = this.esComparativo;
        const grupos = [...(this.empresasResultado || []), '__TOTAL__'];
        grupos.forEach((n, i) => {
            const tot = (n === '__TOTAL__') ? ' lm-grp-total' : '';
            cols.push({ key: 'se' + i, label: 'Ejercicio', cls: (comp ? 'pyg-th-num lm-grp-sub lm-eje-h' : 'pyg-th-num lm-grp-sub') + tot });
            if (comp) cols.push({ key: 'sc' + i, label: 'Comparado', cls: 'pyg-th-num lm-grp-sub lm-comp-h' + tot });
        });
        return cols;
    }

    // ---------------------------------------------------------------
    //  FILAS
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
        const clickable = r.tipo === 'CUENTA';
        const esSeccion = r.tipo === 'SECCION';
        const esSubtotal = r.tipo === 'SUBTOTAL';
        const expandable = esSeccion && ocultarCuentas;
        const isExpanded = expandable && expanded.includes(r.key);

        let conceptoClass = this.conceptoClass(r);
        if (expandable) conceptoClass += ' pyg-seccion-click' + (isExpanded ? '' : ' pyg-seccion-colapsada');

        // columnas: por empresa + total, cada una con Ejercicio (+Comparado)
        const columnas = [];
        const empresas = r.empresas || [];
        empresas.forEach((cell, i) => {
            this.pushColumna(columnas, r, cell, this.empresasResultado[i], clickable, esSubtotal);
        });
        this.pushColumna(columnas, r, r.total, null, clickable, esSubtotal);

        return {
            key: r.key || ('r' + idx),
            tipo: r.tipo,
            rowClass: this.rowClass(r),
            conceptoClass: conceptoClass,
            seccionKey: esSeccion ? r.key : null,
            codigo: r.codigoCuenta,
            cuentaId: r.cuentaId || null,
            cuentaIds: r.cuentaIds || [],
            concepto: r.concepto,
            showCodigo: r.tipo === 'CUENTA' && !!r.codigoCuenta,
            isSubtotal: esSubtotal,
            isSeccion: esSeccion,
            columnas: columnas
        };
    }

    pushColumna(columnas, r, cell, empresaName, clickable, esSubtotal) {
        const a = this.toNum(cell ? cell.actual : null);
        const c = this.toNum(cell ? cell.comparado : null);
        const baseKey = (r.key || '') + '|' + (empresaName === null ? 'TOTAL' : empresaName);
        const comp = this.esComparativo;
        // Ejercicio
        columnas.push({
            key: baseKey + '|e',
            tdClass: this.cellClass(a, clickable) + (empresaName === null ? ' pyg-col-total' : '') + (comp ? ' lm-eje' : ''),
            value: this.fmtCurrency(a),
            pct: esSubtotal ? this.fmtPct(this.toNum(cell ? cell.pctActual : null), false) : null,
            showPct: esSubtotal,
            empresa: empresaName === null ? '' : empresaName,
            periodo: 'actual',
            rowkey: r.key,
            concepto: r.concepto
        });
        // Comparado
        if (this.esComparativo) {
            columnas.push({
                key: baseKey + '|c',
                tdClass: this.cellClass(c, clickable) + (empresaName === null ? ' pyg-col-total' : '') + ' lm-comp',
                value: this.fmtCurrency(c),
                pct: esSubtotal ? this.fmtPct(this.toNum(cell ? cell.pctComparado : null), false) : null,
                showPct: esSubtotal,
                empresa: empresaName === null ? '' : empresaName,
                periodo: 'comparado',
                rowkey: r.key,
                concepto: r.concepto
            });
        }
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
        if (r.tipo === 'SECCION')  return 'pyg-row pyg-seccion';
        if (r.tipo === 'SUBTOTAL') return 'pyg-row pyg-subtotal';
        return 'pyg-row pyg-cuenta';
    }
    conceptoClass(r) {
        if (r.tipo === 'SECCION')  return 'pyg-concepto pyg-concepto-seccion';
        if (r.tipo === 'SUBTOTAL') return 'pyg-concepto pyg-concepto-subtotal';
        return 'pyg-concepto pyg-concepto-cuenta';
    }
    cellClass(v, clickable) {
        const base = clickable ? 'pyg-cell pyg-clickable' : 'pyg-cell';
        const n = (typeof v === 'number') ? v : Number(v);
        if (n == null || Number.isNaN(n) || n === 0) return base + ' pyg-zero';
        if (n < 0)  return base + ' pyg-neg';
        return base + ' pyg-pos';
    }
    toNum(v) {
        if (v == null || v === '') return null;
        if (typeof v === 'number') return v;
        const n = Number(v);
        return Number.isNaN(n) ? null : n;
    }

    // ---------------------------------------------------------------
    //  FORMATO
    // ---------------------------------------------------------------
    fmtCurrency(v) {
        const n = (typeof v === 'number') ? v : Number(v);
        if (n == null || Number.isNaN(n)) return '0,00 €';
        return this.fmtNumber(n, 2) + ' €';
    }
    fmtNumber(v, decimals) {
        const n = (typeof v === 'number') ? v : Number(v);
        if (n == null || Number.isNaN(n)) return '0';
        const sign = n < 0 ? '-' : '';
        const abs = Math.abs(n).toFixed(decimals);
        const parts = abs.split('.');
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
    //  HANDLERS de filtros
    // ---------------------------------------------------------------
    handleAreaChange(e)           { this.area = e.detail.value; }
    handlePlanChange(e)           { this.planPGC = e.detail.value; }
    handleDirectorChange(e)       { this.directorFacturacionId = e.detail && e.detail.recordId ? e.detail.recordId : null; }
    handleFechaDesdeChange(e)     { this.fechaDesde = e.detail.value || null; }
    handleFechaHastaChange(e)     { this.fechaHasta = e.detail.value || null; }
    handleFechaCompDesdeChange(e) { this.fechaCompDesde = e.detail.value || null; }
    handleFechaCompHastaChange(e) { this.fechaCompHasta = e.detail.value || null; }

    setComparativo(e) { this.comparativo = e.currentTarget.dataset.value; this.handleRefresh(); }
    get compSiCls() { return this.toggleCls(this.comparativo === 'Si'); }
    get compNoCls() { return this.toggleCls(this.comparativo === 'No'); }

    toggleBalanceOficial() {
        this.balanceOficial = !this.balanceOficial;
        if (this.balanceOficial) { this.simulacion = 'Todas'; this.extraordinarios = 'No'; }
        else { this.simulacion = 'No'; this.extraordinarios = 'Todas'; }   // vista analítica
        this.handleRefresh();
    }
    get balanceSwitchClass() { return this.balanceOficial ? 'pyg-switch pyg-switch-on' : 'pyg-switch'; }
    get lockedLabelCls() { return this.balanceOficial ? 'pyg-toggle-label pyg-label-dim' : 'pyg-toggle-label'; }

    setSimulacion(e)      { if (this.balanceOficial) return; this.simulacion = e.currentTarget.dataset.value; this.handleRefresh(); }
    setExtraordinarios(e) { if (this.balanceOficial) return; this.extraordinarios = e.currentTarget.dataset.value; this.handleRefresh(); }
    setCheck(e)           { if (this.balanceOficial) return; this.check = e.currentTarget.dataset.value; this.handleRefresh(); }
    setDesplegado(e)      { this.desplegado = e.currentTarget.dataset.value; }

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

    get esVistaFiscal() { return this.simulacion === 'Todas' && this.extraordinarios === 'No'; }
    get vistaLabel() { return this.esVistaFiscal ? 'Fiscal' : 'Analítico'; }
    get vistaClass() { return this.esVistaFiscal ? 'pyg-vista-badge pyg-vista-fiscal' : 'pyg-vista-badge pyg-vista-analitico'; }

    // ---------------------------------------------------------------
    //  GENERAR
    // ---------------------------------------------------------------
    handleGenerar() {
        const faltan = [];
        if (this.empresasTitulares.length === 0) faltan.push('empresa titular');
        if (!this.fechaDesde || !this.fechaHasta) faltan.push('las fechas del ejercicio');
        if (this.esComparativo && (!this.fechaCompDesde || !this.fechaCompHasta)) faltan.push('las fechas del comparativo');
        if (faltan.length) {
            this.error = `Debes seleccionar ${faltan.join(' y ')} antes de generar.`;
            return;
        }
        this.error = null;
        this.loading = true;
        this.generated = false;
        generarGrupo({
            empresasTitulares: this.empresasTitulares,
            area: this.area || null,
            directorFacturacionId: this.directorFacturacionId,
            fechaDesde:     this.fechaDesde,
            fechaHasta:     this.fechaHasta,
            fechaCompDesde: this.fechaCompDesde,
            fechaCompHasta: this.fechaCompHasta,
            planPGC: this.planPGC,
            simulacion: this.simulacion,
            extraordinarios: this.extraordinarios,
            check: this.check
        })
        .then(result => {
            this.rows = (result && result.rows) || [];
            this.empresasResultado = (result && result.empresas) || [];
            this.expandedSecciones = [];
            this.avisosParams = {
                empresas: [...this.empresasTitulares],
                desde: this.fechaDesde,
                hasta: this.fechaHasta,
                desdeComparativa: this.esComparativo ? this.fechaCompDesde : null,
                hastaComparativa: this.esComparativo ? this.fechaCompHasta : null
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
        const rowKey  = e.currentTarget.dataset.rowkey;
        const periodo = e.currentTarget.dataset.periodo;     // actual | comparado
        const empresa = e.currentTarget.dataset.empresa;     // '' => total grupo
        const concepto = e.currentTarget.dataset.concepto;
        const row = this.rows.find(r => r.key === rowKey);
        if (!row || row.tipo !== 'CUENTA') return;
        if (!row.cuentaIds || !row.cuentaIds.length) return;

        const desde = periodo === 'comparado' ? this.fechaCompDesde : this.fechaDesde;
        const hasta = periodo === 'comparado' ? this.fechaCompHasta : this.fechaHasta;
        const empresas = empresa ? [empresa] : this.empresasResultado;

        this.modalTitulo = concepto || row.concepto || '';
        this.modalSubtitulo = `${empresa || 'Total grupo'} · ${this.fmtFecha(desde)} – ${this.fmtFecha(hasta)}`
            + (periodo === 'comparado' ? ' (comparativo)' : '');
        this.modalMovimientos = [];
        this.modalError = null;
        this.showModal = true;
        this.modalLoading = true;

        getMovimientos({
            cuentaIds: row.cuentaIds,
            desde: desde,
            hasta: hasta,
            empresasTitulares: empresas,
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

    get areaEditOptions() {
        const real = (this.areaOptions || []).filter(o => o.value);
        return [{ label: '— sin asignar —', value: '' }, ...real];
    }
    get simulacionEditOptions() {
        return [
            { label: '— sin asignar —', value: '' },
            { label: 'No', value: 'No' },
            { label: 'Sí', value: 'Si' },
            { label: 'Sí. Transferencia', value: 'Sí. Transferencia' }
        ];
    }
    get checkEditOptions() {
        return [
            { label: '— sin asignar —', value: '' },
            { label: 'No', value: 'No' },
            { label: 'Sí', value: 'Si' }
        ];
    }

    handleModalEdit(e) {
        const rid = e.currentTarget.dataset.rid;
        const fld = e.currentTarget.dataset.fld;
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
            this.dispatchEvent(new ShowToastEvent({ title: 'Guardado', message: 'Apunte actualizado', variant: 'success', mode: 'pester' }));
        })
        .catch(err => {
            this.dispatchEvent(new ShowToastEvent({ title: 'Error al guardar', message: this.reduceError(err), variant: 'error' }));
        });
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
        this.comparativo = 'No';
        this.balanceOficial = true;
        this.generated = false;
        this.loading = false;
        this.error = null;
        this.rows = [];
        this.empresasResultado = [];
        this.expandedSecciones = [];
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
            attributes: { recordId: recordId, objectApiName: objectApiName, actionName: 'view' }
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