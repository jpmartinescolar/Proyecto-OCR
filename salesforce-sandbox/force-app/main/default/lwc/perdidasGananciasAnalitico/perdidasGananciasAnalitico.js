import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getFilterOptions from '@salesforce/apex/PyGAnaliticoController.getFilterOptions';
import generar from '@salesforce/apex/PyGAnaliticoController.generar';
import getComparativoOperaciones from '@salesforce/apex/PyGAnaliticoController.getComparativoOperaciones';
import getMovimientos from '@salesforce/apex/PyGAnaliticoController.getMovimientos';
import updateMovimiento from '@salesforce/apex/PyGMensualController.updateMovimiento';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const MESES_LABEL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default class PerdidasGananciasAnalitico extends NavigationMixin(LightningElement) {

    @track empresasTitulares = [];
    @track area = '';
    @track directorFacturacionId = null;
    @track ejercicio = null;

    @track avisosParams = null;   // entrada para <c-avisos-cuadre>

    @track simulacion = 'No';
    @track extraordinarios = 'Todas';
    @track check = 'Todos';
    @track incidencia = 'Todos';
    @track desplegado = 'Si';
    @track mesDesde = '1';     // 1..12
    @track mesHasta = '12';

    @track loading = false;
    @track generated = false;
    @track error;
    @track rows = [];

    // Gráfico 1: comparativo mensual (actual vs año anterior)
    @track chartGroups = [];
    @track chartLegend = [];
    @track chartClass = 'ana-chart';
    // Gráficos 2 y 3: por director y por área (barras horizontales, anterior vs actual)
    @track directorView = [];
    @track areaView = [];
    @track showDirectorModal = false;   // ampliar gráfico Margen por Director
    @track showAreaModal = false;       // ampliar gráfico Margen por Área
    @track showMensualModal = false;    // ampliar gráfico mensual
    @track chartGroupsBig = [];         // versión ampliada del gráfico mensual
    @track chartClassBig = 'ana-chart ana-chart-noneg ana-chart-big';
    // Líneas que unen las cimas de las barras (calculadas midiendo el DOM)
    @track chartLinePts = '';        // año actual
    @track chartLinePtsBig = '';
    @track chartLinePtsPrev = '';    // año anterior
    @track chartLinePtsPrevBig = '';

    // Gráficos de VENTAS Operaciones (ingresos 7xx de operaciones)
    @track ventasGroups = [];
    @track ventasGroupsBig = [];
    @track ventasClass = 'ana-chart';
    @track ventasClassBig = 'ana-chart ana-chart-noneg ana-chart-big';
    @track ventasLinePts = '';
    @track ventasLinePtsBig = '';
    @track ventasLinePtsPrev = '';
    @track ventasLinePtsPrevBig = '';
    @track ventasLegend = [];
    @track ventasDirectorView = [];
    @track ventasAreaView = [];
    @track showVentasMensualModal = false;
    @track showVentasDirectorModal = false;
    @track showVentasAreaModal = false;
    // Filtros cruzados entre los 3 gráficos
    @track drillMonth = null;     // mes seleccionado (gráfico 1) -> filtra 2 y 3
    @track selDirector = null;    // director seleccionado (gráfico 2) -> filtra 1 y 3
    @track selDirectorId = null;  // Id del director seleccionado (para filtrar el informe)
    @track selArea = null;        // área seleccionada (gráfico 3) -> filtra 1 y 2
    _cells = [];
    _ejActual = null;
    _ejAnterior = null;

    @track empresaOptionsBase = [];
    @track areaOptions = [];
    @track ejercicioOptions = [];

    @track showEmpresaDropdown = false;
    @track empresaFiltroBusqueda = '';

    // Modal
    @track showModal = false;
    @track modalLoading = false;
    @track modalError;
    @track modalTitulo = '';
    @track modalSubtitulo = '';
    @track modalImporte = '';
    @track modalMovimientos = [];

    meses = MESES;

    connectedCallback() {
        // Por defecto: ejercicio actual, de enero al mes anterior a hoy.
        // Si hoy es enero, todo el ejercicio anterior (enero a diciembre).
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth() + 1;   // 1..12
        if (m === 1) {
            this.ejercicio = String(y - 1);
            this.mesDesde = '1';
            this.mesHasta = '12';
        } else {
            this.ejercicio = String(y);
            this.mesDesde = '1';
            this.mesHasta = String(m - 1);
        }
        this._onResize = () => this.drawAllLines();
        window.addEventListener('resize', this._onResize);
    }

    disconnectedCallback() {
        if (this._onResize) window.removeEventListener('resize', this._onResize);
    }

    renderedCallback() {
        this.drawAllLines();
    }

    // Mide las barras de cada año y construye las polilíneas que unen sus cimas.
    drawAllLines() {
        // Año actual (serie 'a')
        const margen    = this.computeLinePoints('[data-chart="margen"]', 'a');
        const ventas     = this.computeLinePoints('[data-chart="ventas"]', 'a');
        const margenBig  = this.computeLinePoints('[data-chart="margenBig"]', 'a');
        const ventasBig  = this.computeLinePoints('[data-chart="ventasBig"]', 'a');
        if (margen    !== this.chartLinePts)     this.chartLinePts     = margen;
        if (ventas    !== this.ventasLinePts)    this.ventasLinePts    = ventas;
        if (margenBig !== this.chartLinePtsBig)  this.chartLinePtsBig  = margenBig;
        if (ventasBig !== this.ventasLinePtsBig) this.ventasLinePtsBig = ventasBig;
        // Año anterior (serie 'b')
        const margenP    = this.computeLinePoints('[data-chart="margen"]', 'b');
        const ventasP     = this.computeLinePoints('[data-chart="ventas"]', 'b');
        const margenBigP  = this.computeLinePoints('[data-chart="margenBig"]', 'b');
        const ventasBigP  = this.computeLinePoints('[data-chart="ventasBig"]', 'b');
        if (margenP    !== this.chartLinePtsPrev)     this.chartLinePtsPrev     = margenP;
        if (ventasP    !== this.ventasLinePtsPrev)    this.ventasLinePtsPrev    = ventasP;
        if (margenBigP !== this.chartLinePtsPrevBig)  this.chartLinePtsPrevBig  = margenBigP;
        if (ventasBigP !== this.ventasLinePtsPrevBig) this.ventasLinePtsPrevBig = ventasBigP;
    }

    computeLinePoints(selector, serie) {
        const cont = this.template.querySelector(selector);
        if (!cont) return '';
        const cols = cont.querySelectorAll(`.ana-chart-col[data-serie="${serie}"]`);
        if (!cols || cols.length < 2) return '';   // hace falta al menos 2 puntos
        const cRect = cont.getBoundingClientRect();
        const pts = [];
        cols.forEach(col => {
            const colR = col.getBoundingClientRect();
            const x = colR.left + colR.width / 2 - cRect.left;
            let y = null;
            col.querySelectorAll('.ana-chart-bar').forEach(bar => {
                if (bar.offsetHeight > 0) y = bar.getBoundingClientRect().top - cRect.top;
            });
            if (y === null) {
                const topEl = col.querySelector('.ana-chart-top');
                y = topEl ? (topEl.getBoundingClientRect().bottom - cRect.top) : 0;
            }
            pts.push(`${Math.round(x)},${Math.round(y)}`);
        });
        return pts.join(' ');
    }

    @wire(getFilterOptions)
    wiredOpts({ data, error }) {
        if (data) {
            this.empresaOptionsBase = (data.empresasTitulares || []).map(v => ({ label: v, value: v }));
            this.areaOptions    = [{ label: 'Todas', value: '' }, ...((data.areas || []).map(v => ({ label: v, value: v })))];
            this.ejercicioOptions = (data.ejercicios || []).map(v => ({ label: String(v), value: String(v) }));
        } else if (error) {
            this.error = this.reduceError(error);
        }
    }

    get hasError()    { return !!this.error; }
    get hasRows()     { return this.generated && this.rows && this.rows.length > 0; }
    get emptyState()  { return this.generated && (!this.rows || this.rows.length === 0); }
    get showInicial() { return !this.generated && !this.loading && !this.hasError; }
    get textoInicial() {
        const f = [];
        if (this.empresasTitulares.length === 0) f.push('la(s) empresa(s) titular(es)');
        if (this.ejercicio == null) f.push('el ejercicio');
        if (!f.length) return 'Pulsa';
        return 'Selecciona ' + f.join(' y ') + ' y pulsa';
    }
    get currencySimbolo() { return 'EUR'; }
    get empresaLabel() {
        if (!this.empresasTitulares.length) return '—';
        if (this.empresasTitulares.length === 1) return this.empresasTitulares[0];
        return `${this.empresasTitulares.length} empresas seleccionadas`;
    }
    get periodoLabel() {
        const rangoLabel = (this.mesFrom === 1 && this.mesTo === 12)
            ? 'vista mensual analítica'
            : `${MESES_LABEL[this.mesFrom-1]} - ${MESES_LABEL[this.mesTo-1]}`;
        return `Ejercicio ${this.ejercicio || '—'} · ${rangoLabel}`;
    }
    get mesFrom() { return Number(this.mesDesde) || 1; }
    get mesTo()   { return Number(this.mesHasta) || 12; }
    get mesOptions() {
        return MESES_LABEL.map((m, i) => ({ label: m, value: String(i + 1) }));
    }
    get headerColumnas() {
        const arr = [];
        for (let i = this.mesFrom - 1; i <= this.mesTo - 1; i++) {
            arr.push({ key: 'm' + i, label: this.meses[i] });
        }
        return arr;
    }

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
        return this.empresasTitulares.length ? 'pyg-ms-trigger pyg-ms-trigger-filled' : 'pyg-ms-trigger';
    }
    get empresaDropdownClass() {
        return this.showEmpresaDropdown ? 'pyg-ms-wrap pyg-ms-wrap-open' : 'pyg-ms-wrap';
    }
    get empresaCount() { return `${this.empresasTitulares.length} / ${this.empresaOptionsBase.length}`; }
    get empresaErrorClass()   { return this.empresasTitulares.length === 0 ? 'pyg-required-empty' : ''; }
    get ejercicioErrorClass() { return this.ejercicio == null ? 'pyg-required-empty' : ''; }

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
        const abs = Math.abs(n);
        const fixed = abs.toFixed(decimals);
        const parts = fixed.split('.');
        const intDots = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return decimals > 0 ? `${sign}${intDots},${parts[1]}` : `${sign}${intDots}`;
    }
    fmtFecha(d) {
        if (!d) return '';
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        return String(d);
    }
    fmtPct(v) {
        const n = (typeof v === 'number') ? v : Number(v);
        if (n == null || Number.isNaN(n)) return null;
        return this.fmtNumber(n, 2) + '%';
    }
    toNum(v) {
        if (v == null || v === '') return null;
        if (typeof v === 'number') return v;
        const n = Number(v);
        return Number.isNaN(n) ? null : n;
    }

    get filasView() {
        const ocultarCuentas = this.desplegado === 'No';
        const from = this.mesFrom - 1;          // 0-based
        const to   = this.mesTo - 1;            // 0-based
        const mbo  = this.mboData;              // comparativo % Margen bruto Operaciones (total)
        const mboMes = this.mboMonthly;         // comparativo % por mes (solo fila Margen bruto Operaciones)
        return (this.rows || [])
            .filter(r => !(ocultarCuentas && r.tipo === 'CUENTA'))
            .map((r, idx) => {
                const showPct = !!r.mostrarPorcentaje && Array.isArray(r.porcentajes);
                const isAcum  = r.tipo === 'ACUMULADO';
                const esMBO   = (r.key === 'ST_Margen bruto Operaciones');

                // Slice de meses dentro del rango. Para ACUMULADO calculamos running dentro del rango.
                const meses = [];
                let running = 0;
                let filteredTotal = 0;
                let filteredTotal7 = 0;
                for (let i = from; i <= to; i++) {
                    const n = this.toNum((r.meses || [])[i]);
                    let displayN = n;
                    if (isAcum) {
                        running += (n == null ? 0 : n);
                        displayN = running;
                    } else {
                        if (n != null) filteredTotal += n;
                    }
                    const pctRaw = showPct ? this.toNum((r.porcentajes || [])[i]) : null;
                    if (showPct) {
                        const m7 = this.toNum((r.meses7 || [])[i]);
                        if (m7 != null) filteredTotal7 += m7;
                    }
                    const cm = (esMBO && mboMes) ? mboMes[i + 1] : null;
                    meses.push({
                        key: r.key + '_m' + i,
                        rowKey: r.key,
                        mesIdx: i + 1,
                        value: this.fmtCurrency(displayN),
                        cssClass: this.cellClass(displayN, r),
                        pct: pctRaw == null ? null : this.fmtPct(pctRaw),
                        showPct: showPct,
                        esMBO: esMBO,
                        pctBoth: cm ? cm.pctBoth : '',
                        deltaLabel: cm ? cm.deltaLabel : '',
                        deltaClass: cm ? cm.deltaClass : 'ana-mbo-delta'
                    });
                }

                // Total de la fila tras el filtro
                let totalNumDisplay;
                if (isAcum) {
                    totalNumDisplay = running;   // = acumulado del último mes del rango
                } else {
                    totalNumDisplay = filteredTotal;
                }
                // % total recalculado contra ingresos 7xx del rango filtrado
                let pctTotalFiltered = null;
                if (showPct && filteredTotal7 !== 0) {
                    pctTotalFiltered = (filteredTotal / filteredTotal7) * 100;
                }
                const total = {
                    key: r.key + '_total',
                    rowKey: r.key,
                    mesIdx: 0,
                    value: this.fmtCurrency(totalNumDisplay),
                    cssClass: this.cellClass(totalNumDisplay, r) + ' pyg-total-col',
                    pct: pctTotalFiltered == null ? null : this.fmtPct(pctTotalFiltered),
                    showPct: showPct,
                    esMBO: esMBO,
                    pctBoth: (esMBO && mbo) ? (mbo.pctActualLabel + ' & ' + mbo.prevPctLabel) : '',
                    deltaLabel: (esMBO && mbo) ? mbo.deltaLabel : '',
                    deltaClass: (esMBO && mbo) ? mbo.deltaClass : 'ana-mbo-delta'
                };
                return {
                    key: r.key || ('r'+idx),
                    tipo: r.tipo,
                    acumulado: !!r.acumulado,
                    showPct: showPct,
                    rowClass: this.rowClass(r),
                    conceptoClass: this.conceptoClass(r),
                    codigo: r.codigoCuenta,
                    cuentaId: r.cuentaId || null,
                    concepto: r.concepto,
                    meses,
                    total,
                    showCodigo: r.tipo === 'CUENTA' && !!r.codigoCuenta,
                    isAcumulado: isAcum
                };
            });
    }

    rowClass(r) {
        if (r.tipo === 'GRUPO') {
            return r.mostrarPorcentaje
                ? 'pyg-row pyg-grupo pyg-grupo-destacado'
                : 'pyg-row pyg-grupo';
        }
        if (r.tipo === 'SUBGRUPO')       return 'pyg-row pyg-subgrupo';
        if (r.tipo === 'SUBTOTAL')       return 'pyg-row pyg-subtotal';
        if (r.tipo === 'SIN_CLASIFICAR') return 'pyg-row pyg-sinclas';
        if (r.tipo === 'TOTAL')          return 'pyg-row pyg-total';
        if (r.tipo === 'ACUMULADO')      return 'pyg-row pyg-acumulado';
        if (r.nivel === 2) return 'pyg-row pyg-cuenta pyg-cuenta-nivel2';
        return 'pyg-row pyg-cuenta';
    }
    conceptoClass(r) {
        if (r.tipo === 'GRUPO') {
            return r.mostrarPorcentaje
                ? 'pyg-concepto pyg-concepto-grupo pyg-concepto-grupo-destacado'
                : 'pyg-concepto pyg-concepto-grupo';
        }
        if (r.tipo === 'SUBGRUPO')       return 'pyg-concepto pyg-concepto-subgrupo';
        if (r.tipo === 'SUBTOTAL')       return 'pyg-concepto pyg-concepto-subtotal';
        if (r.tipo === 'SIN_CLASIFICAR') return 'pyg-concepto pyg-concepto-sinclas';
        if (r.tipo === 'TOTAL')          return 'pyg-concepto pyg-concepto-total';
        if (r.tipo === 'ACUMULADO')      return 'pyg-concepto pyg-concepto-acumulado';
        if (r.nivel === 2) return 'pyg-concepto pyg-concepto-cuenta pyg-concepto-cuenta-nivel2';
        return 'pyg-concepto pyg-concepto-cuenta';
    }
    cellClass(v, r) {
        const clickable = r && r.tipo === 'CUENTA';
        const base = clickable ? 'pyg-cell pyg-clickable' : 'pyg-cell';
        const n = (typeof v === 'number') ? v : Number(v);
        if (n == null || Number.isNaN(n) || n === 0) return base + ' pyg-zero';
        if (n < 0)  return base + ' pyg-neg';
        return base + ' pyg-pos';
    }

    // ---------------------------------------------------------------
    handleAreaChange(e)      { this.area = e.detail.value; }
    handleEjercicioChange(e) { this.ejercicio = e.detail.value || null; }
    handleMesDesdeChange(e) {
        const v = e.detail.value || '1';
        this.mesDesde = v;
        if (Number(this.mesHasta) < Number(v)) this.mesHasta = v;
        if (this._cells && this._cells.length) this.buildAll();
    }
    handleMesHastaChange(e) {
        const v = e.detail.value || '12';
        this.mesHasta = v;
        if (Number(this.mesDesde) > Number(v)) this.mesDesde = v;
        if (this._cells && this._cells.length) this.buildAll();
    }
    handleDirectorChange(e) {
        this.directorFacturacionId = e.detail && e.detail.recordId ? e.detail.recordId : null;
    }
    setSimulacion(e)        { this.simulacion = e.currentTarget.dataset.value; this.handleRefresh(); }
    setExtraordinarios(e)   { this.extraordinarios = e.currentTarget.dataset.value; this.handleRefresh(); }
    setCheck(e)             { this.check = e.currentTarget.dataset.value; this.handleRefresh(); }
    setIncidencia(e)        { this.incidencia = e.currentTarget.dataset.value; this.handleRefresh(); }
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
    get despSiCls()   { return this.toggleCls(this.desplegado === 'Si'); }
    get despNoCls()   { return this.toggleCls(this.desplegado === 'No'); }
    toggleCls(active) { return active ? 'pyg-toggle pyg-toggle-active' : 'pyg-toggle'; }

    get esVistaFiscal() { return this.simulacion === 'Todas' && this.extraordinarios === 'No'; }
    get vistaLabel()    { return this.esVistaFiscal ? 'Fiscal' : 'Analítico'; }
    get vistaClass()    {
        return this.esVistaFiscal
            ? 'pyg-vista-badge pyg-vista-fiscal'
            : 'pyg-vista-badge pyg-vista-analitico';
    }

    handleGenerar() {
        const faltan = [];
        if (this.empresasTitulares.length === 0) faltan.push('empresa titular');
        if (this.ejercicio == null)              faltan.push('ejercicio');
        if (faltan.length) {
            this.error = faltan.length === 1
                ? `Debes seleccionar un ${faltan[0]}.`
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
            ejercicio: Number(this.ejercicio),
            simulacion: this.simulacion,
            extraordinarios: this.extraordinarios,
            check: this.check,
            incidencia: this.incidencia
        })
        .then(result => {
            this.rows = result || [];
            const y = Number(this.ejercicio);
            const mD = Number(this.mesDesde) || 1;
            const mH = Number(this.mesHasta) || 12;
            const pad = (n) => String(n).padStart(2, '0');
            const lastDay = new Date(y, mH, 0).getDate();
            this.avisosParams = {
                empresas: [...this.empresasTitulares],
                desde: `${y}-${pad(mD)}-01`,
                hasta: `${y}-${pad(mH)}-${pad(lastDay)}`
            };
            this.generated = true;
            this.cargarComparativo();
        })
        .catch(err => {
            this.error = this.reduceError(err);
            this.rows = [];
            this.generated = true;
        })
        .finally(() => { this.loading = false; });
    }
    handleRefresh() { if (this.generated) this.handleGenerar(); }

    // --- Carga de la matriz comparativa (director × área × mes × año) ---
    cargarComparativo() {
        getComparativoOperaciones({
            empresasTitulares: this.empresasTitulares,
            area: this.area || null,
            directorFacturacionId: this.directorFacturacionId,
            ejercicio: Number(this.ejercicio),
            simulacion: this.simulacion,
            extraordinarios: this.extraordinarios,
            check: this.check,
            incidencia: this.incidencia
        })
        .then(res => {
            this._cells = (res && res.celdas) ? res.celdas : [];
            this._ejActual = res ? res.ejercicioActual : null;
            this._ejAnterior = res ? res.ejercicioAnterior : null;
            this.drillMonth = null;
            this.selDirector = null;
            this.selArea = null;
            this.buildAll();
        })
        .catch(() => { this._cells = []; this.chartGroups = []; this.directorView = []; this.areaView = []; });
    }

    buildAll() {
        this.buildChart();
        this.buildDirectores(); this.buildAreas();
        this.buildVentasDirectores(); this.buildVentasAreas();
    }

    get hasChart()       { return this.generated && this.chartGroups && this.chartGroups.length > 0; }
    get hasDirectores()  { return this.generated && this.directorView && this.directorView.length > 0; }
    get hasAreas()       { return this.generated && this.areaView && this.areaView.length > 0; }
    get hasVentasChart()      { return this.generated && this.ventasGroups && this.ventasGroups.length > 0; }
    get hasVentasDirectores() { return this.generated && this.ventasDirectorView && this.ventasDirectorView.length > 0; }
    get hasVentasAreas()      { return this.generated && this.ventasAreaView && this.ventasAreaView.length > 0; }
    get ejActualLabel()   { return this._ejActual; }
    get ejAnteriorLabel() { return this._ejAnterior; }
    get filtroActivo()    { return this.drillMonth != null || this.selDirector != null || this.selArea != null; }
    get filtroLabel() {
        const MES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const p = [];
        if (this.drillMonth) p.push(MES[this.drillMonth - 1]);
        if (this.selDirector) p.push('Director: ' + this.selDirector);
        if (this.selArea) p.push('Área: ' + this.selArea);
        return p.join(' · ');
    }

    // Comparativo del % de Margen bruto Operaciones (actual vs año anterior) para la fila de la tabla.
    // Respeta el filtro de director/área y el rango de meses (no el drill de mes de los gráficos).
    get mboData() {
        if (!this._cells || !this._cells.length) return null;
        const cells = this._cells.filter(c =>
            (!this.selDirector || c.director === this.selDirector) &&
            (!this.selArea || c.area === this.selArea));
        let mA = 0, mP = 0, iA = 0, iP = 0;
        cells.forEach(c => {
            mA += this.aggMeses(c.mesesActual, false);
            mP += this.aggMeses(c.mesesAnterior, false);
            iA += this.aggMeses(c.ingActual, false);
            iP += this.aggMeses(c.ingAnterior, false);
        });
        const pctA = iA !== 0 ? (mA / Math.abs(iA)) * 100 : null;
        const pctP = iP !== 0 ? (mP / Math.abs(iP)) * 100 : null;
        const delta = (pctA != null && pctP != null) ? (pctA - pctP) : null;
        return {
            totalLabel: this.fmtCurrency(mA),
            pctActualLabel: pctA == null ? '—' : this.fmtPct(pctA),
            // pill del primer %: fondo verde si >= 40%, rojo si < 40% (texto en blanco)
            pctActualClass: pctA == null ? ''
                : (pctA >= 40 ? 'ana-ctx-pct ana-ctx-pct-good' : 'ana-ctx-pct ana-ctx-pct-bad'),
            prevPctLabel: pctP == null ? '—' : this.fmtPct(pctP),
            deltaLabel: delta == null ? '' : ((delta >= 0 ? '▲ ' : '▼ ') + this.fmtPct(Math.abs(delta))),
            deltaClass: delta == null ? 'ana-mbo-delta'
                : (delta >= 0 ? 'ana-mbo-delta ana-mbo-up' : 'ana-mbo-delta ana-mbo-down')
        };
    }

    // Resumen Ventas Operaciones (ingresos 7xx): total + crecimiento interanual
    get ventasData() {
        if (!this._cells || !this._cells.length) return null;
        const cells = this._cells.filter(c =>
            (!this.selDirector || c.director === this.selDirector) &&
            (!this.selArea || c.area === this.selArea));
        let vA = 0, vP = 0;
        cells.forEach(c => {
            vA += this.aggMeses(c.ingActual, false);
            vP += this.aggMeses(c.ingAnterior, false);
        });
        const crec = vP !== 0 ? ((vA - vP) / Math.abs(vP)) * 100 : null;
        return {
            totalLabel: this.fmtCurrency(vA),
            crecLabel: crec == null ? '—' : ((crec >= 0 ? '▲ ' : '▼ ') + this.fmtPct(Math.abs(crec))),
            crecClass: crec == null ? 'ana-mbo-delta'
                : (crec >= 0 ? 'ana-mbo-delta ana-mbo-up' : 'ana-mbo-delta ana-mbo-down')
        };
    }

    // Comparativo del % de Margen bruto Operaciones por MES (actual & anterior + diferencia)
    get mboMonthly() {
        const out = {};
        if (!this._cells || !this._cells.length) return out;
        const cells = this._cells.filter(c =>
            (!this.selDirector || c.director === this.selDirector) &&
            (!this.selArea || c.area === this.selArea));
        for (let m = 1; m <= 12; m++) {
            let mA = 0, mP = 0, iA = 0, iP = 0;
            cells.forEach(c => {
                mA += this.toNum(c.mesesActual[m - 1]);
                mP += this.toNum(c.mesesAnterior[m - 1]);
                iA += this.toNum(c.ingActual[m - 1]);
                iP += this.toNum(c.ingAnterior[m - 1]);
            });
            const pctA = iA !== 0 ? (mA / Math.abs(iA)) * 100 : null;
            const pctP = iP !== 0 ? (mP / Math.abs(iP)) * 100 : null;
            const delta = (pctA != null && pctP != null) ? (pctA - pctP) : null;
            out[m] = {
                pctBoth: (pctA == null ? '—' : this.fmtPct(pctA)) + ' & ' + (pctP == null ? '—' : this.fmtPct(pctP)),
                deltaLabel: delta == null ? '' : ((delta >= 0 ? '▲ ' : '▼ ') + this.fmtPct(Math.abs(delta))),
                deltaClass: delta == null ? 'ana-mbo-delta'
                    : (delta >= 0 ? 'ana-mbo-delta ana-mbo-up' : 'ana-mbo-delta ana-mbo-down')
            };
        }
        return out;
    }

    // ---- Suma de un array de meses según el rango / mes seleccionado ----
    aggMeses(arr, soloMes) {
        if (!arr) return 0;
        if (soloMes) return this.toNum(arr[this.drillMonth - 1]);
        let s = 0;
        for (let m = this.mesFrom; m <= this.mesTo; m++) s += this.toNum(arr[m - 1]);
        return s;
    }

    // ---- Gráficos mensuales (margen y ventas), año anterior IZQUIERDA · actual DERECHA ----
    buildChart() {
        const m = this.construirMensual('mesesActual', 'mesesAnterior');
        this.chartGroups = m.groups; this.chartGroupsBig = m.groupsBig;
        this.chartClass = m.clase; this.chartClassBig = m.claseBig; this.chartLegend = m.legend;
        const v = this.construirMensual('ingActual', 'ingAnterior');
        this.ventasGroups = v.groups; this.ventasGroupsBig = v.groupsBig;
        this.ventasClass = v.clase; this.ventasClassBig = v.claseBig; this.ventasLegend = v.legend;
    }

    construirMensual(campoA, campoP) {
        const cells = (this._cells || []).filter(c =>
            (!this.selDirector || c.director === this.selDirector) &&
            (!this.selArea || c.area === this.selArea));
        if (!cells.length) return { groups: [], groupsBig: [], legend: [], clase: 'ana-chart', claseBig: 'ana-chart ana-chart-big' };
        const MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        const COL_ACT = '#1b96ff', COL_ANT = '#c9a45c';
        const from = this.mesFrom, to = this.mesTo;

        const curr = [], prev = [];
        let maxAbs = 0, hasNeg = false;
        for (let mm = from; mm <= to; mm++) {
            let a = 0, b = 0;
            cells.forEach(c => { a += this.toNum(c[campoA][mm - 1]); b += this.toNum(c[campoP][mm - 1]); });
            curr.push(a); prev.push(b);
            maxAbs = Math.max(maxAbs, Math.abs(a), Math.abs(b));
            if (a < 0 || b < 0) hasNeg = true;
        }
        const H = hasNeg ? 80 : 150;
        const clase = hasNeg ? 'ana-chart' : 'ana-chart ana-chart-noneg';
        const claseBig = hasNeg ? 'ana-chart ana-chart-big' : 'ana-chart ana-chart-noneg-big';
        const construir = (Hloc) => {
            const mkBar = (val, color, year, mm, tag) => {
                const scale = maxAbs > 0 ? Math.sqrt(Math.abs(val) / maxAbs) : 0;
                let px = Math.round(scale * Hloc);
                if (val !== 0 && px < 6) px = 6;
                const pos = val >= 0;
                return {
                    key: `${tag}-${mm}`,
                    serie: tag,
                    posStyle: pos ? `height:${px}px;background:${color}` : 'height:0px',
                    negStyle: !pos ? `height:${px}px;background:${color}` : 'height:0px',
                    titleAttr: `${MES[mm - 1]} ${year}: ${this.fmtCurrency(val)}`
                };
            };
            const groups = [];
            for (let i = 0, mm = from; mm <= to; mm++, i++) {
                groups.push({
                    key: `g${mm}`, mes: mm, label: MES[mm - 1],
                    groupClass: (this.drillMonth === mm) ? 'ana-chart-group ana-chart-group-sel' : 'ana-chart-group',
                    bars: [
                        mkBar(prev[i], COL_ANT, this._ejAnterior, mm, 'b'),
                        mkBar(curr[i], COL_ACT, this._ejActual, mm, 'a')
                    ]
                });
            }
            return groups;
        };
        return {
            groups: construir(H),
            groupsBig: construir(hasNeg ? 150 : 300),
            clase, claseBig,
            legend: [
                { year: this._ejAnterior, swatchStyle: `background:${COL_ANT}` },
                { year: this._ejActual, swatchStyle: `background:${COL_ACT}` }
            ]
        };
    }

    // ---- Gráficos horizontales: margen (por director / área) ----
    buildDirectores() {
        const cells = (this._cells || []).filter(c => !this.selArea || c.area === this.selArea);
        this.directorView = this.buildHSerie(cells, 'director', this.selDirector, 'mesesActual', 'mesesAnterior', 'margen');
    }
    buildAreas() {
        const cells = (this._cells || []).filter(c => !this.selDirector || c.director === this.selDirector);
        this.areaView = this.buildHSerie(cells, 'area', this.selArea, 'mesesActual', 'mesesAnterior', 'margen');
    }
    // ---- Gráficos horizontales: ventas (por director / área) ----
    buildVentasDirectores() {
        const cells = (this._cells || []).filter(c => !this.selArea || c.area === this.selArea);
        this.ventasDirectorView = this.buildHSerie(cells, 'director', this.selDirector, 'ingActual', 'ingAnterior', 'ventas');
    }
    buildVentasAreas() {
        const cells = (this._cells || []).filter(c => !this.selDirector || c.director === this.selDirector);
        this.ventasAreaView = this.buildHSerie(cells, 'area', this.selArea, 'ingActual', 'ingAnterior', 'ventas');
    }

    buildHSerie(cells, campo, seleccionado, valA, valP, modo) {
        if (!cells || !cells.length) return [];
        const soloMes = this.drillMonth != null;
        const map = {};
        cells.forEach(c => {
            const k = c[campo] || (campo === 'director' ? 'Sin director' : 'Sin área');
            if (!map[k]) map[k] = { nombre: k, id: (campo === 'director' ? c.directorId : null), prev: 0, curr: 0, ingPrev: 0, ingCurr: 0 };
            map[k].curr += this.aggMeses(c[valA], soloMes);
            map[k].prev += this.aggMeses(c[valP], soloMes);
            map[k].ingCurr += this.aggMeses(c.ingActual, soloMes);
            map[k].ingPrev += this.aggMeses(c.ingAnterior, soloMes);
        });
        const rows = Object.keys(map).map(k => map[k]).filter(r => r.prev !== 0 || r.curr !== 0);
        let maxAbs = 0;
        rows.forEach(r => { maxAbs = Math.max(maxAbs, Math.abs(r.prev), Math.abs(r.curr)); });
        rows.sort((a, b) => b.curr - a.curr);
        const w = (v) => {
            if (maxAbs <= 0 || v === 0) return 0;
            let p = Math.sqrt(Math.abs(v) / maxAbs) * 100;   // raíz: realza los pequeños
            if (p < 4) p = 4;
            return p;
        };
        return rows.map((r, i) => {
            let prevPctLabel = '', currPctLabel = '', sube = null;
            let prevPctClass = 'ana-h-pct', currPctClass = 'ana-h-pct';
            if (modo === 'ventas') {
                // variación interanual de las ventas (actual vs anterior)
                const varPct = r.prev !== 0 ? ((r.curr - r.prev) / Math.abs(r.prev)) * 100 : null;
                currPctLabel = varPct == null ? '' : this.fmtPct(varPct);
                sube = (r.prev != null) ? (r.curr >= r.prev) : null;
            } else {
                // margen sobre ingresos de operaciones, por año
                const pctPrev = r.ingPrev !== 0 ? (r.prev / Math.abs(r.ingPrev)) * 100 : null;
                const pctCurr = r.ingCurr !== 0 ? (r.curr / Math.abs(r.ingCurr)) * 100 : null;
                prevPctLabel = pctPrev == null ? '' : this.fmtPct(pctPrev);
                currPctLabel = pctCurr == null ? '' : this.fmtPct(pctCurr);
                sube = (pctPrev != null && pctCurr != null) ? (pctCurr >= pctPrev) : null;
                // margen < 40% en rojo, >= 40% en verde
                if (pctPrev != null) prevPctClass = pctPrev < 40 ? 'ana-h-pct ana-pct-bad' : 'ana-h-pct ana-pct-good';
                if (pctCurr != null) currPctClass = pctCurr < 40 ? 'ana-h-pct ana-pct-bad' : 'ana-h-pct ana-pct-good';
            }
            const diff = r.curr - r.prev;
            const diffLabel = (diff > 0 ? '+' : '') + this.fmtCurrency(diff);
            return {
                key: 'h' + i,
                nombre: r.nombre,
                id: r.id,
                seleccionado: seleccionado === r.nombre,
                rowClass: seleccionado === r.nombre ? 'ana-h-row ana-h-row-sel' : 'ana-h-row',
                prevLabel: this.fmtCurrency(r.prev),
                currLabel: this.fmtCurrency(r.curr),
                prevPctLabel: prevPctLabel,
                currPctLabel: currPctLabel,
                prevPctClass: prevPctClass,
                currPctClass: currPctClass,
                diffLabel: diffLabel,
                trendArrow: sube == null ? '' : (sube ? '▲' : '▼'),
                trendClass: sube == null ? 'ana-h-trend' : (sube ? 'ana-h-trend ana-h-trend-up' : 'ana-h-trend ana-h-trend-down'),
                prevStyle: `width:${w(r.prev)}%`,
                currStyle: `width:${w(r.curr)}%`
            };
        });
    }

    // ---- Interacciones (clic cruzado) ----
    handleMesChartClick(e) {
        const m = Number(e.currentTarget.dataset.mes);
        if (!m) return;
        this.drillMonth = (this.drillMonth === m) ? null : m;
        this.buildAll();
    }
    handleDirectorClick(e) {
        const n = e.currentTarget.dataset.nombre;
        const id = e.currentTarget.dataset.id;
        if (!n) return;
        if (this.selDirector === n) { this.selDirector = null; this.selDirectorId = null; }
        else { this.selDirector = n; this.selDirectorId = id || null; }
        this.buildAll();
        this.recargarInforme();
    }
    handleAreaClick(e) {
        const n = e.currentTarget.dataset.nombre;
        if (!n) return;
        this.selArea = (this.selArea === n) ? null : n;
        this.buildAll();
        this.recargarInforme();
    }
    resetFiltros() {
        this.drillMonth = null; this.selDirector = null; this.selDirectorId = null; this.selArea = null;
        this.buildAll();
        this.recargarInforme();
    }
    openDirectorModal(e)  { if (e) e.stopPropagation(); this.showDirectorModal = true; }
    closeDirectorModal()  { this.showDirectorModal = false; }
    openAreaModal(e)      { if (e) e.stopPropagation(); this.showAreaModal = true; }
    closeAreaModal()      { this.showAreaModal = false; }
    openMensualModal(e)   { if (e) e.stopPropagation(); this.showMensualModal = true; }
    closeMensualModal()   { this.showMensualModal = false; }
    openVentasMensualModal(e)  { if (e) e.stopPropagation(); this.showVentasMensualModal = true; }
    closeVentasMensualModal()  { this.showVentasMensualModal = false; }
    openVentasDirectorModal(e) { if (e) e.stopPropagation(); this.showVentasDirectorModal = true; }
    closeVentasDirectorModal() { this.showVentasDirectorModal = false; }
    openVentasAreaModal(e)     { if (e) e.stopPropagation(); this.showVentasAreaModal = true; }
    closeVentasAreaModal()     { this.showVentasAreaModal = false; }

    // Recarga SOLO el informe (tabla) filtrado por el director/área seleccionado en los gráficos
    recargarInforme() {
        const effArea = (this.selArea && this.selArea !== 'Sin área') ? this.selArea : (this.area || null);
        const effDir = this.selDirectorId ? this.selDirectorId : (this.directorFacturacionId || null);
        generar({
            empresasTitulares: this.empresasTitulares,
            area: effArea,
            directorFacturacionId: effDir,
            ejercicio: Number(this.ejercicio),
            simulacion: this.simulacion,
            extraordinarios: this.extraordinarios,
            check: this.check,
            incidencia: this.incidencia
        })
        .then(result => { this.rows = result || []; })
        .catch(err => { this.error = this.reduceError(err); });
    }

    // ---------------------------------------------------------------
    //  MODAL
    // ---------------------------------------------------------------
    handleAmountClick(e) {
        const rowKey = e.currentTarget.dataset.rowkey;
        const mesIdx = Number(e.currentTarget.dataset.mes);
        const importe = e.currentTarget.dataset.value;
        const concepto = e.currentTarget.dataset.concepto;
        const row = this.rows.find(r => r.key === rowKey);
        if (!row || row.tipo !== 'CUENTA') return;
        if (!row.cuentaIds || !row.cuentaIds.length) return;

        this.modalTitulo = concepto || row.concepto || '';
        this.modalSubtitulo = mesIdx === 0
            ? `Total ejercicio ${this.ejercicio}`
            : `${MESES_LABEL[mesIdx-1]} ${this.ejercicio}`;
        this.modalImporte = importe;
        this.modalMovimientos = [];
        this.modalError = null;
        this.showModal = true;
        this.modalLoading = true;

        // Filtros efectivos: respeta el director/área seleccionado al pinchar un gráfico
        const effArea = (this.selArea && this.selArea !== 'Sin área') ? this.selArea : (this.area || null);
        const effDir = this.selDirectorId ? this.selDirectorId : (this.directorFacturacionId || null);
        getMovimientos({
            cuentaIds: row.cuentaIds,
            ejercicio: Number(this.ejercicio),
            mes: mesIdx === 0 ? null : mesIdx,
            mesInicio: mesIdx === 0 ? null : mesIdx,
            empresasTitulares: this.empresasTitulares,
            area: effArea,
            directorFacturacionId: effDir,
            simulacion: this.simulacion,
            extraordinarios: this.extraordinarios,
            check: this.check,
            incidencia: this.incidencia
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
        // areaOptions tiene { Todas, ...resto }. Excluimos la opción "Todas" y prependemos "— sin asignar —".
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

    get hasMovimientos()    { return !!(this.modalMovimientos && this.modalMovimientos.length); }
    get noMovimientos()     { return !this.modalLoading && !this.modalError && !this.hasMovimientos; }
    get modalContentReady() { return !this.modalLoading && !this.modalError && this.hasMovimientos; }

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
    // Limpiar: vuelve al estado inicial (filtros por defecto, sin resultados)
    handleLimpiar() {
        this.empresasTitulares = [];
        this.area = '';
        this.directorFacturacionId = null;
        this.simulacion = 'No';
        this.extraordinarios = 'Todas';
        this.check = 'Todos';
        this.incidencia = 'Todos';
        this.desplegado = 'Si';
        // Ejercicio y meses por defecto, igual que al entrar
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth() + 1;
        if (m === 1) { this.ejercicio = String(y - 1); this.mesDesde = '1'; this.mesHasta = '12'; }
        else         { this.ejercicio = String(y);     this.mesDesde = '1'; this.mesHasta = String(m - 1); }
        this.generated = false;
        this.loading = false;
        this.error = null;
        this.rows = [];
        this.avisosParams = null;
        // Gráficos y filtros cruzados
        this.chartGroups = []; this.chartLegend = [];
        this.directorView = []; this.areaView = [];
        this.ventasGroups = []; this.ventasLegend = [];
        this.ventasDirectorView = []; this.ventasAreaView = [];
        this.drillMonth = null; this.selDirector = null; this.selDirectorId = null; this.selArea = null;
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
            attributes: {
                recordId: recordId,
                objectApiName: objectApiName,
                actionName: 'view'
            }
        }).then(url => {
            // Cuenta contable: arrastra empresas titulares y el ejercicio como rango de fechas
            if (objectApiName === 'Plan_general_contable__c') {
                const params = [];
                if (this.empresasTitulares.length) {
                    params.push('c__empresas=' + encodeURIComponent(JSON.stringify(this.empresasTitulares)));
                }
                if (this.ejercicio) {
                    params.push('c__desde=' + encodeURIComponent(`${this.ejercicio}-01-01`));
                    params.push('c__hasta=' + encodeURIComponent(`${this.ejercicio}-12-31`));
                }
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