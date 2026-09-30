import { LightningElement, api } from 'lwc';

// Zoom del lector de PDF: null = ajustado al ancho del visor; si no, porcentaje real del documento
const NIVELES_ZOOM = [50, 75, 100, 125, 150, 200, 300];
const ANCHO_A4 = 595.28; // puntos PDF; si no se puede leer el tamaño de la página
const PX_POR_PUNTO = 96 / 72; // al 100 % el lector pinta 1 punto PDF como 1,33 px
const HUECO_LECTOR = 24; // barra de desplazamiento y margen propio del lector del navegador
const ESPERA_REDIMENSION = 300;
const ANCHO_PAPEL = 560; // ancho máximo de la vista de ejemplo (se escala al ampliar)
const MARGEN_AMPLIADO = 16;
// Alto de la cabecera fija de Lightning (cabecera global 50 px + barra de navegación 40 px) y margen.
// El panel ampliado nunca empieza por encima: quedaría tapado por ella.
const CABECERA_SALESFORCE = 90 + MARGEN_AMPLIADO;
const ALTO_BARRA_AMPLIADO = 40;
const ANCHO_PANTALLA_ESTRECHA = 1100; // por debajo, el panel ocupa casi todo el ancho

/** Página inicial si la URL trae #page=N (documento que empieza a mitad de un PDF mayor) */
function paginaDeUrl(url) {
    const m = /#(?:.*&)?page=(\d+)/.exec(String(url || ''));
    return m ? Number(m[1]) : 1;
}

/** Ancho y alto (en puntos) de la primera página, leídos del /MediaBox del PDF */
function tamanoPagina(texto) {
    const m = /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/.exec(texto);
    if (!m) return null;
    const [x1, y1, x2, y2] = m.slice(1).map(Number);
    const ancho = Math.abs(x2 - x1), alto = Math.abs(y2 - y1);
    return ancho > 0 && alto > 0 ? { ancho, alto } : null;
}

/**
 * Visor del documento con controles propios (diseño v2): zoom, girar, páginas y descargar.
 * - PDF: lector del navegador con su barra oculta (#toolbar=0; Chrome y Edge lo respetan). Como el
 *   PDF está en otro dominio (URL firmada de Google), el visor no puede manejarlo por dentro: el zoom
 *   y la página se le pasan por parámetros de la URL (zoom, page) y el giro se hace girando el visor.
 *   "Ajustado" es un zoom calculado aquí (ancho del visor / ancho de la página): el view=FitH del
 *   lector deja márgenes. El ancho de la página se lee del PDF (se descarga una vez; sirve también
 *   para el botón Descargar).
 * - Imagen: <img> con zoom y giro.
 * - Sin archivo: muestra el contenido del slot (la vista de ejemplo del documento).
 * - "Ampliar" (diseño v2 Híbrido): el mismo visor pasa a un panel fijo más grande (50 % del ancho; casi
 *   todo en pantallas estrechas), con una barra "Vista ampliada" y "Restaurar". Se cierra con Restaurar, Esc
 *   o pulsando fuera. Se abre con el botón de la barra, con la lupa que aparece al pasar por el documento y,
 *   en imagen y en la vista de ejemplo, pulsando el documento. En un PDF no hay clic ni doble clic: el lector
 *   del navegador (otro dominio) se queda con los eventos, y taparlo impediría hacer scroll y seleccionar.
 *   El panel empieza por debajo de la cabecera de Salesforce: es fija y queda por encima de la página, así
 *   que un panel pegado arriba perdía su parte superior (y con ella el encabezado del PDF).
 */
export default class BandejaContableVisor extends LightningElement {
    @api nombre; // nombre con el que se descarga
    @api mime;
    @api descargaUrl; // URL firmada que ya descarga como adjunto (archivos subidos); opcional
    @api paginas; // nº de páginas, si se conoce (documentos separados por Google)

    _url;
    @api
    get url() { return this._url; }
    set url(v) {
        if (v === this._url) return;
        this._url = v;
        this.zoom = null;
        this.giro = 0;
        this.pagina = paginaDeUrl(v);
        this.pagina1 = null;
        this.blob = null;
        this.leido = false;
        if (this.conectado) this.leerPdf();
    }

