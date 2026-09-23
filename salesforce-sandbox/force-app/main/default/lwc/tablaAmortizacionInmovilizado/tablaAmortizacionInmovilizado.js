import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { loadStyle } from 'lightning/platformResourceLoader';
import TABLA_STYLES from '@salesforce/resourceUrl/TablaAmortizacionStyles';
import obtenerTabla from '@salesforce/apex/TablaAmortizacionController.obtenerTabla';
import guardarCambios from '@salesforce/apex/TablaAmortizacionController.guardarCambios';

function eur(valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    const numero = Number(valor);
    if (Number.isNaN(numero)) return '';
    const negativo = numero < 0;
    const abs = Math.abs(numero);
    const [entera, decimal] = abs.toFixed(2).split('.');
    const enteraConPuntos = entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${negativo ? '-' : ''}${enteraConPuntos},${decimal} €`;
}

function parseEur(str) {
    if (str === null || str === undefined || str === '') return 0;
    if (typeof str === 'number') return str;
    let limpio = String(str).replace(/[^\d.,\-]/g, '');
    if (limpio.includes(',')) {
        limpio = limpio.replace(/\./g, '').replace(',', '.');
    }
    const num = Number(limpio);
    return Number.isNaN(num) ? 0 : num;
}

const COLUMNS = [
    {
        label: 'Nº',
        fieldName: 'recordUrl',
        type: 'url',
        typeAttributes: { label: { fieldName: 'name' }, target: '_self' },
        initialWidth: 110
    },
    { label: 'Ejercicio', fieldName: 'ejercicio', type: 'text', initialWidth: 110 },
    {
        label: 'Máximo amortización',
        fieldName: 'maximoFmt',
        type: 'text',
        editable: true,
        cellAttributes: { alignment: 'right', class: 'celda-maximo' }
    },
    {
        label: 'Valor residual contable',
        fieldName: 'valorResidualContableFmt',
        type: 'text',
        cellAttributes: { alignment: 'right', class: 'celda-residual' }
    },
    {
        label: 'Amortizado',
        fieldName: 'amortizadoFmt',
        type: 'text',
        cellAttributes: { alignment: 'right' }
    },
    {
        label: 'Pendiente amortización',
        fieldName: 'pendienteAmortizacionFmt',
        type: 'text',
        cellAttributes: { alignment: 'right', class: { fieldName: 'pendienteClass' } }
    },
    {
        label: 'Amortización apunte',
        fieldName: 'amortizacionApunteFmt',
        type: 'text',
        cellAttributes: { alignment: 'right' }
    },
    {
        label: 'Amortización forzada',
        fieldName: 'amortizacionForzadaFmt',
        type: 'text',
        editable: true,
        cellAttributes: { alignment: 'right' }
    }
];

export default class TablaAmortizacionInmovilizado extends NavigationMixin(LightningElement) {
    @api recordId;

    columns = COLUMNS;
    filas = [];
    valorInicial = 0;
    valorInicialFormateado = '';
    error;
    cargado = false;
    draftValues = [];
    wiredResult;
    stylesCargados = false;

    connectedCallback() {
        if (!this.stylesCargados) {
            this.stylesCargados = true;
            loadStyle(this, TABLA_STYLES).catch(() => {});
        }
    }

    @wire(obtenerTabla, { inmovilizadoId: '$recordId' })
    wiredTabla(result) {
        this.wiredResult = result;
        const { data, error } = result;
        if (data) {
            this.valorInicial = data.valorInicial || 0;
            this.valorInicialFormateado = eur(this.valorInicial);
            const filasBase = (data.filas || []).map((f) => ({
                ...f,
                recordUrl: '',
                maximoFmt:                eur(f.maximo),
                valorResidualContableFmt: eur(f.valorResidualContable),
                amortizadoFmt:            eur(f.amortizado),
                pendienteAmortizacionFmt: eur(f.pendienteAmortizacion),
                amortizacionApunteFmt:    eur(f.amortizacionApunte),
                amortizacionForzadaFmt:   eur(f.amortizacionForzada),
                pendienteClass: (Number(f.pendienteAmortizacion) || 0) === 0
                    ? ''
                    : 'slds-text-color_destructive'
            }));
            this.filas = filasBase;
            this.error = undefined;
            this.cargado = true;
            this.resolverUrls(filasBase);
        } else if (error) {
            this.error = error.body && error.body.message ? error.body.message : 'Error al cargar la tabla.';
            this.filas = [];
            this.valorInicial = 0;
            this.valorInicialFormateado = '';
            this.cargado = true;
        }
    }

    resolverUrls(filas) {
        Promise.all(filas.map((f) =>
            this[NavigationMixin.GenerateUrl]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: f.id,
                    objectApiName: 'Tabla_de_amortizaci_n__c',
                    actionName: 'view'
                }
            })
        ))
        .then((urls) => {
            this.filas = filas.map((f, i) => ({ ...f, recordUrl: urls[i] }));
        })
        .catch(() => {});
    }

    get hayFilas() {
        return this.cargado && !this.error && this.filas.length > 0;
    }

    get sinDatos() {
        return this.cargado && !this.error && this.filas.length === 0;
    }

    async handleSave(event) {
        const draftsCrudos = event.detail.draftValues || [];
        const drafts = draftsCrudos.map((d) => {
            const salida = { id: d.id };
            if (Object.prototype.hasOwnProperty.call(d, 'maximoFmt')) {
                salida.maximo = parseEur(d.maximoFmt);
            }
            if (Object.prototype.hasOwnProperty.call(d, 'amortizacionForzadaFmt')) {
                salida.amortizacionForzada = parseEur(d.amortizacionForzadaFmt);
            }
            return salida;
        });

        try {
            await guardarCambios({ draftValues: drafts });
            this.draftValues = [];
            this.dispatchEvent(new ShowToastEvent({
                title: 'Cambios guardados',
                message: `Se han actualizado ${drafts.length} registro(s).`,
                variant: 'success'
            }));
            await refreshApex(this.wiredResult);
        } catch (e) {
            const mensaje = (e && e.body && e.body.message) ? e.body.message : 'Error al guardar los cambios.';
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error al guardar',
                message: mensaje,
                variant: 'error'
            }));
        }
    }
}