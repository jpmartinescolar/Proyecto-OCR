import { LightningElement, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getDatosSolicitud from '@salesforce/apex/SolicitudAusenciaController.getDatosSolicitud';
import crearSolicitud from '@salesforce/apex/SolicitudAusenciaController.crearSolicitud';

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export default class SolicitudAusencia extends NavigationMixin(LightningElement) {
    @track cargando = true;
    @track errorFicha = null;
    @track tipos = [];
    @track vacacionesPendientes = 0;

    @track tipo = '';
    @track unidad = '';
    @track fechaInicio = '';
    @track fechaFin = '';
    @track horaInicio = '';
    @track horaFin = '';
    @track descripcion = '';
    @track ejercicioAnterior = 'No';

    @track guardando = false;
    @track error = null;
    @track resultado = null;

    connectedCallback() {
        getDatosSolicitud()
            .then(d => {
                this.tipos = d.tipos || [];
                this.vacacionesPendientes = Number(d.vacacionesPendientes) || 0;
            })
            .catch(err => { this.errorFicha = this.reduceError(err); })
            .finally(() => { this.cargando = false; });
    }

    reduceError(err) {
        if (err && err.body && err.body.message) return err.body.message;
        if (err && err.message) return err.message;
        return 'Se ha producido un error inesperado.';
    }

    get muestraForm() { return !this.cargando && !this.errorFicha && !this.resultado; }

    // ===== Tipo y cómputo =====
    get tipoOpciones() { return this.tipos.map(t => ({ label: t, value: t })); }
    handleTipo(e) { this.tipo = e.detail.value; }
    get esVacaciones() { return this.tipo === 'Vacaciones'; }

    handleDias() { this.unidad = 'Días'; }
    handleHoras() { this.unidad = 'Horas'; }
    get esDias() { return this.unidad === 'Días'; }
    get esHoras() { return this.unidad === 'Horas'; }
    get btnDiasCls() { return 'sa-toggle' + (this.esDias ? ' sa-toggle-activo' : ''); }
    get btnHorasCls() { return 'sa-toggle' + (this.esHoras ? ' sa-toggle-activo' : ''); }

    get faltaEleccion() { return !this.tipo || !this.unidad; }

    // ===== Campos =====
    handleFechaInicio(e) { this.fechaInicio = e.detail.value; }
    handleFechaFin(e) { this.fechaFin = e.detail.value; }
    handleHoraInicio(e) { this.horaInicio = e.detail.value; }
    handleHoraFin(e) { this.horaFin = e.detail.value; }
    handleDescripcion(e) { this.descripcion = e.detail.value; }
    handleEjercicio(e) { this.ejercicioAnterior = e.detail.value; }
    get ejercicioOpciones() { return [{ label: 'No', value: 'No' }, { label: 'Sí', value: 'Si' }]; }

    aFecha(iso) {
        const [y, m, d] = String(iso).split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    fmtCorta(dt) {
        return DIAS_CORTOS[dt.getDay()] + ' ' + String(dt.getDate()).padStart(2, '0')
            + '/' + String(dt.getMonth() + 1).padStart(2, '0') + '/' + dt.getFullYear();
    }
    fmtDec(v) {
        return String(Math.round(v * 100) / 100).replace('.', ',');
    }

    // ===== Días completos: tramos laborables (los findes cortan y quedan fuera) =====
    get calculo() {
        if (!this.esDias || !this.fechaInicio || !this.fechaFin) return null;
        const ini = this.aFecha(this.fechaInicio);
        const fin = this.aFecha(this.fechaFin);
        if (fin < ini) return null;
        const tramos = [];
        const excluidos = [];
        let desde = null;
        let hasta = null;
        for (let dt = new Date(ini); dt <= fin; dt.setDate(dt.getDate() + 1)) {
            const laborable = dt.getDay() !== 0 && dt.getDay() !== 6;
            if (laborable) {
                if (!desde) desde = new Date(dt);
                hasta = new Date(dt);
            } else {
                excluidos.push(this.fmtCorta(new Date(dt)) + ' · fin de semana');
                if (desde) {
                    tramos.push({ desde, hasta });
                    desde = null;
                }
            }
        }
        if (desde) tramos.push({ desde, hasta });
        const dias = t => Math.round((t.hasta - t.desde) / 86400000) + 1;
        return {
            excluidos,
            total: tramos.reduce((s, t) => s + dias(t), 0),
            tramos: tramos.map((t, i) => ({
                idx: i + 1,
                desde: this.fmtCorta(t.desde),
                hasta: this.fmtCorta(t.hasta),
                dias: dias(t)
            }))
        };
    }
    get tramos() { return this.calculo ? this.calculo.tramos : []; }
    get excluidos() { return this.calculo ? this.calculo.excluidos : []; }
    get hayExcluidos() { return this.excluidos.length > 0; }
    get totalLaborables() { return this.calculo ? this.calculo.total : 0; }
    get hayCalculo() { return !!this.calculo && this.calculo.tramos.length > 0; }

    // ===== Por horas =====
    get duracionHoras() {
        if (!this.horaInicio || !this.horaFin) return 0;
        const [h1, m1] = this.horaInicio.split(':').map(Number);
        const [h2, m2] = this.horaFin.split(':').map(Number);
        const min = (h2 * 60 + m2) - (h1 * 60 + m1);
        return min > 0 ? min / 60 : 0;
    }
    get duracionLabel() {
        const h = this.duracionHoras;
        return this.fmtDec(h) + (h === 1 ? ' hora' : ' horas');
    }
    get hayDuracion() { return this.duracionHoras > 0; }

    // Por horas la fecha debe ser un día laborable
    get fechaHorasEsFinde() {
        if (!this.esHoras || !this.fechaInicio) return false;
        const dow = this.aFecha(this.fechaInicio).getDay();
        return dow === 0 || dow === 6;
    }

    // ===== Saldo de vacaciones (solo para el tipo Vacaciones) =====
    get mostrarSaldo() { return this.esVacaciones && !!this.unidad; }
    get ejercicioActual() { return new Date().getFullYear(); }
    get solicitadoDias() {
        return this.esDias ? this.totalLaborables : this.duracionHoras / 8;
    }
    get solicitadoLabel() {
        if (this.esDias) return this.fmtDec(this.solicitadoDias) + ' d';
        return this.fmtDec(Math.round(this.solicitadoDias * 10) / 10) + ' d ('
            + this.fmtDec(this.duracionHoras) + ' h)';
    }
    get pendientesLabel() { return this.fmtDec(this.vacacionesPendientes); }
    get quedarianLabel() { return this.fmtDec(this.vacacionesPendientes - this.solicitadoDias); }
    get quedarianCls() {
        return 'sa-saldo-num '
            + (this.vacacionesPendientes - this.solicitadoDias < 0 ? 'sa-num-rojo' : 'sa-num-verde');
    }
    get barraStyle() {
        const p = this.vacacionesPendientes || 0;
        const pct = p > 0 ? Math.min(100, (this.solicitadoDias / p) * 100) : 0;
        return 'width:' + pct + '%';
    }
    get saldoNota() {
        return this.esDias ? 'Jornada completa = 1 día' : 'Se descuenta a razón de 8 h = 1 día';
    }

    get requiereDescripcion() { return !!this.tipo && !this.esVacaciones; }

    // ===== Validez y pie =====
    get esValido() {
        if (!this.tipo || !this.unidad) return false;
        if (this.requiereDescripcion && !(this.descripcion || '').trim()) return false;
        if (this.esDias) {
            return !!this.fechaInicio && !!this.fechaFin
                && this.aFecha(this.fechaFin) >= this.aFecha(this.fechaInicio)
                && this.hayCalculo;
        }
        return !!this.fechaInicio && !this.fechaHorasEsFinde && this.hayDuracion;
    }
    get guardarDisabled() { return !this.esValido || this.guardando; }

    get guardarLabel() { return this.guardando ? 'Guardando…' : 'Guardar'; }

    get estadoPie() {
        if (this.guardando) return 'Procesando la solicitud…';
        if (this.resultado) return '';
        if (!this.tipo) return 'Selecciona primero el tipo de ausencia.';
        if (!this.unidad) return 'Selecciona el cómputo: días completos o por horas.';
        if (this.esDias) {
            if (!this.fechaInicio || !this.fechaFin) return 'Selecciona fecha de inicio y fecha de fin.';
            if (this.aFecha(this.fechaFin) < this.aFecha(this.fechaInicio)) {
                return 'La fecha de fin no puede ser anterior a la de inicio.';
            }
            if (!this.hayCalculo) return 'El rango elegido solo contiene fines de semana.';
        } else {
            if (!this.fechaInicio) return 'Selecciona la fecha.';
            if (this.fechaHorasEsFinde) return 'La fecha elegida cae en fin de semana: elige un día laborable.';
            if (!this.horaInicio || !this.horaFin) return 'Indica la hora de inicio y la de fin.';
            if (!this.hayDuracion) return 'La hora de fin debe ser posterior a la de inicio.';
        }
        if (this.requiereDescripcion && !(this.descripcion || '').trim()) {
            return 'Escribe la descripción de la ausencia.';
        }
        if (this.esDias) {
            const n = this.tramos.length;
            return n + (n === 1 ? ' registro' : ' registros') + ' · '
                + this.totalLaborables + ' días laborables';
        }
        return '1 registro · ' + this.duracionLabel;
    }

    // ===== Guardar y cerrar =====
    handleCancelar() { this.dispatchEvent(new CustomEvent('cerrar')); }

    handleGuardar() {
        this.guardando = true;
        this.error = null;
        crearSolicitud({
            tipo: this.tipo,
            unidad: this.unidad,
            fechaInicio: this.fechaInicio,
            fechaFin: this.esDias ? this.fechaFin : null,
            horaInicio: this.esHoras ? this.horaInicio : null,
            horaFin: this.esHoras ? this.horaFin : null,
            descripcion: this.descripcion,
            ejercicioAnterior: this.ejercicioAnterior === 'Si'
        })
            .then(r => { this.resultado = r; })
            .catch(err => { this.error = this.reduceError(err); })
            .finally(() => { this.guardando = false; });
    }

    get resultadoTexto() {
        if (!this.resultado) return '';
        const n = this.resultado.registros;
        return '✓ Solicitud creada en estado Solicitado: ' + n
            + (n === 1 ? ' registro' : ' registros');
    }

    get resultadoCreados() {
        return this.resultado ? this.resultado.creados || [] : [];
    }

    // Cada número creado abre su registro de ausencia en una pestaña nueva
    abrirRegistro(e) {
        e.preventDefault();
        e.stopPropagation();
        const recordId = e.currentTarget.dataset.recordid;
        if (!recordId) return;
        this[NavigationMixin.GenerateUrl]({
            type: 'standard__recordPage',
            attributes: { recordId, objectApiName: 'Ausencias__c', actionName: 'view' }
        }).then(url => { window.open(url, '_blank'); });
    }
}