    zoom = null;
    giro = 0;
    ampliado = false;
    panel = null; // posición del panel ampliado: { top, left, ancho, alto } en px de la ventana
    corregido = false; // ya se comprobó que el panel está donde se pidió
    pagina = 1;
    mesa = { ancho: 0, alto: 0 };
    pagina1 = null; // { ancho, alto } en puntos
    blob = null; // el PDF descargado (para Descargar sin volver a bajarlo)
    leido = false; // ya se intentó leer el tamaño de la página
    conectado = false;
    observador;
    observando = false;
    temporizador;

    connectedCallback() {
        this.conectado = true;
        // El ajuste depende del ancho del visor (y el giro de 90° intercambia ancho y alto)
        if (typeof ResizeObserver !== 'undefined') {
            this.observador = new ResizeObserver(() => {
                clearTimeout(this.temporizador);
                // eslint-disable-next-line @lwc/lwc/no-async-operation
                this.temporizador = setTimeout(() => this.medir(), ESPERA_REDIMENSION);
            });
        }
        this.leerPdf();
    }

    renderedCallback() {
        const mesa = this.refs && this.refs.mesa;
        if (mesa && this.observador && !this.observando) {
            this.observador.observe(mesa);
            this.observando = true;
        }
        if (mesa && !this.mesa.ancho) this.medir();
        if (this.ampliado && !this.corregido) this.corregirPanel();
    }

    disconnectedCallback() {
        this.conectado = false;
        this.cerrarAmpliado();
        clearTimeout(this.temporizador);
        if (this.observador) this.observador.disconnect();
        this.observando = false;
    }

    medir() {
        const mesa = this.refs && this.refs.mesa;
        if (!mesa) return;
        const ancho = mesa.clientWidth, alto = mesa.clientHeight;
        // Cambios pequeños no recargan el lector
        if (Math.abs(ancho - this.mesa.ancho) > 8 || Math.abs(alto - this.mesa.alto) > 8) this.mesa = { ancho, alto };
    }

    /** Descarga el PDF una vez para saber el tamaño de su página (y tenerlo para Descargar) */
    async leerPdf() {
        const url = this._url;
        if (!this.esPdf || this.leido) return;
        try {
            const r = await fetch(url.split('#')[0]);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const blob = await r.blob();
            const texto = new TextDecoder('iso-8859-1').decode(await blob.arrayBuffer());
            if (url !== this._url) return;
            this.blob = blob;
            this.pagina1 = tamanoPagina(texto);
        } catch {
            // sin tamaño: se ajusta como si fuera A4
        } finally {
            if (url === this._url) this.leido = true;
        }
    }

    get esPdf() { return !!this._url && this.mime === 'application/pdf'; }
    get esImagen() { return !!this._url && String(this.mime || '').startsWith('image/'); }
    get sinArchivo() { return !this.esPdf && !this.esImagen; }
    get totalPaginas() { return Number(this.paginas) > 0 ? Number(this.paginas) : null; }
    get conPaginas() { return this.esPdf && this.totalPaginas > 1; }
    get paginaTxt() { return this.esPdf && !this.totalPaginas ? `Pág. ${this.pagina}` : `Pág. ${this.pagina}/${this.totalPaginas || 1}`; }
    get sinAnterior() { return this.pagina <= 1; }
    get sinSiguiente() { return !this.totalPaginas || this.pagina >= this.totalPaginas; }
    get zoomTxt() { return this.zoom === null ? 'Ajustado' : `${this.zoom} %`; }
    get sinMenos() { return this.zoom === NIVELES_ZOOM[0]; }
    get sinMas() { return this.zoom === NIVELES_ZOOM[NIVELES_ZOOM.length - 1]; }
    get sinDescarga() { return !this._url; }

    get tumbado() { return this.giro % 180 !== 0; }
    /** Ancho del lector: el de la mesa, o su alto si está girado 90° */
    get anchoMarco() { return this.tumbado ? this.mesa.alto : this.mesa.ancho; }

    /** Zoom que hace que el ancho de la página ocupe el del visor */
    get zoomAjustado() {
        const ancho = (this.pagina1 && this.pagina1.ancho) || ANCHO_A4;
        return Math.max(10, Math.floor(((this.anchoMarco - HUECO_LECTOR) / (ancho * PX_POR_PUNTO)) * 100));
    }
    get zoomEfectivo() { return this.zoom === null ? this.zoomAjustado : this.zoom; }

