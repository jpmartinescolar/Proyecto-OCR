import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getOpciones from '@salesforce/apex/AsientosContablesController.getOpciones';
import buscarAsientos from '@salesforce/apex/AsientosContablesController.buscarAsientos';
import buscarCuentas from '@salesforce/apex/AsientosContablesController.buscarCuentas';
import guardarAsiento from '@salesforce/apex/AsientosContablesController.guardarAsiento';

/**
 * Asientos contables: listado con buscador a nivel de APUNTE (importe en
 * Debe/Haber/Saldo y texto) + editor de asiento con validación de cuadre.
 */
export default class AsientosContables extends NavigationMixin(LightningElement) {

    // ------------------------------------------------------------- estado general
    @track vista = 'lista';           // 'lista' | 'editor'
    @track error;
    @track loading = false;

    // Opciones
    @track empresaOptions = [];
    @track canalOptions = [];
    @track tipoOptions = [];
    @track tipoFiltroOptions = [];

    // ------------------------------------------------------------- filtros del listado
    @track fEmpresa = '';
    @track fDesde;
    @track fHasta;
    @track fTipo = 'Todos';
    @track fTexto = '';
    @track fCampoImporte = 'Debe';
    @track fModoImporte = 'Exacto';
    @track fImporte = null;

    @track rows = [];
    @track generated = false;
    @track verTodasLineas = false;
    @track hayMas = false;
    @track cargandoMas = false;
    _offset = 0;
    PAGINA = 50;

    // ------------------------------------------------------------- editor
    @track eAsientoId = null;
    @track eFecha;
    @track eEmpresa = '';
    @track eCanal = '001 General';
    @track eTipo = 'Apunte';
    @track eDescripcion = '';
    @track eLineas = [];
    @track eEliminadas = [];
    @track guardando = false;
    _keySeq = 0;

    connectedCallback() {
        const y = new Date().getFullYear();
        this.fDesde = `${y}-01-01`;
        this.fHasta = `${y}-12-31`;
    }

    @wire(getOpciones)
    wiredOpciones({ data, error }) {
        if (data) {
            this.empresaOptions = (data.empresas || []).map(v => ({ label: v, value: v }));
            this.canalOptions = (data.canales || []).map(v => ({ label: v, value: v }));
            this.tipoOptions = (data.tipos || []).map(v => ({ label: v, value: v }));
            this.tipoFiltroOptions = [{ label: 'Todos', value: 'Todos' }, ...this.tipoOptions];
        } else if (error) {
            this.error = this.reduceError(error);
        }
    }

    // ------------------------------------------------------------- getters de vista
    get esLista()  { return this.vista === 'lista'; }
    get esEditor() { return this.vista === 'editor'; }
    get hasError() { return !!this.error; }
    get hasRows()  { return this.generated && this.rows.length > 0; }
    get emptyState() { return this.generated && this.rows.length === 0; }
    get showInicial() { return !this.generated && !this.loading; }
    get campoImporteOptions() {
        return [
            { label: 'Debe', value: 'Debe' },
            { label: 'Haber', value: 'Haber' },
            { label: 'Saldo', value: 'Saldo' }
        ];
    }
    get modoExactoCls()  { return this.modoCls('Exacto'); }
    get modoSimilarCls() { return this.modoCls('Similar'); }
    get modoMayorCls()   { return this.modoCls('Mayor'); }
    get modoMenorCls()   { return this.modoCls('Menor'); }
    modoCls(v) { return this.fModoImporte === v ? 'ac-pill ac-pill-active' : 'ac-pill'; }

