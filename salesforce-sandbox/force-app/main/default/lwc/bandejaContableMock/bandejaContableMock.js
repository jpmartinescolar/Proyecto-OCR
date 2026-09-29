/*
 * DATOS DE EJEMPLO de la Bandeja Contable (diseño v2 de Claude Design, docs/diseno.md).
 *
 * Aquí está TODO lo que la pantalla necesita y todavía no existe. Cada bloque indica qué falta y de
 * dónde saldrá. Las funciones exportadas tienen la forma de datos que devolverá la API real: cuando
 * exista, se sustituye cada función por una llamada a Apex y las pantallas no deberían cambiar.
 *
 * Los cambios que hace el usuario (validar, no contabilizar, notas, tareas, skills…) se guardan solo
 * en memoria mientras la página está abierta.
 *
 * Datos REALES que NO están aquí (vienen de Salesforce con BandejaContableController.getDatosCliente):
 * perfil fiscal del contrato, modelos que presenta, domicilio fiscal, IAE, locales afectos, vinculados.
 */

// FALTA: software contable de destino por cliente. En Salesforce solo hay Account.Software_gesti_n_Despachos__c
// (casi siempre vacío u "Otros"); cuando venga relleno se usa ese valor y esto es solo el respaldo.
export const SOFTWARE_CLIENTE = 'a3ERP · Contabilidad';

export const TIPOS_FACTURA = ['Recibida', 'Emitida', 'Ticket'];

// Estado contable del documento (decisión del asesor). FALTA: tabla de confirmaciones en Cloud SQL (Fase 2-3).
export const ESTADOS_DOCUMENTO = ['Pendiente', 'Contabilizado', 'No contabilizado'];

export const MOTIVOS_NO_CONTABILIZAR = [
    ['Duplicada', 'Ya existe otra factura con el mismo NIF, número e importe'],
    ['No deducible', 'Inmueble o vehículo no afecto, gasto personal…'],
    ['No corresponde a la empresa', 'Otro destinatario u otro NIF'],
    ['Documento ilegible o incompleto', 'No se pueden leer los datos obligatorios'],
    ['Falta documentación', 'Se pide al cliente lo que falta'],
    ['No es una factura', 'Albarán, presupuesto o proforma'],
    ['Ya contabilizada en destino', 'Existe en el software de contabilidad'],
    ['Otro', 'Indica el motivo en el comentario']
];

