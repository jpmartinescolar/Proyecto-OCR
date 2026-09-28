'use strict';

// Identificadores internos: ULID con prefijo de tipo (p. ej. "arc_01J9Z3K8QW…").
// ULID = 48 bits de tiempo (ms) + 80 bits aleatorios en base32 de Crockford: único sin
// coordinación, ordenable por fecha de creación y válido en rutas de Storage y URLs.

const crypto = require('crypto');

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const PREFIJOS = {
  bandeja: 'bnd',
  archivo: 'arc',
  procesamiento: 'prc',
  documento: 'doc',
  extraccion: 'ext',
  confirmacion: 'cnf'
};

function ulid(ahora = Date.now()) {
  let tiempo = '';
  let t = ahora;
  for (let i = 0; i < 10; i++) {
    tiempo = ALFABETO[t % 32] + tiempo;
    t = Math.floor(t / 32);
  }
  const bytes = crypto.randomBytes(16);
  let aleatorio = '';
  for (let i = 0; i < 16; i++) aleatorio += ALFABETO[bytes[i] % 32];
  return tiempo + aleatorio;
}

function nuevoId(tipo) {
  const prefijo = PREFIJOS[tipo];
  if (!prefijo) throw new Error(`Tipo de identificador desconocido: ${tipo}`);
  return `${prefijo}_${ulid()}`;
}

module.exports = { nuevoId, ulid };
