/*
 * Cálculos de la pantalla del documento (diseño v2): desglose de IVA, asiento, riesgo fiscal y
 * operativo, comprobaciones automáticas e Impuesto sobre Sociedades. Son funciones puras (sin LWC)
 * para poder probarlas con Jest y moverlas al backend cuando exista el motor de comprobaciones
 * (Fase 4, docs/hoja-de-ruta.md).
 *
 * Qué datos usan:
 *  - Datos de la factura: los extraídos (hoy de ejemplo, bandejaContableMock) con los cambios del asesor.
 *  - Datos del cliente REALES de Salesforce (getDatosCliente): domicilio fiscal, locales afectos, IAE y
 *    vinculados (socios y administradores).
 *  - Datos que todavía no existen: censo AEAT/VIES, deudores de la AEAT, prorrata, histórico del
 *    proveedor y duplicados. Las comprobaciones que dependen de ellos salen con `ejemplo: true` y la
 *    pantalla las marca como tales.
 */
import { num, euros } from 'c/bandejaContableUtils';

export const TIPOS_IVA = [['21', '21 % General'], ['10', '10 % Reducido'], ['5', '5 % Red. esp.'], ['4', '4 % Superred.'], ['0', '0 % Exento']];
export const TIPOS_RETENCION = [['0', '0 % Sin ret.'], ['15', '15 % Profes.'], ['7', '7 % Prof. inicio'], ['19', '19 % Alquiler'], ['1', '1 % Módulos']];
export const CODIGOS_TRANSACCION = [
    ['01', '01 Operación corriente'], ['02', '02 Intracom.'], ['03', '03 Importación'], ['04', '04 ISP'],
    ['05', '05 B. inversión'], ['06', '06 No deducible'], ['07', '07 REAGP']
];

// Límite del bien de inversión en IVA (art. 108 LIVA)
const LIMITE_BIEN_INVERSION = 3005.06;

// Jurisdicciones no cooperativas (Orden HFP/115/2023). FALTA: lista completa y mantenida (tabla de
// referencia en Cloud SQL); aquí solo las más habituales para la comprobación por domicilio.
const PARAISOS = ['gibraltar', 'andorra', 'bahamas', 'islas caimán', 'panamá', 'bermudas', 'jersey', 'guernsey', 'isla de man', 'mónaco', 'seychelles'];

// FALTA: listado de deudores con la Hacienda Pública (lo publica la AEAT cada año). Ejemplo.
const DEUDORES_AEAT_EJEMPLO = ['B00000000'];

// Tipo de IVA esperado según el concepto (heurística hasta que lo haga la IA en la extracción)
const TIPOS_POR_CONCEPTO = [['electricidad|luz|energ', '21'], ['gasóleo|gasolina|combustible', '21'], ['pan|leche|fruta|verdura', '4'], ['restaurante|menú|hostel', '10'], ['llave|guante|herramienta|material', '21']];

// Conceptos habituales por actividad (heurística). FALTA: lo comprobará la IA con el IAE real del cliente.
const CONCEPTOS_POR_ACTIVIDAD = [
    ['reparaci[oó]n de (veh[ií]culos|autom[oó]viles)|taller', 'llave|guante|herramienta|recambio|aceite|neumático|gasóleo|electricidad|luz|energ'],
    ['asesor|consultor|gestor', 'software|papel|consultor|licencia|ordenador']
];

// Riesgo económico por tipo de peculiaridad: [Sociedades, Renta, IVA, Vinculadas] (tipos orientativos
// del diseño: IS 25 %, IRPF medio 19 %). FALTA: validar criterios con el equipo fiscal.
const IMPORTES_RIESGO = {
    Intracomunitaria: (s) => [0, 0, s.base * 0.21, 0],
    Simplificada: (s) => [0, 0, s.cuota, 0],
    Vehículo: (s) => [s.base * 0.5 * 0.25, s.base * 0.5 * 0.19, s.cuota * 0.5, 0],
    'No deducible': (s) => [s.base * 0.25, s.base * 0.19, s.cuota, s.base * 0.25],
    Retención: (s) => [0, s.irpf, 0, 0]
};
const NOTAS_RIESGO = {
    Intracomunitaria: ['Sin impacto directo', 'Sin impacto directo', 'Cuota a autorrepercutir no declarada (472/477) y posible sanción', 'Sin impacto'],
    Simplificada: ['Gasto deducible si está justificado', 'Gasto deducible si está justificado', 'Cuota no deducible sin NIF del destinatario', 'Sin impacto'],
    Vehículo: ['50 % del gasto puede no admitirse · tipo 25 %', 'Si es empresario persona física · tipo medio 19 %', '50 % de la cuota sin prueba de afectación', 'Sin impacto'],
    'No deducible': ['Gasto no deducible · tipo 25 %', 'Posible retribución en especie al socio · 19 %', 'Cuota íntegra no deducible', 'Uso de inmueble del socio · ajuste a valor de mercado'],
    Retención: ['Sin impacto', 'Retención a ingresar en el modelo 111', 'Sin impacto', 'Sin impacto']
};
export const CONCEPTOS_RIESGO = ['Riesgo Sociedades', 'Riesgo Renta', 'Riesgo IVA', 'Operaciones vinculadas'];

