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

export default class TestSubirFacturasA extends NavigationMixin(LightningElement) {
    accept = ACCEPT;
    pasos = PASOS;

    contexto;
    errorCarga;
    tipoOpciones = [];

    empresaId = '';
    tipo = '';
    observaciones = '';
    file = null;
    fileError = '';

    trabajando = false;
    paso = '';
    subidos = 0;
    error = '';
    resultado = null;
    // Registro creado en el intento actual: al reintentar se reutiliza en vez de crear otro
    recordId = null;
    numero = '';
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

    // ===== Estado de la subida =====
    get botonDeshabilitado() { return this.trabajando || !this.contexto || this.sinEmpresas; }
    get fileInfo() { return this.file ? `${this.file.name} · ${formatearBytes(this.file.size)}` : ''; }
    get progreso() { return this.file && this.file.size ? Math.round((this.subidos / this.file.size) * 100) : 0; }
    get progresoTxt() {
        return this.file ? `${formatearBytes(this.subidos)} de ${formatearBytes(this.file.size)} (${this.progreso} %)` : '';
    }
    get mostrarProgreso() { return this.trabajando || this.paso === 'subida'; }
    get pasoActual() { return this.paso || 'registro'; }
    get hayError() { return !!this.error; }
    get puedeReintentar() { return this.hayError && !this.trabajando && !!this.file && !this.fileError; }
    get exitoCompleto() { return this.resultado && this.resultado.estado === 'Sincronizado'; }
    get resultadoCls() {
        return 'slds-box slds-m-top_medium ' + (this.exitoCompleto ? 'stf-ok' : 'stf-aviso');
    }

    // ===== Campos =====
    handleEmpresaCombo(e) { this.empresaId = e.detail.value; this.nuevoIntento(); }
    handleEmpresaPicker(e) { this.empresaId = e.detail.recordId || ''; this.nuevoIntento(); }
    handleTipo(e) { this.tipo = e.detail.value; this.nuevoIntento(); }
    handleObservaciones(e) { this.observaciones = e.detail.value; }

    handleArchivo(e) {
        const files = e.target.files;
        this.file = files && files.length ? files[0] : null;
        this.fileError = validarArchivo(this.file, this.contexto && this.contexto.maxBytes) || '';
        const input = e.target;
        input.setCustomValidity(this.fileError);
        input.reportValidity();
        if (this.fileError) this.toast('Archivo no válido', this.fileError, 'error');
        this.subidos = 0;
        this.nuevoIntento();
    }

    // Si cambian los datos, el siguiente envío crea un registro nuevo (el anterior queda como histórico)
    nuevoIntento() {
        if (this.trabajando) return;
        this.recordId = null;
        this.numero = '';
        this.error = '';
        this.resultado = null;
        this.paso = '';
    }

    validarFormulario() {
        const campos = [...this.template.querySelectorAll('lightning-combobox, lightning-textarea, lightning-input')];
        const camposOk = campos.reduce((ok, c) => c.reportValidity() && ok, true);
        if (!this.empresaId) {
            this.toast('Falta la empresa', 'Selecciona la empresa.', 'error');
            return false;
        }
        if (!this.file || this.fileError) {
            this.toast('Falta el archivo', this.fileError || 'Adjunta un fichero.', 'error');
            return false;
        }
        return camposOk;
    }

    // ===== Flujo: registro → sesión → subida → confirmación =====
    async handleSubir() {
        if (!this.validarFormulario()) return;
        this.trabajando = true;
        this.error = '';
        this.resultado = null;
        this.subidos = 0;
        try {
            if (!this.recordId) {
                this.paso = 'registro';
                const r = await crearRegistro({
                    empresaId: this.empresaId,
                    tipo: this.tipo,
                    observaciones: this.observaciones,
                    nombreArchivo: this.file.name,
                    tamano: this.file.size,
                    mime: this.file.type
                });
                this.recordId = r.recordId;
                this.numero = r.numero;
            }

            this.paso = 'sesion';
            const s = await solicitarSesionSubida({ recordId: this.recordId, origin: window.location.origin });
            if (!s.ok) throw new ErrorGuardado(s.mensaje);

            this.paso = 'subida';
            const onProgreso = (subidos) => { this.subidos = subidos; };
            if (s.sesion.simulado) {
                this.controlSimulado = { cancelada: false };
                await simularSubida(this.file, onProgreso, this.controlSimulado);
            } else {
                this.subida = new SubidaResumible(this.file, s.sesion.uploadUrl, onProgreso);
                await this.subida.iniciar();
            }

            this.paso = 'confirmacion';
            const c = await confirmarSubida({ recordId: this.recordId });
            if (!c.ok) throw new ErrorGuardado(c.mensaje);
            this.resultado = c;
            this.toast(c.numero, c.mensaje, c.estado === 'Sincronizado' ? 'success' : 'warning');
        } catch (e) {
            await this.gestionarError(e);
        } finally {
            this.trabajando = false;
            this.subida = null;
            this.controlSimulado = null;
        }
    }

    async gestionarError(e) {
        const mensaje = e instanceof SubidaCancelada ? e.message : this.reduceError(e);
        this.error = mensaje;
        // Los fallos del navegador (subida a GCS) se guardan en el registro desde aquí;
        // los de Google ya los ha guardado Apex, y los de validación no tienen registro
        if (this.recordId && !(e instanceof ErrorGuardado) && this.paso === 'subida') {
            try {
                await marcarError({ recordId: this.recordId, mensaje });
            } catch (err) {
                this.error = mensaje + ' (Tampoco se ha podido guardar el error: ' + this.reduceError(err) + ')';
            }
        }
        this.toast('No se ha podido subir la factura', this.error, 'error');
    }

    handleCancelar() {
        if (this.subida) this.subida.cancelar();
        if (this.controlSimulado) this.controlSimulado.cancelada = true;
    }

    handleReintentar() { this.handleSubir(); }

    handleAbrirRegistro() {
        if (!this.recordId) return;
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId: this.recordId, objectApiName: 'Bandeja_Contable__c', actionName: 'view' }
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
