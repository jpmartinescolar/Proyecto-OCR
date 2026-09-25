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
    Borrador: 'bc-pill bc-pill-info',
    Cancelado: 'bc-pill bc-pill-error',
    Rechazado: 'bc-pill bc-pill-error'
};

export function claseEstado(estado) {
    return CLASE_ESTADO[estado] || 'bc-pill';
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
