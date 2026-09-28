import { LightningElement, api } from 'lwc';
import { notasDe, anadirNota, tareasDe, chatsDe, respuestaAsistente, RESPONSABLES_TAREA } from 'c/bandejaContableMock';
import { bytes, fechaHora, fecha } from 'c/bandejaContableUtils';

const ETIQUETAS_NOTA = {
    nc: ['No contabilizado', 'col-nota col-nota-nc', 'col-tag col-tag-nc'],
    reopen: ['Reabierta', 'col-nota col-nota-ok', 'col-tag col-tag-ok'],
    riesgo: ['Riesgo aceptado', 'col-nota col-nota-nc', 'col-tag col-tag-nc']
};
const SUGERENCIAS_NUEVO = ['¿Es deducible el IVA de esta factura?', '¿A qué cuenta la contabilizo?', '¿Qué riesgo fiscal tiene?', '¿Qué documentación pido al cliente?'];
const SUGERENCIAS_CHAT = ['¿Qué sanción me puede caer?', '¿Qué documentación pido al cliente?', '¿Cómo lo contabilizo?'];
const PREGUNTA_RIESGO = 'Explícame con detalle los riesgos fiscales de esta advertencia y qué debo comprobar antes de contabilizar.';

let secuencia = 0;

/**
 * Pestañas "Notas", "Tareas" y "Chat IA" del documento. DATOS DE EJEMPLO en memoria
 * (bandejaContableMock): FALTA decidir dónde se guardan (Salesforce o Cloud SQL), dónde van los
 * adjuntos de las notas (Google Storage) y conectar el asistente con Vertex AI (Fase 5).
 * Avisa al documento con el evento "cambio" para que actualice los contadores de las pestañas.
 */
export default class BandejaContableDocColaboracion extends LightningElement {
    @api vista; // 'notas' | 'tareas' | 'chat'
    @api contexto = {}; // { emisor, nif, total, empresa }

    _docId;
    @api
    get docId() { return this._docId; }
    set docId(v) {
        if (v !== this._docId) this.actual = null;
        this._docId = v;
    }

    // Consulta abierta desde un riesgo ("Pregunta a la IA"): { id, tag, titulo, texto }
    _consulta;
    @api
    get consulta() { return this._consulta; }
    set consulta(v) {
        const nueva = v && (!this._consulta || v.id !== this._consulta.id);
        this._consulta = v;
        if (nueva) this.abrirConsulta(v);
    }

    version = 0;
    borradorNota = '';
    adjuntos = [];
    borradorTarea = { text: '', who: 'Tú', due: '' };
    actual = null; // chat abierto
    pregunta = '';

    get esNotas() { return this.vista === 'notas'; }
    get esTareas() { return this.vista === 'tareas'; }
    get esChat() { return this.vista === 'chat'; }

    refrescar() {
        this.version++;
        this.dispatchEvent(new CustomEvent('cambio'));
    }

    // ===== Notas =====
    get notas() {
        return this.version >= 0 ? notasDe(this._docId).map((n) => {
            const e = ETIQUETAS_NOTA[n.kind];
            return {
                ...n,
                fechaTxt: fechaHora(n.fecha),
                etiqueta: e ? e[0] : null,
                clase: e ? e[1] : 'col-nota',
                claseTag: e ? e[2] : '',
                archivos: (n.files || []).map((f, i) => ({ ...f, key: n.id + '-' + i, tam: bytes(f.size) })),
                hayArchivos: (n.files || []).length > 0
            };
        }) : [];
    }
    get sinNotas() { return this.notas.length === 0; }
    get adjuntosTxt() { return this.adjuntos.map((f, i) => ({ ...f, i, tam: bytes(f.size) })); }
    get hayAdjuntos() { return this.adjuntos.length > 0; }

    escribirNota(e) { this.borradorNota = e.target.value; }
    elegirArchivos() { this.template.querySelector('.col-input-archivo').click(); }
    anadirArchivos(e) {
        // FALTA: subir los adjuntos a Google Storage; ahora solo se guarda el nombre y un enlace local
        const nuevos = [...e.target.files].map((f) => ({ name: f.name, size: f.size, url: URL.createObjectURL(f) }));
        e.target.value = '';
        this.adjuntos = [...this.adjuntos, ...nuevos];
    }
    quitarAdjunto(e) { this.adjuntos = this.adjuntos.filter((_, j) => j !== Number(e.currentTarget.dataset.i)); }
    guardarNota() {
        const text = this.borradorNota.trim();
        if (!text && !this.adjuntos.length) return;
        anadirNota(this._docId, { text, files: this.adjuntos });
        this.borradorNota = '';
        this.adjuntos = [];
        this.refrescar();
    }
    borrarNota(e) {
        const lista = notasDe(this._docId);
        const i = lista.findIndex((n) => String(n.id) === e.currentTarget.dataset.id);
        if (i >= 0) lista.splice(i, 1);
        this.refrescar();
    }

