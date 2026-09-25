import LightningModal from 'lightning/modal';

/**
 * Modal "Nuevo" de la Bandeja Contable. Envuelve bandejaContableNuevo (que también se podrá usar
 * fuera del modal, p. ej. en el portal) y devuelve al cerrar { bandejaId } si se creó una bandeja.
 */
export default class BandejaContableNuevoModal extends LightningModal {
    bandejaId = null;
    trabajando = false;

    handleTrabajando(e) {
        this.trabajando = e.detail;
        // Mientras sube no se puede cerrar el modal con la X ni con Escape
        this.disableClose = e.detail;
    }

    handleFinalizado(e) {
        this.bandejaId = e.detail.bandejaId;
    }

    get cerrarLabel() {
        return this.bandejaId ? 'Cerrar' : 'Cancelar';
    }

    handleCerrar() {
        this.close({ bandejaId: this.bandejaId });
    }
}
