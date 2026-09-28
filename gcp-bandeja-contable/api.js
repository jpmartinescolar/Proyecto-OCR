'use strict';

const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const { Storage } = require('@google-cloud/storage');
const { pool, prepararEsquema, transaccion } = require('./db');
const { nuevoId } = require('./ids');
const { procesadorConfigurado, encolarProcesamiento } = require('./tareas');

const REQUIRED_ENV = ['BUCKET_RAW', 'BUCKET_DOCS', 'INSTANCE_CONNECTION_NAME', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);

const { PROJECT_ID, BUCKET_RAW } = process.env;
const SIGNED_URL_MINUTES = 15;

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/devstorage.read_write'] });
const storage = new Storage();

const app = express();
app.use(express.json());

app.get('/', (_req, res) => res.status(200).send('bandeja-contable-api OK'));

// La autenticación la hace Cloud Run (servicio privado + IAM invoker):
// Salesforce llama con un ID token de Google firmado con su certificado.

/** "pdf" a partir del nombre (en minúsculas y solo alfanumérico); "" si no tiene */
function extensionDe(nombre) {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(String(nombre || ''));
  return m ? m[1].toLowerCase() : '';
}

/** Content-Disposition con el nombre original (RFC 5987: admite tildes y espacios) */
function disposicion(tipo, nombre) {
  return `${tipo}; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

/**
 * Registra la bandeja y el archivo en Cloud SQL y pide a Cloud Storage una sesión de subida
 * resumible. La ruta la decide Google: {sfOrgId}/{sfBandejaId}/{archivoId}.{ext}, sin CIF ni nombre del
 * cliente; el nombre original queda en SQL y en los metadatos del objeto. Si el archivo ya estaba
 * registrado y aún no se subió (reintento), se reutilizan su id y su ruta.
 */
app.post('/upload-session', async (req, res) => {
  const { sfOrgId, bandeja, archivo, origin } = req.body || {};
  if (!sfOrgId || !bandeja || !bandeja.sfId || !archivo || !archivo.sfId || !archivo.nombre) {
    return res.status(400).json({ error: 'Faltan sfOrgId, bandeja.sfId, archivo.sfId o archivo.nombre.' });
  }
  const size = Number(archivo.size);
  if (!(size > 0)) return res.status(400).json({ error: 'Falta archivo.size o no es válido.' });

  try {
    const registro = await transaccion(async (db) => {
      const b = await db.query(
        `INSERT INTO bandejas (id, sf_org_id, sf_bandeja_id, numero, sf_account_id, cif, tipo, observaciones, origen, sf_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (sf_bandeja_id) DO UPDATE SET
           numero = EXCLUDED.numero, sf_account_id = EXCLUDED.sf_account_id, cif = EXCLUDED.cif, tipo = EXCLUDED.tipo,
           observaciones = EXCLUDED.observaciones, origen = EXCLUDED.origen, updated_at = now()
         RETURNING id`,
        [nuevoId('bandeja'), sfOrgId, bandeja.sfId, bandeja.numero, bandeja.sfAccountId, bandeja.cif, bandeja.tipo,
          bandeja.observaciones, bandeja.origen, bandeja.sfUserId]
      );
      const bandejaId = b.rows[0].id;

      const existente = await db.query('SELECT id, objeto, estado FROM archivos WHERE sf_archivo_id = $1', [archivo.sfId]);
      if (existente.rows.length) {
        const a = existente.rows[0];
        if (a.estado !== 'SUBIENDO') return { conflicto: a.estado };
        await db.query(
          'UPDATE archivos SET nombre_original = $2, mime_declarado = $3, tamano = $4, updated_at = now() WHERE id = $1',
          [a.id, archivo.nombre, archivo.mime || null, size]
        );
        return { bandejaId, archivoId: a.id, objeto: a.objeto };
      }

      const archivoId = nuevoId('archivo');
      const ext = extensionDe(archivo.nombre);
      const objeto = `${sfOrgId}/${bandeja.sfId}/${archivoId}${ext ? '.' + ext : ''}`;
      await db.query(
        `INSERT INTO archivos (id, bandeja_id, origen, sf_org_id, sf_archivo_id, sf_bandeja_id, sf_account_id, cif, sf_user_id,
                               nombre_original, bucket, objeto, mime_declarado, extension, tamano, estado)
         VALUES ($1,$2,'SUBIDO',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'SUBIENDO')`,
        [archivoId, bandejaId, sfOrgId, archivo.sfId, bandeja.sfId, bandeja.sfAccountId, bandeja.cif,
          archivo.sfUserId || bandeja.sfUserId, archivo.nombre, BUCKET_RAW, objeto, archivo.mime || null, ext || null, size]
      );
      return { bandejaId, archivoId, objeto };
    });

    if (registro.conflicto) {
      return res.status(409).json({ error: `El archivo ya está registrado en Google (estado ${registro.conflicto}).` });
    }

    const client = await auth.getClient();
    const initUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(BUCKET_RAW)}/o`
      + `?uploadType=resumable&name=${encodeURIComponent(registro.objeto)}`;
    const mime = archivo.mime || 'application/octet-stream';
    const headers = {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mime,
      'X-Upload-Content-Length': String(size)
    };
    // Google solo habilita CORS en las respuestas de la subida si la sesión se crea con el
    // Origin del navegador que va a subir el archivo; sin esto el PUT del navegador llega bien
    // (200) pero el navegador bloquea la respuesta por CORS.
    if (origin) headers.Origin = origin;
    const response = await client.request({
      url: initUrl,
      method: 'POST',
      headers,
      // Metadatos del objeto: el nombre original y los Id viajan con el archivo; al abrirlo o
      // descargarlo el navegador muestra el nombre del cliente aunque la ruta sea otra.
      data: {
        contentType: mime,
        contentDisposition: disposicion('inline', archivo.nombre),
        metadata: {
          'nombre-original': archivo.nombre,
          'archivo-id': registro.archivoId,
          'sf-archivo-id': archivo.sfId,
          'sf-bandeja-id': bandeja.sfId
        }
      },
      validateStatus: () => true
    });
    const location = response.headers && (response.headers.location || response.headers.Location);
    if (response.status < 200 || response.status >= 300 || !location) {
      console.error('upload-session: Google respondio', response.status, response.data);
      return res.status(502).json({ error: 'Google no ha devuelto la sesión de subida.' });
    }
    res.json({ uploadUrl: location, gcsPath: registro.objeto, archivoId: registro.archivoId, bandejaId: registro.bandejaId });
  } catch (err) {
    console.error('upload-session error', err);
    res.status(500).json({ error: 'Error interno al crear la sesión de subida.' });
  }
});

