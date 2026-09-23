import { LightningElement, track } from 'lwc';
import getEmpresas from '@salesforce/apex/PyGSqlController.getEmpresas';
import getSumasSaldos from '@salesforce/apex/SumasSaldosSqlController.getSumasSaldos';

/**
 * Sumas y Saldos sobre la contabilidad externa de Sage (SQL Server vía
 * Skyvia): todas las cuentas con movimientos de la empresa en el periodo,
 * con su título, sumas de Debe y Haber y saldo (Debe - Haber). El selector
 * de empresa es el mismo del Libro mayor y cada cuenta enlaza a su mayor.
 */
export default class SumasSaldosSql extends LightningElement {

    @track empresas = [];
    @track empresaSel = null;
    @track fechaDesde;
    @track fechaHasta;

    @track filas = [];
    @track cargado = false;
    @track loading = false;
    @track error = null;
    @track busqueda = '';
    // Solo líneas con saldo distinto de cero
    @track soloConSaldo = false;

    @track empresasCargando = true;

    connectedCallback() {
        const hoy = new Date();
        this.fechaDesde = hoy.getFullYear() + '-01-01';
        this.fechaHasta = hoy.getFullYear() + '-12-31';
        getEmpresas()
            .then(res => { this.empresas = res || []; })
            .catch(err => { this.error = this.reduceError(err); })
            .finally(() => { this.empresasCargando = false; });
    }

    // ===== Desplegable de empresa con búsqueda por nombre o número =====
    @track textoEmpresa = '';
    @track empresaAbierta = false;
    @track busquedaEmpresa = '';
    _empresaLabelSel = '';

    // El buscador interno solo aparece mientras el campo muestra la selección;
    // si se limpia con la X, el propio campo vuelve a ser el único buscador
    get empresaMuestraBuscador() {
        return !!this.empresaSel && this.textoEmpresa === this._empresaLabelSel;
    }

    get empresasFiltradas() {
        let t = this.normalizar(this.textoEmpresa);
        // Con la empresa ya elegida manda el buscador del desplegable
        if (this._empresaLabelSel && this.textoEmpresa === this._empresaLabelSel) {
            t = this.normalizar(this.busquedaEmpresa);
        }
        const res = [];
        for (const e of this.empresas) {
            if (t && !(String(e.codigo).startsWith(t) || this.normalizar(e.nombre).includes(t))) continue;
            res.push({ codigo: String(e.codigo), nombre: e.nombre });
            if (res.length >= 300) break;
        }
        return res;
    }
    get hayEmpresas() { return this.empresasFiltradas.length > 0; }
    get empresasVacias() { return !this.empresasCargando && !this.hayEmpresas; }

    handleEmpresaFocus() { this.busquedaEmpresa = ''; this.empresaAbierta = true; }
    handleTextoEmpresa(e) {
        this.textoEmpresa = e.detail.value;
        this.empresaAbierta = true;
    }
    handleBusquedaEmpresa(e) { this.busquedaEmpresa = e.target.value; }
    cerrarEmpresas() { this.empresaAbierta = false; }

    handleEmpresaClick(e) {
        const codigo = e.currentTarget.dataset.codigo;
        const emp = this.empresas.find(x => String(x.codigo) === codigo);
        this.empresaSel = codigo;
        this._empresaLabelSel = emp ? `${emp.nombre} (${emp.codigo})` : codigo;
        this.textoEmpresa = this._empresaLabelSel;
        this.busquedaEmpresa = '';
        this.empresaAbierta = false;
        this.cargar();
    }

    normalizar(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    }

    handleDesde(e) { this.fechaDesde = e.detail.value; if (this.empresaSel) this.cargar(); }
    handleHasta(e) { this.fechaHasta = e.detail.value; if (this.empresaSel) this.cargar(); }
    handleRefresh() { if (this.empresaSel) this.cargar(); }
    handleBusqueda(e) { this.busqueda = e.detail.value; }
    handleSoloConSaldo(e) { this.soloConSaldo = e.detail.checked; }

    // ===== Carga =====
    cargar() {
        if (!this.empresaSel || !this.fechaDesde || !this.fechaHasta) return;
        this.loading = true;
        this.error = null;
        getSumasSaldos({
            codigoEmpresa: Number(this.empresaSel),
            fechaDesde: this.fechaDesde,
            fechaHasta: this.fechaHasta
        })
            .then(res => { this.filas = res || []; this.cargado = true; })
            .catch(err => { this.error = this.reduceError(err); this.filas = []; })
            .finally(() => { this.loading = false; });
    }

    get sinEmpresa() { return !this.empresaSel; }
    get showInicial() { return !this.cargado && !this.loading && !this.error; }
    get showContenido() { return this.cargado && !this.loading && !this.error; }

    get filasFiltradas() {
        const t = this.normalizar(this.busqueda);
        let filas = this.filas;
        if (this.soloConSaldo) filas = filas.filter(c => Math.abs(Number(c.saldo) || 0) >= 0.005);
        if (!t) return filas;
        return filas.filter(c => String(c.codigo).startsWith(t)
            || this.normalizar(c.titulo).includes(t));
    }

    get filasView() {
        return this.filasFiltradas.map((c, i) => ({
            ...c,
            key: c.codigo,
            idx: i + 1,
            debeFmt: this.fmtImporte(c.debe),
            haberFmt: this.fmtImporte(c.haber),
            saldoFmt: this.fmtImporte(c.saldo),
            saldoCls: 'lms-num lms-saldo' + (c.saldo < 0 ? ' lms-neg' : '')
        }));
    }

    get hayFilas() { return this.filasFiltradas.length > 0; }

    get totales() {
        let debe = 0, haber = 0;
        this.filasFiltradas.forEach(c => {
            debe += Number(c.debe) || 0;
            haber += Number(c.haber) || 0;
        });
        const saldo = debe - haber;
        return {
            cuentas: this.filasFiltradas.length,
            debe: this.fmtImporte(debe),
            haber: this.fmtImporte(haber),
            saldo: this.fmtImporte(saldo),
            saldoCls: 'lms-num lms-saldo' + (saldo < 0 ? ' lms-neg' : '')
        };
    }

    // Abre el libro mayor de la cuenta pinchada con la misma empresa y fechas
    handleCuentaMayor(e) {
        const codigo = e.currentTarget.dataset.codigo;
        if (!codigo || !this.empresaSel) return;
        this.dispatchEvent(new CustomEvent('abrirmayor', { detail: {
            codigoEmpresa: Number(this.empresaSel),
            codigoCuenta: codigo,
            fechaDesde: this.fechaDesde,
            fechaHasta: this.fechaHasta
        } }));
    }

    // ===== Utilidades =====
    fmtImporte(v) {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(v) || 0);
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