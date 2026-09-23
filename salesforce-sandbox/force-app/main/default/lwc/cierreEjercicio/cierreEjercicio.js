import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getFilterOptions from '@salesforce/apex/PyGController.getFilterOptions';
import analizar from '@salesforce/apex/CierreEjercicioController.analizar';
import ejecutar from '@salesforce/apex/CierreEjercicioController.ejecutar';
import getHistorico from '@salesforce/apex/CierreEjercicioController.getHistorico';
import getExclusiones from '@salesforce/apex/CierreEjercicioController.getExclusiones';
import guardarExclusiones from '@salesforce/apex/CierreEjercicioController.guardarExclusiones';

/**
 * Asistente de Cierre de ejercicio:
 *  1) Selección de empresa y ejercicio  →  2) Análisis (bloqueos, avisos y
 *  vista previa de los 3 asientos)  →  3) Confirmación y creación.
 */
export default class CierreEjercicio extends NavigationMixin(LightningElement) {

    @track empresa = '';
    @track ejercicio;
    @track empresaOptions = [];

    @track loading = false;
    @track analisis = null;          // resultado crudo de analizar()
    @track asientosPreview = [];     // [{key, titulo, fechaFmt, numLineas, totalDebe, totalHaber, lineas, expanded}]
    @track bloqueos = [];
    @track error;

    @track showConfirm = false;
    @track ejecutando = false;
    @track resultado = null;         // {regId, regName, cierreId, ...}

    // Histórico de cierres realizados
    @track historico = [];
    @track historicoLoading = false;

    connectedCallback() {
        // Lo habitual es cerrar el ejercicio anterior
        this.ejercicio = new Date().getFullYear() - 1;
        this.cargarHistorico();
    }

    cargarHistorico() {
        this.historicoLoading = true;
        getHistorico()
            .then(res => {
                this.historico = (res || []).map((h, i) => {
                    const estados = {
                        COMPLETO:   { txt: 'Completo',   cls: 'ce-hist-estado ce-hist-ok' },
                        INCOMPLETO: { txt: 'Incompleto', cls: 'ce-hist-estado ce-hist-warn' },
                        PENDIENTE:  { txt: 'Pendiente',  cls: 'ce-hist-estado ce-hist-pend' }
                    };
                    const e = estados[h.estado] || estados.PENDIENTE;
                    return {
                        key: 'h' + i,
                        empresa: h.empresa,
                        ejercicio: h.ejercicio,
                        aperturaEjercicio: h.ejercicio + 1,
                        regId: h.regId,           regName: h.regName,
                        cierreId: h.cierreId,     cierreName: h.cierreName,
                        aperturaId: h.aperturaId, aperturaName: h.aperturaName,
                        hayReg: !!h.regId,
                        hayCierre: !!h.cierreId,
                        hayApertura: !!h.aperturaId,
                        creado: h.creado ? this.fmtFecha(h.creado) : '—',
                        estadoTxt: e.txt,
                        estadoCls: e.cls,
                        puedeCerrar: h.estado !== 'COMPLETO',
                        accionLabel: h.estado === 'PENDIENTE' ? 'Cerrar ejercicio' : 'Revisar'
                    };
                });
            })
            .catch(() => { this.historico = []; })
            .finally(() => { this.historicoLoading = false; });
    }
    get hayHistorico() { return this.historico.length > 0; }
    get sinHistorico() { return !this.historicoLoading && this.historico.length === 0; }

