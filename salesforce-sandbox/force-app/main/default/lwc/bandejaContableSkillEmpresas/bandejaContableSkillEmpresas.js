import { LightningElement, api } from 'lwc';
import buscarEmpresasYGrupos from '@salesforce/apex/BandejaContableController.buscarEmpresasYGrupos';
import { empresasAfectadas } from 'c/bandejaContableMock';
import { mensajeError } from 'c/bandejaContableUtils';

const ESPERA_BUSQUEDA = 300;

/**
 * "Empresas afectadas" de una skill (diseño v2 Híbrido): chips con las empresas y los grupos elegidos y
 * un selector con dos pestañas, Empresas y Grupos empresariales. Las empresas y los grupos son REALES
 * (Salesforce, BandejaContableController.buscarEmpresasYGrupos: las empresas del asesor y sus grupos, o
 * todas las visibles en modo libre). No guarda nada: avisa con "cambio" ({ emps, grps }) y guarda quien
 * lo usa (bandejaContableSkills).
 */
export default class BandejaContableSkillEmpresas extends LightningElement {
    @api emps = []; // [{ id, nombre }]
    @api grps = []; // [{ id, nombre, miembros: [{ id, nombre }] }]
    @api actualId; // empresa desde la que se edita: se resalta

    abierto = false;
    modo = 'emp';
    busqueda = '';
    cargando = false;
    error;
    empresas = [];
    grupos = [];
    temporizador;

    disconnectedCallback() {
        clearTimeout(this.temporizador);
    }

    // ===== Chips de la selección =====
    get afectadas() { return empresasAfectadas({ emps: this.emps, grps: this.grps }); }
    get total() { return String(this.afectadas.length); }
    get claseTotal() { return 'ske-total' + (this.afectadas.length ? '' : ' ske-total-cero'); }
    get resumen() {
        const n = this.afectadas.length, g = (this.grps || []).length;
        return `${n} ${n === 1 ? 'empresa afectada' : 'empresas afectadas'}` + (g ? ` · ${g} ${g === 1 ? 'grupo' : 'grupos'}` : '');
    }
    get chipsEmpresas() {
        return (this.emps || []).map((e) => ({ ...e, clase: 'ske-chip' + (e.id === this.actualId ? ' ske-chip-actual' : '') }));
    }
    get chipsGrupos() {
        return (this.grps || []).map((g) => ({ ...g, n: (g.miembros || []).length }));
    }
    get textoBoton() { return this.abierto ? 'Cerrar' : '+ Añadir empresas o grupos'; }

    // ===== Selector =====
    get esEmpresas() { return this.modo === 'emp'; }
    get esGrupos() { return this.modo === 'grp'; }
    get pestanas() {
        return [
            { k: 'emp', label: `Empresas (${this.empresas.length})` },
            { k: 'grp', label: `Grupos empresariales (${this.grupos.length})` }
        ].map((t) => ({ ...t, clase: 'ske-pestana' + (t.k === this.modo ? ' ske-pestana-on' : '') }));
    }
    get marcaTodas() { return this.empresas.length > 0 && this.empresas.every((e) => this.elegida(e.id)); }
    get textoTodas() { return this.marcaTodas ? 'Quitar todas' : 'Seleccionar todas'; }

    get opcionesEmpresas() {
        const porGrupo = new Map(this.afectadas.filter((e) => e.porGrupo).map((e) => [e.id, e.porGrupo]));
        return this.empresas.map((e) => {
            const on = this.elegida(e.id);
            return { ...e, ...this.marca(on), sub: !on && porGrupo.has(e.id) ? 'Incluida por grupo' : e.cif || '' };
        });
    }
    get opcionesGrupos() {
        return this.grupos.map((g) => {
            const on = (this.grps || []).some((x) => x.id === g.id);
            const n = (g.miembros || []).length;
            return { ...g, ...this.marca(on), sub: `${n} ${n === 1 ? 'empresa' : 'empresas'} · ${(g.miembros || []).map((m) => m.nombre).join(', ')}` };
        });
    }
    get sinEmpresas() { return !this.cargando && !this.error && this.esEmpresas && !this.empresas.length; }
    get sinGrupos() { return !this.cargando && !this.error && this.esGrupos && !this.grupos.length; }

    elegida(id) { return (this.emps || []).some((e) => e.id === id); }
    marca(on) {
        return { check: on ? '✓' : '', claseCheck: 'ske-check' + (on ? ' ske-check-on' : ''), claseFila: 'ske-opcion' + (on ? ' ske-opcion-on' : '') };
    }

    alternar() {
        this.abierto = !this.abierto;
        if (this.abierto && !this.empresas.length && !this.grupos.length) this.cargar();
    }
    elegirModo(e) {
        this.modo = e.currentTarget.dataset.k;
    }
    buscar(e) {
        this.busqueda = e.target.value || '';
        clearTimeout(this.temporizador);
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.temporizador = setTimeout(() => this.cargar(), ESPERA_BUSQUEDA);
    }

    async cargar() {
        this.cargando = true;
        this.error = undefined;
        try {
            const r = await buscarEmpresasYGrupos({ texto: this.busqueda.trim() });
            this.empresas = (r && r.empresas) || [];
            this.grupos = ((r && r.grupos) || []).map((g) => ({ id: g.id, nombre: g.nombre, miembros: (g.miembros || []).map((m) => ({ id: m.id, nombre: m.nombre })) }));
        } catch (err) {
            this.error = mensajeError(err);
        } finally {
            this.cargando = false;
        }
    }

    alternarEmpresa(e) {
        const id = e.currentTarget.dataset.id;
        const emp = this.empresas.find((x) => x.id === id);
        if (this.elegida(id)) this.avisar(this.emps.filter((x) => x.id !== id), this.grps);
        else if (emp) this.avisar([...(this.emps || []), { id: emp.id, nombre: emp.nombre }], this.grps);
    }
    alternarGrupo(e) {
        const id = e.currentTarget.dataset.id;
        const g = this.grupos.find((x) => x.id === id);
        if ((this.grps || []).some((x) => x.id === id)) this.avisar(this.emps, this.grps.filter((x) => x.id !== id));
        else if (g) this.avisar(this.emps, [...(this.grps || []), g]);
    }
    todas() {
        if (this.marcaTodas) {
            const listadas = new Set(this.empresas.map((e) => e.id));
            this.avisar((this.emps || []).filter((e) => !listadas.has(e.id)), this.grps);
        } else {
            const nuevas = this.empresas.filter((e) => !this.elegida(e.id)).map((e) => ({ id: e.id, nombre: e.nombre }));
            this.avisar([...(this.emps || []), ...nuevas], this.grps);
        }
    }
    quitarEmpresa(e) {
        this.avisar(this.emps.filter((x) => x.id !== e.currentTarget.dataset.id), this.grps);
    }
    quitarGrupo(e) {
        this.avisar(this.emps, this.grps.filter((x) => x.id !== e.currentTarget.dataset.id));
    }

    avisar(emps, grps) {
        this.dispatchEvent(new CustomEvent('cambio', { detail: { emps: emps || [], grps: grps || [] } }));
    }
}
