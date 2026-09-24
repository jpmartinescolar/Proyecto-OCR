import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import BANDEJA_CONTABLE_OBJECT from '@salesforce/schema/Bandeja_Contable__c';
import TIPO_FIELD from '@salesforce/schema/Bandeja_Contable__c.Tipo_documentacion__c';
import getContexto from '@salesforce/apex/SubirFacturasController.getContexto';
import crearRegistro from '@salesforce/apex/SubirFacturasController.crearRegistro';
import solicitarSesionSubida from '@salesforce/apex/SubirFacturasController.solicitarSesionSubida';
import confirmarSubida from '@salesforce/apex/SubirFacturasController.confirmarSubida';
import marcarError from '@salesforce/apex/SubirFacturasController.marcarError';
import { ACCEPT, validarArchivo, formatearBytes } from './validacionArchivo';
import { SubidaResumible, SubidaCancelada, simularSubida } from './subidaResumible';

// Con más empresas que esto se usa el buscador en vez del desplegable
const MAX_EMPRESAS_COMBO = 50;

const PASOS = [
    { key: 'registro', label: 'Registro en Salesforce' },
    { key: 'sesion', label: 'Preparar subida' },
    { key: 'subida', label: 'Subir a Cloud Storage' },
    { key: 'confirmacion', label: 'Confirmar en Google' }
];

/** Error de Google que Apex ya ha guardado en el registro (no hay que llamar a marcarError) */
class ErrorGuardado extends Error {}

let clave = 0;

export default class TestSubirFacturasA extends NavigationMixin(LightningElement) {
    accept = ACCEPT;

    contexto;
    errorCarga;
    tipoOpciones = [];

    empresaId = '';
    tipo = '';
    observaciones = '';
    archivos = [];

    trabajando = false;
    canceladoPorUsuario = false;
    subida = null;
    controlSimulado = null;

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
    get simulado() { return this.contexto && this.contexto.simulado; }
    get maxBytesTxt() { return this.contexto ? formatearBytes(this.contexto.maxBytes) : ''; }

    // ===== Archivos en cola =====
    get hayArchivos() { return this.archivos.length > 0; }
    // Vista para la plantilla: LWC no permite comparar a.estado === 'x' dentro del HTML
    get filasArchivos() {
        return this.archivos.map((a) => ({
            ...a,
            esInvalido: a.estado === 'invalido',
            esSubiendo: a.estado === 'subiendo',
            esOk: a.estado === 'ok',
            esError: a.estado === 'error',
            mostrarProgreso: a.estado === 'subiendo',
            permiteQuitar: a.estado !== 'subiendo',
            permiteReintentar: a.estado === 'error' && !this.trabajando,
            filaCls: 'stf-fila stf-fila-' + a.estado
        }));
    }
    get totalArchivosTxt() {
        const n = this.archivos.length;
        return n === 1 ? '1 archivo' : n + ' archivos';
    }
    get botonSubirLabel() {
        const pendientes = this.archivos.filter((a) => a.estado === 'pendiente' || a.estado === 'error').length;
        return pendientes > 1 ? `Subir ${pendientes} facturas` : 'Subir factura';
    }
    get botonDeshabilitado() {
        if (this.trabajando || !this.contexto || this.sinEmpresas) return true;
        return !this.archivos.some((a) => a.estado === 'pendiente' || a.estado === 'error');
    }
    get puedeReintentar() { return false; } // el reintento ahora es por archivo (ver reintentarUno)

    // ===== Campos =====
    handleEmpresaCombo(e) { this.empresaId = e.detail.value; }
    handleEmpresaPicker(e) { this.empresaId = e.detail.recordId || ''; }
    handleTipo(e) { this.tipo = e.detail.value; }
    handleObservaciones(e) { this.observaciones = e.detail.value; }

    // Cada selección (o soltar archivos) añade a la cola; no hay límite de cantidad
    handleArchivo(e) {
        const nuevos = e.target.files ? Array.from(e.target.files) : [];
        const maxBytes = this.contexto && this.contexto.maxBytes;
        nuevos.forEach((file) => {
            const fileError = validarArchivo(file, maxBytes) || '';
            this.archivos.push({
                key: 'f' + clave++,
                file,
                nombre: file.name,
                tamanoTxt: formatearBytes(file.size),
                fileError,
                estado: fileError ? 'invalido' : 'pendiente',
                progreso: 0,
                progresoTxt: '',
                mensaje: '',
                recordId: null,
                numero: ''
            });
        });
        this.archivos = [...this.archivos];
        e.target.value = null; // permite volver a elegir el mismo archivo si hace falta
        if (nuevos.some((f) => validarArchivo(f, maxBytes))) {
            this.toast('Algún archivo no es válido', 'Revisa la lista: los archivos marcados en rojo no se subirán.', 'warning');
        }
    }

