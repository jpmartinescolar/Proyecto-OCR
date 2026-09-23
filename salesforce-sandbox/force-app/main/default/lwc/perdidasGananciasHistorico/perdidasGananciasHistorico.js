import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getFilterOptions from '@salesforce/apex/PyGController.getFilterOptions';
import generarHistorico from '@salesforce/apex/PyGHistoricoController.generarHistorico';
import getMovimientos from '@salesforce/apex/PyGController.getMovimientos';
import updateMovimiento from '@salesforce/apex/PyGMensualController.updateMovimiento';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

const MESES = [
    { value: 1, label: 'Enero' },  { value: 2, label: 'Febrero' },   { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },  { value: 5, label: 'Mayo' },      { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },  { value: 8, label: 'Agosto' },    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' }, { value: 11, label: 'Noviembre' }, { value: 12, label: 'Diciembre' }
];
const NUM_ANIOS_OPCIONES = 12;   // años ofrecidos hacia atrás desde el actual

export default class PerdidasGananciasHistorico extends NavigationMixin(LightningElement) {

    @track empresasTitulares = [];
    @track area = '';
    @track directorFacturacionId = null;
    @track planPGC = 'PGC PYMES';

    @track ejercicios = [];          // años seleccionados
    @track meses = MESES.map(m => m.value);   // por defecto: todos los meses

    @track simulacion = 'Todas';
    @track extraordinarios = 'No';
    @track check = 'Todos';
    @track desplegado = 'No';

    @track loading = false;
    @track generated = false;
    @track error;
    @track rows = [];                // HistRow[]
    @track aniosResultado = [];      // años (columnas), congelado al generar
    @track mesesResultado = [];      // meses aplicados, congelado al generar
    @track expandedSecciones = [];
    @track balanceOficial = true;

    @track empresaOptionsBase = [];
    @track areaOptions = [];
    @track planOptions = [];

    @track showEmpresaDropdown = false;
    @track empresaFiltroBusqueda = '';
    @track showEjercicioDropdown = false;
    @track showMesDropdown = false;

    // Modal de detalle de movimientos
    @track showModal = false;
    @track modalLoading = false;
    @track modalError;
    @track modalTitulo = '';
    @track modalSubtitulo = '';
    @track modalMovimientos = [];