    // Botón de la fila del histórico: precarga empresa + ejercicio y lanza el análisis
    // (nunca ejecuta directamente: siempre se pasa por la revisión y la confirmación)
    handleCerrarDesdeHistorico(e) {
        this.empresa = e.currentTarget.dataset.empresa;
        this.ejercicio = parseInt(e.currentTarget.dataset.ejercicio, 10);
        this.resultado = null;
        this.handleAnalizar();
        const top = this.template.querySelector('.ce-header');
        if (top && top.scrollIntoView) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // --- Exclusión permanente de empresas del histórico (config. personalizada) ---
    @track showExclusiones = false;
    @track exclusionesPend = [];   // selección en edición

    abrirExclusiones() {
        getExclusiones()
            .then(res => {
                this.exclusionesPend = res || [];
                this.showExclusiones = true;
            })
            .catch(err => { this.error = this.reduceError(err); });
    }
    cerrarExclusiones() { this.showExclusiones = false; }
    get exclusionOptions() {
        return (this.empresaOptions || []).map(o => ({
            value: o.value,
            excluida: this.exclusionesPend.includes(o.value)
        }));
    }
    toggleExclusion(e) {
        const val = e.currentTarget.dataset.value;
        const set = new Set(this.exclusionesPend);
        if (set.has(val)) set.delete(val); else set.add(val);
        this.exclusionesPend = Array.from(set);
    }
    guardarExclusionesClick() {
        guardarExclusiones({ empresas: this.exclusionesPend })
            .then(() => { this.showExclusiones = false; this.cargarHistorico(); })
            .catch(err => { this.error = this.reduceError(err); });
    }

    @wire(getFilterOptions)
    wiredOpts({ data, error }) {
        if (data) {
            this.empresaOptions = (data.empresasTitulares || []).map(v => ({ label: v, value: v }));
        } else if (error) {
            this.error = this.reduceError(error);
        }
    }

    // ---------------------------------------------------------------- getters
    get hasError()        { return !!this.error; }
    get hayAnalisis()     { return !!this.analisis && !this.resultado; }
    get hayBloqueos()     { return this.bloqueos.length > 0; }
    get hayErrorPlan()    { return !!(this.analisis && this.analisis.error); }
    get errorPlan()       { return this.analisis ? this.analisis.error : ''; }
    get hayAvisos()       { return this.analisis && (this.analisis.descuadrados > 0 || this.analisis.sinCuenta > 0); }
    get avisoDescuadrados(){ return this.analisis ? this.analisis.descuadrados : 0; }
    get avisoSinCuenta()  { return this.analisis ? this.analisis.sinCuenta : 0; }
    get hayDescuadrados() { return this.analisis && this.analisis.descuadrados > 0; }
    get haySinCuenta()    { return this.analisis && this.analisis.sinCuenta > 0; }
    get hayArrastre()     { return this.analisis && this.toNum(this.analisis.arrastre67) !== 0; }
    get arrastreFmt()     { return this.analisis ? this.fmtCurrency(Math.abs(this.toNum(this.analisis.arrastre67))) : ''; }
    get resultadoFmt() {
        if (!this.analisis) return '';
        return this.fmtCurrency(this.analisis.resultadoEjercicio);
    }
    get esBeneficio()     { return this.analisis && this.toNum(this.analisis.resultadoEjercicio) >= 0; }
    get resultadoLabel()  { return this.esBeneficio ? 'Beneficio' : 'Pérdida'; }
    get resultadoBoxCls() { return this.esBeneficio ? 'ce-resultado ce-resultado-pos' : 'ce-resultado ce-resultado-neg'; }
    get sinMovimientos() {
        if (!this.analisis || this.analisis.error) return false;
        const r = this.analisis.regularizacion, c = this.analisis.cierre;
        return (!r || !r.lineas.length) && (!c || !c.lineas.length);
    }
    get puedeEjecutar() {
        return this.hayAnalisis && !this.hayBloqueos && !this.hayErrorPlan && !this.sinMovimientos && !this.loading;
    }
    get ejecutarDisabled() { return !this.puedeEjecutar; }
    get ejercicioSiguiente() { return (parseInt(this.ejercicio, 10) || 0) + 1; }
    get confirmTexto() {
        const n = this.asientosPreview.reduce((t, a) => t + a.numLineas, 0);
        return `Vas a crear 3 asientos contables (${n} apuntes en total) para ${this.empresa}: ` +
               `regularización y cierre a 31/12/${this.ejercicio}, y apertura a 01/01/${this.ejercicioSiguiente}. ` +
               `Esta acción no se puede deshacer desde aquí.`;
    }
    get resultadoLinks() {
        if (!this.resultado) return [];
        return [
            { key: 'reg', label: 'Asiento Reg. Cierre',  name: this.resultado.regName,      id: this.resultado.regId },
            { key: 'cie', label: 'Asiento de cierre',    name: this.resultado.cierreName,   id: this.resultado.cierreId },
            { key: 'ape', label: 'Asiento de apertura',  name: this.resultado.aperturaName, id: this.resultado.aperturaId }
        ];
    }

    // ---------------------------------------------------------------- handlers
    handleEmpresaChange(e)   { this.empresa = e.detail.value; this.analisis = null; this.resultado = null; }
    handleEjercicioChange(e) { this.ejercicio = e.detail.value; this.analisis = null; this.resultado = null; }

    handleAnalizar() {
        if (!this.empresa) { this.error = 'Debes seleccionar la empresa titular.'; return; }
        if (!this.ejercicio) { this.error = 'Debes indicar el ejercicio.'; return; }
        this.error = null;
        this.resultado = null;
        this.loading = true;
        analizar({ empresaTitular: this.empresa, ejercicio: parseInt(this.ejercicio, 10) })
            .then(res => {
                this.analisis = res;
                this.bloqueos = (res.bloqueos || []).map((b, i) => ({
                    key: 'b' + i,
                    tipo: b.tipo,
                    asientoId: b.asientoId,
                    asientoName: b.asientoName,
                    fecha: this.fmtFecha(b.fecha)
                }));
                this.asientosPreview = [
                    this.mapPreview('reg', res.regularizacion),
                    this.mapPreview('cie', res.cierre),
                    this.mapPreview('ape', res.apertura)
                ];
            })
            .catch(err => { this.error = this.reduceError(err); this.analisis = null; })
            .finally(() => { this.loading = false; });
    }

    mapPreview(key, p) {
        const lineas = (p && p.lineas ? p.lineas : []).map((l, i) => ({
            key: key + 'l' + i,
            numero: l.numero,
            titulo: l.titulo,
            debe: this.fmtDH(l.debe),
            haber: this.fmtDH(l.haber)
        }));
        return {
            key,
            titulo: p ? p.tipo : '',
            fechaFmt: p ? this.fmtFecha(p.fecha) : '',
            numLineas: lineas.length,
            totalDebe: this.fmtCurrency(p ? p.totalDebe : 0),
            totalHaber: this.fmtCurrency(p ? p.totalHaber : 0),
            lineas,
            expanded: false,
            hayLineas: lineas.length > 0,
            toggleLabel: 'Ver apuntes'
        };
    }

    togglePreview(e) {
        const key = e.currentTarget.dataset.key;
        this.asientosPreview = this.asientosPreview.map(a =>
            a.key === key
                ? { ...a, expanded: !a.expanded, toggleLabel: a.expanded ? 'Ver apuntes' : 'Ocultar apuntes' }
                : a
        );
    }

    abrirConfirm()  { if (this.puedeEjecutar) this.showConfirm = true; }
    cerrarConfirm() { this.showConfirm = false; }

    confirmarEjecutar() {
        this.showConfirm = false;
        this.ejecutando = true;
        this.error = null;
        ejecutar({ empresaTitular: this.empresa, ejercicio: parseInt(this.ejercicio, 10) })
            .then(res => { this.resultado = res; this.analisis = null; this.cargarHistorico(); })
            .catch(err => { this.error = this.reduceError(err); })
            .finally(() => { this.ejecutando = false; });
    }

    handleReiniciar() {
        this.analisis = null;
        this.resultado = null;
        this.error = null;
    }

    navigateToRecordNewTab(e) {
        e.preventDefault();
        e.stopPropagation();
        const recordId = e.currentTarget.dataset.recordid;
        if (!recordId) return;
        this[NavigationMixin.GenerateUrl]({
            type: 'standard__recordPage',
            attributes: { recordId: recordId, objectApiName: 'Asiento_contable__c', actionName: 'view' }
        }).then(url => { window.open(url, '_blank'); });
    }

    // ---------------------------------------------------------------- formato
    toNum(v) { if (v == null) return 0; const n = (typeof v === 'number') ? v : Number(v); return Number.isNaN(n) ? 0 : n; }
    fmtDH(v) { const n = this.toNum(v); return n === 0 ? '—' : this.fmtNumber(n, 2); }
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
        return err.message || JSON.stringify(err);
    }
}