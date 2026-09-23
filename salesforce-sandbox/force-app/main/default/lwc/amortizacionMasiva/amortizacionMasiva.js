import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { loadStyle } from 'lightning/platformResourceLoader';
import TABLA_STYLES from '@salesforce/resourceUrl/TablaAmortizacionStyles';
import obtenerEmpresasTitulares from '@salesforce/apex/AmortizacionMasivaController.obtenerEmpresasTitulares';
import obtenerPreview from '@salesforce/apex/AmortizacionMasivaController.obtenerPreview';
import procesarAmortizacion from '@salesforce/apex/AmortizacionMasivaController.procesarAmortizacion';
import obtenerEstadoJob from '@salesforce/apex/AmortizacionMasivaController.obtenerEstadoJob';
import obtenerDetalleMensual from '@salesforce/apex/AmortizacionMasivaController.obtenerDetalleMensual';

const MESES = [
    { label: 'Enero',      value: '1' },
    { label: 'Febrero',    value: '2' },
    { label: 'Marzo',      value: '3' },
    { label: 'Abril',      value: '4' },
    { label: 'Mayo',       value: '5' },
    { label: 'Junio',      value: '6' },
    { label: 'Julio',      value: '7' },
    { label: 'Agosto',     value: '8' },
    { label: 'Septiembre', value: '9' },
    { label: 'Octubre',    value: '10' },
    { label: 'Noviembre',  value: '11' },
    { label: 'Diciembre',  value: '12' }
];

