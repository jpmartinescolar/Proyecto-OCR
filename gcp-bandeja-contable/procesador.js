'use strict';

// Procesador de la Bandeja Contable (Cloud Run privado; lo invoca Cloud Tasks con OIDC).
// Fase 1, paso 3: ingestión determinista, sin IA. Por cada archivo recibido:
//   tipo real por contenido → validación → ZIP: extraer y procesar su contenido → documentos
//   (por referencia al original, sin copiarlo) → incidencias → estado final.
// La separación de un PDF en varias facturas llega en el paso 4 (clasificador por página): hasta
// entonces cada archivo da un documento en revisión con el motivo SIN_CLASIFICAR.
// Diseño y estados: docs/fases/fase-1-ingestion.md

const express = require('express');
const { Storage } = require('@google-cloud/storage');
const { pool, prepararEsquema, transaccion } = require('./db');
const { nuevoId } = require('./ids');
const a = require('./analisis');

const REQUIRED_ENV = ['BUCKET_RAW', 'BUCKET_DOCS', 'INSTANCE_CONNECTION_NAME', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);

const { BUCKET_DOCS } = process.env;
const VERSION_LOGICA = 'separador@0.1.0';
const MOTOR = 'determinista'; // paso 4: el clasificador por página (Vertex) sustituye esto
// Tamaño máximo que se analiza en memoria (la instancia tiene 2 GiB); más grande → revisión
const MAX_BYTES_MEMORIA = Number(process.env.MAX_BYTES_MEMORIA || 700 * 1024 * 1024);
// Un archivo en PROCESANDO más tiempo que esto se considera abandonado (instancia caída) y se retoma
const MINUTOS_ABANDONADO = 70;

const storage = new Storage();

// ===== Registro en base de datos =====

async function incidencia(codigo, gravedad, ids, detalle) {
  await pool.query(
    'INSERT INTO incidencias (codigo, gravedad, archivo_id, documento_id, procesamiento_id, detalle) VALUES ($1,$2,$3,$4,$5,$6)',
    [codigo, gravedad, ids.archivoId || null, ids.documentoId || null, ids.procesamientoId || null, detalle ? JSON.stringify(detalle) : null]
  );
}

async function iniciarProcesamiento(archivoId, solicitadoPor) {
  const id = nuevoId('procesamiento');
  await pool.query(
    `INSERT INTO procesamientos (id, archivo_id, version_logica, motor, estado, solicitado_por) VALUES ($1,$2,$3,$4,'EN_CURSO',$5)`,
    [id, archivoId, VERSION_LOGICA, MOTOR, solicitadoPor]
  );
  return id;
}

async function terminarProcesamiento(id, estado, detalle, error) {
  await pool.query(
    'UPDATE procesamientos SET estado = $2, fin = now(), detalle = $3, error = $4 WHERE id = $1',
    [id, estado, detalle ? JSON.stringify(detalle) : null, error || null]
  );
}

/**
 * Crea un documento con el siguiente número de la bandeja (D01, D02…). El bloqueo por bandeja
 * evita que dos tareas en paralelo asignen el mismo número.
 */
async function crearDocumento(ctx, datos) {
  return transaccion(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [ctx.bandeja.id]);
    const { rows } = await db.query('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM documentos WHERE bandeja_id = $1', [ctx.bandeja.id]);
    const numero = rows[0].n;
    const id = nuevoId('documento');
    const ext = datos.extension ? '.' + datos.extension : '';
    await db.query(
      `INSERT INTO documentos (id, procesamiento_id, archivo_id, bandeja_id, numero, pagina_inicio, pagina_fin, tipo, estado,
                               motivos_revision, almacenamiento, bucket, objeto, sha256, nombre_visible)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'REFERENCIA',$11,$12,$13,$14)`,
      [id, ctx.procesamientoId, ctx.archivo.id, ctx.bandeja.id, numero, datos.paginaInicio || null, datos.paginaFin || null,
        datos.tipo || 'DESCONOCIDO', datos.estado, datos.motivos || [], ctx.archivo.bucket, ctx.archivo.objeto, ctx.sha,
        `${ctx.bandeja.numero || ctx.bandeja.id}_D${String(numero).padStart(2, '0')}${ext}`]
    );
    return id;
  });
}

// ===== Procesamiento de un archivo =====

