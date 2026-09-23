import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getFilterOptions from '@salesforce/apex/LibroMayorController.getFilterOptions';
import getCuentas from '@salesforce/apex/LibroMayorController.getCuentas';
import generar from '@salesforce/apex/SumasSaldosController.generar';
import getIncidencias from '@salesforce/apex/SumasSaldosController.getIncidencias';
import contarDescuadrados from '@salesforce/apex/SumasSaldosController.contarDescuadrados';
import getSinCuenta from '@salesforce/apex/SumasSaldosController.getSinCuenta';
import contarExtractosPendientes from '@salesforce/apex/SumasSaldosController.contarExtractosPendientes';
import cuadreFacturas from '@salesforce/apex/SumasSaldosController.cuadreFacturas';
import cuadreRecibidas from '@salesforce/apex/SumasSaldosController.cuadreRecibidas';
import getMovimientos from '@salesforce/apex/PyGController.getMovimientos';
import updateMovimiento from '@salesforce/apex/PyGMensualController.updateMovimiento';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class SumasSaldos extends NavigationMixin(LightningElement) {

    @track empresasTitulares = [];
    @track fechaDesde;
    @track fechaHasta;

    @track cuentaId = null;
    @track cuentaNumero = '';
    @track cuentaTitulo = '';
    @track cuentaOptions = [];

    @track simulacion = 'Todas';
    @track extraordinarios = 'No';
    @track check = 'Todos';
    @track cuentasModo = 'Con';      // Con | Sin | Todas (por defecto: Con apuntes contables)
    @track diferenciaEfectos = 'Todas';  // Todas | ConDiferencias (solo cuentas con diferencia de efectos)

    @track loading = false;
    @track generated = false;
    @track error;
    @track rows = [];
    @track genEmpresas = [];
    @track incidenciasCount = 0;
    @track incidenciasAsientos = [];
    @track descuadradosCount = 0;
    @track descuadradosAsientos = [];
    @track sinCuentaCount = 0;
    @track sinCuentaAsientos = [];
    @track extractosCount = 0;
    @track cuadreBase = 0;
    @track cuadreSaldo = 0;
    @track cuadreDif = 0;
    @track cuadreRecBase = 0;
    @track cuadreRecSaldo = 0;
    @track cuadreRecDif = 0;
    @track showInc = false;
    @track showDesc = false;
    @track showSin = false;
    @track showExt = false;
    @track showCuadre = false;
    @track showCuadreRec = false;

    @track empresaOptionsBase = [];
    @track areaOptions = [];

    // Modal de movimientos
    @track showModal = false;
    @track modalLoading = false;
    @track modalError;
    @track modalTitulo = '';
    @track modalSubtitulo = '';
    @track modalMovimientos = [];

    @track showEmpresaDropdown = false;
    @track empresaFiltroBusqueda = '';

    @track showCuentaTitDropdown = false;
    @track cuentaTitBusqueda = '';

    // Rango por número: desde / hasta
    @track showCuentaDesdeDropdown = false;
    @track cuentaDesdeBusqueda = '';
    @track cuentaDesdeNumero = '';
    @track cuentaDesdeLabel = '';
    @track showCuentaHastaDropdown = false;
    @track cuentaHastaBusqueda = '';
    @track cuentaHastaNumero = '';
    @track cuentaHastaLabel = '';

    connectedCallback() {
        const y = new Date().getFullYear();
        this.fechaDesde = `${y}-01-01`;
        this.fechaHasta = `${y}-12-31`;
    }

    @wire(getFilterOptions)
    wiredOpts({ data, error }) {
        if (data) {
            this.empresaOptionsBase = (data.empresasTitulares || []).map(v => ({ label: v, value: v }));
            this.areaOptions = [{ label: 'Todas', value: '' }, ...((data.areas || []).map(v => ({ label: v, value: v })))];
        } else if (error) {
            this.error = this.reduceError(error);
        }
    }

    renderedCallback() {
        if (this._focusTit)   { const el = this.template.querySelector('.ss-search-tit');   if (el) { el.focus(); this._focusTit = false; } }
        if (this._focusDesde) { const el = this.template.querySelector('.ss-search-desde'); if (el) { el.focus(); this._focusDesde = false; } }
        if (this._focusHasta) { const el = this.template.querySelector('.ss-search-hasta'); if (el) { el.focus(); this._focusHasta = false; } }
    }

    // ---------------------------------------------------------------
    get hasError()   { return !!this.error; }
    get hasRows()    { return this.generated && this.rows && this.rows.length > 0; }
    get hayIncidencias() { return this.generated && this.incidenciasCount > 0 && this.showInc; }
    get hayDescuadrados() { return this.generated && this.descuadradosCount > 0 && this.showDesc; }
    get haySinCuenta() { return this.generated && this.sinCuentaCount > 0 && this.showSin; }
    get hayExtractos() { return this.generated && this.extractosCount > 0 && this.showExt; }
    get cuadraFacturas() { return Math.abs(this.toNum(this.cuadreDif)) < 0.01; }
    get hayDescuadreFacturas() { return this.generated && this.showCuadre; }
    get cuadreEstado()   { return this.cuadraFacturas ? 'Cuadre' : 'Descuadre'; }
    get cuadreBoxClass() { return this.cuadraFacturas ? 'ss-cuadre-ok' : 'ss-descuadrados'; }
    get cuadreIcon()     { return this.cuadraFacturas ? 'utility:check' : 'utility:warning'; }
    get cuadreVariant()  { return this.cuadraFacturas ? 'success' : 'error'; }
    get cuadreBaseFmt()  { return this.fmtCurrency(this.cuadreBase); }
    get cuadreSaldoFmt() { return this.fmtCurrency(this.cuadreSaldo); }
    get cuadreDifFmt()   { return this.fmtCurrency(this.cuadreDif); }

    // Chips de resumen (verde si 0/OK, rojo si >0/descuadre)
    get showChips() { return this.generated; }
    chipCls(n) { return n > 0 ? 'ss-chip ss-chip-bad' : 'ss-chip ss-chip-ok'; }
    get chipIncCls()  { return this.incidenciasCount > 0 ? 'ss-chip ss-chip-warn' : 'ss-chip ss-chip-ok'; }
    get chipDescCls() { return this.chipCls(this.descuadradosCount); }
    get chipSinCls()  { return this.chipCls(this.sinCuentaCount); }
    get chipExtCls()  { return this.extractosCount > 0 ? 'ss-chip ss-chip-warn' : 'ss-chip ss-chip-ok'; }
    get chipCuadreCls() { return this.cuadraFacturas ? 'ss-chip ss-chip-ok' : 'ss-chip ss-chip-bad'; }
    get chipCuadreTxt() { return this.cuadraFacturas ? 'OK' : this.cuadreDifFmt; }
    get cuadraRecibidas() { return Math.abs(this.toNum(this.cuadreRecDif)) < 0.01; }
    get hayDescuadreRecibidas() { return this.generated && !this.cuadraRecibidas && this.showCuadreRec; }
    get cuadreRecBaseFmt()  { return this.fmtCurrency(this.cuadreRecBase); }
    get cuadreRecSaldoFmt() { return this.fmtCurrency(this.cuadreRecSaldo); }
    get cuadreRecDifFmt()   { return this.fmtCurrency(this.cuadreRecDif); }
    get chipCuadreRecCls() { return this.cuadraRecibidas ? 'ss-chip ss-chip-ok' : 'ss-chip ss-chip-bad'; }
    get chipCuadreRecTxt() { return this.cuadraRecibidas ? 'OK' : this.cuadreRecDifFmt; }
    get chipCuadreRecBad() { return !this.cuadraRecibidas; }
    // ¿chip "rojo"? (muestra el ojo)
    get chipIncBad()    { return this.incidenciasCount > 0; }
    get chipDescBad()   { return this.descuadradosCount > 0; }
    get chipSinBad()    { return this.sinCuentaCount > 0; }
    get chipExtBad()    { return this.extractosCount > 0; }
    get chipCuadreBad() { return !this.cuadraFacturas; }

    // Pinchar un chip muestra/oculta su mensaje; la X lo cierra
    toggleInc()    { this.showInc = !this.showInc; }
    toggleDesc()   { this.showDesc = !this.showDesc; }
    toggleSin()    { this.showSin = !this.showSin; }
    toggleExt()    { this.showExt = !this.showExt; }
    toggleCuadre() { this.showCuadre = !this.showCuadre; }
    toggleCuadreRec() { this.showCuadreRec = !this.showCuadreRec; }
    cerrarInc()    { this.showInc = false; }
    cerrarDesc()   { this.showDesc = false; }
    cerrarSin()    { this.showSin = false; }
    cerrarExt()    { this.showExt = false; }
    cerrarCuadre() { this.showCuadre = false; }
    cerrarCuadreRec() { this.showCuadreRec = false; }
    get emptyState() { return this.generated && (!this.rows || this.rows.length === 0); }
    get sinEmpresa() { return this.empresasTitulares.length === 0; }
    get showInicial() { return !this.generated && !this.loading && !this.hasError; }
    get textoInicial() {
        const f = [];
        if (this.empresasTitulares.length === 0) f.push('la(s) empresa(s) titular(es)');
        if (!this.fechaDesde || !this.fechaHasta) f.push('las fechas Desde y Hasta');
        if (!f.length) return 'Pulsa';
        return 'Selecciona ' + f.join(' y ') + ' y pulsa';
    }

    get empresaLabel() {
        if (!this.empresasTitulares.length) return '—';
        if (this.empresasTitulares.length === 1) return this.empresasTitulares[0];
        return `${this.empresasTitulares.length} empresas seleccionadas`;
    }
    get periodoLabel() { return `${this.fmtFecha(this.fechaDesde)} – ${this.fmtFecha(this.fechaHasta)}`; }

    // --- multi-select empresa ---
    get empresaOptionsFiltradas() {
        const term = (this.empresaFiltroBusqueda || '').toLowerCase().trim();
        return (this.empresaOptionsBase || [])
            .filter(o => !term || o.label.toLowerCase().includes(term))
            .map(o => ({ ...o, optionClass: this.empresasTitulares.includes(o.value) ? 'pyg-ms-option pyg-ms-option-selected' : 'pyg-ms-option' }));
    }
    get empresaTriggerLabel() {
        if (!this.empresasTitulares.length) return 'Selecciona empresa...';
        if (this.empresasTitulares.length === 1) return this.empresasTitulares[0];
        return `${this.empresasTitulares.length} empresas seleccionadas`;
    }
    get empresaTriggerClass() { return this.empresasTitulares.length ? 'pyg-ms-trigger pyg-ms-trigger-filled' : 'pyg-ms-trigger'; }
    get empresaDropdownClass() { return this.showEmpresaDropdown ? 'pyg-ms-wrap pyg-ms-wrap-open' : 'pyg-ms-wrap'; }
    get empresaCount() { return `${this.empresasTitulares.length} / ${this.empresaOptionsBase.length}`; }

    // --- buscadores de cuenta ---
    get cuentaTitFiltradas() {
        const term = (this.cuentaTitBusqueda || '').toLowerCase().trim();
        const list = [...this.cuentaOptions]
            .filter(c => !term || (c.titulo || '').toLowerCase().includes(term))
            .sort((a, b) => (a.titulo || '').localeCompare(b.titulo || ''))
            .slice(0, 100)
            .map(c => ({ id: c.id, label: c.titulo || c.numero, numero: c.numero,
                optionClass: c.id === this.cuentaId ? 'pyg-ms-option pyg-ms-option-selected' : 'pyg-ms-option' }));
        return [{ id: '', label: '— Todas las cuentas —', numero: '', optionClass: this.cuentaId ? 'pyg-ms-option' : 'pyg-ms-option pyg-ms-option-selected' }, ...list];
    }
    get cuentaTitTriggerLabel() {
        if (this.sinEmpresa) return 'Selecciona antes la empresa titular';
        return this.cuentaId ? this.cuentaTitulo : 'Todas las cuentas';
    }
    get cuentaTitTriggerClass() { return this.cuentaId ? 'pyg-ms-trigger pyg-ms-trigger-filled' : 'pyg-ms-trigger'; }
    get cuentaTitWrapClass() { return this.showCuentaTitDropdown ? 'pyg-ms-wrap pyg-ms-wrap-open' : 'pyg-ms-wrap'; }

    // --- Rango por número: desde / hasta ---
    cuentaRangeOptions(term) {
        const t = (term || '').toLowerCase().trim();
        return [...this.cuentaOptions]
            .filter(c => !t || (c.numero || '').toLowerCase().includes(t))
            .sort((a, b) => (a.numero || '').localeCompare(b.numero || ''))
            .slice(0, 100)
            .map(c => ({ id: c.id, label: `${c.numero} — ${c.titulo || ''}`, numero: c.numero, optionClass: 'pyg-ms-option' }));
    }
    get cuentaDesdeFiltradas() {
        return [{ id: '', label: '— Sin límite —', numero: '', optionClass: this.cuentaDesdeNumero ? 'pyg-ms-option' : 'pyg-ms-option pyg-ms-option-selected' },
            ...this.cuentaRangeOptions(this.cuentaDesdeBusqueda)];
    }
    get cuentaHastaFiltradas() {
        return [{ id: '', label: '— Sin límite —', numero: '', optionClass: this.cuentaHastaNumero ? 'pyg-ms-option' : 'pyg-ms-option pyg-ms-option-selected' },
            ...this.cuentaRangeOptions(this.cuentaHastaBusqueda)];
    }
    get cuentaDesdeTriggerLabel() {
        if (this.sinEmpresa) return 'Selecciona antes la empresa titular';
        return this.cuentaDesdeNumero ? this.cuentaDesdeLabel : 'Desde (nº)...';
    }
    get cuentaHastaTriggerLabel() {
        if (this.sinEmpresa) return 'Selecciona antes la empresa titular';
        return this.cuentaHastaNumero ? this.cuentaHastaLabel : 'Hasta (nº)...';
    }
    get cuentaDesdeTriggerClass() { return this.cuentaDesdeNumero ? 'pyg-ms-trigger pyg-ms-trigger-filled' : 'pyg-ms-trigger'; }
    get cuentaHastaTriggerClass() { return this.cuentaHastaNumero ? 'pyg-ms-trigger pyg-ms-trigger-filled' : 'pyg-ms-trigger'; }
    get cuentaDesdeWrapClass() { return this.showCuentaDesdeDropdown ? 'pyg-ms-wrap pyg-ms-wrap-open' : 'pyg-ms-wrap'; }
    get cuentaHastaWrapClass() { return this.showCuentaHastaDropdown ? 'pyg-ms-wrap pyg-ms-wrap-open' : 'pyg-ms-wrap'; }

    // --- toggles ---
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
    toggleCls(active) { return active ? 'pyg-toggle pyg-toggle-active' : 'pyg-toggle'; }

    setSimulacion(e)      { this.simulacion = e.currentTarget.dataset.value; this.autoGenerar(); }
    setExtraordinarios(e) { this.extraordinarios = e.currentTarget.dataset.value; this.autoGenerar(); }
    setCheck(e)           { this.check = e.currentTarget.dataset.value; this.autoGenerar(); }
    setCuentasModo(e) { this.cuentasModo = e.currentTarget.dataset.value; this.autoGenerar(); }
    get ctaConCls()   { return this.toggleCls(this.cuentasModo === 'Con'); }
    get ctaSinCls()   { return this.toggleCls(this.cuentasModo === 'Sin'); }
    get ctaTodasCls() { return this.toggleCls(this.cuentasModo === 'Todas'); }

    setDiferenciaEfectos(e) { this.diferenciaEfectos = e.currentTarget.dataset.value; }
    get difTodasCls() { return this.toggleCls(this.diferenciaEfectos === 'Todas'); }
    get difConCls()   { return this.toggleCls(this.diferenciaEfectos === 'ConDiferencias'); }

    // Filas visibles: con 'ConDiferencias', solo cuentas de efectos cuya diferencia no es cero.
    // Cada fila lleva un número correlativo para saber cuántas líneas se muestran.
    get rowsView() {
        const base = this.diferenciaEfectos !== 'ConDiferencias'
            ? (this.rows || [])
            : (this.rows || []).filter(r => r.tieneDifEfectos);
        return base.map((r, i) => ({ ...r, num: i + 1 }));
    }
    autoGenerar() { if (this.empresasTitulares.length) this.cargar(); }

    handleFechaDesdeChange(e) { this.fechaDesde = e.detail.value || null; }
    handleFechaHastaChange(e) { this.fechaHasta = e.detail.value || null; }

    syncCuentaInfo() {
        const c = this.cuentaOptions.find(o => o.id === this.cuentaId);
        this.cuentaNumero = c ? c.numero : '';
        this.cuentaTitulo = c ? (c.titulo || '') : '';
    }

    toggleCuentaTitDropdown(e) {
        e.stopPropagation();
        this.showCuentaTitDropdown = !this.showCuentaTitDropdown;
        this.showCuentaNumDropdown = false;
        if (this.showCuentaTitDropdown) { this.cuentaTitBusqueda = ''; this._focusTit = true; }
    }
    closeCuentaTitDropdown() { this.showCuentaTitDropdown = false; }
    handleCuentaTitBusqueda(e) { this.cuentaTitBusqueda = e.target.value || ''; }
    handleCuentaTitPick(e) { this.pickCuenta(e.currentTarget.dataset.id); this.showCuentaTitDropdown = false; }

    pickCuenta(id) {
        this.cuentaId = id || null;
        this.syncCuentaInfo();
    }

    // Rango desde (nº)
    toggleCuentaDesdeDropdown(e) {
        e.stopPropagation();
        this.showCuentaDesdeDropdown = !this.showCuentaDesdeDropdown;
        this.showCuentaTitDropdown = false; this.showCuentaHastaDropdown = false;
        if (this.showCuentaDesdeDropdown) { this.cuentaDesdeBusqueda = ''; this._focusDesde = true; }
    }
    closeCuentaDesdeDropdown() { this.showCuentaDesdeDropdown = false; }
    handleCuentaDesdeBusqueda(e) { this.cuentaDesdeBusqueda = e.target.value || ''; }
    handleCuentaDesdePick(e) {
        const num = e.currentTarget.dataset.numero || '';
        this.cuentaDesdeNumero = num;
        this.cuentaDesdeLabel = num ? e.currentTarget.dataset.label : '';
        this.showCuentaDesdeDropdown = false;
    }

    // Rango hasta (nº)
    toggleCuentaHastaDropdown(e) {
        e.stopPropagation();
        this.showCuentaHastaDropdown = !this.showCuentaHastaDropdown;
        this.showCuentaTitDropdown = false; this.showCuentaDesdeDropdown = false;
        if (this.showCuentaHastaDropdown) { this.cuentaHastaBusqueda = ''; this._focusHasta = true; }
    }
    closeCuentaHastaDropdown() { this.showCuentaHastaDropdown = false; }
    handleCuentaHastaBusqueda(e) { this.cuentaHastaBusqueda = e.target.value || ''; }
    handleCuentaHastaPick(e) {
        const num = e.currentTarget.dataset.numero || '';
        this.cuentaHastaNumero = num;
        this.cuentaHastaLabel = num ? e.currentTarget.dataset.label : '';
        this.showCuentaHastaDropdown = false;
    }

    toggleEmpresaDropdown(e) {
        e.stopPropagation();
        this.showEmpresaDropdown = !this.showEmpresaDropdown;
        if (this.showEmpresaDropdown) this.empresaFiltroBusqueda = '';
    }
    closeEmpresaDropdown() { this.showEmpresaDropdown = false; this.refreshCuentas(); }
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

    refreshCuentas() {
        if (!this.empresasTitulares.length) { this.cuentaOptions = []; return; }
        getCuentas({ empresasTitulares: this.empresasTitulares })
            .then(result => {
                this.cuentaOptions = result || [];
                if (this.cuentaId && !this.cuentaOptions.some(c => c.id === this.cuentaId)) {
                    this.cuentaId = null; this.cuentaNumero = ''; this.cuentaTitulo = '';
                }
            })
            .catch(err => { this.error = this.reduceError(err); });
    }

    // ---------------------------------------------------------------
    //  GENERAR
    // ---------------------------------------------------------------
    handleGenerar() {
        const faltan = [];
        if (this.empresasTitulares.length === 0) faltan.push('empresa titular');
        if (!this.fechaDesde || !this.fechaHasta) faltan.push('las fechas Desde y Hasta');
        if (faltan.length) { this.error = `Debes seleccionar ${faltan.join(' y ')}.`; return; }
        this.cargar();
    }
    handleRefresh() { if (this.generated) this.cargar(); }

    cargar() {
        this.error = null;
        this.loading = true;
        this.generated = false;
        this.showInc = false; this.showDesc = false; this.showSin = false; this.showExt = false; this.showCuadre = false; this.showCuadreRec = false;
        this.genEmpresas = [...this.empresasTitulares];
        getIncidencias({ empresasTitulares: this.empresasTitulares })
            .then(res => {
                this.incidenciasCount = res ? res.total : 0;
                this.incidenciasAsientos = (res && res.asientos) ? res.asientos.map(a => ({ id: a.id, numero: a.numero })) : [];
            })
            .catch(() => { this.incidenciasCount = 0; this.incidenciasAsientos = []; });
        contarDescuadrados({ empresasTitulares: this.empresasTitulares })
            .then(res => {
                this.descuadradosCount = res ? res.total : 0;
                this.descuadradosAsientos = (res && res.asientos) ? res.asientos.map(a => ({ id: a.id, numero: a.numero })) : [];
            })
            .catch(() => { this.descuadradosCount = 0; this.descuadradosAsientos = []; });
        getSinCuenta({ empresasTitulares: this.empresasTitulares })
            .then(res => {
                this.sinCuentaCount = res ? res.total : 0;
                this.sinCuentaAsientos = (res && res.asientos) ? res.asientos.map(a => ({ id: a.id, numero: a.numero })) : [];
            })
            .catch(() => { this.sinCuentaCount = 0; this.sinCuentaAsientos = []; });
        contarExtractosPendientes({ empresasTitulares: this.empresasTitulares, desde: this.fechaDesde, hasta: this.fechaHasta })
            .then(n => { this.extractosCount = n; })
            .catch(() => { this.extractosCount = 0; });
        cuadreFacturas({ empresasTitulares: this.empresasTitulares })
            .then(res => {
                this.cuadreBase = res ? res.baseImponible : 0;
                this.cuadreSaldo = res ? res.saldoCuentas : 0;
                this.cuadreDif = res ? res.diferencia : 0;
            })
            .catch(() => { this.cuadreBase = 0; this.cuadreSaldo = 0; this.cuadreDif = 0; });
        cuadreRecibidas({ empresasTitulares: this.empresasTitulares })
            .then(res => {
                this.cuadreRecBase = res ? res.baseImponible : 0;
                this.cuadreRecSaldo = res ? res.saldoCuentas : 0;
                this.cuadreRecDif = res ? res.diferencia : 0;
            })
            .catch(() => { this.cuadreRecBase = 0; this.cuadreRecSaldo = 0; this.cuadreRecDif = 0; });
        generar({
            empresasTitulares: this.empresasTitulares,
            desde: this.fechaDesde,
            hasta: this.fechaHasta,
            cuentaId: this.cuentaId,
            numeroDesde: this.cuentaDesdeNumero || null,
            numeroHasta: this.cuentaHastaNumero || null,
            simulacion: this.simulacion,
            extraordinarios: this.extraordinarios,
            check: this.check,
            cuentasModo: this.cuentasModo
        })
        .then(result => {
            this.rows = (result || []).map((r, i) => this.mapRow(r, i));
            this.generated = true;
        })
        .catch(err => { this.error = this.reduceError(err); this.rows = []; this.generated = true; })
        .finally(() => { this.loading = false; });
    }

    mapRow(r, i) {
        const tieneEfectos = this.toNum(r.efectosClientes) !== 0 || this.toNum(r.efectosProveedores) !== 0;
        const aplicaEf = this.aplicaEfectos(r.numero) || tieneEfectos;
        // Cuentas 551 (c/c con socios): rojo si tienen saldo acumulado, verde si están a cero
        const es551 = String(r.numero || '').startsWith('551');
        const saldo551 = Math.abs(this.toNum(r.acumuladoSaldo)) >= 0.005;
        return {
            key: 'ss' + i,
            rowClass: es551 ? (saldo551 ? 'ss-row ss-row-551' : 'ss-row ss-row-551-ok') : 'ss-row',
            cuentaId: r.cuentaId,
            numero: r.numero || '',
            titulo: r.titulo || '',
            concepto: `${r.numero || ''} ${r.titulo || ''}`.trim(),
            apDebe: this.fmtDH(r.aperturaDebe),
            apHaber: this.fmtDH(r.aperturaHaber),
            peDebe: this.fmtDH(r.periodoDebe),
            peHaber: this.fmtDH(r.periodoHaber),
            peSaldo: this.fmtCurrency(this.toNum(r.periodoHaber) - this.toNum(r.periodoDebe)),
            peSaldoClass: this.saldoClass(this.toNum(r.periodoHaber) - this.toNum(r.periodoDebe)),
            acDebe: this.fmtDH(r.acumuladoDebe),
            acHaber: this.fmtDH(r.acumuladoHaber),
            acSaldo: this.fmtCurrency(r.acumuladoSaldo),
            acSaldoClass: this.saldoClass(r.acumuladoSaldo) + ' ss-acum',
            saldoActual: this.fmtCurrency(r.saldoActual),
            saldoActualClass: this.saldoClass(r.saldoActual) + ' ss-actual',
            efClientes: aplicaEf ? this.fmtDH(r.efectosClientes) : '',
            efClientesClass: aplicaEf ? 'ss-num' : 'ss-num ss-ef-na',
            efProveedores: aplicaEf ? this.fmtDH(r.efectosProveedores) : '',
            efProveedoresClass: aplicaEf ? 'ss-num' : 'ss-num ss-ef-na',
            difEfectos: aplicaEf ? this.fmtCurrency(r.diferenciaEfectos) : '',
            difEfectosClass: aplicaEf ? this.difClass(r.diferenciaEfectos) : 'ss-num ss-ef-na',
            tieneDifEfectos: aplicaEf && Math.abs(this.toNum(r.diferenciaEfectos)) >= 0.005
        };
    }
    saldoClass(v) {
        const n = this.toNum(v);
        if (n > 0) return 'ss-num ss-pos';
        if (n < 0) return 'ss-num ss-neg';
        return 'ss-num ss-zero';
    }
    aplicaEfectos(numero) {
        const n = String(numero || '');
        return n.startsWith('400') || n.startsWith('410') || n.startsWith('430');
    }
    difClass(v) {
        const n = this.toNum(v);
        if (n > 0) return 'ss-num ss-dif ss-dif-pos';
        if (n < 0) return 'ss-num ss-dif ss-dif-neg';
        return 'ss-num';
    }

    // ---------------------------------------------------------------
    //  FORMATO
    // ---------------------------------------------------------------
    toNum(v) { if (v == null) return 0; const n = (typeof v === 'number') ? v : Number(v); return Number.isNaN(n) ? 0 : n; }
    fmtDH(v) { const n = this.toNum(v); return n === 0 ? '—' : this.fmtNumber(n, 2); }
    fmtCurrency(v) { return this.fmtNumber(this.toNum(v), 2); }
    fmtNumber(v, decimals) {
        const n = this.toNum(v);
        const sign = n < 0 ? '-' : '';
        const abs = Math.abs(n).toFixed(decimals);
        const parts = abs.split('.');
        const intDots = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return decimals > 0 ? `${sign}${intDots},${parts[1]}` : `${sign}${intDots}`;
    }
    fmtFecha(d) {
        if (!d) return '';
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        return String(d);
    }

    // ---------------------------------------------------------------
    //  MODAL — al pinchar Debe/Haber de Apertura o Periodo
    // ---------------------------------------------------------------
    handleAmountClick(e) {
        const cuentaId = e.currentTarget.dataset.cuentaid;
        const periodo = e.currentTarget.dataset.periodo;   // 'apertura' | 'periodo'
        const concepto = e.currentTarget.dataset.concepto;
        if (!cuentaId) return;

        this.modalTitulo = concepto || '';
        this.modalSubtitulo = `${periodo === 'apertura' ? 'Asiento de apertura' : 'Periodo'} · ${this.fmtFecha(this.fechaDesde)} – ${this.fmtFecha(this.fechaHasta)}`;
        this.modalMovimientos = [];
        this.modalError = null;
        this.showModal = true;
        this.modalLoading = true;

        getMovimientos({
            cuentaIds: [cuentaId],
            desde: this.fechaDesde,
            hasta: this.fechaHasta,
            empresasTitulares: this.empresasTitulares,
            area: null,
            directorFacturacionId: null,
            simulacion: this.simulacion,
            extraordinarios: this.extraordinarios,
            check: this.check
        })
        .then(result => {
            const esApertura = (periodo === 'apertura');
            this.modalMovimientos = (result || [])
                .filter(m => esApertura ? (m.tipoAsiento === 'Asiento de apertura') : (m.tipoAsiento !== 'Asiento de apertura'))
                .map((m, i) => ({
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

    get hasMovimientos()    { return !!(this.modalMovimientos && this.modalMovimientos.length); }
    get noMovimientos()     { return !this.modalLoading && !this.modalError && !this.hasMovimientos; }
    get modalContentReady() { return !this.modalLoading && !this.modalError && this.hasMovimientos; }

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
        .then(() => { this.dispatchEvent(new ShowToastEvent({ title: 'Guardado', message: 'Apunte actualizado', variant: 'success', mode: 'pester' })); })
        .catch(err => { this.dispatchEvent(new ShowToastEvent({ title: 'Error al guardar', message: this.reduceError(err), variant: 'error' })); });
    }

    // Limpiar: vuelve al estado inicial (filtros por defecto, sin resultados)
    handleLimpiar() {
        this.empresasTitulares = [];
        const y = new Date().getFullYear();
        this.fechaDesde = `${y}-01-01`;
        this.fechaHasta = `${y}-12-31`;
        this.cuentaId = null;
        this.cuentaNumero = '';
        this.cuentaTitulo = '';
        this.cuentaTitBusqueda = '';
        this.cuentaDesdeNumero = ''; this.cuentaDesdeLabel = ''; this.cuentaDesdeBusqueda = '';
        this.cuentaHastaNumero = ''; this.cuentaHastaLabel = ''; this.cuentaHastaBusqueda = '';
        this.simulacion = 'Todas';
        this.extraordinarios = 'No';
        this.check = 'Todos';
        this.cuentasModo = 'Con';
        this.diferenciaEfectos = 'Todas';
        this.generated = false;
        this.loading = false;
        this.error = null;
        this.rows = [];
        this.genEmpresas = [];
        this.incidenciasCount = 0;  this.incidenciasAsientos = [];
        this.descuadradosCount = 0; this.descuadradosAsientos = [];
        this.sinCuentaCount = 0;    this.sinCuentaAsientos = [];
        this.extractosCount = 0;
        this.cuadreBase = 0;    this.cuadreSaldo = 0;    this.cuadreDif = 0;
        this.cuadreRecBase = 0; this.cuadreRecSaldo = 0; this.cuadreRecDif = 0;
        this.showInc = false; this.showDesc = false; this.showSin = false;
        this.showExt = false; this.showCuadre = false; this.showCuadreRec = false;
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
            // Cuenta contable: arrastra empresas titulares y fechas seleccionadas (prefiltro)
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