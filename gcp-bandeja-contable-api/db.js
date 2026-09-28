'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Cloud Run + Cloud SQL: conexión por socket unix montado con --add-cloudsql-instances
const pool = new Pool({
  host: `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 5
});

async function prepararEsquema() {
  await pool.query(fs.readFileSync(path.join(__dirname, 'esquema.sql'), 'utf8'));
}

/** Ejecuta fn(cliente) dentro de una transacción */
async function transaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = { pool, prepararEsquema, transaccion };
