import { LightningElement, api } from 'lwc';

// Zoom del lector de PDF: null = ajustado al ancho del visor; si no, porcentaje real del documento
const NIVELES_ZOOM = [50, 75, 100, 125, 150, 200, 300];
const ANCHO_A4 = 595.28; // puntos PDF; si no se puede leer el tamaño de la página
const PX_POR_PUNTO = 96 / 72; // al 100 % el lector pinta 1 punto PDF como 1,33 px
const HUECO_LECTOR = 24; // barra de desplazamiento y margen propio del lector del navegador
const ESPERA_REDIMENSION = 300;
const ANCHO_PAPEL = 560; // ancho máximo de la vista de ejemplo (en el visor ampliado se escala al ancho)
const MARGEN_PAPEL = 16;

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
 * - "Ampliar" (diseño v2 Híbrido): con el botón o con la lupa que aparece al pasar por el documento (y, en
 *   imagen y vista de ejemplo, pulsándolo) se avisa con el evento "ampliar" { pagina, previo } y el
 *   documento abre el panel bandejaContableVisorAmpliado, con otro visor en modo="ampliado" que ocupa todo su
 *   alto (el PDF se recorre con el scroll del lector). La lupa va abajo a la derecha y siempre a la vista:
 *   en un PDF, sobre el lector; en imagen y vista de ejemplo, flotando al final de lo visible. En un PDF
 *   no hay clic ni doble clic: el lector del navegador (otro dominio) se queda con los eventos.
 * - Mientras el lector de PDF carga se ve el spinner estándar y el lector queda oculto: no se ve el PDF a
 *   medio ajustar. El lector se crea cuando ya se conoce el ancho del visor.
 */
export default class BandejaContableVisor extends LightningElement {
    @api nombre; // nombre con el que se descarga
    @api mime;
    @api descargaUrl; // URL firmada que ya descarga como adjunto (archivos subidos); opcional
    @api paginas; // nº de páginas, si se conoce (documentos separados por Google)
    @api modo; // 'ampliado' dentro del modal del visor ampliado
    @api paginaInicial; // página con la que se abre (la que se veía antes de ampliar)
    @api previo; // { blob, pagina1 } ya leídos por otro visor: no se vuelve a descargar el PDF

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
    marcoCargado = null; // src del lector que ya ha terminado de cargar
    paginaCompleta = false; // ajuste a la página entera en lugar de al ancho (visor ampliado)
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
        if (Number(this.paginaInicial) > 0) this.pagina = Number(this.paginaInicial);
        if (this.previo && this.esPdf) {
            this.blob = this.previo.blob || null;
            this.pagina1 = this.previo.pagina1 || null;
            this.leido = true;
        }
        // El ajuste depende del ancho del visor (y el giro de 90° intercambia ancho y alto)
        if (typeof ResizeObserver !== 'undefined') {
            this.observador = new ResizeObserver(() => {
                // La primera medida, sin esperar: el lector se crea directamente con su tamaño final
                if (!this.mesa.ancho) {
                    this.medir();
                    return;
                }
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
    }

    disconnectedCallback() {
        this.conectado = false;
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
    get zoomTxt() { return this.zoom === null ? (this.paginaCompleta ? 'Página' : 'Ajustado') : `${this.zoom} %`; }
    get sinMenos() { return this.zoom === NIVELES_ZOOM[0]; }
    get sinMas() { return this.zoom === NIVELES_ZOOM[NIVELES_ZOOM.length - 1]; }
    get sinDescarga() { return !this._url; }

    get tumbado() { return this.giro % 180 !== 0; }
    /** Ancho del lector: el de la mesa, o su alto si está girado 90° */
    get anchoMarco() { return this.tumbado ? this.mesa.alto : this.mesa.ancho; }

    get altoMarco() { return this.tumbado ? this.mesa.ancho : this.mesa.alto; }

    /**
     * Zoom del ajuste: el ancho de la página ocupa el del visor ("Ajustar al ancho", el de siempre) o, con
     * "Página completa" (solo en el visor ampliado), la página entera cabe en el alto sin scroll.
     */
    get zoomAjustado() {
        const ancho = (this.pagina1 && this.pagina1.ancho) || ANCHO_A4;
        const alPorAncho = ((this.anchoMarco - HUECO_LECTOR) / (ancho * PX_POR_PUNTO)) * 100;
        if (!this.paginaCompleta) return Math.max(10, Math.floor(alPorAncho));
        const alto = (this.pagina1 && this.pagina1.alto) || ANCHO_A4 * Math.SQRT2;
        const alPorAlto = ((this.altoMarco - HUECO_LECTOR) / (alto * PX_POR_PUNTO)) * 100;
        return Math.max(10, Math.floor(Math.min(alPorAncho, alPorAlto)));
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
    // Hasta que el lector avisa de que ha cargado: spinner y lector oculto (sin estados intermedios a la vista)
    get cargandoPdf() { return this.esPdf && (!this.listoPdf || this.marcoCargado !== this.srcPdf); }
    get claseMarco() { return 'vis-marco' + (this.marcoCargado === this.srcPdf ? '' : ' vis-marco-oculto'); }
    alCargarMarco(e) { this.marcoCargado = e.target.getAttribute('src'); }

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
        // En el visor ampliado y sin zoom elegido, la vista de ejemplo ocupa el ancho
        const auto = this.esAmpliado && this.zoom === null && this.mesa.ancho ? Math.max(1, (this.mesa.ancho - 2 * MARGEN_PAPEL) / ANCHO_PAPEL) : null;
        const escala = auto || (this.zoom || 100) / 100;
        return `transform:scale(${escala}) rotate(${this.giro}deg);transform-origin:top center`;
    }
    get esAmpliado() { return this.modo === 'ampliado'; }
    get claseMesa() {
        return 'vis-mesa' + (this.esPdf ? ' vis-mesa-pdf' : this.esAmpliado ? '' : ' vis-mesa-lupa') + (this.esAmpliado ? ' vis-mesa-ampliada' : '');
    }
    // La lupa sale al pasar por el documento, cuando hay algo que ampliar (en el visor ampliado, no)
    get claseLupa() { return 'vis-lupa ' + (this.esPdf ? 'vis-lupa-pdf' : 'vis-lupa-flotante'); }
    get conLupa() { return !this.esAmpliado && (this.esImagen || this.sinArchivo || this.listoPdf); }
    get conAmpliar() { return !this.esAmpliado; }
    get conAjustePagina() { return this.esAmpliado && this.esPdf; }
    get textoAjustePagina() { return this.paginaCompleta ? 'Ajustar al ancho' : 'Página completa'; }
    toggleAjustePagina() {
        this.paginaCompleta = !this.paginaCompleta;
        this.zoom = null;
    }

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
    /** Pide al documento el visor ampliado, con la página que se ve y el PDF ya leído */
    ampliar(e) {
        if (e) e.stopPropagation(); // la lupa está dentro del documento: que no cuente también como pulsarMesa
        this.dispatchEvent(new CustomEvent('ampliar', {
            detail: { pagina: this.pagina, previo: this.leido ? { blob: this.blob, pagina1: this.pagina1 } : null }
        }));
    }

    /** Pulsar la imagen o la vista de ejemplo la amplía (en un PDF el lector se queda con el clic) */
    pulsarMesa() {
        if (!this.esPdf && !this.esAmpliado) this.ampliar();
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
