'use strict';

// Encola en Cloud Tasks el procesamiento de un archivo. Se usa la API REST de Cloud Tasks con
// google-auth-library (el cliente oficial actual solo existe como módulo ES para Node 22+).
// La tarea llama al procesador con un token OIDC de su cuenta de servicio (TASKS_SA).

const { GoogleAuth } = require('google-auth-library');

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

const { TASKS_QUEUE, TASKS_SA, PROCESADOR_URL } = process.env;

/** ¿Está configurado el procesador? Hasta el paso 3 de la Fase 1 no existe y los archivos quedan en RECIBIDO */
function procesadorConfigurado() {
  return Boolean(TASKS_QUEUE && TASKS_SA && PROCESADOR_URL);
}

/**
 * Crea la tarea "procesar archivoId". El nombre de la tarea incluye el archivo y un sufijo: Cloud Tasks
 * rechaza (409) un nombre repetido durante un tiempo, lo que evita procesar dos veces por un reintento.
 * Devuelve true si se encoló o ya estaba encolada.
 */
async function encolarProcesamiento(archivoId, sufijo = 'inicial') {
  const cliente = await auth.getClient();
  const nombre = `${TASKS_QUEUE}/tasks/${archivoId}-${sufijo}`.replace(/[^A-Za-z0-9/_-]/g, '-');
  const res = await cliente.request({
    url: `https://cloudtasks.googleapis.com/v2/${TASKS_QUEUE}/tasks`,
    method: 'POST',
    data: {
      task: {
        name: nombre,
        httpRequest: {
          httpMethod: 'POST',
          url: `${PROCESADOR_URL}/procesar`,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify({ archivoId })).toString('base64'),
          oidcToken: { serviceAccountEmail: TASKS_SA, audience: PROCESADOR_URL }
        }
      }
    },
    validateStatus: () => true
  });
  if (res.status === 409) return true; // ya estaba encolada
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Cloud Tasks ha respondido ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`);
  }
  return true;
}

module.exports = { procesadorConfigurado, encolarProcesamiento };
