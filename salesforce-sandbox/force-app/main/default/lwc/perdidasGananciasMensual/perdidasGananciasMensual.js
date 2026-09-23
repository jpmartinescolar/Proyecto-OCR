import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getFilterOptions from '@salesforce/apex/PyGMensualController.getFilterOptions';
import generar from '@salesforce/apex/PyGMensualController.generar';
import getMovimientos from '@salesforce/apex/PyGMensualController.getMovimientos';
import updateMovimiento from '@salesforce/apex/PyGMensualController.updateMovimiento';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const MESES_LABEL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default class PerdidasGananciasMensual extends NavigationMixin(LightningElement) {

    @track empresasTitulares = [];        // multi-select
    @track area = '';
    @track directorFacturacionId = null;
    @track ejercicio = null;              // obligatorio, sin valor por defecto
    @track planPGC = 'PGC PYMES';

    @track avisosParams = null;           // entrada para <c-avisos-cuadre>

    @track simulacion = 'No';             // por defecto: No
    @track extraordinarios = 'Todas';     // por defecto: Todas
    @track check = 'Todos';               // por defecto: Todos
    @track desplegado = 'Si';             // Si = mostrar cuentas; No = sólo secciones/subtotales/acumulado

    @track loading = false;
    @track generated = false;
    @track error;
    @track rows = [];

    @track empresaOptionsBase = [];       // sin selección — fuente
    @track areaOptions = [];
    @track areaOptionsBase = [];   // sin "Todas" — usado en la edición inline del modal
    @track ejercicioOptions = [];
    @track planOptions = [];

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

    // ---------------------------------------------------------------
    @wire(getFilterOptions)
    wiredOpts({ data, error }) {
        if (data) {
            this.empresaOptionsBase = (data.empresasTitulares || []).map(v => ({ label: v, value: v }));
            this.areaOptionsBase = (data.areas || []).map(v => ({ label: v, value: v }));
            this.areaOptions     = [{ label: 'Todas', value: '' }, ...this.areaOptionsBase];
            this.ejercicioOptions = (data.ejercicios || []).map(v => ({ label: String(v), value: String(v) }));
            this.planOptions    = (data.planesPGC || []).map(v => ({ label: v, value: v }));
            // Ejercicio: NO precargamos — el usuario debe elegirlo explícitamente
        } else if (error) {
            this.error = this.reduceError(error);
        }
    }

    // ---------------------------------------------------------------
    get hasError() { return !!this.error; }
    get hasRows()  { return this.generated && this.rows && this.rows.length > 0; }
    get emptyState() { return this.generated && (!this.rows || this.rows.length === 0); }
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
    get periodoLabel() { return `Ejercicio ${this.ejercicio || '—'} · vista mensual`; }

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
        return this.empresasTitulares.length
            ? 'pyg-ms-trigger pyg-ms-trigger-filled'
            : 'pyg-ms-trigger';
    }
    get empresaDropdownClass() {
        return this.showEmpresaDropdown
            ? 'pyg-ms-wrap pyg-ms-wrap-open'
            : 'pyg-ms-wrap';
    }
    get empresaCount() {
        return `${this.empresasTitulares.length} / ${this.empresaOptionsBase.length}`;
    }
    get hasMovimientos()    { return !!(this.modalMovimientos && this.modalMovimientos.length); }
    get noMovimientos()     { return !this.modalLoading && !this.modalError && !this.hasMovimientos; }
    get modalContentReady() { return !this.modalLoading && !this.modalError && this.hasMovimientos; }
    get headerColumnas() {
        return this.meses.map((m, i) => ({ key: 'm'+i, label: m }));
    }

    // ---------------------------------------------------------------
    //  FORMATO ESPAÑOL (1.234,56 €)
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
    fmtPct(v) {
        const n = (typeof v === 'number') ? v : Number(v);
        if (n == null || Number.isNaN(n)) return null;
        return this.fmtNumber(n, 1) + '% s/CN';
    }
    fmtFecha(d) {
        if (!d) return '';
        // d puede venir como 'YYYY-MM-DD' o como objeto Date string
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        return String(d);
    }

    // ---------------------------------------------------------------
    get filasView() {
        const ocultarCuentas = this.desplegado === 'No';
        return (this.rows || [])
            .filter(r => !(ocultarCuentas && r.tipo === 'CUENTA'))
            .map((r, idx) => {
            const totalNum = this.toNum(r.total);
            const meses = (r.meses || []).map((v, i) => {
                const n = this.toNum(v);
                return {
                    key: r.key + '_m' + i,
                    rowKey: r.key,
                    mesIdx: i + 1,           // 1..12 para Apex
                    label: MESES_LABEL[i],
                    value: this.fmtCurrency(n),
                    cssClass: this.cellClass(n, r),
                    clickable: this.cellIsClickable(r, n)
                };
            });
            const total = {
                key: r.key + '_total',
                rowKey: r.key,
                mesIdx: 0,                    // 0 = año completo
                label: 'Total ejercicio',
                value: this.fmtCurrency(totalNum),
                cssClass: this.cellClass(totalNum, r) + ' pyg-total-col',
                clickable: this.cellIsClickable(r, totalNum)
            };
            // Función auxiliar: clase de signo según el importe correspondiente
            const signoClass = (v) => {
                const x = this.toNum(v);
                if (x == null || Number.isNaN(x) || x === 0) return 'pyg-zero';
                return x < 0 ? 'pyg-neg' : 'pyg-pos';
            };

            let pct = null;
            if (r.tipo === 'SUBTOTAL' && Array.isArray(r.porcentajes)) {
                pct = r.porcentajes.map((p, i) => {
                    const n = this.toNum(p);
                    const signo = signoClass((r.meses || [])[i]);
                    return {
                        key: r.key + '_p' + i,
                        value: this.fmtPct(n) || '—',
                        cssClass: 'pyg-cell pyg-pct ' + signo
                    };
                });
            }
            const pTotalNum = this.toNum(r.porcentajeTotal);
            const pTotalSignClass = 'pyg-cell pyg-pct pyg-total-col ' + signoClass(r.total);
            return {
                key: r.key || ('r'+idx),
                tipo: r.tipo,
                acumulado: !!r.acumulado,
                rowClass: this.rowClass(r),
                conceptoClass: this.conceptoClass(r),
                codigo: r.codigoCuenta,
                cuentaId: r.cuentaId || null,
                concepto: r.concepto,
                meses,
                total,
                porcentajes: pct,
                porcentajeTotal: this.fmtPct(pTotalNum),
                porcentajeTotalCss: pTotalSignClass,
                showCodigo: r.tipo === 'CUENTA' && !!r.codigoCuenta,
                isSubtotal: r.tipo === 'SUBTOTAL',
                isSeccion: r.tipo === 'SECCION'
            };
        });
    }

    cellIsClickable(r, n) {
        // Sólo se abre el modal en filas tipo CUENTA (con cuenta contable)
        return r && r.tipo === 'CUENTA' && !!(r.cuentaIds && r.cuentaIds.length);
    }
    rowClass(r) {
        if (r.tipo === 'SECCION')   return 'pyg-row pyg-seccion';
        if (r.tipo === 'SUBTOTAL')  return 'pyg-row pyg-subtotal';
        if (r.tipo === 'ACUMULADO') return 'pyg-row pyg-acumulado';
        return 'pyg-row pyg-cuenta';
    }
    conceptoClass(r) {
        if (r.tipo === 'SECCION')   return 'pyg-concepto pyg-concepto-seccion';
        if (r.tipo === 'SUBTOTAL')  return 'pyg-concepto pyg-concepto-subtotal';
        if (r.tipo === 'ACUMULADO') return 'pyg-concepto pyg-concepto-acumulado';
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
    toNum(v) {
        if (v == null || v === '') return null;
        if (typeof v === 'number') return v;
        const n = Number(v);
        return Number.isNaN(n) ? null : n;
    }

    // ---------------------------------------------------------------
    //  HANDLERS
    // ---------------------------------------------------------------
    handleAreaChange(e)           { this.area = e.detail.value; }
    handleEjercicioChange(e)      { this.ejercicio = e.detail.value || null; }   // string, coincide con options[i].value
    handlePlanChange(e)           { this.planPGC = e.detail.value; }
    handleDirectorChange(e) {
        this.directorFacturacionId = e.detail && e.detail.recordId ? e.detail.recordId : null;
    }
    setSimulacion(e)        { this.simulacion = e.currentTarget.dataset.value; this.handleRefresh(); }
    setExtraordinarios(e)   { this.extraordinarios = e.currentTarget.dataset.value; this.handleRefresh(); }
    setCheck(e)             { this.check = e.currentTarget.dataset.value; this.handleRefresh(); }
    setDesplegado(e)        { this.desplegado = e.currentTarget.dataset.value; }

    // Toggle multi-select empresa
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
    handleEmpresaSelectAll() {
        this.empresasTitulares = this.empresaOptionsBase.map(o => o.value);
    }
    handleEmpresaClearAll() {
        this.empresasTitulares = [];
    }
    removeEmpresa(e) {
        const val = e.currentTarget.dataset.value;
        this.empresasTitulares = this.empresasTitulares.filter(v => v !== val);
    }

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

    // Badge tipo fórmula: Fiscal (verde) si Simulación=Todas y Extraordinarios=No; Analítico (rojo) en cualquier otro caso
    get esVistaFiscal() {
        return this.simulacion === 'Todas' && this.extraordinarios === 'No';
    }
    get vistaLabel() {
        return this.esVistaFiscal ? 'Fiscal' : 'Analítico';
    }
    get vistaClass() {
        return this.esVistaFiscal
            ? 'pyg-vista-badge pyg-vista-fiscal'
            : 'pyg-vista-badge pyg-vista-analitico';
    }

    // Estado de validez del botón Generar
    get formInvalido() {
        return this.empresasTitulares.length === 0 || this.ejercicio == null;
    }
    get empresaErrorClass() {
        return this.empresasTitulares.length === 0 ? 'pyg-required-empty' : '';
    }
    get ejercicioErrorClass() {
        return this.ejercicio == null ? 'pyg-required-empty' : '';
    }

    handleGenerar() {
        const faltan = [];
        if (this.empresasTitulares.length === 0) faltan.push('empresa titular');
        if (this.ejercicio == null)              faltan.push('ejercicio');
        if (faltan.length) {
            this.error = faltan.length === 1
                ? `Debes seleccionar un ${faltan[0]}.`
                : `Debes seleccionar ${faltan.join(' y ')} antes de generar.`;
            // No reseteamos rows previos — solo mostramos el aviso
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
            planPGC: this.planPGC,
            simulacion: this.simulacion,
            extraordinarios: this.extraordinarios,
            check: this.check
        })
        .then(result => {
            this.rows = result || [];
            const y = Number(this.ejercicio);
            this.avisosParams = {
                empresas: [...this.empresasTitulares],
                desde: `${y}-01-01`,
                hasta: `${y}-12-31`
            };
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
    //  MODAL — al pinchar un importe
    // ---------------------------------------------------------------
    handleAmountClick(e) {
        const rowKey = e.currentTarget.dataset.rowkey;
        const mesIdx = Number(e.currentTarget.dataset.mes);    // 0 = año, 1..12 = mes
        const importe = e.currentTarget.dataset.value;
        const concepto = e.currentTarget.dataset.concepto;
        const row = this.rows.find(r => r.key === rowKey);
        if (!row || row.tipo !== 'CUENTA') return;
        if (!row.cuentaIds || !row.cuentaIds.length) return;

        const esAcumulado = !!row.acumulado;
        const mesInicio = (esAcumulado && mesIdx >= 1) ? 1 : (mesIdx === 0 ? null : mesIdx);

        this.modalTitulo = concepto || row.concepto || '';
        if (mesIdx === 0) {
            this.modalSubtitulo = `Total ejercicio ${this.ejercicio}`;
        } else if (esAcumulado) {
            this.modalSubtitulo = (mesIdx === 1)
                ? `${MESES_LABEL[0]} ${this.ejercicio} (acumulado)`
                : `Enero – ${MESES_LABEL[mesIdx-1]} ${this.ejercicio} (acumulado)`;
        } else {
            this.modalSubtitulo = `${MESES_LABEL[mesIdx-1]} ${this.ejercicio}`;
        }
        this.modalImporte = importe;
        this.modalMovimientos = [];
        this.modalError = null;
        this.showModal = true;
        this.modalLoading = true;

        getMovimientos({
            cuentaIds: row.cuentaIds,
            ejercicio: Number(this.ejercicio),
            mes: mesIdx === 0 ? null : mesIdx,
            mesInicio: mesInicio,
            empresasTitulares: this.empresasTitulares,
            area: this.area || null,
            directorFacturacionId: this.directorFacturacionId,
            simulacion: this.simulacion,
            extraordinarios: this.extraordinarios,
            check: this.check
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
        .catch(err => {
            this.modalError = this.reduceError(err);
        })
        .finally(() => { this.modalLoading = false; });
    }
    closeModal() {
        this.showModal = false;
        this.modalMovimientos = [];
    }
    stopProp(e) { e.stopPropagation(); }

    // ---------------------------------------------------------------
    //  EDICIÓN INLINE EN EL MODAL
    // ---------------------------------------------------------------
    get areaEditOptions() {
        return [{ label: '— sin asignar —', value: '' }, ...(this.areaOptionsBase || []).map(o => ({ label: o.label, value: o.value }))];
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

    // ---------------------------------------------------------------
    // Navegación universal (funciona en Lightning Experience y Experience Cloud)
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
        this.ejercicio = null;
        this.planPGC = 'PGC PYMES';
        this.simulacion = 'No';
        this.extraordinarios = 'Todas';
        this.check = 'Todos';
        this.desplegado = 'Si';
        this.generated = false;
        this.loading = false;
        this.error = null;
        this.rows = [];
        this.avisosParams = null;
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