    connectedCallback() {
        const y = new Date().getFullYear();
        this.ejercicios = [y - 1, y];
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
    get showInicial() { return !this.generated && !this.loading && !this.hasError; }
    get textoInicial() {
        const f = [];
        if (this.empresasTitulares.length === 0) f.push('la(s) empresa(s) titular(es)');
        if (this.ejercicios.length === 0) f.push('los ejercicios');
        if (!f.length) return 'Pulsa';
        return 'Selecciona ' + f.join(' y ') + ' y pulsa';
    }

    get empresaLabel() {
        if (!this.empresasTitulares.length) return '—';
        if (this.empresasTitulares.length === 1) return this.empresasTitulares[0];
        return `${this.empresasTitulares.length} empresas seleccionadas`;
    }
    get ejerciciosLabel() {
        if (!this.ejercicios.length) return '—';
        return [...this.ejercicios].sort((a, b) => a - b).join(', ');
    }
    get mesesLabel() {
        if (!this.meses.length || this.meses.length === 12) return 'Todos';
        return MESES.filter(m => this.meses.includes(m.value)).map(m => m.label).join(', ');
    }

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

    // --- multi-select ejercicios ---
    get ejercicioOptions() {
        const y = new Date().getFullYear();
        const out = [];
        for (let i = 0; i < NUM_ANIOS_OPCIONES; i++) {
            const v = y - i;
            out.push({
                value: v, label: String(v),
                optionClass: this.ejercicios.includes(v)
                    ? 'pyg-ms-option pyg-ms-option-selected' : 'pyg-ms-option'
            });
        }
        return out;
    }
    get ejercicioTriggerLabel() {
        if (!this.ejercicios.length) return 'Selecciona ejercicios...';
        return this.ejerciciosLabel;
    }
    get ejercicioTriggerClass() {
        return this.ejercicios.length ? 'pyg-ms-trigger pyg-ms-trigger-filled' : 'pyg-ms-trigger';
    }
    get ejercicioDropdownClass() { return this.showEjercicioDropdown ? 'pyg-ms-wrap pyg-ms-wrap-open' : 'pyg-ms-wrap'; }
    toggleEjercicioDropdown(e) {
        e.stopPropagation();
        this.showEjercicioDropdown = !this.showEjercicioDropdown;
        this.showMesDropdown = false;
        this.showEmpresaDropdown = false;
    }
    closeEjercicioDropdown() { this.showEjercicioDropdown = false; }
    handleEjercicioToggle(e) {
        const val = Number(e.currentTarget.dataset.value);
        if (!val) return;
        const set = new Set(this.ejercicios);
        if (set.has(val)) set.delete(val); else set.add(val);
        this.ejercicios = Array.from(set);
    }
    handleEjercicioClearAll() { this.ejercicios = []; }

    // --- multi-select meses ---
    get mesOptions() {
        return MESES.map(m => ({
            ...m,
            optionClass: this.meses.includes(m.value)
                ? 'pyg-ms-option pyg-ms-option-selected' : 'pyg-ms-option'
        }));
    }
    get mesTriggerLabel() {
        if (!this.meses.length || this.meses.length === 12) return 'Todos los meses';
        if (this.meses.length === 1) return MESES.find(m => m.value === this.meses[0]).label;
        return `${this.meses.length} meses seleccionados`;
    }
    get mesTriggerClass() { return 'pyg-ms-trigger pyg-ms-trigger-filled'; }
    get mesDropdownClass() { return this.showMesDropdown ? 'pyg-ms-wrap pyg-ms-wrap-open' : 'pyg-ms-wrap'; }
    toggleMesDropdown(e) {
        e.stopPropagation();
        this.showMesDropdown = !this.showMesDropdown;
        this.showEjercicioDropdown = false;
        this.showEmpresaDropdown = false;
    }
    closeMesDropdown() { this.showMesDropdown = false; }
    handleMesToggle(e) {
        const val = Number(e.currentTarget.dataset.value);
        if (!val) return;
        const set = new Set(this.meses);
        if (set.has(val)) set.delete(val); else set.add(val);
        this.meses = Array.from(set);
    }
    handleMesSelectAll() { this.meses = MESES.map(m => m.value); }
    handleMesClearAll()  { this.meses = []; }

    // ---------------------------------------------------------------
    //  CABECERAS (una columna por año)
    // ---------------------------------------------------------------
    get aniosCabecera() {
        return (this.aniosResultado || []).map((y, i) => ({ key: 'y' + i, name: String(y), cls: 'lm-grp-emp' }));
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

        const columnas = [];
        const anios = r.anios || [];
        anios.forEach((cell, i) => {
            const v = this.toNum(cell ? cell.valor : null);
            columnas.push({
                key: (r.key || '') + '|' + this.aniosResultado[i],
                tdClass: this.cellClass(v, clickable),
                value: this.fmtCurrency(v),
                pct: esSubtotal ? this.fmtPct(this.toNum(cell ? cell.pct : null), false) : null,
                showPct: esSubtotal,
                anio: this.aniosResultado[i],
                rowkey: r.key,
                concepto: r.concepto
            });
        });

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
    //  GRÁFICOS (cifra de negocios y resultado del ejercicio por año)
    // ---------------------------------------------------------------
    get showCharts() { return this.hasRows && this.aniosResultado.length > 0; }

    get chartCifra()     { return this.buildChart('CN'); }
    get chartResultado() { return this.buildChart('A4', true); }

    // Barras horizontales: una fila por año, con el importe completo al final de la barra.
    // Con conCrecimiento, añade el % de crecimiento respecto al año anterior.
    buildChart(rowKey, conCrecimiento) {
        const row = (this.rows || []).find(r => r.key === rowKey);
        if (!row) return [];
        const valores = (this.aniosResultado || []).map((y, i) => ({
            anio: y,
            v: this.toNum(row.anios && row.anios[i] ? row.anios[i].valor : null) || 0
        }));
        let maxAbs = 0;
        valores.forEach(x => { maxAbs = Math.max(maxAbs, Math.abs(x.v)); });
        return valores.map((x, i) => {
            let pct = maxAbs > 0 ? (Math.abs(x.v) / maxAbs) * 100 : 0;
            if (x.v !== 0 && pct < 2) pct = 2;
            const color = x.v >= 0 ? '#1b96ff' : '#ba0517';
            let crecimiento = '';
            let crecClass = 'pyg-hchart-crec';
            let titleAttr = `${x.anio}: ${this.fmtCurrency(x.v)}`;
            if (conCrecimiento && i > 0) {
                const prev = valores[i - 1].v;
                if (prev !== 0) {
                    const pctCrec = ((x.v - prev) / Math.abs(prev)) * 100;
                    crecimiento = this.fmtPct(pctCrec, true);
                    crecClass += pctCrec >= 0 ? ' pyg-hchart-crec-pos' : ' pyg-hchart-crec-neg';
                    titleAttr += ` · ${crecimiento} vs ${valores[i - 1].anio}`;
                }
            }
            return {
                key: rowKey + x.anio,
                anio: x.anio,
                valorFmt: this.fmtNumber(x.v, 0) + ' €',
                barStyle: `width:${pct}%;background:${color}`,
                crecimiento,
                crecClass,
                titleAttr
            };
        });
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

    // Rango de fechas (desde/hasta) de un año según los meses seleccionados al generar
    rangoFechasAnio(anio) {
        const ms = (this.mesesResultado && this.mesesResultado.length ? this.mesesResultado : MESES.map(m => m.value))
            .slice().sort((a, b) => a - b);
        const m1 = ms[0], m2 = ms[ms.length - 1];
        const lastDay = new Date(anio, m2, 0).getDate();
        return {
            desde: `${anio}-${String(m1).padStart(2, '0')}-01`,
            hasta: `${anio}-${String(m2).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        };
    }

    // ---------------------------------------------------------------
    //  HANDLERS de filtros
    // ---------------------------------------------------------------
    handlePlanChange(e)     { this.planPGC = e.detail.value; }

    toggleBalanceOficial() {
        this.balanceOficial = !this.balanceOficial;
        if (this.balanceOficial) { this.simulacion = 'Todas'; this.extraordinarios = 'No'; }
        else { this.simulacion = 'No'; this.extraordinarios = 'Todas'; }
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
        this.showEjercicioDropdown = false;
        this.showMesDropdown = false;
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
        if (this.ejercicios.length === 0) faltan.push('al menos un ejercicio');
        if (faltan.length) {
            this.error = `Debes seleccionar ${faltan.join(' y ')} antes de generar.`;
            return;
        }
        this.error = null;
        this.loading = true;
        this.generated = false;
        generarHistorico({
            empresasTitulares: this.empresasTitulares,
            area: this.area || null,
            directorFacturacionId: this.directorFacturacionId,
            anios: this.ejercicios,
            meses: this.meses,
            planPGC: this.planPGC,
            simulacion: this.simulacion,
            extraordinarios: this.extraordinarios,
            check: this.check
        })
        .then(result => {
            this.rows = (result && result.rows) || [];
            this.aniosResultado = (result && result.anios) || [];
            this.mesesResultado = [...this.meses];
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
    handleRefresh() { if (this.generated) this.handleGenerar(); }

    // ---------------------------------------------------------------
    //  MODAL — al pinchar un importe de fila CUENTA
    // ---------------------------------------------------------------
    handleAmountClick(e) {
        const rowKey  = e.currentTarget.dataset.rowkey;
        const anio    = Number(e.currentTarget.dataset.anio);
        const concepto = e.currentTarget.dataset.concepto;
        const row = this.rows.find(r => r.key === rowKey);
        if (!row || row.tipo !== 'CUENTA') return;
        if (!row.cuentaIds || !row.cuentaIds.length) return;

        const rango = this.rangoFechasAnio(anio);

        this.modalTitulo = concepto || row.concepto || '';
        this.modalSubtitulo = `Ejercicio ${anio} · ${this.fmtFecha(rango.desde)} – ${this.fmtFecha(rango.hasta)}`;
        this.modalMovimientos = [];
        this.modalError = null;
        this.showModal = true;
        this.modalLoading = true;

        getMovimientos({
            cuentaIds: row.cuentaIds,
            desde: rango.desde,
            hasta: rango.hasta,
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
            // Cuenta contable: arrastra empresas titulares y el rango completo de años/meses
            if (objectApiName === 'Plan_general_contable__c') {
                const params = [];
                if (this.empresasTitulares.length) {
                    params.push('c__empresas=' + encodeURIComponent(JSON.stringify(this.empresasTitulares)));
                }
                const ys = (this.aniosResultado || []);
                if (ys.length) {
                    const d = this.rangoFechasAnio(ys[0]);
                    const h = this.rangoFechasAnio(ys[ys.length - 1]);
                    params.push('c__desde=' + encodeURIComponent(d.desde));
                    params.push('c__hasta=' + encodeURIComponent(h.hasta));
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