    // ------------------------------------------------------------- handlers de filtros
    hEmpresa(e) { this.fEmpresa = e.detail.value; }
    hDesde(e)   { this.fDesde = e.detail.value || null; }
    hHasta(e)   { this.fHasta = e.detail.value || null; }
    hTipo(e)    { this.fTipo = e.detail.value; }
    hTexto(e)   { this.fTexto = e.target.value || ''; }
    hCampoImporte(e) { this.fCampoImporte = e.detail.value; }
    hImporte(e) { const v = e.target.value; this.fImporte = (v === '' || v == null) ? null : Number(v); }
    setModoImporte(e) { this.fModoImporte = e.currentTarget.dataset.value; }
    hVerTodas(e) {
        this.verTodasLineas = e.target.checked;
        this.rows = this.rows.map(r => ({ ...r, expanded: this.verTodasLineas }));
    }
    limpiarFiltros() {
        const y = new Date().getFullYear();
        this.fTipo = 'Todos'; this.fTexto = ''; this.fImporte = null;
        this.fModoImporte = 'Exacto'; this.fCampoImporte = 'Debe';
        this.fDesde = `${y}-01-01`; this.fHasta = `${y}-12-31`;
    }

    hBuscar() {
        if (!this.fEmpresa) { this.error = 'Debes seleccionar la empresa titular.'; return; }
        if (!this.fDesde || !this.fHasta) { this.error = 'Debes indicar las fechas Desde y Hasta.'; return; }
        this.error = null;
        this._offset = 0;
        this.rows = [];
        this.hayMas = false;
        this.loading = true;
        this.cargarPagina(false);
    }

    hVerMas() {
        if (!this.hayMas || this.cargandoMas) return;
        this._offset += this.PAGINA;
        this.cargandoMas = true;
        this.cargarPagina(true);
    }

    cargarPagina(anexar) {
        buscarAsientos({
            empresaTitular: this.fEmpresa,
            desde: this.fDesde,
            hasta: this.fHasta,
            tipo: this.fTipo,
            texto: this.fTexto || null,
            campoImporte: this.fCampoImporte,
            modoImporte: this.fModoImporte,
            importe: this.fImporte,
            offsetFilas: this._offset
        })
        .then(res => {
            // Criterio de importe vigente para resaltar los apuntes que casan
            this._crit = (this.fImporte != null)
                ? { campo: this.fCampoImporte, modo: this.fModoImporte, importe: this.fImporte }
                : null;
            const base = anexar ? this.rows.length : 0;
            const nuevos = ((res && res.asientos) || []).map((a, i) => this.mapAsiento(a, base + i));
            this.rows = anexar ? [...this.rows, ...nuevos] : nuevos;
            this.hayMas = !!(res && res.hayMas);
            this.generated = true;
        })
        .catch(err => { this.error = this.reduceError(err); if (!anexar) this.rows = []; this.generated = true; })
        .finally(() => { this.loading = false; this.cargandoMas = false; });
    }

    get numMostrados() { return this.rows.length; }

    // ¿El apunte casa con la búsqueda por importe vigente?
    matchLinea(l) {
        if (!this._crit) return false;
        const c = this._crit;
        const v = c.campo === 'Haber' ? this.toNum(l.haber)
                : c.campo === 'Saldo' ? this.toNum(l.saldo)
                : this.toNum(l.debe);
        if (c.modo === 'Mayor')  return v >= c.importe;
        if (c.modo === 'Menor')  return v <= c.importe && v !== 0;
        if (c.modo === 'Similar') {
            const margen = Math.max(Math.abs(c.importe) * 0.05, 1);
            return v >= c.importe - margen && v <= c.importe + margen && v !== 0;
        }
        return Math.abs(v - c.importe) < 0.005;
    }