    quitarArchivo(e) {
        const key = e.currentTarget.dataset.key;
        this.archivos = this.archivos.filter((a) => a.key !== key || a.estado === 'subiendo');
    }

    reintentarUno(e) {
        const key = e.currentTarget.dataset.key;
        const item = this.archivos.find((a) => a.key === key);
        if (item) {
            item.estado = 'pendiente';
            item.mensaje = '';
            this.archivos = [...this.archivos];
            this.handleSubir();
        }
    }

    validarFormulario() {
        const campos = [...this.template.querySelectorAll('lightning-combobox, lightning-textarea')];
        const camposOk = campos.reduce((ok, c) => c.reportValidity() && ok, true);
        if (!this.empresaId) {
            this.toast('Falta la empresa', 'Selecciona la empresa.', 'error');
            return false;
        }
        if (!this.archivos.some((a) => a.estado === 'pendiente' || a.estado === 'error')) {
            this.toast('Falta el archivo', 'Adjunta al menos un fichero válido.', 'error');
            return false;
        }
        return camposOk;
    }

    // ===== Flujo: registro → sesión → subida → confirmación, uno por uno =====
    async handleSubir() {
        if (this.trabajando || !this.validarFormulario()) return;
        this.trabajando = true;
        this.canceladoPorUsuario = false;
        try {
            for (const item of this.archivos) {
                if (this.canceladoPorUsuario) break;
                if (item.estado !== 'pendiente' && item.estado !== 'error') continue;
                await this.subirUno(item);
            }
        } finally {
            this.trabajando = false;
            this.subida = null;
            this.controlSimulado = null;
        }
    }

    async subirUno(item) {
        item.estado = 'subiendo';
        item.paso = 'registro';
        item.mensaje = '';
        this.archivos = [...this.archivos];
        try {
            if (!item.recordId) {
                const r = await crearRegistro({
                    empresaId: this.empresaId,
                    tipo: this.tipo,
                    observaciones: this.observaciones,
                    nombreArchivo: item.file.name,
                    tamano: item.file.size,
                    mime: item.file.type
                });
                item.recordId = r.recordId;
                item.numero = r.numero;
            }

            item.paso = 'sesion';
            this.actualizarItem(item);
            const s = await solicitarSesionSubida({ recordId: item.recordId, origin: window.location.origin });
            if (!s.ok) throw new ErrorGuardado(s.mensaje);

            item.paso = 'subida';
            const onProgreso = (subidos) => {
                item.progreso = item.file.size ? Math.round((subidos / item.file.size) * 100) : 0;
                item.progresoTxt = `${formatearBytes(subidos)} de ${formatearBytes(item.file.size)} (${item.progreso} %)`;
                this.actualizarItem(item);
            };
            if (s.sesion.simulado) {
                this.controlSimulado = { cancelada: false };
                await simularSubida(item.file, onProgreso, this.controlSimulado);
            } else {
                this.subida = new SubidaResumible(item.file, s.sesion.uploadUrl, onProgreso);
                await this.subida.iniciar();
            }

            item.paso = 'confirmacion';
            this.actualizarItem(item);
            const c = await confirmarSubida({ recordId: item.recordId });
            if (!c.ok) throw new ErrorGuardado(c.mensaje);
            item.estado = 'ok';
            item.numero = c.numero;
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
        // Los fallos del navegador (subida a GCS) se guardan en el registro desde aquí;
        // los de Google ya los ha guardado Apex, y los de validación no tienen registro
        if (item.recordId && !(e instanceof ErrorGuardado) && item.paso === 'subida') {
            try {
                await marcarError({ recordId: item.recordId, mensaje });
            } catch (err) {
                item.mensaje = mensaje + ' (Tampoco se ha podido guardar el error: ' + this.reduceError(err) + ')';
                this.actualizarItem(item);
            }
        }
    }

    actualizarItem(item) {
        this.archivos = this.archivos.map((a) => (a.key === item.key ? { ...item } : a));
    }

    handleCancelar() {
        this.canceladoPorUsuario = true;
        if (this.subida) this.subida.cancelar();
        if (this.controlSimulado) this.controlSimulado.cancelada = true;
    }

    handleAbrirRegistro(e) {
        const key = e.currentTarget.dataset.key;
        const item = this.archivos.find((a) => a.key === key);
        if (!item || !item.recordId) return;
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId: item.recordId, objectApiName: 'Bandeja_Contable__c', actionName: 'view' }
        });
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
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
