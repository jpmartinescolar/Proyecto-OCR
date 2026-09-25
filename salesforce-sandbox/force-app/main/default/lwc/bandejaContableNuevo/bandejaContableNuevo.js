import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import BANDEJA_CONTABLE_OBJECT from '@salesforce/schema/Bandeja_Contable__c';
import TIPO_FIELD from '@salesforce/schema/Bandeja_Contable__c.Tipo_documentacion__c';
import getContexto from '@salesforce/apex/BandejaContableController.getContexto';
import crearBandeja from '@salesforce/apex/BandejaContableController.crearBandeja';
import solicitarSesionSubida from '@salesforce/apex/BandejaContableController.solicitarSesionSubida';
import confirmarSubida from '@salesforce/apex/BandejaContableController.confirmarSubida';
import marcarError from '@salesforce/apex/BandejaContableController.marcarError';
import { ACCEPT, validarArchivo, formatearBytes } from './validacionArchivo';
import { SubidaResumible, SubidaCancelada } from './subidaResumible';

// Con más empresas que esto se usa el buscador en vez del desplegable
const MAX_EMPRESAS_COMBO = 50;

/** Error de Google que Apex ya ha guardado en el archivo (no hay que llamar a marcarError) */
class ErrorGuardado extends Error {}

let clave = 0;

/**
 * Formulario de una nueva Bandeja Contable: empresa, tipo, observaciones y N archivos.
 * Al subir se crea la bandeja con un registro por archivo y después cada archivo se sube a
 * Cloud Storage y se confirma en Google, uno detrás de otro. Emite:
 *  - trabajando  (detail: boolean) mientras hay una subida en curso
 *  - finalizado  (detail: { bandejaId, numero, errores }) al terminar una tanda
 */
export default class BandejaContableNuevo extends NavigationMixin(LightningElement) {
    accept = ACCEPT;

    contexto;
    errorCarga;
    tipoOpciones = [];

    empresaId = '';
    tipo = '';
    observaciones = '';
    archivos = [];

    errorFormulario = null;

    bandejaId = null;
    numero = '';

    trabajando = false;
    canceladoPorUsuario = false;
    subida = null;

    @wire(getContexto)
    wiredContexto({ data, error }) {
        if (data) {
            this.contexto = data;
            this.errorCarga = null;
            if (data.empresas && data.empresas.length === 1) this.empresaId = data.empresas[0].id;
        } else if (error) {
            this.errorCarga = this.reduceError(error);
        }
    }

    @wire(getObjectInfo, { objectApiName: BANDEJA_CONTABLE_OBJECT })
    objectInfo;

    @wire(getPicklistValues, { recordTypeId: '$objectInfo.data.defaultRecordTypeId', fieldApiName: TIPO_FIELD })
    wiredTipos({ data }) {
        if (data) this.tipoOpciones = data.values.map((v) => ({ label: v.label, value: v.value }));
    }

    // ===== Empresa: una sola, desplegable o buscador según cuántas tenga =====
    get cargando() { return !this.contexto && !this.errorCarga; }
    get empresas() { return (this.contexto && this.contexto.empresas) || []; }
    get modoLibre() { return this.contexto && this.contexto.modoLibre; }
    get sinEmpresas() { return this.contexto && !this.modoLibre && this.empresas.length === 0; }
    get empresaUnica() { return !this.modoLibre && this.empresas.length === 1 ? this.empresas[0] : null; }
    get usarCombo() { return !this.modoLibre && this.empresas.length > 1 && this.empresas.length <= MAX_EMPRESAS_COMBO; }
    get usarPicker() { return this.modoLibre || this.empresas.length > MAX_EMPRESAS_COMBO; }
    get empresaOpciones() {
        return this.empresas.map((e) => ({ label: e.cif ? `${e.nombre} (${e.cif})` : e.nombre, value: e.id }));
    }
    // En modo libre el buscador no filtra; si no, solo deja elegir entre las empresas asignadas
    get pickerFiltro() {
        if (this.modoLibre) return undefined;
        return { criteria: [{ fieldPath: 'Id', operator: 'in', value: this.empresas.map((e) => e.id) }] };
    }
    get maxBytesTxt() { return this.contexto ? formatearBytes(this.contexto.maxBytes) : ''; }

    // Una vez creada la bandeja, sus datos y su lista de archivos ya no cambian: solo se reintenta
    get bandejaCreada() { return !!this.bandejaId; }
    get formularioBloqueado() { return this.trabajando || this.bandejaCreada; }

