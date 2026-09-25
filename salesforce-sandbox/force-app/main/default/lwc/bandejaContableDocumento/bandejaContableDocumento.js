import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getBandeja from '@salesforce/apex/BandejaContableController.getBandeja';
import getEmpresa from '@salesforce/apex/BandejaContableController.getEmpresa';
import listarArchivosGoogle from '@salesforce/apex/BandejaContableController.listarArchivosGoogle';
import {
    documentosDeBandeja, datosExtraidos, datosEmpresa, aprenderRegla, cambiarEstadoDocumento, SOFTWARE_CLIENTE
} from 'c/bandejaContableMock';
import { num, euros, claseEstado, eventoNavegar, mensajeError } from 'c/bandejaContableUtils';

// Campos editables de la columna "Datos extraídos" (clave en los datos extraídos, etiqueta)
const GRUPOS = [
    { titulo: 'Emisor', campos: [['emisor', 'Razón social'], ['nif', 'NIF / CIF']] },
    { titulo: 'Factura', campos: [['numero', 'Nº de factura'], ['cp', 'Código postal'], ['fecha', 'Fecha de emisión'], ['cuenta', 'Cuenta de gasto']] }
];
// Zonas del documento que se resaltan al pasar por el campo correspondiente
const AZUL = ['#0078FF', 'rgba(0,120,255,.10)', 'rgba(0,120,255,.22)'];
const AMARILLO = ['#E0A030', 'rgba(244,169,60,.16)', 'rgba(244,169,60,.34)'];
const ZONAS = { emisor: AZUL, nif: AZUL, numero: AZUL, fecha: AZUL, total: AMARILLO };
const VERDE_FIJO = 'outline:1px solid #1F8A5B;background:rgba(31,138,91,.10)';
const AZUL_FIJO = 'outline:1px solid #0078FF;background:rgba(0,120,255,.10)';
const AMARILLO_FIJO = 'outline:1px solid #E0A030;background:rgba(244,169,60,.16)';

let claveLinea = 0;

/**
 * Pantalla 02 · Documento OCR. El visor puede mostrar el archivo original real (Google) y la
 * "vista OCR"; los datos extraídos, la capa fiscal, las skills y el asiento son de ejemplo
 * (bandejaContableMock) hasta que exista el pipeline OCR. Los cálculos (cuadre, asiento) son reales.
 */
export default class BandejaContableDocumento extends LightningElement {
    @api bandejaId;
    @api origen; // 'ocr' si se llegó desde el listado OCR (para las migas de pan)

    _documentoId;
    @api
    get documentoId() { return this._documentoId; }
    set documentoId(v) {
        this._documentoId = v;
        if (this.docs) this.recalcular();
    }

    cargando = true;
    error;
    detalle;
    empresa;
    urls = {};
    docs;

    // Estado de edición por documento (solo en memoria)
    edits = {};
    lineasExtra = {};
    tipoFactura = {};
    aprendizaje = {};
    hover = null;
    vistaVisor = 'ocr';
    zoom = 100;
    giro = 0;

    v = {};

    connectedCallback() {
        this.cargar();
    }

    async cargar() {
        this.cargando = true;
        try {
            this.detalle = await getBandeja({ bandejaId: this.bandejaId });
            this.docs = documentosDeBandeja(this.detalle);
            this.error = this.docs.length ? null : 'Esta bandeja todavía no tiene documentos OCR.';
        } catch (e) {
            this.error = mensajeError(e);
        } finally {
            this.cargando = false;
        }
        if (!this.detalle) return;
        try {
            this.empresa = await getEmpresa({ empresaId: this.detalle.resumen.empresaId });
        } catch {
            this.empresa = null; // se usa el domicilio de ejemplo
        }
        try {
            const archivos = await listarArchivosGoogle({ bandejaId: this.bandejaId });
            this.urls = Object.fromEntries(archivos.map((a) => [a.archivoId, a.viewUrl]));
        } catch {
            this.urls = {};
        }
        this.recalcular();
    }

    get listo() { return !this.cargando && !this.error && this.v.doc; }

