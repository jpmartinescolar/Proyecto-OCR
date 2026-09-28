// Utilidades de presentación compartidas por las pantallas de la Bandeja Contable.

const FECHA_HORA = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const FECHA = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function fechaHora(valor) {
    return valor ? FECHA_HORA.format(new Date(valor)) : '';
}

export function fecha(valor) {
    return valor ? FECHA.format(new Date(valor)) : '';
}

export function diasDesde(valor) {
    if (!valor) return 0;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const d = new Date(valor);
    d.setHours(0, 0, 0, 0);
    return Math.round((hoy - d) / 86400000);
}

export function bytes(n) {
    const v = Number(n) || 0;
    if (v < 1024) return v + ' B';
    if (v < 1024 * 1024) return (v / 1024).toFixed(0) + ' KB';
    if (v < 1024 * 1024 * 1024) return (v / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
    return (v / (1024 * 1024 * 1024)).toFixed(2).replace('.', ',') + ' GB';
}

/** "1.234,56" → 1234.56 */
export function num(s) {
    return parseFloat(String(s ?? '').replace(/\./g, '').replace(',', '.')) || 0;
}

/** 1234.56 → "1.234,56" */
export function euros(n) {
    return Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function extension(nombre) {
    const s = String(nombre || '');
    const i = s.lastIndexOf('.');
    return i < 0 ? '' : s.slice(i + 1).toUpperCase();
}

const CLASE_ESTADO = {
    // Bandeja
    Pendiente: 'bc-pill bc-pill-pendiente',
    Completado: 'bc-pill bc-pill-ok',
    // Subida
    Completada: 'bc-pill bc-pill-ok',
    'En curso': 'bc-pill bc-pill-pendiente',
    'Con errores': 'bc-pill bc-pill-error',
    'Sin archivos': 'bc-pill',
    // Archivo
    Sincronizado: 'bc-pill bc-pill-ok',
    Subido: 'bc-pill bc-pill-pendiente',
    Subiendo: 'bc-pill bc-pill-pendiente',
    Error: 'bc-pill bc-pill-error',
    // Documento OCR
    Contabilizado: 'bc-pill bc-pill-ok',
    'No contabilizado': 'bc-pill bc-pill-error',
    'Pre-validado': 'bc-pill bc-pill-ok',
    Incidencia: 'bc-pill bc-pill-error'
};

export function claseEstado(estado) {
    return CLASE_ESTADO[estado] || 'bc-pill';
}

// ===== Procesamiento en Google (estados de docs/fases/fase-1-ingestion.md) =====
// "Requiere revisión" no es un error: es trabajo para el asesor (tono ámbar). Solo ERROR es rojo.

const ESTADO_ARCHIVO_GOOGLE = {
    SUBIENDO: ['Subiendo', 'info', 'El archivo se está subiendo a Google.'],
    RECIBIDO: ['En cola', 'info', 'Recibido en Google, esperando turno para procesarse.'],
    EN_COLA: ['En cola', 'info', 'Recibido en Google, esperando turno para procesarse.'],
    PROCESANDO: ['Procesando', 'info', 'Google está separando y leyendo el archivo.'],
    PROCESADO: ['Procesado', 'ok', 'Separado y leído: todos los documentos están listos.'],
    PROCESADO_CON_INCIDENCIAS: ['Procesado · revisar', 'aviso', 'Separado y leído; algún documento necesita que lo revises.'],
    NO_SOPORTADO: ['Formato no soportado', 'aviso', 'Se conserva el original, pero no se puede procesar.'],
    ERROR: ['No se ha podido procesar', 'error', 'El archivo está dañado, protegido o supera los límites.']
};

const INCIDENCIAS = {
    DUPLICADO_ARCHIVO: 'Ya se había subido este mismo archivo',
    SIN_TEXTO: 'Escaneado: leído con visión artificial',
    PAGINAS_SIN_TEXTO: 'Algunas páginas escaneadas',
    VARIOS_DOCUMENTOS: 'Contenía varios documentos: separados',
    PAGINAS_EN_BLANCO: 'Páginas en blanco descartadas',
    ZIP_ANIDADO: 'ZIP dentro de otro ZIP',
    ARCHIVO_IGNORADO: 'Archivos de sistema ignorados',
    EXCEL_PENDIENTE_FLUJO: 'Excel: se conserva, su flujo está pendiente',
    CLASIFICADOR_FALLIDO: 'No se pudo leer con IA (se puede reprocesar)',
    TIPO_NO_COINCIDE: 'La extensión no coincide con el contenido',
    FORMATO_NO_SOPORTADO: 'Formato no soportado',
    ZIP_VACIO: 'ZIP vacío',
    DOCUMENTO_EN_BLANCO: 'Todas las páginas en blanco',
    PDF_NO_RENDERIZABLE: 'No se pudo convertir en imagen',
    PDF_PROTEGIDO: 'PDF protegido con contraseña',
    PDF_CORRUPTO: 'PDF dañado',
    PDF_SIN_PAGINAS: 'PDF sin páginas',
    IMAGEN_CORRUPTA: 'Imagen dañada',
    ZIP_CORRUPTO: 'ZIP dañado',
    ZIP_PROTEGIDO: 'ZIP con contraseña',
    ZIP_ENTRADA_ILEGIBLE: 'Un archivo del ZIP no se pudo leer',
    LIMITE_SEGURIDAD: 'Supera los límites de seguridad',
    ARCHIVO_NO_ENCONTRADO: 'El archivo no está en Google',
    ENCOLAR_FALLIDO: 'No se pudo poner en cola',
    PROCESAMIENTO_FALLIDO: 'Fallo temporal (se reintenta solo)',
    EXTRACCION_FALLIDA: 'No se pudieron extraer los datos de algún documento (se puede reprocesar)',
    FACTURA_ESTRUCTURADA: 'Factura electrónica estructurada (XML)'
};

const MOTIVOS_REVISION = {
    SIN_CLASIFICAR: 'Pendiente de leer con IA',
    FLUJO_PENDIENTE: 'Excel: flujo pendiente',
    NO_PARECE_FACTURA: 'No parece una factura',
    BAJA_CONFIANZA: 'Lectura dudosa',
    VARIOS_TIPOS_MEZCLADOS: 'Mezcla de tipos',
    SEPARACION_INCIERTA: 'Separación dudosa',
    DUPLICADO: 'Archivo duplicado',
    PAGINA_EN_BLANCO: 'En blanco',
    ILEGIBLE: 'Ilegible',
    DESCUADRE: 'Los importes no cuadran',
    LECTURA_DISCREPANTE: 'Importes a comprobar',
    NO_CORRESPONDE_EMPRESA: 'Otro destinatario',
    SIN_EXTRAER: 'Sin datos extraídos'
};

export const TIPOS_DOCUMENTO = {
    FACTURA: 'Factura',
    FACTURA_SIMPLIFICADA: 'Ticket',
    RECTIFICATIVA: 'Rectificativa',
    ALBARAN: 'Albarán',
    PRESUPUESTO: 'Presupuesto',
    HOJA_CALCULO: 'Hoja de cálculo',
    OTRO: 'Otro documento',
    DESCONOCIDO: 'Sin clasificar'
};

const CLASE_TONO = { ok: 'bc-pill bc-pill-ok', aviso: 'bc-pill bc-pill-pendiente', error: 'bc-pill bc-pill-error', info: 'bc-pill bc-pill-info' };

/** Estados de Google en los que el archivo todavía no ha terminado (la pantalla se refresca sola) */
export const ESTADOS_EN_CURSO = ['SUBIENDO', 'RECIBIDO', 'EN_COLA', 'PROCESANDO'];

/** Cómo mostrar el estado de un archivo en Google: { texto, clase, explicacion, incidencias[] } */
export function estadoArchivoGoogle(archivoGoogle) {
    if (!archivoGoogle) return { texto: 'Sin datos de Google', clase: 'bc-pill', explicacion: '', incidencias: [], enCurso: false };
    const [texto, tono, explicacion] = ESTADO_ARCHIVO_GOOGLE[archivoGoogle.estado] || [archivoGoogle.estado, 'info', ''];
    const p = archivoGoogle.procesamiento || {};
    const partes = [];
    if (p.paginas) partes.push(p.paginas === 1 ? '1 página' : `${p.paginas} páginas`);
    if (p.extraidos) partes.push(`${p.extraidos} ${p.extraidos === 1 ? 'archivo' : 'archivos'} dentro`);
    if (p.documentos) {
        const det = [p.listos ? `${p.listos} ${p.listos === 1 ? 'listo' : 'listos'}` : '', p.enRevision ? `${p.enRevision} para revisar` : '',
            p.conError ? `${p.conError} con error` : ''].filter(Boolean).join(', ');
        partes.push(`${p.documentos} ${p.documentos === 1 ? 'documento' : 'documentos'}${det ? ' (' + det + ')' : ''}`);
    }
    const incidencias = (p.incidencias || []).map((i) => ({
        key: i.codigo,
        texto: (INCIDENCIAS[i.codigo] || i.codigo) + (i.veces > 1 ? ` (${i.veces})` : ''),
        clase: 'reg-incidencia reg-incidencia-' + (i.gravedad || 'INFO').toLowerCase()
    }));
    return { texto, clase: CLASE_TONO[tono], explicacion, resumen: partes.join(' · '), incidencias, enCurso: ESTADOS_EN_CURSO.includes(archivoGoogle.estado) };
}

/** Cómo mostrar un documento de Google: { estadoTxt, clase, motivosTxt, tipoTxt } */
export function estadoDocumentoGoogle(doc) {
    const motivos = (doc.motivos || []).map((m) => MOTIVOS_REVISION[m] || m);
    let estadoTxt = 'Revisar';
    let tono = 'aviso';
    if (doc.estado === 'LISTO') { estadoTxt = 'Listo'; tono = 'ok'; }
    else if (doc.estado === 'DESCARTADO') { estadoTxt = 'Descartado'; tono = 'info'; }
    else if (doc.estado === 'ERROR') { estadoTxt = 'Error'; tono = 'error'; }
    return { estadoTxt, clase: CLASE_TONO[tono], motivosTxt: motivos.join(' · '), tipoTxt: TIPOS_DOCUMENTO[doc.tipo] || doc.tipo };
}

/** Evento de navegación interna que atiende bandejaContableApp */
export function eventoNavegar(detail) {
    return new CustomEvent('navegar', { detail });
}

export function mensajeError(err) {
    if (!err) return 'Error desconocido';
    if (typeof err === 'string') return err;
    if (err.body) {
        if (Array.isArray(err.body)) return err.body.map((e) => e.message).join(', ');
        if (err.body.message) return err.body.message;
    }
    return err.message || JSON.stringify(err);
}
