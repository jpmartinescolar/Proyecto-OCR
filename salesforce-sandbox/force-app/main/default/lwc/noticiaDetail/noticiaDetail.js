import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation';
import getNoticiaPorClave from '@salesforce/apex/NoticiasController.getNoticiaPorClave';
import basePath from '@salesforce/community/basePath';

export default class NoticiaDetail extends NavigationMixin(LightningElement) {
    _recordId;
    key;
    noticia;
    loading = true;
    notFound = false;
    _bodyRendered;

    // recordId lo inyecta la página de detalle de contenido gestionado ({!recordId}).
    @api
    get recordId() {
        return this._recordId;
    }
    set recordId(value) {
        this._recordId = value;
        this.computeKey();
    }

    @wire(CurrentPageReference)
    onPageRef() {
        this.computeKey();
    }

    // Preferimos el recordId (id del contenido) para traer la noticia en una sola consulta.
    // Si no está (deep-link directo), usamos el último segmento de la URL (urlName) como respaldo.
    computeKey() {
        let k = null;
        // 1) Clave pasada en el enlace (?k=) desde el listado/buscador: la más fiable.
        try {
            const params = new URLSearchParams((window.location && window.location.search) || '');
            k = params.get('k');
        } catch (e) {
            k = null;
        }
        // 2) recordId que inyecta la página de detalle de contenido gestionado.
        if (!k) k = this._recordId || null;
        // 3) Respaldo: último segmento de la URL (urlName).
        if (!k) {
            try {
                const segs = ((window.location && window.location.pathname) || '').split('/').filter(Boolean);
                if (segs.length) k = decodeURIComponent(segs[segs.length - 1]);
            } catch (e) {
                k = null;
            }
        }
        if (k && k !== this.key) {
            this.key = k;
            this.loadNoticia();
        }
    }

    get mediaPrefix() {
        return (basePath || '') + 'vforcesite';
    }

    // Una sola consulta al servidor (no traemos todas para encontrar una): rápido y a escala.
    loadNoticia() {
        if (!this.key) return;
        this.loading = true;
        getNoticiaPorClave({ key: this.key })
            .then((data) => {
                if (data) {
                    this.noticia = {
                        ...data,
                        imageUrl: data.imageUrl ? this.mediaPrefix + data.imageUrl : null,
                        hasImg: !!data.imageUrl
                    };
                    this.notFound = false;
                    this._bodyRendered = null;
                } else {
                    this.notFound = true;
                }
            })
            .catch(() => {
                this.notFound = true;
            })
            .finally(() => {
                this.loading = false;
            });
    }

    renderedCallback() {
        if (!this.noticia) return;
        const c = this.template.querySelector('.nvd-body');
        if (c && this._bodyRendered !== this.noticia.id) {
            c.innerHTML = this.cleanBody(this.noticia.body) || '<p>Sin contenido.</p>';
            this.styleBody(c);
            this._bodyRendered = this.noticia.id;
        }
    }

    // En el shadow DOM, las reglas CSS del componente no alcanzan al HTML inyectado
    // por innerHTML; aplicamos estilos inline para respetar listas, espaciado y enlaces.
    styleBody(c) {
        c.querySelectorAll('p').forEach((el) => { el.style.margin = '0 0 14px'; });
        c.querySelectorAll('ul').forEach((el) => {
            el.style.listStyle = 'disc outside';
            el.style.padding = '0 0 0 26px';
            el.style.margin = '6px 0 16px';
        });
        c.querySelectorAll('ol').forEach((el) => {
            el.style.listStyle = 'decimal outside';
            el.style.padding = '0 0 0 26px';
            el.style.margin = '6px 0 16px';
        });
        c.querySelectorAll('li').forEach((el) => {
            el.style.display = 'list-item';
            el.style.marginBottom = '8px';
            el.style.paddingLeft = '4px';
        });
        c.querySelectorAll('strong, b').forEach((el) => { el.style.color = '#0E3A66'; });
        c.querySelectorAll('a').forEach((el) => { el.style.color = '#0078FF'; });
        c.querySelectorAll('img').forEach((el) => {
            el.style.maxWidth = '100%';
            el.style.height = 'auto';
            el.style.borderRadius = '10px';
            el.style.margin = '16px 0';
        });
    }

    // El CMS (editor Quill) mete un <p><br></p> entre cada bloque y pone cada
    // viñeta en su propio <ul>. Limpiamos para respetar la estructura y el espaciado.
    cleanBody(html) {
        if (!html) return '';
        return html
            // elimina párrafos vacíos (con <br>, &nbsp; o vacíos), con o sin clases
            .replace(/<p[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '')
            // une listas consecutivas en una sola (cada viñeta venía suelta)
            .replace(/<\/ul>\s*<ul[^>]*>/gi, '')
            .replace(/<\/ol>\s*<ol[^>]*>/gi, '')
            // las imágenes del cuerpo vienen como /cms/delivery/media/...: prefijar el Site.com
            .replace(/(["'])\/cms\/delivery\/media\//gi, '$1' + this.mediaPrefix + '/cms/delivery/media/')
            .trim();
    }

    goBack() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: (basePath || '') + '/listado-noticias' }
        });
    }

    goHome() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: (basePath || '') + '/' }
        });
    }
}