function eur(v) {
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    if (Number.isNaN(n)) return '';
    const neg = n < 0;
    const abs = Math.abs(n);
    const [e, d] = abs.toFixed(2).split('.');
    const ep = e.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${neg ? '-' : ''}${ep},${d} €`;
}

const FLAT_COLS = [
    {
        label: 'Empresa / Nº',
        fieldName: 'label',
        type: 'urlOrText',
        typeAttributes: {
            url:    { fieldName: 'recordUrl' },
            label:  { fieldName: 'label' },
            target: '_blank'
        },
        wrapText: true,
        initialWidth: 280,
        cellAttributes: { class: { fieldName: 'rowClass' } }
    },
    { label: 'Título',          fieldName: 'titulo',           type: 'text',   cellAttributes: { class: { fieldName: 'rowClass' } } },
    { label: 'Fecha inicio amort.', fieldName: 'fechaInicioFmt',  type: 'text',   cellAttributes: { alignment: 'right', class: { fieldName: 'rowClass' } } },
    { label: 'Valor inicial',   fieldName: 'valorInicialFmt',  type: 'text',   cellAttributes: { alignment: 'right', class: { fieldName: 'rowClass' } } },
    { label: 'Coef.',           fieldName: 'coeficienteFmt',   type: 'text',   cellAttributes: { alignment: 'right', class: { fieldName: 'rowClass' } } },
    { label: 'OK',              fieldName: 'ok',               type: 'number', cellAttributes: { alignment: 'right', class: 'col-ok' } },
    { label: 'Parcial',         fieldName: 'parcial',          type: 'number', cellAttributes: { alignment: 'right', class: 'col-parcial' } },
    { label: 'Ya existe',       fieldName: 'duplicados',       type: 'number', cellAttributes: { alignment: 'right', class: 'col-duplicado' } },
    { label: 'Fuera período',   fieldName: 'fueraPeriodo',     type: 'number', cellAttributes: { alignment: 'right', class: 'col-fuera' } },
    { label: 'Importe',         fieldName: 'importeFmt',       type: 'text',   cellAttributes: { alignment: 'right', class: 'col-importe' } },
    {
        label: '',
        type: 'button',
        typeAttributes: {
            label: { fieldName: 'btnLabel' },
            iconName: { fieldName: 'btnIcon' },
            iconPosition: 'left',
            name: 'verDetalle',
            variant: 'brand',
            disabled: { fieldName: 'btnDisabled' },
            title: 'Ver desglose mensual'
        },
        initialWidth: 110,
        cellAttributes: { class: { fieldName: 'btnCellClass' } }
    }
];

function fechaEs(d) {
    if (!d) return '';
    const [a, m, dia] = d.split('-');
    return `${dia}/${m}/${a}`;
}

export default class AmortizacionMasiva extends NavigationMixin(LightningElement) {
    paso = 1;
    procesando = false;
    error;

    empresasTitulares = [];
    empresasOpts = [];
    empresasSeleccionadas = [];

    anioActual = new Date().getFullYear();
    anioSeleccionado = String(new Date().getFullYear());
    aniosOpts = [];

    mesesOpts = MESES;
    mesDesde = '1';
    mesHasta = String(new Date().getMonth() + 1);

    preview;
    flatData = [];
    flatCols = FLAT_COLS;

    detalleCols = [
        { label: 'Mes',    fieldName: 'mesNombre', type: 'text', initialWidth: 130 },
        { label: 'Días',   fieldName: 'dias',      type: 'number', cellAttributes: { alignment: 'right' }, initialWidth: 80 },
        { label: 'Cuota',  fieldName: 'cuotaFmt',  type: 'text', cellAttributes: { alignment: 'right' }, initialWidth: 130 },
        { label: 'Estado', fieldName: 'mensaje',   type: 'text', cellAttributes: { class: { fieldName: 'estadoClass' } } }
    ];
    mostrarDetalle = false;
    detalleCargando = false;
    detalleTitulo = '';
    detalleMensual = [];

    jobId;
    estadoJob;
    intervalId;

    connectedCallback() {
        loadStyle(this, TABLA_STYLES).catch(() => {});
        const a = new Date().getFullYear();
        this.aniosOpts = [];
        for (let i = a - 5; i <= a + 2; i++) this.aniosOpts.push({ label: String(i), value: String(i) });
    }

    disconnectedCallback() {
        this.detenerPolling();
    }

    @wire(obtenerEmpresasTitulares)
    wiredEmpresas({ data, error }) {
        if (data) {
            this.empresasTitulares = data;
            this.empresasOpts = data.map((e) => ({ label: e, value: e }));
        } else if (error) {
            this.error = error.body && error.body.message ? error.body.message : 'Error al cargar empresas.';
        }
    }

    /* ---------------- Step 1 ---------------- */

    handleEmpresasChange(event) {
        this.empresasSeleccionadas = event.detail.value;
    }
    handleAnioChange(event)    { this.anioSeleccionado = event.detail.value; }
    handleMesDesdeChange(event){ this.mesDesde = event.detail.value; }
    handleMesHastaChange(event){ this.mesHasta = event.detail.value; }

    get contadorEmpresas() {
        return this.empresasSeleccionadas ? this.empresasSeleccionadas.length : 0;
    }

    get contadorEmpresasPlural() {
        return this.contadorEmpresas === 1 ? '' : 's';
    }

    get puedeCalcular() {
        return this.empresasSeleccionadas.length > 0
            && this.anioSeleccionado
            && this.mesDesde && this.mesHasta
            && Number(this.mesDesde) <= Number(this.mesHasta);
    }

    async handleCalcular() {
        this.procesando = true;
        this.error = undefined;
        try {
            const r = await obtenerPreview({
                empresasTitulares: this.empresasSeleccionadas,
                anio: Number(this.anioSeleccionado),
                mesDesde: Number(this.mesDesde),
                mesHasta: Number(this.mesHasta)
            });
            this.preview = r;
            const flat = [];
            (r.porEmpresa || []).forEach((e, idx) => {
                flat.push({
                    id: 'emp-' + idx,
                    label: e.empresa,
                    recordUrl: '',
                    titulo: '',
                    fechaInicioFmt: '',
                    valorInicialFmt: '',
                    coeficienteFmt: '',
                    rowClass: 'fila-empresa',
                    btnLabel: '',
                    btnIcon: '',
                    btnDisabled: true,
                    btnCellClass: 'celda-boton-oculta',
                    ok: e.ok,
                    parcial: e.parcial,
                    duplicados: e.duplicados,
                    fueraPeriodo: e.fueraPeriodo,
                    importeFmt: eur(e.importe)
                });
                (e.detalle || []).forEach((d) => {
                    flat.push({
                        id: d.id,
                        label: '   ' + d.nombre,
                        recordUrl: '',
                        titulo: d.titulo || '',
                        fechaInicioFmt: fechaEs(d.fechaInicio),
                        valorInicialFmt: eur(d.valorInicial),
                        coeficienteFmt: (d.coeficiente != null ? `${d.coeficiente} %` : ''),
                        rowClass: '',
                        btnLabel: 'Ver',
                        btnIcon: 'utility:zoomin',
                        btnDisabled: false,
                        btnCellClass: '',
                        ok: d.ok,
                        parcial: d.parcial,
                        duplicados: d.duplicados,
                        fueraPeriodo: d.fueraPeriodo,
                        importeFmt: eur(d.importe)
                    });
                });
            });
            this.flatData = flat;
            this.paso = 2;
            this.resolverUrlsInmovilizados(flat);
        } catch (e) {
            this.error = e && e.body && e.body.message ? e.body.message : 'Error al calcular el preview.';
        } finally {
            this.procesando = false;
        }
    }

    resolverUrlsInmovilizados(flat) {
        const indicesInm = [];
        flat.forEach((row, i) => {
            if (row.id && !String(row.id).startsWith('emp-')) indicesInm.push(i);
        });
        if (!indicesInm.length) return;
        Promise.all(indicesInm.map((i) =>
            this[NavigationMixin.GenerateUrl]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: flat[i].id,
                    objectApiName: 'Inmovilizados__c',
                    actionName: 'view'
                }
            })
        ))
        .then((urls) => {
            const copia = flat.map((row) => ({ ...row }));
            indicesInm.forEach((idx, j) => { copia[idx].recordUrl = urls[j]; });
            this.flatData = copia;
        })
        .catch(() => {});
    }

    /* ---------------- Step 2 ---------------- */

    get importeTotalFmt() {
        return eur(this.preview && this.preview.importeTotal);
    }

    get periodoTxt() {
        const desde = MESES.find((m) => m.value === this.mesDesde).label;
        const hasta = MESES.find((m) => m.value === this.mesHasta).label;
        return `${desde}${desde === hasta ? '' : ' – ' + hasta} ${this.anioSeleccionado}`;
    }


    get duplicadosTxt() {
        return this.preview ? this.preview.duplicados.join(', ') : '';
    }
    get erroresTxt() {
        return this.preview ? this.preview.errores.join(', ') : '';
    }

    get puedeProcesar() {
        return this.preview && this.preview.asientosACrear > 0 && !this.procesando;
    }

    handleVolver() {
        this.paso = 1;
        this.preview = undefined;
        this.flatData = [];
    }

    async handleRowAction(event) {
        const action = event.detail.action;
        const row = event.detail.row;
        if (!action || action.name !== 'verDetalle' || (row && row.btnDisabled)) return;

        this.mostrarDetalle = true;
        this.detalleCargando = true;
        this.detalleTitulo = `${row.label.trim()}${row.titulo ? ' · ' + row.titulo : ''}`;
        this.detalleMensual = [];
        try {
            const data = await obtenerDetalleMensual({
                inmovilizadoId: row.id,
                anio: Number(this.anioSeleccionado),
                mesDesde: Number(this.mesDesde),
                mesHasta: Number(this.mesHasta)
            });
            this.detalleMensual = (data || []).map((d) => ({
                ...d,
                cuotaFmt: eur(d.cuota),
                estadoClass:
                    d.estado === 'OK'           ? 'slds-text-color_success' :
                    d.estado === 'OK_PARCIAL'   ? 'slds-text-color_success' :
                    d.estado === 'DUPLICADO'    ? 'col-duplicado' :
                    d.estado === 'FUERA_INICIO' ? 'col-fuera' :
                    d.estado === 'FUERA_FIN'    ? 'col-fuera' :
                                                  'slds-text-color_destructive'
            }));
        } catch (e) {
            const msg = e && e.body && e.body.message ? e.body.message : 'Error al cargar el detalle.';
            this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: msg, variant: 'error' }));
        } finally {
            this.detalleCargando = false;
        }
    }

    handleCerrarDetalle() {
        this.mostrarDetalle = false;
        this.detalleMensual = [];
    }

    async handleProcesar() {
        this.procesando = true;
        this.error = undefined;
        try {
            this.jobId = await procesarAmortizacion({
                empresasTitulares: this.empresasSeleccionadas,
                anio: Number(this.anioSeleccionado),
                mesDesde: Number(this.mesDesde),
                mesHasta: Number(this.mesHasta)
            });
            this.paso = 3;
            this.iniciarPolling();
        } catch (e) {
            this.error = e && e.body && e.body.message ? e.body.message : 'Error al lanzar el proceso.';
        } finally {
            this.procesando = false;
        }
    }

    /* ---------------- Step 3 ---------------- */

    iniciarPolling() {
        this.estadoJob = { status: 'Queued', completed: false };
        this.intervalId = setInterval(() => this.consultarEstado(), 3000);
    }

    detenerPolling() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
    }

    async consultarEstado() {
        if (!this.jobId) return;
        try {
            const r = await obtenerEstadoJob({ jobId: this.jobId });
            this.estadoJob = r;
            if (r && r.completed) {
                this.detenerPolling();
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Amortización completada',
                    message: 'El proceso ha terminado correctamente.',
                    variant: 'success'
                }));
            }
        } catch (e) {
            // ignorar errores transitorios
        }
    }

    get estadoJobTxt() {
        if (!this.estadoJob) return 'Encolando...';
        if (this.estadoJob.completed) return 'Completado';
        return this.estadoJob.status || 'En curso';
    }

    get jobCompletado() {
        return this.estadoJob && this.estadoJob.completed;
    }

    handleNuevo() {
        this.detenerPolling();
        this.paso = 1;
        this.preview = undefined;
        this.flatData = [];
        this.jobId = undefined;
        this.estadoJob = undefined;
        this.error = undefined;
        this.procesando = false;
        this.empresasSeleccionadas = [];
        this.anioSeleccionado = String(new Date().getFullYear());
        this.mesDesde = '1';
        this.mesHasta = String(new Date().getMonth() + 1);
        this.mostrarDetalle = false;
        this.detalleMensual = [];
        this.detalleTitulo = '';
        this.detalleCargando = false;
    }

    /* ---------------- Display helpers ---------------- */

    get esPaso1() { return this.paso === 1; }
    get esPaso2() { return this.paso === 2; }
    get esPaso3() { return this.paso === 3; }
}