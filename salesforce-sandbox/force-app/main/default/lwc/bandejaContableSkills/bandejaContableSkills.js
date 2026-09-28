import { LightningElement, api } from 'lwc';
import { datosEmpresa, guardarSkill, eliminarSkill } from 'c/bandejaContableMock';

const AMBITOS = ['General', 'Proveedor'];
const TIPOS = ['Recibidas', 'Emitidas', 'Todas'];
const MAX_TEXTO = 600;

/**
 * Skills del cliente (criterios que la IA aplica al procesar sus facturas) con su editor.
 * Se usa en la pestaña "Skills" del documento (modo lista, marca las que aplican al proveedor) y en la
 * ficha de la empresa (modo tarjetas). DATOS DE EJEMPLO (bandejaContableMock): FALTA guardarlas en
 * Cloud SQL y pasarlas al prompt de extracción (Fase 2). Avisa con el evento "cambio".
 */
export default class BandejaContableSkills extends LightningElement {
    @api empresaId;
    @api nif; // NIF del proveedor del documento: marca las skills que le aplican
    @api modo = 'lista'; // 'lista' | 'tarjetas'

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
    ed = null; // skill en edición { num?, title, scope, nif, prov, text, cuenta, tipo, intentado }

    get esTarjetas() { return this.modo === 'tarjetas'; }
    get claseLista() { return this.esTarjetas ? 'skl-lista-tarjetas' : ''; }
    get lista() { return this.version >= 0 ? datosEmpresa(this.empresaId).skills : []; }
    get nifDoc() { return String(this.nif || '').trim().toUpperCase(); }

    get skills() {
        const q = this.busqueda.trim().toLowerCase();
        return this.lista
            .filter((s) => !q || [s.num, s.title, s.text, s.prov, s.nif, s.cuenta].filter(Boolean).join(' ').toLowerCase().includes(q))
            .map((s) => {
                const aplica = !!s.nif && s.nif === this.nifDoc;
                return {
                    ...s,
                    aplica,
                    alcance: s.nif ? 'Proveedor' : 'General',
                    meta: [s.prov, s.cuenta ? 'Cuenta ' + s.cuenta : '', s.tipo && s.tipo !== 'Todas' ? 'Facturas ' + s.tipo.toLowerCase() : ''].filter(Boolean).join(' · '),
                    clase: (this.esTarjetas ? 'skl-tarjeta' : 'skl-fila') + (aplica ? ' skl-aplica' : '')
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

    // ===== Editor =====
    get abierto() { return !!this.ed; }
    get esEdicion() { return !!(this.ed && this.ed.num); }
    get titulo() { return this.esEdicion ? 'Editar ' + this.ed.num : 'Nueva skill'; }
    get esProveedor() { return this.ed && this.ed.scope === 'Proveedor'; }
    get ambitos() { return this.segmento('scope', AMBITOS); }
    get tipos() { return this.segmento('tipo', TIPOS); }
    segmento(k, opciones) {
        return opciones.map((o) => ({ o, k, clase: 'skl-seg' + (this.ed && this.ed[k] === o ? ' skl-seg-on' : '') }));
    }

    get errTitulo() { return this.ed.intentado && !this.ed.title.trim(); }
    get errTexto() { return this.ed.intentado && !this.ed.text.trim(); }
    get errNif() { return this.ed.intentado && this.esProveedor && !/^[A-Z0-9]{9}$/.test(this.ed.nif.trim().toUpperCase()); }
    get claseTitulo() { return 'skl-input' + (this.errTitulo ? ' skl-input-error' : ''); }
    get claseTexto() { return 'skl-input skl-textarea' + (this.errTexto ? ' skl-input-error' : ''); }
    get claseNif() { return 'skl-input skl-mayus' + (this.errNif ? ' skl-input-error' : ''); }
    get contadorTexto() { return `${this.ed.text.length} / ${MAX_TEXTO}`; }
    get maxTexto() { return MAX_TEXTO; }

    get vista() {
        const e = this.ed;
        const siguiente = 'SK-' + String(this.lista.reduce((m, s) => Math.max(m, Number(String(s.num).replace(/\D/g, '')) || 0), 0) + 1).padStart(3, '0');
        return {
            num: e.num || siguiente,
            title: e.title.trim() || 'Título de la skill',
            text: e.text.trim() || 'Escribe la instrucción tal como se la explicarías a un compañero del despacho.',
            scope: e.scope,
            meta: [this.esProveedor ? e.prov.trim() || e.nif.trim() || 'Proveedor sin indicar' : '', e.cuenta.trim() ? 'Cuenta ' + e.cuenta.trim() : '', e.tipo !== 'Todas' ? 'Facturas ' + e.tipo.toLowerCase() : ''].filter(Boolean).join(' · ')
        };
    }

    nueva() {
        this.ed = { title: '', scope: 'General', nif: '', prov: '', text: '', cuenta: '', tipo: 'Recibidas', intentado: false };
    }

    editar(num) {
        const s = datosEmpresa(this.empresaId).skills.find((x) => x.num === num);
        if (!s) return;
        this.ed = { num: s.num, title: s.title, scope: s.nif ? 'Proveedor' : 'General', nif: s.nif || '', prov: s.prov || '', text: s.text, cuenta: s.cuenta || '', tipo: s.tipo || 'Todas', intentado: false };
    }
    editarClic(e) {
        e.preventDefault();
        this.editar(e.currentTarget.dataset.num);
    }

    cambiar(e) { this.ed = { ...this.ed, [e.target.dataset.k]: e.target.value }; }
    elegir(e) { this.ed = { ...this.ed, [e.currentTarget.dataset.k]: e.currentTarget.dataset.o }; }
    cerrar() { this.ed = null; }
    parar(e) { e.stopPropagation(); }

    guardar() {
        const e = this.ed;
        const prov = e.scope === 'Proveedor';
        const nif = e.nif.trim().toUpperCase();
        if (!e.title.trim() || !e.text.trim() || (prov && !/^[A-Z0-9]{9}$/.test(nif))) {
            this.ed = { ...e, intentado: true };
            return;
        }
        const s = guardarSkill(this.empresaId, {
            num: e.num, title: e.title.trim(), text: e.text.trim(), tipo: e.tipo,
            cuenta: e.cuenta.trim() || undefined, nif: prov ? nif : undefined, prov: prov ? e.prov.trim() || undefined : undefined
        });
        this.ed = null;
        this.avisar(e.num ? `Skill ${s.num} actualizada` : 'Skill creada · la IA la aplicará en las próximas bandejas');
    }

    eliminar() {
        const num = this.ed.num;
        eliminarSkill(this.empresaId, num);
        this.ed = null;
        this.avisar(`Skill ${num} eliminada`);
    }

    avisar(mensaje) {
        this.version++;
        this.dispatchEvent(new CustomEvent('cambio', { detail: { mensaje } }));
    }
}
