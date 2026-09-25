import { LightningElement } from 'lwc';
import listarBandejas from '@salesforce/apex/BandejaContableController.listarBandejas';
import BandejaContableNuevoModal from 'c/bandejaContableNuevoModal';
import { fechaHora, claseEstado, eventoNavegar, mensajeError } from 'c/bandejaContableUtils';

const FILTROS = [
    { valor: 'Todas', coincide: () => true },
    { valor: 'Pendientes', coincide: (b) => b.estado === 'Pendiente' },
    { valor: 'Completadas', coincide: (b) => b.estado === 'Completado' }
];

/** Pantalla 00 · Listado de bandejas contables */
export default class BandejaContableListado extends LightningElement {
    bandejas = [];
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
            this.bandejas = await listarBandejas({ empresaId: null });
            this.error = null;
        } catch (e) {
            this.error = mensajeError(e);
        } finally {
            this.cargando = false;
        }
    }

    get filtros() {
        return FILTROS.map((f) => ({ ...f, clase: 'bc-chip' + (f.valor === this.filtro ? ' bc-chip-on' : '') }));
    }

    get filas() {
        const f = FILTROS.find((x) => x.valor === this.filtro);
        const q = this.busqueda.toLowerCase();
        return this.bandejas
            .filter((b) => f.coincide(b))
            .filter((b) => !q || [b.numero, b.empresa, b.cif, b.creadoPor, b.tipo].join(' ').toLowerCase().includes(q))
            .map((b) => ({
                ...b,
                fechaTxt: fechaHora(b.fecha),
                claseEstado: claseEstado(b.estado),
                claseSubida: claseEstado(b.estadoSubida)
            }));
    }

    get hayFilas() { return !this.cargando && this.filas.length > 0; }
    get sinFilas() { return !this.cargando && !this.error && this.filas.length === 0; }
    get contadorTxt() {
        const n = this.filas.length;
        return (n === 1 ? '1 elemento' : n + ' elementos') + ' · Ordenado por Fecha de creación';
    }

    handleFiltro(e) { this.filtro = e.currentTarget.dataset.valor; }
    handleBuscar(e) { this.busqueda = e.target.value || ''; }

    async handleNuevo() {
        const res = await BandejaContableNuevoModal.open({ size: 'medium', label: 'Nueva bandeja contable' });
        if (res && res.bandejaId) this.cargar();
    }

    abrirBandeja(e) {
        e.preventDefault();
        this.dispatchEvent(eventoNavegar({ vista: 'registro', bandejaId: e.currentTarget.dataset.id }));
    }
}
