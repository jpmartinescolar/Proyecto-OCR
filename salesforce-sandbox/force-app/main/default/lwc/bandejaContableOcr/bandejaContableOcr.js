import { LightningElement, api } from 'lwc';
import listarBandejasConArchivos from '@salesforce/apex/BandejaContableController.listarBandejasConArchivos';
import { documentosDeBandeja } from 'c/bandejaContableMock';
import { fechaHora, diasDesde, claseEstado, eventoNavegar, mensajeError } from 'c/bandejaContableUtils';

const FILTROS = [
    { valor: 'Todos', coincide: () => true },
    { valor: 'Pendientes', coincide: (d) => d.estado === 'Pendiente' },
    { valor: 'Contabilizados', coincide: (d) => d.estado === 'Contabilizado' },
    { valor: 'Cancelados', coincide: (d) => d.estado === 'Cancelado' }
];
const DIAS_AVISO = 30;

/**
 * Pantallas 03 (todos los documentos OCR) y 04 (agrupados por empresa). Las bandejas y empresas son
 * reales; los documentos son de ejemplo, generados a partir de los archivos ya registrados en Google.
 */
export default class BandejaContableOcr extends LightningElement {
    @api empresaId;
    @api agrupar = false;

    documentos = [];
    cargando = true;
    error;
    filtro = 'Pendientes';
    busqueda = '';

    connectedCallback() {
        this.cargar();
    }

    async cargar() {
        this.cargando = true;
        try {
            const bandejas = await listarBandejasConArchivos({ empresaId: null });
            this.documentos = bandejas.flatMap((b) => documentosDeBandeja(b));
            this.error = null;
        } catch (e) {
            this.error = mensajeError(e);
        } finally {
            this.cargando = false;
        }
    }

    get empresaFiltro() {
        const d = this.documentos.find((x) => x.empresaId === this.empresaId);
        return this.empresaId ? (d ? d.empresa : 'empresa seleccionada') : null;
    }
    get titulo() { return this.agrupar ? 'OCR documentos agrupados por empresa' : this.empresaId ? 'OCR documentos de la empresa' : 'Todos los OCR documentos'; }
    get iconoTitulo() { return this.agrupar ? 'utility:company' : 'utility:file'; }
    get claseAgrupar() { return 'bc-boton-sec' + (this.agrupar ? ' bc-boton-activo' : ''); }

    get filtros() {
        return FILTROS.map((f) => ({ ...f, clase: 'bc-chip' + (f.valor === this.filtro ? ' bc-chip-on' : '') }));
    }

    get filas() {
        const f = FILTROS.find((x) => x.valor === this.filtro);
        const q = this.busqueda.toLowerCase();
        return this.documentos
            .filter((d) => !this.empresaId || d.empresaId === this.empresaId)
            .filter((d) => f.coincide(d))
            .filter((d) => !q || [d.numero, d.nombre, d.bandejaNumero, d.empresa].join(' ').toLowerCase().includes(q))
            .map((d) => {
                const dias = diasDesde(d.fecha);
                return {
                    ...d,
                    fechaTxt: fechaHora(d.fecha),
                    dias,
                    claseDias: 'bc-derecha bc-num bc-fuerte' + (d.estado === 'Pendiente' && dias > DIAS_AVISO ? ' bc-rojo' : ''),
                    claseEstado: claseEstado(d.estado)
                };
            });
    }
    get hayFilas() { return !this.cargando && this.filas.length > 0; }
    get sinFilas() { return !this.cargando && !this.error && this.filas.length === 0; }
    get contadorTxt() {
        const n = this.filas.length;
        return (n === 1 ? '1 elemento' : n + ' elementos') + ' · Ordenado por Fecha de creación';
    }

    get empresas() {
        const mapa = new Map();
        this.documentos.forEach((d) => {
            const e = mapa.get(d.empresaId) || { id: d.empresaId, empresa: d.empresa, total: 0, pendientes: 0 };
            e.total++;
            if (d.estado === 'Pendiente') e.pendientes++;
            mapa.set(d.empresaId, e);
        });
        return [...mapa.values()].sort((a, b) => b.total - a.total);
    }
    get hayEmpresas() { return !this.cargando && this.empresas.length > 0; }
    get sinEmpresas() { return !this.cargando && !this.error && this.empresas.length === 0; }
    get contadorEmpresas() {
        const n = this.empresas.length;
        return n === 1 ? '1 empresa' : n + ' empresas';
    }

    handleFiltro(e) { this.filtro = e.currentTarget.dataset.valor; }
    handleBuscar(e) { this.busqueda = e.target.value || ''; }

    toggleAgrupar() {
        this.dispatchEvent(eventoNavegar({ vista: this.agrupar ? 'ocr' : 'ocrEmpresas' }));
    }

    quitarEmpresa() {
        this.dispatchEvent(eventoNavegar({ vista: 'ocr' }));
    }

    filtrarEmpresa(e) {
        e.preventDefault();
        this.filtro = 'Pendientes';
        this.dispatchEvent(eventoNavegar({ vista: 'ocr', empresaId: e.currentTarget.dataset.id }));
    }

    abrirDocumento(e) {
        e.preventDefault();
        const d = this.documentos.find((x) => x.id === e.currentTarget.dataset.id);
        this.dispatchEvent(eventoNavegar({ vista: 'documento', bandejaId: d.bandejaId, docId: d.id, tab: 'ocr' }));
    }

    abrirBandeja(e) {
        e.preventDefault();
        this.dispatchEvent(eventoNavegar({ vista: 'registro', bandejaId: e.currentTarget.dataset.id }));
    }

    abrirEmpresa(e) {
        e.preventDefault();
        this.dispatchEvent(eventoNavegar({ vista: 'empresa', empresaId: e.currentTarget.dataset.id }));
    }
}
