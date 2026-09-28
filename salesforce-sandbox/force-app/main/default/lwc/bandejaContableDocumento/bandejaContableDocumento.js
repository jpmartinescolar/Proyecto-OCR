import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getBandeja from '@salesforce/apex/BandejaContableController.getBandeja';
import getDatosCliente from '@salesforce/apex/BandejaContableController.getDatosCliente';
import listarArchivosGoogle from '@salesforce/apex/BandejaContableController.listarArchivosGoogle';
import listarDocumentosGoogle from '@salesforce/apex/BandejaContableController.listarDocumentosGoogle';
import {
    documentosDeBandeja, datosExtraidos, datosEmpresa, aprenderRegla, cambiarEstadoDocumento, duplicadoDe, historicoProveedor,
    anadirNota, notasDe, tareasDe, chatsDe, SOFTWARE_CLIENTE, MOTIVOS_NO_CONTABILIZAR
} from 'c/bandejaContableMock';
import {
    TIPOS_IVA, TIPOS_RETENCION, CODIGOS_TRANSACCION, CONCEPTOS_RIESGO, nif as normalizarNif, porcentajeDeducible, contrapartidaPorDefecto,
    esExtranjero, sugerenciaDeducible, sumasIva, propuestaAsiento, riesgosFiscales, riesgosOperativos, comprobaciones, analisisIs, productos, consumoIa
} from 'c/bandejaContableCalculos';
import { num, euros, fecha, fechaHora, eventoNavegar, mensajeError, estadoDocumentoGoogle } from 'c/bandejaContableUtils';

// Zonas del documento que se resaltan al pasar por el campo correspondiente
const AZUL = ['#0078FF', 'rgba(0,120,255,.10)', 'rgba(0,120,255,.22)'];
const AMARILLO = ['#E0A030', 'rgba(244,169,60,.16)', 'rgba(244,169,60,.34)'];
const ZONAS = { emisor: AZUL, nif: AZUL, numero: AZUL, fecha: AZUL, total: AMARILLO };
const FIJO = {
    verde: 'outline:1px solid #1F8A5B;background:rgba(31,138,91,.10)',
    azul: 'outline:1px solid #0078FF;background:rgba(0,120,255,.10)'
};
const marca = (on, z) => `outline:${on ? '2px' : '1px'} solid ${z[0]};background:${on ? z[2] : z[1]}`;

const GRUPOS = [
    { titulo: 'Emisor', clase: 'doc-campos doc-campos-emisor', campos: [['emisor', 'Razón social'], ['nif', 'NIF / CIF'], ['ctaProv', 'Cuenta de proveedor'], ['fContable', 'Fecha contable']] },
    { titulo: 'Factura', clase: 'doc-campos doc-campos-factura', campos: [['numero', 'Nº de factura'], ['cp', 'C. postal'], ['fecha', 'Fecha de emisión'], ['devengo', 'Fecha devengo']] },
    { titulo: 'Totales', clase: 'doc-campos doc-campos-4', campos: [['_base', 'Base imponible (€)'], ['_cuota', 'Total IVA (€)'], ['irpf', 'Retención IRPF (€)'], ['total', 'Total factura (€)']] }
];
const PESTANAS = [
    ['general', 'Datos'], ['pf', 'Perfil fiscal'], ['chk', 'Comprobaciones'], ['is', 'IS'], ['prod', 'Productos'], ['notas', 'Notas'],
    ['tareas', 'Tareas'], ['chat', 'Chat IA'], ['iae', 'Actividades'], ['loc', 'Locales'], ['tur', 'Turismos'], ['sk', 'Skills']
];
const COLORES_TIPO = { Emitida: 'doc-tipo-emitida', Recibida: 'doc-tipo-recibida', Ticket: 'doc-tipo-ticket' };
const ORIGEN = { Email: 'buzón de correo', Manual: 'carga manual', Portal: 'portal del cliente', 'Portal del cliente': 'portal del cliente' };
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

let claveLinea = 0;

function hoy() {
    const t = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return `${p(t.getDate())}/${p(t.getMonth() + 1)}/${t.getFullYear()}`;
}

/**
 * Pantalla 02 · Documento OCR (diseño v2): cabecera con acciones, visor y pestañas.
 * REAL: la bandeja, el archivo original (Google) y los datos del cliente de Salesforce (perfil,
 * obligaciones, IAE, locales, vinculados). DE EJEMPLO (bandejaContableMock): el desglose en
 * documentos, los datos extraídos, el consumo de IA, reglas, skills, notas, tareas y chat.
 * Los cálculos (IVA, asiento, riesgos, comprobaciones, IS) son reales sobre esos datos
 * (bandejaContableCalculos).
 */
export default class BandejaContableDocumento extends LightningElement {
    @api bandejaId;
    @api origen; // 'ocr' si se llegó desde el listado OCR (para las migas de pan)

    _documentoId;
    @api
    get documentoId() { return this._documentoId; }
    set documentoId(v) {
        this._documentoId = v;
        this.cerrarVentanas();
        if (this.docs) this.recalcular();
    }

    cargando = true;
    error;
    detalle;
    cliente;
    errorCliente;
    urls = {};
    docs;
    docsGoogle = [];

