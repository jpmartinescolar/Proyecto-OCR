import { LightningElement, track, wire, api } from 'lwc';
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import getFilterOptions from '@salesforce/apex/LibroMayorController.getFilterOptions';
import getLibroMayor from '@salesforce/apex/LibroMayorController.getLibroMayor';
import marcarCheck from '@salesforce/apex/LibroMayorController.marcarCheck';
import getEfectosClientes from '@salesforce/apex/LibroMayorController.getEfectosClientes';
import getEfectosProveedores from '@salesforce/apex/LibroMayorController.getEfectosProveedores';
import updateMovimiento from '@salesforce/apex/PyGMensualController.updateMovimiento';
import NOMBRE_FIELD from '@salesforce/schema/Plan_general_contable__c.Name';
import TITULO_FIELD from '@salesforce/schema/Plan_general_contable__c.T_tulo_cuenta__c';
import APARTADO_FIELD from '@salesforce/schema/Plan_general_contable__c.Apartados__c';
import SUBAPARTADO_FIELD from '@salesforce/schema/Plan_general_contable__c.Categor_a_Anal_tica_PyG__c';

const CUENTA_FIELDS = [NOMBRE_FIELD, TITULO_FIELD, APARTADO_FIELD, SUBAPARTADO_FIELD];

export default class CuentaContable extends NavigationMixin(LightningElement) {

    // Cuenta del Plan: viene de la página de registro donde se coloca el componente
    @api recordId;

    @wire(getRecord, { recordId: '$recordId', fields: CUENTA_FIELDS })
    wiredCuenta({ data, error }) {
        if (data) {
            this.cuentaId = this.recordId;
            this.cuentaNumero = getFieldValue(data, NOMBRE_FIELD) || '';
            this.cuentaTitulo = getFieldValue(data, TITULO_FIELD) || '';
            this.cuentaApartado = getFieldValue(data, APARTADO_FIELD) || '';
            this.cuentaSubapartado = getFieldValue(data, SUBAPARTADO_FIELD) || '';
            this.maybeAutoGenerar();
        } else if (error) {
            this.error = this.reduceError(error);
        }
    }

    @track empresasTitulares = [];
    @track fechaDesde;
    @track fechaHasta;

    @track cuentaId = null;
    @track cuentaNumero = '';
    @track cuentaTitulo = '';
    @track cuentaApartado = '';
    @track cuentaSubapartado = '';
    @track cuentaOptions = [];

    @track simulacion = 'Todas';
    @track extraordinarios = 'No';
    @track check = 'Todos';
    @track incidencia = 'Todos';     // Todos | Si | No
    @track acumuladoNav = 'Todas';   // Todas | NoCero | Positivo

    @track loading = false;
    @track navLoading = false;   // recarga silenciosa (navegación / cambio de toggles)
    @track generated = false;
    @track error;
    @track rows = [];
    @track allRows = [];        // todas las filas del periodo (sin drill por mes)
    @track renderLimit = 200;   // carga progresiva: filas visibles
    @track _editRid = null;     // edición bajo demanda: registro en edición
    @track _editFld = null;     // edición bajo demanda: campo en edición
    @track drillYm = null;      // mes seleccionado en el gráfico (yyyy-mm)
    @track chartGroups = [];
    @track chartLegend = [];
    @track multiAnio = false;
    @track chartCuentaNumero = '';   // nº de cuenta en el momento de generar (para mostrar/ocultar gráfico)
    @track genCuentaId = null;       // cuenta "congelada" al generar (cabecera/badge)
    @track genCuentaNumero = '';
    @track genCuentaTitulo = '';
    @track genCuentaApartado = '';
    @track genCuentaSubapartado = '';

    @track avisosParams = null;   // entrada para <c-avisos-cuadre>

    @track empresaOptionsBase = [];
    @track areaOptions = [];
    @track simulacionOptions = [];

    @track showEmpresaDropdown = false;
    @track empresaFiltroBusqueda = '';

    @track showCuentaTitDropdown = false;
    @track cuentaTitBusqueda = '';
    @track showCuentaNumDropdown = false;
    @track cuentaNumBusqueda = '';

    connectedCallback() {
        // Por defecto: ejercicio actual y el anterior (si no llegan fechas del origen)
        const y = new Date().getFullYear();
        if (!this.fechaDesde) this.fechaDesde = `${y - 1}-01-01`;
        if (!this.fechaHasta) this.fechaHasta = `${y}-12-31`;
        this.connectedSentinelListener();
    }

    renderedCallback() {
        if (this._focusTit) {
            const el = this.template.querySelector('.lm-search-tit');
            if (el) { el.focus(); this._focusTit = false; }
        }
        if (this._focusNum) {
            const el = this.template.querySelector('.lm-search-num');
            if (el) { el.focus(); this._focusNum = false; }
        }
        // Observer para carga progresiva al hacer scroll
        const sentinel = this.template.querySelector('.lm-sentinel');
        if (sentinel) {
            if (!this._io) {
                this._io = new IntersectionObserver(
                    entries => { if (entries.some(e => e.isIntersecting)) this.cargarMas(); },
                    { root: null, rootMargin: '300px' }
                );
            }
            if (this._observed !== sentinel) {
                if (this._observed) this._io.unobserve(this._observed);
                this._io.observe(sentinel);
                this._observed = sentinel;
            }
        }
        // Respaldo del observer: comprueba el sentinel tras cada render para
        // encadenar cargas si sigue visible (p.ej. cuando el observer no dispara
        // dentro del contenedor de scroll de la página de registro)
        this.checkSentinel();
    }

    connectedSentinelListener() {
        if (this._onScroll) return;
        this._onScroll = () => this.checkSentinel();
        // capture:true — el scroll no burbujea, pero en captura llega desde window
        // aunque ocurra en el contenedor interno de Lightning
        window.addEventListener('scroll', this._onScroll, true);
    }

