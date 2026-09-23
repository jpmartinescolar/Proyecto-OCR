import { LightningElement, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getMediosPago from '@salesforce/apex/TesoreriaController.getMediosPago';
import getSerieEmpresa from '@salesforce/apex/TesoreriaController.getSerieEmpresa';
import getSerieGrupo from '@salesforce/apex/TesoreriaController.getSerieGrupo';
import getEfectosClientesResumen from '@salesforce/apex/TesoreriaController.getEfectosClientesResumen';
import getEfectosClientesKpis from '@salesforce/apex/TesoreriaController.getEfectosClientesKpis';
import getEfcFiltroOpciones from '@salesforce/apex/TesoreriaController.getEfcFiltroOpciones';
import getEfectosAntiguedadResumen from '@salesforce/apex/TesoreriaController.getEfectosAntiguedadResumen';
import buscarEfectosClientes from '@salesforce/apex/TesoreriaController.buscarEfectosClientes';
import getExtractosCuenta from '@salesforce/apex/TesoreriaController.getExtractosCuenta';
import buscarEfectosConciliacion from '@salesforce/apex/TesoreriaController.buscarEfectosConciliacion';
import getPdfPublicUrls from '@salesforce/apex/TesoreriaController.getPdfPublicUrls';
import getConciliacionMovimiento from '@salesforce/apex/TesoreriaController.getConciliacionMovimiento';
import crearMovimientoBanco from '@salesforce/apex/TesoreriaController.crearMovimientoBanco';
import conciliarMovimiento from '@salesforce/apex/TesoreriaController.conciliarMovimiento';
import getRemesasPendientes from '@salesforce/apex/TesoreriaController.getRemesasPendientes';
import getEfectosDeCliente from '@salesforce/apex/TesoreriaController.getEfectosDeCliente';
import getEfectosDeProveedor from '@salesforce/apex/TesoreriaController.getEfectosDeProveedor';
import getHojaCajaExtra from '@salesforce/apex/TesoreriaController.getHojaCajaExtra';
import crearMovimientoHojaCaja from '@salesforce/apex/TesoreriaController.crearMovimientoHojaCaja';
import getCuentasSeguro from '@salesforce/apex/TesoreriaController.getCuentasSeguro';

// Enlaces históricos (documentación antigua en Google Drive)
const URL_HOJAS_CAJA_ANTIGUAS = 'https://drive.google.com/drive/folders/0B96xPvVGvYwoN2ZpVlllaVhxSWs?resourcekey=0-5e9J204ISEuwwmXdGWZ6Jg';
const URL_INTERMEDIACIONES_ANTIGUAS = 'https://docs.google.com/spreadsheets/d/1y727VOmJEBcxVfgZAV17kt4hFBBFdBZEcpAr0pO4tls/edit?gid=565168988#gid=565168988';

const COLOR_CUENTAS  = '#0070d2';
const COLOR_CAJAS    = '#2e844a';
const COLOR_TARJETAS = '#ba0517';
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// Columnas de estados del cuadro de efectos clientes (en este orden)
const ESTADOS_EFC = [
    { key: 'Pendiente',       label: 'Pendiente' },
    { key: 'Error o bloqueo', label: 'Error' },
    { key: 'Abono',           label: 'Abono' },
    { key: 'Devuelto',        label: 'Devuelto' },
    { key: 'Reclamación 1ª',  label: 'Reclamación 1ª' },
    { key: 'Reclamación 2ª',  label: 'Reclamación 2ª' },
    { key: 'Monitorio',       label: 'Monitorio' }
];
const TRAMOS_EFC = ['EN_PLAZO', '0-30', '31-60', '61-90', '91-120', '+120'];
const EFL_PAGE = 100;   // filas del listado por página (botón Ver más)
const TRAMO_LABELS = { 'EN_PLAZO': 'En plazo', '0-30': '0–30 días', '31-60': '31–60 días', '61-90': '61–90 días', '91-120': '91–120 días', '+120': '+120 días' };

export default class Tesoreria extends NavigationMixin(LightningElement) {

    @track tab = 'medios';
    @track loading = false;
    @track error;
    // Buscadores por columna: banco, IBAN o empresa titular
    @track filtroCuentas = '';
    @track filtroTarjetas = '';
    @track filtroCajas = '';

    // Listados por tipo
    @track cuentasBancarias = [];
    @track tarjetas = [];
    @track hojasCaja = [];
    @track totalMediosFmt = '';
    @track totalMediosCls = 'ts-card-total';
    @track empresaSel = null;   // empresa seleccionada en el gráfico de barras
    @track grupoSel = null;     // grupo seleccionado: 'propias' | 'otras'

    // Pestaña Efectos clientes
    @track efcRows = [];
    @track efcLoading = false;
    @track efcError = null;
    @track efcLoaded = false;
    @track efcTotalFmt = '';
    @track efcTotalCls = 'ts-card-total';
    @track efcTotalKpiFmt = '';
    @track efcTotalKpiCls = 'ts-efc-kpi-imp';
    @track efcNumEfectosLabel = '';
    @track efcRemesableFmt = '';
    @track efcRemesableCls = 'ts-efc-kpi-imp';
    @track efcRemesablesSub = '';
    @track efcTramos = [];
    @track efcAntRows = [];
    @track efcAntTotalFmt = '';
    @track efcAntTotalCls = 'ts-card-total';

    // Subvistas de Efectos clientes: Situación por empresas | Situación por antigüedad | Listado
    @track efcVista = 'empresas';
    @track efcListGenerado = false;
    @track efcEmpresaOptions = [];
    @track efcEstadoOptions = [];
    @track efcFormaOptions = [];
    @track efcFEmpresa = '';
    @track efcFEstados = [];              // filtro de estado multiselección
    @track showEfcEstadoDropdown = false;
    @track efcFImporte = null;
    @track efcFCliente = '';
    @track efcFForma = '';
    @track efcFDesde = null;
    @track efcFHasta = null;
    @track efcFAgrupacion = '';
    @track efcFGrupo = '';
    @track efcAgrupacionOptions = [];
    @track efcList = [];
    @track efcListLoading = false;
    @track efcListError = null;
    _efcListAll = [];   // resultado completo; efcList muestra por páginas (Ver más)

    // Conciliación bancaria (pantalla que se abre al pinchar una línea de medios de pago)
    @track concActiva = false;
    @track concCuenta = null;        // { id, banco, empresa, iban, saldoNum, saldoFmt }
    @track concTab = 'conciliacion'; // 'conciliacion' | 'reglas'
    @track concLoading = false;
    @track concError = null;
    @track concFiltro = 'todos';     // todos | pendientes | conciliados
    // Filtros de la caja de movimientos del banco
    @track concFDesde = null;
    @track concFHasta = null;
    @track concFTexto = '';          // busca en concepto y más datos
    @track concFImporte = null;
    // Pop-up de nuevo movimiento manual
    @track concNuevoOpen = false;
    @track concNuevoFecha = null;
    @track concNuevoTipo = 'ingreso'; // ingreso | pago
    @track concNuevoImporte = null;
    @track concNuevoConcepto = '';
    @track concNuevoMasDatos = '';
    @track concNuevoSaving = false;
    @track concNuevoError = null;
    @track concNuevoFileName = '';   // documento adjunto (opcional)
    _concNuevoFileB64 = null;
    @track concMovSelId = null;      // movimiento del banco seleccionado
    @track concImporte = null;       // filtro de importe de efectos
    @track concTexto = '';           // filtro: nombre, NIF o nº factura
    @track concTipo = 'auto';        // tipo de efectos (de momento solo estructura)
    @track concPanelVista = 'buscar'; // subvista del panel derecho: 'buscar' | 'propuesta'
    @track concPropEfectos = [];      // efectos mostrados en la propuesta (selección o conciliación existente)
    @track concAsiento = [];          // líneas de la propuesta de asiento contable (editables)
    @track concPropLoading = false;
    @track concPropError = null;
    @track concPropExistente = false; // true si el movimiento ya estaba conciliado (solo consulta)
    @track concConciliando = false;   // guardando la conciliación
    @track concPropAvisoOpen = false; // pop-up de aviso al proponer sin efectos o con diferencia
    @track concPropAvisoMsg = '';
    // Subvista: todos los efectos de un cliente
    @track concClienteNombre = '';
    @track concClienteEfectos = [];
    @track concClienteLoading = false;
    @track concClienteError = null;
    @track concApuntes = [];          // apuntes contables reales del extracto (solo lectura)
    @track concConcRows = [];         // registros de Conciliación bancaria del extracto
    @track concAsientoId = null;      // asiento contable creado
    @track concAsientoNumero = '';
    _concLineaSeq = 0;
    @track concEfectos = [];
    @track concEfectosLoading = false;
    @track concEfectosError = null;
    @track concBuscado = false;
    @track concUltimaSync = '';
    @track _concMovsAll = [];        // movimientos mapeados (más reciente primero)
    @track concSel = [];             // efectos marcados: se acumulan aunque cambie la búsqueda

    // Gráfico de barras por empresa
    @track barrasPropias = [];
    @track barrasOtras = [];
    @track totalPropiasFmt = '';
    @track totalOtrasFmt = '';
    @track totalPropiasCls = 'ts-grp-total';
    @track totalOtrasCls = 'ts-grp-total';
    @track hayOtras = false;
    @track legend = [];

    // Gráfico de evolución (línea)
    @track linePoints = '';
    @track areaPath = '';
    @track lastX = 0;
    @track lastY = 0;
    @track hayLinea = false;
    @track ejeMax = '';
    @track ejeMed = '';
    @track ejeMin = '';
    @track xLabels = [];
    @track totalSerieFmt = '';
    @track serieTotalCls = 'ts-card-total';
    @track marcadores = [];   // cierre de cada año (31/12) con su acumulado
    @track lineasRef = [];    // líneas de referencia (500.000 € y 1.000.000 €)
    @track anioAtras = null;  // punto de hace un año y su línea horizontal

    connectedCallback() { this.cargar(); }

    // --------------------------------------------------------------- pestañas
    get esMedios()         { return this.tab === 'medios'; }
    get esClientes()       { return this.tab === 'clientes'; }
    get esProveedores()    { return this.tab === 'proveedores'; }
    get esFlujo()          { return this.tab === 'flujo'; }
    get esExtraordinario() { return this.tab === 'extraordinario'; }
    get esIntermediacion() { return this.tab === 'intermediacion'; }
    get esBancos()         { return this.tab === 'bancos'; }
    get esRemClientes()    { return this.tab === 'remclientes'; }
    get esRemProveedores() { return this.tab === 'remproveedores'; }
    get tabMediosCls() { return this.tabCls('medios'); }
    get tabCliCls()    { return this.tabCls('clientes'); }
    get tabProvCls()   { return this.tabCls('proveedores'); }
    get tabFlujoCls()  { return this.tabCls('flujo'); }
    get tabExtraCls()  { return this.tabCls('extraordinario'); }
    get tabInterCls()  { return this.tabCls('intermediacion'); }
    get tabBancosCls() { return this.tabCls('bancos'); }
    get tabRemCliCls()  { return this.tabCls('remclientes'); }
    get tabRemProvCls() { return this.tabCls('remproveedores'); }

    // Subpestañas de Remesas clientes: Gestor de procesos | Remesas cobros
    @track remVista = 'procesos';
    get esRemProcesos() { return this.remVista === 'procesos'; }
    get esRemCobros()   { return this.remVista === 'cobros'; }
    get remProcesosCls() { return this.remVista === 'procesos' ? 'lm-subtab lm-subtab-active' : 'lm-subtab'; }
    get remCobrosCls()   { return this.remVista === 'cobros' ? 'lm-subtab lm-subtab-active' : 'lm-subtab'; }
    setRemVista(e) { this.remVista = e.currentTarget.dataset.value; }

    // Subpestañas de Extraordinario: Hoja de Caja | Ingresos y gastos
    @track extraVista = 'caja';
    get esExtraCaja()     { return this.extraVista === 'caja'; }
    get esExtraIngastos() { return this.extraVista === 'ingastos'; }
    get extraCajaCls()     { return this.extraVista === 'caja' ? 'lm-subtab lm-subtab-active' : 'lm-subtab'; }
    get extraIngastosCls() { return this.extraVista === 'ingastos' ? 'lm-subtab lm-subtab-active' : 'lm-subtab'; }
    setExtraVista(e) {
        this.extraVista = e.currentTarget.dataset.value;
        if (this.extraVista === 'caja') this.cargarHojaCaja();
    }

    // --- Hoja de caja extraordinaria ---
    @track hcRows = [];
    @track hcLoading = false;
    @track hcError = null;
    _hcLoaded = false;

    cargarHojaCaja(forzar) {
        if (this._hcLoaded && !forzar) return;
        this.hcLoading = true;
        this.hcError = null;
        return getHojaCajaExtra()
            .then(res => {
                // Llegan en orden cronológico: se acumula el saldo y se muestra el más reciente primero
                let acc = 0;
                const rows = (res || []).map((m, i) => {
                    const debe = Number(m.debe) || 0;
                    const haber = Number(m.haber) || 0;
                    const imp = haber - debe;   // haber positivo (azul), debe negativo (rojo)
                    acc += imp;
                    return {
                        key: 'hc' + i,
                        id: m.id,
                        numero: m.numero || '',
                        fechaFmt: this.fmtFecha(m.fecha),
                        descripcion: m.descripcion || '',
                        importeFmt: (imp > 0 ? '+' : '') + this.fmtCurrency(imp),
                        importeCls: this.signoCls('ts-efc-num ts-conc-imp', imp),
                        saldoFmt: this.fmtCurrency(acc)
                    };
                });
                rows.reverse();
                this.hcRows = rows;
                this._hcLoaded = true;
            })
            .catch(err => { this.hcError = this.reduceError(err); })
            .finally(() => { this.hcLoading = false; });
    }
    get hasHcError() { return !!this.hcError; }
    get showHcContent() { return !this.hcLoading && !this.hcError; }
    get hayHcRows() { return this.hcRows.length > 0; }
    get hcCountLabel() {
        const n = this.hcRows.length;
        return `${this.fmtNumber(n, 0)} ${n === 1 ? 'movimiento' : 'movimientos'}`;
    }
    handleHcRefresh() { this.cargarHojaCaja(true); }

    // Pop-up de nuevo movimiento de la hoja de caja
    @track hcNuevoOpen = false;
    @track hcNuevoTipo = null;      // ingreso | gasto
    @track hcNuevoFecha = null;
    @track hcNuevoImporte = null;
    @track hcNuevoDescripcion = '';
    @track hcNuevoSaving = false;
    @track hcNuevoError = null;

    handleHcNuevoOpen() {
        this.hcNuevoTipo = null;    // primero hay que elegir ingreso o gasto
        this.hcNuevoFecha = null;
        this.hcNuevoImporte = null;
        this.hcNuevoDescripcion = '';
        this.hcNuevoError = null;
        this.hcNuevoSaving = false;
        this.hcNuevoOpen = true;
    }
    handleHcNuevoClose() {
        if (this.hcNuevoSaving) return;
        this.hcNuevoOpen = false;
    }
    setHcNuevoTipo(e) { this.hcNuevoTipo = e.currentTarget.dataset.value; }
    get hcNuevoTipoElegido() { return !!this.hcNuevoTipo; }
    get hcNuevoIngresoCls() {
        return 'ts-modal-tipo-btn' + (this.hcNuevoTipo === 'ingreso' ? ' ts-modal-tipo-ingreso' : '');
    }
    get hcNuevoGastoCls() {
        return 'ts-modal-tipo-btn' + (this.hcNuevoTipo === 'gasto' ? ' ts-modal-tipo-pago' : '');
    }
    get hcNuevoGuardarDisabled() { return this.hcNuevoSaving || !this.hcNuevoTipoElegido; }
    get hasHcNuevoError() { return !!this.hcNuevoError; }
    hHcNuevoFecha(e)       { this.hcNuevoFecha = e.detail.value || null; }
    hHcNuevoImporte(e)     { this.hcNuevoImporte = e.detail.value; }
    hHcNuevoDescripcion(e) { this.hcNuevoDescripcion = e.detail.value || ''; }

    handleHcNuevoGuardar() {
        const imp = Number(this.hcNuevoImporte);
        if (!this.hcNuevoTipo) { this.hcNuevoError = 'Selecciona si es un ingreso o un gasto.'; return; }
        if (!this.hcNuevoFecha) { this.hcNuevoError = 'Indica la fecha del movimiento.'; return; }
        if (!(this.hcNuevoDescripcion || '').trim()) { this.hcNuevoError = 'Indica la descripción.'; return; }
        if (!imp || imp <= 0) { this.hcNuevoError = 'El importe debe ser un número positivo.'; return; }
        this.hcNuevoError = null;
        this.hcNuevoSaving = true;
        crearMovimientoHojaCaja({
            fecha: this.hcNuevoFecha,
            descripcion: this.hcNuevoDescripcion.trim(),
            importe: imp,
            tipo: this.hcNuevoTipo
        })
            .then(() => {
                this.hcNuevoOpen = false;
                return this.cargarHojaCaja(true);
            })
            .catch(err => { this.hcNuevoError = this.reduceError(err); })
            .finally(() => { this.hcNuevoSaving = false; });
    }
    tabCls(v) { return this.tab === v ? 'lm-subtab lm-subtab-active' : 'lm-subtab'; }
    setTab(e) {
        this.tab = e.currentTarget.dataset.value;
        if (this.tab === 'clientes') this.cargarEfectosClientes();
        if (this.tab === 'extraordinario' && this.extraVista === 'caja') this.cargarHojaCaja();
    }

    get hasError() { return !!this.error; }
    get showMediosContent() { return this.esMedios && !this.loading && !this.hasError; }
    get cuentasCount()  { return `${this.cuentasView.length} cuentas`; }
    get tarjetasCount() { return `${this.tarjetasView.length} tarjetas`; }
    get cajasCount()    { return `${this.cajasView.length} cajas`; }

    // Refrescos independientes por apartado
    handleRefreshMedios() { this.cargar(); }
    handleEfcRefresh() {
        this.efcLoaded = false;
        this.efcRows = [];
        this.cargarEfectosClientes();
    }

    get hasEfcError() { return !!this.efcError; }
    get showEfcContent() { return this.esClientes && !this.efcLoading && !this.efcError && this.efcLoaded; }
    get efcEstadosHead() { return ESTADOS_EFC; }

    // --- subvistas de Efectos clientes ---
    get esEfcEmpresas()   { return this.efcVista === 'empresas'; }
    get esEfcAntiguedad() { return this.efcVista === 'antiguedad'; }
    get esEfcListado()    { return this.efcVista === 'listado'; }
    efcTabCls(v) { return this.efcVista === v ? 'lm-subtab lm-subtab-active' : 'lm-subtab'; }
    get efcEmpresasCls()   { return this.efcTabCls('empresas'); }
    get efcAntiguedadCls() { return this.efcTabCls('antiguedad'); }
    get efcListadoCls()    { return this.efcTabCls('listado'); }
    setEfcVista(e) {
        this.efcVista = e.currentTarget.dataset.value;
        if (this.efcVista === 'listado') this.cargarEfcOpciones();
    }

    cargarEfcOpciones() {
        if (this._efcOpcionesCargadas) return;
        this._efcOpcionesCargadas = true;
        getEfcFiltroOpciones()
            .then(o => {
                this.efcEmpresaOptions = [{ label: 'Todas', value: '' },
                    ...((o && o.empresas) || []).map(v => ({ label: v, value: v }))];
                this.efcEstadoOptions = ((o && o.estados) || []).map(v => ({ label: v, value: v }));
                this.efcFormaOptions = [{ label: 'Todas', value: '' },
                    ...((o && o.formasPago) || []).map(v => ({ label: v, value: v }))];
                this.efcAgrupacionOptions = [{ label: 'Todas', value: '' },
                    ...((o && o.agrupaciones) || []).map(v => ({ label: v, value: v }))];
            })
            .catch(() => { this._efcOpcionesCargadas = false; });
    }

    limpiarFiltrosNav() {
        this._efcEstadosNav = null;
        this._efcVencIniNav = null;
        this._efcSignoNav = null;
        this._efcVencNulosNav = false;
        this.efcColNavLabel = '';
    }
    @track efcColNavLabel = '';   // chip con la columna desde la que se navegó
    hEfcFEmpresa(e) { this.efcFEmpresa = e.detail.value; this.limpiarFiltrosNav(); }

    // --- filtro de estado multiselección ---
    get efcEstadoOptionsView() {
        return (this.efcEstadoOptions || []).map(o => ({
            ...o,
            optionClass: this.efcFEstados.includes(o.value)
                ? 'ts-ms-option ts-ms-option-selected'
                : 'ts-ms-option'
        }));
    }
    get efcEstadoTriggerLabel() {
        if (!this.efcFEstados.length) return 'Todos';
        if (this.efcFEstados.length === 1) return this.efcFEstados[0];
        return `${this.efcFEstados.length} estados`;
    }
    get efcEstadoDropdownClass() {
        return this.showEfcEstadoDropdown ? 'ts-ms-wrap ts-ms-wrap-open' : 'ts-ms-wrap';
    }
    toggleEfcEstadoDropdown(e) {
        e.stopPropagation();
        this.showEfcEstadoDropdown = !this.showEfcEstadoDropdown;
    }
    closeEfcEstadoDropdown() { this.showEfcEstadoDropdown = false; }
    handleEfcEstadoToggle(e) {
        const val = e.currentTarget.dataset.value;
        if (!val) return;
        const set = new Set(this.efcFEstados);
        if (set.has(val)) set.delete(val); else set.add(val);
        this.efcFEstados = Array.from(set);
        this.limpiarFiltrosNav();
    }
    handleEfcEstadoTodos()   { this.efcFEstados = (this.efcEstadoOptions || []).map(o => o.value); this.limpiarFiltrosNav(); }
    handleEfcEstadoNinguno() { this.efcFEstados = []; this.limpiarFiltrosNav(); }
    hEfcFImporte(e) { this.efcFImporte = e.detail.value || null; this.limpiarFiltrosNav(); }
    hEfcFCliente(e) { this.efcFCliente = e.detail.value || ''; this.limpiarFiltrosNav(); }
    hEfcFForma(e)   { this.efcFForma = e.detail.value; this.limpiarFiltrosNav(); }
    hEfcFDesde(e)   { this.efcFDesde = e.detail.value || null; this.limpiarFiltrosNav(); }
    hEfcFHasta(e)   { this.efcFHasta = e.detail.value || null; this.limpiarFiltrosNav(); }
    hEfcFAgrupacion(e) { this.efcFAgrupacion = e.detail.value; this.limpiarFiltrosNav(); }
    hEfcFGrupo(e)      { this.efcFGrupo = e.detail.value || ''; this.limpiarFiltrosNav(); }

    handleEfcListGenerar() {
        this.efcListLoading = true;
        this.efcListError = null;
        buscarEfectosClientes({
            empresaTitular: this.efcFEmpresa || null,
            estado: null,
            importe: this.efcFImporte || null,
            cliente: this.efcFCliente || null,
            formaPago: this.efcFForma || null,
            vencDesde: this.efcFDesde,
            vencHasta: this.efcFHasta,
            estados: this.efcFEstados.length ? this.efcFEstados : (this._efcEstadosNav || null),
            vencIniDesde: (this._efcVencIniNav && this._efcVencIniNav.desde) || null,
            vencIniHasta: (this._efcVencIniNav && this._efcVencIniNav.hasta) || null,
            agrupacion: this.efcFAgrupacion || null,
            grupoEmpresarial: this.efcFGrupo || null,
            signo: this._efcSignoNav || null,
            vencSinFecha: this._efcVencNulosNav || false
        })
        .then(res => {
            this._efcListAll = (res || []).map((r, i) => ({
                key: 'efl' + i,
                id: r.id,
                numero: r.numero || '',
                fechaVenc: this.fmtFecha(r.fechaVencimiento),
                clienteId: r.clienteId,
                clienteNombre: r.clienteNombre || '',
                hayCliente: !!r.clienteId,
                grupoId: r.grupoId,
                grupoNombre: r.grupoNombre || '',
                hayGrupo: !!r.grupoId,
                empresa: r.empresaTitular || '',
                importeNum: Number(r.importe) || 0,
                fechaVencRaw: r.fechaVencimiento || '',
                importeFmt: this.fmtCurrency(r.importe),
                importeCls: this.signoCls('ts-efl-num', Number(r.importe) || 0),
                estado: r.estado || '',
                estadoCls: this.estadoChipCls(r.estado),
                formaPago: r.formaPago || '',
                agrupacion: r.agrupacion || '',
                facturaId: r.facturaId,
                facturaNumero: r.facturaNumero || '',
                hayFactura: !!r.facturaId,
                mandatoId: r.mandatoId,
                mandatoNumero: r.mandatoNumero || '',
                hayMandato: !!r.mandatoId,
                iban: r.iban || '',
                planId: r.planId,
                planNumero: r.planNumero || '',
                hayPlan: !!r.planId
            }));
            this.efcList = this._efcListAll.slice(0, EFL_PAGE);
            this.efcListGenerado = true;
        })
        .catch(err => { this.efcListError = this.reduceError(err); this._efcListAll = []; this.efcList = []; this.efcListGenerado = true; })
        .finally(() => { this.efcListLoading = false; });
    }

    // "Ver más": añade otra página de resultados al listado
    handleEfcVerMas() {
        this.efcList = this._efcListAll.slice(0, this.efcList.length + EFL_PAGE);
    }
    get showEfcVerMas() { return this.showEfcListTabla && this.efcList.length < this._efcListAll.length; }
    get efcVerMasLabel() {
        return `Ver más (quedan ${this.fmtNumber(this._efcListAll.length - this.efcList.length, 0)})`;
    }

    // Exporta el listado completo generado (no solo lo mostrado) a un CSV que abre Excel.
    // Con Lightning Web Security activo no valen ni las URL data: ni un <a> creado con
    // document.createElement: el Blob va como text/plain (LWS no admite text/csv) y el clic
    // se da sobre el enlace oculto de la plantilla en renderedCallback, con el href ya pintado
    handleEfcExportar() {
        if (!this._efcListAll.length) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Nada que exportar', message: 'Genera primero el listado con los filtros.', variant: 'info'
            }));
            return;
        }
        const sep = ';';
        const esc = v => {
            const s = (v === null || v === undefined) ? '' : String(v);
            return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const cab = ['Nº efecto', 'Fecha de vencimiento', 'Importe efecto', 'Factura emitida', 'Cliente',
                     'Plan general contable', 'Grupo empresarial', 'Empresa titular', 'Estado', 'Forma de pago',
                     'Agrupación', 'Mandato SEPA', 'IBAN'];
        const filas = this._efcListAll.map(r => [
            r.numero, r.fechaVenc, String(r.importeNum).replace('.', ','), r.facturaNumero, r.clienteNombre,
            r.planNumero, r.grupoNombre, r.empresa, r.estado, r.formaPago, r.agrupacion, r.mandatoNumero, r.iban
        ].map(esc).join(sep));
        try {
            // BOM para que Excel reconozca UTF-8 (acentos y ª)
            const blob = new Blob(['﻿' + cab.map(esc).join(sep) + '\r\n' + filas.join('\r\n')], { type: 'text/plain' });
            if (this.efcExportUrl) URL.revokeObjectURL(this.efcExportUrl);
            this.efcExportUrl = URL.createObjectURL(blob);
            this.efcExportPendiente = true;
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'No se pudo generar el archivo', message: String((e && e.message) || e), variant: 'error'
            }));
        }
    }
    @track efcExportUrl = null;
    efcExportPendiente = false;
    get efcExportNombre() { return 'Listado_efectos_' + this.isoDate(new Date()) + '.csv'; }
    renderedCallback() {
        if (!this.efcExportPendiente) return;
        this.efcExportPendiente = false;
        const a = this.template.querySelector('a.ts-efl-export-link');
        try {
            if (!a) throw new Error('No se encontró el enlace de descarga en la pantalla');
            a.click();
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'No se pudo descargar el archivo', message: String((e && e.message) || e), variant: 'error'
            }));
        }
    }

    // Color del chip según el estado del efecto
    estadoChipCls(estado) {
        const ok  = ['Conciliado', 'Pagado', 'Compensado', 'Transferido', 'Abono', 'En remesa', 'Tarjeta'];
        const mal = ['Devuelto', 'Error o bloqueo', 'Reclamación 1ª', 'Reclamación 2ª', 'Monitorio', 'Incobrable'];
        if (ok.includes(estado)) return 'ts-chip ts-chip-ok';
        if (mal.includes(estado)) return 'ts-chip ts-chip-bad';
        if (estado === 'Pendiente' || estado === 'Dividido') return 'ts-chip ts-chip-warn';
        return 'ts-chip ts-chip-neutro';
    }

    get hasEfcListError() { return !!this.efcListError; }
    get showEfcListInicial() { return this.esEfcListado && !this.efcListGenerado && !this.efcListLoading; }
    get showEfcListTabla() { return this.efcListGenerado && !this.efcListLoading && this.efcList.length > 0; }
    get showEfcListVacio() { return this.efcListGenerado && !this.efcListLoading && this.efcList.length === 0 && !this.efcListError; }
    get efcListCount() {
        const total = this._efcListAll.length;
        if (this.efcList.length < total) {
            return `Mostrando ${this.fmtNumber(this.efcList.length, 0)} de ${this.fmtNumber(total, 0)} efectos`;
        }
        return `${this.fmtNumber(total, 0)} efectos`;
    }
    // Total de los importes efecto de todo lo generado (no solo lo mostrado)
    get efcListTotalNum() { return this._efcListAll.reduce((t, r) => t + (r.importeNum || 0), 0); }
    get efcListTotalFmt() { return this.fmtCurrency(this.efcListTotalNum); }
    get efcListTotalCls() { return this.signoCls('ts-efl-total', this.efcListTotalNum); }
    get hayEfcColNav() { return !!this.efcColNavLabel; }

    // Cada columna filtra por banco, IBAN o empresa titular con su propia caja
    handleFiltro(e) {
        const col = e.target.dataset.col;
        const v = e.target.value || '';
        if (col === 'cuentas') this.filtroCuentas = v;
        else if (col === 'tarjetas') this.filtroTarjetas = v;
        else if (col === 'cajas') this.filtroCajas = v;
    }
    filtrar(arr, filtro) {
        const t = (filtro || '').toLowerCase().trim();
        if (!t) return arr;
        return (arr || []).filter(c =>
            (c.banco || '').toLowerCase().includes(t) ||
            (c.iban || '').toLowerCase().includes(t) ||
            (c.empresa || '').toLowerCase().includes(t));
    }
    get cuentasView()  { return this.filtrar(this.filtrarEmpresa(this.cuentasBancarias), this.filtroCuentas); }
    get tarjetasView() { return this.filtrar(this.filtrarEmpresa(this.tarjetas), this.filtroTarjetas); }
    get cajasView()    { return this.filtrar(this.filtrarEmpresa(this.hojasCaja), this.filtroCajas); }

    // --------------------------------------------------------------- carga
    cargar() {
        this.loading = true;
        this.error = null;
        this.empresaSel = null;
        this.grupoSel = null;
        this._serieCache = {};
        getMediosPago()
            .then(res => {
                this._cuentasRaw = (res && res.cuentas) || [];
                this._serieGlobal = (res && res.serie) || [];
                this.buildListas(this._cuentasRaw);
                this.buildBarras(this._cuentasRaw);
                this.buildLinea(this._serieGlobal);
            })
            .catch(err => { this.error = this.reduceError(err); })
            .finally(() => { this.loading = false; });
    }

    // ------------------------------------------------- EFECTOS CLIENTES
    cargarEfectosClientes() {
        if (this.efcLoaded || this.efcLoading) return;
        this.efcLoading = true;
        this.efcError = null;
        Promise.all([getEfectosClientesResumen(), getEfectosClientesKpis(), getEfectosAntiguedadResumen()])
            .then(([resumen, kpis, antiguedad]) => {
                this.buildEfc(resumen || []);
                this.buildEfcKpis(kpis || {});
                this.buildEfcAnt(antiguedad || []);
                this.efcLoaded = true;
            })
            .catch(err => { this.efcError = this.reduceError(err); })
            .finally(() => { this.efcLoading = false; });
    }

    buildEfcKpis(k) {
        const remesable = Number(k.totalRemesable) || 0;
        this.efcRemesableFmt = this.fmtCurrency(remesable);
        this.efcRemesableCls = this.signoCls('ts-efc-kpi-imp', remesable);
        const nRem = Number(k.numRemesables) || 0;
        this.efcRemesablesSub = `${this.fmtNumber(nRem, 0)} ${nRem === 1 ? 'domiciliado pendiente' : 'domiciliados pendientes'}`;
        const labels = TRAMO_LABELS;
        const tramos = k.tramos || [];
        let maxImp = 0;
        tramos.forEach(t => { maxImp = Math.max(maxImp, Math.abs(Number(t.importe) || 0)); });
        const rangos = this.efcRangosTramos();
        this.efcTramos = tramos.map(t => {
            const imp = Number(t.importe) || 0;
            const mostrado = imp;
            const n = Number(t.numero) || 0;
            const hay = imp !== 0 || n !== 0;
            let w = maxImp > 0 ? (Math.abs(imp) / maxImp) * 100 : 0;
            if (imp !== 0 && w < 4) w = 4;
            const rango = rangos[t.clave] || { desde: '', hasta: '' };
            return {
                key: t.clave,
                label: labels[t.clave] || t.clave,
                importeFmt: hay ? this.fmtCurrency(mostrado) : '—',
                importeCls: hay ? this.signoCls('ts-efc-tramo-imp', mostrado) : 'ts-efc-tramo-imp',
                numLabel: `${this.fmtNumber(n, 0)} ${n === 1 ? 'efecto' : 'efectos'}`,
                barStyle: `width:${w.toFixed(1)}%`,
                desde: rango.desde,
                hasta: rango.hasta,
                cls: hay ? 'ts-efc-tramo' : 'ts-efc-tramo ts-efc-tramo-vacio'
            };
        });
    }

    efcNuevoAgg() { return { total: 0, enPlazo: 0, vencido: 0, abonar: 0, monitorio: 0, num: 0, estados: {} }; }
    efcAcumula(a, c) {
        const imp = Number(c.importe) || 0;
        a.total += imp;
        // Reparto de la situación de cobro: los negativos van a Abonar, el estado
        // Monitorio a su columna, y el resto a En plazo o Vencido según la fecha
        if (c.negativo) a.abonar += imp;
        else if (c.estado === 'Monitorio') a.monitorio += imp;
        else if (c.enPlazo) a.enPlazo += imp;
        else a.vencido += imp;
        a.num += Number(c.numero) || 0;
        a.estados[c.estado] = (a.estados[c.estado] || 0) + imp;
    }
    efcSuma(dest, src) {
        dest.total += src.total; dest.enPlazo += src.enPlazo;
        dest.vencido += src.vencido; dest.abonar += src.abonar;
        dest.monitorio += src.monitorio; dest.num += src.num;
        Object.keys(src.estados).forEach(k => { dest.estados[k] = (dest.estados[k] || 0) + src.estados[k]; });
    }

    buildEfc(cells) {
        const empresas = new Map();
        const formasSet = new Set();
        cells.forEach(c => {
            const emp = c.empresa || '— sin empresa —';
            const forma = c.formaPago || 'Sin forma de pago';
            formasSet.add(forma);
            if (!empresas.has(emp)) {
                empresas.set(emp, { nombre: emp, propia: !!c.propia, agg: this.efcNuevoAgg(), formas: new Map() });
            }
            const e = empresas.get(emp);
            if (!e.formas.has(forma)) e.formas.set(forma, this.efcNuevoAgg());
            this.efcAcumula(e.agg, c);
            this.efcAcumula(e.formas.get(forma), c);
        });

        const formas = Array.from(formasSet).sort((a, b) => a.localeCompare(b));
        const rows = [];
        const totalGrupo = this.efcNuevoAgg();
        [
            { key: 'propias', label: 'Empresas propias', filtro: e => e.propia },
            { key: 'otras',   label: 'Otras empresas',   filtro: e => !e.propia }
        ].forEach(g => {
            const emps = Array.from(empresas.values()).filter(g.filtro)
                .sort((a, b) => a.nombre.localeCompare(b.nombre));
            if (!emps.length) return;
            const aggG = this.efcNuevoAgg();
            emps.forEach(e => this.efcSuma(aggG, e.agg));
            this.efcSuma(totalGrupo, aggG);
            rows.push(this.efcRow('g' + g.key, g.label, '', aggG, 'ts-efc-grupo', null));
            emps.forEach(e => {
                rows.push(this.efcRow('e' + e.nombre, e.nombre, `${this.fmtNumber(e.agg.num, 0)} efectos`, e.agg, 'ts-efc-emp',
                    { empresa: e.nombre, forma: '', clickable: true }));
                formas.forEach(f => {
                    const a = e.formas.get(f) || this.efcNuevoAgg();
                    rows.push(this.efcRow('f' + e.nombre + f, `· ${f}`, `${this.fmtNumber(a.num, 0)} efectos`, a, 'ts-efc-forma',
                        { empresa: e.nombre, forma: f === 'Sin forma de pago' ? '' : f, clickable: true }));
                });
            });
        });
        rows.push(this.efcRow('total', 'Total grupo', '', totalGrupo, 'ts-efc-totalrow', null));
        this.efcRows = rows;
        // Signo real del registro: azul positivo, rojo negativo
        this.efcTotalFmt = this.fmtCurrency(totalGrupo.total);
        this.efcTotalCls = this.signoCls('ts-card-total', totalGrupo.total);
        this.efcTotalKpiFmt = this.fmtCurrency(totalGrupo.total);
        this.efcTotalKpiCls = this.signoCls('ts-efc-kpi-imp', totalGrupo.total);
        this.efcNumEfectosLabel = `${this.fmtNumber(totalGrupo.num, 0)} ${totalGrupo.num === 1 ? 'efecto' : 'efectos'} en cartera`;
    }

    efcRow(key, nombre, extra, agg, cls, ctx) {
        const clickable = !!(ctx && ctx.clickable);
        const clickCls = clickable ? ' ts-efc-clickcell' : '';
        // El total de cada empresa titular va en píldora azul/roja
        const pillTotal = cls === 'ts-efc-emp';
        const cells = [
            this.efcCell('t', agg.total, ' ts-efc-col-total' + clickCls, pillTotal),
            this.efcCell('p', agg.enPlazo, ' ts-efc-col-plazo' + clickCls),
            this.efcCell('v', agg.vencido, ' ts-efc-col-venc' + clickCls),
            this.efcCell('ab', agg.abonar, ' ts-efc-col-abonar' + clickCls),
            this.efcCell('mo', agg.monitorio, ' ts-efc-col-monit ts-efc-gapr' + clickCls)
        ];
        ESTADOS_EFC.forEach(s => cells.push(this.efcCell(s.key, agg.estados[s.key] || 0, clickCls)));
        // El nombre de la forma de pago tambien navega al listado prefiltrado
        const nameClick = clickable && cls === 'ts-efc-forma';
        return {
            key, nombre, extra,
            cls: 'ts-efc-row ' + cls,
            nombreCls: 'ts-efc-nombre' + (nameClick ? ' ts-efc-clickcell' : ''),
            nameClickAttr: nameClick ? '1' : '0',
            empresa: (ctx && ctx.empresa) || '',
            forma: (ctx && ctx.forma) || '',
            clickAttr: clickable ? '1' : '0',
            cells
        };
    }
    efcCell(col, v, extraCls, pill) {
        // Signo real del registro: azul si es positivo, rojo si es negativo
        const mostrado = Number(v) || 0;
        if (!mostrado) return { key: col, col, txt: '—', cls: 'ts-efc-num ts-efc-vacio' + extraCls, esPill: false };
        return {
            key: col, col,
            txt: this.fmtCurrency(mostrado),
            cls: this.signoCls('ts-efc-num' + extraCls, mostrado),
            esPill: !!pill,
            pillCls: 'ts-efc-pill ' + (mostrado < 0 ? 'ts-efc-pill-neg' : 'ts-efc-pill-pos')
        };
    }

    // Clic en una cantidad de la visión general: abre el listado ya prefiltrado
    handleEfcCellClick(e) {
        if (e.currentTarget.dataset.clickable !== '1') return;
        const col = e.currentTarget.dataset.col;
        this.efcFEmpresa = e.currentTarget.dataset.empresa || '';
        this.efcFForma = e.currentTarget.dataset.forma || '';
        this.efcFEstados = [];
        this.efcFImporte = null;
        this.efcFCliente = '';
        this.efcFDesde = null;
        this.efcFHasta = null;
        this.efcFAgrupacion = '';
        this.efcFGrupo = '';
        this._efcEstadosNav = null;
        this._efcVencIniNav = null;
        this._efcSignoNav = null;
        this._efcVencNulosNav = false;
        this.efcColNavLabel = '';
        const hoy = new Date();
        const sinMonitorio = ESTADOS_EFC.map(s => s.key).filter(k => k !== 'Monitorio');
        if (col === 'p') {
            // En plazo: positivos, sin Monitorio, vencimiento hoy o posterior (o sin fecha)
            this.efcFDesde = this.isoDate(hoy);
            this._efcEstadosNav = sinMonitorio;
            this._efcSignoNav = 'positivo';
            this._efcVencNulosNav = true;
            this.efcColNavLabel = 'Columna: En plazo';
        } else if (col === 'v') {
            // Vencido: positivos, sin Monitorio, vencimiento anterior a hoy
            const ayer = new Date(hoy);
            ayer.setDate(ayer.getDate() - 1);
            this.efcFHasta = this.isoDate(ayer);
            this._efcEstadosNav = sinMonitorio;
            this._efcSignoNav = 'positivo';
            this.efcColNavLabel = 'Columna: Vencido';
        } else if (col === 'ab') {
            // Abonar: importes negativos de cualquier estado del resumen
            this._efcEstadosNav = ESTADOS_EFC.map(s => s.key);
            this._efcSignoNav = 'negativo';
            this.efcColNavLabel = 'Columna: Abonar';
        } else if (col === 'mo') {
            // Monitorio: positivos en estado Monitorio
            this.efcFEstados = ['Monitorio'];
            this._efcSignoNav = 'positivo';
            this.efcColNavLabel = 'Columna: Monitorio';
        } else if (col === 't') {
            this._efcEstadosNav = ESTADOS_EFC.map(s => s.key);
        } else {
            this.efcFEstados = [col];
        }
        this.efcVista = 'listado';
        this.cargarEfcOpciones();
        this.handleEfcListGenerar();
    }
    isoDate(d) {
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    // Rango de fechas (vencimiento inicial) de cada tramo de antigüedad
    efcRangosTramos() {
        const hoy = new Date();
        const haceDias = (n) => { const x = new Date(hoy); x.setDate(x.getDate() - n); return this.isoDate(x); };
        return {
            'EN_PLAZO': { desde: this.isoDate(hoy), hasta: '' },
            '0-30':   { desde: haceDias(30),  hasta: haceDias(1) },
            '31-60':  { desde: haceDias(60),  hasta: haceDias(31) },
            '61-90':  { desde: haceDias(90),  hasta: haceDias(61) },
            '91-120': { desde: haceDias(120), hasta: haceDias(91) },
            '+120':   { desde: '',            hasta: haceDias(121) }
        };
    }

    // ------------------------------------------------- SITUACIÓN POR ANTIGÜEDAD
    buildEfcAnt(cells) {
        const rangos = this.efcRangosTramos();
        const porTramo = new Map();
        TRAMOS_EFC.forEach(c => porTramo.set(c, { total: 0, num: 0, estados: {} }));
        (cells || []).forEach(c => {
            const t = porTramo.get(c.clave);
            if (!t) return;
            const imp = Number(c.importe) || 0;
            t.total += imp;
            t.num += Number(c.numero) || 0;
            t.estados[c.estado] = (t.estados[c.estado] || 0) + imp;
        });
        const totalAgg = { total: 0, num: 0, estados: {} };
        const rows = TRAMOS_EFC.map(clave => {
            const a = porTramo.get(clave);
            totalAgg.total += a.total;
            totalAgg.num += a.num;
            Object.keys(a.estados).forEach(k => { totalAgg.estados[k] = (totalAgg.estados[k] || 0) + a.estados[k]; });
            const hay = a.num !== 0 || a.total !== 0;
            return this.efcAntRow('t' + clave, TRAMO_LABELS[clave], a,
                hay ? 'ts-efc-emp' : 'ts-efc-emp ts-efc-ant-vacia', hay, rangos[clave]);
        });
        rows.push(this.efcAntRow('total', 'Total', totalAgg, 'ts-efc-totalrow', false, null));
        this.efcAntRows = rows;
        this.efcAntTotalFmt = this.fmtCurrency(totalAgg.total);
        this.efcAntTotalCls = this.signoCls('ts-card-total', totalAgg.total);
    }

    efcAntRow(key, nombre, agg, cls, clickable, rango) {
        const clickCls = clickable ? ' ts-efc-clickcell' : '';
        const cells = [
            this.efcCell('t', agg.total, ' ts-efc-col-total' + clickCls),
            { key: 'n', col: 'n', txt: `${this.fmtNumber(agg.num, 0)} efectos`,
              cls: 'ts-efc-num ts-efc-count-cell ts-efc-col-total ts-efc-gapr' + clickCls }
        ];
        ESTADOS_EFC.forEach(s => cells.push(this.efcCell(s.key, agg.estados[s.key] || 0, clickCls)));
        return {
            key, nombre,
            cls: 'ts-efc-row ' + cls,
            desde: (rango && rango.desde) || '',
            hasta: (rango && rango.hasta) || '',
            clickAttr: clickable ? '1' : '0',
            cells
        };
    }

    // Clic en el cuadro de antigüedad: abre el listado con el tramo (y estado) aplicados
    handleEfcAntClick(e) {
        if (e.currentTarget.dataset.clickable !== '1') return;
        const col = e.currentTarget.dataset.col;
        const desde = e.currentTarget.dataset.desde || null;
        const hasta = e.currentTarget.dataset.hasta || null;
        this.efcFEmpresa = '';
        this.efcFEstados = [];
        this.efcFImporte = null;
        this.efcFCliente = '';
        this.efcFForma = '';
        this.efcFDesde = null;
        this.efcFHasta = null;
        this.efcFAgrupacion = '';
        this.efcFGrupo = '';
        this._efcEstadosNav = null;
        this._efcVencIniNav = { desde, hasta };
        if (col && col !== 't' && col !== 'n') this.efcFEstados = [col];
        else this._efcEstadosNav = ESTADOS_EFC.map(s => s.key);
        this.efcVista = 'listado';
        this.cargarEfcOpciones();
        this.handleEfcListGenerar();
    }

    // Clic en un tramo de antigüedad: abre el listado con ese rango de vencimiento inicial
    handleEfcTramoClick(e) {
        const desde = e.currentTarget.dataset.desde || null;
        const hasta = e.currentTarget.dataset.hasta || null;
        if (!desde && !hasta) return;
        this.efcFEmpresa = '';
        this.efcFEstados = [];
        this.efcFImporte = null;
        this.efcFCliente = '';
        this.efcFForma = '';
        this.efcFDesde = null;
        this.efcFHasta = null;
        this.efcFAgrupacion = '';
        this.efcFGrupo = '';
        this._efcEstadosNav = ESTADOS_EFC.map(s => s.key);
        this._efcVencIniNav = { desde, hasta };
        this.efcVista = 'listado';
        this.cargarEfcOpciones();
        this.handleEfcListGenerar();
    }

    // Clic en el nombre de la empresa: filtra evolución y columnas (clic de nuevo = quitar)
    handleEmpresaClick(e) {
        const nombre = e.currentTarget.dataset.nombre;
        if (!nombre) return;
        if (this.empresaSel === nombre) {
            this.empresaSel = null;
            this.buildBarras(this._cuentasRaw || []);
            this.buildLinea(this._serieGlobal || []);
            return;
        }
        this.empresaSel = nombre;
        this.grupoSel = null;
        this.buildBarras(this._cuentasRaw || []);   // refresca el resaltado
        if (this._serieCache[nombre]) {
            this.buildLinea(this._serieCache[nombre]);
        } else {
            getSerieEmpresa({ empresaTitular: nombre })
                .then(serie => {
                    this._serieCache[nombre] = serie || [];
                    if (this.empresaSel === nombre) this.buildLinea(this._serieCache[nombre]);
                })
                .catch(() => { /* se mantiene la serie actual */ });
        }
    }

    mapCuenta(c, i) {
        const saldo = Number(c.saldo) || 0;
        const pend = Number(c.numPendientes) || 0;
        return {
            key: 'cb' + i,
            id: c.id,
            banco: c.banco || '',
            hayBanco: !!c.banco,
            empresa: c.empresa || '',
            iban: c.iban || '',
            movsInfo: this.movsInfo(c),
            saldoNum: saldo,
            saldoFmt: this.fmtCurrency(saldo),
            saldoClass: this.signoCls('ts-item-saldo', saldo),
            pendRaw: pend,
            pendLabel: this.pendLabel(pend),
            pendCls: pend > 0 ? 'ts-badge-pend' : 'ts-badge-ok'
        };
    }

    pendLabel(n) {
        if (n <= 0) return 'Todos conciliados';
        return `${this.fmtNumber(n, 0)} ${n === 1 ? 'no conciliado' : 'no conciliados'}`;
    }

    // Total de movimientos no conciliados por columna (sobre las cuentas visibles)
    get pendCuentasNum()  { return this.cuentasView.reduce((t, c) => t + (c.pendRaw || 0), 0); }
    get pendTarjetasNum() { return this.tarjetasView.reduce((t, c) => t + (c.pendRaw || 0), 0); }
    get pendCajasNum()    { return this.cajasView.reduce((t, c) => t + (c.pendRaw || 0), 0); }
    get pendCuentasLabel()  { return this.pendLabel(this.pendCuentasNum); }
    get pendTarjetasLabel() { return this.pendLabel(this.pendTarjetasNum); }
    get pendCajasLabel()    { return this.pendLabel(this.pendCajasNum); }
    get pendCuentasCls()  { return this.pendCuentasNum > 0 ? 'ts-badge-pend' : 'ts-badge-ok'; }
    get pendTarjetasCls() { return this.pendTarjetasNum > 0 ? 'ts-badge-pend' : 'ts-badge-ok'; }
    get pendCajasCls()    { return this.pendCajasNum > 0 ? 'ts-badge-pend' : 'ts-badge-ok'; }

    // Clic en la etiqueta del grupo: filtra por todas las empresas que agrupa
    handleGrupoClick(e) {
        const grupo = e.currentTarget.dataset.grupo;
        if (!grupo) return;
        if (this.grupoSel === grupo) {
            this.grupoSel = null;
            this.buildLinea(this._serieGlobal || []);
            return;
        }
        this.grupoSel = grupo;
        if (this.empresaSel) {
            this.empresaSel = null;
            this.buildBarras(this._cuentasRaw || []);   // quita el resaltado de empresa
        }
        const empresas = Array.from(this.empresasFiltroSet || []).filter(v => v);
        const cacheKey = 'grupo:' + grupo;
        if (this._serieCache[cacheKey]) {
            this.buildLinea(this._serieCache[cacheKey]);
        } else {
            getSerieGrupo({ empresasTitulares: empresas })
                .then(serie => {
                    this._serieCache[cacheKey] = serie || [];
                    if (this.grupoSel === grupo) this.buildLinea(this._serieCache[cacheKey]);
                })
                .catch(() => { /* se mantiene la serie actual */ });
        }
    }

    get grpPropiasCls() { return 'ts-grp-label ts-grp-click' + (this.grupoSel === 'propias' ? ' ts-grp-sel' : ''); }
    get grpOtrasCls()   { return 'ts-grp-label ts-grp-click' + (this.grupoSel === 'otras' ? ' ts-grp-sel' : ''); }

    // Empresas que aplican al filtro actual (empresa concreta o grupo)
    get empresasFiltroSet() {
        if (this.empresaSel) return new Set([this.empresaSel]);
        if (this.grupoSel) {
            const esPropias = this.grupoSel === 'propias';
            return new Set((this._cuentasRaw || [])
                .filter(c => (!!c.propia) === esPropias)
                .map(c => c.empresa || ''));
        }
        return null;
    }

    movsInfo(c) {
        const n = Number(c.numMovimientos) || 0;
        const partes = [`${this.fmtNumber(n, 0)} movs.`];
        if (c.fechaUltimo) partes.push(`últ. ${this.fmtFecha(c.fechaUltimo)}`);
        return partes.join(' · ');
    }

    filtrarEmpresa(arr) {
        const set = this.empresasFiltroSet;
        return set ? (arr || []).filter(c => set.has(c.empresa)) : arr;
    }
    get totalCuentasNum()  { return this.cuentasView.reduce((t, c) => t + c.saldoNum, 0); }
    get totalTarjetasNum() { return this.tarjetasView.reduce((t, c) => t + c.saldoNum, 0); }
    get totalCajaNum()     { return this.cajasView.reduce((t, c) => t + c.saldoNum, 0); }
    get totalCuentasFmt()  { return this.fmtCurrency(this.totalCuentasNum); }
    get totalTarjetasFmt() { return this.fmtCurrency(this.totalTarjetasNum); }
    get totalCajaFmt()     { return this.fmtCurrency(this.totalCajaNum); }
    signoCls(base, v) {
        if (v < 0) return base + ' ts-neg';
        if (v > 0) return base + ' ts-pos';
        return base;
    }
    get totalCuentasCls()  { return this.signoCls('ts-col-total-head', this.totalCuentasNum); }
    get totalTarjetasCls() { return this.signoCls('ts-col-total-head', this.totalTarjetasNum); }
    get totalCajaCls()     { return this.signoCls('ts-col-total-head', this.totalCajaNum); }
    get serieSub() {
        if (this.empresaSel) return `Acumulado por día · ${this.empresaSel}`;
        if (this.grupoSel === 'propias') return 'Acumulado por día · Empresas propias';
        if (this.grupoSel === 'otras') return 'Acumulado por día · Otras empresas';
        return 'Acumulado por día · todo el histórico';
    }

    // En esta pestaña solo cuentan las hojas de caja que no sean
    // extraordinarias (por su descripción)
    esHojaCajaNormal(c) {
        return c.tipo === 'Hoja de Caja'
            && !String(c.banco || '').toLowerCase().includes('extraordinari');
    }

    buildListas(cuentas) {
        const orden = (a, b) => (Number(b.saldo) || 0) - (Number(a.saldo) || 0);
        this.cuentasBancarias = cuentas.filter(c => c.tipo === 'Cuenta bancaria').sort(orden).map((c, i) => this.mapCuenta(c, i));
        this.tarjetas  = cuentas.filter(c => c.tipo === 'Tarjetas').sort(orden).map((c, i) => this.mapCuenta(c, i));
        this.hojasCaja = cuentas.filter(c => this.esHojaCajaNormal(c)).sort(orden).map((c, i) => this.mapCuenta(c, i));

        const suma = arr => arr.reduce((t, c) => t + (Number(c.saldo) || 0), 0);
        const totCuentas  = suma(cuentas.filter(c => c.tipo === 'Cuenta bancaria'));
        const totTarjetas = suma(cuentas.filter(c => c.tipo === 'Tarjetas'));
        const totCajas    = suma(cuentas.filter(c => this.esHojaCajaNormal(c)));

        const totalMedios = totCuentas + totTarjetas + totCajas;
        this.totalMediosFmt = this.fmtCurrency(totalMedios);
        this.totalMediosCls = this.signoCls('ts-card-total', totalMedios);

        this.legend = [
            { key: 'lc', label: 'Cuentas bancarias', importe: this.fmtCurrency(totCuentas),
              importeCls: this.signoCls('ts-legend-imp', totCuentas),  swatch: `background:${COLOR_CUENTAS}` },
            { key: 'lh', label: 'Hojas de caja',     importe: this.fmtCurrency(totCajas),
              importeCls: this.signoCls('ts-legend-imp', totCajas),    swatch: `background:${COLOR_CAJAS}` },
            { key: 'lt', label: 'Tarjetas',          importe: this.fmtCurrency(totTarjetas),
              importeCls: this.signoCls('ts-legend-imp', totTarjetas), swatch: `background:${COLOR_TARJETAS}` }
        ];
    }

    buildBarras(cuentas) {
        // Agrupa por empresa titular: total y desglose por tipo
        const porEmpresa = new Map();
        cuentas.forEach(c => {
            const nombre = c.empresa || '— sin empresa —';
            if (!porEmpresa.has(nombre)) {
                porEmpresa.set(nombre, { nombre, propia: !!c.propia, cuentas: 0, cajas: 0, tarjetas: 0 });
            }
            const e = porEmpresa.get(nombre);
            const v = Number(c.saldo) || 0;
            if (c.tipo === 'Cuenta bancaria') e.cuentas += v;
            else if (this.esHojaCajaNormal(c)) e.cajas += v;
            else if (c.tipo === 'Tarjetas') e.tarjetas += v;
        });

        const empresas = Array.from(porEmpresa.values())
            .map(e => ({ ...e, total: e.cuentas + e.cajas + e.tarjetas,
                         magnitud: Math.abs(e.cuentas) + Math.abs(e.cajas) + Math.abs(e.tarjetas) }))
            .sort((a, b) => b.total - a.total);

        let maxMagnitud = 0;
        empresas.forEach(e => { maxMagnitud = Math.max(maxMagnitud, e.magnitud); });

        const mkBarra = (e, i) => {
            const segs = [];
            const pushSeg = (v, color, etiqueta) => {
                if (!v) return;
                const w = maxMagnitud > 0 ? (Math.abs(v) / maxMagnitud) * 100 : 0;
                segs.push({
                    key: e.nombre + etiqueta,
                    style: `width:${w.toFixed(2)}%;background:${color}`,
                    title: `${etiqueta}: ${this.fmtCurrency(v)}`
                });
            };
            pushSeg(e.cuentas, COLOR_CUENTAS, 'Cuentas bancarias');
            pushSeg(e.cajas, COLOR_CAJAS, 'Hojas de caja');
            pushSeg(e.tarjetas, COLOR_TARJETAS, 'Tarjetas');
            return {
                key: 'emp' + i,
                nombre: e.nombre,
                nombreCls: 'ts-bar-name' + (this.empresaSel === e.nombre ? ' ts-bar-sel' : ''),
                totalFmt: this.fmtCurrency(e.total),
                valCls: this.signoCls('ts-bar-val', e.total),
                segs
            };
        };

        this.barrasPropias = empresas.filter(e => e.propia).map(mkBarra);
        this.barrasOtras   = empresas.filter(e => !e.propia).map(mkBarra);
        this.hayOtras = this.barrasOtras.length > 0;
        const totalPropias = empresas.filter(e => e.propia).reduce((t, e) => t + e.total, 0);
        const totalOtras   = empresas.filter(e => !e.propia).reduce((t, e) => t + e.total, 0);
        this.totalPropiasFmt = this.fmtCurrency(totalPropias);
        this.totalOtrasFmt   = this.fmtCurrency(totalOtras);
        // Fondo azulado si el total es positivo, rojo si es negativo
        this.totalPropiasCls = 'ts-grp-total ' + (totalPropias < 0 ? 'ts-grp-total-neg' : 'ts-grp-total-pos');
        this.totalOtrasCls   = 'ts-grp-total ' + (totalOtras < 0 ? 'ts-grp-total-neg' : 'ts-grp-total-pos');
    }

    buildLinea(serie) {
        // Acumulado por día (todo el histórico) de las cuentas de tipo "Cuenta bancaria"
        const pts = [];
        let acc = 0;
        (serie || []).forEach(p => {
            acc += Number(p.importe) || 0;
            pts.push({ fecha: p.fecha, v: acc });
        });
        this.hayLinea = pts.length > 1;
        this.totalSerieFmt = this.fmtCurrency(acc);
        this.serieTotalCls = this.signoCls('ts-card-total', acc);
        if (!this.hayLinea) { this.linePoints = ''; this.areaPath = ''; this.xLabels = []; this.marcadores = []; this.lineasRef = []; this.anioAtras = null; return; }

        const W = 600, H = 220;
        let min = pts[0].v, max = pts[0].v;
        pts.forEach(p => { min = Math.min(min, p.v); max = Math.max(max, p.v); });
        const rango = (max - min) || 1;
        const pad = rango * 0.08;
        min -= pad; max += pad;

        const coords = pts.map((p, i) => {
            const x = (i / (pts.length - 1)) * W;
            const y = H - ((p.v - min) / (max - min)) * H;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        this.linePoints = coords.join(' ');
        this.areaPath = `M0,${H} L${coords.join(' L')} L${W},${H} Z`;
        const last = coords[coords.length - 1].split(',');
        this.lastX = last[0];
        this.lastY = last[1];

        this.ejeMax = this.fmtCompact(max);
        this.ejeMed = this.fmtCompact((max + min) / 2);
        this.ejeMin = this.fmtCompact(min);

        // Líneas de referencia horizontales en 500.000 € y 1.000.000 € (si caen en el rango)
        this.lineasRef = [500000, 1000000]
            .filter(v => v > min && v < max)
            .map(v => {
                const y = H - ((v - min) / (max - min)) * H;
                return {
                    key: 'ref' + v,
                    y: y.toFixed(1),
                    label: this.fmtNumber(v, 0) + ' €',
                    style: `top:${((y / H) * 100).toFixed(1)}%`
                };
            });

        // 5 etiquetas de fecha repartidas por el eje X
        const nLabels = Math.min(5, pts.length);
        const labels = [];
        for (let k = 0; k < nLabels; k++) {
            const idx = Math.round((k * (pts.length - 1)) / (nLabels - 1 || 1));
            labels.push({ key: 'xl' + k, label: this.fmtFechaCorta(pts[idx].fecha) });
        }
        this.xLabels = labels;

        // Punto azul en el acumulado de hace exactamente un año y línea horizontal a su nivel
        this.anioAtras = null;
        const hoy = new Date();
        const objetivo = `${hoy.getFullYear() - 1}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
        let idxAtras = -1;
        pts.forEach((p, i) => { if (String(p.fecha) <= objetivo) idxAtras = i; });
        if (idxAtras >= 0) {
            const c = coords[idxAtras].split(',');
            const leftPct = Math.min(90, Math.max(8, (Number(c[0]) / W) * 100));
            const topPct = (Number(c[1]) / H) * 100;
            this.anioAtras = {
                cx: c[0],
                cy: c[1],
                importe: this.fmtNumber(pts[idxAtras].v, 0) + ' €',
                style: `left:${leftPct.toFixed(1)}%;top:${topPct.toFixed(1)}%`,
                title: `Saldo hace un año: ${this.fmtCurrency(pts[idxAtras].v)}`
            };
        }

        // Marcador en el cierre de cada año (último dato hasta el 31/12) con su acumulado
        const ultimoIdxPorAnio = new Map();
        pts.forEach((p, i) => { ultimoIdxPorAnio.set(String(p.fecha).slice(0, 4), i); });
        const anios = Array.from(ultimoIdxPorAnio.keys()).sort();
        const anioEnCurso = anios[anios.length - 1];   // el año en curso ya tiene el punto final
        this.marcadores = anios
            .filter(a => a !== anioEnCurso)
            .map(a => {
                const i = ultimoIdxPorAnio.get(a);
                const c = coords[i].split(',');
                const leftPct = Math.min(93, Math.max(5, (Number(c[0]) / W) * 100));
                const topPct = (Number(c[1]) / H) * 100;
                return {
                    key: 'mk' + a,
                    cx: c[0],
                    cy: c[1],
                    label: this.fmtNumber(pts[i].v, 0) + ' €',
                    sub: `31 de diciembre ${a}`,
                    style: `left:${leftPct.toFixed(1)}%;top:${topPct.toFixed(1)}%`,
                    title: `Cierre ${a}: ${this.fmtCurrency(pts[i].v)}`
                };
            });
    }

    // ------------------------------------------------- CONCILIACIÓN BANCARIA
    // Clic en una línea de cuentas bancarias / tarjetas / hojas de caja
    handleCuentaClick(e) {
        const id = e.currentTarget.dataset.id;
        const c = (this._cuentasRaw || []).find(x => x.id === id);
        if (!c) return;
        const saldo = Number(c.saldo) || 0;
        this.concCuenta = {
            id: c.id,
            banco: c.banco || c.iban || '',
            empresa: c.empresa || '',
            iban: c.banco ? (c.iban || '') : '',
            saldoNum: saldo,
            saldoFmt: this.fmtCurrency(saldo)
        };
        this.concActiva = true;
        this.concTab = 'conciliacion';
        // Al entrar solo se muestran los movimientos pendientes de conciliar
        this.concFiltro = 'pendientes';
        this.concFDesde = null;
        this.concFHasta = null;
        this.concFTexto = '';
        this.concFImporte = null;
        this.concMovSelId = null;
        this.concImporte = null;
        this.concTexto = '';
        this.concTipo = 'auto';
        this.concEfectos = [];
        this.concSel = [];
        this.concEfectosError = null;
        this.concBuscado = false;
        this.concPanelVista = 'buscar';
        this.concUltimaSync = '';
        this.concSel = [];
        this._concMovsAll = [];
        this.cargarConcMovs(c.id);
    }

    handleConcVolver() {
        this.concActiva = false;
        this.concCuenta = null;
        this.concError = null;
        clearTimeout(this._concTimer);
    }

    cargarConcMovs(cuentaId) {
        this.concLoading = true;
        this.concError = null;
        return getExtractosCuenta({ cuentaId })
            .then(res => {
                // Llegan en orden cronológico ascendente: se acumula el saldo y se muestra el más reciente primero
                let acc = 0;
                const rows = ((res && res.movimientos) || []).map((m, i) => {
                    const imp = Number(m.importe) || 0;
                    acc += imp;
                    return {
                        key: 'cm' + i,
                        id: m.id,
                        numero: m.numero || '',
                        fechaRaw: m.fecha || '',
                        fechaFmt: this.fmtFecha(m.fecha),
                        concepto: m.concepto || '',
                        masDatos: m.masDatos || '',
                        importeNum: imp,
                        importeFmt: (imp > 0 ? '+' : '') + this.fmtCurrency(imp),
                        importeCls: this.signoCls('ts-efc-num ts-conc-imp', imp),
                        saldoFmt: this.fmtCurrency(acc),
                        conciliado: m.estado === 'Conciliado',
                        pdfId: m.pdfId || null,
                        pdfUrl: null
                    };
                });
                rows.reverse();
                this._concMovsAll = rows;
                this.concUltimaSync = this.fmtFechaHora(res && res.ultimaSync);
                // Cuenta contable de la cuenta bancaria para la línea del banco del asiento
                this._concCtaContableId = (res && res.cuentaContableId) || null;
                this.cargarConcPdfUrls();
            })
            .catch(err => { this.concError = this.reduceError(err); })
            .finally(() => { this.concLoading = false; });
    }

    // --- cabecera y pestañas de la pantalla ---
    get esConcConciliacion() { return this.concTab === 'conciliacion'; }
    get esConcReglas()       { return this.concTab === 'reglas'; }
    get concTabConcCls()   { return this.concTab === 'conciliacion' ? 'pyg-toggle pyg-toggle-active' : 'pyg-toggle'; }
    get concTabReglasCls() { return this.concTab === 'reglas' ? 'pyg-toggle pyg-toggle-active' : 'pyg-toggle'; }
    setConcTab(e) { this.concTab = e.currentTarget.dataset.value; }
    get concSaldoCls() { return this.signoCls('ts-conc-saldo-imp', this.concCuenta ? this.concCuenta.saldoNum : 0); }
    get hasConcError() { return !!this.concError; }
    get showConcContent() { return this.esConcConciliacion && !this.concLoading && !this.concError; }

    // --- movimientos del banco ---
    get concFiltroTodosCls() { return this.concFiltroCls('todos'); }
    get concFiltroPendCls()  { return this.concFiltroCls('pendientes'); }
    get concFiltroConcCls()  { return this.concFiltroCls('conciliados'); }
    concFiltroCls(v) { return this.concFiltro === v ? 'pyg-toggle pyg-toggle-active' : 'pyg-toggle'; }
    setConcFiltro(e) { this.concFiltro = e.currentTarget.dataset.value; }

    // Filtros de movimientos: fechas, concepto/más datos e importe
    hConcFDesde(e)   { this.concFDesde = e.detail.value || null; }
    hConcFHasta(e)   { this.concFHasta = e.detail.value || null; }
    hConcFTexto(e)   { this.concFTexto = e.detail.value || ''; }
    hConcFImporte(e) { this.concFImporte = (e.detail.value === '' || e.detail.value === null || e.detail.value === undefined) ? null : Number(e.detail.value); }

    get concMovsView() {
        const f = this.concFiltro;
        const t = (this.concFTexto || '').toLowerCase().trim();
        const imp = this.concFImporte;
        return (this._concMovsAll || [])
            .filter(m => f === 'todos' || (f === 'pendientes' ? !m.conciliado : m.conciliado))
            .filter(m => !this.concFDesde || (m.fechaRaw && String(m.fechaRaw) >= this.concFDesde))
            .filter(m => !this.concFHasta || (m.fechaRaw && String(m.fechaRaw) <= this.concFHasta))
            .filter(m => !t || (m.concepto || '').toLowerCase().includes(t) || (m.masDatos || '').toLowerCase().includes(t))
            .filter(m => imp === null || Math.abs(m.importeNum - imp) < 0.005 || Math.abs(Math.abs(m.importeNum) - imp) < 0.005)
            .map(m => ({ ...m, cls: 'ts-conc-mov' + (m.id === this.concMovSelId ? ' ts-conc-mov-sel' : '') }));
    }
    get concNumMovs() { return (this._concMovsAll || []).length; }
    get concNumPend() { return (this._concMovsAll || []).filter(m => !m.conciliado).length; }
    get concNumConc() { return this.concNumMovs - this.concNumPend; }
    get concFooterMovs() {
        return `${this.fmtNumber(this.concNumMovs, 0)} movimientos · `
             + `${this.fmtNumber(this.concNumPend, 0)} pendientes de conciliar · `
             + `${this.fmtNumber(this.concNumConc, 0)} conciliados`;
    }
    get hayConcMovs() { return this.concMovsView.length > 0; }

    // Clic en un movimiento: si está conciliado se muestra su conciliación;
    // si está pendiente, propone su importe y busca efectos que encajen
    handleConcMovClick(e) {
        const id = e.currentTarget.dataset.id;
        const m = (this._concMovsAll || []).find(x => x.id === id);
        if (!m) return;
        this.concMovSelId = id;
        this.concSel = [];
        if (m.conciliado) {
            this.cargarConciliacionExistente(id);
            return;
        }
        // Los movimientos FATIR (ingresos de remesas de Caixa) se concilian
        // eligiendo una remesa con pendiente de ingreso, no contra efectos
        if (this.esMovFatir(m)) {
            this.concPanelVista = 'remesa';
            this.cargarConcRemesas();
            return;
        }
        // Al cambiar de movimiento se limpian el texto y el tipo del filtro
        this.concTexto = '';
        this.concTipo = 'auto';
        this.concImporte = String(Math.abs(m.importeNum));
        this.concPanelVista = 'buscar';
        this.buscarConcEfectos();
    }

    // Selecciona un movimiento por Id (tras crearlo), limpia filtros que lo puedan
    // ocultar, busca sus efectos y hace scroll hasta la línea
    seleccionarConcMov(id) {
        const m = (this._concMovsAll || []).find(x => x.id === id);
        if (!m) return;
        // El movimiento recién creado está pendiente: el filtro por defecto lo muestra
        this.concFiltro = 'pendientes';
        this.concFDesde = null;
        this.concFHasta = null;
        this.concFTexto = '';
        this.concFImporte = null;
        this.concMovSelId = id;
        this.concSel = [];
        this.concTexto = '';
        this.concTipo = 'auto';
        this.concImporte = String(Math.abs(m.importeNum));
        if (this.esMovFatir(m)) {
            this.concPanelVista = 'remesa';
            this.cargarConcRemesas();
        } else {
            this.concPanelVista = 'buscar';
            this.buscarConcEfectos();
        }
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            const fila = this.template.querySelector(`tr[data-id="${id}"]`);
            if (fila) fila.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 0);
    }

    // --- conciliación de movimientos FATIR contra una remesa ---
    @track concRemesas = [];
    @track concRemesaSel = null;      // solo se puede marcar una remesa
    @track concRemesasLoading = false;
    @track concRemesasError = null;

    esMovFatir(m) {
        return !!(m && String(m.concepto || '').toUpperCase().startsWith('FATIR'));
    }
    get esConcRemesa() { return this.concPanelVista === 'remesa'; }

    // Remesas con pendiente de ingreso de la empresa titular del banco
    cargarConcRemesas() {
        this.concRemesasLoading = true;
        this.concRemesasError = null;
        this.concRemesaSel = null;
        getRemesasPendientes({ cuentaId: this.concCuenta.id })
            .then(res => {
                this.concRemesas = (res || []).map((r, i) => ({
                    key: 'rem' + i,
                    id: r.id,
                    numero: r.numero || '',
                    fechaFmt: r.fechaRemesa ? this.fmtFecha(r.fechaRemesa) : '—',
                    importeFmt: this.fmtCurrency(Number(r.importeRemesa) || 0),
                    totalOtrosFmt: this.fmtCurrency(Number(r.totalOtros) || 0),
                    totalCaixaFmt: this.fmtCurrency(Number(r.totalCaixa) || 0),
                    pendienteNum: Number(r.pendienteIngreso) || 0,
                    pendienteFmt: this.fmtCurrency(Number(r.pendienteIngreso) || 0),
                    checked: false,
                    filaCls: 'ts-efc-row'
                }));
            })
            .catch(err => { this.concRemesasError = this.reduceError(err); this.concRemesas = []; })
            .finally(() => { this.concRemesasLoading = false; });
    }

    // Marcar una remesa desmarca cualquier otra; volver a pinchar la desmarca
    handleConcRemesaCheck(e) {
        const id = e.currentTarget.dataset.id;
        this.concRemesaSel = this.concRemesaSel === id ? null : id;
        this.concRemesas = this.concRemesas.map(r => ({
            ...r,
            checked: r.id === this.concRemesaSel,
            filaCls: r.id === this.concRemesaSel ? 'ts-efc-row ts-conc-row-sel' : 'ts-efc-row'
        }));
    }

    get hasConcRemesasError() { return !!this.concRemesasError; }
    get showConcRemesasTabla() {
        return !this.concRemesasLoading && !this.concRemesasError && this.concRemesas.length > 0;
    }
    get showConcRemesasVacio() {
        return !this.concRemesasLoading && !this.concRemesasError && this.concRemesas.length === 0;
    }
    get concRemesaConciliarDisabled() { return this.concConciliando || !this.concRemesaSel; }
    get concRemesasCountLabel() {
        const n = this.concRemesas.length;
        return `${this.fmtNumber(n, 0)} ${n === 1 ? 'remesa pendiente de ingreso' : 'remesas pendientes de ingreso'}`;
    }

    // Conciliar el FATIR: una única línea con la remesa asignada; el flow
    // de la org crea el asiento contable al pasar el extracto a Conciliado
    handleConcRemesaConciliar() {
        if (this.concRemesaConciliarDisabled) return;
        const extractoId = this.concMovSelId;
        if (!extractoId) return;
        this.concConciliando = true;
        this.concRemesasError = null;
        conciliarMovimiento({
            extractoId,
            efectoIds: [],
            efectoProvIds: [],
            lineasManualesJson: null,
            remesaId: this.concRemesaSel
        })
            .then(() => {
                this.concSel = [];
                return this.cargarConcMovs(this.concCuenta.id);
            })
            .then(() => this.cargarConciliacionExistente(extractoId))
            .catch(err => { this.concRemesasError = this.reduceError(err); })
            .finally(() => { this.concConciliando = false; });
    }

    // --- búsqueda de efectos candidatos ---
    get concTipoOptions() {
        return [
            { label: 'Automático', value: 'auto' },
            { label: 'Efectos de clientes', value: 'cliente' },
            { label: 'Efectos de proveedores', value: 'proveedor' }
        ];
    }
    hConcImporte(e) { this.concImporte = e.detail.value; this.concBuscarDebounced(); }
    hConcTexto(e)   { this.concTexto = e.detail.value || ''; this.concBuscarDebounced(); }
    hConcTipo(e)    { this.concTipo = e.detail.value; this.buscarConcEfectos(); }
    concBuscarDebounced() {
        clearTimeout(this._concTimer);
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._concTimer = setTimeout(() => this.buscarConcEfectos(), 350);
    }

    buscarConcEfectos() {
        const imp = (this.concImporte === null || this.concImporte === '') ? null : Number(this.concImporte);
        const texto = (this.concTexto || '').trim() || null;
        if (imp === null && !texto) {
            this.concEfectos = [];
            this.concBuscado = false;
            return;
        }
        this.concEfectosLoading = true;
        this.concEfectosError = null;
        // Ingreso: solo estados pendientes de cobro · Pago: solo remesados o transferidos
        const mov = this.concMovSel;
        const esIngreso = !!(mov && mov.importeNum > 0);
        const esPago = !!(mov && mov.importeNum < 0);
        const tipoEfectos = this.concTipo === 'auto' ? null : this.concTipo;
        // Solo efectos de la misma empresa titular que la cuenta bancaria
        buscarEfectosConciliacion({ importe: imp, texto, esIngreso, esPago, tipoEfectos,
            cuentaId: this.concCuenta ? this.concCuenta.id : null })
            .then(res => {
                this.concEfectos = (res || []).map((r, i) => this.mapEfectoRow(r, 'ce' + i));
                this.concBuscado = true;
            })
            .catch(err => { this.concEfectosError = this.reduceError(err); this.concEfectos = []; this.concBuscado = true; })
            .finally(() => { this.concEfectosLoading = false; });
    }

    // Fila de efecto para las tablas del panel (búsqueda y efectos de un cliente)
    mapEfectoRow(r, key) {
        const impEfe = Number(r.importe) || 0;
        const movAbs = Math.abs(this.concMovImporteNum);
        return {
            key,
            id: r.id,
            numero: r.numero || '',
            fechaVencFmt: r.fechaVencimiento ? this.fmtFecha(r.fechaVencimiento) : '—',
            fechaFacturaFmt: r.fechaFactura ? this.fmtFecha(r.fechaFactura) : '—',
            clienteId: r.clienteId || null,
            planId: r.planId || null,
            planNumero: r.planNumero || '',
            facturaNumero: r.facturaNumero || '',
            clienteNombre: r.clienteNombre || r.empresaTitular || '—',
            subLinea: r.facturaNumero || '',
            importeNum: impEfe,
            importeFmt: this.fmtCurrency(impEfe),
            importeCls: this.signoCls('ts-conc-efe-imp', impEfe),
            exacto: this.concMovSelId !== null && Math.abs(Math.abs(impEfe) - movAbs) < 0.005,
            estado: this.estadoVisual(r.estado),
            estadoCls: this.estadoChipCls(r.estado),
            tipo: r.tipo || 'Cliente',
            tipoCls: r.tipo === 'Proveedor' ? 'ts-chip ts-chip-info' : 'ts-chip ts-chip-ok',
            esProveedor: r.tipo === 'Proveedor',
            verTodos: r.tipo !== 'Proveedor' && !!r.clienteId,
            verTodosProv: r.tipo === 'Proveedor' && !!r.clienteId,
            checked: this.concSel.some(s => s.id === r.id)
        };
    }

    // Solo visual: el estado 'Pagado' de un efecto significa remesado en esta pantalla
    estadoVisual(estado) {
        return estado === 'Pagado' ? 'Remesado' : (estado || '');
    }

    handleConcEfectoCheck(e) {
        const id = e.target.dataset.id;
        const checked = e.target.checked;
        if (checked) {
            if (!this.concSel.some(s => s.id === id)) {
                const fila = this.concEfectos.find(r => r.id === id)
                    || this.concClienteEfectos.find(r => r.id === id);
                if (fila) this.concSel = [...this.concSel, { ...fila, checked: true }];
            }
        } else {
            this.concSel = this.concSel.filter(s => s.id !== id);
        }
        this.concEfectos = this.concEfectos.map(r => r.id === id ? { ...r, checked } : r);
        this.concClienteEfectos = this.concClienteEfectos.map(r => r.id === id ? { ...r, checked } : r);
    }

    // --- subvista: todos los efectos de un cliente ---
    handleVerEfectosCliente(e) {
        e.preventDefault();
        e.stopPropagation();
        const clienteId = e.currentTarget.dataset.clienteid;
        if (!clienteId) return;
        const esProveedor = e.currentTarget.dataset.tipo === 'proveedor';
        this.concClienteNombre = e.currentTarget.dataset.clientenombre || '';
        this.concClienteEfectos = [];
        this.concClienteError = null;
        this.concClienteLoading = true;
        this.concPanelVista = 'cliente';
        const cargar = esProveedor
            ? getEfectosDeProveedor({ empresaId: clienteId })
            : getEfectosDeCliente({ clienteId });
        cargar
            .then(res => {
                this.concClienteEfectos = (res || []).map((r, i) => this.mapEfectoRow(r, 'cf' + i));
            })
            .catch(err => { this.concClienteError = this.reduceError(err); })
            .finally(() => { this.concClienteLoading = false; });
    }
    handleConcClienteVolver() { this.concPanelVista = 'buscar'; }
    get esConcCliente() { return this.concPanelVista === 'cliente'; }
    get hasConcClienteError() { return !!this.concClienteError; }
    get showConcClienteTabla() { return !this.concClienteLoading && !this.concClienteError && this.concClienteEfectos.length > 0; }
    get showConcClienteVacio() { return !this.concClienteLoading && !this.concClienteError && this.concClienteEfectos.length === 0; }
    get concClienteCountLabel() {
        const n = this.concClienteEfectos.length;
        return `${this.fmtNumber(n, 0)} ${n === 1 ? 'efecto' : 'efectos'}`;
    }

    // Resultados a pintar: los efectos ya marcados en búsquedas anteriores se
    // mantienen fijados arriba aunque la búsqueda actual no los devuelva
    get concEfectosView() {
        const enResultados = new Set(this.concEfectos.map(r => r.id));
        const fijados = this.concSel
            .filter(s => !enResultados.has(s.id))
            .map(s => ({ ...s, key: s.id, checked: true, filaCls: 'ts-efc-row ts-conc-efe-pin' }));
        const resultados = this.concEfectos.map(r => ({ ...r, key: r.id, filaCls: 'ts-efc-row' }));
        return [...fijados, ...resultados];
    }

    get hasConcEfectosError() { return !!this.concEfectosError; }
    get showConcEfectosPlaceholder() { return !this.concEfectosLoading && !this.concEfectosError && !this.concBuscado && this.concSel.length === 0; }
    get showConcEfectosTabla() { return !this.concEfectosLoading && (this.concBuscado || this.concSel.length > 0) && this.concEfectosView.length > 0; }
    get showConcEfectosVacio() { return this.concBuscado && !this.concEfectosLoading && !this.concEfectosError && this.concEfectosView.length === 0; }

    // --- totales del pie del panel de efectos ---
    get concMovSel() { return (this._concMovsAll || []).find(m => m.id === this.concMovSelId) || null; }
    get concMovImporteNum() { const m = this.concMovSel; return m ? m.importeNum : 0; }
    get concMovImporteFmt() { return this.fmtCurrency(this.concMovImporteNum); }
    get concMovImporteCls() { return this.signoCls('ts-conc-tot-imp', this.concMovImporteNum); }
    // Aporte de un efecto al movimiento del banco:
    // - Proveedores: signo contrario (positivo = sale dinero, abono = entra).
    // - Clientes en un ingreso: con su signo (cobro suma, abono resta).
    // - Clientes en un pago: siempre sale dinero (devolución de remesado o
    //   abono transferido), así que computa en negativo por valor absoluto.
    efectoAporte(r) {
        const imp = r.importeNum || 0;
        if (r.esProveedor) return -imp;
        const mov = this.concMovSel;
        const esPago = !!(mov && mov.importeNum < 0);
        return esPago ? -Math.abs(imp) : imp;
    }
    get concEfectosSelNum() { return this.concSel.reduce((t, r) => t + this.efectoAporte(r), 0); }
    get concEfectosSelFmt() { return this.fmtCurrency(this.concEfectosSelNum); }
    get concEfectosSelCls() { return this.signoCls('ts-conc-tot-imp', this.concEfectosSelNum); }
    get concDifNum() { return this.concEfectosSelNum - this.concMovImporteNum; }
    get concDifFmt() { return this.fmtCurrency(this.concDifNum); }
    get concDifCls() {
        return Math.abs(this.concDifNum) < 0.005 ? 'ts-conc-tot-imp ts-conc-tot-ok' : 'ts-conc-tot-imp ts-neg';
    }
    get concSelCount() { return this.concSel.length; }
    get concSelLabel() {
        const n = this.concSelCount;
        return `${this.fmtNumber(n, 0)} ${n === 1 ? 'efecto seleccionado' : 'efectos seleccionados'}`;
    }

    // --- subvista de propuesta (efectos seleccionados + asiento contable) ---
    get esConcBuscar()    { return this.concPanelVista === 'buscar'; }
    get esConcPropuesta() { return this.concPanelVista === 'propuesta'; }
    // En la propuesta el panel no recorta: el desplegable del buscador de cuentas se ve entero
    get concPanelDerCls() {
        return 'ts-card ts-conc-panel' + (this.esConcPropuesta ? ' ts-conc-panel-libre' : '');
    }
    get concEfectosSel()  { return this.concSel; }
    // Se puede proponer sin efectos o con diferencia (con aviso); solo exige un movimiento
    get concProponerDisabled() { return !this.concMovSelId; }

    handleConcProponer() {
        if (this.concProponerDisabled) return;
        let aviso = null;
        if (this.concSelCount === 0) {
            aviso = 'No has seleccionado ningún efecto.';
        } else if (Math.abs(this.concDifNum) >= 0.005) {
            aviso = `Existe una diferencia de ${this.concDifFmt} entre los efectos y el movimiento.`;
        }
        if (aviso) {
            this.concPropAvisoMsg = aviso;
            this.concPropAvisoOpen = true;
            return;
        }
        this.doProponer();
    }
    handleConcPropAvisoCancelar()  { this.concPropAvisoOpen = false; }
    handleConcPropAvisoContinuar() {
        this.concPropAvisoOpen = false;
        this.doProponer();
    }

    doProponer() {
        const sel = this.concEfectosSel;
        this.concPropEfectos = sel.map((r, i) => ({ ...r, key: 'pe' + i }));
        this.concAsiento = this.generarAsiento(sel);
        this.concPropError = null;
        this.concPropExistente = false;
        this.concPanelVista = 'propuesta';
    }
    handleConcPropVolver() { this.concPanelVista = 'buscar'; }

    // Propuesta generada: línea del banco + una línea por cada efecto seleccionado
    generarAsiento(sel) {
        const lineas = [];
        let seq = 0;
        const mov = this.concMovSel;
        if (mov) {
            const imp = mov.importeNum;
            lineas.push({
                key: 'al' + (seq++),
                tipoLinea: 'banco',
                cuentaId: this._concCtaContableId || null,
                debe: imp > 0 ? imp : null,
                haber: imp < 0 ? -imp : null,
                descripcion: [mov.concepto, mov.masDatos].filter(Boolean).join(' · ')
            });
        }
        const esIngreso = !!(mov && mov.importeNum > 0);
        sel.forEach(r => {
            // En los ingresos la descripción lleva "Ingreso Fra." delante del nº de factura
            const factura = (r.facturaNumero || r.numero)
                ? (esIngreso ? 'Ingreso Fra. ' : '') + (r.facturaNumero || r.numero)
                : '';
            // El signo contable sale del aporte: los proveedores van invertidos
            const v = this.efectoAporte(r);
            lineas.push({
                key: 'al' + (seq++),
                tipoLinea: 'efecto',
                cuentaId: r.planId || null,
                debe: v < 0 ? -v : null,
                haber: v > 0 ? v : null,
                descripcion: [factura, r.clienteNombre].filter(Boolean).join(' · ')
            });
        });
        this._concLineaSeq = seq;
        return lineas;
    }

    // Movimiento ya conciliado: se muestran sus líneas de Conciliación bancaria y sus efectos
    cargarConciliacionExistente(extractoId) {
        this.concPanelVista = 'propuesta';
        this.concPropExistente = true;
        this.concPropLoading = true;
        this.concPropError = null;
        this.concPropEfectos = [];
        this.concAsiento = [];
        this.concApuntes = [];
        this.concConcRows = [];
        this.concAsientoId = null;
        this.concAsientoNumero = '';
        return getConciliacionMovimiento({ extractoId })
            .then(res => {
                const efectos = [];
                // Registros de Conciliación bancaria del extracto
                this.concConcRows = ((res && res.lineas) || []).map((l, i) => ({
                    key: 'cc' + i,
                    id: l.id,
                    numero: l.numero || '',
                    cuentaId: l.cuentaId || null,
                    cuentaNumero: l.cuentaNumero || '',
                    cuentaTitulo: l.cuentaTitulo || '',
                    debeFmt: (l.debe === null || l.debe === undefined) ? '—' : this.fmtCurrency(Number(l.debe)),
                    haberFmt: (l.haber === null || l.haber === undefined) ? '—' : this.fmtCurrency(Number(l.haber)),
                    provId: l.efectoProvId || null,
                    provNumero: l.efectoProvNumero || '',
                    efectoId: l.efectoId || null,
                    efectoNumero: l.efectoNumero || '',
                    remesaId: l.remesaId || null,
                    remesaNumero: l.remesaNumero || ''
                }));
                ((res && res.lineas) || []).forEach((l, i) => {
                    if (l.efectoId) {
                        const imp = Number(l.efectoImporte) || 0;
                        const partes = [];
                        if (l.facturaNumero) partes.push(l.facturaNumero);
                        efectos.push({
                            key: 'pe' + i,
                            id: l.efectoId,
                            numero: l.efectoNumero || '',
                            tipo: 'Cliente',
                            tipoCls: 'ts-chip ts-chip-ok',
                            estado: this.estadoVisual(l.efectoEstado),
                            estadoCls: this.estadoChipCls(l.efectoEstado),
                            fechaVencFmt: l.fechaVencimiento ? this.fmtFecha(l.fechaVencimiento) : '—',
                            fechaFacturaFmt: l.fechaFactura ? this.fmtFecha(l.fechaFactura) : '—',
                            clienteNombre: l.clienteNombre || '—',
                            subLinea: partes.join(' · '),
                            importeNum: imp,
                            importeFmt: this.fmtCurrency(imp),
                            importeCls: this.signoCls('ts-conc-efe-imp', imp)
                        });
                    }
                });
                this.concPropEfectos = efectos;
                // Apuntes contables reales asociados al extracto (solo lectura)
                this.concApuntes = ((res && res.apuntes) || []).map((a, i) => ({
                    key: 'ap' + i,
                    id: a.id,
                    numero: a.numero || '',
                    cuentaId: a.cuentaId || null,
                    cuentaNumero: a.cuentaNumero || '',
                    cuentaTitulo: a.cuentaTitulo || '',
                    debeFmt: (a.debe === null || a.debe === undefined) ? '—' : this.fmtCurrency(Number(a.debe)),
                    haberFmt: (a.haber === null || a.haber === undefined) ? '—' : this.fmtCurrency(Number(a.haber)),
                    descripcion: a.descripcion || ''
                }));
                this.concAsientoId = (res && res.asientoId) || null;
                this.concAsientoNumero = (res && res.asientoNumero) || '';
            })
            .catch(err => { this.concPropError = this.reduceError(err); })
            .finally(() => { this.concPropLoading = false; });
    }
    get hayConcConcRows() { return this.concConcRows.length > 0; }
    get concConcLabel() {
        const n = this.concConcRows.length;
        return `${this.fmtNumber(n, 0)} ${n === 1 ? 'conciliación' : 'conciliaciones'}`;
    }
    get hayConcApuntes() { return this.concApuntes.length > 0; }
    get concApuntesLabel() {
        const n = this.concApuntes.length;
        return `${this.fmtNumber(n, 0)} ${n === 1 ? 'apunte contable' : 'apuntes contables'}`;
    }

    // --- líneas del asiento: edición en la propia pantalla ---
    get hayConcAsiento() { return this.concAsiento.length > 0; }
    get concPickerDisplayInfo() { return { additionalFields: ['T_tulo_cuenta__c'] }; }
    get concPickerMatchingInfo() {
        return { primaryField: { fieldPath: 'Name' }, additionalFields: [{ fieldPath: 'T_tulo_cuenta__c' }] };
    }
    handleConcAddLinea() {
        const seq = this._concLineaSeq || this.concAsiento.length;
        this._concLineaSeq = seq + 1;
        this.concAsiento = [...this.concAsiento,
            { key: 'al' + seq, tipoLinea: 'manual', cuentaId: null, debe: null, haber: null, descripcion: '' }];
    }

    // Cuadrar automáticamente: añade una línea con la diferencia en el debe o el
    // haber según corresponda; la cuenta y la descripción las elige el usuario
    get hayDescuadre() { return Math.abs(this.concCuadradoDif) >= 0.005; }
    handleConcCuadrar() {
        const dif = this.concCuadradoDif;
        if (Math.abs(dif) < 0.005) return;
        const seq = this._concLineaSeq || this.concAsiento.length;
        this._concLineaSeq = seq + 1;
        const redondear = v => Math.round(v * 100) / 100;
        this.concAsiento = [...this.concAsiento, {
            key: 'al' + seq,
            tipoLinea: 'manual',
            cuentaId: null,
            debe: dif < 0 ? redondear(-dif) : null,
            haber: dif > 0 ? redondear(dif) : null,
            descripcion: ''
        }];
    }
    hConcLineaCuenta(e) {
        const key = e.target.dataset.key;
        const recordId = (e.detail && e.detail.recordId) || null;
        this.concAsiento = this.concAsiento.map(l => l.key === key ? { ...l, cuentaId: recordId } : l);
    }
    handleConcDelLinea(e) {
        const key = e.currentTarget.dataset.key;
        this.concAsiento = this.concAsiento.filter(l => l.key !== key);
    }
    hConcLineaCampo(e) {
        const key = e.target.dataset.key;
        const campo = e.target.dataset.campo;
        let v = e.detail.value;
        if (campo !== 'descripcion') v = (v === '' || v === null || v === undefined) ? null : Number(v);
        this.concAsiento = this.concAsiento.map(l => l.key === key ? { ...l, [campo]: v } : l);
    }

    // --- seguro periodificado: dos líneas (625 gasto del ejercicio, 480 periodificado) ---
    @track segOpen = false;
    @track segImporte = null;
    @track segInicio = null;
    @track segFin = null;
    @track segError = null;
    @track segGuardando = false;
    _cuentasSeguro = null;

    handleSegOpen() {
        const mov = this.concMovSel;
        this.segImporte = mov ? String(Math.abs(mov.importeNum)) : null;
        this.segInicio = null;
        this.segFin = null;
        this.segError = null;
        this.segGuardando = false;
        this.segOpen = true;
    }
    handleSegClose() { if (!this.segGuardando) this.segOpen = false; }
    hSegImporte(e) { this.segImporte = e.detail.value; }
    hSegInicio(e)  { this.segInicio = e.detail.value || null; }
    hSegFin(e)     { this.segFin = e.detail.value || null; }
    get hasSegError() { return !!this.segError; }

    handleSegAceptar() {
        const prima = Number(this.segImporte);
        if (!prima || prima <= 0) { this.segError = 'Indica el importe de la prima en positivo.'; return; }
        if (!this.segInicio || !this.segFin) { this.segError = 'Indica las fechas de inicio y fin de la cobertura.'; return; }
        const utc = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
        const ini = utc(this.segInicio);
        const fin = utc(this.segFin);
        if (fin <= ini) { this.segError = 'La fecha de fin debe ser posterior a la de inicio.'; return; }
        this.segError = null;
        this.segGuardando = true;
        const cargarCuentas = this._cuentasSeguro
            ? Promise.resolve(this._cuentasSeguro)
            : getCuentasSeguro().then(c => { this._cuentasSeguro = c; return c; });
        cargarCuentas
            .then(ctas => {
                // Prorrateo por días: la parte del ejercicio del movimiento va a la
                // 625 y el resto (cobertura del ejercicio siguiente) a la 480
                const mov = this.concMovSel;
                const anio = (mov && mov.fechaRaw) ? Number(String(mov.fechaRaw).slice(0, 4)) : new Date().getFullYear();
                const finEjercicio = Date.UTC(anio, 11, 31);
                const dia = 86400000;
                const totalDias = (fin - ini) / dia + 1;
                const finTramo = Math.min(fin, finEjercicio);
                const diasEjercicio = finTramo >= ini ? (finTramo - ini) / dia + 1 : 0;
                const redondear = v => Math.round(v * 100) / 100;
                const gasto = redondear(prima * diasEjercicio / totalDias);
                const periodificado = redondear(prima - gasto);

                const esPago = !!(mov && mov.importeNum < 0);
                const conceptoMov = (mov && mov.concepto) || 'seguro';
                const nuevas = [];
                let seq = this._concLineaSeq || this.concAsiento.length;
                if (gasto !== 0) {
                    nuevas.push({
                        key: 'al' + (seq++), tipoLinea: 'manual',
                        cuentaId: ctas.cuentaSeguroId,
                        debe: esPago ? gasto : null,
                        haber: esPago ? null : gasto,
                        descripcion: `Seguro · ${conceptoMov}`
                    });
                }
                if (periodificado !== 0) {
                    nuevas.push({
                        key: 'al' + (seq++), tipoLinea: 'manual',
                        cuentaId: ctas.cuentaPeriodificacionId,
                        debe: esPago ? periodificado : null,
                        haber: esPago ? null : periodificado,
                        descripcion: `Periodificación seguro · hasta ${this.fmtFecha(this.segFin)}`
                    });
                }
                this._concLineaSeq = seq;
                this.concAsiento = [...this.concAsiento, ...nuevas];
                this.segOpen = false;
            })
            .catch(err => { this.segError = this.reduceError(err); })
            .finally(() => { this.segGuardando = false; });
    }

    // --- totales y estado de cuadre ---
    get hasConcPropError() { return !!this.concPropError; }
    get showConcPropContent() { return !this.concPropLoading && !this.concPropError; }
    get concAsientoDebeNum()  { return this.concAsiento.reduce((t, l) => t + (Number(l.debe) || 0), 0); }
    get concAsientoHaberNum() { return this.concAsiento.reduce((t, l) => t + (Number(l.haber) || 0), 0); }
    get concCuadradoDif() { return this.concAsientoDebeNum - this.concAsientoHaberNum; }
    get concCuadradoLabel() {
        const d = this.concCuadradoDif;
        if (Math.abs(d) < 0.005) return 'Cuadrado · 0,00 €';
        return 'Descuadre · ' + this.fmtCurrency(d);
    }
    get concCuadradoCls() {
        return Math.abs(this.concCuadradoDif) < 0.005 ? 'ts-conc-cuadrado' : 'ts-conc-cuadrado ts-conc-descuadre';
    }
    get concLineasLabel() {
        const n = this.concAsiento.length;
        return `${this.fmtNumber(n, 0)} ${n === 1 ? 'línea' : 'líneas'}`;
    }
    // Una línea está incompleta si le falta la cuenta, el importe (debe o haber)
    // o la descripción, que es obligatoria
    get concLineasIncompletas() {
        return this.concAsiento.some(l => {
            const debe = Number(l.debe) || 0;
            const haber = Number(l.haber) || 0;
            return !l.cuentaId || (debe === 0 && haber === 0) || !(l.descripcion || '').trim();
        });
    }

    // Conciliar sólo si el asiento cuadra, tiene líneas completas y no existe ya
    get concConciliarDisabled() {
        return this.concPropExistente || this.concConciliando
            || this.concAsiento.length === 0
            || this.concLineasIncompletas
            || Math.abs(this.concCuadradoDif) >= 0.005;
    }

    // Conciliar y crear asiento: crea las conciliaciones por efecto y marca el
    // extracto como Conciliado; el flow de la org genera el asiento y sus apuntes
    handleConcConciliar() {
        if (this.concConciliarDisabled) return;
        const extractoId = this.concMovSelId;
        if (!extractoId) return;
        this.concConciliando = true;
        this.concPropError = null;
        conciliarMovimiento({
            extractoId,
            efectoIds: this.concPropEfectos.filter(r => r.id && !r.esProveedor).map(r => r.id),
            efectoProvIds: this.concPropEfectos.filter(r => r.id && r.esProveedor).map(r => r.id),
            // Las líneas añadidas a mano se guardan como conciliaciones sin efecto
            lineasManualesJson: JSON.stringify(this.concAsiento
                .filter(l => l.tipoLinea === 'manual')
                .map(l => ({ cuentaId: l.cuentaId, debe: l.debe, haber: l.haber, descripcion: l.descripcion }))),
            remesaId: null
        })
            .then(() => {
                this.concSel = [];
                return this.cargarConcMovs(this.concCuenta.id);
            })
            .then(() => this.cargarConciliacionExistente(extractoId))
            .catch(err => { this.concPropError = this.reduceError(err); })
            .finally(() => { this.concConciliando = false; });
    }
    get concPropCountLabel() {
        const n = this.concPropEfectos.length;
        return `${this.fmtNumber(n, 0)} ${n === 1 ? 'efecto' : 'efectos'}`;
    }
    get concPropEfectosNum() { return this.concPropEfectos.reduce((t, r) => t + this.efectoAporte(r), 0); }
    get concPropEfectosFmt() { return this.fmtCurrency(this.concPropEfectosNum); }
    get concPropEfectosCls() { return this.signoCls('ts-conc-tot-imp', this.concPropEfectosNum); }
    get concPropDifNum() { return this.concPropEfectosNum - this.concMovImporteNum; }
    get concPropDifFmt() { return this.fmtCurrency(this.concPropDifNum); }
    get concPropDifCls() {
        return Math.abs(this.concPropDifNum) < 0.005 ? 'ts-conc-tot-imp ts-conc-tot-ok' : 'ts-conc-tot-imp ts-neg';
    }

    // Enlaces públicos de los PDFs adjuntos: se precargan al abrir la pantalla
    // para que el icono sea un enlace real y el navegador nunca lo bloquee
    cargarConcPdfUrls() {
        const ids = (this._concMovsAll || []).filter(r => r.pdfId).map(r => r.pdfId);
        if (!ids.length) return;
        getPdfPublicUrls({ contentDocumentIds: ids })
            .then(urls => {
                this._concMovsAll = this._concMovsAll.map(r =>
                    (r.pdfId && urls && urls[r.pdfId]) ? { ...r, pdfUrl: urls[r.pdfId] } : r);
            })
            .catch(() => { /* sin enlace, el icono se queda en gris */ });
    }

    // Evita que el clic en un enlace de la fila seleccione el movimiento
    stopClick(e) { e.stopPropagation(); }

    // Enlaces del histórico en Google Drive (cabecera)
    abrirHojasCajaAntiguas()      { window.open(URL_HOJAS_CAJA_ANTIGUAS, '_blank'); }
    abrirIntermediacionesAntiguas() { window.open(URL_INTERMEDIACIONES_ANTIGUAS, '_blank'); }

    // --- pop-up de nuevo movimiento del banco ---
    handleNuevoMovOpen() {
        this.concNuevoFecha = null;  // la fecha se rellena a mano, sin valor por defecto
        this.concNuevoTipo = null;   // primero hay que elegir ingreso o pago
        this.concNuevoImporte = null;
        this.concNuevoConcepto = '';
        this.concNuevoMasDatos = '';
        this.concNuevoError = null;
        this.concNuevoSaving = false;
        this.concNuevoFileName = '';
        this._concNuevoFileB64 = null;
        this.concNuevoOpen = true;
    }
    handleNuevoMovClose() {
        if (this.concNuevoSaving) return;
        this.concNuevoOpen = false;
    }
    hConcNuevoFecha(e)    { this.concNuevoFecha = e.detail.value || null; }
    hConcNuevoConcepto(e) { this.concNuevoConcepto = e.detail.value || ''; }
    hConcNuevoMasDatos(e) { this.concNuevoMasDatos = e.detail.value || ''; }
    hConcNuevoImporte(e)  { this.concNuevoImporte = e.detail.value; }
    hConcNuevoFichero(e) {
        const f = e.target.files && e.target.files[0];
        if (!f) {
            this.concNuevoFileName = '';
            this._concNuevoFileB64 = null;
            return;
        }
        if (f.size > 3500000) {
            this.concNuevoError = 'El documento no puede superar los 3,5 MB.';
            this.concNuevoFileName = '';
            this._concNuevoFileB64 = null;
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            // reader.result llega como data:...;base64,XXXX -> nos quedamos con el contenido
            this._concNuevoFileB64 = String(reader.result).split(',')[1] || null;
            this.concNuevoFileName = f.name;
            this.concNuevoError = null;
        };
        reader.onerror = () => { this.concNuevoError = 'No se pudo leer el documento.'; };
        reader.readAsDataURL(f);
    }
    get concNuevoFileLabel() { return `Adjunto: ${this.concNuevoFileName}`; }
    setConcNuevoTipo(e)   { this.concNuevoTipo = e.currentTarget.dataset.value; }
    get concNuevoTipoElegido() { return !!this.concNuevoTipo; }
    get concNuevoIngresoCls() {
        return 'ts-modal-tipo-btn' + (this.concNuevoTipo === 'ingreso' ? ' ts-modal-tipo-ingreso' : '');
    }
    get concNuevoPagoCls() {
        return 'ts-modal-tipo-btn' + (this.concNuevoTipo === 'pago' ? ' ts-modal-tipo-pago' : '');
    }
    get concNuevoGuardarDisabled() { return this.concNuevoSaving || !this.concNuevoTipoElegido; }
    get hasConcNuevoError() { return !!this.concNuevoError; }

    handleNuevoMovGuardar() {
        const imp = Number(this.concNuevoImporte);
        if (!this.concNuevoTipo) { this.concNuevoError = 'Selecciona si es un ingreso o un pago.'; return; }
        if (!this.concNuevoFecha) { this.concNuevoError = 'Indica la fecha del movimiento.'; return; }
        if (!(this.concNuevoConcepto || '').trim()) { this.concNuevoError = 'Indica el concepto.'; return; }
        if (!imp || imp <= 0) { this.concNuevoError = 'El importe debe ser un número positivo.'; return; }
        this.concNuevoError = null;
        this.concNuevoSaving = true;
        crearMovimientoBanco({
            cuentaId: this.concCuenta.id,
            fecha: this.concNuevoFecha,
            concepto: this.concNuevoConcepto.trim(),
            masDatos: (this.concNuevoMasDatos || '').trim() || null,
            importe: imp,
            tipo: this.concNuevoTipo,
            nombreFichero: this.concNuevoFileName || null,
            ficheroBase64: this._concNuevoFileB64
        })
            .then(nuevoId => {
                this.concNuevoOpen = false;
                // El saldo de la cabecera refleja al momento el movimiento creado
                this.actualizarSaldoConc(this.concNuevoTipo === 'pago' ? -imp : imp);
                // Recarga y deja seleccionada la línea nueva para elegir sus efectos
                return this.cargarConcMovs(this.concCuenta.id)
                    .then(() => this.seleccionarConcMov(nuevoId));
            })
            .catch(err => { this.concNuevoError = this.reduceError(err); })
            .finally(() => { this.concNuevoSaving = false; });
    }

    // Ajusta el saldo de la cabecera de la conciliación y el de la línea de
    // medios de pago de la que salió, para que ambos reflejen el movimiento nuevo
    actualizarSaldoConc(delta) {
        if (!this.concCuenta || !delta) return;
        const saldo = (this.concCuenta.saldoNum || 0) + delta;
        this.concCuenta = { ...this.concCuenta, saldoNum: saldo, saldoFmt: this.fmtCurrency(saldo) };
        const c = (this._cuentasRaw || []).find(x => x.id === this.concCuenta.id);
        if (c) {
            c.saldo = (Number(c.saldo) || 0) + delta;
            c.numPendientes = (Number(c.numPendientes) || 0) + 1;
            this.buildListas(this._cuentasRaw);
            this.buildBarras(this._cuentasRaw);
        }
    }

    // --- barra inferior ---
    get concBottomInfo() {
        const partes = [`Extracto ${(this.concCuenta && this.concCuenta.banco) || ''} · ${this.fmtNumber(this.concNumMovs, 0)} movimientos`];
        if (this.concUltimaSync) partes.push(`Última sincronización: ${this.concUltimaSync}`);
        return partes.join('   ·   ');
    }
    fmtFechaHora(v) {
        if (!v) return '';
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return String(v);
        const p = n => String(n).padStart(2, '0');
        return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    // --------------------------------------------------------------- navegación
    navigateToRecordNewTab(e) {
        e.preventDefault();
        e.stopPropagation();
        const recordId = e.currentTarget.dataset.recordid;
        const objectApiName = e.currentTarget.dataset.objectname || 'Cuenta_bancaria__c';
        const empresa = e.currentTarget.dataset.empresa;
        if (!recordId) return;
        this[NavigationMixin.GenerateUrl]({
            type: 'standard__recordPage',
            attributes: { recordId: recordId, objectApiName: objectApiName, actionName: 'view' }
        }).then(url => {
            // Cuenta contable: llega prefiltrada con la empresa titular del efecto
            if (objectApiName === 'Plan_general_contable__c' && empresa) {
                url += (url.includes('?') ? '&' : '?')
                    + 'c__empresas=' + encodeURIComponent(JSON.stringify([empresa]));
            }
            window.open(url, '_blank');
        });
    }

    // --------------------------------------------------------------- formato
    toNum(v) {
        if (v == null) return 0;
        const n = (typeof v === 'number') ? v : Number(v);
        return Number.isNaN(n) ? 0 : n;
    }
    fmtCurrency(v) { return this.fmtNumber(this.toNum(v), 2) + ' €'; }
    fmtNumber(v, decimals) {
        const n = this.toNum(v);
        const sign = n < 0 ? '-' : '';
        const abs = Math.abs(n).toFixed(decimals);
        const parts = abs.split('.');
        const intDots = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return decimals > 0 ? `${sign}${intDots},${parts[1]}` : `${sign}${intDots}`;
    }
    fmtCompact(v) {
        const n = this.toNum(v);
        const abs = Math.abs(n);
        if (abs >= 1000000) return this.fmtNumber(n / 1000000, 1) + ' M';
        if (abs >= 1000)    return this.fmtNumber(n / 1000, 0) + 'k';
        return this.fmtNumber(n, 0);
    }
    fmtFecha(d) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
        if (!m) return String(d || '');
        return `${m[3]}/${m[2]}/${m[1]}`;
    }
    fmtFechaCorta(d) {
        const m = /^(\d{4})-(\d{2})/.exec(String(d || ''));
        if (!m) return String(d || '');
        return `${MESES_CORTOS[Number(m[2]) - 1]} ${m[1].slice(2)}`;
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