    mapAsiento(a, i) {
        const hits = (a.lineas || []).map(l => this.matchLinea(l));
        const tieneHit = hits.some(Boolean);
        return {
            key: 'a' + i,
            id: a.id,
            numero: a.numero,
            fecha: this.fmtFecha(a.fecha),
            tipo: a.tipo || '',
            tipoCls: this.tipoBadgeCls(a.tipo),
            descripcion: a.descripcion || '',
            empresa: a.empresa,
            canal: a.canal || '',
            totalDebe: this.fmtCurrency(a.totalDebe),
            totalHaber: this.fmtCurrency(a.totalHaber),
            diferencia: this.fmtCurrency(a.diferencia),
            cuadrado: a.cuadrado,
            expanded: this.verTodasLineas || tieneHit,
            chevron: (this.verTodasLineas || tieneHit) ? '▾' : '▸',
            raw: a,
            lineas: (a.lineas || []).map((l, j) => ({
                key: 'a' + i + 'l' + j,
                cuentaId: l.cuentaId,
                numero: l.cuentaNumero,
                titulo: l.cuentaTitulo,
                comentario: l.comentario || '',
                debe: this.fmtDH(l.debe),
                haber: this.fmtDH(l.haber),
                cls: hits[j] ? 'ac-sub-hit' : ''
            }))
        };
    }

    tipoBadgeCls(tipo) {
        const t = (tipo || '').toLowerCase();
        let mod = 'ac-badge-otros';
        if (t.includes('emitida')) mod = 'ac-badge-ventas';
        else if (t.includes('recibida') || t.includes('gasto')) mod = 'ac-badge-compras';
        else if (t.includes('cobro') || t.includes('pago')) mod = 'ac-badge-banco';
        else if (t.includes('amortizaci')) mod = 'ac-badge-amort';
        else if (t.includes('apertura') || t.includes('cierre')) mod = 'ac-badge-cierre';
        else if (t.includes('nómina') || t.includes('nomina')) mod = 'ac-badge-nomina';
        return 'ac-badge ' + mod;
    }

