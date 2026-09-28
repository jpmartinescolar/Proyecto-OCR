'use strict';

// Análisis determinista de archivos (sin IA): tipo real por contenido, PDF, imágenes y ZIP.
// Funciones puras sobre Buffers: no tocan Google ni la base de datos (se prueban en test/).

const crypto = require('crypto');
const yauzl = require('yauzl');
const { imageSize } = require('image-size');

const MIME = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
  zip: 'application/zip',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel'
};

// Límites de seguridad de los ZIP (no son reglas de negocio: si se superan, el archivo queda en
// revisión con su incidencia). Configurables por variables de entorno.
const LIMITES_ZIP = {
  maxEntradas: Number(process.env.ZIP_MAX_ENTRADAS || 5000),
  maxBytesEntrada: Number(process.env.ZIP_MAX_BYTES_ENTRADA || 1024 * 1024 * 1024), // 1 GiB
  maxBytesTotal: Number(process.env.ZIP_MAX_BYTES_TOTAL || 4 * 1024 * 1024 * 1024), // 4 GiB
  maxRatio: Number(process.env.ZIP_MAX_RATIO || 200), // descomprimido / comprimido
  maxProfundidad: Number(process.env.ZIP_MAX_PROFUNDIDAD || 5)
};

// Entradas que no son documentos del cliente: se ignoran (con incidencia INFO)
const IGNORADOS = [/^__MACOSX\//, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/i, /(^|\/)desktop\.ini$/i, /(^|\/)\._/];

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Tipo por los primeros bytes (no por la extensión ni por lo que declara el navegador).
 * Un ZIP puede ser un Office moderno (xlsx/docx): se distingue después, al ver sus entradas.
 */
function detectarTipo(buf) {
  const empieza = (bytes, offset = 0) => bytes.every((b, i) => buf[offset + i] === b);
  if (buf.length >= 5 && buf.slice(0, 1024).includes('%PDF-')) return 'pdf';
  if (empieza([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (empieza([0xff, 0xd8, 0xff])) return 'jpeg';
  if (empieza([0x50, 0x4b, 0x03, 0x04]) || empieza([0x50, 0x4b, 0x05, 0x06])) return 'zip';
  if (empieza([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'xls'; // OLE2 (Office antiguo)
  return 'desconocido';
}

let pdfjs;
async function cargarPdfjs() {
  // pdfjs-dist es un módulo ES: se carga con import() dinámico desde CommonJS
  if (!pdfjs) pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

/**
 * Nº de páginas y cantidad de texto por página. Un PDF sin texto es un escaneo (necesitará
 * visión para clasificarlo). Devuelve { protegido } o { corrupto } si no se puede abrir.
 */
async function analizarPdf(buf) {
  const lib = await cargarPdfjs();
  let doc;
  // En pdfjs 6 los recursos se liberan desde la tarea de carga (loadingTask.destroy)
  let carga;
  try {
    carga = lib.getDocument({
      data: new Uint8Array(buf),
      useSystemFonts: false,
      disableFontFace: true,
      isEvalSupported: false,
      verbosity: 0
    });
    doc = await carga.promise;
  } catch (e) {
    if (carga) await carga.destroy().catch(() => {});
    if (e && e.name === 'PasswordException') return { protegido: true };
    return { corrupto: true, error: (e && e.message) || String(e) };
  }
  try {
    const paginas = [];
    for (let n = 1; n <= doc.numPages; n++) {
      // eslint-disable-next-line no-await-in-loop -- páginas en orden y sin disparar la memoria
      const pagina = await doc.getPage(n);
      // eslint-disable-next-line no-await-in-loop
      const contenido = await pagina.getTextContent();
      const texto = contenido.items.map((i) => i.str || '').join(' ').replace(/\s+/g, ' ').trim();
      paginas.push({ numero: n, caracteres: texto.length });
      pagina.cleanup();
    }
    return {
      numPaginas: doc.numPages,
      paginas,
      tieneTexto: paginas.some((p) => p.caracteres > 20),
      paginasSinTexto: paginas.filter((p) => p.caracteres <= 20).map((p) => p.numero)
    };
  } finally {
    await carga.destroy();
  }
}

/** Dimensiones de una imagen; { corrupto } si no se puede leer */
function analizarImagen(buf) {
  try {
    const { width, height, type } = imageSize(buf);
    return { ancho: width, alto: height, formato: type };
  } catch (e) {
    return { corrupto: true, error: e.message };
  }
}

function abrirZip(buf) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true }, (err, zip) => (err ? reject(err) : resolve(zip)));
  });
}

/**
 * Recorre un ZIP y devuelve sus entradas con lo que se sabe de cada una, sin descomprimir.
 * También dice si en realidad es un Office moderno (xlsx u otro).
 */
async function listarZip(buf) {
  let zip;
  try {
    zip = await abrirZip(buf);
  } catch (e) {
    return { corrupto: true, error: e.message };
  }
  const entradas = [];
  await new Promise((resolve, reject) => {
    zip.on('entry', (e) => {
      const ruta = e.fileName;
      entradas.push({
        ruta,
        nombre: ruta.split('/').pop(),
        directorio: ruta.endsWith('/'),
        ignorada: IGNORADOS.some((re) => re.test(ruta)),
        protegida: (e.generalPurposeBitFlag & 0x1) === 0x1,
        tamano: e.uncompressedSize,
        comprimido: e.compressedSize,
        _entrada: e
      });
      zip.readEntry();
    });
    zip.on('end', resolve);
    zip.on('error', reject);
    zip.readEntry();
  }).catch((e) => {
    entradas.error = e.message;
  });
  const nombres = entradas.map((e) => e.ruta);
  let office = null;
  if (nombres.includes('[Content_Types].xml')) {
    office = nombres.some((n) => n.startsWith('xl/')) ? 'xlsx' : 'otro';
  }
  return { zip, entradas, office, errorLectura: entradas.error || null };
}

/** Descomprime una entrada (de listarZip) a Buffer, cortando si supera maxBytes */
function extraerEntrada(zip, entrada, maxBytes) {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entrada._entrada, (err, stream) => {
      if (err) return reject(err);
      const trozos = [];
      let total = 0;
      stream.on('data', (c) => {
        total += c.length;
        if (total > maxBytes) {
          stream.destroy(new Error(`La entrada supera el límite de ${maxBytes} bytes`));
          return;
        }
        trozos.push(c);
      });
      stream.on('end', () => resolve(Buffer.concat(trozos)));
      stream.on('error', reject);
    });
  });
}

/**
 * Motivo por el que una entrada no se debe descomprimir (límites de seguridad), o null.
 * La relación de compresión delata las "bombas ZIP" (pocos KB que se expanden a GB).
 */
function excedeLimites(entrada, acumulado, limites = LIMITES_ZIP) {
  if (entrada.tamano > limites.maxBytesEntrada) return `entrada de ${entrada.tamano} bytes (máx. ${limites.maxBytesEntrada})`;
  if (acumulado + entrada.tamano > limites.maxBytesTotal) return `el ZIP supera ${limites.maxBytesTotal} bytes descomprimido`;
  if (entrada.comprimido > 0 && entrada.tamano / entrada.comprimido > limites.maxRatio && entrada.tamano > 10 * 1024 * 1024) {
    return `relación de compresión ${Math.round(entrada.tamano / entrada.comprimido)}:1 (máx. ${limites.maxRatio}:1)`;
  }
  return null;
}

function extension(nombre) {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(String(nombre || ''));
  return m ? m[1].toLowerCase() : '';
}

module.exports = {
  MIME,
  LIMITES_ZIP,
  sha256,
  detectarTipo,
  analizarPdf,
  analizarImagen,
  listarZip,
  extraerEntrada,
  excedeLimites,
  extension
};
