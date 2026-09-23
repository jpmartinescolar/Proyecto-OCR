import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getNoticias from '@salesforce/apex/NoticiasController.getNoticias';
import buscar from '@salesforce/apex/NoticiasController.buscar';
import basePath from '@salesforce/community/basePath';

export default class NoticiasList extends NavigationMixin(LightningElement) {
    // Configurables (desde la página o el componente padre)
    @api heading = 'Noticias y novedades';
    @api subheading = 'Avisos y análisis fiscales, laborales y jurídicos de nuestro equipo.';
    @api maxItems = 0; // 0 = sin límite (lo usa la Home con 3)
    @api paging = false; // true en la página de listado (botón "Ver más" + buscador)
    @api pageSize = 9;
    @api showViewAll = false; // botón "Ver todas las noticias" (Home)
    @api viewAllLabel = 'Ver todas las noticias';
    @api eyebrow = 'Actualidad';

    all = [];
    loading = true;
    error = false;
    visibleCount = 9;

    // --- Buscador (solo en la página de listado) ---
    search = '';
    results = [];
    searchPage = 0;
    searchHasMore = false;
    searching = false;
    searched = false; // ya se lanzó una búsqueda con el término actual
    _debounce;

    connectedCallback() {
        this.visibleCount = this.pageSize > 0 ? this.pageSize : 9;
    }

    // Los medios de Salesforce CMS se entregan desde el Site.com asociado, cuyo prefijo
    // es <prefijoExperience>+"vforcesite" (p.ej. /clientes -> /clientesvforcesite).
    get mediaPrefix() {
        return (basePath || '') + 'vforcesite';
    }

    // En la página de listado (paginación) la sección va justo bajo la cabecera.
    get sectionClass() {
        return this.paging ? 'nvn nvn-compact' : 'nvn';
    }

    // El buscador solo aparece en la página de listado, no en la Home.
    get showSearch() {
        return this.paging;
    }

    get isSearching() {
        return this.search.trim().length > 0;
    }

    @wire(getNoticias, { lim: 200 })
    wiredNoticias({ data, error }) {
        if (data) {
            const prefix = this.mediaPrefix;
            this.all = data.map((n) => {
                const url = n.imageUrl ? prefix + n.imageUrl : null;
                return { ...n, imageUrl: url, hasImg: !!url };
            });
            this.loading = false;
        } else if (error) {
            this.error = true;
            this.loading = false;
        }
    }

    // Lo que se pinta: resultados de búsqueda si hay término; si no, el listado normal.
    get noticias() {
        if (this.isSearching) return this.results;
        const list = this.all;
        if (this.paging) return list.slice(0, this.visibleCount);
        const max = parseInt(this.maxItems, 10);
        if (max > 0) return list.slice(0, max);
        return list;
    }

    get hasNoticias() {
        return this.all && this.all.length > 0;
    }

    // "Ver más": del buscador (servidor) o del listado (cliente).
    get hasMore() {
        if (this.isSearching) return this.searchHasMore;
        return this.paging && this.visibleCount < this.all.length;
    }

    get noResults() {
        return this.isSearching && this.searched && !this.searching && this.results.length === 0;
    }

    get hasResults() {
        return !this.isSearching || this.results.length > 0;
    }

    get searchLabel() {
        if (this.searching && this.results.length === 0) return 'Buscando…';
        if (!this.isSearching) return '';
        const n = this.results.length;
        const plus = this.searchHasMore ? '+' : '';
        return n === 1 ? '1 resultado' : n + ' resultados' + plus;
    }

    handleSearchInput(event) {
        this.search = event.target.value;
        window.clearTimeout(this._debounce);
        if (!this.isSearching) {
            this.results = [];
            this.searched = false;
            this.searchHasMore = false;
            return;
        }
        // Espera a que el usuario deje de teclear (300 ms) antes de preguntar al servidor.
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._debounce = window.setTimeout(() => this.runSearch(true), 300);
    }

    clearSearch() {
        window.clearTimeout(this._debounce);
        this.search = '';
        this.results = [];
        this.searched = false;
        this.searchHasMore = false;
        this.searchPage = 0;
    }

    runSearch(reset) {
        const term = this.search.trim();
        if (!term) return;
        if (reset) {
            this.searchPage = 0;
            this.results = [];
        }
        this.searching = true;
        const prefix = this.mediaPrefix;
        buscar({ q: term, page: this.searchPage })
            .then((res) => {
                const items =
                    res && res.items
                        ? res.items.map((n) => {
                              const url = n.imageUrl ? prefix + n.imageUrl : null;
                              return { ...n, imageUrl: url, hasImg: !!url };
                          })
                        : [];
                this.results = reset ? items : this.results.concat(items);
                this.searchHasMore = !!(res && res.hasMore);
                this.searched = true;
            })
            .catch(() => {
                if (reset) this.results = [];
                this.searchHasMore = false;
                this.searched = true;
            })
            .finally(() => {
                this.searching = false;
            });
    }

    loadMore() {
        if (this.isSearching) {
            this.searchPage += 1;
            this.runSearch(false);
            return;
        }
        this.visibleCount += this.pageSize > 0 ? this.pageSize : 9;
    }

    openArticle(event) {
        const ds = event.currentTarget.dataset;
        if (!ds.url) return;
        let url = (basePath || '') + '/news/' + ds.url;
        // Pasamos la clave del contenido para que el detalle la traiga en una sola consulta,
        // funcione la noticia que funcione (también las antiguas abiertas desde el buscador).
        if (ds.key) url += '?k=' + encodeURIComponent(ds.key);
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url }
        });
    }

    goToList() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: (basePath || '') + '/listado-noticias' }
        });
    }
}