    // ===== Archivos en cola =====
    get hayArchivos() { return this.archivos.length > 0; }
    // Vista para la plantilla: LWC no permite comparar a.estado === 'x' dentro del HTML
    get filasArchivos() {
        return this.archivos.map((a) => ({
            ...a,
            esInvalido: a.estado === 'invalido',
            esOk: a.estado === 'ok',
            esError: a.estado === 'error',
            mostrarProgreso: a.estado === 'subiendo',
            permiteQuitar: !this.bandejaCreada && !this.trabajando,
            permiteReintentar: a.estado === 'error' && !this.trabajando,
            filaCls: 'bcn-fila bcn-fila-' + a.estado
        }));
    }
    get totalArchivosTxt() {
        const n = this.archivos.length;
        return n === 1 ? '1 archivo' : n + ' archivos';
    }
    get pendientes() {
        return this.archivos.filter((a) => a.estado === 'pendiente' || a.estado === 'error');
    }
    get botonSubirLabel() {
        const n = this.pendientes.length;
        if (this.bandejaCreada) return n > 1 ? `Reintentar ${n} archivos` : 'Reintentar';
        return n === 1 ? 'Subir 1 archivo' : `Subir ${n} archivos`;
    }
    get botonDeshabilitado() {
        return this.trabajando || !this.contexto || this.sinEmpresas || this.pendientes.length === 0;
    }
    get resumen() {
        if (!this.bandejaCreada) return null;
        const ok = this.archivos.filter((a) => a.estado === 'ok').length;
        return `${this.numero} · ${ok} de ${this.archivos.length} archivos subidos`;
    }

    // ===== Campos =====
    handleEmpresaCombo(e) { this.empresaId = e.detail.value; }
    handleEmpresaPicker(e) { this.empresaId = e.detail.recordId || ''; }
    handleTipo(e) { this.tipo = e.detail.value; }
    handleObservaciones(e) { this.observaciones = e.detail.value; }

    // Cada selección añade a la cola; se pueden añadir archivos en varias tandas antes de subir
    handleArchivo(e) {
        const nuevos = e.target.files ? Array.from(e.target.files) : [];
        const maxBytes = this.contexto && this.contexto.maxBytes;
        const filas = nuevos.map((file) => {
            const fileError = validarArchivo(file, maxBytes) || '';
            return {
                key: 'f' + clave++,
                file,
                nombre: file.name,
                tamanoTxt: formatearBytes(file.size),
                fileError,
                estado: fileError ? 'invalido' : 'pendiente',
                progreso: 0,
                progresoTxt: '',
                mensaje: '',
                archivoId: null,
                subido: false
            };
        });
        this.archivos = [...this.archivos, ...filas];
        e.target.value = null; // permite volver a elegir el mismo archivo si hace falta
    }

    quitarArchivo(e) {
        const key = e.currentTarget.dataset.key;
        this.archivos = this.archivos.filter((a) => a.key !== key);
    }

    reintentarUno(e) {
        const item = this.archivos.find((a) => a.key === e.currentTarget.dataset.key);
        if (!item) return;
        this.subirPendientes([item]);
    }

    validarFormulario() {
        const campos = [...this.template.querySelectorAll('lightning-combobox, lightning-textarea, lightning-record-picker')];
        const camposOk = campos.reduce((ok, c) => c.reportValidity() && ok, true);
        if (!this.empresaId) {
            this.errorFormulario = 'Selecciona la empresa.';
            return false;
        }
        if (this.archivos.some((a) => a.estado === 'invalido')) {
            this.errorFormulario = 'Quita de la lista los archivos marcados en rojo antes de subir.';
            return false;
        }
        if (this.pendientes.length === 0) {
            this.errorFormulario = 'Adjunta al menos un archivo.';
            return false;
        }
        this.errorFormulario = null;
        return camposOk;
    }

    // ===== Flujo: bandeja → (sesión → subida → confirmación) por archivo =====
    async handleSubir() {
        if (this.trabajando) return;
        if (!this.bandejaCreada && !this.validarFormulario()) return;
        await this.subirPendientes(this.pendientes);
    }

