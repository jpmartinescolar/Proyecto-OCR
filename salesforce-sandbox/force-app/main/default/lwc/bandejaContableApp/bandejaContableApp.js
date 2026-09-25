import { LightningElement, wire } from 'lwc';
import { CurrentPageReference, NavigationMixin } from 'lightning/navigation';

const PAGINA = 'Bandeja_Contable';

/**
 * Página de la Bandeja Contable. Hace de "router": la pantalla actual va en el estado de la URL
 * (c__vista, c__bandeja, c__doc, c__empresa, c__tab) para que funcionen el botón atrás del navegador,
 * recargar y compartir enlaces. Las pantallas piden navegar con el evento "navegar".
 */
export default class BandejaContableApp extends NavigationMixin(LightningElement) {
    vista = 'lista';
    bandejaId;
    docId;
    empresaId;
    tab;

    @wire(CurrentPageReference)
    leerUrl(ref) {
        const s = (ref && ref.state) || {};
        this.vista = s.c__vista || 'lista';
        this.bandejaId = s.c__bandeja;
        this.docId = s.c__doc;
        this.empresaId = s.c__empresa;
        this.tab = s.c__tab;
    }

    get esLista() { return this.vista === 'lista'; }
    get esRegistro() { return this.vista === 'registro'; }
    get esDocumento() { return this.vista === 'documento'; }
    get esOcr() { return this.vista === 'ocr' || this.vista === 'ocrEmpresas'; }
    get agruparPorEmpresa() { return this.vista === 'ocrEmpresas'; }
    get esEmpresa() { return this.vista === 'empresa'; }

    // La pestaña OCR queda activa también en un documento abierto desde el listado OCR
    get enOcr() { return this.esOcr || (this.esDocumento && this.tab === 'ocr'); }
    get claseTabBandeja() { return 'bc-nav-tab' + (this.enOcr ? '' : ' bc-nav-tab-on'); }
    get claseTabOcr() { return 'bc-nav-tab' + (this.enOcr ? ' bc-nav-tab-on' : ''); }

    irABandeja() { this.navegar({ vista: 'lista' }); }
    irAOcr() { this.navegar({ vista: 'ocr' }); }

    handleNavegar(e) {
        this.navegar(e.detail || {});
    }

    navegar({ vista, bandejaId, docId, empresaId, tab }) {
        const state = { c__vista: vista };
        if (bandejaId) state.c__bandeja = bandejaId;
        if (docId) state.c__doc = docId;
        if (empresaId) state.c__empresa = empresaId;
        if (tab) state.c__tab = tab;
        this[NavigationMixin.Navigate]({ type: 'standard__navItemPage', attributes: { apiName: PAGINA }, state });
        window.scrollTo(0, 0);
    }
}