    toggleRow(e) {
        const key = e.currentTarget.dataset.key;
        this.rows = this.rows.map(r => r.key === key
            ? { ...r, expanded: !r.expanded, chevron: r.expanded ? '▸' : '▾' }
            : r);
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

    // Abre la cuenta contable en pestaña nueva, prefiltrada con la empresa del listado
    navigateToCuentaNewTab(e) {
        e.preventDefault();
        e.stopPropagation();
        const recordId = e.currentTarget.dataset.recordid;
        if (!recordId) return;
        this[NavigationMixin.GenerateUrl]({
            type: 'standard__recordPage',
            attributes: { recordId: recordId, objectApiName: 'Plan_general_contable__c', actionName: 'view' }
        }).then(url => {
            const params = [];
            if (this.fEmpresa) params.push('c__empresas=' + encodeURIComponent(JSON.stringify([this.fEmpresa])));
            if (this.fDesde) params.push('c__desde=' + encodeURIComponent(this.fDesde));
            if (this.fHasta) params.push('c__hasta=' + encodeURIComponent(this.fHasta));
            if (params.length) url += (url.includes('?') ? '&' : '?') + params.join('&');
            window.open(url, '_blank');
        });
    }

    // ------------------------------------------------------------- EDITOR
    hNuevo() {
        this.eAsientoId = null;
        this.eFecha = new Date().toISOString().slice(0, 10);
        this.eEmpresa = this.fEmpresa || '';
        this.eCanal = this.canalOptions.length ? this.canalOptions[0].value : '001 General';
        this.eTipo = 'Apunte';
        this.eDescripcion = '';
        this.eEliminadas = [];
        this.eLineas = [this.nuevaLinea(), this.nuevaLinea()];
        this.error = null;
        this.vista = 'editor';
    }

    hModificar(e) {
        const key = e.currentTarget.dataset.key;
        const row = this.rows.find(r => r.key === key);
        if (!row) return;
        const a = row.raw;
        this.eAsientoId = a.id;
        this.eFecha = a.fecha;
        this.eEmpresa = a.empresa;
        this.eCanal = a.canal || '001 General';
        this.eTipo = a.tipo || 'Apunte';
        this.eDescripcion = a.descripcion || '';
        this.eEliminadas = [];
        this.eLineas = (a.lineas || []).map(l => ({
            key: 'el' + (this._keySeq++),
            lineaId: l.lineaId,
            cuentaId: l.cuentaId,
            numero: l.cuentaNumero,
            titulo: l.cuentaTitulo,
            comentario: l.comentario || '',
            debe: l.debe || 0,
            haber: l.haber || 0,
            busqueda: l.cuentaNumero,
            opciones: [],
            showDropdown: false
        }));
        if (!this.eLineas.length) this.eLineas = [this.nuevaLinea()];
        this.error = null;
        this.vista = 'editor';
    }

    hVolver() { this.vista = 'lista'; this.error = null; }

    nuevaLinea() {
        return {
            key: 'el' + (this._keySeq++),
            lineaId: null, cuentaId: null, numero: '', titulo: '',
            comentario: '', debe: 0, haber: 0,
            busqueda: '', opciones: [], showDropdown: false
        };
    }

    get tituloEditor() { return this.eAsientoId ? 'Modificar asiento contable' : 'Nuevo asiento contable'; }
    get numeroEditor() { return this.eAsientoId ? '' : 'BORRADOR'; }
    heFecha(e) { this.eFecha = e.detail.value || null; }
    heEmpresa(e) { this.eEmpresa = e.detail.value; }
    heCanal(e) { this.eCanal = e.detail.value; }
    heTipo(e) { this.eTipo = e.detail.value; }
    heDescripcion(e) { this.eDescripcion = e.target.value || ''; }

    get totalDebe()  { return this.eLineas.reduce((t, l) => t + this.toNum(l.debe), 0); }
    get totalHaber() { return this.eLineas.reduce((t, l) => t + this.toNum(l.haber), 0); }
    get totalDebeFmt()  { return this.fmtCurrency(this.totalDebe); }
    get totalHaberFmt() { return this.fmtCurrency(this.totalHaber); }
    get descuadre() { return Math.round((this.totalDebe - this.totalHaber) * 100) / 100; }
    get hayImportes() { return this.totalDebe !== 0 || this.totalHaber !== 0; }
    get cuadrado() { return Math.abs(this.descuadre) < 0.005; }
    get estadoCuadreTxt() {
        if (!this.hayImportes) return 'Sin importes';
        return this.cuadrado ? 'Cuadrado' : `Descuadre: ${this.fmtCurrency(Math.abs(this.descuadre))}`;
    }
    get estadoCuadreCls() {
        if (!this.hayImportes) return 'ac-estado ac-estado-neutro';
        return this.cuadrado ? 'ac-estado ac-estado-ok' : 'ac-estado ac-estado-bad';
    }
    get numLineasTxt() { return this.eLineas.length + (this.eLineas.length === 1 ? ' línea' : ' líneas'); }
    get guardarDisabled() {
        return this.guardando || !this.eFecha || !this.eEmpresa || !this.eTipo
            || !this.hayImportes || !this.cuadrado;
    }

    hAddLinea() { this.eLineas = [...this.eLineas, this.nuevaLinea()]; }

    hQuitarLinea(e) {
        const key = e.currentTarget.dataset.key;
        const l = this.eLineas.find(x => x.key === key);
        if (l && l.lineaId) this.eEliminadas = [...this.eEliminadas, l.lineaId];
        this.eLineas = this.eLineas.filter(x => x.key !== key);
        if (!this.eLineas.length) this.eLineas = [this.nuevaLinea()];
    }

    // Cuadrar automáticamente: añade (o completa) una línea con la diferencia
    hCuadrar() {
        const dif = this.descuadre;
        if (dif === 0) return;
        let libre = this.eLineas.find(l => this.toNum(l.debe) === 0 && this.toNum(l.haber) === 0);
        if (!libre) { libre = this.nuevaLinea(); this.eLineas = [...this.eLineas, libre]; }
        const upd = { ...libre };
        if (dif > 0) { upd.haber = dif; upd.debe = 0; } else { upd.debe = -dif; upd.haber = 0; }
        this.eLineas = this.eLineas.map(l => l.key === upd.key ? upd : l);
    }

    heImporte(e) {
        const key = e.currentTarget.dataset.key;
        const campo = e.currentTarget.dataset.campo;   // 'debe' | 'haber'
        const v = e.target.value;
        const num = (v === '' || v == null) ? 0 : Number(v);
        this.eLineas = this.eLineas.map(l => l.key === key ? { ...l, [campo]: Number.isNaN(num) ? 0 : num } : l);
    }
    heComentario(e) {
        const key = e.currentTarget.dataset.key;
        const v = e.target.value || '';
        this.eLineas = this.eLineas.map(l => l.key === key ? { ...l, comentario: v } : l);
    }

    // Lookup de cuenta por línea
    heBusquedaCuenta(e) {
        const key = e.currentTarget.dataset.key;
        const term = e.target.value || '';
        this.eLineas = this.eLineas.map(l => l.key === key ? { ...l, busqueda: term, cuentaId: null, titulo: '' } : l);
        if (term.trim().length < 2) {
            this.eLineas = this.eLineas.map(l => l.key === key ? { ...l, opciones: [], showDropdown: false } : l);
            return;
        }
        buscarCuentas({ termino: term })
            .then(res => {
                this.eLineas = this.eLineas.map(l => l.key === key
                    ? { ...l, opciones: (res || []).map(c => ({ id: c.id, numero: c.numero, titulo: c.titulo, label: `${c.numero} — ${c.titulo}` })), showDropdown: true }
                    : l);
            })
            .catch(() => { /* silencioso */ });
    }
    hePickCuenta(e) {
        const key = e.currentTarget.dataset.key;
        const id = e.currentTarget.dataset.id;
        this.eLineas = this.eLineas.map(l => {
            if (l.key !== key) return l;
            const opt = (l.opciones || []).find(o => o.id === id);
            if (!opt) return l;
            return { ...l, cuentaId: opt.id, numero: opt.numero, titulo: opt.titulo, busqueda: opt.numero, opciones: [], showDropdown: false };
        });
    }
    heCerrarDropdown(e) {
        const key = e.currentTarget.dataset.key;
        // pequeño retraso para permitir el click en la opción
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            this.eLineas = this.eLineas.map(l => l.key === key ? { ...l, showDropdown: false } : l);
        }, 250);
    }

    hGuardar() {
        if (this.guardarDisabled) return;
        const sinCuenta = this.eLineas.some(l => (this.toNum(l.debe) !== 0 || this.toNum(l.haber) !== 0) && !l.cuentaId);
        if (sinCuenta) { this.error = 'Hay líneas con importe pero sin cuenta contable seleccionada.'; return; }
        this.error = null;
        this.guardando = true;
        const lineas = this.eLineas
            .filter(l => l.cuentaId || this.toNum(l.debe) !== 0 || this.toNum(l.haber) !== 0)
            .map(l => ({ lineaId: l.lineaId, cuentaId: l.cuentaId, comentario: l.comentario || null,
                         debe: this.toNum(l.debe), haber: this.toNum(l.haber) }));
        guardarAsiento({
            asientoId: this.eAsientoId,
            fecha: this.eFecha,
            empresaTitular: this.eEmpresa,
            canal: this.eCanal,
            tipo: this.eTipo,
            descripcion: this.eDescripcion || null,
            lineasJson: JSON.stringify(lineas),
            lineasEliminadas: this.eEliminadas
        })
        .then(res => {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Asiento guardado',
                message: `Asiento ${res.numero} guardado correctamente`,
                variant: 'success'
            }));
            this.vista = 'lista';
            if (this.fEmpresa) this.hBuscar();
        })
        .catch(err => { this.error = this.reduceError(err); })
        .finally(() => { this.guardando = false; });
    }

    // ------------------------------------------------------------- formato
    toNum(v) { if (v == null || v === '') return 0; const n = (typeof v === 'number') ? v : Number(v); return Number.isNaN(n) ? 0 : n; }
    fmtDH(v) { const n = this.toNum(v); return n === 0 ? '—' : this.fmtNumber(n, 2) + ' €'; }
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