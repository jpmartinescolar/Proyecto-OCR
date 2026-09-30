import { LightningElement, api } from 'lwc';
import listarBandejasConArchivos from '@salesforce/apex/BandejaContableController.listarBandejasConArchivos';
import { documentosDeBandeja, duplicadoDe, situacionFiscal, MOTIVOS_NO_CONTABILIZAR } from 'c/bandejaContableMock';
import { fechaHora, diasDesde, eventoNavegar, mensajeError } from 'c/bandejaContableUtils';

const FILTROS = [
    { valor: 'Todos', coincide: () => true },
    { valor: 'Pendientes', coincide: (d) => d.estado === 'Pendiente' },
    { valor: 'Contabilizados', coincide: (d) => d.estado === 'Contabilizado' },
    { valor: 'No contabilizados', coincide: (d) => d.estado === 'No contabilizado' }
];
const TIPOS = [['Todas', null], ['Facturas emitidas', 'Emitida'], ['Facturas recibidas', 'Recibida'], ['Tickets', 'Ticket']];
const TIPO_TXT = { Emitida: 'Factura emitida', Recibida: 'Factura recibida', Ticket: 'Ticket' };
const TIPO_CLASE = { Emitida: 'bc-pill bc-pill-pendiente', Recibida: 'bc-pill bc-pill-info', Ticket: 'bc-pill ocr-pill-ticket' };
const SITUACIONES = ['Todas', 'Sin riesgo', 'Con riesgo'];
const DIAS_AVISO = 30;

/**
 * Pantallas 03 (listado de documentos OCR) y 04 (recuento por empresa). Las bandejas y empresas son
 * reales; los documentos, su situación fiscal y los duplicados son de ejemplo (bandejaContableMock)
 * hasta que Google separe y extraiga las facturas.
 */
export default class BandejaContableOcr extends LightningElement {
    @api empresaId;
    @api agrupar = false; // true = pantalla 04 (recuento por empresa)

    documentos = [];
    cargando = true;
    error;
    filtro = 'Pendientes';
    tipo = 'Todas';
    situacion = 'Todas';
    motivo = 'Todos';
    busqueda = '';
    agrupado = false; // agrupar las filas del listado por empresa
    cerrados = {};

    connectedCallback() {
        this.cargar();
    }

