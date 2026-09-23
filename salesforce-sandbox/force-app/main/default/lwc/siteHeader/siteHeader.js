import { LightningElement } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import basePath from '@salesforce/community/basePath';

/**
 * Cabecera reutilizable de Rosetta Advisor para las páginas internas
 * (listado de noticias, detalle…). Replica el menú superior de la Home.
 * Los enlaces de sección navegan a la Home con ancla (#seccion); la Home
 * detecta el hash al cargar y hace scroll a esa sección.
 */
export default class SiteHeader extends NavigationMixin(LightningElement) {
    menuOpen = false;

    get base() {
        return basePath || '';
    }
    get navClass() {
        return this.menuOpen ? 'nv-nav nv-nav-open' : 'nv-nav';
    }
    toggleMenu() {
        this.menuOpen = !this.menuOpen;
    }

    handleNav(event) {
        event.preventDefault();
        this.menuOpen = false;
        const t = event.currentTarget.dataset.target;
        let url;
        if (t === 'noticias') url = this.base + '/listado-noticias';
        else if (t === 'login') url = this.base + '/login';
        else if (t === 'inicio') url = this.base + '/';
        else url = this.base + '/#' + t;
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url }
        });
    }
}