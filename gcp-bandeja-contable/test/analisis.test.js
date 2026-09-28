'use strict';

// Pruebas del análisis determinista con archivos generados en el propio test (sin datos reales).
// Ejecutar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const yazl = require('yazl');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const a = require('../analisis');

// PNG 1x1 y JPEG 1x1 mínimos válidos
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64'
);

async function pdfConPaginas(textos) {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  for (const t of textos) {
    const p = doc.addPage([595, 842]);
    if (t) p.drawText(t, { x: 50, y: 780, size: 12, font: fuente });
  }
  return Buffer.from(await doc.save());
}

function zipCon(entradas) {
  return new Promise((resolve) => {
    const z = new yazl.ZipFile();
    for (const [ruta, contenido] of entradas) {
      if (ruta.endsWith('/')) z.addEmptyDirectory(ruta);
      else z.addBuffer(contenido, ruta);
    }
    const trozos = [];
    z.outputStream.on('data', (c) => trozos.push(c)).on('end', () => resolve(Buffer.concat(trozos)));
    z.end();
  });
}

test('detecta el tipo por el contenido, no por el nombre', async () => {
  assert.equal(a.detectarTipo(await pdfConPaginas(['hola'])), 'pdf');
  assert.equal(a.detectarTipo(PNG), 'png');
  assert.equal(a.detectarTipo(JPEG), 'jpeg');
  assert.equal(a.detectarTipo(await zipCon([['a.txt', Buffer.from('x')]])), 'zip');
  assert.equal(a.detectarTipo(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0])), 'xls');
  assert.equal(a.detectarTipo(Buffer.from('MZ ejecutable')), 'desconocido');
});

test('PDF: páginas, texto por página y escaneos', async () => {
  const r = await a.analizarPdf(await pdfConPaginas(['Factura FE-001 de Endesa Energia por suministro electrico', '', 'Factura FE-002 total 121,00 euros por servicios']));
  assert.equal(r.numPaginas, 3);
  assert.equal(r.tieneTexto, true);
  assert.deepEqual(r.paginasSinTexto, [2], 'la página 2 está en blanco');
  const escaneo = await a.analizarPdf(await pdfConPaginas(['', '']));
  assert.equal(escaneo.tieneTexto, false);
});

test('PDF corrupto', async () => {
  const r = await a.analizarPdf(Buffer.from('%PDF-1.7\nesto no es un pdf de verdad'));
  assert.equal(r.corrupto, true);
});

test('imágenes: dimensiones o corrupta', () => {
  assert.deepEqual(a.analizarImagen(PNG), { ancho: 1, alto: 1, formato: 'png' });
  assert.equal(a.analizarImagen(JPEG).formato, 'jpg');
  assert.equal(a.analizarImagen(Buffer.from([0x89, 0x50, 0x4e, 0x47])).corrupto, true);
});

test('ZIP: entradas, carpetas, basura de macOS y ZIP anidado', async () => {
  const interior = await zipCon([['dentro.pdf', await pdfConPaginas(['x'])]]);
  const buf = await zipCon([
    ['facturas/', null],
    ['facturas/enero ñ.pdf', await pdfConPaginas(['Factura enero'])],
    ['foto.png', PNG],
    ['__MACOSX/facturas/._enero.pdf', Buffer.from('basura')],
    ['.DS_Store', Buffer.from('basura')],
    ['otro.zip', interior]
  ]);
  const r = await a.listarZip(buf);
  assert.equal(r.office, null);
  const utiles = r.entradas.filter((e) => !e.directorio && !e.ignorada);
  assert.deepEqual(utiles.map((e) => e.ruta).sort(), ['facturas/enero ñ.pdf', 'foto.png', 'otro.zip']);
  assert.equal(r.entradas.filter((e) => e.ignorada).length, 2);
  const pdf = await a.extraerEntrada(r.zip, utiles.find((e) => e.nombre === 'enero ñ.pdf'), 10 * 1024 * 1024);
  assert.equal(a.detectarTipo(pdf), 'pdf');
  const anidado = await a.extraerEntrada(r.zip, utiles.find((e) => e.nombre === 'otro.zip'), 10 * 1024 * 1024);
  assert.equal(a.detectarTipo(anidado), 'zip');
});

test('ZIP que en realidad es un Excel moderno', async () => {
  const xlsx = await zipCon([['[Content_Types].xml', Buffer.from('<Types/>')], ['xl/workbook.xml', Buffer.from('<workbook/>')]]);
  assert.equal((await a.listarZip(xlsx)).office, 'xlsx');
  const docx = await zipCon([['[Content_Types].xml', Buffer.from('<Types/>')], ['word/document.xml', Buffer.from('<w/>')]]);
  assert.equal((await a.listarZip(docx)).office, 'otro');
});

test('límites de seguridad de los ZIP', () => {
  const lim = { maxBytesEntrada: 100, maxBytesTotal: 1000, maxRatio: 200 };
  assert.match(a.excedeLimites({ tamano: 500, comprimido: 400 }, 0, lim), /entrada de 500 bytes/);
  assert.match(a.excedeLimites({ tamano: 90, comprimido: 80 }, 950, lim), /supera 1000 bytes/);
  const bomba = a.excedeLimites({ tamano: 50 * 1024 * 1024, comprimido: 1024 }, 0, { ...lim, maxBytesEntrada: 1e12, maxBytesTotal: 1e12 });
  assert.match(bomba, /relación de compresión/);
  assert.equal(a.excedeLimites({ tamano: 90, comprimido: 80 }, 0, lim), null);
});

test('ZIP corrupto', async () => {
  const r = await a.listarZip(Buffer.from('PK\u0003\u0004 no es un zip'));
  assert.equal(r.corrupto, true);
});
