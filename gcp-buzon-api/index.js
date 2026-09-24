'use strict';

const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const { Storage } = require('@google-cloud/storage');
const { Pool } = require('pg');

const PROJECT_ID = process.env.PROJECT_ID;
const BUCKET_NAME = process.env.BUCKET_NAME;
const INSTANCE_CONNECTION_NAME = process.env.INSTANCE_CONNECTION_NAME;

if (!BUCKET_NAME) throw new Error('Falta la variable de entorno BUCKET_NAME.');

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

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS buzon_uploads (
      id BIGSERIAL PRIMARY KEY,
      sf_record_id TEXT UNIQUE NOT NULL,
      sf_account_id TEXT,
      sf_org_id TEXT,
      sf_user_id TEXT,
      cif TEXT,
      gcs_path TEXT NOT NULL,
      gcs_object_id TEXT,
      size BIGINT,
      mime TEXT,
      crc32c TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

const app = express();
app.use(express.json());

app.get('/', (_req, res) => res.status(200).send('buzon-api OK'));

// La autenticacion real la hace Cloud Run (servicio privado + IAM invoker):
// Salesforce llama con un ID token de Google, no con una API key.

// Pide a Google una sesion de subida resumible para gcsPath y devuelve su URL final
app.post('/upload-session', async (req, res) => {
  const { gcsPath, size, mime, origin } = req.body || {};
  if (!gcsPath) return res.status(400).json({ error: 'Falta gcsPath.' });
  try {
    const client = await auth.getClient();
    const initUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(BUCKET_NAME)}/o`
      + `?uploadType=resumable&name=${encodeURIComponent(gcsPath)}`;
    const headers = {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mime || 'application/octet-stream',
      'X-Upload-Content-Length': String(size || 0)
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
    res.status(500).json({ error: String((err && err.message) || err) });
  }
});

// Comprueba el objeto ya subido a GCS y hace upsert del registro en Cloud SQL
app.post('/confirm', async (req, res) => {
  const { sfRecordId, sfAccountId, sfOrgId, sfUserId, cif, gcsPath, mime } = req.body || {};
  if (!sfRecordId || !gcsPath) return res.status(400).json({ error: 'Faltan sfRecordId o gcsPath.' });
  try {
    const client = await auth.getClient();
    const metaUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(BUCKET_NAME)}/o/${encodeURIComponent(gcsPath)}`;
    const response = await client.request({ url: metaUrl, method: 'GET', validateStatus: () => true });
    if (response.status !== 200) {
      return res.status(404).json({ error: 'El archivo todavia no esta en Cloud Storage.' });
    }
    const obj = response.data;
    await ensureSchema();
    await pool.query(
      `INSERT INTO buzon_uploads
         (sf_record_id, sf_account_id, sf_org_id, sf_user_id, cif, gcs_path, gcs_object_id, size, mime, crc32c, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       ON CONFLICT (sf_record_id) DO UPDATE SET
         gcs_object_id = EXCLUDED.gcs_object_id,
         size = EXCLUDED.size,
         crc32c = EXCLUDED.crc32c,
         updated_at = now()`,
      [sfRecordId, sfAccountId, sfOrgId, sfUserId, cif, gcsPath, obj.id, Number(obj.size || 0), mime, obj.crc32c]
    );
    res.json({ id: obj.id, size: Number(obj.size || 0), crc32c: obj.crc32c });
  } catch (err) {
    console.error('confirm error', err);
    res.status(500).json({ error: String((err && err.message) || err) });
  }
});

// Lista los archivos ya subidos de una empresa (cif), mas recientes primero, cada uno con una
// URL firmada de solo lectura (15 min) para que el navegador pueda previsualizarlo sin hacer
// publico el bucket. El filtro por sfOrgId+cif es el mismo control que ya aplica Salesforce
// (BuzonEmpresasService) antes de llamar aqui: esto solo devuelve lo que Apex ya autorizo.
app.post('/records', async (req, res) => {
  const { sfOrgId, cif } = req.body || {};
  if (!sfOrgId || !cif) return res.status(400).json({ error: 'Faltan sfOrgId o cif.' });
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT sf_record_id, sf_account_id, sf_user_id, cif, gcs_path, gcs_object_id, size, mime, crc32c, created_at, updated_at
       FROM buzon_uploads WHERE sf_org_id = $1 AND cif = $2 ORDER BY created_at DESC LIMIT 200`,
      [sfOrgId, cif]
    );
    const registros = await Promise.all(rows.map(async (r) => {
      let viewUrl = null;
      try {
        const [url] = await storage.bucket(BUCKET_NAME).file(r.gcs_path).getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 15 * 60 * 1000
        });
        viewUrl = url;
      } catch (e) {
        console.error('No se ha podido firmar la URL de', r.gcs_path, e.message);
      }
      return {
        sfRecordId: r.sf_record_id,
        sfAccountId: r.sf_account_id,
        sfUserId: r.sf_user_id,
        cif: r.cif,
        gcsPath: r.gcs_path,
        gcsObjectId: r.gcs_object_id,
        size: Number(r.size || 0),
        mime: r.mime,
        crc32c: r.crc32c,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        nombreArchivo: r.gcs_path.split('/').pop(),
        viewUrl
      };
    }));
    res.json({ registros });
  } catch (err) {
    console.error('records error', err);
    res.status(500).json({ error: String((err && err.message) || err) });
  }
});

const port = process.env.PORT || 8080;
ensureSchema()
  .catch((err) => console.error('No se ha podido preparar la tabla buzon_uploads', err))
  .finally(() => {
    app.listen(port, () => console.log(`buzon-api escuchando en el puerto ${port} (proyecto ${PROJECT_ID || '?'})`));
  });
