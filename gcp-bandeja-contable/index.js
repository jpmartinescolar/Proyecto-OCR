'use strict';

// Punto de entrada común de los dos servicios de Cloud Run de la Bandeja Contable.
// Mismo código y mismos módulos (db, ids, esquema); cada servicio arranca su parte según SERVICIO:
//   SERVICIO=api (por defecto)  → api.js         (sesiones de subida, confirmación, listados)
//   SERVICIO=procesador         → procesador.js  (ingestión y separación de documentos)

if (process.env.SERVICIO === 'procesador') {
  require('./procesador');
} else {
  require('./api');
}