    // ===== Cálculo de toda la vista =====
    recalcular() {
        if (!this.docs || !this.docs.length) return;
        let idx = this.docs.findIndex((d) => d.id === this._documentoId);
        if (idx < 0) idx = 0;
        const doc = this.docs[idx];
        const base = datosExtraidos(doc);
        const x = base.x;
        const ed = this.edits[doc.id] || {};
        const emp = datosEmpresa(doc.empresaId);

        const nifActual = String(ed.nif ?? x.nif).trim().toUpperCase();
        const regla = emp.reglas.find((r) => r.on && r.nif === nifActual);
        const cuentaRegla = regla ? `${regla.cuenta} ${regla.desc}` : null;
        const val = (k) => (ed[k] !== undefined ? ed[k] : k === 'cuenta' && cuentaRegla ? cuentaRegla : x[k]);

        // Resaltado del visor
        const hl = {};
        Object.entries(ZONAS).forEach(([k, z]) => {
            const on = this.hover === k;
            hl[k] = `outline:${on ? '2px' : '1px'} solid ${z[0]};background:${on ? z[2] : z[1]}`;
        });

        // Campos
        const grupos = GRUPOS.map((g) => ({
            titulo: g.titulo,
            estiloGrid: `grid-template-columns:repeat(${g.campos.length >= 3 ? 3 : 2},minmax(0,1fr))`,
            campos: g.campos.map(([k, label]) => ({ k, label, valor: val(k) }))
        }));

        // IVA
        const ivas = ed.ivas || x.ivas;
        const filasIva = ivas.map((r, i) => {
            const cuadra = Math.abs((num(r.base) * num(r.pct)) / 100 - num(r.cuota)) < 0.02;
            return {
                i, key: 'iva' + i, base: r.base, pct: r.pct, cuota: r.cuota,
                claseCuota: 'doc-input doc-input-num' + (cuadra ? '' : ' doc-input-error'),
                claseFila: 'doc-iva-fila' + (this.hover === 'iva' + i ? ' doc-iva-fila-on' : '')
            };
        });
        const sBase = ivas.reduce((a, r) => a + num(r.base), 0);
        const sCuota = ivas.reduce((a, r) => a + num(r.cuota), 0);
        const irpf = num(val('irpf'));
        const total = num(val('total'));
        const diff = sBase + sCuota - irpf - total;
        const ivaPreview = x.ivas.map((r, i) => {
            const on = this.hover === 'iva' + i;
            return { ...r, key: 'p' + i, estilo: `outline:${on ? '2px' : '1px'} solid #E0A030;background:${on ? 'rgba(244,169,60,.34)' : 'rgba(244,169,60,.16)'}` };
        });

        // Propuesta de asiento
        const cta = String(val('cuenta') || '');
        const ctaCodigo = (cta.match(/^\d+/) || ['600'])[0];
        const ctaDesc = cta.replace(/^\d+\s*/, '') || 'Gasto';
        const pad = (c) => (c + '0000000').slice(0, 7);
        const filasAsiento = [{ cuenta: pad(ctaCodigo), concepto: `${ctaDesc} · Fra. ${val('numero')}`, d: sBase, h: 0 }];
        ivas.forEach((r) => {
            const q = num(r.cuota);
            if (q) filasAsiento.push({ cuenta: '472' + String(num(r.pct)).padStart(4, '0'), concepto: `H.P. IVA soportado ${r.pct} %`, d: q, h: 0 });
        });
        if (irpf) filasAsiento.push({ cuenta: '4751000', concepto: 'H.P. acreedora retenciones IRPF', d: 0, h: irpf });
        filasAsiento.push({ cuenta: '400' + String(idx + 1).padStart(4, '0'), concepto: val('emisor'), d: 0, h: total });
        const extra = (this.lineasExtra[doc.id] || []).map((l, i) => ({ ...l, i }));
        const sD = filasAsiento.reduce((a, r) => a + r.d, 0) + extra.reduce((a, r) => a + num(r.debe), 0);
        const sH = filasAsiento.reduce((a, r) => a + r.h, 0) + extra.reduce((a, r) => a + num(r.haber), 0);
        const asientoOk = Math.abs(sD - sH) < 0.01;

        // Capa fiscal (reglas del cliente y peculiaridades detectadas)
        const avisos = [];
        const W = (sev, tag, title, text) => ({ key: tag + title, tag, title, text, claseTag: 'bc-pill bc-pill-peq ' + (sev === 'warn' ? 'bc-pill-pendiente' : 'bc-pill-info') });
        const dir = String(val('dir') || '');
        if (regla && regla.noIntra) avisos.push(W('info', 'Regla cliente', 'No procede autorrepercusión', regla.note + '. Aplicado desde Skills del cliente.'));
        else if (/^[WN]/.test(nifActual) || /luxemburgo|irlanda|francia|portugal|alemania/i.test(dir)) {
            avisos.push(W('warn', 'Intracomunitaria', 'Proveedor no establecido en España', 'Posible adquisición intracomunitaria o inversión del sujeto pasivo. Comprueba el NIF en VIES y, si procede, autorrepercute el IVA (472/477) e incluye en el modelo 349.'));
        }
        if (/SIMPL/i.test(x.kind)) avisos.push(W('warn', 'Simplificada', 'Factura simplificada (ticket)', 'El IVA solo es deducible si consta el NIF y domicilio del destinatario. Si no, contabiliza la cuota como mayor gasto.'));
        if (regla && regla.veh100) avisos.push(W('info', 'Regla cliente', 'Vehículo afecto al 100 %', 'IVA deducible al 100 % según Skills del cliente.'));
        else if (/gas[oó]leo|gasolina|combustible/i.test(x.lineas.map((l) => l.c).join(' '))) {
            avisos.push(W('warn', 'Vehículo', 'Gasto de vehículo', 'Deducción del IVA presunta al 50 % salvo prueba de afectación exclusiva a la actividad.'));
        }
        if (x.sumin) avisos.push(W('warn', 'No deducible', 'Suministro en inmueble no afecto', `La dirección de suministro (${x.sumin}) no coincide con el domicilio fiscal ni con ningún inmueble afecto a la actividad. El gasto y su IVA no son deducibles salvo que se acredite la afectación.`));
        if (irpf) avisos.push(W('info', 'Retención', 'Factura con retención IRPF', 'Se incluirá en el modelo 111 del periodo.'));

        // Aprendizaje: la cuenta cambiada a mano se puede convertir en regla del proveedor
        const cuentaBase = cuentaRegla || x.cuenta;
        const estadoAprendizaje = this.aprendizaje[doc.id];
        const preguntar = ed.cuenta != null && String(ed.cuenta).trim() && ed.cuenta !== cuentaBase && !estadoAprendizaje;

        // Tipo de factura
        const tipo = this.tipoFactura[doc.id] || (doc.categoria === 'Ventas' ? 'Emitida' : 'Recibida');

        // Skills que aplican a este proveedor
        const skills = emp.skills
            .filter((s) => !s.nif || s.nif === nifActual)
            .map((s) => ({ ...s, aplica: s.nif === nifActual, clase: 'doc-skill' + (s.nif === nifActual ? ' doc-skill-aplica' : '') }))
            .sort((a, b) => b.aplica - a.aplica);

        const archivoUrl = this.urls[doc.archivoId];
        const mime = String(doc.archivoMime || '');
        const empresa = this.empresa;

        this.v = {
            doc: { ...doc, claseEstado: claseEstado(doc.estado) },
            idx,
            pos: `${idx + 1} de ${this.docs.length}`,
            x: { ...x, ...ed, lineas: x.lineas.map((l, i) => ({ ...l, key: 'l' + i })) },
            hl,
            estiloFijo: { verde: VERDE_FIJO, azul: AZUL_FIJO, amarillo: AMARILLO_FIJO },
            // Las facturas simplificadas (tickets) no llevan datos del cliente
            conCliente: !/SIMPL/i.test(x.kind),
            clienteNombre: empresa ? empresa.nombre : this.detalle.resumen.empresa,
            clienteCif: empresa ? empresa.cif : this.detalle.resumen.cif,
            grupos,
            filasIva,
            ivaPreview,
            ivaTipos: ivas.length === 1 ? '1 tipo' : `${ivas.length} tipos`,
            sumaBase: euros(sBase),
            sumaCuota: euros(sCuota),
            irpf: val('irpf'),
            total: val('total'),
            cuadre: Math.abs(diff) < 0.01
                ? { clase: 'doc-aviso doc-aviso-ok', titulo: 'Cuadre correcto', texto: 'Σ Bases + Σ Cuotas IVA − IRPF = Total' }
                : { clase: 'doc-aviso doc-aviso-error', titulo: 'Descuadre', texto: `Σ Bases + Σ Cuotas IVA − IRPF no coincide con el Total (diferencia ${euros(diff)} €)` },
            asiento: {
                filas: filasAsiento.map((r, i) => ({ ...r, key: 'a' + i, debe: r.d ? euros(r.d) : '', haber: r.h ? euros(r.h) : '' })),
                extra,
                debe: euros(sD),
                haber: euros(sH),
                badge: asientoOk ? 'Cuadrado' : `Descuadrado ${euros(sD - sH)} €`,
                claseBadge: 'bc-pill bc-pill-peq ' + (asientoOk ? 'bc-pill-ok' : 'bc-pill-error'),
                fecha: val('fecha')
            },
            fiscal: {
                avisos,
                titulo: avisos.length === 0 ? 'Sin peculiaridades fiscales' : avisos.length === 1 ? '1 peculiaridad fiscal' : `${avisos.length} peculiaridades fiscales`,
                clase: 'doc-fiscal' + (avisos.length ? '' : ' doc-fiscal-ok')
            },
            alerta: base.alerta ? { texto: base.alerta, clase: 'doc-aviso ' + (base.alertaTono === 'err' ? 'doc-aviso-error' : 'doc-aviso-warn') } : null,
            aprendizaje: {
                preguntar,
                hecho: estadoAprendizaje === 'aplicada',
                cuenta: ed.cuenta || '',
                proveedor: val('emisor')
            },
            tipos: ['Recibida', 'Emitida'].map((t) => ({ t, clase: 'doc-tipo' + (t === tipo ? (t === 'Emitida' ? ' doc-tipo-emitida' : ' doc-tipo-recibida') : '') })),
            claseTipos: 'doc-tipos' + (tipo === 'Emitida' ? ' doc-tipos-emitida' : ''),
            domicilio: empresa && empresa.domicilio
                ? { l1: empresa.domicilio, l2: empresa.localidad, ejemplo: false }
                : { ...emp.domicilioEjemplo, ejemplo: true },
            locales: emp.locales,
            perfil: emp.perfil.filter(([l]) => ['Régimen de IVA', 'Prorrata', 'Recargo de equivalencia', 'Operador intracomunitario (ROI)'].includes(l)).map(([label, valor]) => ({ label, valor })),
            iae: emp.iae,
            skills,
            skillsTxt: `(${skills.length} de ${emp.skills.length})`,
            software: SOFTWARE_CLIENTE,
            archivoUrl,
            verOriginalPosible: !!archivoUrl && (mime === 'application/pdf' || mime.startsWith('image/')),
            esPdf: mime === 'application/pdf',
            esImagen: mime.startsWith('image/'),
            enVistaOcr: this.vistaVisor === 'ocr' || !archivoUrl,
            claseVistaOcr: 'bc-chip' + (this.vistaVisor === 'ocr' ? ' bc-chip-on' : ''),
            claseVistaOriginal: 'bc-chip' + (this.vistaVisor === 'original' ? ' bc-chip-on' : ''),
            zoomTxt: `${this.zoom} %`,
            estiloPapel: `transform:scale(${this.zoom / 100}) rotate(${this.giro}deg);transform-origin:top center`,
            desdeOcr: this.origen === 'ocr'
        };
    }

