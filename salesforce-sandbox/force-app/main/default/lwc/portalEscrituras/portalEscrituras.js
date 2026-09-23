import { LightningElement, api, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import basePath from '@salesforce/community/basePath';
import getEscrituras from '@salesforce/apex/PortalEscriturasController.getEscrituras';
import getEmpresas from '@salesforce/apex/PortalEscriturasController.getEmpresas';
import getDetalle from '@salesforce/apex/PortalEscriturasController.getDetalle';

// Espera tras la última tecla antes de consultar
const DEBOUNCE_MS = 350;
// Tope de páginas que se intentan cargar de un documento
const MAX_PAGINAS = 500;
// Páginas que se piden por delante de la última cargada
const PAGINAS_ANTICIPADAS = 2;
// Reintentos de la primera página (Salesforce genera la vista previa la
// primera vez que se pide y mientras tanto responde un error): ~2,5 minutos
const MAX_INTENTOS_PAGINA0 = 40;
// Reintentos de las demás páginas antes de dar el documento por terminado
const MAX_INTENTOS_PAGINA = 2;
const RETRASO_REINTENTO_MS = 1200;
// Si una página no responde ni bien ni mal en este tiempo se reintenta
const TIMEOUT_PAGINA_MS = 25000;
const ZOOMS = [50, 65, 80, 100, 125, 150, 200];
// Tamaño de página del visor al abrir un documento
const ZOOM_DEFECTO = 65;
// Rutas por las que un sitio Experience puede servir el servlet de archivos:
// la normal y la de recursos "core" que usan los sitios LWR
const RUTAS_SERVLET = ['', '/sfsites/c'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Escrituras del portal de clientes: listado con filtros (buscador único sobre
 * título, notario y nº de escritura; rango de fechas; una o varias empresas) y
 * ficha de detalle con visor del documento adjunto.
 *
 * El visor no incrusta el PDF en un iframe (Salesforce lo sirve con
 * Content-Disposition: attachment, así que el navegador lo descargaría) sino
 * que pinta, una debajo de otra, las páginas que la propia plataforma renderiza
 * (renditionDownload?rendition=SVGZ&page=N), igual que hace el visor estándar
 * de Archivos. Como no hay forma de saber el nº de páginas de antemano, se van
 * pidiendo por delante hasta que una devuelve error.
 *
 * Robustez del visor:
 * - La primera página se pide sola; las siguientes solo cuando ya ha cargado
 *   (así la sesión del dominio de archivos se establece con una única petición).
 * - Si la primera página falla se reintenta con pausa creciente durante varios
 *   minutos, porque Salesforce contesta "Creating renditions of the file"
 *   (HTTP 202) mientras genera la vista previa la primera vez que se pide.
 * - Las demás páginas se reintentan un par de veces antes de concluir que el
 *   documento ha terminado, para que un fallo puntual no lo corte.
 * - Cada página lleva un identificador único por documento e intento, y los
 *   eventos de imágenes que ya no están en la lista se ignoran: al cambiar de
 *   documento, las cargas pendientes del anterior no pueden tocar el nuevo.
 */
export default class PortalEscrituras extends LightningElement {
    @api titulo = 'Escrituras';
    @api subtitulo;
    @api filasPorPagina = 25;

    // ----- Listado -----
    filas = [];
    total = 0;
    hayMas = false;
    cursorFecha = null;
    cursorId = null;
    cargando = false;
    error;

    texto = '';
    desde = '';
    hasta = '';
    debounce;
    // Nº de petición en curso: descarta respuestas de filtros ya antiguos
    peticion = 0;

    // ----- Filtro de empresas -----
    empresas = [];
    cargandoEmpresas = false;
    empresasAbierto = false;
    filtroEmpresas = '';
    empresasSeleccionadas = [];

    // ----- Detalle -----
    vista = 'listado';
    detalle;
    cargandoDetalle = false;
    errorDetalle;
    adjuntoActivo;

    // ----- Visor -----
    paginas = [];
    totalPaginas;
    paginaActual = 1;
    zoom = ZOOM_DEFECTO;
    cargandoPaginas = false;
    preparandoVistaPrevia = false;
    previsualizacionFallida = false;
    scrollPendiente = false;
    detalleInicialAbierto = false;
    // Identificador de la carga en curso: cambia con cada documento elegido
    cargaId = 0;
    intentosPagina0 = 0;
    intentosPorPagina = {};
    paginasCargadas = new Set();
    temporizadores = [];
    // Ruta del servlet de archivos en uso (ver RUTAS_SERVLET)
    rutaServlet = 0;

    connectedCallback() {
        this.cargarListado(true);
        this.cargarEmpresas();
    }

    disconnectedCallback() {
        window.clearTimeout(this.debounce);
        this.cancelarTemporizadores();
    }

    // Enlace directo a una escritura: ...?escritura=<Id>
    @wire(CurrentPageReference)
    leerPagina(pageRef) {
        const id = pageRef && pageRef.state && pageRef.state.escritura;
        if (id && !this.detalleInicialAbierto) {
            this.detalleInicialAbierto = true;
            this.abrirDetalle(id);
        }
    }

    // =====================================================================
    // Listado
    // =====================================================================
    get enListado() { return this.vista === 'listado'; }
    get enDetalle() { return this.vista === 'detalle'; }

    get hayFilas() { return this.filas.length > 0; }
    get mostrarCargaInicial() { return this.cargando && !this.hayFilas; }
    get mostrarVacio() { return !this.cargando && !this.error && !this.hayFilas; }
    get hayFiltros() {
        return !!(this.texto || this.desde || this.hasta || this.empresasSeleccionadas.length);
    }
    get fechasInvertidas() { return !!(this.desde && this.hasta && this.desde > this.hasta); }

    get etiquetaPaginacion() { return this.filas.length + '/' + this.total; }

    get etiquetaVerMas() {
        const restantes = this.total - this.filas.length;
        const siguientes = Math.min(restantes, this.tamanoPagina);
        return 'Ver ' + siguientes + ' más';
    }

    get tamanoPagina() { return Number(this.filasPorPagina) || 25; }

    get filasVista() {
        return this.filas.map(f => ({
            ...f,
            fechaTexto: this.fechaCorta(f.fecha),
            tieneAdjuntos: f.adjuntos > 0
        }));
    }

    handleTexto(e) { this.texto = e.target.value; this.programarBusqueda(); }
    handleDesde(e) { this.desde = e.target.value; this.programarBusqueda(0); }
    handleHasta(e) { this.hasta = e.target.value; this.programarBusqueda(0); }

    handleLimpiar() {
        this.texto = '';
        this.desde = '';
        this.hasta = '';
        this.empresasSeleccionadas = [];
        this.programarBusqueda(0);
    }

    programarBusqueda(espera = DEBOUNCE_MS) {
        window.clearTimeout(this.debounce);
        this.debounce = setTimeout(() => this.cargarListado(true), espera);
    }

    handleMostrarMas() {
        if (!this.cargando && this.hayMas) this.cargarListado(false);
    }

    /** Carga la primera página (reiniciar=true) o añade la siguiente al final */
    cargarListado(reiniciar) {
        const numero = ++this.peticion;
        this.cargando = true;
        this.error = undefined;
        if (reiniciar) {
            this.cursorFecha = null;
            this.cursorId = null;
        }
        getEscrituras({
            texto: this.texto || null,
            empresaIds: this.empresasSeleccionadas.length ? this.empresasSeleccionadas : null,
            desde: this.desde || null,
            hasta: this.hasta || null,
            tamano: this.tamanoPagina,
            cursorFecha: reiniciar ? null : this.cursorFecha,
            cursorId: reiniciar ? null : this.cursorId
        })
            .then(r => {
                if (numero !== this.peticion) return; // respuesta de un filtro anterior
                this.filas = reiniciar ? r.filas : [...this.filas, ...r.filas];
                this.total = r.total;
                this.hayMas = r.hayMas;
                this.cursorFecha = r.cursorFecha || null;
                this.cursorId = r.cursorId || null;
            })
            .catch(err => {
                if (numero !== this.peticion) return;
                this.error = this.mensajeError(err);
                if (reiniciar) this.filas = [];
            })
            .finally(() => {
                if (numero === this.peticion) this.cargando = false;
            });
    }

    mensajeError(err) {
        if (err && err.body && err.body.message) return err.body.message;
        if (err && err.message) return err.message;
        return 'Se ha producido un error inesperado.';
    }

    // =====================================================================
    // Filtro de empresas
    // =====================================================================
    cargarEmpresas() {
        this.cargandoEmpresas = true;
        getEmpresas()
            .then(lista => {
                // El nombre normalizado se calcula una sola vez para que el
                // buscador del panel no tenga que quitar tildes en cada tecla
                this.empresas = (lista || []).map(e => ({ ...e, nombreNorm: this.normalizar(e.nombre) }));
            })
            .catch(() => { this.empresas = []; })
            .finally(() => { this.cargandoEmpresas = false; });
    }

    get hayEmpresasSeleccionadas() { return this.empresasSeleccionadas.length > 0; }

    get etiquetaEmpresas() {
        const n = this.empresasSeleccionadas.length;
        if (n === 0) return 'Empresa';
        if (n === 1) {
            const e = this.empresas.find(x => x.id === this.empresasSeleccionadas[0]);
            return e ? e.nombre : '1 empresa';
        }
        return n + ' empresas';
    }

    get claseBotonEmpresas() {
        return 'portal-search portal-empresas-btn'
            + (this.hayEmpresasSeleccionadas ? ' portal-empresas-btn-activo' : '')
            + (this.empresasAbierto ? ' portal-empresas-btn-abierto' : '');
    }

    get claseChevronEmpresas() {
        return 'portal-chevron' + (this.empresasAbierto ? ' portal-chevron-abierto' : '');
    }

    get empresasVista() {
        const filtro = this.normalizar(this.filtroEmpresas);
        const seleccion = new Set(this.empresasSeleccionadas);
        const lista = filtro ? this.empresas.filter(e => e.nombreNorm.includes(filtro)) : this.empresas;
        return lista.map(e => {
            const seleccionada = seleccion.has(e.id);
            return {
                ...e,
                seleccionada,
                clase: 'portal-opcion' + (seleccionada ? ' portal-opcion-activa' : '')
            };
        });
    }

    get sinEmpresasFiltradas() { return this.empresasVista.length === 0; }

    get resumenEmpresas() {
        const n = this.empresasSeleccionadas.length;
        if (n === 0) return this.empresas.length + ' empresas';
        return n + (n === 1 ? ' seleccionada' : ' seleccionadas');
    }

    get empresasSeleccionadasVista() {
        const porId = new Map(this.empresas.map(e => [e.id, e]));
        return this.empresasSeleccionadas.map(id => porId.get(id) || { id, nombre: id });
    }

    handleToggleEmpresas() {
        this.empresasAbierto = !this.empresasAbierto;
        if (this.empresasAbierto) {
            this.filtroEmpresas = '';
            // Foco en el buscador del panel en cuanto se pinte
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => {
                const input = this.template.querySelector('.portal-panel-buscador input');
                if (input) input.focus();
            }, 0);
        }
    }

    handleCerrarEmpresas() { this.empresasAbierto = false; }

    handleFiltroEmpresas(e) { this.filtroEmpresas = e.target.value; }

    handleEmpresaCheck(e) {
        const id = e.target.dataset.id;
        const marcada = e.target.checked;
        const actual = this.empresasSeleccionadas.filter(x => x !== id);
        this.empresasSeleccionadas = marcada ? [...actual, id] : actual;
        this.programarBusqueda(0);
    }

    handleQuitarEmpresa(e) {
        const id = e.currentTarget.dataset.id;
        this.empresasSeleccionadas = this.empresasSeleccionadas.filter(x => x !== id);
        this.programarBusqueda(0);
    }

    handleLimpiarEmpresas() {
        this.empresasSeleccionadas = [];
        this.programarBusqueda(0);
    }

    /** Minúsculas y sin tildes, para comparar texto escrito por el usuario */
    normalizar(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    // =====================================================================
    // Detalle
    // =====================================================================
    handleAbrir(e) {
        e.stopPropagation();
        this.abrirDetalle(e.currentTarget.dataset.id);
    }

    handleVolver() {
        this.vista = 'listado';
        this.detalle = undefined;
        this.errorDetalle = undefined;
        this.cargandoDetalle = false;
        this.reiniciarVisor();
        this.adjuntoActivo = undefined;
    }

    abrirDetalle(id) {
        this.vista = 'detalle';
        this.empresasAbierto = false;
        this.detalle = undefined;
        this.errorDetalle = undefined;
        this.adjuntoActivo = undefined;
        this.reiniciarVisor();
        this.cargandoDetalle = true;
        const carga = this.cargaId;
        getDetalle({ escrituraId: id })
            .then(d => {
                // Si mientras tanto se volvió al listado o se abrió otra escritura, se descarta
                if (carga !== this.cargaId || this.vista !== 'detalle') return;
                this.cargandoDetalle = false;
                this.detalle = d;
                if (d.adjuntos && d.adjuntos.length) this.seleccionarAdjunto(d.adjuntos[0]);
            })
            .catch(err => {
                if (carga !== this.cargaId || this.vista !== 'detalle') return;
                this.cargandoDetalle = false;
                this.errorDetalle = this.mensajeError(err);
            });
    }

    get fechaDetalleTexto() { return this.detalle ? this.fechaLarga(this.detalle.fecha) : ''; }
    get protocoloTexto() { return this.valorODash(this.detalle && this.detalle.protocolo); }
    get empresaTexto() { return this.valorODash(this.detalle && this.detalle.empresa); }
    get notarioTexto() { return this.valorODash(this.detalle && this.detalle.notario); }
    get tituloTexto() { return this.valorODash(this.detalle && this.detalle.titulo); }
    get observacionesTexto() { return this.valorODash(this.detalle && this.detalle.observaciones); }

    get numAdjuntos() { return this.detalle && this.detalle.adjuntos ? this.detalle.adjuntos.length : 0; }
    get hayAdjuntos() { return this.numAdjuntos > 0; }

    get adjuntosVista() {
        if (!this.detalle || !this.detalle.adjuntos) return [];
        const activo = this.adjuntoActivo ? this.adjuntoActivo.documentoId : null;
        return this.detalle.adjuntos.map(a => ({
            ...a,
            clase: 'det-adjunto' + (a.documentoId === activo ? ' det-adjunto-activo' : ''),
            icono: this.iconoAdjunto(a),
            meta: [String(a.extension || a.tipo || '').toUpperCase(), this.tamanoTexto(a.tamano)]
                .filter(Boolean).join(' · '),
            urlDescarga: this.urlDescarga(a.versionId)
        }));
    }

    /**
     * Primera página de los demás documentos previsualizables, pedida en
     * imágenes invisibles: así Salesforce genera sus vistas previas mientras
     * el usuario mira el primero y al pinchar en otro ya está lista.
     */
    get precargas() {
        if (!this.detalle || !this.detalle.adjuntos || !this.adjuntoActivo) return [];
        return this.detalle.adjuntos
            .filter(a => a.previsualizacion === 'paginas' && a.documentoId !== this.adjuntoActivo.documentoId)
            .map(a => ({ id: a.documentoId, url: this.urlPagina(a.versionId, 0) }));
    }

    handleSeleccionarAdjunto(e) {
        const id = e.currentTarget.dataset.id;
        const adj = (this.detalle.adjuntos || []).find(a => a.documentoId === id);
        if (adj && (!this.adjuntoActivo || adj.documentoId !== this.adjuntoActivo.documentoId)) {
            this.seleccionarAdjunto(adj);
        }
    }

    handleReintentar() {
        if (this.adjuntoActivo) this.seleccionarAdjunto(this.adjuntoActivo);
    }

    iconoAdjunto(a) {
        switch (a.tipo) {
            case 'PDF': return 'doctype:pdf';
            case 'WORD': case 'WORD_X': case 'WORD_M': return 'doctype:word';
            case 'EXCEL': case 'EXCEL_X': case 'EXCEL_M': case 'CSV': return 'doctype:excel';
            case 'POWER_POINT': case 'POWER_POINT_X': case 'POWER_POINT_M': return 'doctype:ppt';
            case 'ZIP': return 'doctype:zip';
            case 'JPG': case 'JPEG': case 'PNG': case 'GIF': case 'BMP': case 'WEBP': return 'doctype:image';
            default: return 'doctype:attachment';
        }
    }

    // =====================================================================
    // Visor
    // =====================================================================
    get nombreAdjuntoActivo() {
        if (!this.adjuntoActivo) return this.hayAdjuntos ? '' : 'Documento';
        const a = this.adjuntoActivo;
        return a.titulo + (a.extension ? '.' + a.extension : '');
    }

    get urlDescargaActiva() { return this.adjuntoActivo ? this.urlDescarga(this.adjuntoActivo.versionId) : ''; }

    get visorSinAdjuntos() { return !this.adjuntoActivo; }
    get visorSinPrevisualizacion() {
        return !!this.adjuntoActivo
            && (this.adjuntoActivo.previsualizacion === 'ninguna' || this.previsualizacionFallida);
    }
    get motivoSinPrevisualizacion() {
        if (this.previsualizacionFallida) {
            return 'No se ha podido obtener la vista previa del documento. Puedes reintentarlo o descargarlo '
                + 'para abrirlo en tu equipo.';
        }
        return 'Este tipo de archivo no se puede mostrar en el navegador. Descárgalo para abrirlo en tu equipo.';
    }
    get mostrarControlesVisor() { return !!this.adjuntoActivo && !this.visorSinPrevisualizacion; }
    get mostrarPreparando() { return this.preparandoVistaPrevia; }
    get mostrarCargandoPaginas() { return this.cargandoPaginas && !this.preparandoVistaPrevia; }
    get textoPreparando() {
        return this.intentosPagina0 > 6
            ? 'Salesforce sigue preparando la vista previa. Los documentos grandes pueden tardar un par de minutos…'
            : 'Preparando la vista previa del documento… La primera vez puede tardar unos segundos.';
    }

    get etiquetaPaginas() {
        if (this.totalPaginas) return 'Página ' + this.paginaActual + ' de ' + this.totalPaginas;
        return 'Página ' + this.paginaActual;
    }

    get zoomTexto() { return this.zoom + '%'; }
    get zoomMinimo() { return this.zoom <= ZOOMS[0]; }
    get zoomMaximo() { return this.zoom >= ZOOMS[ZOOMS.length - 1]; }
    get estiloPagina() { return 'width:' + this.zoom + '%;'; }

    handleZoomMenos() {
        const i = ZOOMS.indexOf(this.zoom);
        if (i > 0) this.zoom = ZOOMS[i - 1];
    }
    handleZoomMas() {
        const i = ZOOMS.indexOf(this.zoom);
        if (i >= 0 && i < ZOOMS.length - 1) this.zoom = ZOOMS[i + 1];
    }
    handleZoomAjustar() { this.zoom = ZOOM_DEFECTO; }

    /** Deja el visor vacío y anula cualquier carga o reintento pendiente */
    reiniciarVisor() {
        this.cargaId++;
        this.cancelarTemporizadores();
        this.paginas = [];
        this.totalPaginas = undefined;
        this.paginaActual = 1;
        this.cargandoPaginas = false;
        this.preparandoVistaPrevia = false;
        this.previsualizacionFallida = false;
        this.intentosPagina0 = 0;
        this.intentosPorPagina = {};
        this.paginasCargadas = new Set();
        this.rutaServlet = 0;
    }

    cancelarTemporizadores() {
        this.temporizadores.forEach(t => window.clearTimeout(t));
        this.temporizadores = [];
    }

    /** Ejecuta la acción tras la espera, salvo que mientras tanto se haya cambiado de documento */
    programar(accion, ms) {
        const carga = this.cargaId;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        const t = setTimeout(() => {
            this.temporizadores = this.temporizadores.filter(x => x !== t);
            if (carga === this.cargaId) accion();
        }, ms);
        this.temporizadores.push(t);
    }

    seleccionarAdjunto(adj) {
        this.reiniciarVisor();
        this.adjuntoActivo = adj;
        if (adj.previsualizacion === 'paginas') {
            this.cargandoPaginas = true;
            // Solo la primera página: las demás se piden cuando esta ha cargado
            this.ponerPagina(0, 0);
        } else if (adj.previsualizacion === 'imagen') {
            this.totalPaginas = 1;
            const pag = { id: this.cargaId + '-0-0', n: 0, intento: 0, url: this.urlDescarga(adj.versionId), alt: adj.titulo };
            this.paginas = [pag];
            this.vigilarPagina(pag);
        }
        const scroll = this.template.querySelector('.visor-scroll');
        if (scroll) scroll.scrollTop = 0;
    }

    /** Página n del documento activo en su intento nº `intento` (con un parámetro anticaché si es un reintento) */
    nuevaPagina(n, intento) {
        const nonce = intento > 0 ? '&_r=' + this.cargaId + '_' + intento : '';
        return {
            id: this.cargaId + '-' + n + '-' + intento,
            n,
            intento,
            url: this.urlPagina(this.adjuntoActivo.versionId, n) + nonce,
            alt: 'Página ' + (n + 1) + ' de ' + this.adjuntoActivo.titulo
        };
    }

    /** Añade la página n a la lista (o sustituye su intento anterior) y vigila que responda */
    ponerPagina(n, intento) {
        const pag = this.nuevaPagina(n, intento);
        this.paginas = [...this.paginas.filter(p => p.n !== n), pag].sort((a, b) => a.n - b.n);
        this.vigilarPagina(pag);
    }

    /** Si la imagen no dispara ni load ni error en un tiempo razonable, se trata como error */
    vigilarPagina(pag) {
        this.programar(() => {
            const sigue = this.paginas.some(p => p.id === pag.id);
            if (sigue && !this.paginasCargadas.has(pag.id)) this.tratarError(pag);
        }, TIMEOUT_PAGINA_MS);
    }

    /** Añade a la lista las páginas que falten hasta el índice indicado */
    asegurarPaginasHasta(indice) {
        if (!this.adjuntoActivo || this.totalPaginas !== undefined) return;
        const tope = Math.min(indice, MAX_PAGINAS - 1);
        const existentes = new Set(this.paginas.map(p => p.n));
        for (let n = 0; n <= tope; n++) {
            if (!existentes.has(n)) this.ponerPagina(n, 0);
        }
    }

    /** Página de la lista a la que corresponde el evento; undefined si la imagen ya no cuenta */
    paginaDeEvento(e) {
        const id = e.target.dataset.id;
        return this.paginas.find(p => p.id === id);
    }

    handlePaginaCargada(e) {
        const pag = this.paginaDeEvento(e);
        if (!pag) return; // imagen de un documento o intento anterior
        this.paginasCargadas.add(pag.id);
        this.preparandoVistaPrevia = false;
        if (this.adjuntoActivo && this.adjuntoActivo.previsualizacion === 'paginas') {
            this.asegurarPaginasHasta(pag.n + PAGINAS_ANTICIPADAS);
        }
    }

    handlePaginaError(e) {
        const pag = this.paginaDeEvento(e);
        if (pag) this.tratarError(pag);
    }

    /**
     * Una página ha fallado: la primera se reintenta con paciencia (vista previa
     * en generación o fallo puntual), las demás un par de veces y, si siguen
     * fallando, marcan el final del documento.
     */
    tratarError(pag) {
        if (!this.adjuntoActivo) return;
        if (this.adjuntoActivo.previsualizacion !== 'paginas') {
            // Imagen que no se puede mostrar
            this.previsualizacionFallida = true;
            this.paginas = [];
            return;
        }
        if (pag.n === 0) {
            this.intentosPagina0++;
            if (this.intentosPagina0 > MAX_INTENTOS_PAGINA0) {
                this.previsualizacionFallida = true;
                this.preparandoVistaPrevia = false;
                this.cargandoPaginas = false;
                this.paginas = [];
                return;
            }
            this.preparandoVistaPrevia = true;
            this.paginas = []; // sin imagen rota mientras se espera
            // Los reintentos alternan la ruta del servlet, por si el sitio la
            // sirve por /sfsites/c; la que funcione se mantiene para el resto
            this.rutaServlet = this.intentosPagina0 % RUTAS_SERVLET.length;
            const espera = Math.min(1000 + this.intentosPagina0 * 500, 4000);
            const intento = this.intentosPagina0;
            this.programar(() => this.ponerPagina(0, intento), espera);
            return;
        }
        const intentos = (this.intentosPorPagina[pag.n] || 0) + 1;
        this.intentosPorPagina[pag.n] = intentos;
        if (intentos <= MAX_INTENTOS_PAGINA) {
            this.programar(() => this.ponerPagina(pag.n, intentos), RETRASO_REINTENTO_MS);
            return;
        }
        // Fin del documento: la página n no existe
        if (this.totalPaginas === undefined || pag.n < this.totalPaginas) {
            this.totalPaginas = pag.n;
            this.paginas = this.paginas.filter(p => p.n < pag.n);
            this.cargandoPaginas = false;
            if (this.paginaActual > pag.n) this.paginaActual = pag.n;
        }
    }

    /** Página visible: la primera cuyo borde inferior queda por debajo del tercio superior del visor */
    handleScrollVisor(e) {
        if (this.scrollPendiente) return;
        this.scrollPendiente = true;
        const contenedor = e.currentTarget;
        window.requestAnimationFrame(() => {
            this.scrollPendiente = false;
            const marco = contenedor.getBoundingClientRect();
            const linea = marco.top + marco.height / 3;
            const hojas = this.template.querySelectorAll('.visor-pagina');
            let actual = 1;
            for (const hoja of hojas) {
                const r = hoja.getBoundingClientRect();
                actual = Number(hoja.dataset.n) + 1;
                if (r.bottom > linea) break;
            }
            if (actual !== this.paginaActual) this.paginaActual = actual;
        });
    }

    // =====================================================================
    // URLs de archivos y utilidades
    // =====================================================================
    /** Prefijo del sitio ('/clientes' en el portal, vacío en la app interna) */
    get prefijoSitio() {
        return (basePath || '').replace(/\/s$/i, '');
    }

    urlPagina(versionId, n) {
        return this.prefijoSitio + RUTAS_SERVLET[this.rutaServlet]
            + '/sfc/servlet.shepherd/version/renditionDownload?rendition=SVGZ&versionId=' + versionId + '&page=' + n;
    }

    urlDescarga(versionId) {
        return this.prefijoSitio + '/sfc/servlet.shepherd/version/download/' + versionId;
    }

    /** 'YYYY-MM-DD' -> 'DD/MM/YYYY' */
    fechaCorta(iso) {
        if (!iso) return '';
        const [a, m, d] = String(iso).split('-');
        return d + '/' + m + '/' + a;
    }

    /** 'YYYY-MM-DD' -> '18 de julio de 2023' */
    fechaLarga(iso) {
        if (!iso) return '—';
        const [a, m, d] = String(iso).split('-').map(Number);
        return d + ' de ' + MESES[m - 1] + ' de ' + a;
    }

    tamanoTexto(bytes) {
        const n = Number(bytes);
        if (!n) return '';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
        return (n / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
    }

    valorODash(v) {
        return v === null || v === undefined || v === '' ? '—' : v;
    }
}