    disconnectedCallback() {
        if (this._onScroll) { window.removeEventListener('scroll', this._onScroll, true); this._onScroll = null; }
        if (this._io) { this._io.disconnect(); this._io = null; this._observed = null; }
    }

    // Carga más filas si el sentinel está cerca del viewport (con rAF para no saturar)
    checkSentinel() {
        if (!this.hayMas || this._sentinelRaf) return;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._sentinelRaf = window.requestAnimationFrame(() => {
            this._sentinelRaf = null;
            const s = this.template.querySelector('.lm-sentinel');
            if (!s) return;
            const r = s.getBoundingClientRect();
            if (r.top < window.innerHeight + 300) this.cargarMas();
        });
    }

    // Filtros pre-cargados desde el componente de origen (parámetros c__* de la URL)
    @wire(CurrentPageReference)
    wiredPageRef(pageRef) {
        const state = (pageRef && pageRef.state) || {};
        // Fechas del origen (siempre el filtro normal, nunca el comparativo)
        const reFecha = /^\d{4}-\d{2}-\d{2}$/;
        if (reFecha.test(state.c__desde || '')) this.fechaDesde = state.c__desde;
        if (reFecha.test(state.c__hasta || '')) this.fechaHasta = state.c__hasta;
        // Empresas titulares del origen
        if (!state.c__empresas) return;
        let list = null;
        try { list = JSON.parse(state.c__empresas); } catch (e) { /* parámetro malformado: se ignora */ }
        if (Array.isArray(list) && list.length) {
            this._empresasParam = list;
            this.aplicarEmpresasParam();
        }
    }

    aplicarEmpresasParam() {
        if (!this._empresasParam || !this.empresaOptionsBase.length) return;
        const disponibles = new Set(this.empresaOptionsBase.map(o => o.value));
        const seleccion = this._empresasParam.filter(v => disponibles.has(v));
        this._empresasParam = null;
        if (seleccion.length && !this.empresasTitulares.length) {
            this.empresasTitulares = seleccion;
            this.maybeAutoGenerar();
        }
    }

    @wire(getFilterOptions)
    wiredOpts({ data, error }) {
        if (data) {
            this.empresaOptionsBase = (data.empresasTitulares || []).map(v => ({ label: v, value: v }));
            this.areaOptions = [{ label: '— sin asignar —', value: '' },
                ...((data.areas || []).map(v => ({ label: v, value: v })))];
            this.simulacionOptions = [{ label: '— sin asignar —', value: '' },
                ...((data.simulaciones || []).map(o => ({ label: o.label, value: o.value })))];
            // Sin selección por defecto: solo se preseleccionan las empresas que
            // lleguen del componente de origen (c__empresas)
            this.aplicarEmpresasParam();
            this.maybeAutoGenerar();
        } else if (error) {
            this.error = this.reduceError(error);
        }
    }

    // Autogenera la primera vez en cuanto hay cuenta + empresas + fechas
    maybeAutoGenerar() {
        if (this._autoDone) return;
        if (this.cuentaId && this.empresasTitulares.length && this.fechaDesde && this.fechaHasta) {
            this._autoDone = true;
            this.cargar(false);
        }
    }

    // ---------------------------------------------------------------
    get hasError()    { return !!this.error; }
    get hasRows()     { return this.generated && this.rows && this.rows.length > 0; }
    get emptyState()  { return this.generated && (!this.rows || this.rows.length === 0); }
    // Carga progresiva: solo se pintan las primeras renderLimit filas.
    // Edición bajo demanda: cada celda editable muestra texto y solo se convierte
    // en editor (combobox/record-picker) la celda concreta que se está editando.
    get displayRows() {
        const rid = this._editRid, fld = this._editFld;
        return (this.rows || []).slice(0, this.renderLimit).map(r => ({
            ...r,
            areaDisp: r.area || '—',
            directorDisp: r.directorFacturacion || '—',
            campaniaDisp: r.campaniaId ? 'Asignada' : '—',
            simDisp: r.simulacion || '—',
            checkDisp: r.checkValue === 'Si' ? 'Sí' : (r.checkValue === 'No' ? 'No' : '—'),
            checkDispClass: r.checkValue === 'Si' ? 'lm-chip-si' : (r.checkValue === 'No' ? 'lm-chip-no' : 'lm-chip-na'),
            editArea: rid === r.recordId && fld === 'area',
            editDirector: rid === r.recordId && fld === 'director',
            editCampania: rid === r.recordId && fld === 'campania',
            editSim: rid === r.recordId && fld === 'simulacion',
            editCheck: rid === r.recordId && fld === 'check'
        }));
    }
    get hayMas()      { return (this.rows || []).length > this.renderLimit; }
    get totalFilas()  { return (this.rows || []).length; }
    cargarMas()       { if (this.hayMas) this.renderLimit += 200; }
    get showInicial() { return !this.generated && !this.loading && !this.navLoading && !this.hasError; }
    get textoInicial() {
        const f = [];
        if (this.empresasTitulares.length === 0) f.push('la(s) empresa(s) titular(es)');
        if (!this.fechaDesde || !this.fechaHasta) f.push('las fechas Desde y Hasta');
        if (!f.length) return 'Pulsa';
        return 'Selecciona ' + f.join(' y ') + ' y pulsa';
    }
    get cuentaSeleccionada() { return !!this.cuentaId; }
    // Barra de cuenta + navegación: visible siempre que haya cuenta generada, aunque no tenga apuntes
    get showCuentaBar() { return this.generated && !!this.genCuentaId; }
    get hasChart() {
        // El gráfico sólo aplica a cuentas de explotación (grupos 6 y 7), fijado al generar
        const n = String(this.chartCuentaNumero || '');
        const esExplotacion = n.startsWith('6') || n.startsWith('7');
        return esExplotacion && this.chartGroups && this.chartGroups.length > 0;
    }
    get chartClass() { return this.multiAnio ? 'lm-chart lm-chart-multi' : 'lm-chart'; }
    get isDrilled() { return !!this.drillYm; }
    get drillLabel() {
        if (!this.drillYm) return '';
        const MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        const p = this.drillYm.split('-').map(Number);
        return `${MES[p[1] - 1]} ${p[0]}`;
    }

