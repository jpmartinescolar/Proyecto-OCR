import { LightningElement, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getBandeja from '@salesforce/apex/BandejaContableController.getBandeja';
import listarArchivosGoogle from '@salesforce/apex/BandejaContableController.listarArchivosGoogle';
import listarDocumentosGoogle from '@salesforce/apex/BandejaContableController.listarDocumentosGoogle';
import reprocesarOcr from '@salesforce/apex/BandejaContableController.reprocesarOcr';
import { documentosDeBandeja } from 'c/bandejaContableMock';
import {
    fechaHora, bytes, extension, claseEstado, eventoNavegar, mensajeError, estadoArchivoGoogle, estadoDocumentoGoogle, ESTADOS_EN_CURSO
} from 'c/bandejaContableUtils';

const COLOR_TIPO = { PDF: 'var(--bc-danger)', JPG: 'var(--bc-brand-cyan)', JPEG: 'var(--bc-brand-cyan)', PNG: 'var(--bc-brand-cyan)', ZIP: 'var(--bc-warm)', XLSX: 'var(--bc-success)', XLS: 'var(--bc-success)' };
// Mientras Google está trabajando la ficha se refresca sola (cada 5 s, como mucho 10 min)
const REFRESCO_MS = 5000;
const REFRESCO_MAX = 120;

/**
 * Pantalla 01 · Registro de una bandeja. REAL: ficha, archivos, su procesamiento en Google (estado,
 * páginas, documentos, incidencias) y los documentos que ha separado Google con su lectura preliminar.
 * DE EJEMPLO: el estado contable de cada documento (Pendiente/Contabilizado) hasta la Fase 2-3.
 */
export default class BandejaContableRegistro extends NavigationMixin(LightningElement) {
    @api bandejaId;

    detalle;
    google = {}; // sfArchivoId → ArchivoGoogle
    docsGoogle = [];
    errorGoogle;
    cargando = true;
    error;
    reprocesando = false;
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
            this.detalle = await getBandeja({ bandejaId: this.bandejaId });
            this.error = null;
        } catch (e) {
            this.error = mensajeError(e);
        } finally {
            this.cargando = false;
        }
        await this.cargarGoogle();
    }

    /** Estado en Google y documentos separados; si falla, la ficha se ve igual */
    async cargarGoogle() {
        try {
            const [archivos, docs] = await Promise.all([
                listarArchivosGoogle({ bandejaId: this.bandejaId }),
                listarDocumentosGoogle({ bandejaId: this.bandejaId })
            ]);
            this.google = Object.fromEntries(archivos.map((a) => [a.archivoId, a]));
            this.docsGoogle = docs;
            this.errorGoogle = null;
        } catch (e) {
            this.errorGoogle = mensajeError(e);
        }
        this.programarRefresco();
    }

    programarRefresco() {
        clearTimeout(this.temporizador);
        if (!this.enCurso || this.refrescos >= REFRESCO_MAX) return;
        this.refrescos++;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.temporizador = setTimeout(async () => {
            if (this.detalle && this.detalle.archivos.some((a) => a.estado !== 'Sincronizado' && a.estado !== 'Error')) {
                try { this.detalle = await getBandeja({ bandejaId: this.bandejaId }); } catch { /* se reintenta en el siguiente */ }
            }
            this.cargarGoogle();
        }, REFRESCO_MS);
    }

    /** Hay archivos que Google todavía no ha terminado (o que Salesforce aún está subiendo) */
    get enCurso() {
        if (!this.detalle) return false;
        return this.detalle.archivos.some((a) => {
            if (a.estado === 'Subiendo' || a.estado === 'Subido') return true;
            const g = this.google[a.id];
            return a.estado === 'Sincronizado' && (!g || ESTADOS_EN_CURSO.includes(g.estado));
        });
    }

    get r() { return this.detalle ? this.detalle.resumen : {}; }
    get titulo() { return this.detalle ? `${this.r.empresa} · ${this.r.tipo}` : ''; }

    get pasos() {
        const completado = this.r.estado === 'Completado';
        return [
            { label: 'Pendiente', clase: 'bc-paso ' + (completado ? 'bc-paso-hecho' : 'bc-paso-actual') },
            { label: 'Completado', clase: 'bc-paso ' + (completado ? 'bc-paso-hecho' : '') }
        ];
    }

    /** Resumen del procesamiento de toda la bandeja en Google */
    get procesamiento() {
        if (!this.detalle) return null;
        const subidos = this.detalle.archivos.filter((a) => a.estado === 'Sincronizado');
        const g = subidos.map((a) => this.google[a.id]).filter(Boolean);
        const total = this.detalle.archivos.length;
        const enCurso = subidos.filter((a) => !this.google[a.id] || ESTADOS_EN_CURSO.includes(this.google[a.id].estado)).length;
        const errores = g.filter((x) => x.estado === 'ERROR').length;
        const docs = this.docsGoogle.length;
        const listos = this.docsGoogle.filter((d) => d.estado === 'LISTO').length;
        const revisar = this.docsGoogle.filter((d) => d.estado === 'REQUIERE_REVISION').length;
        if (this.errorGoogle) return { texto: 'Sin conexión con Google', clase: 'bc-pill bc-pill-error', detalle: this.errorGoogle };
        if (subidos.length < total) {
            return { texto: 'Subiendo archivos', clase: 'bc-pill bc-pill-info', detalle: `${subidos.length} de ${total} archivos en Google`, girando: true };
        }
        if (enCurso) {
            return { texto: 'Procesando en Google', clase: 'bc-pill bc-pill-info', detalle: `${total - enCurso} de ${total} archivos terminados · se actualiza solo`, girando: true };
        }
        const detalle = [`${docs} ${docs === 1 ? 'documento' : 'documentos'}`, listos ? `${listos} ${listos === 1 ? 'listo' : 'listos'}` : '',
            revisar ? `${revisar} para revisar` : '', errores ? `${errores} ${errores === 1 ? 'archivo' : 'archivos'} con error` : ''].filter(Boolean).join(' · ');
        if (errores) return { texto: 'Terminado con errores', clase: 'bc-pill bc-pill-error', detalle };
        if (revisar) return { texto: 'Terminado · revisar', clase: 'bc-pill bc-pill-pendiente', detalle };
        return { texto: 'Terminado', clase: 'bc-pill bc-pill-ok', detalle };
    }

    get grupos() {
        if (!this.detalle) return [];
        const d = this.detalle;
        const F = (label, valor, extra = {}) => ({ label, valor: valor || '—', clase: 'bc-campo', claseValor: 'bc-campo-valor', ...extra });
        const subida = `${d.resumen.estadoSubida} · ${d.archivosSincronizados} de ${d.resumen.archivos} archivos en Google`;
        return [
            {
                titulo: 'Información',
                campos: [
                    F('Empresa', d.resumen.empresa, { esEnlaceEmpresa: true, claseValor: 'bc-campo-valor bc-campo-link' }),
                    F('CIF', d.resumen.cif),
                    F('Tipo de facturas', d.resumen.tipo),
                    F('Origen', d.resumen.origen),
                    F('Observaciones del cliente', d.observaciones, { clase: 'bc-campo bc-campo-ancho' })
                ]
            },
            {
                titulo: 'Sistema',
                campos: [
                    F('Creado por', d.resumen.creadoPor, { claseValor: 'bc-campo-valor bc-campo-link' }),
                    F('Fecha de creación', fechaHora(d.resumen.fecha)),
                    F('Asesor responsable', d.asesor, { claseValor: 'bc-campo-valor bc-campo-link' }),
                    F('Última modificación', fechaHora(d.ultimaModificacion))
                ]
            },
            {
                titulo: 'Integración',
                campos: [
                    F('ID externo (Cloud SQL)', d.googleId),
                    F('Subida a Google', subida, {
                        claseValor: 'bc-campo-valor ' + (d.resumen.estadoSubida === 'Completada' ? 'bc-campo-ok' : '')
                    })
                ]
            }
        ].map((g) => ({ ...g, campos: g.campos.map((c, i) => ({ ...c, key: g.titulo + i })) }));
    }

    get archivos() {
        if (!this.detalle) return [];
        return this.detalle.archivos.map((a) => {
            const ext = extension(a.nombre) || '?';
            const g = this.google[a.id];
            // Antes de llegar a Google manda el estado de la subida (Salesforce); después, el de Google
            const enGoogle = a.estado === 'Sincronizado';
            const eg = enGoogle ? estadoArchivoGoogle(g) : null;
            return {
                ...a,
                ext,
                estiloTipo: `background:${COLOR_TIPO[ext] || 'var(--bc-ink-3)'}`,
                meta: `${bytes(a.tamano)} · ${fechaHora(a.fecha)}`,
                url: g && (g.descargaUrl || g.viewUrl),
                estadoTxt: enGoogle ? eg.texto : a.estado,
                claseEstado: enGoogle ? eg.clase : claseEstado(a.estado),
                explicacion: enGoogle ? eg.explicacion : '',
                resumenGoogle: eg ? eg.resumen : '',
                incidencias: eg ? eg.incidencias : [],
                hayIncidencias: !!(eg && eg.incidencias.length)
            };
        });
    }
    get tituloArchivos() { return `Archivos adjuntos por el cliente (${this.archivos.length})`; }
    get origenTxt() { return this.detalle ? 'Origen: ' + this.r.origen : ''; }

    // ===== Documentos =====
    get hayDocumentosGoogle() { return this.docsGoogle.length > 0; }

    /** Documentos separados por Google (sin ellos la tabla no se muestra: nada de documentos inventados) */
    get documentos() {
        if (!this.detalle || !this.hayDocumentosGoogle) return [];
        const contables = documentosDeBandeja(this.detalle, this.docsGoogle);
        return this.docsGoogle.map((g, i) => {
            const e = estadoDocumentoGoogle(g);
            const c = contables[i];
            return {
                id: g.id,
                numero: c.numero,
                nombre: g.nombre,
                origen: g.archivoOrigen,
                paginas: g.paginaInicio === g.paginaFin ? `pág. ${g.paginaInicio}` : `págs. ${g.paginaInicio}–${g.paginaFin}`,
                tipoTxt: e.tipoTxt,
                lectura: [g.emisor, g.numeroFactura, g.fecha, g.total ? g.total + ' €' : ''].filter(Boolean).join(' · ') || 'Sin lectura',
                estadoTxt: e.estadoTxt,
                claseEstado: e.clase,
                motivosTxt: e.motivosTxt,
                contableTxt: c.motivo ? `${c.estado} · ${c.motivo}` : c.estado,
                claseContable: claseEstado(c.estado),
                viewUrl: g.viewUrl
            };
        });
    }
    get tituloDocumentos() { return `OCR documentos (${this.documentos.length})`; }
    get sinDocumentosTxt() {
        return this.enCurso ? 'Google está separando los archivos; los documentos aparecerán aquí en cuanto termine.'
            : 'Todavía no hay documentos: aparecerán cuando los archivos estén registrados en Google.';
    }

    // ===== Acciones =====
    get puedeReprocesar() { return !this.reprocesando && !this.enCurso && Object.keys(this.google).length > 0; }
    get noPuedeReprocesar() { return !this.puedeReprocesar; }

    async reprocesar() {
        this.reprocesando = true;
        try {
            const n = await reprocesarOcr({ bandejaId: this.bandejaId });
            this.toast('Reproceso solicitado', n === 1 ? 'Google volverá a separar y leer 1 archivo.' : `Google volverá a separar y leer ${n} archivos.`, 'success');
            this.refrescos = 0;
            // El estado pasa a "En cola" en unos segundos: se empieza a refrescar ya
            this.google = Object.fromEntries(Object.entries(this.google).map(([k, g]) => [k, { ...g, estado: 'EN_COLA' }]));
            this.programarRefresco();
        } catch (e) {
            this.toast('No se ha podido reprocesar', mensajeError(e), 'error');
        } finally {
            this.reprocesando = false;
        }
    }

    irALista(e) {
        e.preventDefault();
        this.dispatchEvent(eventoNavegar({ vista: 'lista' }));
    }

    irAEmpresa(e) {
        e.preventDefault();
        this.dispatchEvent(eventoNavegar({ vista: 'empresa', empresaId: this.r.empresaId }));
    }

    abrirDocumento(e) {
        e.preventDefault();
        this.dispatchEvent(eventoNavegar({ vista: 'documento', bandejaId: this.bandejaId, docId: e.currentTarget.dataset.id }));
    }

    handleEditar() {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId: this.bandejaId, objectApiName: 'Bandeja_Contable__c', actionName: 'edit' }
        });
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
