import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getBandeja from '@salesforce/apex/BandejaContableController.getBandeja';
import getDatosCliente from '@salesforce/apex/BandejaContableController.getDatosCliente';
import listarArchivosGoogle from '@salesforce/apex/BandejaContableController.listarArchivosGoogle';
import listarDocumentosGoogle from '@salesforce/apex/BandejaContableController.listarDocumentosGoogle';
import obtenerDocumentoGoogle from '@salesforce/apex/BandejaContableController.obtenerDocumentoGoogle';
import {
    documentosDeBandeja, datosExtraidos, datosEmpresa, aprenderRegla, cambiarEstadoDocumento, duplicadoDe, historicoProveedor,
    anadirNota, notasDe, tareasDe, correosDe, anadirCorreo, skillsDeEmpresa, skillActiva, guardarSkill, datosFinancieros,
    SOFTWARE_CLIENTE, MOTIVOS_NO_CONTABILIZAR
} from 'c/bandejaContableMock';
import {
    TIPOS_IVA, TIPOS_RETENCION, CODIGOS_TRANSACCION, nif as normalizarNif, porcentajeDeducible, contrapartidaPorDefecto,
    esExtranjero, sugerenciaDeducible, sumasIva, propuestaAsiento, riesgosFiscales, comprobaciones, conIncidencia, incidenciasContables,
    analisisIs, productos, consumoIa
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
    ['general', 'Datos'], ['chk', 'Check'], ['sk', 'Skills'], ['pf', 'Perfil fiscal'], ['is', 'Impuesto de Sociedades'], ['prod', 'Productos'],
    ['notas', 'Notas y Archivos'], ['tareas', 'Tareas'], ['mail', 'Correos'], ['iae', 'Actividades'], ['loc', 'Locales'], ['tur', 'Turismos'],
    ['tes', 'Tesorería'], ['gas', 'Análisis de gasto']
];
// Capas del documento (diseño v2 Híbrido): 1 · Inteligencia contable, 2 · Inteligencia fiscal y
// 3 · Inteligencia financiera. La barra solo muestra las pestañas de la capa activa; la 1 y la 3 recuerdan
// su última pestaña y la 2 se abre siempre en Check. El chat (Rosetta IA) no es una pestaña: se abre con
// su botón de la cabecera y ocupa el sitio de las capas y las pestañas.
const INTEL = ['chk', 'pf', 'is', 'iae', 'loc', 'tur'];
const FIN = ['tes', 'gas'];
const CHAT = 'chat';
const capaDe = (pestana) => (INTEL.includes(pestana) ? 'intel' : FIN.includes(pestana) ? 'fin' : 'ext');
// Cómo se resuelve una validación con riesgo fiscal
const RESOLUCIONES = [
    ['skill', 'Crear Skill para este cliente', 'Guarda el criterio como skill: las próximas facturas similares se validarán sin incidencia.'],
    ['cliente', 'Aceptación puntual con aceptación del cliente', 'Solo para esta factura. Se envía un email al cliente para que acepte el riesgo.'],
    ['otros', 'Otros', 'Indica el motivo por el que se valida pese al riesgo.']
];
const BOTON_RESOLUCION = { skill: 'Crear skill y validar', cliente: 'Enviar email y validar', otros: 'Aceptar riesgo y validar' };
const TIPO_SKILL = { Emitida: 'Emitidas', Recibida: 'Recibidas', Ticket: 'Tickets' };
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
// Buscador de cuentas: grupo con el que se abre según el campo (la contrapartida depende de la cuenta)
const GRUPO_CUENTA = { prov: 'Proveedores', asiento: 'Todas', extra: 'Todas' };
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
    @api inicioPagina; // { app, contenido }: dónde empiezan la app y su contenido en la página (bandejaContableApp)

    _documentoId;
    @api
    get documentoId() { return this._documentoId; }
    set documentoId(v) {
        this._documentoId = v;
        this.cerrarVentanas();
        if (this.docs) this.abrirDocumentoActual();
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
    ultimaPestana = { ext: 'general', intel: 'chk', fin: 'tes' };
    pestanaAntesDelChat = 'general';
    filtroChk = 'all'; // filtro con el que se abre Check
    cuentas = null; // buscador de cuentas abierto: { tipo, i, grupo, valor, soloCodigo, ancla }
    hover = null;
    productoResaltado = null;

    ncBorrador = null; // { motivo, comentario, avisar }
    avisoValidar = null; // validar con riesgo: { opt, skTitle, skText, to, subject, body, motivo }
    skillAbrir = null;
    ampliado = null; // visor ampliado abierto: { pagina, previo, estilo }

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
        await this.cargarDetalleDocumento();
        this.cargando = false;
        this.recalcular();
    }

    // El listado de documentos trae solo datos: el enlace firmado para verlo y los datos extraídos por la
    // IA se piden al abrir cada documento (y se guardan para no volver a pedirlos en la sesión).
    documentoGoogleActual() {
        const doc = this.docs.find((d) => d.id === this._documentoId) || this.docs[0];
        return doc && this.docsGoogle.find((g) => g.id === doc.id);
    }

    async cargarDetalleDocumento() {
        const g = this.documentoGoogleActual();
        if (!g || g.conDetalle) return;
        let cambios;
        try {
            const d = await obtenerDocumentoGoogle({ bandejaId: this.bandejaId, documentoId: g.id });
            cambios = { viewUrl: d.viewUrl, extraccion: d.extraccion, conDetalle: true };
        } catch (e) {
            cambios = { conDetalle: true, errorDetalle: mensajeError(e) };
        }
        this.docsGoogle = this.docsGoogle.map((x) => (x.id === g.id ? { ...x, ...cambios } : x));
        this.docs = documentosDeBandeja(this.detalle, this.docsGoogle);
    }

    async abrirDocumentoActual() {
        const g = this.documentoGoogleActual();
        if (g && !g.conDetalle) {
            this.cargando = true;
            await this.cargarDetalleDocumento();
            this.cargando = false;
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
        const x0 = base.x;
        const ed = this.edits[doc.id] || {};
        const emp = datosEmpresa(doc.empresaId);
        const cliente = this.cliente || {};
        const skillsEmpresa = skillsDeEmpresa({ id: doc.empresaId, nombre: cliente.nombre || this.detalle.resumen.empresa });
        const skills = skillsEmpresa.filter((s) => skillActiva(s)); // las inactivas no se aplican

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
                if (k === 'ctaProv') return { ...campo, soloLectura: true, titulo: 'Pulsa para buscar la cuenta', clase: 'doc-input doc-input-cuenta' };
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
        // Riesgo fiscal: lo que hay que aceptar (y resolver) al validar la factura
        const fiscal = riesgosFiscales({ x, regla, textoLineas, sumas, irpf, direccionesAfectas, duplicado, ivas });
        const partesFecha = String(val('fecha') || '').split('/');
        const checks = comprobaciones({
            x, ivas, tipo, regla, textoLineas, cliente, direccionesAfectas, duplicado, historico,
            mes: partesFecha.length === 3 ? MESES[Number(partesFecha[1]) - 1] : '',
            skills: skills.map((s) => s.num)
        });
        const checksMal = checks.filter(conIncidencia).length;
        const checksSkill = checks.filter((c) => !!c.skill).length; // pre-validadas por una skill del cliente
        const contables = incidenciasContables({ ivas, cuadra: Math.abs(diff) < 0.01, asientoCuadra: asientoOk });
        const is = analisisIs({ x, ivas, textoLineas, direccionesAfectas });
        const prods = productos(x0.lineas, x0.ivasDoc || x0.ivas);
        const conceptos = this.conceptos(ed.productos || this.conceptosBase(x0, prods), sumas.base);

        // ----- Aprendizaje: contrapartida cambiada a mano → regla del proveedor -----
        const cambiada = ivas.find((r) => r.contraManual && String(r.contra || '').trim());
        const estadoAprendizaje = this.aprendizaje[doc.id];
        const preguntar = !!cambiada && !estadoAprendizaje && (!regla || !String(cambiada.contra).startsWith(regla.cuenta));

        // ----- Visor -----
        const hl = {};
        Object.entries(ZONAS).forEach(([k, z]) => { hl[k] = marca(this.hover === k, z); });
        const ivaPreview = (x0.ivasDoc || x0.ivas).map((r, i) => ({ ...r, key: 'p' + i, estilo: marca(this.hover === 'iva' + i, AMARILLO) }));
        const lineasDoc = (x0.lineas || []).map((l, i) => ({ ...l, key: 'l' + i, estilo: marca(this.productoResaltado === i, AMARILLO) }));
        // Documento real de Google: su propio PDF (recortado si venía con otros); si no, el archivo subido
        const urlsArchivo = doc.google && doc.google.viewUrl ? { ver: doc.google.viewUrl, descargar: doc.google.viewUrl } : this.urls[doc.archivoId] || {};
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
        const contadores = {
            chk: checksMal + checksSkill, is: is.total, prod: prods.filas.length, notas, tareas: tareasPend, mail: correosDe(doc.id).length,
            iae: (cliente.actividades || []).length, loc: (cliente.locales || []).length, tur: emp.turismos.length, sk: skillsEmpresa.length
        };
        const rosetta = this.pestana === CHAT;
        const capa = capaDe(rosetta ? this.pestanaAntesDelChat : this.pestana);
        const consumo = consumoIa(base.consumo);
        const tiposCabecera = ['Emitida', 'Recibida', 'Ticket'].map((t) => ({ t, clase: 'doc-tipo' + (t === tipo ? ' ' + COLORES_TIPO[t] : '') }));

        this.v = {
            doc: { ...doc, estadoTxt: doc.motivo ? `${doc.estado} · ${doc.motivo}` : doc.estado, claseEstado: 'doc-estado doc-estado-' + (doc.estado === 'Contabilizado' ? 'ok' : bloqueado ? 'nc' : 'pend') },
            idx,
            pos: `${idx + 1} de ${this.docs.length}`,
            x: { ...x, lineas: lineasDoc },
            titulo: doc.google ? `${estadoDocumentoGoogle(doc.google).tipoTxt} ${doc.google.numeroFactura || doc.numero}` : `Factura ${val('numero')}`,
            google: doc.google ? this.lecturaGoogle(doc.google) : null,
            googleVisible: !!doc.google && this.pestana !== CHAT,
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
                // El diseño ya no muestra el consumo de IA en la cabecera: queda en el tooltip de la extracción
                extraccionTip: `Consumo de IA${base.real ? '' : ' (ejemplo)'}: ${consumo.tokens} tokens · ${consumo.coste}${consumo.tip ? '. ' + consumo.tip : ''}`
                    + (base.real ? '' : '. FALTA: fecha real del procesamiento (tabla procesamientos)'),
                software: cliente.softwareContable && cliente.softwareContable !== 'Otros' ? cliente.softwareContable : SOFTWARE_CLIENTE,
                softwareEjemplo: !(cliente.softwareContable && cliente.softwareContable !== 'Otros')
            },
            capasLista: this.capas(capa, contables, checksMal, checksSkill),
            contadorChk: checksMal + checksSkill,
            filtroChk: this.filtroChk,
            rosetta,
            claseRosetta: 'doc-boton-rosetta' + (rosetta ? ' doc-boton-rosetta-on' : ''),
            pestanas: PESTANAS.filter(([k]) => capaDe(k) === capa).map(([k, label]) => {
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
            enAnalisis: ['is', 'prod', 'tes', 'gas'].includes(this.pestana),
            enColaboracion: ['notas', 'tareas', 'mail', CHAT].includes(this.pestana),
            enSkills: this.pestana === 'sk',
            financiero: datosFinancieros(total),
            // Datos
            gruposCabecera: grupos.filter((g) => g.titulo !== 'Totales'),
            gruposTotales: grupos.filter((g) => g.titulo === 'Totales'),
            conceptos,
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
            fiscal,
            // Otras pestañas
            checks,
            is,
            productos: prods,
            perfilSinDatos: emp.perfilSinDatos,
            turismos: emp.turismos,
            contexto: { emisor: val('emisor'), nif: nifActual, total: val('total'), numero: val('numero'), empresa: cliente.nombre || this.detalle.resumen.empresa },
            tipo,
            // Vista de ejemplo del documento (bandejaContableDocPapel), en el visor y en el visor ampliado
            papel: {
                x: { ...x, lineas: lineasDoc }, hl, fijo: FIJO, ivaPreview, conCliente: !/SIMPL/i.test(x0.kind),
                clienteNombre: cliente.nombre || this.detalle.resumen.empresa, clienteCif: cliente.cif || this.detalle.resumen.cif
            },
            // Visor (bandejaContableVisor): el archivo real si lo hay; si no, la vista de ejemplo
            visor: {
                url: urlsArchivo.ver,
                mime,
                nombre: doc.google ? doc.google.nombre || doc.nombre : doc.archivoNombre || doc.nombre,
                descargaUrl: urlsArchivo.descargar,
                // Páginas del documento separado (Google lo recorta del PDF original)
                paginas: doc.google && doc.google.paginaFin ? doc.google.paginaFin - doc.google.paginaInicio + 1 : null
            },
            desdeOcr: this.origen === 'ocr',
            // Ventanas
            nc: nc ? { ...nc, motivos, claseOk: 'doc-boton-peligro' + (nc.motivo ? '' : ' doc-boton-bloqueado') } : null,
            claseBotonNc: 'doc-boton-nc' + (nc ? ' doc-boton-nc-on' : ''),
            avisoValidar: this.avisoValidar ? this.ventanaValidar(fiscal, val('emisor')) : null,
            cuentas: this.cuentas
        };
    }

    /** Ventana "Vas a validar con riesgo fiscal": riesgos y cómo se resuelven (skill, aceptación del cliente u otros) */
    ventanaValidar(fiscal, emisor) {
        const b = this.avisoValidar;
        const listo = b.opt === 'skill' ? !!b.skTitle.trim() && !!b.skText.trim()
            : b.opt === 'cliente' ? !!b.to.trim() && !!b.body.trim()
                : b.opt === 'otros' ? !!b.motivo.trim() : false;
        return {
            ...b,
            n: String(fiscal.length),
            riesgos: fiscal.map((w) => ({ clave: w.clave, tag: w.tag, titulo: w.titulo })),
            opciones: RESOLUCIONES.map(([k, label, sub]) => ({ k, label, sub, clase: 'doc-resolucion' + (b.opt === k ? ' doc-resolucion-on' : '') })),
            esSkill: b.opt === 'skill',
            esCliente: b.opt === 'cliente',
            esOtros: b.opt === 'otros',
            emisor,
            listo,
            noListo: !listo,
            boton: BOTON_RESOLUCION[b.opt] || 'Elige una opción',
            claseBoton: 'doc-boton-peligro' + (listo ? '' : ' doc-boton-bloqueado')
        };
    }

    /**
     * Tarjetas de las tres capas. Cada una dice si está "Pre-validada" o cuántas incidencias tiene:
     * 1 · contables (cuadres, cuotas y deducciones sin motivo), 2 · comprobaciones fiscales y operativas
     * (las resueltas por una skill del cliente no cuentan) y 3 · financiera (hoy de ejemplo, sin incidencias).
     */
    capas(capa, contables, fiscales, porSkill) {
        const tarjeta = (k, n, titulo, sub, incidencias, tip) => {
            const on = k === capa;
            return {
                k, n, titulo, sub, tip,
                on,
                badge: incidencias ? '⚠ ' + plural(incidencias, 'incidencia', 'incidencias') : '✓ Pre-validado',
                clase: 'doc-capa ' + (incidencias ? 'doc-capa-mal' : 'doc-capa-bien') + (on ? ' doc-capa-on' : ''),
                claseBadge: 'doc-capa-badge ' + (incidencias ? 'doc-capa-badge-mal' : 'doc-capa-badge-bien')
            };
        };
        const subFiscal = fiscales ? plural(fiscales, 'comprobación', 'comprobaciones') + ' con incidencias'
            : porSkill === 1 ? 'Incidencia validada por Skill del cliente'
                : porSkill ? `${porSkill} incidencias validadas por Skills del cliente` : 'Sin comentarios';
        return [
            tarjeta('ext', '1', 'Inteligencia contable', contables ? plural(contables, 'incidencia contable', 'incidencias contables') + ' · revisa los datos' : 'Sin comentarios', contables,
                'Datos, Skills, Productos, Notas y Archivos, Tareas y Correos'),
            tarjeta('intel', '2', 'Inteligencia fiscal', subFiscal, fiscales, 'Check, Perfil fiscal, Impuesto de Sociedades, Actividades, Locales y Turismos'),
            tarjeta('fin', '3', 'Inteligencia financiera', 'Sin comentarios', 0, 'Tesorería y Análisis de gasto (datos de ejemplo)')
        ];
    }

    /** Conceptos de partida: los que ha leído la IA; en un documento de ejemplo, los de su plantilla */
    conceptosBase(x0, prods) {
        if (x0.productos) return x0.productos.map((p) => ({ ...p }));
        return prods.filas.map((f) => ({ descripcion: f.desc, cantidad: num(f.cantidad), precio_unitario: num(f.unitario), tipo_iva: num(f.pct), importe: num(f.importe) }));
    }

    /** Sección "Conceptos": filas editables y comprobación contra la base imponible */
    conceptos(lista, base) {
        const n = (v) => (v === null || v === undefined || v === '' ? '' : euros(v));
        const cant = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 3 }));
        const suma = lista.reduce((a, c) => a + (Number(c.importe) || 0), 0);
        const diff = suma - base;
        const cuadra = Math.abs(diff) <= 0.05;
        return {
            hay: lista.length > 0,
            resumen: lista.length === 1 ? '1 concepto' : `${lista.length} conceptos`,
            filas: lista.map((c, i) => {
                const calc = Number(c.cantidad) && Number(c.precio_unitario) ? Number(c.cantidad) * Number(c.precio_unitario) : null;
                // Cantidad × precio muy distinto del importe: se marca (puede ser un descuento o un error de lectura)
                const raro = calc !== null && c.importe !== null && c.importe !== undefined && Math.abs(calc - Number(c.importe)) > Math.max(0.05, Math.abs(calc) * 0.02);
                return {
                    i, key: 'c' + i,
                    descripcion: c.descripcion || '',
                    cantidad: cant(c.cantidad),
                    precio: n(c.precio_unitario),
                    tipoIva: c.tipo_iva === null || c.tipo_iva === undefined ? '' : String(c.tipo_iva),
                    importe: n(c.importe),
                    claseImporte: 'doc-iva-input' + (raro ? ' doc-iva-aviso' : ''),
                    clase: 'doc-concepto-fila' + (this.productoResaltado === i ? ' doc-iva-fila-on' : '')
                };
            }),
            suma: euros(suma),
            cuadre: cuadra ? 'Los conceptos suman la base imponible.'
                : `Los conceptos suman ${euros(suma)} € y la base imponible es ${euros(base)} € (diferencia ${euros(diff)} €): revisa descuentos, portes o líneas sin leer.`,
            claseCuadre: 'doc-nota ' + (cuadra ? 'doc-verde' : 'doc-concepto-aviso')
        };
    }

    conceptosActuales() {
        const ed = this.edits[this.docId] || {};
        if (ed.productos) return ed.productos.map((c) => ({ ...c }));
        const x0 = datosExtraidos(this.v.doc).x;
        return this.conceptosBase(x0, productos(x0.lineas, x0.ivasDoc || x0.ivas));
    }

    handleConcepto(e) {
        const lista = this.conceptosActuales();
        const { i, k } = e.target.dataset;
        lista[Number(i)][k] = k === 'descripcion' ? e.target.value : e.target.value === '' ? null : num(e.target.value);
        this.editar({ productos: lista });
    }

    quitarConcepto(e) {
        this.editar({ productos: this.conceptosActuales().filter((_, j) => j !== Number(e.currentTarget.dataset.i)) });
    }

    anadirConcepto() {
        this.editar({ productos: [...this.conceptosActuales(), { descripcion: '', cantidad: 1, precio_unitario: null, tipo_iva: 21, importe: null }] });
    }

    entrarConcepto(e) {
        this.productoResaltado = Number(e.currentTarget.dataset.i);
        this.recalcular();
    }

    salirConcepto() {
        this.productoResaltado = null;
        this.recalcular();
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
            dudas: (g.dudas || []).join(' · '),
            conExtraccion: !!g.extraccion,
            motor: g.motor ? g.motor.replace('vertex/', '') : ''
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
        }
        const s2 = r.sk2 && skills.find((k) => k.num === r.sk2);
        if (s2) chips.push({ key: s2.num, label: `${s2.num} · ${s2.short || s2.title}`, tip: `${s2.title}: ${s2.text}`, num: s2.num });
        else if (!chips.length) {
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

    // ===== Capas y pestañas =====
    elegirPestana(e) {
        this.irAPestana(e.currentTarget.dataset.k);
    }

    /** Cambia de pestaña (y de capa si hace falta), recordando la última pestaña de cada capa */
    irAPestana(pestana) {
        if (this.pestana !== CHAT) this.ultimaPestana = { ...this.ultimaPestana, [capaDe(this.pestana)]: this.pestana };
        this.pestana = pestana;
        this.dedAbierto = null;
        this.cuentas = null;
        this.recalcular();
    }

    /**
     * La capa 2 se abre siempre en Check (con el filtro "Con incidencias" si hay algo que mirar);
     * las otras, en su última pestaña.
     */
    irACapa(capa) {
        if (capa === 'intel') {
            this.filtroChk = this.v.contadorChk > 0 ? 'bad' : 'all';
            this.irAPestana('chk');
            return;
        }
        if (this.pestana !== CHAT && capaDe(this.pestana) === capa) return;
        this.irAPestana(this.ultimaPestana[capa]);
    }

    elegirCapa(e) {
        this.irACapa(e.currentTarget.dataset.k);
    }

    // ===== Rosetta IA (chat sobre la factura) =====
    toggleRosetta() {
        if (this.pestana === CHAT) {
            this.volverDeRosetta();
            return;
        }
        this.pestanaAntesDelChat = this.pestana;
        this.irAPestana(CHAT);
    }

    volverDeRosetta() {
        this.irAPestana(this.pestanaAntesDelChat || 'general');
    }

    // ===== Buscador de cuentas contables =====
    abrirCuentas(e) {
        const el = e.currentTarget;
        const { tipo, i } = el.dataset;
        const valor = el.value || '';
        const grupo = tipo === 'iva' ? (String(valor).trim().startsWith('7') ? 'Ingresos' : 'Gastos') : GRUPO_CUENTA[tipo];
        const r = el.getBoundingClientRect();
        this.cuentas = {
            tipo, i: Number(i), grupo, valor, soloCodigo: tipo === 'asiento' || tipo === 'extra',
            ancla: { top: r.top, bottom: r.bottom, left: r.left, width: r.width }
        };
        this.recalcular();
    }

    clickCampo(e) {
        if (e.currentTarget.dataset.k === 'ctaProv') this.abrirCuentas(e);
    }

    elegirCuenta(e) {
        const { tipo, i } = this.cuentas;
        const valor = e.detail.valor;
        this.cuentas = null;
        if (tipo === 'iva') {
            const ivas = this.ivasActuales();
            ivas[i].contra = valor;
            ivas[i].contraManual = true;
            this.editar({ ivas });
        } else if (tipo === 'prov') {
            this.editar({ ctaProv: valor });
        } else if (tipo === 'asiento') {
            const actual = this.asientoEd[this.docId] || {};
            this.asientoEd = { ...this.asientoEd, [this.docId]: { ...actual, [i]: { ...(actual[i] || {}), cuenta: valor } } };
            this.recalcular();
        } else {
            const lineas = (this.lineasExtra[this.docId] || []).map((l) => ({ ...l }));
            lineas[i].cuenta = valor;
            this.lineasExtra = { ...this.lineasExtra, [this.docId]: lineas };
            this.recalcular();
        }
    }

    cerrarCuentas() {
        this.cuentas = null;
        this.recalcular();
    }

    alCambiarColaboracion() { this.recalcular(); }

    alCambiarSkills(e) {
        if (e.detail && e.detail.mensaje) this.toast(e.detail.mensaje, 'Datos de ejemplo: se mantiene solo en esta sesión.', 'success');
        this.recalcular();
    }

    abrirChip(e) {
        const numero = e.currentTarget.dataset.num;
        this.skillAbrir = numero ? { num: numero, t: Date.now() } : null;
        this.irAPestana('sk');
    }

    cerrarVentanas() {
        this.ncBorrador = null;
        this.avisoValidar = null;
        this.dedAbierto = null;
        this.dedError = {};
        this.cuentas = null;
    }

    // ===== Visor =====
    /**
     * "Ampliar" o la lupa del visor: panel fijo a la ventana (no depende del scroll de la página, así que se abre
     * igual desde cualquier posición y sin mover la página) sobre la mitad izquierda, desde justo debajo del menú
     * hasta el borde inferior. Arriba: debajo de la barra "Gestión Contable" si se ve; si la página ya ha bajado,
     * debajo de la cabecera de Salesforce (posiciones medidas por la app, no supuestas). En pantallas estrechas,
     * donde la mitad no sería más grande que el visor, ocupa casi todo el ancho.
     */
    ampliarDocumento(e) {
        const d = e.detail || {};
        this.ampliado = { pagina: d.pagina, previo: d.previo, estilo: this.posicionAmpliado() };
        if (!this.alRedimensionar) {
            this.alRedimensionar = () => { if (this.ampliado) this.ampliado = { ...this.ampliado, estilo: this.posicionAmpliado() }; };
            window.addEventListener('resize', this.alRedimensionar);
        }
    }

    posicionAmpliado() {
        const margen = 16;
        const W = window.innerWidth, H = window.innerHeight, s = window.scrollY || 0;
        const inicio = this.inicioPagina || {};
        const app = inicio.app || 0, contenido = inicio.contenido || app;
        const top = Math.round(Math.max(contenido - s, app, 0));
        const visor = this.template.querySelector('.doc-visor');
        const r = visor ? visor.getBoundingClientRect() : { left: margen, width: W / 3 };
        let ancho = Math.round(W / 2 - r.left - margen);
        if (ancho < r.width * 1.3) ancho = W - 2 * margen;
        const left = Math.round(Math.max(margen, Math.min(r.left, W - ancho - margen)));
        return `top:${top}px;left:${left}px;width:${ancho}px;height:${Math.max(320, H - top - margen)}px`;
    }

    cerrarAmpliado() {
        this.ampliado = null;
    }

    disconnectedCallback() {
        if (this.alRedimensionar) window.removeEventListener('resize', this.alRedimensionar);
        this.alRedimensionar = null;
    }

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
        if (this.v.fiscal.length) {
            this.abrirValidarConRiesgo();
            return;
        }
        this.contabilizar([]);
    }

    /** Borrador de la ventana de validar con riesgo, con los textos propuestos del diseño */
    abrirValidarConRiesgo() {
        const riesgos = this.v.fiscal;
        const { emisor, nif: nifProv, numero, total } = this.v.contexto;
        const titulos = riesgos.map((w) => w.titulo).join(' · ');
        this.avisoValidar = {
            opt: null,
            skTitle: `${String(emisor || '').split(' ')[0]}: ${riesgos[0] ? riesgos[0].titulo : 'criterio'}`,
            skText: `En las facturas de ${emisor} (${nifProv}): ${titulos}. Criterio aceptado por el despacho; aplícalo sin marcar incidencia.`,
            to: '', // FALTA: email del cliente (no está en los datos de Salesforce que se leen hoy)
            subject: `Aceptación de riesgo fiscal · factura ${numero || ''}`.trim(),
            body: `Hola,\n\nAl revisar la factura ${numero || ''} de ${emisor} (${total} €) hemos detectado este riesgo fiscal: ${titulos}.\n\n`
                + 'Para contabilizarla tal y como está necesitamos que nos confirmes que aceptas el riesgo respondiendo a este correo.\n\nGracias.',
            motivo: ''
        };
        this.recalcular();
    }

    elegirResolucion(e) {
        this.avisoValidar = { ...this.avisoValidar, opt: e.currentTarget.dataset.opt };
        this.recalcular();
    }

    handleResolucion(e) {
        this.avisoValidar = { ...this.avisoValidar, [e.target.dataset.k]: e.target.value };
        this.recalcular();
    }

    cancelarValidar() {
        this.avisoValidar = null;
        this.recalcular();
    }

    /** Valida aceptando el riesgo, resuelto con una skill nueva, con la aceptación del cliente o con un motivo */
    aceptarRiesgo() {
        const w = this.v.avisoValidar;
        if (!w || !w.listo) return;
        const riesgos = this.v.fiscal;
        let como;
        if (w.opt === 'skill') {
            // DE EJEMPLO como el resto de skills (bandejaContableMock): la IA la aplicará cuando existan en Cloud SQL
            const s = guardarSkill({
                title: w.skTitle.trim(), text: w.skText.trim(), html: '', activa: true, fin: '',
                nif: this.v.contexto.nif, prov: this.v.contexto.emisor, tipo: TIPO_SKILL[this.v.tipo] || 'Todas',
                emps: [{ id: this.v.doc.empresaId, nombre: this.v.contexto.empresa }], grps: []
            });
            como = `Resuelto con nueva skill ${s.num} «${s.title}»`;
        } else if (w.opt === 'cliente') {
            // FALTA: enviar el correo de verdad; queda anotado en la pestaña Correos
            anadirCorreo(this.docId, { to: w.to.trim(), subject: w.subject.trim(), body: w.body.trim() });
            como = `Aceptación puntual del cliente · email a ${w.to.trim()}`;
        } else {
            como = `Otros · ${w.motivo.trim()}`;
        }
        this.avisoValidar = null;
        this.contabilizar(riesgos, como);
    }

    contabilizar(riesgos, como) {
        const f = hoy();
        cambiarEstadoDocumento(this.docId, 'Contabilizado', { fechaValidacion: f, riesgoAceptado: riesgos.map((w) => w.titulo), resolucion: como || null });
        if (riesgos.length) {
            anadirNota(this.docId, { kind: 'riesgo', text: `Riesgo fiscal aceptado al validar (${riesgos.length}): ${riesgos.map((w) => w.titulo).join(' · ')}${como ? ' — ' + como : ''}`, files: [] });
        }
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