    get empresaLabel() {
        if (!this.empresasTitulares.length) return '—';
        if (this.empresasTitulares.length === 1) return this.empresasTitulares[0];
        return `${this.empresasTitulares.length} empresas seleccionadas`;
    }
    get periodoLabel() { return `${this.fmtFecha(this.fechaDesde)} – ${this.fmtFecha(this.fechaHasta)}`; }

    // --- buscadores de cuenta (por texto, mismo valor: cuentaId) ---
    get cuentaTitFiltradas() {
        const term = (this.cuentaTitBusqueda || '').toLowerCase().trim();
        return [...this.cuentaOptions]
            .filter(c => !term || (c.titulo || '').toLowerCase().includes(term))
            .sort((a, b) => (a.titulo || '').localeCompare(b.titulo || ''))
            .slice(0, 100)
            .map(c => ({
                id: c.id,
                label: c.titulo || c.numero,
                numero: c.numero,
                optionClass: c.id === this.cuentaId ? 'pyg-ms-option pyg-ms-option-selected' : 'pyg-ms-option'
            }));
    }
    get cuentaNumFiltradas() {
        const term = (this.cuentaNumBusqueda || '').toLowerCase().trim();
        return [...this.cuentaOptions]
            .filter(c => !term || (c.numero || '').toLowerCase().includes(term))
            .sort((a, b) => (a.numero || '').localeCompare(b.numero || ''))
            .slice(0, 100)
            .map(c => ({
                id: c.id,
                label: `${c.numero} — ${c.titulo || ''}`,
                optionClass: c.id === this.cuentaId ? 'pyg-ms-option pyg-ms-option-selected' : 'pyg-ms-option'
            }));
    }
    get sinEmpresa() { return this.empresasTitulares.length === 0; }
    get cuentaTitTriggerLabel() {
        if (this.sinEmpresa) return 'Selecciona antes la empresa titular';
        return this.cuentaTitulo ? this.cuentaTitulo : 'Buscar por título...';
    }
    get cuentaNumTriggerLabel() {
        if (this.sinEmpresa) return 'Selecciona antes la empresa titular';
        return this.cuentaNumero ? `${this.cuentaNumero} — ${this.cuentaTitulo || ''}` : 'Buscar por número...';
    }
    get cuentaTitTriggerClass() { return this.cuentaId ? 'pyg-ms-trigger pyg-ms-trigger-filled' : 'pyg-ms-trigger'; }
    get cuentaNumTriggerClass() { return this.cuentaId ? 'pyg-ms-trigger pyg-ms-trigger-filled' : 'pyg-ms-trigger'; }
    get cuentaTitWrapClass() { return this.showCuentaTitDropdown ? 'pyg-ms-wrap pyg-ms-wrap-open' : 'pyg-ms-wrap'; }
    get cuentaNumWrapClass() { return this.showCuentaNumDropdown ? 'pyg-ms-wrap pyg-ms-wrap-open' : 'pyg-ms-wrap'; }