async function descargar(archivo) {
  const [meta] = await storage.bucket(archivo.bucket).file(archivo.objeto).getMetadata();
  if (Number(meta.size) > MAX_BYTES_MEMORIA) return { demasiadoGrande: true, tamano: Number(meta.size) };
  const [buf] = await storage.bucket(archivo.bucket).file(archivo.objeto).download();
  return { buf };
}

/**
 * Procesa un archivo (subido o extraído de un ZIP) y devuelve su estado final.
 * Cada archivo tiene su propio procesamiento; el contenido de un ZIP se procesa aquí mismo.
 */
async function procesarArchivo(archivo, bandeja, solicitadoPor, profundidad = 0, contenidoPrevio = null) {
  const procesamientoId = await iniciarProcesamiento(archivo.id, solicitadoPor);
  const ids = { archivoId: archivo.id, procesamientoId };
  const detalle = { version: VERSION_LOGICA };
  const avisos = [];
  const registrar = async (codigo, gravedad, extra) => {
    if (gravedad !== 'INFO') avisos.push(codigo);
    await incidencia(codigo, gravedad, ids, extra);
  };
  const finalizar = async (estado, datosArchivo = {}, error = null) => {
    await terminarProcesamiento(procesamientoId, error ? 'ERROR' : 'TERMINADO', detalle, error);
    await pool.query(
      `UPDATE archivos SET estado = $2, mime_detectado = COALESCE($3, mime_detectado), sha256 = COALESCE($4, sha256),
              num_paginas = COALESCE($5, num_paginas), tiene_texto = COALESCE($6, tiene_texto),
              procesamiento_actual_id = $7, updated_at = now() WHERE id = $1`,
      [archivo.id, estado, datosArchivo.mime || null, datosArchivo.sha || null, datosArchivo.paginas ?? null,
        datosArchivo.tieneTexto ?? null, procesamientoId]
    );
    return estado;
  };

  // El contenido de un ZIP ya está en memoria: no se vuelve a descargar
  const descarga = contenidoPrevio ? { buf: contenidoPrevio } : await descargar(archivo);
  if (descarga.demasiadoGrande) {
    await registrar('LIMITE_SEGURIDAD', 'ERROR', { motivo: `archivo de ${descarga.tamano} bytes (máx. en memoria ${MAX_BYTES_MEMORIA})` });
    return finalizar('ERROR', {}, 'Archivo demasiado grande para analizarlo');
  }
  const buf = descarga.buf;
  const sha = a.sha256(buf);
  const ctx = { archivo, bandeja, procesamientoId, sha };

  // Mismo contenido ya recibido en otra parte: se avisa, no se descarta (lo decide el asesor)
  const dup = await pool.query(
    'SELECT id, sf_bandeja_id, nombre_original FROM archivos WHERE sha256 = $1 AND id <> $2 AND sf_org_id = $3 LIMIT 5',
    [sha, archivo.id, archivo.sf_org_id]
  );
  if (dup.rows.length) await registrar('DUPLICADO_ARCHIVO', 'AVISO', { iguales: dup.rows });

  let tipo = a.detectarTipo(buf);
  detalle.tipoDetectado = tipo;
  const extDeclarada = archivo.extension || a.extension(archivo.nombre_original);

  // ===== ZIP (u Office moderno, que por dentro es un ZIP) =====
  if (tipo === 'zip') {
    const zip = await a.listarZip(buf);
    if (zip.corrupto) {
      await registrar('ZIP_CORRUPTO', 'ERROR', { error: zip.error });
      return finalizar('ERROR', { mime: a.MIME.zip, sha }, 'ZIP corrupto');
    }
    if (zip.office === 'xlsx') {
      tipo = 'xlsx';
    } else if (zip.office === 'otro') {
      detalle.tipoDetectado = 'office-otro';
      await registrar('FORMATO_NO_SOPORTADO', 'AVISO', { tipo: 'documento de Office (no Excel)', extension: extDeclarada });
      return finalizar('NO_SOPORTADO', { sha });
    } else {
      return procesarZip(zip, ctx, { registrar, finalizar, detalle }, solicitadoPor, profundidad);
    }
  }

  // Word y Excel antiguos comparten formato (OLE2): solo se trata como Excel lo que se llama .xls
  if (tipo === 'xls' && extDeclarada && extDeclarada !== 'xls') {
    detalle.tipoDetectado = 'ole2';
    await registrar('FORMATO_NO_SOPORTADO', 'AVISO', { tipo: 'documento de Office antiguo (no Excel)', extension: extDeclarada });
    return finalizar('NO_SOPORTADO', { sha });
  }

  if (extDeclarada && !coincideExtension(tipo, extDeclarada)) {
    await registrar('TIPO_NO_COINCIDE', 'AVISO', { extension: extDeclarada, detectado: tipo });
  }

  // ===== Excel: pendiente de flujo propio (se conserva el original) =====
  if (tipo === 'xlsx' || tipo === 'xls') {
    await registrar('EXCEL_PENDIENTE_FLUJO', 'INFO', null);
    await crearDocumento(ctx, { tipo: 'HOJA_CALCULO', estado: 'REQUIERE_REVISION', motivos: ['FLUJO_PENDIENTE'], extension: tipo });
    return finalizar('PROCESADO_CON_INCIDENCIAS', { mime: a.MIME[tipo], sha });
  }

  // ===== PDF =====
  if (tipo === 'pdf') {
    const pdf = await a.analizarPdf(buf);
    if (pdf.protegido) {
      await registrar('PDF_PROTEGIDO', 'ERROR', null);
      return finalizar('ERROR', { mime: a.MIME.pdf, sha }, 'PDF protegido con contraseña');
    }
    if (pdf.corrupto) {
      await registrar('PDF_CORRUPTO', 'ERROR', { error: pdf.error });
      return finalizar('ERROR', { mime: a.MIME.pdf, sha }, 'PDF corrupto');
    }
    if (!pdf.numPaginas) {
      await registrar('PDF_SIN_PAGINAS', 'ERROR', null);
      return finalizar('ERROR', { mime: a.MIME.pdf, sha, paginas: 0 }, 'PDF sin páginas');
    }
    detalle.paginas = pdf.paginas;
    if (!pdf.tieneTexto) await registrar('SIN_TEXTO', 'INFO', { nota: 'Escaneo o imagen: la clasificación necesitará visión' });
    else if (pdf.paginasSinTexto.length) await registrar('PAGINAS_SIN_TEXTO', 'INFO', { paginas: pdf.paginasSinTexto });
    const motivos = ['SIN_CLASIFICAR'];
    await crearDocumento(ctx, { paginaInicio: 1, paginaFin: pdf.numPaginas, estado: 'REQUIERE_REVISION', motivos, extension: 'pdf' });
    return finalizar('PROCESADO_CON_INCIDENCIAS', { mime: a.MIME.pdf, sha, paginas: pdf.numPaginas, tieneTexto: pdf.tieneTexto });
  }

  // ===== Imagen: un documento =====
  if (tipo === 'png' || tipo === 'jpeg') {
    const img = a.analizarImagen(buf);
    if (img.corrupto) {
      await registrar('IMAGEN_CORRUPTA', 'ERROR', { error: img.error });
      return finalizar('ERROR', { mime: a.MIME[tipo], sha }, 'Imagen corrupta');
    }
    detalle.imagen = img;
    await crearDocumento(ctx, { paginaInicio: 1, paginaFin: 1, estado: 'REQUIERE_REVISION', motivos: ['SIN_CLASIFICAR'], extension: tipo === 'jpeg' ? 'jpg' : 'png' });
    return finalizar('PROCESADO_CON_INCIDENCIAS', { mime: a.MIME[tipo], sha, paginas: 1, tieneTexto: false });
  }

  // ===== Formato no soportado: se conserva el original =====
  await registrar('FORMATO_NO_SOPORTADO', 'AVISO', { extension: extDeclarada, mimeDeclarado: archivo.mime_declarado });
  return finalizar('NO_SOPORTADO', { sha });
}

