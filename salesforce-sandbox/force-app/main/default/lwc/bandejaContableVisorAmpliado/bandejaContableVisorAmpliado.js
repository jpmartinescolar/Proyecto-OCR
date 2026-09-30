import { api } from 'lwc';
import LightningModal from 'lightning/modal';

/**
 * Visor ampliado del documento: modal estándar de Salesforce a pantalla completa (se abre con "Ampliar" o
 * con la lupa del visor). La plataforma lo coloca por encima de su cabecera y trae el cierre con Esc y con
 * la × y la gestión del foco. Además se cierra con un clic fuera del documento: el documento tiene un ancho
 * de lectura máximo y el espacio de los lados es de este modal.
 * El visor de dentro se crea ya con el tamaño final (sin estado intermedio) y reutiliza el PDF que había
 * descargado el visor de la página; el de la página no se toca, así que al cerrar no hay saltos.
 */
export default class BandejaContableVisorAmpliado extends LightningModal {
    @api url;
    @api mime;
    @api nombre;
    @api descargaUrl;
    @api paginas;
    @api pagina; // página que se estaba viendo
    @api previo; // { blob, pagina1 } del visor de la página: evita volver a descargar el PDF
    @api papel; // vista de ejemplo cuando no hay archivo

    get titulo() { return this.nombre || 'Documento'; }

    /** Clic en el espacio de alrededor del documento (no dentro de él) */
    pulsarFondo(e) {
        if (e.target === e.currentTarget) this.close();
    }
}
