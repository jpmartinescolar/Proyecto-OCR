import { LightningElement, api } from 'lwc';
import getDatosCliente from '@salesforce/apex/BandejaContableController.getDatosCliente';
import { datosEmpresa } from 'c/bandejaContableMock';
import { euros, eventoNavegar, mensajeError } from 'c/bandejaContableUtils';

// Ejercicios no prescritos: 4 años desde el fin del plazo de declaración (art. 66 LGT). Se muestran
// los cinco últimos ejercicios, como el diseño (2022–2026 en 2026).
const EJERCICIOS = 5;

/**
 * Pantalla 06 · Riesgo fiscal no prescrito de una empresa: documentos validados con riesgo aceptado
 * en ejercicios no prescritos, con el riesgo por Sociedades, IVA e IRPF.
 * La empresa es real; los documentos son DE EJEMPLO. FALTA: calcularlo sobre las confirmaciones con
 * riesgo aceptado de Cloud SQL (Fase 4).
 */
export default class BandejaContableRiesgo extends LightningElement {
    @api empresaId;

    cliente;
    error;
    cargando = true;

    connectedCallback() {
        this.cargar();
    }

    async cargar() {
        try {
            this.cliente = await getDatosCliente({ empresaId: this.empresaId });
        } catch (e) {
            this.error = mensajeError(e);
        } finally {
            this.cargando = false;
        }
    }

    get periodo() {
        const fin = new Date().getFullYear();
        return `${fin - EJERCICIOS + 1}–${fin}`;
    }
    get subtitulo() { return `Documentos OCR validados con peculiaridades fiscales en ejercicios no prescritos (${this.periodo})`; }

    get filasBase() {
        const desde = new Date().getFullYear() - EJERCICIOS + 1;
        return datosEmpresa(this.empresaId).riesgos.filter(([f]) => Number(f.slice(-4)) >= desde);
    }

    get filas() {
        return this.filasBase.map(([fecha, id, prov, motivo, is, iva, irpf]) => ({
            fecha, id, prov, motivo, is: euros(is), iva: euros(iva), irpf: euros(irpf), total: euros(is + iva + irpf)
        }));
    }

    get sumas() {
        const s = { is: 0, iva: 0, irpf: 0 };
        this.filasBase.forEach((r) => { s.is += r[4]; s.iva += r[5]; s.irpf += r[6]; });
        return s;
    }
    get totales() {
        const s = this.sumas;
        return { is: euros(s.is), iva: euros(s.iva), irpf: euros(s.irpf), total: euros(s.is + s.iva + s.irpf) };
    }
    get kpis() {
        const s = this.sumas;
        const n = (k) => this.filasBase.filter((r) => r[k] > 0).length;
        return [
            { label: 'Riesgo Sociedades', valor: euros(s.is), sub: `${n(4)} documentos · gasto no deducible × 25 %`, clase: 'rsg-kpi rsg-kpi-is' },
            { label: 'Riesgo IVA', valor: euros(s.iva), sub: `${n(5)} documentos · cuotas deducidas indebidamente`, clase: 'rsg-kpi rsg-kpi-iva' },
            { label: 'Riesgo Rentas (IRPF)', valor: euros(s.irpf), sub: `${n(6)} documentos · retenciones no practicadas`, clase: 'rsg-kpi rsg-kpi-irpf' },
            { label: 'Total riesgo', valor: euros(s.is + s.iva + s.irpf), sub: `Ejercicios no prescritos ${this.periodo}`, clase: 'rsg-kpi rsg-kpi-total' }
        ];
    }
    get contador() { return `${this.filasBase.length} documentos`; }

    irALista(e) {
        e.preventDefault();
        this.dispatchEvent(eventoNavegar({ vista: 'lista' }));
    }

    volver(e) {
        if (e) e.preventDefault();
        this.dispatchEvent(eventoNavegar({ vista: 'empresa', empresaId: this.empresaId }));
    }
}