function coincideExtension(tipo, ext) {
  const esperadas = { pdf: ['pdf'], png: ['png'], jpeg: ['jpg', 'jpeg'], xlsx: ['xlsx'], xls: ['xls'], zip: ['zip'] };
  return (esperadas[tipo] || []).includes(ext);
}

/**
 * Extrae cada entrada del ZIP al bucket de derivados, la registra como archivo EXTRAIDO_ZIP (con su
 * padre y su ruta dentro del ZIP) y la procesa igual que si la hubiera subido el cliente.
 * Sin límites de negocio: lo raro se registra como incidencia; solo los límites de seguridad cortan.
 */
async function procesarZip(zip, ctx, { registrar, finalizar, detalle }, solicitadoPor, profundidad) {
  const { archivo, bandeja, procesamientoId, sha } = ctx;
  const entradas = zip.entradas.filter((e) => !e.directorio);
  detalle.zip = { entradas: entradas.length, extraidas: 0, ignoradas: 0 };
  if (zip.errorLectura) await registrar('ZIP_LECTURA_INCOMPLETA', 'AVISO', { error: zip.errorLectura });
  if (profundidad > 0) await registrar('ZIP_ANIDADO', 'INFO', { profundidad });
  if (profundidad >= a.LIMITES_ZIP.maxProfundidad) {
    await registrar('LIMITE_SEGURIDAD', 'ERROR', { motivo: `ZIP anidado a más de ${a.LIMITES_ZIP.maxProfundidad} niveles` });
    return finalizar('ERROR', { mime: a.MIME.zip, sha }, 'Demasiados niveles de ZIP');
  }
  if (entradas.length > a.LIMITES_ZIP.maxEntradas) {
    await registrar('LIMITE_SEGURIDAD', 'ERROR', { motivo: `${entradas.length} entradas (máx. ${a.LIMITES_ZIP.maxEntradas})` });
    return finalizar('ERROR', { mime: a.MIME.zip, sha }, 'Demasiadas entradas en el ZIP');
  }
  if (!entradas.length) await registrar('ZIP_VACIO', 'AVISO', null);

  let acumulado = 0;
  const estadosHijos = [];
  for (const e of entradas) {
    if (e.ignorada) {
      detalle.zip.ignoradas++;
      await registrar('ARCHIVO_IGNORADO', 'INFO', { ruta: e.ruta }); // eslint-disable-line no-await-in-loop
      continue;
    }
    if (e.protegida) {
      await registrar('ZIP_PROTEGIDO', 'ERROR', { ruta: e.ruta }); // eslint-disable-line no-await-in-loop
      continue;
    }
    const excede = a.excedeLimites(e, acumulado);
    if (excede) {
      await registrar('LIMITE_SEGURIDAD', 'ERROR', { ruta: e.ruta, motivo: excede }); // eslint-disable-line no-await-in-loop
      continue;
    }
    // Las entradas se extraen de una en una: el procesamiento es secuencial a propósito (memoria)
    let contenido;
    try {
      contenido = await a.extraerEntrada(zip.zip, e, a.LIMITES_ZIP.maxBytesEntrada); // eslint-disable-line no-await-in-loop
    } catch (err) {
      await registrar('ZIP_ENTRADA_ILEGIBLE', 'ERROR', { ruta: e.ruta, error: err.message }); // eslint-disable-line no-await-in-loop
      continue;
    }
    acumulado += contenido.length;
    const hijoId = nuevoId('archivo');
    const ext = a.extension(e.nombre);
    const objeto = `${archivo.sf_org_id}/${archivo.sf_bandeja_id}/${archivo.id}/${procesamientoId}/contenido/${hijoId}${ext ? '.' + ext : ''}`;
    // eslint-disable-next-line no-await-in-loop
    await storage.bucket(BUCKET_DOCS).file(objeto).save(contenido, {
      resumable: false,
      metadata: {
        contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(e.nombre)}`,
        metadata: { 'nombre-original': e.nombre, 'ruta-en-zip': e.ruta, 'archivo-id': hijoId, 'padre-id': archivo.id }
      }
    });
    // eslint-disable-next-line no-await-in-loop
    const { rows } = await pool.query(
      `INSERT INTO archivos (id, bandeja_id, padre_id, origen, sf_org_id, sf_bandeja_id, sf_account_id, cif, sf_user_id, nombre_original,
                             ruta_en_zip, bucket, objeto, extension, tamano, estado)
       VALUES ($1,$2,$3,'EXTRAIDO_ZIP',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'PROCESANDO') RETURNING *`,
      [hijoId, archivo.bandeja_id, archivo.id, archivo.sf_org_id, archivo.sf_bandeja_id, archivo.sf_account_id, archivo.cif,
        archivo.sf_user_id, e.nombre, e.ruta, BUCKET_DOCS, objeto, ext || null, contenido.length]
    );
    detalle.zip.extraidas++;
    // eslint-disable-next-line no-await-in-loop
    estadosHijos.push(await procesarArchivo(rows[0], bandeja, `zip:${procesamientoId}`, profundidad + 1, contenido));
  }

  const hayProblemas = estadosHijos.some((s) => s !== 'PROCESADO') || detalle.zip.extraidas < entradas.length - detalle.zip.ignoradas;
  return finalizar(hayProblemas ? 'PROCESADO_CON_INCIDENCIAS' : 'PROCESADO', { mime: a.MIME.zip, sha });
}

// ===== Servicio =====

/**
 * Reclama el archivo para procesarlo (atómico: dos tareas a la vez no lo procesan dos veces).
 * reprocesar = true permite volver a procesar un archivo ya terminado: sus documentos vigentes
 * pasan a SUSTITUIDO y se crea un procesamiento nuevo (nunca se borra nada).
 */
async function reclamar(archivoId, reprocesar) {
  const estadosIniciales = reprocesar
    ? ['RECIBIDO', 'EN_COLA', 'PROCESADO', 'PROCESADO_CON_INCIDENCIAS', 'NO_SOPORTADO', 'ERROR']
    : ['RECIBIDO', 'EN_COLA'];
  const { rows } = await pool.query(
    `UPDATE archivos SET estado = 'PROCESANDO', updated_at = now()
     WHERE id = $1 AND origen = 'SUBIDO'
       AND (estado = ANY($2) OR (estado = 'PROCESANDO' AND updated_at < now() - make_interval(mins => $3)))
     RETURNING *`,
    [archivoId, estadosIniciales, MINUTOS_ABANDONADO]
  );
  if (!rows.length) return null;
  if (reprocesar) {
    await pool.query(
      `UPDATE documentos SET estado = 'SUSTITUIDO', updated_at = now()
       WHERE estado <> 'SUSTITUIDO' AND (archivo_id = $1 OR archivo_id IN (
         WITH RECURSIVE hijos AS (SELECT id FROM archivos WHERE padre_id = $1 UNION SELECT a.id FROM archivos a JOIN hijos h ON a.padre_id = h.id)
         SELECT id FROM hijos))`,
      [archivoId]
    );
  }
  return rows[0];
}

const app = express();
app.use(express.json());

app.get('/', (_req, res) => res.status(200).send('bandeja-contable-procesador OK'));

// Cloud Tasks reintenta si la respuesta no es 2xx: los fallos definitivos (archivo corrupto,
// formato no soportado…) se registran y responden 200; solo los temporales (red, BD) responden 500.
app.post('/procesar', async (req, res) => {
  const { archivoId, reprocesar } = req.body || {};
  if (!archivoId) return res.status(400).json({ error: 'Falta archivoId.' });
  let archivo;
  try {
    archivo = await reclamar(archivoId, Boolean(reprocesar));
    if (!archivo) return res.status(200).json({ archivoId, omitido: 'El archivo no está pendiente de procesar.' });
    const { rows } = await pool.query('SELECT id, numero FROM bandejas WHERE id = $1', [archivo.bandeja_id]);
    const estado = await procesarArchivo(archivo, rows[0], reprocesar ? 'reproceso' : 'automatico');
    console.log(JSON.stringify({ evento: 'procesado', archivoId, estado }));
    res.json({ archivoId, estado });
  } catch (err) {
    console.error('procesar error', archivoId, err);
    // Se devuelve a la cola para que Cloud Tasks lo reintente
    if (archivo) {
      await pool.query(`UPDATE archivos SET estado = 'EN_COLA', updated_at = now() WHERE id = $1 AND estado = 'PROCESANDO'`, [archivoId]).catch(() => {});
      await incidencia('PROCESAMIENTO_FALLIDO', 'AVISO', { archivoId }, { error: err.message }).catch(() => {});
    }
    res.status(500).json({ error: 'Error temporal al procesar; se reintentará.' });
  }
});

const port = process.env.PORT || 8080;
prepararEsquema()
  .then(() => app.listen(port, () => console.log(`bandeja-contable-procesador escuchando en el puerto ${port}`)))
  .catch((err) => {
    console.error('No se ha podido preparar el esquema de la base de datos', err);
    process.exit(1);
  });
