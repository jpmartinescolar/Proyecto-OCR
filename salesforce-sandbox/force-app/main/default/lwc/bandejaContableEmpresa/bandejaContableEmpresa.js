import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getDatosCliente from '@salesforce/apex/BandejaContableController.getDatosCliente';
import listarBandejas from '@salesforce/apex/BandejaContableController.listarBandejas';
import estadoProcesamiento from '@salesforce/apex/BandejaContableController.estadoProcesamiento';
import { datosEmpresa } from 'c/bandejaContableMock';
import { fechaHora, claseEstado, eventoNavegar, mensajeError, estadoDeFila } from 'c/bandejaContableUtils';

/**
 * Pantalla 05 · Empresa. REAL: datos de la cuenta, perfil fiscal (contrato y cuenta de Salesforce) y
 * bandejas. DE EJEMPLO (bandejaContableMock): datos fiscales que no existen en Salesforce, reglas por
 * proveedor, reglas propuestas, validaciones y skills (vivirán en Cloud SQL, Fase 2).
 */
export default class BandejaContableEmpresa extends LightningElement {
    @api empresaId;
    @api tab;

    cliente;
    bandejas = [];
    procesos = {}; // Id de bandeja → estadoProcesamiento
    consulta = 'cargando';
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
            const [cliente, bandejas] = await Promise.all([
                getDatosCliente({ empresaId: this.empresaId }),
                listarBandejas({ empresaId: this.empresaId })
            ]);
            this.cliente = cliente;
            this.bandejas = bandejas;
            this.consultarProcesamiento();
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

    // ===== Cabecera (real) =====
    get nombreEmpresa() { return this.cliente && this.cliente.nombre; }

    valorPerfil(label) {
        const p = ((this.cliente && this.cliente.perfil) || []).find((x) => x.label === label);
        return p && p.valor;
    }
    get pildoras() {
        const res = [];
        const regimen = this.valorPerfil('Régimen (estimación)');
        if (regimen) res.push(regimen);
        const roi = this.valorPerfil('Operador intracomunitario');
        if (roi && /^s[ií]/i.test(roi)) res.push('Operador intracomunitario');
        const territorio = this.valorPerfil('Territorio fiscal');
        if (territorio) res.push('Territorio ' + territorio);
        return res;
    }

    // ===== Perfil fiscal: real + lo que falta (ejemplo) =====
    get perfil() {
        return ((this.cliente && this.cliente.perfil) || []).map((p, i) => ({
            key: 'p' + i, ...p, valorTxt: p.valor || 'Sin dato', claseValor: 'bc-campo-valor' + (p.valor ? '' : ' emp-sin-dato')
        }));
    }
    get perfilSinDatos() { return this.version >= 0 ? this.datos.perfilSinDatos.map(([label, valor]) => ({ label, valor })) : []; }

    // ===== Reglas y validaciones (ejemplo; dependen de version para repintarse) =====
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

    alCambiarSkills(e) {
        if (e.detail && e.detail.mensaje) this.toast(e.detail.mensaje, 'Datos de ejemplo: se mantiene solo en esta sesión.', 'success');
    }

    sinBackend() {
        // FALTA: edición del perfil fiscal (¿en Salesforce, sobre el contrato?) y alta manual de reglas (Cloud SQL)
        this.toast('Todavía no disponible', 'La edición del perfil fiscal y el alta manual de reglas están pendientes de definir.', 'info');
    }

    verRiesgo() {
        this.dispatchEvent(eventoNavegar({ vista: 'riesgo', empresaId: this.empresaId }));
    }

    // ===== Bandejas (reales) =====
    /** Estado de procesamiento de las bandejas (una sola llamada, después de pintar la ficha) */
    async consultarProcesamiento() {
        const ids = this.bandejas.filter((b) => b.archivosSincronizados > 0).map((b) => b.id);
        try {
            const estados = ids.length ? await estadoProcesamiento({ bandejaIds: ids }) : [];
            this.procesos = Object.fromEntries(estados.map((e) => [e.bandejaId, e]));
            this.consulta = 'ok';
        } catch {
            this.consulta = 'error';
        }
    }

    get filasBandejas() {
        return this.bandejas.map((b) => ({
            ...b, fechaTxt: fechaHora(b.fecha), claseEstado: claseEstado(b.estado), proceso: estadoDeFila(b, this.procesos, this.consulta)
        }));
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
