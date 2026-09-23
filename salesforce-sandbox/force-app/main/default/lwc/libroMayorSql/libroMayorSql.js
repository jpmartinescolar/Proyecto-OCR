import { LightningElement, api, track } from 'lwc';
import getEmpresas from '@salesforce/apex/PyGSqlController.getEmpresas';
import buscarCuentas from '@salesforce/apex/LibroMayorSqlController.buscarCuentas';
import getMayor from '@salesforce/apex/LibroMayorSqlController.getMayor';
import getMayorNavegacion from '@salesforce/apex/LibroMayorSqlController.getMayorNavegacion';

/**
 * Libro mayor simplificado sobre la contabilidad externa de Sage:
 * empresa del SQL, búsqueda de cuenta por número o nombre y movimientos
 * con fecha, descripción, debe, haber y saldo acumulado.
 */
export default class LibroMayorSql extends LightningElement {

    @track empresas = [];
    @track empresaSel = null;
    @track fechaDesde;
    @track fechaHasta;
    @track textoCuenta = '';

    @track cuentas = [];
    @track buscandoCuentas = false;
    @track buscandoMas = false;
    @track cuentaAbierta = false;
    cuentasFin = false;
    _textoLista = '';

    @track mayor = null;
    @track loading = false;
    @track error = null;
    // Anterior/Siguiente solo recorren cuentas con movimientos en el periodo
    @track soloConMovs = false;

    _debounce = null;

    // Parámetros iniciales desde otro componente (PyG o Balance): abren el
    // mayor de una cuenta concreta con su empresa y su rango de fechas
    _paramsInicial = null;
    @api
    get params() { return this._paramsInicial; }
    set params(v) {
        this._paramsInicial = v;
        if (v && v.codigoCuenta && v.codigoEmpresa) this.abrirDesdeParams(v);
    }

    abrirDesdeParams(p) {
        if (p.fechaDesde) this.fechaDesde = p.fechaDesde;
        if (p.fechaHasta) this.fechaHasta = p.fechaHasta;
        this.empresaSel = String(p.codigoEmpresa);
        this.aplicarEtiquetaEmpresa();
        this.textoCuenta = p.codigoCuenta;
        this.mayor = null;
        this.cuentas = [];
        this.cuentaAbierta = false;
        this.empresaAbierta = false;
        this.buscar('');
        this.cargarMayor(p.codigoCuenta);
    }

    // Etiqueta del campo empresa; si la lista aún no ha llegado queda el
    // código y se completa al cargarse
    aplicarEtiquetaEmpresa() {
        if (!this.empresaSel) return;
        const emp = this.empresas.find(x => String(x.codigo) === String(this.empresaSel));
        this._empresaLabelSel = emp ? `${emp.nombre} (${emp.codigo})` : String(this.empresaSel);
        this.textoEmpresa = this._empresaLabelSel;
    }

    connectedCallback() {
        const hoy = new Date();
        if (!this.fechaDesde) this.fechaDesde = hoy.getFullYear() + '-01-01';
        if (!this.fechaHasta) this.fechaHasta = hoy.getFullYear() + '-12-31';
        getEmpresas()
            .then(res => {
                this.empresas = res || [];
                this.aplicarEtiquetaEmpresa();
            })
            .catch(err => { this.error = this.reduceError(err); })
            .finally(() => { this.empresasCargando = false; });
    }

