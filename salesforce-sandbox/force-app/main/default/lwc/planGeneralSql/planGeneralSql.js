import { LightningElement, track } from 'lwc';
import getEmpresas from '@salesforce/apex/PyGSqlController.getEmpresas';
import getCuentas from '@salesforce/apex/PlanGeneralSqlController.getCuentas';

/**
 * Plan General Contable de la contabilidad externa de Sage (SQL Server vía
 * Skyvia): la tabla completa del plan de la empresa — tenga saldo o no cada
 * cuenta — con título, CIF y código postal del cliente o proveedor asociado.
 * El plan puede superar las 16.000 cuentas: búsqueda en servidor y carga por
 * páginas encadenadas hasta mostrar todas las líneas, sin scroll interno.
 * Cada cuenta enlaza a su libro mayor.
 */
export default class PlanGeneralSql extends LightningElement {

    @track empresas = [];
    @track empresaSel = null;

    @track cuentas = [];
    @track cargado = false;
    @track loading = false;
    @track cargandoMas = false;
    @track error = null;
    @track busqueda = '';
    cuentasFin = false;
    _textoLista = '';
    _debounce = null;

    @track empresasCargando = true;

    connectedCallback() {
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

    get empresaMuestraBuscador() {
        return !!this.empresaSel && this.textoEmpresa === this._empresaLabelSel;
    }

    get empresasFiltradas() {
        let t = this.normalizar(this.textoEmpresa);
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
        this.busqueda = '';
        this.cargar('');
    }

    normalizar(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    }

    get sinEmpresa() { return !this.empresaSel; }

    // ===== Búsqueda y carga paginada =====
    handleBusqueda(e) {
        this.busqueda = e.detail.value;
        clearTimeout(this._debounce);
        this._debounce = setTimeout(() => { if (this.empresaSel) this.cargar(this.busqueda); }, 350);
    }
    handleRefresh() { if (this.empresaSel) this.cargar(this.busqueda); }

    // Primera página de la búsqueda; las siguientes se encadenan solas hasta
    // el final para que el plan completo quede a la vista. La serie descarta
    // respuestas atrasadas si entre medias cambia la empresa o la búsqueda.
    cargar(texto) {
        this._textoLista = texto || '';
        this.cuentasFin = false;
        this._serie = (this._serie || 0) + 1;
        const serie = this._serie;
        this.loading = true;
        this.error = null;
        getCuentas({ codigoEmpresa: Number(this.empresaSel), texto: this._textoLista, desdeCodigo: null })
            .then(res => {
                if (serie !== this._serie) return;
                this.cuentas = res || [];
                this.cuentasFin = this.cuentas.length < 500;
                this.cargado = true;
                this.loading = false;
                this.cargarMas();
            })
            .catch(err => {
                if (serie !== this._serie) return;
                this.error = this.reduceError(err);
                this.cuentas = [];
                this.loading = false;
            });
    }

    cargarMas() {
        if (this.cargandoMas || this.loading || this.cuentasFin || !this.cuentas.length) return;
        this.cargandoMas = true;
        const serie = this._serie;
        const desdeCodigo = this.cuentas[this.cuentas.length - 1].codigo;
        getCuentas({ codigoEmpresa: Number(this.empresaSel), texto: this._textoLista, desdeCodigo })
            .then(res => {
                if (serie !== this._serie) return;
                const vistos = new Set(this.cuentas.map(c => c.codigo));
                const nuevas = (res || []).filter(n => !vistos.has(n.codigo));
                this.cuentas = [...this.cuentas, ...nuevas];
                this.cuentasFin = (res || []).length < 500;
            })
            .catch(err => { if (serie === this._serie) this.error = this.reduceError(err); })
            .finally(() => {
                this.cargandoMas = false;
                if (serie === this._serie && !this.cuentasFin && !this.error) this.cargarMas();
            });
    }

    get showInicial() { return !this.cargado && !this.loading && !this.error; }
    get showContenido() { return this.cargado && !this.error; }
    get hayFilas() { return this.cuentas.length > 0; }
    get piePagina() {
        return this.fmtNumber(this.cuentas.length) + ' cuentas mostradas'
            + (this.cuentasFin ? '' : ' · cargando el resto…');
    }

    get filasView() {
        return this.cuentas.map((c, i) => ({
            ...c,
            key: c.codigo,
            idx: i + 1
        }));
    }

    // Abre el libro mayor de la cuenta pinchada con la misma empresa y el año en curso
    handleCuentaMayor(e) {
        const codigo = e.currentTarget.dataset.codigo;
        if (!codigo || !this.empresaSel) return;
        const y = new Date().getFullYear();
        this.dispatchEvent(new CustomEvent('abrirmayor', { detail: {
            codigoEmpresa: Number(this.empresaSel),
            codigoCuenta: codigo,
            fechaDesde: `${y}-01-01`,
            fechaHasta: `${y}-12-31`
        } }));
    }

    // ===== Utilidades =====
    fmtNumber(v) {
        const n = Number(v) || 0;
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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