    // Estado de edición por documento (solo en memoria)
    edits = {};
    lineasExtra = {};
    asientoEd = {};
    tipoFactura = {};
    aprendizaje = {};
    divisaEd = {};
    dedAbierto = null; // índice de la línea con el popover de % deducible abierto
    dedError = {};

    pestana = 'general';
    hover = null;
    productoResaltado = null;
    vistaVisor = null; // null: original si es un documento real de Google; si no, la vista OCR de ejemplo
    zoom = 100;
    giro = 0;

    ncBorrador = null; // { motivo, comentario, avisar }
    avisoValidar = false;
    riesgoModal = null;
    consulta = null; // pregunta a la IA desde un riesgo
    skillAbrir = null;

    v = {};

    connectedCallback() {
        this.cargar();
    }

    async cargar() {
        this.cargando = true;
        try {
            this.detalle = await getBandeja({ bandejaId: this.bandejaId });
        } catch (e) {
            this.error = mensajeError(e);
            this.cargando = false;
            return;
        }
        const [cliente, archivos, docs] = await Promise.allSettled([
            getDatosCliente({ empresaId: this.detalle.resumen.empresaId }),
            listarArchivosGoogle({ bandejaId: this.bandejaId }),
            listarDocumentosGoogle({ bandejaId: this.bandejaId })
        ]);
        if (cliente.status === 'fulfilled') this.cliente = cliente.value;
        else this.errorCliente = mensajeError(cliente.reason);
        // viewUrl se abre en el visor; descargaUrl baja el archivo con el nombre original del cliente
        this.urls = archivos.status === 'fulfilled'
            ? Object.fromEntries(archivos.value.map((a) => [a.archivoId, { ver: a.viewUrl, descargar: a.descargaUrl || a.viewUrl }]))
            : {};
        // Documentos que ha separado Google (reales); sin ellos, los de ejemplo a partir de los archivos
        this.docsGoogle = docs.status === 'fulfilled' ? docs.value : [];
        this.docs = documentosDeBandeja(this.detalle, this.docsGoogle);
        this.error = this.docs.length ? null : 'Esta bandeja todavía no tiene documentos OCR.';
        this.cargando = false;
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
        const x0 = base.x;
        const ed = this.edits[doc.id] || {};
        const emp = datosEmpresa(doc.empresaId);
        const cliente = this.cliente || {};

        const val = (k) => (ed[k] !== undefined ? ed[k] : x0[k]);
        const x = { ...x0, ...ed };
        const nifActual = normalizarNif(val('nif'));
        const regla = emp.reglas.find((r) => r.on && r.nif === nifActual);
        const textoLineas = (x0.lineas || []).map((l) => l.c).join(' ');
        const bloqueado = doc.estado === 'No contabilizado';

        // Tipo de factura (cabecera)
        const tipoDef = doc.tipo === 'Emitida' ? 'Emitida' : doc.tipo === 'Ticket' || /SIMPL/i.test(x0.kind) ? 'Ticket' : 'Recibida';
        const tipo = this.tipoFactura[doc.id] || tipoDef;

        // ----- Desglose de IVA -----
        const ivas = ed.ivas || x0.ivas;
        const cuentaBase = regla ? `${regla.cuenta} ${regla.desc}` : x0.cuenta;
        const contraDef = contrapartidaPorDefecto(tipo, cuentaBase);
        const ttDef = esExtranjero(nifActual, val('dir')) ? '02' : '01';
        const sugerencia = sugerenciaDeducible(regla, textoLineas);
        const skills = emp.skills;
        const filasIva = ivas.map((r, i) => this.filaIva(r, i, { regla, contraDef, ttDef, sugerencia, skills, nifActual }));
        const sumas = sumasIva(ivas);
        const irpf = num(val('irpf'));
        const total = num(val('total'));
        const diff = sumas.base + sumas.cuota - irpf - total;

        // ----- Campos -----
        const fContable = doc.fechaValidacion || (doc.estado === 'Contabilizado' ? fecha(doc.fecha) : '');
        const grupos = GRUPOS.map((g) => ({
            titulo: g.titulo,
            clase: g.clase,
            campos: g.campos.map(([k, label]) => {
                const campo = { k, label, valor: val(k), soloLectura: false, placeholder: '', clase: 'doc-input', titulo: '' };
                if (k === 'fContable') return { ...campo, valor: fContable, soloLectura: true, placeholder: 'Se asigna al validar', titulo: 'Se rellena automáticamente al validar la factura', clase: 'doc-input' + (fContable ? ' doc-input-ok' : '') };
                if (k === '_base') return { ...campo, valor: euros(sumas.base), soloLectura: true };
                if (k === '_cuota') return { ...campo, valor: euros(sumas.cuota), soloLectura: true };
                if (k === 'irpf' || k === 'total') return { ...campo, clase: 'doc-input doc-input-num' };
                return campo;
            })
        }));

        // ----- Asiento -----
        const filasBase = propuestaAsiento({ ivas, contraDef, cuenta: cuentaBase, numero: val('numero'), emisor: val('emisor'), ctaProv: val('ctaProv'), irpf, total, idx });
        const ov = this.asientoEd[doc.id] || {};
        const filasAsiento = filasBase.map((r, i) => {
            const o = ov[i] || {};
            const d = o.debe != null ? num(o.debe) : r.d;
            const h = o.haber != null ? num(o.haber) : r.h;
            const cambiado = (k, orig) => (o[k] != null && (k === 'debe' || k === 'haber' ? num(o[k]) !== orig : o[k] !== orig));
            const cls = (k, orig) => 'doc-asiento-input' + (cambiado(k, orig) ? ' doc-asiento-editado' : '');
            return {
                i, key: 'a' + i, d, h,
                cuenta: o.cuenta ?? r.cuenta, concepto: o.concepto ?? r.concepto,
                debe: o.debe ?? (r.d ? euros(r.d) : ''), haber: o.haber ?? (r.h ? euros(r.h) : ''),
                claseCuenta: cls('cuenta', r.cuenta) + ' doc-asiento-cuenta', claseConcepto: cls('concepto', r.concepto),
                claseDebe: cls('debe', r.d) + ' doc-input-num', claseHaber: cls('haber', r.h) + ' doc-input-num'
            };
        });
        const extra = (this.lineasExtra[doc.id] || []).map((l, i) => ({ ...l, i }));
        const sD = filasAsiento.reduce((a, r) => a + r.d, 0) + extra.reduce((a, r) => a + num(r.debe), 0);
        const sH = filasAsiento.reduce((a, r) => a + r.h, 0) + extra.reduce((a, r) => a + num(r.haber), 0);
        const asientoOk = Math.abs(sD - sH) < 0.01;

        // ----- Riesgos y comprobaciones (datos del cliente reales de Salesforce) -----
        const direccionesAfectas = [[cliente.domicilio, cliente.localidad].filter(Boolean).join(', '), ...(cliente.locales || []).map((l) => l.direccion)].filter(Boolean);
        const duplicado = duplicadoDe(doc);
        const historico = historicoProveedor(nifActual);
        const fiscal = riesgosFiscales({ x, regla, textoLineas, sumas, irpf, direccionesAfectas, duplicado, ivas }).map((w) => ({
            ...w,
            claseTag: 'bc-pill bc-pill-peq ' + (w.sev === 'warn' ? 'bc-pill-pendiente' : 'bc-pill-info'),
            riesgoTxt: w.riesgo ? euros(w.riesgo.total) + ' €' : null,
            claseRiesgo: 'doc-riesgo-importe' + (w.riesgo && w.riesgo.total > 0 ? ' bc-rojo' : ' doc-verde')
        }));
        const operativo = riesgosOperativos(historico, total).map((w) => ({ ...w, claseTag: 'bc-pill bc-pill-peq bc-pill-pendiente' }));
        const partesFecha = String(val('fecha') || '').split('/');
        const checks = comprobaciones({
            x, ivas, tipo, regla, textoLineas, cliente, direccionesAfectas, duplicado, historico,
            mes: partesFecha.length === 3 ? MESES[Number(partesFecha[1]) - 1] : ''
        });
        const checksMal = checks.filter((c) => c.estado !== 'ok').length;
        const is = analisisIs({ x, ivas, textoLineas, direccionesAfectas });
        const prods = productos(x0.lineas, x0.ivasDoc || x0.ivas);

        // Skills aplicadas: las del reparto de líneas y las del proveedor
        const aplicadas = [...new Set([...ivas.map((r) => r.sk).filter(Boolean), ...skills.filter((s) => s.nif && s.nif === nifActual).map((s) => s.num)])];

        // ----- Aprendizaje: contrapartida cambiada a mano → regla del proveedor -----
        const cambiada = ivas.find((r) => r.contraManual && String(r.contra || '').trim());
        const estadoAprendizaje = this.aprendizaje[doc.id];
        const preguntar = !!cambiada && !estadoAprendizaje && (!regla || !String(cambiada.contra).startsWith(regla.cuenta));

        // ----- Visor -----
        const hl = {};
        Object.entries(ZONAS).forEach(([k, z]) => { hl[k] = marca(this.hover === k, z); });
        const ivaPreview = (x0.ivasDoc || x0.ivas).map((r, i) => ({ ...r, key: 'p' + i, estilo: marca(this.hover === 'iva' + i, AMARILLO) }));
        const lineasDoc = (x0.lineas || []).map((l, i) => ({ ...l, key: 'l' + i, estilo: marca(this.productoResaltado === i && this.pestana === 'prod', AMARILLO) }));
        // Documento real de Google: su propio PDF (recortado si venía con otros); si no, el archivo subido
        const urlsArchivo = doc.google && doc.google.viewUrl ? { ver: doc.google.viewUrl, descargar: doc.google.viewUrl } : this.urls[doc.archivoId] || {};
        const vista = this.vistaVisor || (doc.google ? 'original' : 'ocr');
        const archivoUrl = urlsArchivo.ver;
        const mime = String(doc.archivoMime || '');

        // ----- Divisa -----
        let divisa = { hay: false };
        if (x0.moneda) {
            const de = this.divisaEd[doc.id] || {};
            const rate = de.rate ?? x0.fxRate;
            divisa = { hay: true, moneda: x0.moneda, simb: x0.simb, orig: euros(x0.totalOrig), rate, eur: euros(x0.totalOrig * num(rate)), fecha: val('fecha'), editando: !!de.editando, boton: de.editando ? 'Aceptar' : 'Editar' };
        }

        // ----- No contabilizar -----
        const motivoSugerido = duplicado ? 'Duplicada' : x0.sumin ? 'No deducible' : /SIMPL/i.test(x0.kind || '') ? 'Falta documentación' : '';
        const nc = this.ncBorrador;
        const motivos = MOTIVOS_NO_CONTABILIZAR.map(([label, hint]) => {
            const on = nc && nc.motivo === label;
            return { label, hint, sugerido: label === motivoSugerido, clase: 'doc-motivo' + (on ? ' doc-motivo-on' : ''), claseRadio: 'doc-radio' + (on ? ' doc-radio-on' : '') };
        });

        const notas = notasDe(doc.id).length;
        const tareasPend = tareasDe(doc.id).filter((t) => !t.done).length;
        const chats = chatsDe(doc.id).length;
        const contadores = {
            chk: checksMal, is: is.total, prod: prods.filas.length, notas, tareas: tareasPend, chat: chats,
            iae: (cliente.actividades || []).length, loc: (cliente.locales || []).length, tur: emp.turismos.length, sk: skills.length
        };
        const consumo = consumoIa(base.consumo);
        const tiposCabecera = ['Emitida', 'Recibida', 'Ticket'].map((t) => ({ t, clase: 'doc-tipo' + (t === tipo ? ' ' + COLORES_TIPO[t] : '') }));

        this.v = {
            doc: { ...doc, estadoTxt: doc.motivo ? `${doc.estado} · ${doc.motivo}` : doc.estado, claseEstado: 'doc-estado doc-estado-' + (doc.estado === 'Contabilizado' ? 'ok' : bloqueado ? 'nc' : 'pend') },
            idx,
            pos: `${idx + 1} de ${this.docs.length}`,
            x: { ...x, lineas: lineasDoc },
            titulo: doc.google ? `${estadoDocumentoGoogle(doc.google).tipoTxt} ${doc.google.numeroFactura || doc.numero}` : `Factura ${val('numero')}`,
            google: doc.google ? this.lecturaGoogle(doc.google) : null,
            bloqueado,
            puedeReabrir: bloqueado,
            puedeCerrar: !bloqueado,
            claseValidar: 'bc-boton bc-boton-peq' + (bloqueado ? ' doc-boton-bloqueado' : ''),
            tituloValidar: bloqueado ? 'Reabre la factura para poder validarla' : '',
            tipos: tiposCabecera,
            claseTipos: 'doc-tipos doc-tipos-' + tipo.toLowerCase(),
            meta: {
                empresa: (cliente.nombre || this.detalle.resumen.empresa),
                recibido: `${fecha(doc.fecha)} · ${ORIGEN[doc.origen] || doc.origen || 'origen desconocido'}`,
                extraccion: fechaHora(doc.archivoFecha || doc.fecha),
                tokens: consumo.tokens,
                coste: consumo.coste,
                tokensTip: consumo.tip,
                software: cliente.softwareContable && cliente.softwareContable !== 'Otros' ? cliente.softwareContable : SOFTWARE_CLIENTE,
                softwareEjemplo: !(cliente.softwareContable && cliente.softwareContable !== 'Otros')
            },
            pestanas: PESTANAS.map(([k, label]) => {
                const on = this.pestana === k;
                const n = contadores[k];
                return {
                    k, label, on,
                    clase: 'doc-pestana' + (on ? ' doc-pestana-on' : ''),
                    conAviso: k === 'chk' && n > 0,
                    conN: n !== undefined && !(k === 'chk' && n > 0),
                    n: n !== undefined ? String(n) : '',
                    claseN: 'doc-pestana-n' + (n === 0 ? ' doc-pestana-n-cero' : k === 'notas' ? ' doc-pestana-n-rojo' : on ? ' doc-pestana-n-on' : '')
                };
            }),
            enDatos: this.pestana === 'general',
            enCliente: ['pf', 'iae', 'loc', 'tur'].includes(this.pestana),
            enChk: this.pestana === 'chk',
            enAnalisis: ['is', 'prod'].includes(this.pestana),
            enColaboracion: ['notas', 'tareas', 'chat'].includes(this.pestana),
            enSkills: this.pestana === 'sk',
            // Datos
            grupos,
            filasIva,
            ivaTipos: ivas.length === 1 ? '1 tipo' : `${ivas.length} tipos`,
            sumas: { base: euros(sumas.base), cuota: euros(sumas.cuota), re: euros(sumas.re), ret: euros(sumas.ret), ded: euros(sumas.ded), noDed: euros(sumas.noDed), hayNoDed: sumas.noDed > 0.004 },
            divisa,
            alerta: base.alerta ? { texto: base.alerta, clase: 'doc-aviso ' + (base.alertaTono === 'err' ? 'doc-aviso-error' : 'doc-aviso-warn') } : null,
            aprendizaje: { preguntar, hecho: estadoAprendizaje === 'aplicada', cuenta: cambiada ? cambiada.contra : '', proveedor: val('emisor') },
            asiento: {
                filas: filasAsiento,
                extra,
                debe: euros(sD),
                haber: euros(sH),
                badge: asientoOk ? 'Cuadrado' : `Descuadrado ${euros(sD - sH)} €`,
                claseBadge: 'bc-pill bc-pill-peq ' + (asientoOk ? 'bc-pill-ok' : 'bc-pill-error'),
                fecha: val('fecha'),
                diario: tipo === 'Emitida' ? 'Diario de ventas' : 'Diario de compras'
            },
            cuadre: Math.abs(diff) < 0.01
                ? { clase: 'doc-aviso doc-aviso-ok', titulo: 'Cuadre correcto', texto: 'Σ Bases + Σ Cuotas IVA − IRPF = Total' }
                : { clase: 'doc-aviso doc-aviso-error', titulo: 'Descuadre', texto: `Σ Bases + Σ Cuotas IVA − IRPF no coincide con el Total (diferencia ${euros(diff)} €)` },
            fiscal: {
                items: fiscal,
                titulo: fiscal.length ? (fiscal.length === 1 ? '1 peculiaridad fiscal' : `${fiscal.length} peculiaridades fiscales`) : 'Sin riesgo fiscal',
                clase: 'doc-riesgo' + (fiscal.length ? ' doc-riesgo-fiscal' : '')
            },
            operativo: {
                items: operativo,
                titulo: operativo.length ? (operativo.length === 1 ? '1 incidencia operativa' : `${operativo.length} incidencias operativas`) : 'Sin riesgo operativo',
                clase: 'doc-riesgo' + (operativo.length ? ' doc-riesgo-operativo' : '')
            },
            skillsAplicadas: { n: String(aplicadas.length), nombres: aplicadas.join(' · '), clase: 'doc-skills-aplicadas' + (aplicadas.length ? ' doc-skills-aplicadas-on' : '') },
            // Otras pestañas
            checks,
            is,
            productos: prods,
            perfilSinDatos: emp.perfilSinDatos,
            turismos: emp.turismos,
            contexto: { emisor: val('emisor'), nif: nifActual, total: val('total'), empresa: cliente.nombre || this.detalle.resumen.empresa },
            // Visor
            hl,
            fijo: FIJO,
            ivaPreview,
            conCliente: !/SIMPL/i.test(x0.kind),
            clienteNombre: cliente.nombre || this.detalle.resumen.empresa,
            clienteCif: cliente.cif || this.detalle.resumen.cif,
            archivoUrl,
            descargaUrl: urlsArchivo.descargar,
            verOriginalPosible: !!archivoUrl && (mime === 'application/pdf' || mime.startsWith('image/')),
            esPdf: mime === 'application/pdf',
            esImagen: mime.startsWith('image/'),
            enVistaOcr: vista === 'ocr' || !archivoUrl,
            claseVistaOcr: 'bc-chip' + (vista === 'ocr' ? ' bc-chip-on' : ''),
            claseVistaOriginal: 'bc-chip' + (vista === 'original' ? ' bc-chip-on' : ''),
            zoomTxt: `${this.zoom} %`,
            estiloPapel: `transform:scale(${this.zoom / 100}) rotate(${this.giro}deg);transform-origin:top center`,
            desdeOcr: this.origen === 'ocr',
            // Ventanas
            nc: nc ? { ...nc, motivos, claseOk: 'doc-boton-peligro' + (nc.motivo ? '' : ' doc-boton-bloqueado') } : null,
            claseBotonNc: 'doc-boton-nc' + (nc ? ' doc-boton-nc-on' : ''),
            avisoValidar: this.avisoValidar,
            riesgoModal: this.riesgoModal
        };
    }