// ===== Datos extraídos (plantillas del diseño) =====
// FALTA: extracción con IA (Fase 2). Cada plantilla tiene la forma de lo que guardará la tabla
// `extracciones`: campos, desglose de IVA por línea (contrapartida, deducibilidad, R.E., retención,
// código de transacción, skill aplicada), productos, divisa, confianza y consumo de IA.
const PLANTILLAS = [
    {
        x: {
            kind: 'FACTURA', emisor: 'Endesa Energía S.A.U.', nif: 'A81948077', dir: 'C/ Ribera del Loira 60, 28042 Madrid',
            sumin: 'C/ Alcalá 245, 3º B, 28028 Madrid', ctaProv: '4000001 Endesa Energía S.A.U.', numero: 'FE26-0312894',
            cp: '28042', fecha: '05/03/2026', devengo: '28/02/2026', irpf: '0,00', total: '221,08', cuenta: '628 Suministros',
            ivasDoc: [{ base: '175,16', pct: '21', cuota: '36,78' }, { base: '9,14', pct: '0', cuota: '0,00' }],
            // La skill SK-002 del cliente reparte cada línea 70/30 entre dos cuentas; SK-006 deja el IVA al 30 %
            ivas: [
                { base: '122,61', pct: '21', cuota: '25,75', contra: '6280000 Suministros taller', sk: 'SK-002', skPart: '70 %', docIdx: 0, ded: '30', dedMot: 'SK-006 · Endesa: IVA deducible al 30 %', sk2: 'SK-006' },
                { base: '52,55', pct: '21', cuota: '11,03', contra: '6280002 Suministros oficina', sk: 'SK-002', skPart: '30 %', docIdx: 0, ded: '30', dedMot: 'SK-006 · Endesa: IVA deducible al 30 %', sk2: 'SK-006' },
                { base: '6,40', pct: '0', cuota: '0,00', contra: '6280000 Suministros taller', sk: 'SK-002', skPart: '70 %', docIdx: 1 },
                { base: '2,74', pct: '0', cuota: '0,00', contra: '6280002 Suministros oficina', sk: 'SK-002', skPart: '30 %', docIdx: 1 }
            ],
            lineas: [{ c: 'Término de potencia', i: '62,14 €' }, { c: 'Término de energía', i: '113,02 €' }, { c: 'Impuesto eléctrico', i: '9,14 €' }]
        },
        conf: { emisor: 99, nif: 98, numero: 97, fecha: 99, irpf: 99, total: 99, cuenta: 91 },
        consumo: { entrada: 18420, salida: 2310, coste: 0.0214 }
    },
    {
        x: {
            kind: 'FACTURA SIMPL.', emisor: 'Repsol Comercial S.A.', nif: 'A80298839', dir: 'E.S. Km 23 A-3, Arganda',
            ctaProv: '4000002 Repsol Comercial S.A.', numero: 'T-0098213', cp: '28500', fecha: '12/03/2026', devengo: '12/03/2026',
            irpf: '0,00', total: '60,00', cuenta: '622 Reparaciones',
            ivasDoc: [{ base: '49,59', pct: '21', cuota: '10,41' }],
            // Sin contrapartida: la propone la regla del proveedor (cuenta 6280001)
            ivas: [{ base: '49,59', pct: '21', cuota: '10,41' }],
            lineas: [{ c: 'Gasóleo A · 38,2 L', i: '60,00 €' }]
        },
        conf: { emisor: 88, nif: 62, numero: 74, fecha: 93, irpf: 90, total: 96, cuenta: 58 },
        alerta: 'Revisa los campos marcados: el NIF y la cuenta contable tienen confianza baja.', alertaTono: 'warn',
        consumo: { entrada: 9850, salida: 1420, coste: 0.0118 }
    },
    {
        x: {
            kind: 'FACTURA', emisor: 'Amazon EU S.à r.l.', nif: 'W0184081H', dir: '38 Av. John F. Kennedy, Luxemburgo',
            ctaProv: '4000003 Amazon EU S.à r.l.', numero: 'ES6A1B2C3D', cp: 'L-1855', fecha: '18/03/2026', devengo: '16/03/2026',
            // Factura en dólares: importe original y tipo de cambio aplicado (editable)
            moneda: 'USD', simb: '$', totalOrig: 125.09, fxRate: '0,95889',
            irpf: '0,00', total: '119,95', cuenta: '602 Compras otros aprov.',
            ivasDoc: [{ base: '54,00', pct: '21', cuota: '11,34' }, { base: '41,00', pct: '10', cuota: '4,10' }],
            ivas: [
                { base: '54,00', pct: '21', cuota: '11,34' },
                { base: '41,00', pct: '10', cuota: '4,10' }
            ],
            lineas: [{ c: 'Juego llaves combinadas · 1 ud', i: '54,00 €' }, { c: 'Guantes nitrilo (caja) · 2 ud', i: '41,00 €' }]
        },
        conf: { emisor: 96, nif: 90, numero: 48, fecha: 97, irpf: 85, total: 94, cuenta: 52 },
        alerta: 'El cuadre de importes no coincide. Revisa el desglose de IVA antes de validar.', alertaTono: 'err',
        consumo: { entrada: 14210, salida: 1980, coste: 0.0171 }
    }
];

const CATEGORIA_POR_TIPO = { Recibida: 'Compras', Emitida: 'Ventas', Ticket: 'Tickets' };

// Estado contable cambiado por el usuario en esta sesión: id → { estado, motivo, fechaValidacion, riesgoAceptado }
const ESTADOS = new Map();