    async cargar() {
        this.cargando = true;
        try {
            const bandejas = await listarBandejasConArchivos({ empresaId: null });
            this.documentos = bandejas.flatMap((b) => documentosDeBandeja(b)).map((d) => ({ ...d, sit: situacionFiscal(d), duplicado: duplicadoDe(d) }));
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
    get titulo() {
        if (this.agrupar) return 'OCR documentos agrupados por empresa';
        return this.empresaId ? 'OCR documentos pendientes de la empresa' : 'OCR documentos pendientes';
    }
    get iconoTitulo() { return this.agrupar ? 'utility:company' : 'utility:file'; }
    get claseAgrupar() { return 'bc-boton-sec' + (this.agrupado ? ' bc-boton-activo' : ''); }

    get deEmpresa() { return this.documentos.filter((d) => !this.empresaId || d.empresaId === this.empresaId); }

    get filtros() {
        return FILTROS.map((f) => ({ ...f, clase: 'bc-chip' + (f.valor === this.filtro ? ' bc-chip-on' : '') }));
    }
    get tipos() {
        const f = FILTROS.find((x) => x.valor === this.filtro);
        return TIPOS.map(([label, v]) => {
            const on = label === this.tipo;
            return {
                label,
                n: this.deEmpresa.filter((d) => f.coincide(d) && (!v || d.tipo === v)).length,
                clase: 'ocr-tipo' + (on ? ' ocr-tipo-on' : ''),
                claseN: 'ocr-tipo-n' + (on ? ' ocr-tipo-n-on' : '')
            };
        });
    }
    get situaciones() {
        return SITUACIONES.map((s) => {
            const n = s === 'Todas' ? '' : ` (${this.deEmpresa.filter((d) => (s === 'Con riesgo' ? !!d.sit : !d.sit)).length})`;
            return {
                s, label: s + n,
                clase: 'bc-chip' + (s === this.situacion ? ' bc-chip-on' : ''),
                claseDot: 'ocr-dot ' + (s === 'Sin riesgo' ? 'ocr-dot-ok' : s === 'Con riesgo' ? 'ocr-dot-riesgo' : '')
            };
        });
    }
    get verMotivo() { return this.filtro === 'No contabilizados'; }
    get motivos() {
        return [['Todos', 'Motivo: todos'], ...MOTIVOS_NO_CONTABILIZAR.map(([m]) => [m, m])].map(([v, l]) => ({ v, l, selected: v === this.motivo }));
    }

    get filas() {
        const f = FILTROS.find((x) => x.valor === this.filtro);
        const tipo = (TIPOS.find((t) => t[0] === this.tipo) || TIPOS[0])[1];
        const q = this.busqueda.toLowerCase();
        return this.deEmpresa
            .filter((d) => !tipo || d.tipo === tipo)
            .filter((d) => f.coincide(d))
            .filter((d) => !this.verMotivo || this.motivo === 'Todos' || d.motivo === this.motivo)
            .filter((d) => this.situacion === 'Todas' || (this.situacion === 'Con riesgo' ? !!d.sit : !d.sit))
            .filter((d) => !q || [d.numero, d.nombre, d.bandejaNumero, d.empresa].join(' ').toLowerCase().includes(q))
            .map((d) => {
                const dias = diasDesde(d.fecha);
                // Pendiente: "Incidencia" si tiene riesgo o posible duplicado; si no, "Pre-validado"
                let estado = d.motivo ? `${d.estado} · ${d.motivo}` : d.estado;
                let claseEstado = 'bc-pill ' + (d.estado === 'Contabilizado' ? 'bc-pill-ok' : 'bc-pill-error');
                if (d.estado === 'Pendiente') {
                    const incidencia = !!d.sit || !!d.duplicado;
                    estado = incidencia ? 'Incidencia' : 'Pre-validado';
                    claseEstado = 'bc-pill ' + (incidencia ? 'bc-pill-error' : 'bc-pill-ok');
                }
                return {
                    ...d,
                    fechaTxt: fechaHora(d.fecha),
                    dias,
                    claseDias: 'bc-derecha bc-num bc-fuerte' + (d.estado === 'Pendiente' && dias > DIAS_AVISO ? ' bc-rojo' : ''),
                    tipoTxt: TIPO_TXT[d.tipo],
                    claseTipo: TIPO_CLASE[d.tipo],
                    estadoTxt: estado,
                    claseEstado,
                    conRiesgo: !!d.sit,
                    sitTxt: d.sit ? 'Riesgo' : 'Sin riesgo',
                    sitTip: d.sit ? 'Riesgo fiscal: ' + d.sit.motivo : 'Sin riesgo fiscal',
                    claseSit: 'ocr-sit ' + (d.sit ? 'ocr-sit-riesgo' : 'ocr-sit-ok'),
                    claseSitTxt: 'ocr-sit-txt ' + (d.sit ? 'ocr-sit-txt-riesgo' : 'ocr-sit-txt-ok')
                };
            });
    }

    get grupos() {
        const filas = this.filas;
        if (!this.agrupado) return [{ key: 'todo', cabecera: false, abierto: true, filas }];
        const mapa = new Map();
        filas.forEach((d) => {
            const g = mapa.get(d.empresaId) || { key: d.empresaId, empresa: d.empresa, filas: [] };
            g.filas.push(d);
            mapa.set(d.empresaId, g);
        });
        return [...mapa.values()].sort((a, b) => a.empresa.localeCompare(b.empresa, 'es')).map((g) => {
            const abierto = !this.cerrados[g.key];
            const riesgo = g.filas.filter((d) => d.conRiesgo).length;
            return {
                ...g, cabecera: true, abierto,
                claseFlecha: 'ocr-flecha' + (abierto ? ' ocr-flecha-abierta' : ''),
                contador: g.filas.length === 1 ? '1 documento' : `${g.filas.length} documentos`,
                riesgo: riesgo ? (riesgo === 1 ? '1 con riesgo' : `${riesgo} con riesgo`) : null
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
    handleTipo(e) { this.tipo = e.currentTarget.dataset.valor; }
    handleSituacion(e) { this.situacion = e.currentTarget.dataset.valor; }
    handleMotivo(e) { this.motivo = e.target.value; }
    handleBuscar(e) { this.busqueda = e.target.value || ''; }

    toggleAgrupado() {
        if (this.agrupar) {
            this.agrupado = true;
            this.dispatchEvent(eventoNavegar({ vista: 'ocr' }));
            return;
        }
        this.agrupado = !this.agrupado;
    }
    toggleGrupo(e) {
        const k = e.currentTarget.dataset.id;
        this.cerrados = { ...this.cerrados, [k]: !this.cerrados[k] };
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
