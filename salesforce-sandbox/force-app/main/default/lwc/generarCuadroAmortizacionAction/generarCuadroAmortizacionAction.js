import { LightningElement, api } from 'lwc';
import { CloseActionScreenEvent } from 'lightning/actions';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import generarCuadroAmortizacion from '@salesforce/apex/TablaAmortizacionController.generarCuadroAmortizacion';

export default class GenerarCuadroAmortizacionAction extends LightningElement {
    @api recordId;
    procesando = false;
    error;

    handleCancelar() {
        this.dispatchEvent(new CloseActionScreenEvent());
    }

    async handleGenerar() {
        this.procesando = true;
        this.error = undefined;
        try {
            const msg = await generarCuadroAmortizacion({ inmovilizadoId: this.recordId });
            this.dispatchEvent(new ShowToastEvent({
                title: 'Cuadro de amortización creado',
                message: msg,
                variant: 'success'
            }));
            this.dispatchEvent(new CloseActionScreenEvent());
            setTimeout(() => { window.location.reload(); }, 600);
        } catch (e) {
            this.error = (e && e.body && e.body.message) ? e.body.message : 'Error desconocido.';
            this.procesando = false;
        }
    }
}