import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getEmpresa from '@salesforce/apex/BandejaContableController.getEmpresa';
import listarBandejas from '@salesforce/apex/BandejaContableController.listarBandejas';
import { datosEmpresa } from 'c/bandejaContableMock';
import { fechaHora, claseEstado, eventoNavegar, mensajeError } from 'c/bandejaContableUtils';

/**
 * Pantalla 05 · Empresa: datos de la cuenta y sus bandejas (reales) y "Skills del cliente"
 * (perfil fiscal, reglas por proveedor, reglas propuestas, validaciones y skills: de ejemplo).
 */
export default class BandejaContableEmpresa extends LightningElement {
    @api empresaId;
    @api tab;

    empresa;
    bandejas = [];
    cargando = true;
    error;
    pestana = 'skills';
    datos; // referencia al almacén de ejemplo de la empresa (editable en la sesión)
    version = 0; // fuerza el repintado tras cambiar el almacén

    connectedCallback() {
        this.pestana = this.tab === 'bandejas' ? 'bandejas' : 'skills';
        this.datos = datosEmpresa(this.empresaId);
        this.cargar();
    }

    async cargar() {
        this.cargando = true;
        try {
            const [empresa, bandejas] = await Promise.all([
                getEmpresa({ empresaId: this.empresaId }),
                listarBandejas({ empresaId: this.empresaId })
            ]);
            this.empresa = empresa;
            this.bandejas = bandejas;
            this.error = null;
        } catch (e) {
            this.error = mensajeError(e);
        } finally {
            this.cargando = false;
        }
    }

    refrescar() { this.version++; }

    get enSkills() { return this.pestana === 'skills'; }
    get pestanas() {
        return [['Skills del cliente', 'skills'], ['Bandejas contables', 'bandejas']].map(([label, valor]) => ({
            label, valor, clase: 'bc-tab' + (this.pestana === valor ? ' bc-tab-on' : '')
        }));
    }
    handlePestana(e) { this.pestana = e.currentTarget.dataset.valor; }

    // ===== Datos de ejemplo (dependen de version para repintarse) =====
    get perfil() {
        return this.version >= 0 ? this.datos.perfil.map(([label, valor]) => ({ label, valor })) : [];
    }

    get reglas() {
        return this.version >= 0 ? this.datos.reglas.map((r, i) => ({
            ...r, i,
            dedTxt: r.ded + ' %',
            nota: r.note || '—',
            claseFila: r.on ? '' : 'bc-apagado',
            claseToggle: 'bc-toggle' + (r.on ? ' bc-toggle-on' : ''),
            claseOrigen: 'bc-pill bc-pill-peq ' + (r.origen === 'Aprendida' ? 'bc-pill-info' : '')
        })) : [];
    }
    get reglasActivasTxt() { return this.version >= 0 ? `${this.datos.reglas.filter((r) => r.on).length} reglas activas` : ''; }
    get reglasInfo() {
        return this.version >= 0 ? `${this.datos.reglas.length} reglas · ${this.datos.reglas.filter((r) => r.origen === 'Aprendida').length} aprendidas` : '';
    }

    get propuestas() { return this.version >= 0 ? this.datos.propuestas.map((p, i) => ({ ...p, i })) : []; }
    get hayPropuestas() { return this.propuestas.length > 0; }

    get validaciones() {
        return this.version >= 0 ? this.datos.validaciones.map((v, i) => ({
            ...v, i,
            claseToggle: 'bc-toggle' + (v.on ? ' bc-toggle-on' : ''),
            claseTexto: 'emp-validacion-texto' + (v.on ? '' : ' bc-apagado')
        })) : [];
    }

    get skills() {
        return this.version >= 0 ? this.datos.skills.map((s) => ({ ...s, alcance: s.nif ? 'Proveedor' : 'General' })) : [];
    }

    toggleRegla(e) {
        const r = this.datos.reglas[Number(e.currentTarget.dataset.i)];
        r.on = !r.on;
        this.refrescar();
    }

    toggleValidacion(e) {
        const v = this.datos.validaciones[Number(e.currentTarget.dataset.i)];
        v.on = !v.on;
        this.refrescar();
    }

    aceptarPropuesta(e) {
        const [p] = this.datos.propuestas.splice(Number(e.currentTarget.dataset.i), 1);
        this.datos.reglas.unshift({ nif: p.nif, prov: p.prov, cuenta: p.cuenta, desc: p.desc, iva: p.iva, ded: 100, note: '', origen: 'Aprendida', on: true });
        this.refrescar();
        this.toast('Regla añadida a Reglas por proveedor', 'Datos de ejemplo: se mantiene solo en esta sesión.', 'success');
    }

    descartarPropuesta(e) {
        this.datos.propuestas.splice(Number(e.currentTarget.dataset.i), 1);
        this.refrescar();
    }

    sinBackend() {
        this.toast('Todavía no disponible', 'La edición de perfil, reglas y skills llegará con el backend de Google.', 'info');
    }

    // ===== Bandejas (reales) =====
    get filasBandejas() {
        return this.bandejas.map((b) => ({ ...b, fechaTxt: fechaHora(b.fecha), claseEstado: claseEstado(b.estado) }));
    }
    get hayBandejas() { return this.bandejas.length > 0; }

    abrirBandeja(e) {
        e.preventDefault();
        this.dispatchEvent(eventoNavegar({ vista: 'registro', bandejaId: e.currentTarget.dataset.id }));
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
