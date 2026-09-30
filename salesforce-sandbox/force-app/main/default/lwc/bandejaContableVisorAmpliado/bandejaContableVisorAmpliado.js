import { LightningElement, api } from 'lwc';

/**
 * Visor ampliado del documento: panel que el documento coloca sobre la mitad izquierda de la pantalla,
 * anclado a la página (se mueve con su scroll, así que nunca queda tapado para siempre por la cabecera de
 * Salesforce). Mide lo que el PDF: el ancho del panel y el alto de una página a ese ancho.
 * Se cierra con la × (estándar de Salesforce), con Esc o con un clic fuera (el fondo lo pone el documento).
 * Descartado lightning-modal: solo tiene tamaños fijos, siempre centrado y sin cierre con clic fuera.
 * El visor de dentro se crea ya con el tamaño final y reutiliza el PDF que había descargado el de la página;
 * el de la página no se toca, así que al cerrar no hay saltos. Avisa con el evento "cerrar".
 */
export default class BandejaContableVisorAmpliado extends LightningElement {
    @api url;
    @api mime;
    @api nombre;
    @api descargaUrl;
    @api paginas;
    @api pagina; // página que se estaba viendo
    @api previo; // { blob, pagina1 } del visor de la página: evita volver a descargar el PDF
    @api papel; // vista de ejemplo cuando no hay archivo

    connectedCallback() {
        this.alTeclear = (e) => { if (e.key === 'Escape') this.cerrar(); };
        window.addEventListener('keydown', this.alTeclear);
    }

    disconnectedCallback() {
        window.removeEventListener('keydown', this.alTeclear);
    }

    renderedCallback() {
        // Foco en cerrar: Esc funciona desde el primer momento y el lector de pantalla anuncia el panel
        if (!this.enfocado) {
            this.enfocado = true;
            const x = this.template.querySelector('lightning-button-icon');
            if (x) x.focus();
        }
    }

    get titulo() { return this.nombre || 'Documento'; }

    cerrar() {
        this.dispatchEvent(new CustomEvent('cerrar'));
    }
}
