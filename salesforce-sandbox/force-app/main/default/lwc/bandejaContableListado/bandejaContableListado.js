import { LightningElement } from 'lwc';
import listarBandejas from '@salesforce/apex/BandejaContableController.listarBandejas';
import estadoProcesamiento from '@salesforce/apex/BandejaContableController.estadoProcesamiento';
import BandejaContableNuevoModal from 'c/bandejaContableNuevoModal';
import { fechaHora, claseEstado, eventoNavegar, mensajeError, estadoDeFila, ESTADOS_PROCESO_EN_CURSO } from 'c/bandejaContableUtils';

// Mientras alguna bandeja se esté cargando o procesando, el listado se refresca solo (unos 5 minutos)
const REFRESCO_MS = 10000;
const REFRESCO_MAX = 30;

const FILTROS = [
    { valor: 'Todas', coincide: () => true },
    { valor: 'Pendientes', coincide: (b) => b.estado === 'Pendiente' },
    { valor: 'Completadas', coincide: (b) => b.estado === 'Completado' }
];

/**
 * Pantalla 00 · Listado de bandejas contables. La columna Procesamiento es el estado que ve el usuario
 * (Cargando, Procesando, Procesado, Error): se pinta el listado con los datos de Salesforce y después se
 * pide, en una sola llamada, el estado del procesamiento de las bandejas mostradas.
 */
export default class BandejaContableListado extends LightningElement {
    bandejas = [];
    cargando = true;
    error;
    filtro = 'Pendientes';
    busqueda = '';
    procesos = {}; // Id de bandeja → estadoProcesamiento
    consulta = 'cargando'; // 'cargando' | 'ok' | 'error'
    refrescos = 0;
    temporizador;

    connectedCallback() {
        this.cargar();
    }

    disconnectedCallback() {
        clearTimeout(this.temporizador);
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
        await this.consultarProcesamiento();
    }

    async consultarProcesamiento() {
        const ids = this.bandejas.filter((b) => b.archivosSincronizados > 0).map((b) => b.id);
        try {
            const estados = ids.length ? await estadoProcesamiento({ bandejaIds: ids }) : [];
            this.procesos = Object.fromEntries(estados.map((e) => [e.bandejaId, e]));
            this.consulta = 'ok';
        } catch {
            this.consulta = 'error';
        }
        this.programarRefresco();
    }

    programarRefresco() {
        clearTimeout(this.temporizador);
        const enCurso = this.bandejas.some((b) => ESTADOS_PROCESO_EN_CURSO.includes(estadoDeFila(b, this.procesos, this.consulta).clave));
        if (!enCurso || this.refrescos >= REFRESCO_MAX) return;
        this.refrescos++;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.temporizador = setTimeout(() => this.refrescar(), REFRESCO_MS);
    }

    async refrescar() {
        try {
            this.bandejas = await listarBandejas({ empresaId: null });
        } catch {
            /* se reintenta en el siguiente */
        }
        await this.consultarProcesamiento();
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
                proceso: estadoDeFila(b, this.procesos, this.consulta)
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