    async subirPendientes(items) {
        this.setTrabajando(true);
        this.canceladoPorUsuario = false;
        try {
            if (!this.bandejaCreada) await this.crearLaBandeja();
            for (const item of items) {
                if (this.canceladoPorUsuario) break;
                // Un archivo detrás de otro: así el progreso es legible y cancelar corta la cola
                // eslint-disable-next-line no-await-in-loop
                await this.subirUno(item);
            }
        } catch (e) {
            // Solo llega aquí un fallo al crear la bandeja (validación de Apex): no se ha guardado nada
            this.errorFormulario = this.reduceError(e);
        } finally {
            this.subida = null;
            this.setTrabajando(false);
            if (this.bandejaCreada) {
                this.dispatchEvent(new CustomEvent('finalizado', {
                    detail: {
                        bandejaId: this.bandejaId,
                        numero: this.numero,
                        errores: this.archivos.filter((a) => a.estado === 'error').length
                    }
                }));
            }
        }
    }

    async crearLaBandeja() {
        const r = await crearBandeja({
            empresaId: this.empresaId,
            tipo: this.tipo,
            observaciones: this.observaciones,
            archivos: this.pendientes.map((a) => ({
                clave: a.key,
                nombre: a.file.name,
                tamano: a.file.size,
                mime: a.file.type
            }))
        });
        this.bandejaId = r.bandejaId;
        this.numero = r.numero;
        const ids = new Map(r.archivos.map((a) => [a.clave, a.archivoId]));
        this.archivos = this.archivos.map((a) => ({ ...a, archivoId: ids.get(a.key) || null }));
    }

    async subirUno(original) {
        // Trabajar sobre la fila actual (la lista se sustituye en cada cambio)
        const item = { ...this.archivos.find((a) => a.key === original.key) };
        item.estado = 'subiendo';
        item.mensaje = '';
        this.actualizarItem(item);
        try {
            // Si el archivo ya llegó a Cloud Storage y solo falló la confirmación, no se vuelve a subir
            if (!item.subido) {
                item.paso = 'sesion';
                const s = await solicitarSesionSubida({ archivoId: item.archivoId, origin: window.location.origin });
                if (!s.ok) throw new ErrorGuardado(s.mensaje);

                item.paso = 'subida';
                const onProgreso = (subidos) => {
                    item.progreso = item.file.size ? Math.round((subidos / item.file.size) * 100) : 0;
                    item.progresoTxt = `${formatearBytes(subidos)} de ${formatearBytes(item.file.size)} (${item.progreso} %)`;
                    this.actualizarItem(item);
                };
                this.subida = new SubidaResumible(item.file, s.uploadUrl, onProgreso);
                await this.subida.iniciar();
                item.subido = true;
            }

            item.paso = 'confirmacion';
            item.progresoTxt = 'Registrando en Google…';
            this.actualizarItem(item);
            const c = await confirmarSubida({ archivoId: item.archivoId });
            if (!c.ok) throw new ErrorGuardado(c.mensaje);
            item.estado = 'ok';
            item.mensaje = c.mensaje;
            this.actualizarItem(item);
        } catch (e) {
            await this.gestionarError(item, e);
        }
    }

    async gestionarError(item, e) {
        const mensaje = e instanceof SubidaCancelada ? e.message : this.reduceError(e);
        item.estado = 'error';
        item.mensaje = mensaje;
        this.actualizarItem(item);
        // Los fallos del navegador (subida a Cloud Storage) se guardan en el archivo desde aquí;
        // los de Google ya los ha guardado Apex
        if (item.archivoId && !(e instanceof ErrorGuardado) && item.paso === 'subida') {
            try {
                await marcarError({ archivoId: item.archivoId, mensaje });
            } catch (err) {
                item.mensaje = mensaje + ' (Tampoco se ha podido guardar el error: ' + this.reduceError(err) + ')';
                this.actualizarItem(item);
            }
        }
    }

    actualizarItem(item) {
        this.archivos = this.archivos.map((a) => (a.key === item.key ? { ...item } : a));
    }

    setTrabajando(valor) {
        this.trabajando = valor;
        this.dispatchEvent(new CustomEvent('trabajando', { detail: valor }));
    }

    handleCancelar() {
        this.canceladoPorUsuario = true;
        if (this.subida) this.subida.cancelar();
    }

    handleAbrirBandeja() {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId: this.bandejaId, objectApiName: 'Bandeja_Contable__c', actionName: 'view' }
        });
    }

    reduceError(err) {
        if (!err) return 'Error desconocido';
        if (typeof err === 'string') return err;
        if (err.body) {
            if (Array.isArray(err.body)) return err.body.map((e) => e.message).join(', ');
            if (err.body.message) return err.body.message;
        }
        return err.message || JSON.stringify(err);
    }
}