    // ===== Edición =====
    get docId() { return this.v.doc && this.v.doc.id; }

    editar(cambios) {
        this.edits = { ...this.edits, [this.docId]: { ...(this.edits[this.docId] || {}), ...cambios } };
        this.recalcular();
    }

    handleCampo(e) {
        this.editar({ [e.target.dataset.k]: e.target.value });
    }

    ivasActuales() {
        const ed = this.edits[this.docId] || {};
        return (ed.ivas || datosExtraidos(this.v.doc).x.ivas).map((r) => ({ ...r }));
    }

    handleIva(e) {
        const ivas = this.ivasActuales();
        ivas[Number(e.target.dataset.i)][e.target.dataset.k] = e.target.value;
        this.editar({ ivas });
    }

    quitarIva(e) {
        this.editar({ ivas: this.ivasActuales().filter((_, j) => j !== Number(e.currentTarget.dataset.i)) });
    }

    anadirIva() {
        this.editar({ ivas: [...this.ivasActuales(), { base: '', pct: '21', cuota: '' }] });
    }

    handleLineaExtra(e) {
        const lineas = (this.lineasExtra[this.docId] || []).map((l) => ({ ...l }));
        lineas[Number(e.target.dataset.i)][e.target.dataset.k] = e.target.value;
        this.lineasExtra = { ...this.lineasExtra, [this.docId]: lineas };
        this.recalcular();
    }