    // ===== Tareas =====
    get responsables() {
        return RESPONSABLES_TAREA.map((r) => ({ r, selected: r === this.borradorTarea.who }));
    }
    get tareas() {
        const hoy = new Date().toISOString().slice(0, 10);
        return this.version >= 0 ? tareasDe(this._docId).map((t) => {
            const vencida = !t.done && t.due && t.due < hoy;
            return {
                ...t,
                check: t.done ? '✓' : '',
                claseCheck: 'col-check' + (t.done ? ' col-check-on' : ''),
                claseTexto: 'col-flex col-tarea-texto' + (t.done ? ' col-tarea-hecha' : ''),
                claseVence: 'col-vence' + (vencida ? ' bc-rojo' : ''),
                venceTxt: t.due ? fecha(t.due) : ''
            };
        }) : [];
    }
    get sinTareas() { return this.tareas.length === 0; }
    get resumenTareas() {
        const t = this.tareas;
        return `${t.filter((x) => !x.done).length} pendiente(s) · ${t.filter((x) => x.done).length} hecha(s)`;
    }
    escribirTarea(e) { this.borradorTarea = { ...this.borradorTarea, text: e.target.value }; }
    elegirResponsable(e) { this.borradorTarea = { ...this.borradorTarea, who: e.target.value }; }
    elegirVencimiento(e) { this.borradorTarea = { ...this.borradorTarea, due: e.target.value }; }
    anadirTarea() {
        const text = this.borradorTarea.text.trim();
        if (!text) return;
        tareasDe(this._docId).push({ id: `${this._docId}-n${secuencia++}`, text, who: this.borradorTarea.who, due: this.borradorTarea.due, done: false });
        this.borradorTarea = { text: '', who: 'Tú', due: '' };
        this.refrescar();
    }
    marcarTarea(e) {
        const t = tareasDe(this._docId).find((x) => x.id === e.currentTarget.dataset.id);
        if (t) t.done = !t.done;
        this.refrescar();
    }
    borrarTarea(e) {
        const lista = tareasDe(this._docId);
        const i = lista.findIndex((x) => x.id === e.currentTarget.dataset.id);
        if (i >= 0) lista.splice(i, 1);
        this.refrescar();
    }

    // ===== Chat IA =====
    get historico() {
        return this.version >= 0 ? chatsDe(this._docId).map((c) => {
            const ultimo = c.msgs[c.msgs.length - 1];
            const sel = this.actual && this.actual.cid === c.cid;
            return {
                ...c,
                meta: `${fechaHora(c.fecha)} · ${c.msgs.length} ${c.msgs.length === 1 ? 'mensaje' : 'mensajes'}`,
                preview: String(ultimo ? ultimo.text : '').replace(/\s+/g, ' ').slice(0, 140),
                clase: 'col-hist' + (sel ? ' col-hist-on' : '')
            };
        }) : [];
    }
    get sinHistorico() { return this.historico.length === 0; }
    get contextoTxt() {
        const c = this.contexto || {};
        return [c.emisor, c.nif, c.total ? c.total + ' €' : ''].filter(Boolean).join(' · ');
    }
    get hayChat() { return !!this.actual; }
    get mensajes() {
        return this.actual ? this.actual.msgs.map((m, i) => ({ ...m, key: 'm' + i, clase: 'col-msg ' + (m.role === 'user' ? 'col-msg-yo' : 'col-msg-ia') })) : [];
    }
    get sugerenciasNuevo() { return SUGERENCIAS_NUEVO.map((label) => ({ label })); }
    get sugerenciasChat() { return this.actual && this.actual.msgs.length ? SUGERENCIAS_CHAT.map((label) => ({ label })) : []; }
    get haySugerenciasChat() { return this.sugerenciasChat.length > 0; }

    nuevoChat(tag, titulo, texto) {
        this.guardarChat();
        this.actual = { cid: Date.now() + secuencia++, tag, titulo, texto, ctx: this.contextoTxt, msgs: [] };
    }

    abrirConsulta(w) {
        this.nuevoChat(w.tag, w.titulo, w.texto);
        this.preguntar(PREGUNTA_RIESGO, true);
    }

    preguntar(q, oculta = false) {
        const texto = String(q || '').trim();
        if (!texto || !this.actual) return;
        const msgs = oculta ? [...this.actual.msgs] : [...this.actual.msgs, { role: 'user', text: texto }];
        msgs.push({ role: 'ai', text: respuestaAsistente(texto, this.contexto || {}) });
        this.actual = { ...this.actual, msgs };
        this.pregunta = '';
    }

    guardarChat() {
        const c = this.actual;
        if (!c || !c.msgs.length) return;
        const lista = chatsDe(this._docId);
        const i = lista.findIndex((x) => x.cid === c.cid);
        if (i >= 0) lista.splice(i, 1);
        lista.unshift({ ...c, fecha: new Date().toISOString() });
        this.refrescar();
    }

    cerrarChat() {
        this.guardarChat();
        this.actual = null;
    }

    abrirHistorico(e) {
        const c = chatsDe(this._docId).find((x) => String(x.cid) === e.currentTarget.dataset.id);
        if (!c || (this.actual && this.actual.cid === c.cid)) return;
        this.guardarChat();
        this.actual = { ...c, msgs: [...c.msgs] };
    }

    borrarHistorico(e) {
        e.stopPropagation();
        const lista = chatsDe(this._docId);
        const i = lista.findIndex((x) => String(x.cid) === e.currentTarget.dataset.id);
        if (i >= 0) lista.splice(i, 1);
        if (this.actual && String(this.actual.cid) === e.currentTarget.dataset.id) this.actual = null;
        this.refrescar();
    }

    escribirPregunta(e) { this.pregunta = e.target.value; }
    teclaPregunta(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.enviar();
        }
    }
    enviar() {
        const q = this.pregunta;
        if (!String(q).trim()) return;
        if (!this.actual) this.empezarCon(q);
        else this.preguntar(q);
    }
    empezarCon(q) {
        const t = String(q).trim();
        this.nuevoChat('Chat IA', t.length > 60 ? t.slice(0, 57) + '…' : t, 'Consulta libre sobre esta factura.');
        this.preguntar(t);
    }
    enviarSugerencia(e) {
        const q = e.currentTarget.dataset.q;
        if (!this.actual) this.empezarCon(q);
        else this.preguntar(q);
    }
}
