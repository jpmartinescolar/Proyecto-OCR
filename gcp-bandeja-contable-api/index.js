'use strict';

const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const { Storage } = require('@google-cloud/storage');
const { Pool } = require('pg');

const REQUIRED_ENV = ['BUCKET_NAME', 'INSTANCE_CONNECTION_NAME', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);

const { PROJECT_ID, BUCKET_NAME, INSTANCE_CONNECTION_NAME } = process.env;
const SIGNED_URL_MINUTES = 15;

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/devstorage.read_write'] });
const storage = new Storage();

// Cloud Run + Cloud SQL: conexion por socket unix montado con --add-cloudsql-instances
const pool = new Pool({
  host: `/cloudsql/${INSTANCE_CONNECTION_NAME}`,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 5
});

// bandejas = Bandeja_Contable__c (un envio) y archivos = Bandeja_Contable_Archivo__c (un archivo del envio).
// Cada fila guarda los Id de Salesforce y Salesforce guarda el id de la fila (Google_Id__c).
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bandejas (
      id BIGSERIAL PRIMARY KEY,
      sf_org_id TEXT NOT NULL,
      sf_bandeja_id TEXT UNIQUE NOT NULL,
      numero TEXT,
      sf_account_id TEXT,
      cif TEXT,
      tipo TEXT,
      observaciones TEXT,
      origen TEXT,
      sf_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS bandejas_org_cif_idx ON bandejas (sf_org_id, cif, created_at DESC);

    CREATE TABLE IF NOT EXISTS archivos (
      id BIGSERIAL PRIMARY KEY,
      bandeja_id BIGINT NOT NULL REFERENCES bandejas (id),
      sf_org_id TEXT NOT NULL,
      sf_archivo_id TEXT UNIQUE NOT NULL,
      sf_bandeja_id TEXT NOT NULL,
      sf_account_id TEXT,
      cif TEXT,
      sf_user_id TEXT,
      nombre TEXT,
      gcs_path TEXT NOT NULL,
      gcs_object_id TEXT,
      size BIGINT,
      mime TEXT,
      crc32c TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS archivos_bandeja_idx ON archivos (sf_org_id, sf_bandeja_id);
    CREATE INDEX IF NOT EXISTS archivos_org_cif_idx ON archivos (sf_org_id, cif, created_at DESC);
  `);
}

const app = express();
app.use(express.json());

app.get('/', (_req, res) => res.status(200).send('bandeja-contable-api OK'));

// La autenticacion la hace Cloud Run (servicio privado + IAM invoker):
// Salesforce llama con un ID token de Google firmado con su certificado.

// Pide a Google una sesion de subida resumible para gcsPath y devuelve su URL final
app.post('/upload-session', async (req, res) => {
  const { gcsPath, size, mime, origin } = req.body || {};
  if (!gcsPath) return res.status(400).json({ error: 'Falta gcsPath.' });
  if (!(Number(size) > 0)) return res.status(400).json({ error: 'Falta size o no es valido.' });
  try {
    const client = await auth.getClient();
    const initUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(BUCKET_NAME)}/o`
      + `?uploadType=resumable&name=${encodeURIComponent(gcsPath)}`;
    const headers = {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mime || 'application/octet-stream',
      'X-Upload-Content-Length': String(size)
    };
    // Google solo habilita CORS en las respuestas de la subida si la sesion se crea con el
    // Origin del navegador que va a subir el archivo; sin esto el PUT del navegador llega bien
    // (200) pero el navegador bloquea la respuesta por CORS.
    if (origin) headers.Origin = origin;
    const response = await client.request({
      url: initUrl,
      method: 'POST',
      headers,
      data: {},
      validateStatus: () => true
    });
    const location = response.headers && (response.headers.location || response.headers.Location);
    if (response.status < 200 || response.status >= 300 || !location) {
      console.error('upload-session: Google respondio', response.status, response.data);
      return res.status(502).json({ error: 'Google no ha devuelto la sesion de subida.' });
    }
    res.json({ uploadUrl: location });
  } catch (err) {
    console.error('upload-session error', err);
    res.status(500).json({ error: 'Error interno al crear la sesion de subida.' });
  }
});