/**
 * El navegador ha terminado la subida: se comprueba el objeto en Cloud Storage, el archivo pasa a
 * RECIBIDO y se encola su procesamiento (EN_COLA). Idempotente: confirmar dos veces no encola dos veces.
 */
app.post('/confirm', async (req, res) => {
  const { sfOrgId, sfArchivoId } = req.body || {};
  if (!sfOrgId || !sfArchivoId) return res.status(400).json({ error: 'Faltan sfOrgId o sfArchivoId.' });
  try {
    const { rows } = await pool.query(
      'SELECT id, bandeja_id, bucket, objeto, estado FROM archivos WHERE sf_archivo_id = $1 AND sf_org_id = $2',
      [sfArchivoId, sfOrgId]
    );
    if (!rows.length) return res.status(404).json({ error: 'El archivo no está registrado en Google.' });
    const a = rows[0];

    let meta;
    try {
      [meta] = await storage.bucket(a.bucket).file(a.objeto).getMetadata();
    } catch (e) {
      if (e.code === 404) return res.status(404).json({ error: 'El archivo todavía no está en Cloud Storage.' });
      throw e;
    }

    let estado = a.estado;
    if (estado === 'SUBIENDO') {
      await pool.query(
        `UPDATE archivos SET tamano = $2, crc32c = $3, gcs_generation = $4, estado = 'RECIBIDO', updated_at = now() WHERE id = $1`,
        [a.id, Number(meta.size || 0), meta.crc32c, String(meta.generation)]
      );
      estado = 'RECIBIDO';
    }

    if (estado === 'RECIBIDO' && procesadorConfigurado()) {
      try {
        await encolarProcesamiento(a.id);
        await pool.query(`UPDATE archivos SET estado = 'EN_COLA', updated_at = now() WHERE id = $1 AND estado = 'RECIBIDO'`, [a.id]);
        estado = 'EN_COLA';
      } catch (e) {
        // El archivo está a salvo en Cloud Storage: se registra la incidencia y se podrá volver a encolar
        console.error('No se ha podido encolar el procesamiento de', a.id, e.message);
        await pool.query(
          `INSERT INTO incidencias (codigo, gravedad, archivo_id, detalle) VALUES ('ENCOLAR_FALLIDO', 'AVISO', $1, $2)`,
          [a.id, JSON.stringify({ error: e.message })]
        );
      }
    }

    res.json({
      bandejaId: a.bandeja_id,
      archivoId: a.id,
      gcsObjectId: `${a.bucket}/${a.objeto}/${meta.generation}`,
      size: Number(meta.size || 0),
      crc32c: meta.crc32c,
      estado
    });
  } catch (err) {
    console.error('confirm error', err);
    res.status(500).json({ error: 'Error interno al confirmar la subida.' });
  }
});

