/*
 * DATOS DE EJEMPLO de la Bandeja Contable (lo que todavía no existe en Google).
 *
 * El desglose de archivos en documentos OCR, los datos extraídos, el perfil fiscal, las reglas y las
 * skills los producirá el pipeline OCR de Google y vivirán en Cloud SQL. Hasta entonces se generan
 * aquí, con los contenidos del diseño de Claude Design, de forma determinista a partir de los
 * archivos reales ya subidos (mismo archivo → mismos documentos en cada carga).
 *
 * Cuando exista el backend, cada función exportada se sustituye por una llamada a Apex que devuelva
 * la misma forma de datos; las pantallas no deberían necesitar cambios.
 *
 * Los cambios que hace el usuario (validar un documento, aceptar una regla…) se guardan solo en
 * memoria durante la sesión de la página.
 */

export const SOFTWARE_CLIENTE = 'a3ERP · Contabilidad';

// ===== Plantillas de documento (facturas de ejemplo del diseño) =====
const PLANTILLAS = [
    {
        x: {
            kind: 'FACTURA', emisor: 'Endesa Energía S.A.U.', nif: 'A81948077', dir: 'C/ Ribera del Loira 60, 28042 Madrid',
            sumin: 'C/ Alcalá 245, 3º B, 28028 Madrid', numero: 'FE26-0312894', cp: '28042', fecha: '05/03/2026',
            ivas: [{ base: '175,16', pct: '21', cuota: '36,78' }, { base: '9,14', pct: '0', cuota: '0,00' }],
            irpf: '0,00', total: '221,08', cuenta: '628 Suministros',
            lineas: [{ c: 'Término de potencia', i: '62,14 €' }, { c: 'Término de energía', i: '113,02 €' }, { c: 'Impuesto eléctrico', i: '9,14 €' }]
        },
        conf: { emisor: 99, nif: 98, numero: 97, fecha: 99, irpf: 99, total: 99, cuenta: 91 }
    },
    {
        x: {
            kind: 'FACTURA SIMPL.', emisor: 'Repsol Comercial S.A.', nif: 'A80298839', dir: 'E.S. Km 23 A-3, Arganda',
            numero: 'T-0098213', cp: '28500', fecha: '12/03/2026',
            ivas: [{ base: '49,59', pct: '21', cuota: '10,41' }],
            irpf: '0,00', total: '60,00', cuenta: '622 Reparaciones',
            lineas: [{ c: 'Gasóleo A · 38,2 L', i: '60,00 €' }]
        },
        conf: { emisor: 88, nif: 62, numero: 74, fecha: 93, irpf: 90, total: 96, cuenta: 58 },
        alerta: 'Revisa los campos marcados: el NIF y la cuenta contable tienen confianza baja.', alertaTono: 'warn'
    },
    {
        x: {
            kind: 'FACTURA', emisor: 'Amazon EU S.à r.l.', nif: 'W0184081H', dir: '38 Av. John F. Kennedy, Luxemburgo',
            numero: 'ES6A1B2C3D', cp: 'L-1855', fecha: '18/03/2026',
            ivas: [{ base: '54,00', pct: '21', cuota: '11,34' }, { base: '41,00', pct: '10', cuota: '4,10' }],
            irpf: '0,00', total: '119,95', cuenta: '602 Compras otros aprov.',
            lineas: [{ c: 'Juego llaves combinadas', i: '54,00 €' }, { c: 'Guantes nitrilo (caja)', i: '41,00 €' }]
        },
        conf: { emisor: 96, nif: 90, numero: 48, fecha: 97, irpf: 85, total: 94, cuenta: 52 },
        alerta: 'El cuadre de importes no coincide. Revisa el desglose de IVA antes de validar.', alertaTono: 'err'
    }
];

const CATEGORIA_POR_TIPO = { Recibida: 'Compras', Emitida: 'Ventas', Ticket: 'Tickets' };

// Estados de documento cambiados por el usuario en esta sesión (id → estado)
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

/** En cuántos documentos (facturas) "separaría" Google un archivo */
function partes(archivo) {
    const n = String(archivo.nombre || '').toLowerCase();
    if (n.endsWith('.zip')) return 3;
    if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 2;
    if (n.endsWith('.pdf')) return hash(archivo.id) % 3 === 0 ? 2 : 1;
    return 1;
}

function estadoInicial(id, bandeja) {
    if (bandeja.estado === 'Completado') return 'Contabilizado';
    const h = hash(id + 'estado') % 10;
    if (h === 0) return 'Cancelado';
    if (h <= 2) return 'Contabilizado';
    return 'Pendiente';
}

/**
 * Documentos OCR de una bandeja (BandejaDetalleDTO de Apex). Solo los archivos ya registrados en
 * Google (Sincronizado) tienen documentos: el desglose lo hace Google después de recibirlos.
 */
