// Validación del archivo en el navegador. Sirve para avisar al usuario antes de subir;
// la que cuenta es la de Apex (SubirFacturasController.validarArchivo), que repite las mismas reglas.

// Extensiones permitidas y los MIME aceptados para cada una ('' = el navegador no lo sabe)
export const MIME_POR_EXTENSION = {
    pdf: ['application/pdf', ''],
    zip: ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip', ''],
    png: ['image/png', ''],
    jpg: ['image/jpeg', ''],
    jpeg: ['image/jpeg', '']
};

export const ACCEPT = Object.keys(MIME_POR_EXTENSION).map((e) => '.' + e).join(',');

export function extension(nombre) {
    const s = String(nombre || '');
    const i = s.lastIndexOf('.');
    return i < 0 ? '' : s.slice(i + 1).toLowerCase();
}

export function formatearBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1).replace('.', ',') + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
    return (n / (1024 * 1024 * 1024)).toFixed(2).replace('.', ',') + ' GB';
}

/** Devuelve null si el archivo es válido, o el mensaje de error para el usuario */
export function validarArchivo(file, maxBytes) {
    if (!file) return 'Adjunta un fichero.';
    const ext = extension(file.name);
    const mimes = MIME_POR_EXTENSION[ext];
    if (!mimes) {
        return 'Formato no permitido' + (ext ? ' (.' + ext + ')' : '') + '. Solo PDF, ZIP, PNG, JPG o JPEG.';
    }
    const mime = String(file.type || '').toLowerCase();
    if (!mimes.includes(mime)) {
        return 'El tipo del archivo (' + mime + ') no coincide con su extensión .' + ext + '.';
    }
    if (!file.size) return 'El archivo está vacío.';
    if (maxBytes && file.size > maxBytes) {
        return 'El archivo ocupa ' + formatearBytes(file.size) + ' y el máximo es ' + formatearBytes(maxBytes) + '.';
    }
    return null;
}
