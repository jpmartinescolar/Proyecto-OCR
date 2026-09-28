import { LightningElement, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getBandeja from '@salesforce/apex/BandejaContableController.getBandeja';
import listarArchivosGoogle from '@salesforce/apex/BandejaContableController.listarArchivosGoogle';
import { documentosDeBandeja } from 'c/bandejaContableMock';
import { fechaHora, bytes, extension, claseEstado, eventoNavegar, mensajeError } from 'c/bandejaContableUtils';

const COLOR_TIPO = { PDF: 'var(--bc-danger)', JPG: 'var(--bc-brand-cyan)', JPEG: 'var(--bc-brand-cyan)', PNG: 'var(--bc-brand-cyan)', ZIP: 'var(--bc-warm)', XLSX: 'var(--bc-success)', XLS: 'var(--bc-success)' };

/**
 * Pantalla 01 · Registro de una bandeja: ficha (real), archivos adjuntos (reales, con descarga desde
 * Google) y documentos OCR desglosados (de ejemplo hasta que exista el pipeline OCR).
 */
export default class BandejaContableRegistro extends NavigationMixin(LightningElement) {
    @api bandejaId;

    detalle;
    urls = {};
    errorGoogle;
    cargando = true;
    error;

    connectedCallback() {
        this.cargar();
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
        // Las URL de descarga vienen de Google (firmadas, 15 min); si falla, la ficha se ve igual
        try {
            const archivos = await listarArchivosGoogle({ bandejaId: this.bandejaId });
            this.urls = Object.fromEntries(archivos.map((a) => [a.archivoId, a.descargaUrl || a.viewUrl]));
            this.errorGoogle = null;
        } catch (e) {
            this.errorGoogle = mensajeError(e);
        }
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
                    F('Estado de sincronización', subida, {
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
            return {
                ...a,
                ext,
                estiloTipo: `background:${COLOR_TIPO[ext] || 'var(--bc-ink-3)'}`,
                meta: `${bytes(a.tamano)} · ${fechaHora(a.fecha)}`,
                url: this.urls[a.id],
                noSincronizado: a.estado !== 'Sincronizado',
                claseEstado: claseEstado(a.estado)
            };
        });
    }
    get tituloArchivos() { return `Archivos adjuntos por el cliente (${this.archivos.length})`; }
    get origenTxt() { return this.detalle ? 'Origen: ' + this.r.origen : ''; }

    get documentos() {
        if (!this.detalle) return [];
        return documentosDeBandeja(this.detalle).map((d) => ({ ...d, claseEstado: claseEstado(d.estado) }));
    }
    get hayDocumentos() { return this.documentos.length > 0; }
    get tituloDocumentos() { return `OCR documentos (${this.documentos.length})`; }

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
}