    anadirLinea() {
        const lineas = [...(this.lineasExtra[this.docId] || []), { key: 'x' + claveLinea++, cuenta: '', concepto: '', debe: '', haber: '' }];
        this.lineasExtra = { ...this.lineasExtra, [this.docId]: lineas };
        this.recalcular();
    }

    quitarLinea(e) {
        const i = Number(e.currentTarget.dataset.i);
        this.lineasExtra = { ...this.lineasExtra, [this.docId]: (this.lineasExtra[this.docId] || []).filter((_, j) => j !== i) };
        this.recalcular();
    }

    handleTipo(e) {
        this.tipoFactura = { ...this.tipoFactura, [this.docId]: e.currentTarget.dataset.t };
        this.recalcular();
    }

    // Resaltado: al pasar por un campo se marca su zona en el documento
    entrar(e) {
        this.hover = e.currentTarget.dataset.k;
        this.recalcular();
    }

    salir() {
        this.hover = null;
        this.recalcular();
    }

    // ===== Aprendizaje de reglas =====
    soloEstaVez() {
        this.aprendizaje = { ...this.aprendizaje, [this.docId]: 'descartada' };
        this.recalcular();
    }

    aplicarSiempre() {
        const ed = this.edits[this.docId] || {};
        const c = String(ed.cuenta).trim();
        const codigo = (c.match(/^\d+/) || [''])[0];
        aprenderRegla(this.v.doc.empresaId, {
            nif: String(this.v.x.nif).trim().toUpperCase(),
            prov: this.v.x.emisor,
            cuenta: codigo.padEnd(7, '0'),
            desc: c.replace(/^\d+\s*/, ''),
            iva: this.ivasActuales().map((r) => r.pct + ' %').join(' / ')
        });
        const { cuenta, ...resto } = ed; // la cuenta pasa a venir de la regla
        this.edits = { ...this.edits, [this.docId]: resto };
        this.aprendizaje = { ...this.aprendizaje, [this.docId]: 'aplicada' };
        this.recalcular();
        this.toast('Regla guardada en Skills del cliente', `Las próximas facturas de este proveedor irán a la cuenta ${cuenta}.`, 'success');
    }