async function urlFirmada(bucket, objeto, disposicionRespuesta) {
  const [url] = await storage.bucket(bucket).file(objeto).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + SIGNED_URL_MINUTES * 60 * 1000,
    responseDisposition: disposicionRespuesta
  });
  return url;
}

/**
 * Archivos subidos de una bandeja, con dos URL firmadas de solo lectura: viewUrl (se abre en el
 * navegador) y descargaUrl (se descarga con el nombre original). Salesforce ya ha comprobado que el
 * usuario puede ver esa bandeja antes de llamar aquí.
 */
app.post('/records', async (req, res) => {
  const { sfOrgId, sfBandejaId } = req.body || {};
  if (!sfOrgId || !sfBandejaId) return res.status(400).json({ error: 'Faltan sfOrgId o sfBandejaId.' });
  try {
    const { rows } = await pool.query(
      `SELECT id, sf_archivo_id, sf_bandeja_id, nombre_original, bucket, objeto, tamano, mime_declarado, mime_detectado,
              estado, created_at
       FROM archivos WHERE sf_org_id = $1 AND sf_bandeja_id = $2 AND origen = 'SUBIDO' ORDER BY created_at`,
      [sfOrgId, sfBandejaId]
    );
    const registros = await Promise.all(rows.map(async (r) => {
      let viewUrl = null;
      let descargaUrl = null;
      if (r.estado !== 'SUBIENDO') {
        try {
          viewUrl = await urlFirmada(r.bucket, r.objeto, disposicion('inline', r.nombre_original));
          descargaUrl = await urlFirmada(r.bucket, r.objeto, disposicion('attachment', r.nombre_original));
        } catch (e) {
          console.error('No se ha podido firmar la URL de', r.objeto, e.message);
        }
      }
      return {
        id: r.id,
        sfArchivoId: r.sf_archivo_id,
        sfBandejaId: r.sf_bandeja_id,
        nombre: r.nombre_original,
        gcsPath: r.objeto,
        size: Number(r.tamano || 0),
        mime: r.mime_detectado || r.mime_declarado,
        estado: r.estado,
        createdAt: r.created_at,
        viewUrl,
        descargaUrl
      };
    }));
    res.json({ registros });
  } catch (err) {
    console.error('records error', err);
    res.status(500).json({ error: 'Error interno al listar los archivos.' });
  }
});

const port = process.env.PORT || 8080;
prepararEsquema()
  .then(() => {
    app.listen(port, () => console.log(`bandeja-contable-api escuchando en el puerto ${port} (proyecto ${PROJECT_ID || '?'})`));
  })
  .catch((err) => {
    console.error('No se ha podido preparar el esquema de la base de datos', err);
    process.exit(1);
  });