    /** Lo que ha leído Google de este documento (real): tipo, emisor, número, fecha, total, páginas y estado */
    lecturaGoogle(g) {
        const e = estadoDocumentoGoogle(g);
        const paginas = g.paginaInicio === g.paginaFin ? `pág. ${g.paginaInicio}` : `págs. ${g.paginaInicio}–${g.paginaFin}`;
        return {
            campos: [
                ['Tipo', e.tipoTxt], ['Emisor', g.emisor], ['NIF emisor', g.nifEmisor], ['Nº', g.numeroFactura],
                ['Fecha', g.fecha], ['Total', g.total ? g.total + ' €' : null],
                ['Confianza', g.confianza != null ? Math.round(g.confianza * 100) + ' %' : null], ['Origen', `${g.archivoOrigen} · ${paginas}`]
            ].filter(([, v]) => v).map(([label, valor]) => ({ label, valor })),
            estadoTxt: e.estadoTxt,
            claseEstado: e.clase,
            motivosTxt: e.motivosTxt,
            dudas: (g.dudas || []).join(' · ')
        };
    }

    /** Una línea del desglose de IVA ampliado */
    filaIva(r, i, { regla, contraDef, ttDef, sugerencia, skills, nifActual }) {
        const ded = porcentajeDeducible(r);
        const cuota = num(r.cuota);
        const cDed = (cuota * ded) / 100;
        const cuadra = Math.abs((num(r.base) * num(r.pct)) / 100 - cuota) < 0.02;
        const retPct = r.retPct ?? '0';
        const retCuadra = Math.abs((num(r.base) * num(retPct)) / 100 - num(r.ret ?? 0)) < 0.02;
        const tt = r.tt ?? (ded === 0 ? '06' : ttDef);
        const abierto = this.dedAbierto === i;
        const sinMotivo = ded < 100 && !String(r.dedMot || '').trim();
        const errMot = abierto && sinMotivo && !!this.dedError[i];
        const hk = 'iva' + (r.docIdx ?? i);

        // Chips de skill/regla que explican la contrapartida o el % deducible
        const chips = [];
        if (regla && r.contra == null && !r.sk) chips.push({ key: 'regla', label: `Regla proveedor → ${regla.cuenta} ${regla.desc}`, tip: 'Contrapartida propuesta por la regla del proveedor ' + regla.prov, num: '' });
        if (r.sk) {
            const s = skills.find((k) => k.num === r.sk);
            chips.push({ key: r.sk, label: `${r.sk} · Reparto ${r.skPart || ''}`.trim(), tip: s ? `${s.title}: ${s.text}` : r.sk, num: r.sk });
        } else if (!chips.length) {
            skills.filter((s) => s.nif && s.nif === nifActual).slice(0, 1).forEach((s) => chips.push({ key: s.num, label: `${s.num} · ${s.title.replace(/^[^:]+:\s*/, '').split(/\s+/).slice(0, 3).join(' ')}`, tip: s.text, num: s.num }));
        }
        if (!chips.length && sugerencia && r.ded != null && ded === sugerencia.v) chips.push({ key: 'ded', label: `% deducible ${sugerencia.v} % · ${sugerencia.motivo}`, tip: sugerencia.texto, num: '' });

        const opciones = (lista, actual) => lista.map(([v, l]) => ({ v, l, selected: String(actual) === v }));
        const contraSkill = (regla && r.contra == null) || r.sk;
        return {
            i, key: 'iva' + i, hk,
            contra: r.contra ?? contraDef, base: r.base, cuota: r.cuota, re: r.re ?? '0,00', ret: r.ret ?? '0,00',
            opcionesPct: opciones(TIPOS_IVA, num(r.pct)),
            opcionesRet: opciones(TIPOS_RETENCION, num(retPct)),
            opcionesTt: opciones(CODIGOS_TRANSACCION, tt),
            claseFila: 'doc-iva-fila' + (this.hover === hk ? ' doc-iva-fila-on' : ''),
            claseSub: 'doc-iva-sub' + (this.hover === hk ? ' doc-iva-fila-on' : ''),
            claseContra: 'doc-iva-input doc-iva-izq' + (contraSkill ? ' doc-iva-skill' : ''),
            claseCuota: 'doc-iva-input' + (cuadra ? '' : ' doc-iva-error'),
            claseRet: 'doc-iva-input' + (retCuadra ? '' : ' doc-iva-error'),
            // % deducible
            ded: String(r.ded ?? '100'),
            dedMot: r.dedMot || '',
            dedL: ded + ' %',
            parcial: ded < 100,
            claseDed: 'doc-ded' + (ded < 100 ? ' doc-ded-parcial' : ''),
            dedTip: ded < 100 ? `IVA deducible al ${ded} %` : 'IVA deducible al 100 %. Pulsa para cambiar',
            cDed: euros(cDed),
            cNoDed: euros(cuota - cDed),
            dedMotL: String(r.dedMot || '').trim() ? 'Motivo: ' + r.dedMot : 'Falta el motivo (obligatorio)',
            abierto,
            errMot,
            claseMot: 'doc-ded-motivo' + (errMot ? ' doc-iva-error' : ''),
            sugerencia: sugerencia ? `${sugerencia.v} % · ${sugerencia.texto}` : null,
            rapidos: [100, 50, 0].map((v) => ({ v: String(v), clase: 'doc-ded-rapido' + (ded === v ? ' doc-ded-rapido-on' : '') })),
            chips,
            hayChips: chips.length > 0
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
        const { i, k } = e.target.dataset;
        ivas[Number(i)][k] = e.target.value;
        if (k === 'contra') ivas[Number(i)].contraManual = true;
        this.editar({ ivas });
    }

    quitarIva(e) {
        this.editar({ ivas: this.ivasActuales().filter((_, j) => j !== Number(e.currentTarget.dataset.i)) });
    }

    anadirIva() {
        this.editar({ ivas: [...this.ivasActuales(), { base: '', pct: '21', cuota: '' }] });
    }

    // % deducible
    toggleDeducible(e) {
        const i = Number(e.currentTarget.dataset.i);
        if (this.dedAbierto === i) {
            const r = this.ivasActuales()[i];
            if (porcentajeDeducible(r) < 100 && !String(r.dedMot || '').trim()) {
                this.dedError = { ...this.dedError, [i]: true };
                this.recalcular();
                return;
            }
            this.dedAbierto = null;
        } else {
            this.dedAbierto = i;
        }
        this.recalcular();
    }

    fijarDeducible(i, ded, motivo) {
        const ivas = this.ivasActuales();
        ivas[i].ded = String(ded);
        if (motivo !== undefined) ivas[i].dedMot = motivo;
        this.editar({ ivas });
    }

    rapidoDeducible(e) {
        const v = Number(e.currentTarget.dataset.v);
        this.fijarDeducible(Number(e.currentTarget.dataset.i), v, v === 100 ? '' : undefined);
    }

    sugerirDeducible(e) {
        const i = Number(e.currentTarget.dataset.i);
        const d = datosExtraidos(this.v.doc).x;
        const regla = datosEmpresa(this.v.doc.empresaId).reglas.find((r) => r.on && r.nif === normalizarNif(this.v.x.nif));
        const s = sugerenciaDeducible(regla, (d.lineas || []).map((l) => l.c).join(' '));
        if (s) this.fijarDeducible(i, s.v, s.motivo);
    }

    handleDeducible(e) {
        const i = Number(e.target.dataset.i);
        if (e.target.dataset.k === 'ded') this.fijarDeducible(i, e.target.value);
        else {
            const ivas = this.ivasActuales();
            ivas[i].dedMot = e.target.value;
            this.editar({ ivas });
        }
    }

    // Divisa
    toggleDivisa() {
        const de = this.divisaEd[this.docId] || {};
        this.divisaEd = { ...this.divisaEd, [this.docId]: { ...de, editando: !de.editando } };
        this.recalcular();
    }

    handleDivisa(e) {
        const de = this.divisaEd[this.docId] || {};
        this.divisaEd = { ...this.divisaEd, [this.docId]: { ...de, rate: e.target.value } };
        this.recalcular();
    }

    // Asiento
    handleAsiento(e) {
        const { i, k } = e.target.dataset;
        const actual = this.asientoEd[this.docId] || {};
        this.asientoEd = { ...this.asientoEd, [this.docId]: { ...actual, [i]: { ...(actual[i] || {}), [k]: e.target.value } } };
        this.recalcular();
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

    resaltarProducto(e) {
        this.productoResaltado = e.detail.i;
        this.recalcular();
    }

    // ===== Aprendizaje de reglas =====
    soloEstaVez() {
        this.aprendizaje = { ...this.aprendizaje, [this.docId]: 'descartada' };
        this.recalcular();
    }

    aplicarSiempre() {
        const c = String(this.v.aprendizaje.cuenta).trim();
        const codigo = (c.match(/^\d+/) || [''])[0];
        aprenderRegla(this.v.doc.empresaId, {
            nif: normalizarNif(this.v.x.nif),
            prov: this.v.x.emisor,
            cuenta: codigo.padEnd(7, '0'),
            desc: c.replace(/^\d+\s*/, ''),
            iva: this.ivasActuales().map((r) => r.pct + ' %').join(' / ')
        });
        this.aprendizaje = { ...this.aprendizaje, [this.docId]: 'aplicada' };
        this.recalcular();
        this.toast('Regla guardada en Skills del cliente', `Las próximas facturas de este proveedor irán a la cuenta ${c}. Datos de ejemplo.`, 'success');
    }

    // ===== Pestañas =====
    elegirPestana(e) {
        this.pestana = e.currentTarget.dataset.k;
        this.dedAbierto = null;
        this.recalcular();
    }

    alCambiarColaboracion() { this.recalcular(); }

    alCambiarSkills(e) {
        if (e.detail && e.detail.mensaje) this.toast(e.detail.mensaje, 'Datos de ejemplo: se mantiene solo en esta sesión.', 'success');
        this.recalcular();
    }

    abrirChip(e) {
        const numero = e.currentTarget.dataset.num;
        this.pestana = 'sk';
        this.skillAbrir = numero ? { num: numero, t: Date.now() } : null;
        this.recalcular();
    }

    verSkills(e) {
        if (e) e.preventDefault();
        this.pestana = 'sk';
        this.recalcular();
    }

    verComprobaciones(e) {
        if (e) e.preventDefault();
        this.pestana = 'chk';
        this.recalcular();
    }

    preguntarIa(e) {
        const w = [...this.v.fiscal.items, ...this.v.operativo.items].find((x) => x.clave === e.currentTarget.dataset.clave);
        if (!w) return;
        this.consulta = { id: Date.now(), tag: w.tag, titulo: w.titulo, texto: w.texto };
        this.pestana = 'chat';
        this.recalcular();
    }

    // ===== Riesgo económico =====
    abrirRiesgo(e) {
        const w = this.v.fiscal.items.find((x) => x.clave === e.currentTarget.dataset.clave);
        if (!w || !w.riesgo) return;
        const ctx = [this.v.x.emisor, this.v.x.total ? this.v.x.total + ' €' : ''].filter(Boolean).join(' · ');
        this.riesgoModal = {
            tag: w.tag, titulo: w.titulo, ctx, total: euros(w.riesgo.total) + ' €',
            filas: CONCEPTOS_RIESGO.map((label, i) => ({
                label, nota: w.riesgo.notas[i], importe: euros(w.riesgo.importes[i]) + ' €',
                clase: 'doc-modal-importe' + (w.riesgo.importes[i] > 0 ? ' bc-rojo' : '')
            }))
        };
        this.recalcular();
    }

    cerrarRiesgo() {
        this.riesgoModal = null;
        this.recalcular();
    }

    parar(e) { e.stopPropagation(); }

    cerrarVentanas() {
        this.ncBorrador = null;
        this.avisoValidar = false;
        this.riesgoModal = null;
        this.dedAbierto = null;
        this.dedError = {};
    }

    // ===== Visor =====
    verOcr() { this.vistaVisor = 'ocr'; this.recalcular(); }
    verOriginal() { this.vistaVisor = 'original'; this.recalcular(); }
    menosZoom() { this.zoom = Math.max(50, this.zoom - 10); this.recalcular(); }
    masZoom() { this.zoom = Math.min(200, this.zoom + 10); this.recalcular(); }
    girar() { this.giro = (this.giro + 90) % 360; this.recalcular(); }

    // ===== Acciones de cabecera =====
    irA(n) {
        const siguiente = this.docs[(this.v.idx + n + this.docs.length) % this.docs.length];
        this.dispatchEvent(eventoNavegar({ vista: 'documento', bandejaId: this.bandejaId, docId: siguiente.id, tab: this.origen }));
    }

    anterior() { this.irA(-1); }
    siguiente() { this.irA(1); }

    refrescarDocs() {
        this.docs = documentosDeBandeja(this.detalle, this.docsGoogle);
        this.recalcular();
    }

    guardarBorrador() {
        this.toast('Borrador guardado', 'Datos de ejemplo: los cambios se mantienen solo mientras no recargues la página.', 'info');
    }

    // No contabilizar
    toggleNc() {
        this.ncBorrador = this.ncBorrador ? null : { motivo: '', comentario: '', avisar: false };
        this.recalcular();
    }

    elegirMotivo(e) {
        this.ncBorrador = { ...this.ncBorrador, motivo: e.currentTarget.dataset.motivo };
        this.recalcular();
    }

    handleComentarioNc(e) { this.ncBorrador = { ...this.ncBorrador, comentario: e.target.value }; }

    toggleAvisarNc(e) { this.ncBorrador = { ...this.ncBorrador, avisar: e.target.checked }; }

    confirmarNc() {
        const b = this.ncBorrador;
        if (!b || !b.motivo) return;
        const c = b.comentario.trim();
        cambiarEstadoDocumento(this.docId, 'No contabilizado', { motivo: b.motivo });
        // FALTA: el aviso al cliente (correo o portal) todavía no existe; queda anotado en Notas
        anadirNota(this.docId, { kind: 'nc', text: `No contabilizado · ${b.motivo}${c ? '. ' + c : ''}${b.avisar ? ' (aviso al cliente pendiente de enviar)' : ''}`, files: [] });
        this.ncBorrador = null;
        this.refrescarDocs();
        this.toast('Factura marcada como no contabilizada', b.motivo + (b.avisar ? ' · el aviso al cliente todavía no se envía (pendiente)' : ''), 'info');
    }

    reabrir() {
        cambiarEstadoDocumento(this.docId, 'Pendiente');
        anadirNota(this.docId, { kind: 'reopen', text: 'Factura reabierta para revisión.', files: [] });
        this.refrescarDocs();
        this.toast('Factura reabierta', '', 'success');
    }

    // Validar
    validar() {
        if (this.v.bloqueado) return;
        if (this.v.fiscal.items.length) {
            this.avisoValidar = true;
            this.recalcular();
            return;
        }
        this.contabilizar([]);
    }

    cancelarValidar() {
        this.avisoValidar = false;
        this.recalcular();
    }

    aceptarRiesgo() {
        this.avisoValidar = false;
        this.contabilizar(this.v.fiscal.items);
    }

    contabilizar(riesgos) {
        const f = hoy();
        cambiarEstadoDocumento(this.docId, 'Contabilizado', { fechaValidacion: f, riesgoAceptado: riesgos.map((w) => w.titulo) });
        if (riesgos.length) anadirNota(this.docId, { kind: 'riesgo', text: `Riesgo fiscal aceptado al validar (${riesgos.length}): ${riesgos.map((w) => w.titulo).join(' · ')}`, files: [] });
        this.refrescarDocs();
        // FALTA: generar el asiento y enviarlo al software contable (Fase 6)
        this.toast(riesgos.length ? 'Factura validada con riesgo fiscal aceptado' : 'Factura validada', `Fecha contable ${f}. Datos de ejemplo: el asiento se enviará cuando exista la integración contable.`, 'success');
    }

    // ===== Navegación =====
    volverABandeja(e) {
        if (e) e.preventDefault();
        this.dispatchEvent(eventoNavegar({ vista: 'registro', bandejaId: this.bandejaId }));
    }

    irALista(e) {
        e.preventDefault();
        this.dispatchEvent(eventoNavegar({ vista: this.origen === 'ocr' ? 'ocr' : 'lista' }));
    }

    verEmpresa(e) {
        e.preventDefault();
        this.dispatchEvent(eventoNavegar({ vista: 'empresa', empresaId: this.v.doc.empresaId }));
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
