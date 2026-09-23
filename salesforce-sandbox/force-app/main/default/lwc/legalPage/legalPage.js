import { LightningElement, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import basePath from '@salesforce/community/basePath';

/**
 * Página legal reutilizable (Aviso legal / Privacidad / Cookies).
 * Se coloca una instancia por página con la propiedad "doc".
 */
export default class LegalPage extends NavigationMixin(LightningElement) {
    @api doc = 'aviso';

    get isAviso() {
        return this.doc === 'aviso';
    }
    get isPriv() {
        return this.doc === 'privacidad';
    }
    get isCookies() {
        return this.doc === 'cookies';
    }
    get pageTitle() {
        if (this.isPriv) return 'Política de privacidad';
        if (this.isCookies) return 'Política de cookies';
        return 'Aviso legal';
    }

    goHome() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: (basePath || '') + '/' }
        });
    }
}