    // --- multi-select empresa ---
    get empresaOptionsFiltradas() {
        const term = (this.empresaFiltroBusqueda || '').toLowerCase().trim();
        return (this.empresaOptionsBase || [])
            .filter(o => !term || o.label.toLowerCase().includes(term))
            .map(o => ({
                ...o,
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
        return this.empresasTitulares.length ? 'pyg-ms-trigger pyg-ms-trigger-filled' : 'pyg-ms-trigger';
    }
    get empresaDropdownClass() {
        return this.showEmpresaDropdown ? 'pyg-ms-wrap pyg-ms-wrap-open' : 'pyg-ms-wrap';
    }
    get empresaCount() { return `${this.empresasTitulares.length} / ${this.empresaOptionsBase.length}`; }

    // --- opciones edición inline ---
    get areaEditOptions() { return this.areaOptions; }
    get simulacionEditOptions() { return this.simulacionOptions; }
    get checkEditOptions() {
        return [
            { label: '— sin asignar —', value: '' },
            { label: 'No', value: 'No' },
            { label: 'Sí', value: 'Si' }
        ];
    }

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
    get incTodosCls() { return this.toggleCls(this.incidencia === 'Todos'); }
    get incSiCls()    { return this.toggleCls(this.incidencia === 'Si'); }
    get incNoCls()    { return this.toggleCls(this.incidencia === 'No'); }
    get acuTodasCls() { return this.toggleCls(this.acumuladoNav === 'Todas'); }
    get acuNoCeroCls(){ return this.toggleCls(this.acumuladoNav === 'NoCero'); }
    get acuPosCls()   { return this.toggleCls(this.acumuladoNav === 'Positivo'); }
    toggleCls(active) { return active ? 'pyg-toggle pyg-toggle-active' : 'pyg-toggle'; }

    setSimulacion(e)      { this.simulacion = e.currentTarget.dataset.value; this.autoGenerar(); }
    setExtraordinarios(e) { this.extraordinarios = e.currentTarget.dataset.value; this.autoGenerar(); }
    setCheck(e)           { this.check = e.currentTarget.dataset.value; this.autoGenerar(); }
    setIncidencia(e)      { this.incidencia = e.currentTarget.dataset.value; this.autoGenerar(); }
    setAcumuladoNav(e)    { this.acumuladoNav = e.currentTarget.dataset.value; this.autoGenerar(); }

    // Re-ejecuta Generar automáticamente al cambiar un filtro (si ya hay cuenta+empresa)
    autoGenerar() {
        if (this.cuentaId && this.empresasTitulares.length) this.cargar(true);
    }

    // --- handlers de filtros ---
    handleFechaDesdeChange(e) { this.fechaDesde = e.detail.value || null; }
    handleFechaHastaChange(e) { this.fechaHasta = e.detail.value || null; }

    syncCuentaInfo() {
        const c = this.cuentaOptions.find(o => o.id === this.cuentaId);
        this.cuentaNumero = c ? c.numero : '';
        this.cuentaTitulo = c ? (c.titulo || '') : '';
        this.cuentaApartado = c ? (c.apartado || '') : '';
        this.cuentaSubapartado = c ? (c.subapartado || '') : '';
    }
    get showAnalitica() {
        const n = String(this.genCuentaNumero || '');
        return (n.startsWith('6') || n.startsWith('7')) && (this.genCuentaApartado || this.genCuentaSubapartado);
    }
    get apartadoOperaciones() {
        return String(this.genCuentaApartado || '').toLowerCase().includes('operaciones');
    }

    // --- buscadores de cuenta ---
    toggleCuentaTitDropdown(e) {
        e.stopPropagation();
        this.showCuentaTitDropdown = !this.showCuentaTitDropdown;
        this.showCuentaNumDropdown = false;
        if (this.showCuentaTitDropdown) { this.cuentaTitBusqueda = ''; this._focusTit = true; }
    }
    closeCuentaTitDropdown() { this.showCuentaTitDropdown = false; }
    handleCuentaTitBusqueda(e) { this.cuentaTitBusqueda = e.target.value || ''; }
    handleCuentaTitPick(e) {
        this.cuentaId = e.currentTarget.dataset.id;
        this.syncCuentaInfo();
        this.showCuentaTitDropdown = false;
    }
    toggleCuentaNumDropdown(e) {
        e.stopPropagation();
        this.showCuentaNumDropdown = !this.showCuentaNumDropdown;
        this.showCuentaTitDropdown = false;
        if (this.showCuentaNumDropdown) { this.cuentaNumBusqueda = ''; this._focusNum = true; }
    }
    closeCuentaNumDropdown() { this.showCuentaNumDropdown = false; }
    handleCuentaNumBusqueda(e) { this.cuentaNumBusqueda = e.target.value || ''; }
    handleCuentaNumPick(e) {
        this.cuentaId = e.currentTarget.dataset.id;
        this.syncCuentaInfo();
        this.showCuentaNumDropdown = false;
    }

    toggleEmpresaDropdown(e) {
        e.stopPropagation();
        this.showEmpresaDropdown = !this.showEmpresaDropdown;
        if (this.showEmpresaDropdown) this.empresaFiltroBusqueda = '';
    }
    closeEmpresaDropdown() { this.showEmpresaDropdown = false; }
    stopProp(e)           { e.stopPropagation(); }
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

    // ---------------------------------------------------------------
    //  GENERAR  (la cuenta viene fijada por la página de registro)
    // ---------------------------------------------------------------
    handleGenerar() {
        const faltan = [];
        if (this.empresasTitulares.length === 0) faltan.push('empresa titular');
        if (!this.cuentaId) faltan.push('la cuenta contable (abre el componente desde una cuenta del plan)');
        if (!this.fechaDesde || !this.fechaHasta) faltan.push('las fechas Desde y Hasta');
        if (faltan.length) {
            this.error = `Debes seleccionar ${faltan.join(', ')}.`;
            return;
        }
        this.cargar(false);
    }

    cargar(silent) {
        this.error = null;
        if (silent) {
            this.navLoading = true;
        } else {
            this.loading = true;
            this.generated = false;
        }
        getLibroMayor({
            cuentaId: this.cuentaId,
            empresasTitulares: this.empresasTitulares,
            desde: this.fechaDesde,
            hasta: this.fechaHasta,
            simulacion: this.simulacion,
            extraordinarios: this.extraordinarios,
            check: this.check,
            incidencia: this.incidencia
        })
        .then(result => {
            this.allRows = (result || []).map((m, i) => this.mapRow(m, i));
            this.drillYm = null;
            this.rows = this.allRows;
            this.renderLimit = 200;
            this.chartCuentaNumero = this.cuentaNumero;
            this.genCuentaId = this.cuentaId;
            this.genCuentaNumero = this.cuentaNumero;
            this.genCuentaTitulo = this.cuentaTitulo;
            this.genCuentaApartado = this.cuentaApartado;
            this.genCuentaSubapartado = this.cuentaSubapartado;
            // Pestañas Movimientos / Efectos (cuentas 430 y 410)
            this.subTab = 'mov';
            this.efectos = [];
            this.efectosProv = [];
            if (String(this.cuentaNumero || '').startsWith('430')) this.cargarEfectos();
            if (String(this.cuentaNumero || '').startsWith('410')) this.cargarEfectosProveedores();
            this.buildChart(result || []);
            this.avisosParams = {
                empresas: [...this.empresasTitulares],
                desde: this.fechaDesde,
                hasta: this.fechaHasta
            };
            this.generated = true;
        })
        .catch(err => {
            this.error = this.reduceError(err);
            this.rows = [];
            this.generated = true;
        })
        .finally(() => { this.loading = false; this.navLoading = false; });
    }

    handleRefresh() { if (this.generated) this.cargar(false); }

    // ---------------------------------------------------------------
    //  PESTAÑAS Movimientos contables / Efectos clientes (cuentas 430)
    // ---------------------------------------------------------------
    @track subTab = 'mov';
    @track efectos = [];
    @track efectosLoading = false;

    get es430() { return this.generated && String(this.genCuentaNumero || '').startsWith('430'); }
    get es410() { return this.generated && String(this.genCuentaNumero || '').startsWith('410'); }
    get esEfectosCuenta() { return this.es430 || this.es410; }
    get showSubTabs() { return this.esEfectosCuenta && !this.loading; }
    get tabMovCls() { return this.subTab === 'mov' ? 'lm-subtab lm-subtab-active' : 'lm-subtab'; }
    get tabEfeCls() { return this.subTab === 'efectos' ? 'lm-subtab lm-subtab-active' : 'lm-subtab'; }
    get efectosCount() { return this.efectos.length; }
    get tabEfeLabel() {
        return this.es410
            ? `Efectos Proveedores (${this.efectosProv.length})`
            : `Efectos clientes (${this.efectos.length})`;
    }
    get showTablaMov() { return this.hasRows && (!this.esEfectosCuenta || this.subTab === 'mov'); }
    get showEmptyMov() { return this.emptyState && (!this.esEfectosCuenta || this.subTab === 'mov'); }
    get showTablaEfectos() { return this.es430 && this.subTab === 'efectos' && !this.efectosLoading && this.efectos.length > 0; }
    get showEmptyEfectos() { return this.es430 && this.subTab === 'efectos' && !this.efectosLoading && this.efectos.length === 0; }
    get showTablaEfectosProv() { return this.es410 && this.subTab === 'efectos' && !this.efectosProvLoading && this.efectosProv.length > 0; }
    get showEmptyEfectosProv() { return this.es410 && this.subTab === 'efectos' && !this.efectosProvLoading && this.efectosProv.length === 0; }
    setSubTab(e) { this.subTab = e.currentTarget.dataset.value; }

    @track saldoEfectosRojos = 0;

    get saldoEfectosRojosFmt() { return this.fmtCurrency(this.saldoEfectosRojos); }
    get showSaldoEfectos() { return this.es430; }
    get saldoEfectosBoxClass() {
        const v = Number(this.saldoEfectosRojos) || 0;
        if (v < 0) return 'lm-saldo-box lm-saldo-neg';
        if (v > 0) return 'lm-saldo-box lm-saldo-pos';
        return 'lm-saldo-box lm-saldo-zero';
    }

    cargarEfectos() {
        this.efectosLoading = true;
        this.saldoEfectosRojos = 0;
        getEfectosClientes({ cuentaId: this.genCuentaId, empresasTitulares: this.empresasTitulares })
            .then(res => {
                this.saldoEfectosRojos = (res || [])
                    .filter(x => x.abierto && x.estado !== 'Dividido')
                    .reduce((t, x) => t + (Number(x.importe) || 0), 0);
                this.efectos = (res || []).map((x, i) => ({
                    key: 'ef' + i,
                    id: x.id,
                    numero: x.numero,
                    importe: this.fmtCurrency(x.importe),
                    fechaVenc: this.fmtFecha(x.fechaVencimientoInicial),
                    estado: x.estado || '',
                    facturaId: x.facturaId,
                    facturaNumero: x.facturaNumero || '',
                    hayFactura: !!x.facturaId,
                    origenId: x.origenId,
                    origenNumero: x.origenNumero || '',
                    hayOrigen: !!x.origenId,
                    compensadoId: x.compensadoId,
                    compensadoNumero: x.compensadoNumero || '',
                    hayCompensado: !!x.compensadoId,
                    // Dividido: no se marca en rojo (tampoco suma en el saldo)
                    rowClass: (x.abierto && x.estado !== 'Dividido') ? 'lm-ef-row lm-ef-abierto' : 'lm-ef-row'
                }));
            })
            .catch(() => { this.efectos = []; })
            .finally(() => { this.efectosLoading = false; });
    }

    // ---------------------------------------------------------------
    //  EFECTOS PROVEEDORES (cuentas 410)
    // ---------------------------------------------------------------
    @track efectosProv = [];
    @track efectosProvLoading = false;
    @track saldoEfectosProv = 0;

    get saldoEfectosProvFmt() { return this.fmtCurrency(this.saldoEfectosProv); }
    get showSaldoEfectosProv() { return this.es410; }
    get saldoEfectosProvBoxClass() {
        const v = Number(this.saldoEfectosProv) || 0;
        if (v < 0) return 'lm-saldo-box lm-saldo-neg';
        if (v > 0) return 'lm-saldo-box lm-saldo-pos';
        return 'lm-saldo-box lm-saldo-zero';
    }

    // Diferencia entre saldo de movimientos y saldo de efectos (430: clientes · 410: proveedores)
    get saldoMovimientosNum() {
        if (!this.allRows || !this.allRows.length) return 0;
        return this.unfmt(this.allRows[0].saldo);
    }
    get diferenciaEfectosNum() {
        const efectos = this.es410 ? this.saldoEfectosProv : this.saldoEfectosRojos;
        return this.saldoMovimientosNum - (Number(efectos) || 0);
    }
    get showDiferenciaBox() {
        if (!this.es430 && !this.es410) return false;
        if (this.es430 && this.efectosLoading) return false;
        if (this.es410 && this.efectosProvLoading) return false;
        return Math.abs(this.diferenciaEfectosNum) >= 0.005;
    }
    get diferenciaEfectosFmt() { return this.fmtCurrency(this.diferenciaEfectosNum); }

    cargarEfectosProveedores() {
        this.efectosProvLoading = true;
        this.saldoEfectosProv = 0;
        getEfectosProveedores({ cuentaId: this.genCuentaId, empresasTitulares: this.empresasTitulares })
            .then(res => {
                // Suma de los efectos pendientes (estado distinto de Conciliado / Remesa / Tarjeta)
                this.saldoEfectosProv = (res || [])
                    .filter(x => x.abierto)
                    .reduce((t, x) => t + (Number(x.importe) || 0), 0);
                this.efectosProv = (res || []).map((x, i) => ({
                    key: 'efp' + i,
                    id: x.id,
                    numero: x.numero,
                    importe: this.fmtCurrency(x.importe),
                    fechaVenc: this.fmtFecha(x.fechaVencimiento),
                    estado: x.estado || '',
                    tipoEfecto: x.tipoEfecto || '',
                    formaPago: x.formaPago || '',
                    facturaId: x.facturaRecibidaId,
                    facturaNumero: x.facturaRecibidaNumero || '',
                    hayFactura: !!x.facturaRecibidaId,
                    notaGastosId: x.notaGastosId,
                    notaGastosNumero: x.notaGastosNumero || '',
                    hayNotaGastos: !!x.notaGastosId,
                    pedidoId: x.pedidoCompraId,
                    pedidoNumero: x.pedidoCompraNumero || '',
                    hayPedido: !!x.pedidoCompraId,
                    campaniaId: x.campaniaId,
                    campaniaNombre: x.campaniaNombre || '',
                    hayCampania: !!x.campaniaId,
                    rowClass: x.abierto ? 'lm-ef-row lm-ef-abierto' : 'lm-ef-row'
                }));
            })
            .catch(() => { this.efectosProv = []; })
            .finally(() => { this.efectosProvLoading = false; });
    }

    mapRow(m, i) {
        const saldo = this.toNum(m.saldo);
        // Enlace de la descripción: factura recibida (prioritario) → nota de gastos
        let descLinkId = null, descLinkObject = null, descLinkTitle = '';
        const esCuenta6 = String(this.cuentaNumero || '').startsWith('6');
        if (esCuenta6 && m.nominaId) {
            descLinkId = m.nominaId;
            descLinkObject = 'N_minas_empleados__c';
            descLinkTitle = m.nominaEmpleado
                ? `Empleado: ${m.nominaEmpleado}`
                : 'Abrir nómina en una pestaña nueva';
        } else if (m.facturaRecibidaId) {
            descLinkId = m.facturaRecibidaId;
            descLinkObject = 'Facturas_recibidas_eventos__c';
            descLinkTitle = m.facturaRecibidaDesc
                ? `Descripción factura recibida: ${m.facturaRecibidaDesc}`
                : 'Abrir factura recibida en una pestaña nueva';
        } else if (m.notaGastosId) {
            descLinkId = m.notaGastosId;
            descLinkObject = 'Gastos_de_viaje_o_representaci_n__c';
            descLinkTitle = 'Abrir nota de gastos en una pestaña nueva';
        } else if (m.lineaFacturaEmitidaId) {
            descLinkId = m.lineaFacturaEmitidaId;
            descLinkObject = 'L_nea_de_factura__c';
            descLinkTitle = 'Abrir línea de factura emitida en una pestaña nueva';
        }
        return {
            key: 'lm' + i,
            recordId: m.recordId,
            extraordinario: !!m.extraordinario,
            objectApiName: m.objectApiName,
            fecha: this.fmtFecha(m.fecha),
            ym: String(m.fecha || '').slice(0, 7),
            incidenciaSi: m.incidencia === 'Si',
            incidenciaNo: m.incidencia === 'No',
            numeroApunte: m.numeroApunte || '',
            numeroAsiento: m.numeroAsiento || '',
            asientoId: m.asientoId || null,
            extractoId: m.extractoBancarioId || null,
            extractoNumero: m.extractoBancarioNumero || '',
            hayExtracto: !!m.extractoBancarioId,
            extractoTitle: [
                m.extractoBancarioConcepto ? `Concepto: ${m.extractoBancarioConcepto}` : null,
                m.extractoBancarioMasDatos ? `Más datos: ${m.extractoBancarioMasDatos}` : null
            ].filter(Boolean).join('\n') || 'Abrir el extracto bancario en una pestaña nueva',
            descLinkId, descLinkObject, descLinkTitle,
            descripcion: m.descripcion || '',
            debe: this.fmtCurrency(m.debe),
            haber: this.fmtCurrency(m.haber),
            debeClass: this.toNum(m.debe) < 0 ? 'pyg-num pyg-neg' : 'pyg-num',
            haberClass: this.toNum(m.haber) < 0 ? 'pyg-num pyg-neg' : 'pyg-num',
            saldo: this.fmtCurrency(m.saldo),
            saldoClass: saldo < 0 ? 'pyg-num pyg-neg' : (saldo > 0 ? 'pyg-num pyg-pos' : 'pyg-num pyg-zero'),
            empresaTitular: m.empresaTitular || '',
            area: m.area || '',
            directorFacturacionId: m.directorFacturacionId || null,
            directorFacturacion: m.directorFacturacion || '',
            campaniaId: m.campaniaId || null,
            simulacion: m.simulacion || '',
            rowClass: this.rowSimClass(m.simulacion),
            ...this.checkProps(m.checkValue)
        };
    }

    // Resaltado de fila según simulación: Sí → rojo · Sí. Transferencia → amarillo
    rowSimClass(v) {
        if (v === 'Si') return 'pyg-row lm-row-sim-rojo';
        if (v === 'Sí. Transferencia') return 'pyg-row lm-row-sim-amarillo';
        return 'pyg-row';
    }

    // Propiedades de presentación del check (color verde=Sí, rojo=No)
    checkProps(v) {
        return {
            checkValue: v || '',
            checkIsSi: v === 'Si',
            checkIsNo: v === 'No',
            checkIsBlank: !v,
            // Verde sólo si es "Sí"; "No" y vacío en rojo
            checkSelectClass: v === 'Si'
                ? 'lm-check-select lm-check-si'
                : 'lm-check-select lm-check-no'
        };
    }

    // ---------------------------------------------------------------
    //  GRÁFICO: Haber − Debe por mes (cronológico, huecos a cero)
    // ---------------------------------------------------------------
    buildChart(result) {
        const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const PAL = ['#1b96ff', '#2e844a', '#c9a45c', '#9050e9', '#e8731a', '#0b9bb5'];
        const H = 70; // px por mitad (positiva / negativa)

        // Haber − Debe por mes (yyyy-mm)
        const map = {};
        (result || []).forEach(m => {
            if (!m.fecha) return;
            const ym = String(m.fecha).slice(0, 7);
            map[ym] = (map[ym] || 0) + (this.toNum(m.haber) - this.toNum(m.debe));
        });

        // Rango de meses: por el filtro de fechas; si falta, por los datos
        const parse = (s) => String(s).split('-').map(Number);
        let startY, startM, endY, endM;
        if (this.fechaDesde && this.fechaHasta) {
            [startY, startM] = parse(this.fechaDesde);
            [endY, endM] = parse(this.fechaHasta);
        } else {
            const keys = Object.keys(map).sort();
            if (!keys.length) { this.chartGroups = []; this.chartLegend = []; this.multiAnio = false; return; }
            [startY, startM] = keys[0].split('-').map(Number);
            [endY, endM] = keys[keys.length - 1].split('-').map(Number);
        }
        const startIdx = startY * 12 + (startM - 1);
        const endIdx = endY * 12 + (endM - 1);
        if (endIdx < startIdx) { this.chartGroups = []; this.chartLegend = []; this.multiAnio = false; return; }

        const years = [];
        for (let y = startY; y <= endY; y++) years.push(y);
        const multiAnio = (startY !== endY);
        this.multiAnio = multiAnio;
        const yearColor = {};
        years.forEach((y, i) => { yearColor[y] = PAL[i % PAL.length]; });

        const valAt = (y, m) => map[`${y}-${String(m).padStart(2, '0')}`] || 0;

        // maxAbs sobre todos los meses del rango (para la escala)
        let maxAbs = 0;
        for (let idx = startIdx; idx <= endIdx; idx++) {
            maxAbs = Math.max(maxAbs, Math.abs(valAt(Math.floor(idx / 12), (idx % 12) + 1)));
        }

        // Escala raíz cuadrada: comprime los grandes para que los pequeños se vean
        const mkBar = (y, m, color) => {
            const v = valAt(y, m);
            const scale = maxAbs > 0 ? Math.sqrt(Math.abs(v) / maxAbs) : 0;
            let px = Math.round(scale * H);
            if (v !== 0 && px < 4) px = 4; // altura mínima visible
            const pos = v > 0;
            return {
                key: `${y}-${m}`,
                ym: `${y}-${String(m).padStart(2, '0')}`,
                posStyle: pos ? `height:${px}px;background:${color}` : 'height:0px',
                negStyle: !pos ? `height:${px}px;background:${color}` : 'height:0px',
                titleAttr: `${MES[m - 1]} ${y}: ${this.fmtCurrency(v)}`
            };
        };

        const groups = [];
        if (!multiAnio) {
            // Un año: una barra por mes (azul positivo / rojo negativo)
            for (let idx = startIdx; idx <= endIdx; idx++) {
                const y = Math.floor(idx / 12), m = (idx % 12) + 1;
                const v = valAt(y, m);
                const color = v >= 0 ? '#1b96ff' : '#ba0517';
                groups.push({ key: `g${idx}`, label: MES[m - 1], bars: [mkBar(y, m, color)] });
            }
        } else {
            // Varios años: agrupar por mes natural; una barra por año (color por año)
            for (let m = 1; m <= 12; m++) {
                const bars = [];
                years.forEach(y => {
                    const idx = y * 12 + (m - 1);
                    if (idx >= startIdx && idx <= endIdx) bars.push(mkBar(y, m, yearColor[y]));
                });
                if (bars.length) groups.push({ key: `m${m}`, label: MES[m - 1], bars });
            }
        }

        this.chartGroups = groups;
        this.chartLegend = multiAnio
            ? years.map(y => ({ year: y, swatchStyle: `background:${yearColor[y]}` }))
            : [];
    }

    // Drill-down: al pinchar una barra del gráfico, mostrar sólo ese mes
    handleBarClick(e) {
        const ym = e.currentTarget.dataset.ym;
        if (!ym) return;
        this.drillYm = ym;
        this.rows = this.allRows.filter(r => r.ym === ym);
        this.renderLimit = 200;
    }
    handleResetDrill() {
        this.drillYm = null;
        this.rows = this.allRows;
        this.renderLimit = 200;
    }

    // ---------------------------------------------------------------
    //  TOTALES
    // ---------------------------------------------------------------
    get totalDebe() {
        const t = (this.rows || []).reduce((s, r) => s + this.unfmt(r.debe), 0);
        return this.fmtCurrency(t);
    }
    get totalHaber() {
        const t = (this.rows || []).reduce((s, r) => s + this.unfmt(r.haber), 0);
        return this.fmtCurrency(t);
    }
    get totalSaldo() {
        // El saldo final acumulado = el de la fila más reciente (primera, orden desc)
        if (!this.rows || !this.rows.length) return this.fmtCurrency(0);
        return this.rows[0].saldo;
    }
    get totalSaldoClass() {
        if (!this.rows || !this.rows.length) return 'pyg-num';
        return this.rows[0].saldoClass;
    }
    get totalLabel() {
        return `TOTALES — Cuenta ${this.genCuentaNumero} ${this.genCuentaTitulo}`;
    }
    // Saldo final acumulado del periodo (fila más reciente del conjunto completo)
    get saldoFinal() {
        if (!this.allRows || !this.allRows.length) return this.fmtCurrency(0);
        return this.allRows[0].saldo;
    }
    get saldoFinalClass() {
        if (!this.allRows || !this.allRows.length) return 'pyg-zero';
        return this.allRows[0].saldoClass;
    }
    get saldoBoxClass() {
        const c = this.saldoFinalClass;
        if (c.indexOf('pyg-neg') >= 0) return 'lm-saldo-box lm-saldo-neg';
        if (c.indexOf('pyg-pos') >= 0) return 'lm-saldo-box lm-saldo-pos';
        return 'lm-saldo-box lm-saldo-zero';
    }

    // ---------------------------------------------------------------
    //  EDICIÓN INLINE (bajo demanda: solo se renderiza el editor al pinchar)
    // ---------------------------------------------------------------
    startEdit(e) {
        this._editRid = e.currentTarget.dataset.rid;
        this._editFld = e.currentTarget.dataset.fld;
    }
    cerrarEdit() { this._editRid = null; this._editFld = null; }

    handleEdit(e) {
        const rid = e.currentTarget.dataset.rid;
        const fld = e.currentTarget.dataset.fld;
        const value = e.detail.value;
        const idx = this.rows.findIndex(r => r.recordId === rid);
        if (idx < 0) return;
        const row = { ...this.rows[idx] };
        if (fld === 'area')       row.area = value;
        if (fld === 'simulacion') { row.simulacion = value; row.rowClass = this.rowSimClass(value); }
        this.rows[idx] = row;
        this.rows = [...this.rows];
        this.cerrarEdit();
        this.saveInline(row);
    }
    // Marca como "Sí" el check de TODOS los apuntes en pantalla
    handleMarcarTodosCheckSi() {
        const lineaIds = (this.rows || []).filter(r => !r.extraordinario).map(r => r.recordId);
        const extraIds = (this.rows || []).filter(r => r.extraordinario).map(r => r.recordId);
        if (!lineaIds.length && !extraIds.length) return;
        this.navLoading = true;
        marcarCheck({ lineaIds, extraIds, valor: 'Si' })
            .then(() => {
                this.rows = this.rows.map(r => ({ ...r, ...this.checkProps('Si') }));
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Check actualizado',
                    message: `${lineaIds.length + extraIds.length} apuntes marcados como Sí`,
                    variant: 'success', mode: 'pester'
                }));
            })
            .catch(err => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Error al guardar', message: this.reduceError(err), variant: 'error'
                }));
            })
            .finally(() => { this.navLoading = false; });
    }

    handleEditCheck(e) {
        const rid = e.currentTarget.dataset.rid;
        const value = e.target.value;
        const idx = this.rows.findIndex(r => r.recordId === rid);
        if (idx < 0) return;
        const row = { ...this.rows[idx], ...this.checkProps(value) };
        this.rows[idx] = row;
        this.rows = [...this.rows];
        this.cerrarEdit();
        this.saveInline(row);
    }
    handleEditDirector(e) {
        const rid = e.currentTarget.dataset.rid;
        const directorId = e.detail && e.detail.recordId ? e.detail.recordId : null;
        const idx = this.rows.findIndex(r => r.recordId === rid);
        if (idx < 0) return;
        const row = { ...this.rows[idx], directorFacturacionId: directorId,
            directorFacturacion: directorId ? (this.rows[idx].directorFacturacion || 'Asignado') : '' };
        this.rows[idx] = row;
        this.rows = [...this.rows];
        this.cerrarEdit();
        this.saveInline(row);
    }
    handleEditCampania(e) {
        const rid = e.currentTarget.dataset.rid;
        const campaniaId = e.detail && e.detail.recordId ? e.detail.recordId : null;
        const idx = this.rows.findIndex(r => r.recordId === rid);
        if (idx < 0) return;
        const row = { ...this.rows[idx], campaniaId: campaniaId };
        this.rows[idx] = row;
        this.rows = [...this.rows];
        this.cerrarEdit();
        this.saveInline(row);
    }
    saveInline(row) {
        updateMovimiento({
            recordId: row.recordId,
            esExtraordinario: !!row.extraordinario,
            area: row.area || null,
            directorFacturacionId: row.directorFacturacionId || null,
            simulacion: row.simulacion || null,
            checkValue: row.checkValue || null,
            campaniaId: row.campaniaId || null
        })
        .then(() => {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Guardado', message: 'Apunte actualizado', variant: 'success', mode: 'pester'
            }));
        })
        .catch(err => {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error al guardar', message: this.reduceError(err), variant: 'error'
            }));
        });
    }

    // ---------------------------------------------------------------
    //  NAVEGACIÓN A REGISTRO (ventana nueva)
    // ---------------------------------------------------------------
    // Limpiar: vuelve al estado inicial (filtros por defecto, sin resultados).
    // La cuenta del registro (recordId) se conserva, igual que al entrar.
    handleLimpiar() {
        this.empresasTitulares = [];
        const y = new Date().getFullYear();
        this.fechaDesde = `${y - 1}-01-01`;
        this.fechaHasta = `${y}-12-31`;
        this.simulacion = 'Todas';
        this.extraordinarios = 'No';
        this.check = 'Todos';
        this.incidencia = 'Todos';
        this.acumuladoNav = 'Todas';
        this.generated = false;
        this.loading = false;
        this.navLoading = false;
        this.error = null;
        this.rows = [];
        this.allRows = [];
        this.renderLimit = 200;
        this._editRid = null;
        this._editFld = null;
        this.drillYm = null;
        this.chartGroups = [];
        this.chartLegend = [];
        this.multiAnio = false;
        this.chartCuentaNumero = '';
        this.genCuentaId = null;
        this.genCuentaNumero = '';
        this.genCuentaTitulo = '';
        this.genCuentaApartado = '';
        this.genCuentaSubapartado = '';
        this.avisosParams = null;
        this.subTab = 'mov';
        this.efectos = [];
        this.efectosLoading = false;
        this.saldoEfectosRojos = 0;
        this.efectosProv = [];
        this.efectosProvLoading = false;
        this.saldoEfectosProv = 0;
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

    // ---------------------------------------------------------------
    //  FORMATO
    // ---------------------------------------------------------------
    toNum(v) {
        if (v == null) return 0;
        const n = (typeof v === 'number') ? v : Number(v);
        return Number.isNaN(n) ? 0 : n;
    }
    fmtCurrency(v) {
        const n = this.toNum(v);
        return this.fmtNumber(n, 2) + ' €';
    }
    fmtNumber(v, decimals) {
        const n = this.toNum(v);
        const sign = n < 0 ? '-' : '';
        const abs = Math.abs(n).toFixed(decimals);
        const parts = abs.split('.');
        const intDots = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return decimals > 0 ? `${sign}${intDots},${parts[1]}` : `${sign}${intDots}`;
    }
    unfmt(s) {
        // "1.234,56 €" -> 1234.56
        if (!s) return 0;
        const clean = String(s).replace(/\s|€/g, '').replace(/\./g, '').replace(',', '.');
        const n = Number(clean);
        return Number.isNaN(n) ? 0 : n;
    }
    fmtFecha(d) {
        if (!d) return '';
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        return String(d);
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