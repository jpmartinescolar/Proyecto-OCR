import { LightningElement, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getBandeja from '@salesforce/apex/BandejaContableController.getBandeja';
import listarArchivosGoogle from '@salesforce/apex/BandejaContableController.listarArchivosGoogle';
import listarDocumentosGoogle from '@salesforce/apex/BandejaContableController.listarDocumentosGoogle';
import reprocesarOcr from '@salesforce/apex/BandejaContableController.reprocesarOcr';
import { documentosDeBandeja } from 'c/bandejaContableMock';
import {
    fechaHora, bytes, extension, claseEstado, eventoNavegar, mensajeError, estadoArchivoGoogle, estadoDocumentoGoogle,
    estadoProceso, estadoProcesoArchivo, recuentoDeArchivos, ESTADOS_PROCESO, ESTADOS_PROCESO_EN_CURSO
} from 'c/bandejaContableUtils';

const COLOR_TIPO = { PDF: 'var(--bc-danger)', JPG: 'var(--bc-brand-cyan)', JPEG: 'var(--bc-brand-cyan)', PNG: 'var(--bc-brand-cyan)', ZIP: 'var(--bc-warm)', XLSX: 'var(--bc-success)', XLS: 'var(--bc-success)' };
// Mientras se suben o procesan archivos la ficha se refresca sola (cada 5 s, como mucho 10 min)
const REFRESCO_MS = 5000;
const REFRESCO_MAX = 120;
const FILAS_CARGA = [1, 2, 3]; // filas de carga (skeleton) de OCR documentos
const EXPLICACION_SUBIDA = { Pendiente: 'Preparando la subida', Subiendo: 'Subiendo el archivo', Subido: 'Subido; registrándolo' };

/**
 * Pantalla 01 · Registro de una bandeja. REAL: ficha, archivos, su procesamiento en Google (estado,
 * páginas, documentos, incidencias) y los documentos que ha separado Google con su lectura preliminar.
 * El estado que ve el usuario es el mismo del listado (Cargando, Procesando, Procesado, Error:
 * bandejaContableUtils.estadoProceso). La ficha y el procesamiento se piden a la vez.
 * DE EJEMPLO: el estado contable de cada documento (Pendiente/Contabilizado) hasta la Fase 2-3.
 */
export default class BandejaContableRegistro extends NavigationMixin(LightningElement) {
    @api bandejaId;

    detalle;
    google = {}; // sfArchivoId → ArchivoGoogle
    docsGoogle = [];
    errorGoogle;
    cargando = true;
    googleCargado = false; // primera respuesta del procesamiento recibida (hasta entonces, filas de carga)
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
        const google = this.cargarGoogle(); // no depende de la ficha: en paralelo
        try {
            this.detalle = await getBandeja({ bandejaId: this.bandejaId });
            this.error = null;
        } catch (e) {
            this.error = mensajeError(e);
        } finally {
            this.cargando = false;
        }
        await google;
        this.programarRefresco();
    }

    /** Procesamiento de los archivos y documentos separados (solo datos); si falla, la ficha se ve igual */
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
        this.googleCargado = true;
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
            await this.cargarGoogle();
            this.programarRefresco();
        }, REFRESCO_MS);
    }

    /** Algún archivo se está subiendo o procesando */
    get enCurso() {
        return !!this.proceso && ESTADOS_PROCESO_EN_CURSO.includes(this.proceso.clave);
    }

    /** Estado de la bandeja que ve el usuario (el mismo cálculo que en el listado) */
    get proceso() {
        if (!this.detalle) return null;
        if (this.errorGoogle) return { clave: 'desconocido', ...ESTADOS_PROCESO.desconocido, detalle: this.errorGoogle };
        if (!this.googleCargado && this.detalle.archivos.some((a) => a.estado === 'Sincronizado')) {
            return { clave: 'consultando', ...ESTADOS_PROCESO.consultando, detalle: '' };
        }
        return estadoProceso(recuentoDeArchivos(this.detalle.archivos, this.google));
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

    /** Cabecera: estado del procesamiento de la bandeja */
    get procesamiento() {
        const p = this.proceso;
        return p ? { ...p, girando: this.enCurso } : null;
    }

    get grupos() {
        if (!this.detalle) return [];
        const d = this.detalle;
        const F = (label, valor, extra = {}) => ({ label, valor: valor || '—', clase: 'bc-campo', claseValor: 'bc-campo-valor', ...extra });
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
                campos: [F('ID externo', d.googleId)]
            }
        ].map((g) => ({ ...g, campos: g.campos.map((c, i) => ({ ...c, key: g.titulo + i })) }));
    }

    get archivos() {
        if (!this.detalle) return [];
        return this.detalle.archivos.map((a) => {
            const ext = extension(a.nombre) || '?';
            const g = this.google[a.id];
            // El estado es el mismo que el de la bandeja; el detalle técnico queda en el tooltip
            const enGoogle = a.estado === 'Sincronizado' && !!g;
            const eg = enGoogle ? estadoArchivoGoogle(g) : null;
            const estado = ESTADOS_PROCESO[estadoProcesoArchivo(a.estado, g)];
            return {
                ...a,
                ext,
                estiloTipo: `background:${COLOR_TIPO[ext] || 'var(--bc-ink-3)'}`,
                meta: `${bytes(a.tamano)} · ${fechaHora(a.fecha)}`,
                url: g && (g.descargaUrl || g.viewUrl),
                estadoTxt: estado.texto,
                claseEstado: estado.clase,
                explicacion: eg ? eg.explicacion : EXPLICACION_SUBIDA[a.estado] || '',
                resumen: eg ? eg.resumen : '',
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
                claseContable: claseEstado(c.estado)
            };
        });
    }
    get tituloDocumentos() { return `OCR documentos (${this.documentos.length})`; }

    // Qué se ve en OCR documentos: filas de carga hasta la primera respuesta; después, los documentos que
    // haya y, mientras se procesa, un aviso de que aparecerán más.
    get cargandoDocumentos() { return !this.googleCargado && !this.errorGoogle; }
    get filasCarga() { return FILAS_CARGA; }
    get avisoProceso() {
        if (this.cargandoDocumentos || !this.enCurso) return null;
        const p = this.proceso;
        return p.clave === 'cargando'
            ? `Estamos recibiendo los archivos (${p.detalle}). Después se separarán y leerán los documentos.`
            : `Estamos procesando los documentos (${p.detalle}). Aparecerán aquí automáticamente.`;
    }
    get sinDocumentos() { return !this.cargandoDocumentos && !this.hayDocumentosGoogle && !this.avisoProceso && !this.errorGoogle; }
    get sinDocumentosTxt() {
        const p = this.proceso;
        if (!p || p.clave === 'vacio') return 'Esta bandeja no tiene archivos.';
        if (p.clave === 'error') return 'No se han podido procesar los archivos. Revisa el motivo en cada archivo y, si se puede corregir, pulsa Reprocesar OCR.';
        return 'No se han encontrado documentos en los archivos de esta bandeja.';
    }

    // ===== Acciones =====
    get puedeReprocesar() { return !this.reprocesando && !this.enCurso && Object.keys(this.google).length > 0; }
    get noPuedeReprocesar() { return !this.puedeReprocesar; }

    async reprocesar() {
        this.reprocesando = true;
        try {
            const n = await reprocesarOcr({ bandejaId: this.bandejaId });
            this.toast('Reproceso solicitado', n === 1 ? 'Se volverá a separar y leer 1 archivo.' : `Se volverán a separar y leer ${n} archivos.`, 'success');
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