    /** URL del lector: sin barra ni panel lateral, con la página y el zoom elegidos */
    get srcPdf() {
        const [base, fragmento] = String(this._url).split('#');
        const opciones = new URLSearchParams(fragmento || '');
        opciones.set('toolbar', '0');
        opciones.set('navpanes', '0');
        opciones.set('page', String(this.pagina));
        opciones.delete('view');
        opciones.set('zoom', String(this.zoomEfectivo));
        return `${base}#${opciones.toString()}`;
    }
    // El lector se abre cuando se sabe el ancho (del visor y de la página), para no cargarlo dos veces.
    // Una clave por URL: al cambiar zoom o página se crea un iframe nuevo y el lector la vuelve a leer.
    get listoPdf() { return this.esPdf && this.mesa.ancho > 0 && (this.leido || this.zoom !== null); }
    get marcos() { return this.listoPdf ? [{ key: this.srcPdf, src: this.srcPdf }] : []; }
    get cargandoPdf() { return this.esPdf && !this.listoPdf; }

    /** El marco se centra y se gira; a 90° y 270° ocupa el alto de la mesa como ancho y viceversa */
    get estiloMarco() {
        const { ancho, alto } = this.mesa;
        const tam = this.tumbado && ancho && alto ? `width:${alto}px;height:${ancho}px` : 'width:100%;height:100%';
        return `${tam};transform:translate(-50%,-50%) rotate(${this.giro}deg)`;
    }
    get estiloImagen() {
        const ancho = this.zoom === null ? 'max-width:100%' : `width:${this.zoom}%;max-width:none`;
        return `${ancho};transform:rotate(${this.giro}deg)`;
    }
    get estiloPapel() {
        // Ampliado y sin zoom elegido: la vista de ejemplo ocupa el ancho del panel
        const auto = this.ampliado && this.zoom === null && this.mesa.ancho ? Math.max(1, (this.mesa.ancho - 2 * MARGEN_AMPLIADO) / ANCHO_PAPEL) : null;
        const escala = auto || (this.zoom || 100) / 100;
        return `transform:scale(${escala}) rotate(${this.giro}deg);transform-origin:top center`;
    }
    get claseMesa() {
        return 'vis-mesa' + (this.esPdf ? ' vis-mesa-pdf' : ' vis-mesa-lupa') + (this.ampliado ? ' vis-mesa-ampliada' : '');
    }
    get estiloMesa() {
        const p = this.panel;
        return this.ampliado && p ? `top:${p.top + ALTO_BARRA_AMPLIADO}px;left:${p.left}px;width:${p.ancho}px;height:${p.alto - ALTO_BARRA_AMPLIADO}px` : '';
    }
    get estiloBarraAmpliado() {
        const p = this.panel;
        return p ? `top:${p.top}px;left:${p.left}px;width:${p.ancho}px;height:${ALTO_BARRA_AMPLIADO}px` : '';
    }
    // La lupa sale al pasar por el documento, cuando hay algo que ampliar
    get conLupa() { return !this.ampliado && (this.esImagen || this.sinArchivo || this.listoPdf); }
    get ampliadoTxt() { return this.ampliado ? 'true' : 'false'; }
    get claseAmpliar() { return 'vis-herramienta' + (this.ampliado ? ' vis-herramienta-on' : ''); }
    get tituloAmpliar() { return this.ampliado ? 'Cerrar la vista ampliada (Esc)' : 'Ver el documento ampliado al 50 % de la pantalla'; }

    // ===== Controles =====
    // En un PDF se parte del zoom real del ajuste; en imagen o vista de ejemplo, del 100 %
    get zoomBase() { return this.zoom !== null ? this.zoom : this.esPdf ? this.zoomAjustado : 100; }
    menosZoom() {
        this.zoom = [...NIVELES_ZOOM].reverse().find((z) => z < this.zoomBase) ?? NIVELES_ZOOM[0];
    }
    masZoom() {
        this.zoom = NIVELES_ZOOM.find((z) => z > this.zoomBase) ?? NIVELES_ZOOM[NIVELES_ZOOM.length - 1];
    }
    ajustar() { this.zoom = null; }

    // ===== Ampliar =====
    toggleAmpliar() {
        if (this.ampliado) this.cerrarAmpliado();
        else this.abrirAmpliado();
    }