export function documentosDeBandeja(detalle) {
    const b = detalle.resumen;
    const docs = [];
    (detalle.archivos || []).filter((a) => a.estado === 'Sincronizado').forEach((a) => {
        const n = partes(a);
        const esImagen = /\.(png|jpe?g)$/i.test(a.nombre || '');
        const base = String(a.nombre || 'archivo').replace(/\.[^.]+$/, '');
        for (let k = 0; k < n; k++) {
            const id = `${a.id}-${k}`;
            const plantilla = b.tipoValor === 'Ticket' ? 1 : hash(id) % PLANTILLAS.length;
            docs.push({
                id,
                numero: 'DOC-' + String(100000 + (hash(id) % 900000)),
                nombre: n > 1 ? `${base}_${k + 1}.pdf` : a.nombre,
                formato: esImagen ? (/\.png$/i.test(a.nombre) ? 'PNG' : 'JPG') : 'PDF',
                categoria: CATEGORIA_POR_TIPO[b.tipoValor] || 'Compras',
                estado: ESTADOS.get(id) || estadoInicial(id, b),
                plantilla,
                archivoId: a.id,
                archivoNombre: a.nombre,
                archivoMime: a.mime,
                bandejaId: b.id,
                bandejaNumero: b.numero,
                empresaId: b.empresaId,
                empresa: b.empresa,
                fecha: b.fecha
            });
        }
    });
    return docs;
}

export function cambiarEstadoDocumento(id, estado) {
    ESTADOS.set(id, estado);
}

/** Datos extraídos por el OCR de un documento (plantilla del diseño) */
export function datosExtraidos(doc) {
    const p = clonar(PLANTILLAS[doc.plantilla]);
    return { x: p.x, conf: p.conf, alerta: p.alerta || null, alertaTono: p.alertaTono || null };
}

// ===== Datos del cliente (perfil fiscal, reglas y skills), por empresa y editables en la sesión =====
const EMPRESA_INICIAL = {
    perfil: [
        ['Régimen de IVA', 'General'], ['Prorrata', 'No aplica'], ['Criterio de caja', 'No'],
        ['Recargo de equivalencia', 'No'], ['Operador intracomunitario (ROI)', 'Sí · alta 2019'],
        ['Actividad (IAE)', '691.2 Reparación de vehículos'], ['Retenciones', 'Modelo 111 trimestral'],
        ['Vehículos afectos', 'Furgoneta 1234-KLM · 100 %']
    ],
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
    skills: [
        { num: 'SK-001', title: 'Analítica por centro de coste', text: 'Todos los gastos se imputan a tres centros: Taller 60 %, Chapa y pintura 30 % y Administración 10 %, salvo que el concepto indique otro.' },
        { num: 'SK-002', title: 'Endesa: desglose en dos cuentas', nif: 'A81948077', text: 'La factura de luz se reparte 70 % en 6280000 Suministros taller y 30 % en 6280002 Suministros oficina.' },
        { num: 'SK-003', title: 'Amazon Business: herramientas', nif: 'W0184081H', text: 'Si una herramienta supera 300 € va a inmovilizado 2150000; el resto a 6020000 Material de taller.' },
        { num: 'SK-004', title: 'Gasóleo de la furgoneta', nif: 'A80298839', text: 'Furgoneta 1234-KLM afecta al 100 %. Si el gasto mensual supera 400 €, avisar a la asesora.' },
        { num: 'SK-005', title: 'Comidas y atenciones', text: 'Las comidas con clientes van a 6290009 sin deducir IVA. El cliente indica el motivo en el nombre del archivo.' }
    ],
    locales: [
        { uso: 'Nave taller', af: 'Afecto 100 %', dir: 'Calle de la Industria 14, Nave 3, 28850 Torrejón de Ardoz', ref: '2245103VK6724N0001XT' },
        { uso: 'Almacén de recambios', af: 'Afecto 100 %', dir: 'Calle del Hierro 7, 28850 Torrejón de Ardoz', ref: '2245118VK6724N0001QM' }
    ],
    iae: [
        { ep: '691.2', alta: '12/05/2008', desc: 'Reparación de automóviles y bicicletas' },
        { ep: '654.2', alta: '03/02/2015', desc: 'Comercio al por menor de accesorios y recambios de vehículos' }
    ],
    domicilioEjemplo: { l1: 'Calle de la Industria 14, Nave 3', l2: '28850 Torrejón de Ardoz (Madrid)' }
};

const EMPRESAS = new Map();

/** Perfil, reglas, validaciones, propuestas, skills, locales e IAE de una empresa (misma referencia en la sesión) */
export function datosEmpresa(empresaId) {
    if (!EMPRESAS.has(empresaId)) EMPRESAS.set(empresaId, clonar(EMPRESA_INICIAL));
    return EMPRESAS.get(empresaId);
}

/** "Aplicar siempre": crea o actualiza la regla del proveedor como aprendida */
export function aprenderRegla(empresaId, regla) {
    const d = datosEmpresa(empresaId);
    const existente = d.reglas.find((r) => r.nif === regla.nif);
    if (existente) {
        Object.assign(existente, { cuenta: regla.cuenta, desc: regla.desc, origen: 'Aprendida', on: true });
    } else {
        d.reglas.unshift({ ded: 100, note: '', origen: 'Aprendida', on: true, ...regla });
    }
}
