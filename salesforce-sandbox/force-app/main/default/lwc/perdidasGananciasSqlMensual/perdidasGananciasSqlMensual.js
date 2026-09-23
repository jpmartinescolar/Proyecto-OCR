import { LightningElement, track } from 'lwc';
import getEmpresas from '@salesforce/apex/PyGSqlController.getEmpresas';
import generar from '@salesforce/apex/PyGSqlMensualController.generar';

const MESES_LABEL = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

/**
 * Pérdidas y Ganancias mensual sobre la contabilidad de Sage: el PyG de un
 * ejercicio concreto desglosado en 12 columnas de mes más el total anual.
 * Mismo selector de empresas y presentación que perdidasGananciasSql; el
 * interruptor Acumulado muestra cada mes con su importe o con el acumulado
 * desde enero.
 */
export default class PerdidasGananciasSqlMensual extends LightningElement {

    @track codigosEmpresa = [];
    @track empresaOptionsBase = [];
    @track showEmpresaDropdown = false;
    @track empresaFiltroBusqueda = '';
    @track empresaSoloSeleccionadas = false;
    @track cargandoEmpresas = false;

    @track ejercicio = String(new Date().getFullYear());
    @track desplegado = 'No';   // Si = mostrar cuentas; No = solo secciones/subtotales
    @track acumulado = 'Si';    // Si = cada mes acumula desde enero; No = importe del mes

    @track loading = false;
    @track generated = false;
    @track error;
    @track rows = [];
    @track expandedSecciones = [];

    connectedCallback() {
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

    // --- multi-select de empresas con buscador (mismo patrón que el PyG SQL) ---
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

    // --- ejercicio: desplegable con los últimos diez años ---
    get ejercicioOpciones() {
        const actual = new Date().getFullYear();
        const out = [];
        for (let y = actual; y >= actual - 10; y--) out.push({ label: String(y), value: String(y) });
        return out;
    }
    handleEjercicio(e) { this.ejercicio = e.detail.value; }

    // ---------------------------------------------------------------
    get hasError()    { return !!this.error; }
    get hasRows()     { return this.generated && this.rows && this.rows.length > 0; }
    get emptyState()  { return this.generated && (!this.rows || this.rows.length === 0); }
    get showInicial() { return !this.generated && !this.loading && !this.hasError; }
    get textoInicial() {
        if (!this.codigosEmpresa.length) return 'Selecciona la(s) empresa(s) y el ejercicio y pulsa';
        return 'Pulsa';
    }
    get currencySimbolo() { return 'EUR'; }

    get empresaLabel() {
        if (!this.codigosEmpresa.length) return '—';
        if (this.codigosEmpresa.length === 1) return this.nombreEmpresa(this.codigosEmpresa[0]);
        return `${this.codigosEmpresa.length} empresas seleccionadas`;
    }
    get empresaErrorClass() { return this.codigosEmpresa.length ? '' : 'pyg-required-empty'; }
    get mesesHeader() { return MESES_LABEL; }
    get acumuladoLabel() { return this.acumulado === 'Si' ? 'acumulado desde enero' : 'importe de cada mes'; }

    // ---------------------------------------------------------------
    //  FORMATO ESPAÑOL
    // ---------------------------------------------------------------
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
    fmtCurrency(v) {
        const n = (typeof v === 'number') ? v : Number(v);
        if (n == null || Number.isNaN(n)) return '0,00';
        return this.fmtNumber(n, 2);
    }

    // ---------------------------------------------------------------
    get filasView() {
        const ocultarCuentas = this.desplegado === 'No';
        const acumular = this.acumulado === 'Si';
        const expanded = this.expandedSecciones || [];
        const out = [];
        let curSec = null;
        (this.rows || []).forEach((r, idx) => {
            if (r.tipo === 'SECCION') curSec = r.key;
            if (ocultarCuentas && r.tipo === 'CUENTA' && !expanded.includes(curSec)) return;
            out.push(this.mapFila(r, idx, ocultarCuentas, expanded, acumular));
        });
        return out;
    }

    mapFila(r, idx, ocultarCuentas, expanded, acumular) {
        const esSeccion = r.tipo === 'SECCION';
        const expandable = esSeccion && ocultarCuentas;
        const isExpanded = expandable && expanded.includes(r.key);

        let conceptoClass = this.conceptoClass(r);
        if (expandable) {
            conceptoClass += ' pyg-seccion-click' + (isExpanded ? '' : ' pyg-seccion-colapsada');
        }

        let acumuladoMes = 0;
        const meses = (r.meses || []).map((v, m) => {
            const n = Number(v) || 0;
            acumuladoMes += n;
            const valor = acumular ? acumuladoMes : n;
            return {
                key: r.key + '_m' + m,
                valor: this.fmtCurrency(valor),
                cls: this.cellClass(valor) + ' pygm-td-mes'
            };
        });

        const total = Number(r.total) || 0;
        return {
            key: r.key || ('r' + idx),
            tipo: r.tipo,
            rowClass: this.rowClass(r),
            conceptoClass,
            seccionKey: esSeccion ? r.key : null,
            codigo: r.codigoCuenta,
            concepto: r.concepto,
            showCodigo: r.tipo === 'CUENTA' && !!r.codigoCuenta,
            meses,
            totalValue: this.fmtCurrency(total),
            totalClass: this.cellClass(total) + ' pygm-td-total'
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
    cellClass(v) {
        const base = 'pyg-cell';
        const n = (typeof v === 'number') ? v : Number(v);
        if (n == null || Number.isNaN(n) || n === 0) return base + ' pyg-zero';
        if (n < 0) return base + ' pyg-neg';
        return base + ' pyg-pos';
    }

    // ---------------------------------------------------------------
    //  TOGGLES Y HANDLERS
    // ---------------------------------------------------------------
    setDesplegado(e) { this.desplegado = e.currentTarget.dataset.value; }
    get despSiCls() { return this.toggleCls(this.desplegado === 'Si'); }
    get despNoCls() { return this.toggleCls(this.desplegado === 'No'); }
    setAcumulado(e) { this.acumulado = e.currentTarget.dataset.value; }
    get acumSiCls() { return this.toggleCls(this.acumulado === 'Si'); }
    get acumNoCls() { return this.toggleCls(this.acumulado === 'No'); }
    toggleCls(active) { return active ? 'pyg-toggle pyg-toggle-active' : 'pyg-toggle'; }

    handleGenerar() {
        if (!this.codigosEmpresa.length) {
            this.error = 'Debes seleccionar al menos una empresa.';
            return;
        }
        this.error = null;
        this.loading = true;
        this.generated = false;
        generar({
            codigosEmpresa: this.codigosEmpresa.map(c => Number(c)),
            anio: Number(this.ejercicio)
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
        this.cargarEmpresas();
        if (this.generated) this.handleGenerar();
    }

    handleLimpiar() {
        this.codigosEmpresa = [];
        this.empresaFiltroBusqueda = '';
        this.showEmpresaDropdown = false;
        this.ejercicio = String(new Date().getFullYear());
        this.desplegado = 'No';
        this.acumulado = 'Si';
        this.generated = false;
        this.loading = false;
        this.error = null;
        this.rows = [];
        this.expandedSecciones = [];
        this.cargarEmpresas();
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