    abrirAmpliado() {
        this.panel = this.calcularPanel();
        this.corregido = false;
        this.ampliado = true;
        this.alTeclear = (e) => { if (e.key === 'Escape') this.cerrarAmpliado(); };
        this.alRedimensionar = () => { this.panel = this.calcularPanel(); this.corregido = false; };
        window.addEventListener('keydown', this.alTeclear);
        window.addEventListener('resize', this.alRedimensionar);
    }

    /**
     * Dónde va el panel: a la altura del visor si se ve arriba en la pantalla y, si no, justo debajo de la
     * cabecera de Salesforce; alto hasta el borde inferior; ancho del 50 % (casi todo en pantallas estrechas)
     * y, como mínimo, algo más que el visor, para que ampliar siempre amplíe.
     */
    calcularPanel() {
        const W = window.innerWidth, H = window.innerHeight;
        const r = this.template.host.getBoundingClientRect();
        const maximo = W - 2 * MARGEN_AMPLIADO;
        const ancho = W <= ANCHO_PANTALLA_ESTRECHA ? maximo : Math.min(maximo, Math.max(Math.round(W * 0.5), Math.round(r.width * 1.25)));
        const left = Math.max(MARGEN_AMPLIADO, Math.min(r.left, W - ancho - MARGEN_AMPLIADO));
        const top = r.top >= CABECERA_SALESFORCE && r.top <= H * 0.4 ? Math.round(r.top) : CABECERA_SALESFORCE;
        return { top, left, ancho, alto: Math.max(240, H - top - MARGEN_AMPLIADO) };
    }

    /**
     * Si algún contenedor de la página tiene transformaciones, "fixed" se coloca respecto a él y no respecto a
     * la ventana: se mide dónde ha quedado la barra y se compensa la diferencia una vez.
     */
    corregirPanel() {
        const barra = this.template.querySelector('.vis-ampliado-barra');
        if (!barra || !this.panel) return;
        this.corregido = true;
        const r = barra.getBoundingClientRect();
        const dy = r.top - this.panel.top, dx = r.left - this.panel.left;
        // Sin tamaño todavía (no se ha pintado) la medida no vale
        if (r.width > 0 && (Math.abs(dy) > 2 || Math.abs(dx) > 2)) this.panel = { ...this.panel, top: this.panel.top - dy, left: this.panel.left - dx };
        // Foco en Restaurar: así Esc funciona aunque el foco estuviera en el lector de PDF
        const restaurar = this.template.querySelector('.vis-restaurar');
        if (restaurar) restaurar.focus();
    }

    cerrarAmpliado() {
        if (this.alTeclear) window.removeEventListener('keydown', this.alTeclear);
        if (this.alRedimensionar) window.removeEventListener('resize', this.alRedimensionar);
        this.alTeclear = null;
        this.alRedimensionar = null;
        this.ampliado = false;
        this.panel = null;
    }

    /** Lupa que aparece al pasar por el documento (también sobre un PDF) */
    ampliarDesdeLupa(e) {
        e.stopPropagation(); // está dentro del documento: que el clic no llegue a pulsarMesa
        this.abrirAmpliado();
    }

    /** Pulsar la imagen o la vista de ejemplo la amplía; ya ampliada, la cierra */
    pulsarMesa() {
        if (this.esPdf) return;
        this.toggleAmpliar();
    }
    girar() { this.giro = (this.giro + 90) % 360; }
    anterior() { if (!this.sinAnterior) this.pagina--; }
    siguiente() { if (!this.sinSiguiente) this.pagina++; }

    /** Descarga el archivo con su nombre (fetch + blob; el bucket tiene CORS para Salesforce) */
    async descargar() {
        if (!this._url) return;
        if (!this.blob && this.descargaUrl && this.descargaUrl !== this._url) {
            this.enlace(this.descargaUrl); // ya viene firmada como adjunto con el nombre original
            return;
        }
        try {
            let blob = this.blob;
            if (!blob) {
                const r = await fetch(this._url.split('#')[0]);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                blob = await r.blob();
            }
            const url = URL.createObjectURL(blob);
            this.enlace(url, this.nombre || 'documento');
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch {
            this.enlace(this.descargaUrl || this._url); // sin CORS: al menos se abre el archivo
        }
    }

    enlace(href, nombre) {
        const a = document.createElement('a');
        a.href = href;
        a.rel = 'noopener';
        if (nombre) a.download = nombre;
        else a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
}
