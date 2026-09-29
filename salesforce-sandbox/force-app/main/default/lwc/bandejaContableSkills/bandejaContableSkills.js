import { LightningElement, api } from 'lwc';
import { skillsDeEmpresa, empresasAfectadas, skillActiva, guardarSkill, eliminarSkill, siguienteNumeroSkill } from 'c/bandejaContableMock';
import { textoPlano } from 'c/bandejaContableUtils';

const AMBITOS = ['General', 'Proveedor'];
const TIPOS = ['Recibidas', 'Emitidas', 'Todas'];
const MAX_TEXTO = 600;
const RE_NIF = /^[A-Z0-9]{9}$/;

function escapar(texto) {
    return String(texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** HTML inicial del editor para una skill que solo tiene texto plano */
function htmlDeTexto(texto) {
    return String(texto || '').split(/\n{2,}/).map((p) => `<p>${escapar(p).replace(/\n/g, '<br>')}</p>`).join('');
}

function fechaCorta(iso) {
    return iso ? String(iso).split('-').reverse().join('/') : '';
}

/**
 * Skills del cliente (criterios que la IA aplica al procesar sus facturas) y su editor (diseño v2 Híbrido).
 * - modo "pestana" (pestaña Skills del documento): lista a la izquierda y editor con formato a la derecha.
 * - modo "tarjetas" (ficha de la empresa): tarjetas y editor en ventana.
 * En los dos: estado Activa/Inactiva (una inactiva exige fecha de finalización y no se aplica) y empresas
 * afectadas (empresas y grupos REALES de Salesforce, c-bandeja-contable-skill-empresas).
 * Las skills son DATOS DE EJEMPLO (bandejaContableMock): FALTA guardarlas en Cloud SQL y pasarlas al
 * prompt de extracción. Avisa con el evento "cambio".
 */
export default class BandejaContableSkills extends LightningElement {
    @api empresaId;
    @api empresaNombre;
    @api nif; // NIF del proveedor del documento: marca las skills que le aplican
    @api modo = 'pestana'; // 'pestana' | 'tarjetas'

    // Abrir una skill concreta desde fuera (chips del desglose de IVA): { num, t }
    _abrir;
    @api
    get abrir() { return this._abrir; }
    set abrir(v) {
        const nuevo = v && (!this._abrir || v.t !== this._abrir.t);
        this._abrir = v;
        if (nuevo) this.editar(v.num);
    }

    version = 0;
    busqueda = '';
    desplegadas = {}; // num -> lista de empresas afectadas abierta
    ed = null; // skill en edición (ver nueva() y editar())

    get esTarjetas() { return this.modo === 'tarjetas'; }
    get esPestana() { return !this.esTarjetas; }
    get empresa() { return { id: this.empresaId, nombre: this.empresaNombre || 'Empresa actual' }; }
    get lista() { return this.version >= 0 ? skillsDeEmpresa(this.empresa) : []; }
    get nifDoc() { return String(this.nif || '').trim().toUpperCase(); }

    get claseCaja() { return this.esPestana && this.ed ? 'skl-pestana skl-pestana-editor' : 'skl-pestana'; }
    get claseLista() { return this.esTarjetas ? 'skl-lista-tarjetas' : ''; }

    get skills() {
        const q = this.busqueda.trim().toLowerCase();
        return this.lista
            .filter((s) => !q || [s.num, s.title, s.text, s.prov, s.nif, s.cuenta].filter(Boolean).join(' ').toLowerCase().includes(q))
            .map((s) => {
                const activa = skillActiva(s);
                const aplica = activa && !!s.nif && s.nif === this.nifDoc;
                const afectadas = empresasAfectadas(s);
                const n = afectadas.length, g = (s.grps || []).length;
                const abierta = !!this.desplegadas[s.num];
                const seleccionada = this.ed && this.ed.num === s.num;
                return {
                    ...s,
                    aplica,
                    inactiva: !activa,
                    finalizada: !activa && s.fin ? 'Finalizada el ' + fechaCorta(s.fin) : '',
                    estado: activa ? 'Activa' : 'Inactiva',
                    claseEstado: 'bc-pill bc-pill-peq ' + (activa ? 'bc-pill-ok' : 'skl-pill-inactiva'),
                    alcance: s.nif ? 'Proveedor' : 'General',
                    meta: [s.prov, s.cuenta ? 'Cuenta ' + s.cuenta : '', s.tipo && s.tipo !== 'Todas' ? 'Facturas ' + s.tipo.toLowerCase() : ''].filter(Boolean).join(' · '),
                    textoEmpresas: (n === 1 ? '1 empresa' : n + ' empresas') + (g ? ` · ${g} ${g === 1 ? 'grupo' : 'grupos'}` : ''),
                    flecha: abierta ? '▲' : '▼',
                    abierta,
                    gruposLista: s.grps || [],
                    empresasLista: afectadas.map((e) => ({ ...e, clase: 'skl-emp' + (e.id === this.empresaId ? ' skl-emp-actual' : '') })),
                    clase: (this.esTarjetas ? 'skl-tarjeta' : 'skl-fila') + (aplica ? ' skl-aplica' : '') + (!activa ? ' skl-inactiva' : '') + (seleccionada ? ' skl-seleccionada' : '')
                };
            })
            .sort((a, b) => b.aplica - a.aplica);
    }
    get sinResultados() { return this.skills.length === 0; }
    get contador() {
        const q = this.busqueda.trim();
        return q ? `${this.skills.length} de ${this.lista.length}` : `${this.lista.length} skills`;
    }
    get total() { return this.lista.length; }

    buscar(e) { this.busqueda = e.target.value || ''; }

    desplegar(e) {
        e.stopPropagation();
        const num = e.currentTarget.dataset.num;
        this.desplegadas = { ...this.desplegadas, [num]: !this.desplegadas[num] };
    }

    // ===== Editor =====
    get abiertoPestana() { return this.esPestana && !!this.ed; }
    get abiertoModal() { return this.esTarjetas && !!this.ed; }
    get esEdicion() { return !!(this.ed && !this.ed.nueva); }
    get titulo() { return this.esEdicion ? 'Editar ' + this.ed.num : 'Nueva skill'; }
    get esProveedor() { return this.ed && this.ed.scope === 'Proveedor'; }
    get esInactiva() { return this.ed && !this.ed.activa; }
    get ambitos() { return this.segmento('scope', AMBITOS); }
    get tipos() { return this.segmento('tipo', TIPOS); }
    get estados() {
        return [['Activa', true], ['Inactiva', false]].map(([o, v]) => ({
            o, v: String(v), clase: 'skl-estado' + (this.ed && this.ed.activa === v ? (v ? ' skl-estado-activa' : ' skl-estado-inactiva') : '')
        }));
    }
    segmento(k, opciones) {
        return opciones.map((o) => ({ o, k, clase: 'skl-seg' + (this.ed && this.ed[k] === o ? ' skl-seg-on' : '') }));
    }

    get textoActual() { return this.esPestana ? textoPlano(this.ed.html) : this.ed.text; }
    get errTitulo() { return this.ed.intentado && !this.ed.title.trim(); }
    get errTexto() { return this.ed.intentado && !this.textoActual.trim(); }
    get errNif() { return this.ed.intentado && this.esProveedor && !RE_NIF.test(this.ed.nif.trim().toUpperCase()); }
    get errFin() { return this.ed.intentado && !this.ed.activa && !this.ed.fin; }
    get errEmpresas() { return this.ed.intentado && !this.ed.emps.length && !this.ed.grps.length; }
    get claseTitulo() { return (this.esPestana ? 'skl-titulo-ed' : 'skl-input') + (this.errTitulo ? ' skl-input-error' : ''); }
    get claseTexto() { return 'skl-input skl-textarea' + (this.errTexto ? ' skl-input-error' : ''); }
    get claseNif() { return 'skl-input skl-mayus' + (this.errNif ? ' skl-input-error' : ''); }
    get claseFin() { return 'skl-fecha' + (this.errFin ? ' skl-input-error' : ''); }
    get contadorTexto() { return `${this.ed.text.length} / ${MAX_TEXTO}`; }
    get maxTexto() { return MAX_TEXTO; }

    get vista() {
        const e = this.ed;
        return {
            num: e.num,
            title: e.title.trim() || 'Título de la skill',
            text: e.text.trim() || 'Escribe la instrucción tal como se la explicarías a un compañero del despacho.',
            scope: e.scope,
            estado: e.activa ? 'Activa' : 'Inactiva',
            claseEstado: 'bc-pill bc-pill-peq ' + (e.activa ? 'bc-pill-ok' : 'skl-pill-inactiva'),
            meta: [this.esProveedor ? e.prov.trim() || e.nif.trim() || 'Proveedor sin indicar' : '', e.cuenta.trim() ? 'Cuenta ' + e.cuenta.trim() : '', e.tipo !== 'Todas' ? 'Facturas ' + e.tipo.toLowerCase() : ''].filter(Boolean).join(' · ')
        };
    }

    nueva() {
        this.ed = {
            nueva: true, num: siguienteNumeroSkill(), title: '', text: '', html: '', activa: true, fin: '',
            emps: this.empresaId ? [this.empresa] : [], grps: [],
            scope: 'General', nif: '', prov: '', cuenta: '', tipo: 'Recibidas', intentado: false
        };
    }

    editar(num) {
        const s = skillsDeEmpresa(this.empresa).find((x) => x.num === num) || skillsDeEmpresa().find((x) => x.num === num);
        if (!s) return;
        this.ed = {
            nueva: false, num: s.num, title: s.title, text: s.text || '', html: s.html || htmlDeTexto(s.text),
            activa: s.activa !== false, fin: s.fin || '', emps: [...(s.emps || [])], grps: [...(s.grps || [])],
            scope: s.nif ? 'Proveedor' : 'General', nif: s.nif || '', prov: s.prov || '', cuenta: s.cuenta || '', tipo: s.tipo || 'Todas', intentado: false
        };
    }
    editarClic(e) {
        e.preventDefault();
        this.editar(e.currentTarget.dataset.num);
    }

    cambiar(e) { this.ed = { ...this.ed, [e.target.dataset.k]: e.target.value }; }
    cambiarHtml(e) { this.ed = { ...this.ed, html: e.target.value || '' }; }
    elegir(e) { this.ed = { ...this.ed, [e.currentTarget.dataset.k]: e.currentTarget.dataset.o }; }
    elegirEstado(e) {
        const activa = e.currentTarget.dataset.v === 'true';
        // Al pasar a inactiva se propone hoy como fecha de finalización (como el diseño)
        this.ed = { ...this.ed, activa, fin: activa ? '' : this.ed.fin || new Date().toISOString().slice(0, 10) };
    }
    cambiarEmpresas(e) { this.ed = { ...this.ed, emps: e.detail.emps, grps: e.detail.grps }; }
    cerrar() { this.ed = null; }
    parar(e) { e.stopPropagation(); }

    guardar() {
        const e = this.ed;
        const prov = e.scope === 'Proveedor';
        const nif = e.nif.trim().toUpperCase();
        const text = this.textoActual.trim();
        if (!e.title.trim() || !text || (prov && !RE_NIF.test(nif)) || (!e.activa && !e.fin) || (!e.emps.length && !e.grps.length)) {
            this.ed = { ...e, intentado: true };
            return;
        }
        const s = guardarSkill({
            num: e.nueva ? undefined : e.num, title: e.title.trim(), text, html: this.esPestana ? e.html : htmlDeTexto(text),
            activa: e.activa, fin: e.activa ? '' : e.fin, emps: e.emps, grps: e.grps, tipo: e.tipo,
            cuenta: e.cuenta.trim() || undefined, nif: prov ? nif : undefined, prov: prov ? e.prov.trim() || undefined : undefined
        });
        this.ed = null;
        this.avisar(e.nueva ? `Skill ${s.num} creada · la IA la aplicará en las próximas bandejas` : `Skill ${s.num} guardada`);
    }

    eliminar() {
        const num = this.ed.num;
        eliminarSkill(num);
        this.ed = null;
        this.avisar(`Skill ${num} eliminada`);
    }

    avisar(mensaje) {
        this.version++;
        this.dispatchEvent(new CustomEvent('cambio', { detail: { mensaje } }));
    }
}
