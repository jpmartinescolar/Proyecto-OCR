import { LightningElement, api } from 'lwc';
import { euros, fecha } from 'c/bandejaContableUtils';

/**
 * Pestañas del documento con datos del cliente: Perfil fiscal, Actividades (IAE), Locales afectos y
 * Turismos. Perfil, obligaciones, IAE, locales y vinculados son REALES (BandejaContableClienteService);
 * lo que no existe en Salesforce se muestra como ejemplo y se lista como pendiente.
 */
export default class BandejaContableDocCliente extends LightningElement {
    @api vista; // 'pf' | 'iae' | 'loc' | 'tur'
    @api cliente; // DatosClienteDTO o null si no se ha podido leer
    @api error;
    @api perfilSinDatos = []; // [[label, valor de ejemplo]]
    @api turismos = []; // [matrícula, vehículo, cuenta, alta, valor, amortización, % afectación, uso] (ejemplo)

    get esPerfil() { return this.vista === 'pf'; }
    get esIae() { return this.vista === 'iae'; }
    get esLocales() { return this.vista === 'loc'; }
    get esTurismos() { return this.vista === 'tur'; }

    get c() { return this.cliente || {}; }
    get domicilio() {
        const partes = [this.c.domicilio, this.c.localidad].filter(Boolean);
        return partes.length ? partes.join(', ') : 'Sin dirección de facturación en la cuenta';
    }

    get perfil() {
        return (this.c.perfil || []).map((p, i) => ({ key: 'p' + i, ...p, valorTxt: p.valor || 'Sin dato', claseValor: 'cli-par-valor' + (p.valor ? '' : ' cli-sin-dato') }));
    }
    get hayPerfil() { return this.perfil.length > 0; }
    get sinDatos() { return (this.perfilSinDatos || []).map(([label, valor]) => ({ label, valor })); }

    get modelos() {
        return (this.c.modelos || []).map((m, i) => ({ key: 'm' + i, ...m, altaTxt: fecha(m.alta) }));
    }
    get hayModelos() { return this.modelos.length > 0; }

    get vinculados() { return (this.c.vinculados || []).map((v, i) => ({ key: 'v' + i, ...v })); }
    get hayVinculados() { return this.vinculados.length > 0; }

    get pendientes() { return (this.c.pendientes || []).map((t) => ({ t })); }
    get noDisponibles() { return (this.c.noDisponibles || []).map((t) => ({ t })); }
    get hayNoDisponibles() { return this.noDisponibles.length > 0; }

    get actividades() {
        return (this.c.actividades || []).map((a, i) => ({ key: 'a' + i, ...a, altaTxt: fecha(a.alta), seccionTxt: a.seccion ? 'Sección ' + a.seccion : '' }));
    }
    get hayActividades() { return this.actividades.length > 0; }

    get locales() {
        return (this.c.locales || []).map((l, i) => ({
            key: 'l' + i, ...l,
            afectacionTxt: l.afectacion != null ? `Afecto ${l.afectacion} %` : 'Afectación sin indicar',
            claseAfectacion: 'bc-pill bc-pill-peq ' + (l.afectacion === 100 ? 'bc-pill-ok' : 'bc-pill-pendiente'),
            detalle: [l.epigrafe ? 'Epígrafe ' + l.epigrafe : '', l.alta ? 'Alta ' + fecha(l.alta) : ''].filter(Boolean).join(' · ')
        }));
    }
    get hayLocales() { return this.locales.length > 0; }

    get filasTurismos() {
        return (this.turismos || []).map(([mat, veh, cta, alta, valor, amort, af, uso]) => ({
            mat, veh, cta, alta, uso,
            valor: euros(valor) + ' €',
            amort: euros(amort) + ' €',
            af: af + ' %',
            claseAf: 'bc-pill bc-pill-peq ' + (af === 100 ? 'bc-pill-ok' : 'bc-pill-pendiente')
        }));
    }
    get resumenTurismos() {
        const t = this.turismos || [];
        const neto = t.reduce((a, x) => a + x[4] - x[5], 0);
        return `${t.length} vehículos · valor neto ${euros(neto)} €`;
    }
}
