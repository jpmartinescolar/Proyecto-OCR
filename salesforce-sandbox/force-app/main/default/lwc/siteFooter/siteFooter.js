import { LightningElement } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import basePath from '@salesforce/community/basePath';

/**
 * Pie de página reutilizable de Rosetta Advisor para las páginas internas
 * (listado de noticias, detalle, páginas legales). Replica el footer de la Home.
 */
export default class SiteFooter extends NavigationMixin(LightningElement) {
    get base() {
        return basePath || '';
    }
    get year() {
        return '2026';
    }

    handleNav(event) {
        event.preventDefault();
        const t = event.currentTarget.dataset.target;
        const d = event.currentTarget.dataset.doc;
        let url;
        if (d) {
            const map = { aviso: '/aviso-legal', privacidad: '/privacidad', cookies: '/cookies' };
            url = this.base + (map[d] || '/');
        } else if (t === 'noticias') {
            url = this.base + '/listado-noticias';
        } else if (t === 'inicio') {
            url = this.base + '/';
        } else {
            url = this.base + '/#' + t;
        }
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url }
        });
    }
}