export function nif(s) {
    return String(s || '').trim().toUpperCase();
}

export function porcentajeDeducible(r) {
    return Math.max(0, Math.min(100, num(r.ded ?? '100')));
}

function normalizar(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\bc\/\s*/g, 'calle ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** ¿La dirección contiene la calle y número de alguna de las direcciones candidatas? */
export function coincideDireccion(direccion, candidatas) {
    const d = normalizar(direccion);
    return (candidatas || []).some((c) => {
        const calle = normalizar(String(c || '').split(',')[0]);
        return calle.length > 4 && d.includes(calle);
    });
}

export function esExtranjero(nifProveedor, direccion) {
    return /^[WN]/.test(nif(nifProveedor)) || /luxemburgo|irlanda|francia|portugal|alemania/i.test(direccion || '');
}

/** Contrapartida por defecto: ventas en emitidas; en recibidas, la cuenta de gasto a 7 dígitos */
export function contrapartidaPorDefecto(tipo, cuenta) {
    if (tipo === 'Emitida') return '7000000 Ventas de mercaderías';
    const c = String(cuenta || '').trim();
    const codigo = ((c.match(/^\d+/) || ['600'])[0] + '0000000').slice(0, 7);
    return codigo + ' ' + (c.replace(/^\d+\s*/, '') || 'Compras');
}

/** % deducible que propone la IA para una línea (vehículo), o null */
export function sugerenciaDeducible(regla, textoLineas) {
    if (regla && regla.veh100) return { v: 100, motivo: 'Vehículo', texto: 'Vehículo afecto al 100 % (regla del cliente)' };
    if (/gas[oó]leo|gasolina|combustible|peaje|parking/i.test(textoLineas)) return { v: 50, motivo: 'Vehículo', texto: 'Vehículo de turismo: 50 %' };
    return null;
}

export function sumasIva(ivas) {
    const s = { base: 0, cuota: 0, re: 0, ret: 0, noDed: 0 };
    (ivas || []).forEach((r) => {
        s.base += num(r.base);
        s.cuota += num(r.cuota);
        s.re += num(r.re);
        s.ret += num(r.ret);
        s.noDed += (num(r.cuota) * (100 - porcentajeDeducible(r))) / 100;
    });
    s.ded = s.cuota - s.noDed;
    return s;
}

/**
 * Propuesta de asiento: gasto por contrapartida (con el IVA no deducible como mayor gasto),
 * IVA soportado deducible por tipo, retención IRPF y proveedor por el total.
 */
export function propuestaAsiento({ ivas, contraDef, cuenta, numero, emisor, ctaProv, irpf, total, idx = 0 }) {
    const pad = (c) => (c + '0000000').slice(0, 7);
    const cta = String(cuenta || '');
    const ctaCodigo = (cta.match(/^\d+/) || ['600'])[0];
    const ctaDesc = cta.replace(/^\d+\s*/, '') || 'Gasto';
    const filas = [];
    const gastos = {};
    ivas.forEach((r) => {
        const c = String(r.contra ?? contraDef ?? '').trim();
        const codigo = pad((c.match(/^\d+/) || [ctaCodigo])[0]);
        const noDed = (num(r.cuota) * (100 - porcentajeDeducible(r))) / 100;
        if (!gastos[codigo]) gastos[codigo] = { cuenta: codigo, desc: c.replace(/^\d+\s*/, '') || ctaDesc, d: 0, nd: 0, sk: r.sk, part: r.skPart };
        gastos[codigo].d += num(r.base) + noDed;
        gastos[codigo].nd += noDed;
    });
    Object.values(gastos).forEach((g) => filas.push({
        cuenta: g.cuenta,
        concepto: `${g.desc} · Fra. ${numero}${g.sk ? ' · ' + g.sk + ' ' + (g.part || '') : ''}${g.nd > 0.004 ? ' (incl. IVA no deducible)' : ''}`.replace(/\s+$/, ''),
        d: g.d,
        h: 0
    }));
    const iva = {};
    ivas.forEach((r) => {
        const q = (num(r.cuota) * porcentajeDeducible(r)) / 100;
        if (q <= 0.004) return;
        const k = '472' + String(num(r.pct)).padStart(4, '0');
        if (!iva[k]) iva[k] = { cuenta: k, pct: r.pct, d: 0, part: porcentajeDeducible(r) < 100 ? porcentajeDeducible(r) : null };
        iva[k].d += q;
    });
    Object.values(iva).forEach((g) => filas.push({
        cuenta: g.cuenta,
        concepto: `H.P. IVA soportado ${g.pct} %${g.part != null ? ' · deducible ' + g.part + ' %' : ''}`,
        d: g.d,
        h: 0
    }));
    const ret = num(irpf);
    if (ret) filas.push({ cuenta: '4751000', concepto: 'H.P. acreedora retenciones IRPF', d: 0, h: ret });
    const prov = pad((String(ctaProv || '').match(/^\d+/) || ['400' + String(idx + 1).padStart(4, '0')])[0]);
    filas.push({ cuenta: prov, concepto: emisor, d: 0, h: num(total) });
    return filas;
}

/**
 * Riesgo fiscal de la factura (resumen de la pestaña Datos). Cada peculiaridad lleva su riesgo
 * económico estimado cuando se puede cuantificar.
 * c = { x, regla, textoLineas, sumas, irpf, direccionesAfectas, duplicado, ivas }
 */
export function riesgosFiscales(c) {
    const items = [];
    const W = (sev, tag, titulo, texto) => ({ clave: tag + '·' + titulo, sev, tag, titulo, texto });
    const nifV = nif(c.x.nif);
    const { regla } = c;
    if (regla && regla.noIntra) items.push(W('info', 'Regla cliente', 'No procede autorrepercusión', regla.note + '. Aplicado desde Skills del cliente.'));
    else if (esExtranjero(nifV, c.x.dir)) {
        items.push(W('warn', 'Intracomunitaria', 'Proveedor no establecido en España', 'Posible adquisición intracomunitaria o inversión del sujeto pasivo. Comprueba el NIF en VIES y, si procede, autorrepercute el IVA (472/477) e incluye en el modelo 349.'));
    }
    if (/SIMPL/i.test(c.x.kind || '')) items.push(W('warn', 'Simplificada', 'Factura simplificada (ticket)', 'El IVA solo es deducible si consta el NIF y domicilio del destinatario. Si no, contabiliza la cuota como mayor gasto.'));
    if (regla && regla.veh100) items.push(W('info', 'Regla cliente', 'Vehículo afecto al 100 %', 'IVA deducible al 100 % según Skills del cliente.'));
    else if (/gas[oó]leo|gasolina|combustible/i.test(c.textoLineas)) {
        items.push(W('warn', 'Vehículo', 'Gasto de vehículo', 'Deducción del IVA presunta al 50 % salvo prueba de afectación exclusiva a la actividad.'));
    }
    if (c.x.sumin && !coincideDireccion(c.x.sumin, c.direccionesAfectas)) {
        items.push(W('warn', 'No deducible', 'Suministro en inmueble no afecto', `La dirección de suministro (${c.x.sumin}) no coincide con el domicilio fiscal ni con ningún local afecto. El gasto y su IVA no son deducibles salvo que se acredite la afectación.`));
    }
    if (num(c.irpf)) items.push(W('info', 'Retención', 'Factura con retención IRPF', 'Se incluirá en el modelo 111 del periodo.'));

    // Riesgo económico (solo de las peculiaridades anteriores)
    const s = { base: c.sumas.base, cuota: c.sumas.cuota, irpf: num(c.irpf) };
    items.forEach((w) => {
        const importes = IMPORTES_RIESGO[w.tag] ? IMPORTES_RIESGO[w.tag](s) : [0, 0, 0, 0];
        const notas = NOTAS_RIESGO[w.tag] || ['Aplicado por regla del cliente', 'Aplicado por regla del cliente', 'Aplicado por regla del cliente', 'Sin impacto'];
        const total = importes.reduce((a, b) => a + b, 0);
        w.riesgo = { total, importes, notas };
    });

    const sinMotivo = (c.ivas || []).filter((r) => porcentajeDeducible(r) < 100 && !String(r.dedMot || '').trim());
    if (sinMotivo.length) {
        items.push(W('warn', 'Deducción parcial', 'Deducción parcial sin justificar', `Hay ${sinMotivo.length} ${sinMotivo.length === 1 ? 'línea' : 'líneas'} con IVA parcialmente deducible sin motivo. Indica si es por vehículo, prorrata o afectación del inmueble.`));
    }
    if (c.duplicado) {
        items.unshift(W('warn', 'Duplicado', 'Posible factura duplicada', `Ya existe ${c.duplicado.id} con el mismo NIF, nº de factura e importe (recibida por ${c.duplicado.origen} el ${c.duplicado.fecha}). No la contabilices dos veces.`));
    }
    return items;
}

// Grupos de la pestaña Check (riesgo fiscal)
export const SUBGRUPOS = [
    ['prov', 'Proveedor', ['Censo AEAT o VIES', 'Morosos y paraísos fiscales', 'Operación vinculada', 'Duplicados']],
    ['req', 'Requisitos de la factura', ['Mención de exención', 'Factura rectificativa', 'Tipo de IVA y concepto']],
    ['ded', 'Deducibilidad', ['Conceptos y actividades', 'Inmueble del suministro', 'Vehículo turismo', 'Gasto personal', 'Factura simplificada', 'Prorrata']],
    ['reg', 'Registro y regularización', ['Bien de inversión', 'Venta de inmovilizado', 'Periodificación']]
];

/** Comprobación con incidencia sin resolver (las que ha resuelto una skill del cliente no cuentan) */
export function conIncidencia(c) {
    return c.estado !== 'ok' && !c.skill;
}

/** Comprobación que hay que mirar: con incidencia o resuelta por una skill del cliente */
export function aRevisar(c) {
    return c.estado !== 'ok' || !!c.skill;
}

/**
 * Comprobaciones automáticas. Devuelve [{ k: 'f'|'o', titulo, estado: 'ok'|'ko'|'warn', status, texto, ejemplo, barras, skill }]
 * `skill` es la skill (o regla) del cliente que ha resuelto la comprobación: se muestra como "Pre-validada".
 * c = { x, ivas, tipo, regla, textoLineas, cliente, direccionesAfectas, duplicado, historico, mes, skills }
 * (skills: números de las skills activas; si no se pasa, vale cualquiera)
 */
export function comprobaciones(c) {
    const it = [];
    const add = (estado, o) => it.push({ k: 'f', ejemplo: false, ...o, estado });
    const nifV = nif(c.x.nif);
    const dir = String(c.x.dir || '');
    const texto = [c.textoLineas, c.x.emisor].join(' ').toLowerCase();
    const ivas = c.ivas || [];
    const cliente = c.cliente || {};

    // ----- Proveedor -----
    if (c.duplicado) add('ko', { titulo: 'Duplicados', status: 'Posible duplicado', texto: `${c.duplicado.id} · mismo NIF, nº de factura e importe · ${c.duplicado.bandeja} (${c.duplicado.origen}, ${c.duplicado.fecha})`, ejemplo: true });
    else add('ok', { titulo: 'Duplicados', status: 'Sin duplicados', texto: 'No hay otra factura con el mismo NIF, nº de factura e importe.', ejemplo: true });

    // FALTA: consulta real al censo de la AEAT y a VIES (servicio web de la AEAT / API VIES de la CE)
    if (esExtranjero(nifV, dir)) add('ok', { titulo: 'Censo AEAT o VIES', status: 'VIES · NIF-IVA válido', texto: `${nifV} · ${c.x.emisor} · operador intracomunitario registrado (consulta simulada).`, ejemplo: true });
    else add('ok', { titulo: 'Censo AEAT o VIES', status: 'Censo AEAT · NIF válido', texto: `${nifV} · ${c.x.emisor} · alta en el censo de empresarios (consulta simulada).`, ejemplo: true });

    const paraiso = PARAISOS.find((p) => dir.toLowerCase().includes(p));
    if (paraiso) add('ko', { titulo: 'Morosos y paraísos fiscales', status: 'Jurisdicción no cooperativa', texto: `El domicilio del proveedor está en ${paraiso}, jurisdicción no cooperativa (Orden HFP/115/2023). Posible no deducibilidad y obligación informativa.` });
    else if (DEUDORES_AEAT_EJEMPLO.includes(nifV)) add('ko', { titulo: 'Morosos y paraísos fiscales', status: 'En lista de deudores', texto: 'El NIF figura en el listado de deudores con la Hacienda Pública.', ejemplo: true });
    else add('ok', { titulo: 'Morosos y paraísos fiscales', status: 'Sin coincidencias', texto: 'El domicilio no está en una jurisdicción no cooperativa. Listado de deudores de la AEAT pendiente de integrar.', ejemplo: true });

    // Vinculados reales: socios y administradores del cliente (Salesforce)
    const vinculado = (cliente.vinculados || []).find((v) => v.nif && nif(v.nif) === nifV);
    if (vinculado) add('warn', { titulo: 'Operación vinculada', status: 'Proveedor vinculado', texto: `${vinculado.nombre} es ${String(vinculado.relacion || 'vinculado').toLowerCase()} del cliente: valoración a mercado (art. 18 LIS) y posible modelo 232.` });
    else add('ok', { titulo: 'Operación vinculada', status: 'No vinculado', texto: `El proveedor no figura entre los ${(cliente.vinculados || []).length} socios y administradores del cliente en Salesforce.` });

    // ----- Requisitos de la factura -----
    const cero = ivas.filter((r) => num(r.pct) === 0 && num(r.base) > 0);
    if (cero.length) {
        const mencion = c.x.sumin ? 'Impuesto especial sobre la electricidad (no sujeto a IVA en línea propia)' : c.x.exMen;
        if (mencion) add('ok', { titulo: 'Mención de exención', status: 'Causa indicada', texto: `${cero.length} línea(s) al 0 %: ${mencion}.` });
        else add('ko', { titulo: 'Mención de exención', status: 'Falta la causa', texto: `${cero.length} línea(s) al 0 % sin indicar el artículo de exención o no sujeción (art. 6.1.j RD 1619/2012).` });
    } else add('ok', { titulo: 'Mención de exención', status: 'No aplica', texto: 'No hay líneas exentas ni no sujetas en la factura.' });

    const incoherentes = ivas.filter((r) => num(r.base) > 0 && num(r.pct) > 0).filter((r) => {
        const t = TIPOS_POR_CONCEPTO.find(([re]) => new RegExp(re).test(texto) || (c.x.sumin && re.startsWith('electricidad')));
        return t && String(num(r.pct)) !== t[1];
    });
    if (incoherentes.length) add('ko', { titulo: 'Tipo de IVA y concepto', status: 'Tipo incoherente', texto: `El tipo aplicado (${incoherentes.map((r) => r.pct + ' %').join(', ')}) no corresponde al concepto facturado.` });
    else add('ok', { titulo: 'Tipo de IVA y concepto', status: 'Coherente', texto: `Los tipos aplicados (${[...new Set(ivas.map((r) => num(r.pct) + ' %'))].join(', ')}) corresponden a los conceptos facturados.` });

    const rectificativa = /RECTIF/.test(String(c.x.kind || '').toUpperCase()) || num(c.x.total) < 0;
    if (rectificativa && c.x.rectRef) add('ok', { titulo: 'Factura rectificativa', status: 'Referencia indicada', texto: `Rectifica la factura ${c.x.rectRef}.` });
    else if (rectificativa) add('ko', { titulo: 'Factura rectificativa', status: 'Sin factura original', texto: 'Rectificativa sin referencia a la factura original ni a la causa de rectificación (art. 15 RD 1619/2012).' });
    else add('ok', { titulo: 'Factura rectificativa', status: 'No aplica', texto: 'No es una factura rectificativa.' });

    // ----- Deducibilidad -----
    // FALTA: prorrata del cliente (no existe en Salesforce, ver pendientes de getDatosCliente)
    add('ok', { titulo: 'Prorrata', status: 'Sin prorrata', texto: 'Se supone que el cliente solo realiza operaciones con derecho a deducción (IVA deducible al 100 %). La prorrata no está en Salesforce.', ejemplo: true });

    const actividades = cliente.actividades || [];
    if (!actividades.length) {
        add('warn', { titulo: 'Conceptos y actividades', status: 'Sin actividades', texto: 'El cliente no tiene actividades económicas (IAE) en alta en Salesforce: no se puede comprobar la afectación.' });
    } else {
        const epigrafes = actividades.map((a) => `${a.epigrafe} ${a.descripcion || ''}`.trim()).join(' · ');
        const encaja = !!c.x.sumin || CONCEPTOS_POR_ACTIVIDAD.some(([act, conceptos]) =>
            actividades.some((a) => new RegExp(act, 'i').test(a.descripcion || '')) && new RegExp(conceptos).test(texto));
        if (encaja) add('ok', { titulo: 'Conceptos y actividades', status: 'Coherente con el IAE', texto: `Los conceptos encajan con las actividades del cliente: ${epigrafes}.` });
        else add('warn', { titulo: 'Conceptos y actividades', status: 'Revisar', texto: `Comprueba que los conceptos están afectos a las actividades del cliente: ${epigrafes}. La comprobación automática la hará la IA al extraer.` });
    }

    if (c.x.sumin) {
        if (coincideDireccion(c.x.sumin, c.direccionesAfectas)) add('ok', { titulo: 'Inmueble del suministro', status: 'Local afecto', texto: `La dirección de suministro (${c.x.sumin}) coincide con el domicilio fiscal o un local afecto del cliente.` });
        else add('ko', { titulo: 'Inmueble del suministro', status: 'No afecto', texto: `La dirección de suministro (${c.x.sumin}) no coincide con el domicilio fiscal ni con los ${(cliente.locales || []).length} locales afectos del cliente en Salesforce. El gasto y su IVA no son deducibles salvo que se acredite la afectación.` });
    } else add('ok', { titulo: 'Inmueble del suministro', status: 'No aplica', texto: 'La factura no es de un suministro vinculado a un inmueble.' });

    // Ticket (factura simplificada) sin NIF del destinatario: el IVA no es deducible
    if (/SIMPL/i.test(c.x.kind || '')) {
        const conCuota = ivas.filter((r) => num(r.cuota) > 0);
        const deducida = conCuota.filter((r) => porcentajeDeducible(r) > 0);
        const skillActiva = (n) => !c.skills || c.skills.includes(n);
        const porSkill = conCuota.find((r) => r.sk2 && skillActiva(r.sk2) && porcentajeDeducible(r) === 0);
        if (deducida.length) add('ko', { titulo: 'Factura simplificada', status: 'IVA deducido sin NIF', texto: 'Ticket sin NIF ni domicilio del destinatario: el IVA no es deducible. Pon 0 % deducible y lleva la cuota a mayor gasto.' });
        else if (porSkill) add('ok', { titulo: 'Factura simplificada', status: 'IVA no deducible', texto: 'Ticket sin NIF del destinatario: la cuota se ha llevado a mayor gasto aplicando la skill del cliente.', skill: porSkill.sk2 });
        else add('ok', { titulo: 'Factura simplificada', status: 'IVA no deducido', texto: 'Ticket sin NIF del destinatario: la cuota no se deduce.' });
    }

    const vehiculo = /gasóleo|gasolina|combustible|parking|peaje|taller/.test(texto) && !c.x.sumin;
    if (vehiculo && c.regla && c.regla.veh100) add('ok', { titulo: 'Vehículo turismo', status: 'Afecto al 100 %', texto: 'Regla del cliente: vehículo de uso exclusivo en la actividad. IVA deducible al 100 %.', ejemplo: true, skill: 'Regla vehículo' });
    else if (vehiculo) add('warn', { titulo: 'Vehículo turismo', status: 'Presunción 50 %', texto: 'Gasto de vehículo: se presume afectación del 50 % (art. 95.Tres LIVA) salvo prueba de uso exclusivo.' });
    else add('ok', { titulo: 'Vehículo turismo', status: 'No aplica', texto: 'La factura no corresponde a gastos de vehículo.' });

    const partes = String(c.x.fecha || '').split('/');
    const dia = partes.length === 3 ? new Date(+partes[2], +partes[1] - 1, +partes[0]).getDay() : 1;
    const finde = dia === 0 || dia === 6;
    if (/supermercado|mercadona|carrefour|ropa|zara|hotel|vuelo|cine|restaurante/.test(texto) || finde) {
        add('warn', { titulo: 'Gasto personal', status: 'Posible gasto personal', texto: `${finde ? 'Fecha en fin de semana. ' : ''}Revisa que el gasto esté afecto a la actividad y no sea de consumo particular.` });
    } else add('ok', { titulo: 'Gasto personal', status: 'Sin indicios', texto: 'Concepto, proveedor y fecha (día laborable) no indican consumo particular.' });

    // ----- Registro y regularización -----
    const baseTotal = ivas.reduce((a, r) => a + num(r.base), 0);
    if (baseTotal > LIMITE_BIEN_INVERSION && /maquin|equipo|vehícul|ordenador|mobiliario/.test(texto)) {
        add('warn', { titulo: 'Bien de inversión', status: '> 3.005,06 €', texto: 'Compra de bien de inversión: alta en el libro registro y regularización del IVA durante 5 años (10 en inmuebles).' });
    } else add('ok', { titulo: 'Bien de inversión', status: 'No aplica', texto: 'Ningún concepto supera 3.005,06 € como bien de inversión.' });

    const emitida = c.tipo === 'Emitida';
    if (!emitida) add('ok', { titulo: 'Venta de inmovilizado', status: 'No aplica', texto: 'Solo se revisa en facturas emitidas.' });
    else if (/venta de (maquinaria|vehículo|furgoneta|equipo|elevador|inmueble|local)|inmovilizado|enajenación/.test(texto)) {
        add('warn', { titulo: 'Venta de inmovilizado', status: 'Venta de inmovilizado', texto: 'La factura emitida corresponde a la venta de un elemento del inmovilizado: contabiliza la baja (cuentas 21x y 281x), el resultado en 671/771 y revisa la regularización del IVA.' });
    } else add('ok', { titulo: 'Venta de inmovilizado', status: 'Venta ordinaria', texto: 'La factura emitida corresponde a la actividad habitual, no a la venta de inmovilizado.' });

    if (/seguro|póliza|anual|suscripci|licencia|cuota (anual|trimestral)|alquiler anticipado|mantenimiento anual/.test(texto)) {
        add('warn', { titulo: 'Periodificación', status: 'Revisar periodo', texto: 'El concepto sugiere un gasto plurianual o de periodo (seguro, suscripción, licencia). Indica el periodo para calcular la parte a periodificar en 480/485.' });
    } else add('ok', { titulo: 'Periodificación', status: 'No aplica', texto: 'Gasto de devengo puntual: se imputa íntegro al ejercicio de la fecha de devengo.' });

    // ----- Operativo -----
    const h = c.historico;
    const actual = num(c.x.total);
    if (h) {
        const dev = Math.round(((actual - h.media) / h.media) * 100);
        const grande = Math.abs(dev) >= 25;
        const todos = [...h.meses.map(([m, v]) => ({ m, v, actual: false })), { m: c.mes || 'Actual', v: actual, actual: true }];
        const max = Math.max(...todos.map((x) => x.v)) || 1;
        it.push({
            k: 'o', ejemplo: true, estado: grande ? 'warn' : 'ok', titulo: 'Facturas anteriores',
            status: grande ? `${dev > 0 ? '+' : ''}${dev} % sobre la media` : 'En línea con la media',
            texto: `Media de los últimos 6 meses: ${euros(h.media)} €. Esta factura: ${euros(actual)} €.${grande ? ' Revisa si hay conceptos nuevos o un error de lectura.' : ''}`,
            barras: todos.map((x) => ({ m: x.m, alto: Math.max(3, Math.round((x.v / max) * 40)), actual: x.actual, aviso: x.actual && grande, tip: `${x.m}: ${euros(x.v)} €` }))
        });
    } else it.push({ k: 'o', ejemplo: true, estado: 'warn', titulo: 'Facturas anteriores', status: 'Proveedor nuevo', texto: 'No hay facturas previas de este proveedor para comparar.' });

    return it;
}

/**
 * Incidencias contables de la factura (capa 1 · Inteligencia contable): descuadre de bases, cuotas y total,
 * asiento descuadrado, cuotas de IVA que no corresponden a base × tipo y deducciones parciales sin motivo.
 */
export function incidenciasContables({ ivas, cuadra, asientoCuadra }) {
    const lista = ivas || [];
    const cuotasMal = lista.filter((r) => Math.abs((num(r.base) * num(r.pct)) / 100 - num(r.cuota)) >= 0.02).length;
    const sinMotivo = lista.filter((r) => porcentajeDeducible(r) < 100 && !String(r.dedMot || '').trim()).length;
    return (cuadra ? 0 : 1) + (asientoCuadra ? 0 : 1) + cuotasMal + sinMotivo;
}

/** Pestaña IS: gastos no deducibles (diferencias permanentes que se ajustan en el modelo 200) */
export function analisisIs({ x, ivas, textoLineas, direccionesAfectas }) {
    const base = ivas.reduce((a, r) => a + num(r.base), 0);
    const texto = [textoLineas, x.emisor].join(' ').toLowerCase();
    const E = (n) => euros(n) + ' €';
    const noAfecto = x.sumin && !coincideDireccion(x.sumin, direccionesAfectas);
    const nd = [];
    let noDeducible = 0;
    if (noAfecto) {
        nd.push({ titulo: 'Gasto en inmueble no afecto', ref: 'Art. 15.e LIS', texto: 'Suministro de un inmueble que no está afecto a la actividad: no hay correlación con los ingresos.', importe: E(base) });
        noDeducible += base;
    }
    const ivaNoDed = sumasIva(ivas).noDed;
    if (ivaNoDed > 0.004) {
        nd.push({ titulo: 'IVA no deducible como mayor gasto', ref: 'Art. 15 LIS', texto: 'El IVA soportado no deducible es gasto fiscal deducible en IS solo si el gasto principal lo es.', importe: E(ivaNoDed) });
        noDeducible += ivaNoDed;
    }
    if (/multa|sanción|recargo/.test(texto)) {
        nd.push({ titulo: 'Multas y sanciones', ref: 'Art. 15.c LIS', texto: 'Multas, sanciones y recargos del periodo ejecutivo no son deducibles.', importe: E(base) });
        noDeducible += base;
    }
    if (/regalo|obsequio|atenci|restaurante|comida/.test(texto)) nd.push({ titulo: 'Atenciones a clientes', ref: 'Art. 15.e LIS', texto: 'Deducible con el límite del 1 % del importe neto de la cifra de negocios.', importe: 'Límite 1 %' });
    return {
        noDeducibles: nd.map((g) => ({ ...g, cat: 'Diferencia permanente · ajuste fiscal +' })),
        total: nd.length,
        kpis: [
            { l: 'Gasto contable', v: E(base), tono: '' },
            { l: 'Gasto no deducible', v: E(noDeducible), tono: noDeducible ? 'mal' : '' },
            { l: 'Gasto fiscal deducible', v: E(base - noDeducible), tono: 'bien' },
            { l: 'Cuota IS estimada (25 %)', v: E(noDeducible * 0.25), tono: noDeducible ? 'mal' : '' }
        ]
    };
}

/** Pestaña Productos: líneas extraídas con cantidad y precio unitario ("Gasóleo A · 38,2 L") */
export function productos(lineas, ivasDoc) {
    const ivs = ivasDoc || [];
    const filas = (lineas || []).map((l, i) => {
        const importe = num(l.i);
        const m = String(l.c).match(/^(.*?)\s*·\s*([\d.,]+)\s*([A-Za-zé]+)$/);
        const cantidad = m ? num(m[2]) : 1;
        const iv = ivs.find((v) => Math.abs(num(v.base) - importe) < 0.01) || (ivs.length === (lineas || []).length ? ivs[i] : ivs[0]) || { pct: '21' };
        return {
            i,
            n: String(i + 1),
            desc: m ? m[1] : l.c,
            cantidad: (m ? m[2] : '1') + ' ' + (m ? m[3] : 'ud'),
            unitario: euros(cantidad ? importe / cantidad : importe),
            pct: iv.pct,
            importe: euros(importe)
        };
    });
    return { filas, total: euros((lineas || []).reduce((a, l) => a + num(l.i), 0)) };
}

/** Consumo de IA del documento para la cabecera */
export function consumoIa(consumo) {
    if (!consumo) return { tokens: '—', coste: '—', tip: '' };
    const n = (v) => Number(v || 0).toLocaleString('es-ES');
    return {
        tokens: n(consumo.entrada + consumo.salida),
        coste: Number(consumo.coste || 0).toLocaleString('es-ES', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' USD',
        tip: `Entrada ${n(consumo.entrada)} · Salida ${n(consumo.salida)} tokens (extracción de este documento en Vertex AI; precio en dólares)`
    };
}