    // ===== Desplegable de empresa con búsqueda por nombre o número =====
    @track empresasCargando = true;
    @track textoEmpresa = '';
    @track empresaAbierta = false;
    // Buscadores dentro del desplegable, para elegir otra empresa o cuenta
    // sin tener que borrar la selección del campo
    @track busquedaEmpresa = '';
    @track busquedaCuenta = '';
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
            res.push({ codigo: String(e.codigo), nombre: e.nombre, label: `${e.nombre} (${e.codigo})` });
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
        this.mayor = null;
        this.cuentas = [];
        this.textoCuenta = '';
        this.cuentaAbierta = false;
        // Se precargan las primeras cuentas con movimientos para abrir el desplegable al instante
        this.buscar('');
    }

    normalizar(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    }
    handleDesde(e) { this.fechaDesde = e.detail.value; this.refrescarMayor(); }
    handleHasta(e) { this.fechaHasta = e.detail.value; this.refrescarMayor(); }

    // Con un mayor en pantalla, cambiar el periodo lo recarga al momento
    // (recalculando también posición y vecinas, que dependen de las fechas)
    refrescarMayor() {
        if (this.mayor && this.empresaSel && this.fechaDesde && this.fechaHasta) {
            this.cargarMayor(this.mayor.codigoCuenta);
        }
    }

    get sinEmpresa() { return !this.empresaSel; }

    // ===== Desplegable de cuenta contable con búsqueda integrada =====
    // Igual que en empresa: buscador interno solo mientras el campo muestra
    // la cuenta cargada; con la X el campo vuelve a buscar directamente
    get cuentaMuestraBuscador() {
        return !!this.mayor && this.textoCuenta === this.cabecera;
    }

    handleCuentaFocus() {
        if (!this.empresaSel) return;
        this.cuentaAbierta = true;
        this.busquedaCuenta = '';
        if (this.cuentaMuestraBuscador) {
            // Con una cuenta ya cargada, el desplegable vuelve a la lista
            // completa y se busca desde su buscador interno
            if (this._textoLista || !this.cuentas.length) this.buscar('');
        } else if (!this.cuentas.length) {
            this.buscar(this.textoCuenta);
        }
    }

    handleTextoCuenta(e) {
        this.textoCuenta = e.detail.value;
        this.cuentaAbierta = true;
        clearTimeout(this._debounce);
        this._debounce = setTimeout(() => { this.buscar(this.textoCuenta); }, 350);
    }

    handleBusquedaCuenta(e) {
        this.busquedaCuenta = e.target.value;
        clearTimeout(this._debounce);
        this._debounce = setTimeout(() => { this.buscar(this.busquedaCuenta); }, 350);
    }

    cerrarCuentas() { this.cuentaAbierta = false; }

    // Primera página de la búsqueda (200 cuentas); el scroll pide las siguientes
    buscar(texto) {
        if (!this.empresaSel) return;
        this._textoLista = texto || '';
        this.cuentasFin = false;
        this.buscandoCuentas = true;
        this.error = null;
        buscarCuentas({ codigoEmpresa: Number(this.empresaSel), texto, desdeCodigo: null })
            .then(res => {
                this.cuentas = res || [];
                this.cuentasFin = this.cuentas.length < 200;
            })
            .catch(err => { this.error = this.reduceError(err); })
            .finally(() => { this.buscandoCuentas = false; });
    }

    // Al acercarse al final de la lista se carga la página siguiente
    handleCuentasScroll(e) {
        const el = e.currentTarget;
        if (el.scrollTop + el.clientHeight < el.scrollHeight - 60) return;
        this.cargarMasCuentas();
    }

    cargarMasCuentas() {
        if (this.buscandoMas || this.buscandoCuentas || this.cuentasFin || !this.cuentas.length) return;
        this.buscandoMas = true;
        const desdeCodigo = this.cuentas[this.cuentas.length - 1].codigo;
        buscarCuentas({ codigoEmpresa: Number(this.empresaSel), texto: this._textoLista, desdeCodigo })
            .then(res => {
                const nuevas = (res || []).filter(n => !this.cuentas.some(c => c.codigo === n.codigo));
                this.cuentas = [...this.cuentas, ...nuevas];
                this.cuentasFin = (res || []).length < 200;
            })
            .catch(err => { this.error = this.reduceError(err); })
            .finally(() => { this.buscandoMas = false; });
    }

    get hayCuentas() { return this.cuentas.length > 0; }
    get sinResultados() { return !this.buscandoCuentas && !this.cuentas.length; }

    handleCuentaClick(e) {
        const codigo = e.currentTarget.dataset.codigo;
        const cta = this.cuentas.find(c => c.codigo === codigo);
        this.textoCuenta = cta ? codigo + ' · ' + cta.titulo : codigo;
        this.busquedaCuenta = '';
        this.cuentaAbierta = false;
        this.cargarMayor(codigo);
    }

    handleSoloConMovs(e) {
        this.soloConMovs = e.detail.checked;
        // Con un mayor en pantalla se recarga para recalcular vecinas y posición
        if (this.mayor) this.cargarMayor(this.mayor.codigoCuenta);
    }

    // ===== Libro mayor =====
    cargarMayor(codigoCuenta, posicion = null) {
        this.loading = true;
        this.error = null;
        const params = {
            codigoEmpresa: Number(this.empresaSel),
            codigoCuenta,
            fechaDesde: this.fechaDesde,
            fechaHasta: this.fechaHasta,
            soloConMovimientos: this.soloConMovs
        };
        const peticion = posicion === null
            ? getMayor(params)
            : getMayorNavegacion({
                ...params,
                posicion,
                totalCuentas: this.mayor.totalCuentas
            });
        peticion
            .then(res => {
                this.mayor = res;
                // El campo de cuenta refleja la cuenta cargada (también al navegar con Anterior/Siguiente)
                this.textoCuenta = res.codigoCuenta + (res.titulo ? ' · ' + res.titulo : '');
            })
            .catch(err => { this.error = this.reduceError(err); })
            .finally(() => { this.loading = false; });
    }

    handleAnterior() {
        if (this.mayor && this.mayor.cuentaAnterior) {
            this.cargarMayor(this.mayor.cuentaAnterior, this.mayor.posicion - 1);
        }
    }
    handleSiguiente() {
        if (this.mayor && this.mayor.cuentaSiguiente) {
            this.cargarMayor(this.mayor.cuentaSiguiente, this.mayor.posicion + 1);
        }
    }

    // Exporta a PDF el mayor en pantalla (misma línea que el PyG y el Balance)
    handleExportPdf() {
        if (!this.mayor || !this.empresaSel) return;
        const p = new URLSearchParams();
        p.append('e', String(this.empresaSel));
        // Nombre sin el código entre paréntesis: en el PDF solo va la razón social
        p.append('en', (this._empresaLabelSel || String(this.empresaSel)).replace(/\s*\(\d+\)\s*$/, ''));
        p.append('c', this.mayor.codigoCuenta);
        p.append('d1', this.fechaDesde);
        p.append('d2', this.fechaHasta);
        window.open('/apex/LibroMayorSqlExportPDF?' + p.toString(), '_blank');
    }

    get sinAnterior() { return this.loading || !(this.mayor && this.mayor.cuentaAnterior); }
    get sinSiguiente() { return this.loading || !(this.mayor && this.mayor.cuentaSiguiente); }
    get hayMayor() { return !!this.mayor; }
    // El spinner a bloque solo aparece la primera vez; al navegar sale una
    // ruleta pequeña junto al botón Anterior
    get cargandoInicial() { return this.loading && !this.mayor; }
    get cargandoNavegacion() { return this.loading && !!this.mayor; }

    get filas() {
        if (!this.mayor) return [];
        // El saldo arranca de cero: el asiento de apertura ya trae el del ejercicio
        let saldo = 0;
        return (this.mayor.movimientos || []).map((m, i) => {
            saldo += (Number(m.debe) || 0) - (Number(m.haber) || 0);
            return {
                key: 'm' + i,
                idx: i + 1,
                fecha: this.fmtFecha(m.fecha),
                descripcion: m.descripcion,
                debe: this.fmtImporte(m.debe),
                haber: this.fmtImporte(m.haber),
                saldo: this.fmtImporte(saldo),
                saldoCls: 'lms-num lms-saldo' + (saldo < 0 ? ' lms-neg' : '')
            };
        });
    }

    get hayMovs() { return this.filas.length > 0; }
    get numMovs() { return (this.mayor && this.mayor.movimientos) ? this.mayor.movimientos.length : 0; }

    get totales() {
        let debe = 0, haber = 0;
        (this.mayor ? this.mayor.movimientos : []).forEach(m => {
            debe += Number(m.debe) || 0;
            haber += Number(m.haber) || 0;
        });
        const saldo = debe - haber;
        return {
            debe: this.fmtImporte(debe),
            haber: this.fmtImporte(haber),
            saldo: this.fmtImporte(saldo),
            saldoCls: 'lms-num lms-saldo' + (saldo < 0 ? ' lms-neg' : '')
        };
    }

    get cabecera() {
        if (!this.mayor) return '';
        return this.mayor.codigoCuenta + (this.mayor.titulo ? ' · ' + this.mayor.titulo : '');
    }

    get piePagina() {
        if (!this.mayor) return '';
        const ejercicio = String(this.fechaDesde || '').substring(0, 4);
        return 'Cuenta ' + (this.mayor.posicion || 0) + ' de ' + (this.mayor.totalCuentas || 0)
            + (ejercicio ? ' · Ejercicio ' + ejercicio : '');
    }

    // ===== Utilidades =====
    fmtImporte(v) {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(v) || 0);
    }
    fmtFecha(iso) {
        if (!iso) return '';
        const [y, m, d] = String(iso).split('-').map(Number);
        return `${d}/${m}/${y}`;
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