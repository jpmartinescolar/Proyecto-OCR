import { LightningElement, api, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getIncidencias from '@salesforce/apex/SumasSaldosController.getIncidencias';
import contarDescuadrados from '@salesforce/apex/SumasSaldosController.contarDescuadrados';
import getSinCuenta from '@salesforce/apex/SumasSaldosController.getSinCuenta';
import contarSinCheck from '@salesforce/apex/SumasSaldosController.contarSinCheck';
import contarExtractosPendientes from '@salesforce/apex/SumasSaldosController.contarExtractosPendientes';
import cuadreFacturas from '@salesforce/apex/SumasSaldosController.cuadreFacturas';
import cuadreRecibidas from '@salesforce/apex/SumasSaldosController.cuadreRecibidas';

/**
 * Barra reutilizable de avisos de cuadre contable.
 * Reúne los mismos chips/mensajes de "Sumas y Saldos" para usarlos en otros
 * componentes (PyG, PyG mensual, PyG analítico, PyG grupo, Libro Mayor).
 *
 * Uso:
 *   <c-avisos-cuadre params={avisosParams}></c-avisos-cuadre>
 * donde avisosParams = { empresas:[...], desde:'YYYY-MM-DD', hasta:'YYYY-MM-DD',
 *                        desdeComparativa, hastaComparativa }  (las comparativas son opcionales)
 *
 * El chip "Saldo cuentas & Saldo efectos" se delega en <c-aviso-saldo-efectos>.
 */
export default class AvisosCuadre extends NavigationMixin(LightningElement) {

    @track incidenciasCount = 0;
    @track incidenciasAsientos = [];
    @track descuadradosCount = 0;
    @track descuadradosAsientos = [];
    @track sinCuentaCount = 0;
    @track sinCuentaAsientos = [];
    @track checkSinCount = 0;
    @track extractosCount = 0;
    @track cuadreBase = 0;
    @track cuadreSaldo = 0;
    @track cuadreDif = 0;
    @track cuadreRecBase = 0;
    @track cuadreRecSaldo = 0;
    @track cuadreRecDif = 0;
    @track loaded = false;

    @track showInc = false;
    @track showDesc = false;
    @track showSin = false;
    @track showCheck = false;
    @track showExt = false;
    @track showCuadre = false;
    @track showCuadreRec = false;

    // --- entrada única (coalesce de varios filtros en un solo "load") ---
    _params = null;
    @api
    get params() { return this._params; }
    set params(val) {
        this._params = val || null;
        this.cargar();
    }

    get empresas() { return (this._params && this._params.empresas) || []; }
    get desde()    { return this._params ? this._params.desde : null; }
    get hasta()    { return this._params ? this._params.hasta : null; }
    get desdeComparativa() { return this._params ? this._params.desdeComparativa : null; }
    get hastaComparativa() { return this._params ? this._params.hastaComparativa : null; }
    get hayComparativa() { return !!(this.desdeComparativa && this.hastaComparativa); }

    // ---------------------------------------------------------------
    //  CARGA
    // ---------------------------------------------------------------
    cargar() {
        this.showInc = false; this.showDesc = false; this.showSin = false;
        this.showCheck = false; this.showExt = false; this.showCuadre = false; this.showCuadreRec = false;

        const empresas = this.empresas;
        if (!empresas.length) {
            this.incidenciasCount = 0; this.incidenciasAsientos = [];
            this.descuadradosCount = 0; this.descuadradosAsientos = [];
            this.sinCuentaCount = 0; this.sinCuentaAsientos = [];
            this.checkSinCount = 0;
            this.extractosCount = 0;
            this.cuadreBase = 0; this.cuadreSaldo = 0; this.cuadreDif = 0;
            this.cuadreRecBase = 0; this.cuadreRecSaldo = 0; this.cuadreRecDif = 0;
            this.loaded = false;
            return;
        }

        getIncidencias({ empresasTitulares: empresas })
            .then(res => {
                this.incidenciasCount = res ? res.total : 0;
                this.incidenciasAsientos = (res && res.asientos) ? res.asientos.map(a => ({ id: a.id, numero: a.numero })) : [];
            })
            .catch(() => { this.incidenciasCount = 0; this.incidenciasAsientos = []; });

        contarDescuadrados({ empresasTitulares: empresas })
            .then(res => {
                this.descuadradosCount = res ? res.total : 0;
                this.descuadradosAsientos = (res && res.asientos) ? res.asientos.map(a => ({ id: a.id, numero: a.numero })) : [];
            })
            .catch(() => { this.descuadradosCount = 0; this.descuadradosAsientos = []; });

        getSinCuenta({ empresasTitulares: empresas })
            .then(res => {
                this.sinCuentaCount = res ? res.total : 0;
                this.sinCuentaAsientos = (res && res.asientos) ? res.asientos.map(a => ({ id: a.id, numero: a.numero })) : [];
            })
            .catch(() => { this.sinCuentaCount = 0; this.sinCuentaAsientos = []; });

        contarSinCheck({ empresasTitulares: empresas })
            .then(n => { this.checkSinCount = n || 0; })
            .catch(() => { this.checkSinCount = 0; });

        // Extractos sin conciliar: rango principal (+ rango comparativo si procede)
        const peticiones = [contarExtractosPendientes({ empresasTitulares: empresas, desde: this.desde, hasta: this.hasta })];
        if (this.hayComparativa) {
            peticiones.push(contarExtractosPendientes({ empresasTitulares: empresas, desde: this.desdeComparativa, hasta: this.hastaComparativa }));
        }
        Promise.all(peticiones)
            .then(arr => { this.extractosCount = arr.reduce((s, n) => s + (n || 0), 0); })
            .catch(() => { this.extractosCount = 0; });

        cuadreFacturas({ empresasTitulares: empresas })
            .then(res => {
                this.cuadreBase = res ? res.baseImponible : 0;
                this.cuadreSaldo = res ? res.saldoCuentas : 0;
                this.cuadreDif = res ? res.diferencia : 0;
            })
            .catch(() => { this.cuadreBase = 0; this.cuadreSaldo = 0; this.cuadreDif = 0; });

        cuadreRecibidas({ empresasTitulares: empresas })
            .then(res => {
                this.cuadreRecBase = res ? res.baseImponible : 0;
                this.cuadreRecSaldo = res ? res.saldoCuentas : 0;
                this.cuadreRecDif = res ? res.diferencia : 0;
            })
            .catch(() => { this.cuadreRecBase = 0; this.cuadreRecSaldo = 0; this.cuadreRecDif = 0; });

        this.loaded = true;
    }

    // ---------------------------------------------------------------
    //  VISIBILIDAD
    // ---------------------------------------------------------------
    get showChips() { return this.loaded && this.empresas.length > 0; }
    get periodoLabel() { return `${this.fmtFecha(this.desde)} – ${this.fmtFecha(this.hasta)}`; }
    get periodoComparativaLabel() { return `${this.fmtFecha(this.desdeComparativa)} – ${this.fmtFecha(this.hastaComparativa)}`; }

    get hayIncidencias() { return this.incidenciasCount > 0 && this.showInc; }
    get hayDescuadrados() { return this.descuadradosCount > 0 && this.showDesc; }
    get haySinCuenta() { return this.sinCuentaCount > 0 && this.showSin; }
    get hayCheck() { return this.checkSinCount > 0 && this.showCheck; }
    get hayExtractos() { return this.extractosCount > 0 && this.showExt; }
    get hayDescuadreFacturas() { return !this.cuadraFacturas && this.showCuadre; }
    get hayDescuadreRecibidas() { return !this.cuadraRecibidas && this.showCuadreRec; }

    // ---------------------------------------------------------------
    //  CHIPS
    // ---------------------------------------------------------------
    get chipIncCls()  { return this.incidenciasCount > 0 ? 'ss-chip ss-chip-warn' : 'ss-chip ss-chip-ok'; }
    get chipDescCls() { return this.descuadradosCount > 0 ? 'ss-chip ss-chip-bad' : 'ss-chip ss-chip-ok'; }
    get chipSinCls()  { return this.sinCuentaCount > 0 ? 'ss-chip ss-chip-bad' : 'ss-chip ss-chip-ok'; }
    get chipCheckCls(){ return this.checkSinCount > 0 ? 'ss-chip ss-chip-warn' : 'ss-chip ss-chip-ok'; }
    get chipExtCls()  { return this.extractosCount > 0 ? 'ss-chip ss-chip-warn' : 'ss-chip ss-chip-ok'; }

    get cuadraFacturas() { return Math.abs(this.toNum(this.cuadreDif)) < 0.01; }
    get cuadreEstado()   { return this.cuadraFacturas ? 'Cuadre' : 'Descuadre'; }
    get cuadreBoxClass() { return this.cuadraFacturas ? 'ss-cuadre-ok' : 'ss-descuadrados'; }
    get cuadreIcon()     { return this.cuadraFacturas ? 'utility:check' : 'utility:warning'; }
    get cuadreVariant()  { return this.cuadraFacturas ? 'success' : 'error'; }
    get cuadreBaseFmt()  { return this.fmtCurrency(this.cuadreBase); }
    get cuadreSaldoFmt() { return this.fmtCurrency(this.cuadreSaldo); }
    get cuadreDifFmt()   { return this.fmtCurrency(this.cuadreDif); }
    get chipCuadreCls()  { return this.cuadraFacturas ? 'ss-chip ss-chip-ok' : 'ss-chip ss-chip-bad'; }
    get chipCuadreTxt()  { return this.cuadraFacturas ? 'OK' : this.cuadreDifFmt; }
    get chipCuadreBad()  { return !this.cuadraFacturas; }

    get cuadraRecibidas() { return Math.abs(this.toNum(this.cuadreRecDif)) < 0.01; }
    get cuadreRecBaseFmt()  { return this.fmtCurrency(this.cuadreRecBase); }
    get cuadreRecSaldoFmt() { return this.fmtCurrency(this.cuadreRecSaldo); }
    get cuadreRecDifFmt()   { return this.fmtCurrency(this.cuadreRecDif); }
    get chipCuadreRecCls()  { return this.cuadraRecibidas ? 'ss-chip ss-chip-ok' : 'ss-chip ss-chip-bad'; }
    get chipCuadreRecTxt()  { return this.cuadraRecibidas ? 'OK' : this.cuadreRecDifFmt; }
    get chipCuadreRecBad()  { return !this.cuadraRecibidas; }

    // ¿chip "rojo"? (muestra el ojo)
    get chipIncBad()  { return this.incidenciasCount > 0; }
    get chipDescBad() { return this.descuadradosCount > 0; }
    get chipSinBad()  { return this.sinCuentaCount > 0; }
    get chipCheckBad(){ return this.checkSinCount > 0; }
    get chipExtBad()  { return this.extractosCount > 0; }

    // ---------------------------------------------------------------
    //  TOGGLES / CERRAR
    // ---------------------------------------------------------------
    toggleInc()       { this.showInc = !this.showInc; }
    toggleDesc()      { this.showDesc = !this.showDesc; }
    toggleSin()       { this.showSin = !this.showSin; }
    toggleCheck()     { this.showCheck = !this.showCheck; }
    toggleExt()       { this.showExt = !this.showExt; }
    toggleCuadre()    { this.showCuadre = !this.showCuadre; }
    toggleCuadreRec() { this.showCuadreRec = !this.showCuadreRec; }
    cerrarInc()       { this.showInc = false; }
    cerrarDesc()      { this.showDesc = false; }
    cerrarSin()       { this.showSin = false; }
    cerrarCheck()     { this.showCheck = false; }
    cerrarExt()       { this.showExt = false; }
    cerrarCuadre()    { this.showCuadre = false; }
    cerrarCuadreRec() { this.showCuadreRec = false; }

    // ---------------------------------------------------------------
    //  NAVEGACIÓN A REGISTRO (ventana nueva)
    // ---------------------------------------------------------------
    navigateToRecordNewTab(e) {
        e.preventDefault();
        e.stopPropagation();
        const recordId = e.currentTarget.dataset.recordid;
        const objectApiName = e.currentTarget.dataset.objectname;
        if (!recordId || !objectApiName) return;
        this[NavigationMixin.GenerateUrl]({
            type: 'standard__recordPage',
            attributes: { recordId, objectApiName, actionName: 'view' }
        }).then(url => { window.open(url, '_blank'); });
    }

    // ---------------------------------------------------------------
    //  FORMATO
    // ---------------------------------------------------------------
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
    fmtFecha(d) {
        if (!d) return '';
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
        return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
    }
}