    // ===== Visor =====
    verOcr() { this.vistaVisor = 'ocr'; this.recalcular(); }
    verOriginal() { this.vistaVisor = 'original'; this.recalcular(); }
    menosZoom() { this.zoom = Math.max(50, this.zoom - 10); this.recalcular(); }
    masZoom() { this.zoom = Math.min(200, this.zoom + 10); this.recalcular(); }
    girar() { this.giro = (this.giro + 90) % 360; this.recalcular(); }

    // ===== Acciones =====
    irA(n) {
        const siguiente = this.docs[(this.v.idx + n + this.docs.length) % this.docs.length];
        this.dispatchEvent(eventoNavegar({ vista: 'documento', bandejaId: this.bandejaId, docId: siguiente.id, tab: this.origen }));
    }

    anterior() { this.irA(-1); }
    siguiente() { this.irA(1); }

    validar() {
        cambiarEstadoDocumento(this.docId, 'Contabilizado');
        this.docs = documentosDeBandeja(this.detalle);
        this.recalcular(); // si solo hay un documento la navegación no cambia de id
        this.toast('Documento validado', 'Datos de ejemplo: el asiento se generará cuando exista la integración contable.', 'success');
        this.irA(1);
    }

    rechazar() {
        cambiarEstadoDocumento(this.docId, 'Cancelado');
        this.docs = documentosDeBandeja(this.detalle);
        this.recalcular();
        this.toast('Documento rechazado', 'Se ha marcado como cancelado (solo en esta sesión).', 'info');
    }

    guardarBorrador() {
        this.toast('Borrador guardado', 'Datos de ejemplo: los cambios se mantienen solo mientras no recargues la página.', 'info');
    }

    volverABandeja(e) {
        if (e) e.preventDefault();
        this.dispatchEvent(eventoNavegar({ vista: 'registro', bandejaId: this.bandejaId }));
    }

    irALista(e) {
        e.preventDefault();
        this.dispatchEvent(eventoNavegar({ vista: this.origen === 'ocr' ? 'ocr' : 'lista' }));
    }

    verSkills(e) {
        e.preventDefault();
        this.dispatchEvent(eventoNavegar({ vista: 'empresa', empresaId: this.v.doc.empresaId }));
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