function hash(texto) {
    let h = 0;
    const s = String(texto || '');
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

function clonar(o) {
    return JSON.parse(JSON.stringify(o));
}

// FALTA: el desglose real lo hace el procesador de Google (Fase 1). Mientras tanto un archivo "se
// separa" en documentos de forma determinista para que la pantalla tenga contenido.
function partes(archivo) {
    const n = String(archivo.nombre || '').toLowerCase();
    if (n.endsWith('.zip')) return 3;
    if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 2;
    if (n.endsWith('.pdf')) return hash(archivo.id) % 3 === 0 ? 2 : 1;
    return 1;
}

function estadoInicial(id, bandeja) {
    if (bandeja.estado === 'Completado') return { estado: 'Contabilizado' };
    const h = hash(id + 'estado') % 10;
    if (h === 0) return { estado: 'No contabilizado', motivo: 'Documento ilegible o incompleto' };
    if (h <= 2) return { estado: 'Contabilizado' };
    return { estado: 'Pendiente' };
}

/**
 * Documentos OCR de una bandeja (BandejaDetalleDTO de Apex).
 * Si Google ya ha separado el contenido (docsGoogle, de listarDocumentosGoogle) se usan esos documentos
 * REALES: id, nombre, páginas, tipo y lectura preliminar. Lo que sigue siendo de ejemplo es el detalle
 * contable (plantilla) hasta la extracción de la Fase 2.
 * Sin documentos de Google, se inventan a partir de los archivos subidos (comportamiento anterior).
 */
export function documentosDeBandeja(detalle, docsGoogle) {
    const b = detalle.resumen;
    if (docsGoogle && docsGoogle.length) return docsGoogle.map((g) => desdeGoogle(g, detalle));
    const docs = [];
    (detalle.archivos || []).filter((a) => a.estado === 'Sincronizado').forEach((a) => {
        const n = partes(a);
        const esImagen = /\.(png|jpe?g)$/i.test(a.nombre || '');
        const base = String(a.nombre || 'archivo').replace(/\.[^.]+$/, '');
        for (let k = 0; k < n; k++) {
            const id = `${a.id}-${k}`;
            const plantilla = b.tipoValor === 'Ticket' ? 1 : hash(id) % PLANTILLAS.length;
            const est = ESTADOS.get(id) || estadoInicial(id, b);
            docs.push({
                id,
                numero: 'DOC-' + String(100000 + (hash(id) % 900000)),
                nombre: n > 1 ? `${base}_${k + 1}.pdf` : a.nombre,
                formato: esImagen ? (/\.png$/i.test(a.nombre) ? 'PNG' : 'JPG') : 'PDF',
                tipo: b.tipoValor === 'Ticket' ? 'Ticket' : b.tipoValor === 'Emitida' ? 'Emitida' : 'Recibida',
                categoria: CATEGORIA_POR_TIPO[b.tipoValor] || 'Compras',
                estado: est.estado,
                motivo: est.motivo || null,
                fechaValidacion: est.fechaValidacion || null,
                plantilla,
                archivoId: a.id,
                archivoNombre: a.nombre,
                archivoMime: a.mime,
                archivoFecha: a.fecha,
                bandejaId: b.id,
                bandejaNumero: b.numero,
                empresaId: b.empresaId,
                empresa: b.empresa,
                origen: b.origen,
                fecha: b.fecha
            });
        }
    });
    return docs;
}

// FALTA: la situación fiscal de cada documento la calculará el motor de comprobaciones sobre los datos
// extraídos (Fase 4) y se guardará con el documento. En el listado se usa esta de ejemplo por plantilla.
const SITUACION = [
    { tipo: 'IVA', motivo: 'Inmueble no afecto', importe: 39.58 },
    { tipo: 'IVA', motivo: 'Ticket sin NIF destinatario', importe: 10.41 },
    { tipo: 'Duplicado', motivo: 'Posible duplicado de DOC-000436', importe: 119.95 }
];

/** Situación fiscal de ejemplo de un documento: null si no tiene riesgo */
export function situacionFiscal(doc) {
    // Una de cada cuatro facturas sale "sin riesgo" para que el filtro tenga contenido
    return hash(doc.id + 'sit') % 4 === 0 ? null : SITUACION[doc.plantilla];
}

const TIPO_POR_DOC = { FACTURA_SIMPLIFICADA: 'Ticket' };

/** Documento real de Google con la forma que esperan las pantallas */
function desdeGoogle(g, detalle) {
    const b = detalle.resumen;
    const archivo = (detalle.archivos || []).find((a) => a.id === g.sfArchivoId) || {};
    const tipo = TIPO_POR_DOC[g.tipo] || (b.tipoValor === 'Emitida' ? 'Emitida' : b.tipoValor === 'Ticket' ? 'Ticket' : 'Recibida');
    // Estado contable: el que haya decidido el asesor en la sesión; si no, Pendiente (FALTA: tabla confirmaciones)
    const est = ESTADOS.get(g.id) || { estado: b.estado === 'Completado' ? 'Contabilizado' : 'Pendiente' };
    const ext = String(g.nombre || '').split('.').pop().toUpperCase();
    return {
        id: g.id,
        numero: 'D' + String(g.numero).padStart(2, '0'),
        nombre: g.nombre,
        formato: ext === 'JPG' || ext === 'PNG' ? ext : 'PDF',
        tipo,
        categoria: CATEGORIA_POR_TIPO[tipo] || 'Compras',
        estado: est.estado,
        motivo: est.motivo || null,
        fechaValidacion: est.fechaValidacion || null,
        // El detalle contable sigue siendo de ejemplo: plantilla por hash, la de ticket para tickets
        plantilla: tipo === 'Ticket' ? 1 : hash(g.id) % PLANTILLAS.length,
        archivoId: g.sfArchivoId,
        archivoNombre: g.archivoSubido,
        archivoMime: ext === 'JPG' ? 'image/jpeg' : ext === 'PNG' ? 'image/png' : 'application/pdf',
        archivoFecha: archivo.fecha,
        bandejaId: b.id,
        bandejaNumero: b.numero,
        empresaId: b.empresaId,
        empresa: b.empresa,
        origen: b.origen,
        fecha: b.fecha,
        google: g
    };
}

export function cambiarEstadoDocumento(id, estado, extra = {}) {
    ESTADOS.set(id, { estado, ...extra });
}

/** Datos extraídos por la IA de un documento (plantilla del diseño) y su consumo de IA */
export function datosExtraidos(doc) {
    const real = doc.google && doc.google.extraccion ? desdeExtraccion(JSON.parse(doc.google.extraccion)) : null;
    if (real) return real;
    const p = clonar(PLANTILLAS[doc.plantilla]);
    return { x: p.x, conf: p.conf, alerta: p.alerta || null, alertaTono: p.alertaTono || null, consumo: p.consumo, real: false };
}

// ===== Datos REALES extraídos por la IA (tabla extracciones de Google) =====

const KIND = { FACTURA: 'FACTURA', FACTURA_SIMPLIFICADA: 'FACTURA SIMPL.', RECTIFICATIVA: 'FACTURA RECTIFICATIVA', ALBARAN: 'ALBARÁN', PRESUPUESTO: 'PRESUPUESTO' };
const ALERTAS = {
    DESCUADRE: ['Σ bases + Σ cuotas − retención no coincide con el total leído: revisa el desglose de IVA.', 'err'],
    LECTURA_DISCREPANTE: ['El total extraído no coincide con el leído al separar: comprueba los importes (¿coma decimal?).', 'err'],
    NO_CORRESPONDE_EMPRESA: ['El NIF del destinatario no es el de la empresa de la bandeja.', 'err'],
    BAJA_CONFIANZA: ['Algún dato se ha leído con confianza baja: revísalo antes de validar.', 'warn']
};

const importeEs = (n) => (n === null || n === undefined ? '' : Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (n) => (n === null || n === undefined ? '0' : String(Number(n)));

/** Extracción de Google → la forma de datos de las pantallas (la misma que las plantillas de ejemplo) */
export function desdeExtraccion(ext) {
    const d = (ext && ext.datos) || {};
    const emisor = d.emisor || {};
    const lineas = d.lineas_iva || [];
    const ivas = lineas.map((l) => ({
        base: importeEs(l.base),
        pct: pct(l.tipo),
        cuota: importeEs(l.cuota),
        ...(l.cuota_recargo ? { re: importeEs(l.cuota_recargo) } : {})
    }));
    const ret = d.retencion || {};
    const c = d.confianzas || {};
    const pc = (v) => (v === null || v === undefined ? undefined : Math.round(Number(v) * 100));
    const motivo = (ext.motivos || []).find((m) => ALERTAS[m]);
    return {
        real: true,
        motor: ext.motor,
        x: {
            kind: KIND[d.tipo] || 'FACTURA',
            emisor: emisor.nombre || '',
            nif: emisor.nif || '',
            dir: [emisor.direccion, emisor.codigo_postal].filter(Boolean).join(' '),
            cp: emisor.codigo_postal || '',
            sumin: d.direccion_suministro || null,
            ctaProv: '', // FALTA: cuenta de proveedor del plan del cliente (Sage)
            numero: d.numero || '',
            fecha: d.fecha_emision || '',
            devengo: d.fecha_operacion || d.fecha_emision || '',
            irpf: importeEs(ret.importe || 0),
            total: importeEs(d.total),
            cuenta: '', // FALTA: la cuenta de gasto la propondrán las reglas y skills del cliente
            exMen: d.mencion_exencion || null,
            rectRef: d.factura_rectificada || null,
            ivasDoc: ivas.map((r) => ({ ...r })),
            ivas,
            // Conceptos tal como los ha leído la IA (la sección Conceptos de la pestaña Datos los edita)
            productos: (d.productos || []).map((p) => ({ descripcion: p.descripcion || '', cantidad: p.cantidad, precio_unitario: p.precio_unitario, tipo_iva: p.tipo_iva, importe: p.importe })),
            lineas: (d.productos || []).map((p) => ({
                c: (p.descripcion || 'Producto') + (p.cantidad && Number(p.cantidad) !== 1 ? ` · ${Number(p.cantidad).toLocaleString('es-ES')} ud` : ''),
                i: importeEs(p.importe) + ' €'
            }))
        },
        conf: { emisor: pc(c.emisor), nif: pc(c.emisor), numero: pc(c.numero), fecha: pc(c.fechas), irpf: pc(c.lineas_iva), total: pc(c.total) },
        alerta: motivo ? ALERTAS[motivo][0] : null,
        alertaTono: motivo ? ALERTAS[motivo][1] : null,
        consumo: { entrada: ext.tokensEntrada || 0, salida: ext.tokensSalida || 0, coste: ext.coste || 0 }
    };
}

// FALTA: detección real de duplicados (mismo NIF + nº de factura + importe) sobre las facturas ya
// confirmadas en Cloud SQL (Fase 2). De ejemplo: la plantilla de Amazon aparece como posible duplicado.
export function duplicadoDe(doc) {
    return doc.plantilla === 2 ? { id: 'DOC-000436', fecha: '18/03/2026', origen: 'Email', bandeja: 'BC-000117' } : null;
}

// FALTA: histórico de facturas del proveedor (media de 6 meses) desde las confirmaciones en Cloud SQL.
const HISTORICO = {
    A81948077: { media: 180, meses: [['Sep', 172.4], ['Oct', 168.9], ['Nov', 191.3], ['Dic', 204.8], ['Ene', 198.1], ['Feb', 186.5]] },
    A80298839: { media: 62, meses: [['Sep', 58], ['Oct', 64], ['Nov', 60], ['Dic', 55], ['Ene', 66], ['Feb', 61]] },
    W0184081H: { media: 45, meses: [['Sep', 38.9], ['Oct', 52.3], ['Nov', 29.4], ['Dic', 41.2], ['Ene', 47.8], ['Feb', 44.1]] }
};
export function historicoProveedor(nif) {
    return HISTORICO[String(nif || '').trim().toUpperCase()] || null;
}

// ===== Datos del cliente que NO existen en Salesforce =====
// (Lo que sí existe viene de getDatosCliente: ver BandejaContableClienteService.cls)
const EMPRESA_INICIAL = {
    // FALTA en Salesforce: régimen de IVA, prorrata y ROI (no hay campos). Se muestran como ejemplo.
    perfilSinDatos: [
        ['Régimen de IVA', 'General'], ['Prorrata', 'No aplica'], ['Criterio de caja', 'No'],
        ['Recargo de equivalencia', 'No'], ['Operador intracomunitario (ROI)', 'Sí · alta 2019']
    ],
    // FALTA en Salesforce: turismos del cliente con % de afectación (Elemento_de_Transporte__c no se
    // enlaza con Account). Pendiente de decidir dónde se registran.
    turismos: [
        ['4521-LKM', 'Volkswagen Caddy Cargo 2.0 TDI (comercial)', '2180000', '12/03/2022', 24800, 8680, 100, 'Grúa y asistencia a clientes'],
        ['8834-MBX', 'Toyota Corolla Hybrid 140H', '2180001', '05/09/2023', 27500, 6187.5, 50, 'Administrador · uso mixto'],
        ['2290-NFT', 'Ford Transit Custom (furgón)', '2180002', '18/01/2025', 36900, 3690, 100, 'Recogida de piezas y recambios']
    ],
    // FALTA: reglas por proveedor y de validación (Cloud SQL, Fase 2). Se aprenden de las correcciones.
    reglas: [
        { nif: 'A81948077', prov: 'Endesa Energía S.A.U.', cuenta: '6280000', desc: 'Suministros', iva: '21 %', ded: 100, note: '', origen: 'Manual', on: true },
        { nif: 'A80298839', prov: 'Repsol Comercial S.A.', cuenta: '6280001', desc: 'Combustible furgoneta', iva: '21 %', ded: 100, note: 'Vehículo afecto al 100 % (furgoneta del taller)', veh100: true, origen: 'Aprendida', on: true },
        { nif: 'W0184081H', prov: 'Amazon EU S.à r.l.', cuenta: '6020000', desc: 'Material de taller', iva: '21 % / 10 %', ded: 100, note: 'Repercute IVA español: no procede autorrepercusión', noIntra: true, origen: 'Aprendida', on: true },
        { nif: 'A82018474', prov: 'Telefónica de España S.A.U.', cuenta: '6290000', desc: 'Comunicaciones', iva: '21 %', ded: 100, note: '', origen: 'Manual', on: true },
        { nif: 'B91234567', prov: 'Recambios Auto Sur S.L.', cuenta: '6010000', desc: 'Compras de recambios', iva: '21 %', ded: 100, note: '', origen: 'Manual', on: false }
    ],
    validaciones: [
        { t: 'Revisión manual si el total supera 3.000 €', on: true },
        { t: 'Detectar duplicados por NIF + nº de factura', on: true },
        { t: 'Proveedores nuevos siempre a revisión', on: true },
        { t: 'Tickets sin NIF del destinatario: IVA como mayor gasto', on: false }
    ],
    propuestas: [
        { nif: 'B84818442', prov: 'Leroy Merlin España S.L.U.', cuenta: '6220000', desc: 'Reparaciones y conservación', iva: '21 %', text: 'Cuenta 6220000 Reparaciones y conservación · IVA 21 %', why: 'Corregido 3 veces en las últimas 5 facturas' },
        { nif: '—', prov: 'Tickets de taxi', cuenta: '6290001', desc: 'Desplazamientos', iva: '10 %', text: 'Cuenta 6290001 Desplazamientos · IVA 10 %', why: 'Corregido 2 veces este trimestre' }
    ],
    // FALTA: documentos validados con riesgo en ejercicios no prescritos (se calculará sobre las
    // confirmaciones con riesgo aceptado, Fase 4). [fecha, doc, proveedor, motivo, IS, IVA, IRPF]
    riesgos: [
        ['12/02/2026', 'DOC-000437', 'Endesa Energía S.A.U.', 'Inmueble no afecto', 48.2, 39.58, 0],
        ['28/01/2026', 'DOC-000418', 'Restaurante La Tahona', 'Comidas no deducibles', 21.5, 8.6, 0],
        ['15/11/2025', 'DOC-000392', 'Repsol Comercial S.A.', 'Ticket sin NIF destinatario', 0, 10.41, 0],
        ['03/10/2025', 'DOC-000371', 'Amazon EU S.à r.l.', 'Intracomunitaria sin autorrepercutir', 0, 23.52, 0],
        ['19/06/2025', 'DOC-000322', 'Diseño Gráfico Ana Pol', 'Retención IRPF no practicada', 0, 0, 90],
        ['22/03/2024', 'DOC-000204', 'Leroy Merlin España S.L.U.', 'Inversión como gasto', 312.5, 0, 0],
        ['07/09/2023', 'DOC-000131', 'Viajes Iberia Tours S.L.', 'Gasto personal', 145.8, 58.32, 0],
        ['14/04/2022', 'DOC-000052', 'Consultores López S.L.P.', 'Retención IRPF no practicada', 0, 0, 225]
    ]
};

const EMPRESAS = new Map();

/** Datos de ejemplo de una empresa (misma referencia durante la sesión: los cambios se mantienen) */
export function datosEmpresa(empresaId) {
    if (!EMPRESAS.has(empresaId)) EMPRESAS.set(empresaId, clonar(EMPRESA_INICIAL));
    return EMPRESAS.get(empresaId);
}

/** "Aplicar siempre": crea o actualiza la regla del proveedor como aprendida */
export function aprenderRegla(empresaId, regla) {
    const d = datosEmpresa(empresaId);
    const existente = d.reglas.find((r) => r.nif === regla.nif);
    if (existente) Object.assign(existente, { cuenta: regla.cuenta, desc: regla.desc, origen: 'Aprendida', on: true });
    else d.reglas.unshift({ ded: 100, note: '', origen: 'Aprendida', on: true, ...regla });
}

// ===== Skills: criterios del cliente que la IA aplicará al extraer =====
// Una skill puede afectar a varias empresas y a grupos empresariales enteros (diseño v2 Híbrido).
// Las empresas y los grupos que se eligen son REALES (Salesforce, buscarEmpresasYGrupos); las skills en
// sí son DE EJEMPLO, en memoria. FALTA: guardarlas en Cloud SQL y pasarlas al prompt de extracción.
// Campos: num, title, text, html (con formato), activa, fin (aaaa-mm-dd si está inactiva), emps
// [{id, nombre}], grps [{id, nombre, miembros[{id, nombre}]}], nif/prov (proveedor), cuenta, tipo.
const SKILLS_EJEMPLO = [
    { num: 'SK-001', title: 'Analítica por centro de coste', text: 'Todos los gastos se imputan a tres centros: Taller 60 %, Chapa y pintura 30 % y Administración 10 %, salvo que el concepto indique otro.', tipo: 'Todas' },
    { num: 'SK-002', title: 'Endesa: desglose en dos cuentas', nif: 'A81948077', prov: 'Endesa Energía S.A.U.', cuenta: '6280000 / 6280002', text: 'La factura de luz se reparte 70 % en 6280000 Suministros taller y 30 % en 6280002 Suministros oficina.', tipo: 'Recibidas' },
    { num: 'SK-003', title: 'Amazon Business: herramientas', nif: 'W0184081H', prov: 'Amazon EU S.à r.l.', cuenta: '2150000', text: 'Si una herramienta supera 300 € va a inmovilizado 2150000; el resto a 6020000 Material de taller.', tipo: 'Recibidas' },
    { num: 'SK-004', title: 'Gasóleo de la furgoneta', nif: 'A80298839', prov: 'Repsol Comercial S.A.', text: 'Furgoneta 1234-KLM afecta al 100 %. Si el gasto mensual supera 400 €, avisar a la asesora.', tipo: 'Tickets', activa: false, fin: '2026-06-30' },
    { num: 'SK-005', title: 'Comidas y atenciones', cuenta: '6290009', text: 'Las comidas con clientes van a 6290009 sin deducir IVA. El cliente indica el motivo en el nombre del archivo.', tipo: 'Todas' },
    { num: 'SK-006', title: 'Endesa: IVA deducible al 30 %', short: 'IVA 30 %', nif: 'A81948077', prov: 'Endesa Energía S.A.U.', text: 'En las facturas de Endesa Energía (A81948077) solo es deducible el 30 % del IVA soportado. Aplica 30 % en el campo % deducible de cada línea de IVA; el 70 % restante es mayor gasto en la cuenta de contrapartida.', tipo: 'Recibidas' }
];

let SKILLS = null;
function almacenSkills() {
    if (!SKILLS) SKILLS = SKILLS_EJEMPLO.map((s) => ({ activa: true, fin: '', html: '', emps: [], grps: [], ejemplo: true, ...clonar(s) }));
    return SKILLS;
}

/** Empresas a las que afecta una skill: las elegidas y las de sus grupos, sin repetir */
export function empresasAfectadas(skill) {
    const mapa = new Map();
    (skill.emps || []).forEach((e) => mapa.set(e.id, e));
    (skill.grps || []).forEach((g) => (g.miembros || []).forEach((m) => { if (!mapa.has(m.id)) mapa.set(m.id, { ...m, porGrupo: g.nombre }); }));
    return [...mapa.values()];
}

/**
 * Skills que afectan a una empresa ({id, nombre}). Las de ejemplo sin empresas se asignan a la primera
 * empresa desde la que se abren, para que cada ficha tenga contenido.
 */
export function skillsDeEmpresa(empresa) {
    const lista = almacenSkills();
    if (empresa && empresa.id) {
        lista.filter((s) => s.ejemplo && !s.emps.length && !s.grps.length).forEach((s) => { s.emps = [{ id: empresa.id, nombre: empresa.nombre }]; });
    }
    return lista.filter((s) => !empresa || empresasAfectadas(s).some((e) => e.id === empresa.id));
}

/** Una skill se aplica si está activa y, si tiene fecha de fin, todavía no ha llegado */
export function skillActiva(skill, hoy = new Date().toISOString().slice(0, 10)) {
    return skill.activa !== false && !(skill.fin && skill.fin < hoy);
}

/** Alta o edición de una skill (editor de skills). Devuelve la skill guardada. */
export function guardarSkill(skill) {
    const lista = almacenSkills();
    const i = lista.findIndex((s) => s.num === skill.num);
    if (i >= 0) {
        lista[i] = { ...lista[i], ...skill, ejemplo: false };
        return lista[i];
    }
    const n = lista.reduce((m, s) => Math.max(m, Number(String(s.num).replace(/\D/g, '')) || 0), 0) + 1;
    const nueva = { activa: true, fin: '', emps: [], grps: [], ...skill, num: 'SK-' + String(n).padStart(3, '0'), ejemplo: false };
    lista.push(nueva);
    return nueva;
}

export function siguienteNumeroSkill() {
    const n = almacenSkills().reduce((m, s) => Math.max(m, Number(String(s.num).replace(/\D/g, '')) || 0), 0) + 1;
    return 'SK-' + String(n).padStart(3, '0');
}

export function eliminarSkill(num) {
    SKILLS = almacenSkills().filter((s) => s.num !== num);
}

// ===== Plan de cuentas (buscador de cuentas contables) =====
// FALTA: el plan de cuentas real del cliente está en Sage (clave Contrato.C_digo_ERP__c). Hasta que se
// integre, esta lista de ejemplo es la del diseño; "Usar como cuenta nueva" permite escribir cualquiera.
export const GRUPOS_CUENTA = ['Todas', 'Gastos', 'Ingresos', 'Proveedores', 'Clientes', 'Inmovilizado'];
export const PLAN_CUENTAS = [
    ['2130000', 'Maquinaria', 'Inmovilizado'], ['2150000', 'Otras instalaciones · herramientas', 'Inmovilizado'], ['2160000', 'Mobiliario', 'Inmovilizado'],
    ['2170000', 'Equipos informáticos', 'Inmovilizado'], ['2180000', 'Elementos de transporte', 'Inmovilizado'],
    ['4000001', 'Endesa Energía S.A.U.', 'Proveedores'], ['4000002', 'Repsol Comercial S.A.', 'Proveedores'], ['4000003', 'Amazon Business EU S.à r.l.', 'Proveedores'],
    ['4000004', 'Recambios Hnos. García S.L.', 'Proveedores'], ['4000005', 'Telefónica de España S.A.U.', 'Proveedores'], ['4100001', 'Acreedores varios', 'Proveedores'],
    ['4300001', 'Seguros Mapfre (cliente taller)', 'Clientes'], ['4300002', 'Transportes Ruiz S.L.', 'Clientes'], ['4300003', 'Clientes varios contado', 'Clientes'],
    ['6000000', 'Compras de mercaderías · recambios', 'Gastos'], ['6020000', 'Material de taller', 'Gastos'], ['6210000', 'Arrendamientos local', 'Gastos'],
    ['6220000', 'Reparaciones y conservación', 'Gastos'], ['6230000', 'Servicios profesionales', 'Gastos'], ['6250000', 'Primas de seguros', 'Gastos'],
    ['6260000', 'Servicios bancarios', 'Gastos'], ['6270000', 'Publicidad', 'Gastos'], ['6280000', 'Suministros taller', 'Gastos'],
    ['6280001', 'Combustible furgoneta', 'Gastos'], ['6280002', 'Suministros oficina', 'Gastos'], ['6290000', 'Otros servicios · telefonía', 'Gastos'],
    ['6310000', 'Otros tributos', 'Gastos'], ['6400000', 'Sueldos y salarios', 'Gastos'], ['6690000', 'Otros gastos financieros', 'Gastos'],
    ['7000000', 'Ventas de recambios', 'Ingresos'], ['7050000', 'Prestación de servicios · reparación', 'Ingresos'], ['7050001', 'Servicios de chapa y pintura', 'Ingresos'],
    ['7590000', 'Ingresos por servicios diversos', 'Ingresos'], ['7710000', 'Beneficio procedente del inmovilizado', 'Ingresos']
].map(([codigo, nombre, grupo]) => ({ codigo, nombre, grupo }));

// ===== Validación de la extracción (capa 1 del documento) =====
// FALTA: al confirmar se guardará en la tabla confirmaciones (lo que el asesor da por bueno); hoy en memoria.
const EXTRACCION_VALIDADA = new Map();
export function extraccionValidada(docId) { return !!EXTRACCION_VALIDADA.get(docId); }
export function validarExtraccion(docId, valida) { EXTRACCION_VALIDADA.set(docId, !!valida); }

// ===== Colaboración por documento: notas, tareas y chat =====
// FALTA decidir dónde se guardan (Fase 5): Salesforce (Notes/ContentVersion, Task con asignación y
// vencimiento) o Cloud SQL. Tampoco está decidido quién puede ser "Cliente" como responsable de una
// tarea (portal) ni qué hace la IA con las tareas que se le asignan.
const NOTAS = new Map();
const TAREAS = new Map();
const CHATS = new Map();

const TAREAS_INICIALES = [
    { text: 'Pedir al cliente justificante de afectación del inmueble de C/ Alcalá', who: 'Laura Martín', due: '2026-09-28', done: false },
    { text: 'Revisar reparto 70/30 de SK-002 con el cliente', who: 'Tú', due: '2026-09-22', done: false },
    { text: 'Comprobar NIF del proveedor en el censo', who: 'IA', due: '2026-09-20', done: true }
];

export const RESPONSABLES_TAREA = ['Tú', 'Laura Martín', 'Cliente', 'IA'];

export function notasDe(docId) {
    if (!NOTAS.has(docId)) NOTAS.set(docId, []);
    return NOTAS.get(docId);
}

export function anadirNota(docId, nota) {
    notasDe(docId).unshift({ id: Date.now() + Math.random(), autor: 'Tú', fecha: new Date().toISOString(), ...nota });
}

export function tareasDe(docId) {
    if (!TAREAS.has(docId)) TAREAS.set(docId, clonar(TAREAS_INICIALES).map((t, i) => ({ ...t, id: `${docId}-t${i}` })));
    return TAREAS.get(docId);
}

export function chatsDe(docId) {
    if (!CHATS.has(docId)) CHATS.set(docId, []);
    return CHATS.get(docId);
}

/**
 * FALTA: asistente fiscal real (Fase 5) con Vertex AI (Gemini o Claude) y el contexto de la factura,
 * los riesgos y las skills. De momento responde un texto fijo que explica la consulta.
 */
export function respuestaAsistente(pregunta, contexto) {
    return `Respuesta de ejemplo (el asistente con IA llegará en la Fase 5). Has preguntado: «${pregunta}». `
        + `Tendré en cuenta la factura de ${contexto.emisor || 'este proveedor'}${contexto.total ? ' por ' + contexto.total + ' €' : ''}, `
        + 'sus comprobaciones de riesgo fiscal y las skills del cliente.';
}