// Comprueba el objeto ya subido a GCS y registra en Cloud SQL la bandeja y el archivo (upsert por
// sus Id de Salesforce: un reintento no duplica). Devuelve los id de Google para guardarlos en Salesforce.
app.post('/confirm', async (req, res) => {
  const { sfOrgId, bandeja, archivo } = req.body || {};
  if (!sfOrgId || !bandeja || !bandeja.sfId || !archivo || !archivo.sfId || !archivo.gcsPath) {
    return res.status(400).json({ error: 'Faltan sfOrgId, bandeja.sfId, archivo.sfId o archivo.gcsPath.' });
  }
  let db;
  try {
    const client = await auth.getClient();
    const metaUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(BUCKET_NAME)}/o/${encodeURIComponent(archivo.gcsPath)}`;
    const response = await client.request({ url: metaUrl, method: 'GET', validateStatus: () => true });
    if (response.status !== 200) {
      return res.status(404).json({ error: 'El archivo todavia no esta en Cloud Storage.' });
    }
    const obj = response.data;
    const size = Number(obj.size || 0);

    db = await pool.connect();
    await db.query('BEGIN');
    const b = await db.query(
      `INSERT INTO bandejas (sf_org_id, sf_bandeja_id, numero, sf_account_id, cif, tipo, observaciones, origen, sf_user_id, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (sf_bandeja_id) DO UPDATE SET
         numero = EXCLUDED.numero,
         sf_account_id = EXCLUDED.sf_account_id,
         cif = EXCLUDED.cif,
         tipo = EXCLUDED.tipo,
         observaciones = EXCLUDED.observaciones,
         origen = EXCLUDED.origen,
         updated_at = now()
       RETURNING id`,
      [sfOrgId, bandeja.sfId, bandeja.numero, bandeja.sfAccountId, bandeja.cif, bandeja.tipo,
        bandeja.observaciones, bandeja.origen, bandeja.sfUserId]
    );
    const bandejaId = b.rows[0].id;
    // Se guardan tipo y tamano tal como constan en Cloud Storage para el objeto ya subido
    const a = await db.query(
      `INSERT INTO archivos
         (bandeja_id, sf_org_id, sf_archivo_id, sf_bandeja_id, sf_account_id, cif, sf_user_id, nombre,
          gcs_path, gcs_object_id, size, mime, crc32c, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
       ON CONFLICT (sf_archivo_id) DO UPDATE SET
         nombre = EXCLUDED.nombre,
         gcs_path = EXCLUDED.gcs_path,
         gcs_object_id = EXCLUDED.gcs_object_id,
         size = EXCLUDED.size,
         mime = EXCLUDED.mime,
         crc32c = EXCLUDED.crc32c,
         updated_at = now()
       RETURNING id`,
      [bandejaId, sfOrgId, archivo.sfId, bandeja.sfId, bandeja.sfAccountId, bandeja.cif, archivo.sfUserId,
        archivo.nombre, archivo.gcsPath, obj.id, size, obj.contentType, obj.crc32c]
    );
    await db.query('COMMIT');
    res.json({
      bandejaId: String(bandejaId),
      archivoId: String(a.rows[0].id),
      gcsObjectId: obj.id,
      size,
      crc32c: obj.crc32c
    });
  } catch (err) {
    if (db) await db.query('ROLLBACK').catch(() => {});
    console.error('confirm error', err);
    res.status(500).json({ error: 'Error interno al confirmar la subida.' });
  } finally {
    if (db) db.release();
  }
});

// Lista los archivos de una bandeja (sfBandejaId) o de una empresa (cif), mas recientes primero,
// cada uno con una URL firmada de solo lectura para previsualizarlo sin hacer publico el bucket.
// Salesforce ya ha comprobado que el usuario puede ver esa bandeja o empresa antes de llamar aqui.
app.post('/records', async (req, res) => {
  const { sfOrgId, sfBandejaId, cif } = req.body || {};
  if (!sfOrgId || (!sfBandejaId && !cif)) {
    return res.status(400).json({ error: 'Faltan sfOrgId y sfBandejaId o cif.' });
  }
  try {
    const filtro = sfBandejaId ? 'sf_bandeja_id = $2' : 'cif = $2';
    const { rows } = await pool.query(
      `SELECT id, sf_archivo_id, sf_bandeja_id, sf_account_id, sf_user_id, cif, nombre, gcs_path, gcs_object_id,
              size, mime, crc32c, created_at, updated_at
       FROM archivos WHERE sf_org_id = $1 AND ${filtro} ORDER BY created_at DESC LIMIT 200`,
      [sfOrgId, sfBandejaId || cif]
    );
    const registros = await Promise.all(rows.map(async (r) => {
      let viewUrl = null;
      try {
        const [url] = await storage.bucket(BUCKET_NAME).file(r.gcs_path).getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + SIGNED_URL_MINUTES * 60 * 1000
        });
        viewUrl = url;
      } catch (e) {
        console.error('No se ha podido firmar la URL de', r.gcs_path, e.message);
      }
      return {
        id: String(r.id),
        sfArchivoId: r.sf_archivo_id,
        sfBandejaId: r.sf_bandeja_id,
        sfAccountId: r.sf_account_id,
        sfUserId: r.sf_user_id,
        cif: r.cif,
        nombre: r.nombre,
        gcsPath: r.gcs_path,
        gcsObjectId: r.gcs_object_id,
        size: Number(r.size || 0),
        mime: r.mime,
        crc32c: r.crc32c,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        viewUrl
      };
    }));
    res.json({ registros });
  } catch (err) {
    console.error('records error', err);
    res.status(500).json({ error: 'Error interno al listar los archivos.' });
  }
});

const port = process.env.PORT || 8080;
ensureSchema()
  .then(() => {
    app.listen(port, () => console.log(`bandeja-contable-api escuchando en el puerto ${port} (proyecto ${PROJECT_ID || '?'})`));
  })
  .catch((err) => {
    console.error('No se ha podido preparar el esquema de la base de datos', err);
    process.exit(1);
  });
