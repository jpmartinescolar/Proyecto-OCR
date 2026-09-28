-- Esquema de la Bandeja Contable en Cloud SQL (Postgres 16). Idempotente: se ejecuta al arrancar la API.
-- Diseño y estados: docs/fases/fase-1-ingestion.md. Los id internos son ULID con prefijo (ids.js).

-- Un envío de Salesforce (Bandeja_Contable__c)
CREATE TABLE IF NOT EXISTS bandejas (
  id              TEXT PRIMARY KEY,                -- bnd_…
  sf_org_id       TEXT NOT NULL,
  sf_bandeja_id   TEXT NOT NULL UNIQUE,
  numero          TEXT,
  sf_account_id   TEXT,
  cif             TEXT,
  tipo            TEXT,
  observaciones   TEXT,
  origen          TEXT,
  sf_user_id      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bandejas_org_cif_idx ON bandejas (sf_org_id, cif, created_at DESC);

-- Un fichero: el que subió el cliente (SUBIDO, espejo de Bandeja_Contable_Archivo__c) o uno sacado de un ZIP (EXTRAIDO_ZIP)
CREATE TABLE IF NOT EXISTS archivos (
  id                       TEXT PRIMARY KEY,       -- arc_…
  bandeja_id               TEXT NOT NULL REFERENCES bandejas (id),
  padre_id                 TEXT REFERENCES archivos (id),
  origen                   TEXT NOT NULL CHECK (origen IN ('SUBIDO', 'EXTRAIDO_ZIP')),
  sf_org_id                TEXT NOT NULL,
  sf_archivo_id            TEXT UNIQUE,            -- solo los SUBIDO
  sf_bandeja_id            TEXT NOT NULL,
  sf_account_id            TEXT,
  cif                      TEXT,
  sf_user_id               TEXT,
  nombre_original          TEXT NOT NULL,          -- exacto, tal como lo subió el cliente
  ruta_en_zip              TEXT,
  bucket                   TEXT NOT NULL,
  objeto                   TEXT NOT NULL,
  mime_declarado           TEXT,
  mime_detectado           TEXT,
  extension                TEXT,
  tamano                   BIGINT,
  sha256                   TEXT,
  crc32c                   TEXT,
  gcs_generation           TEXT,
  num_paginas              INTEGER,
  tiene_texto              BOOLEAN,
  estado                   TEXT NOT NULL CHECK (estado IN ('SUBIENDO', 'RECIBIDO', 'EN_COLA', 'PROCESANDO', 'PROCESADO',
                                                           'PROCESADO_CON_INCIDENCIAS', 'NO_SOPORTADO', 'ERROR')),
  procesamiento_actual_id  TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bucket, objeto)
);
CREATE INDEX IF NOT EXISTS archivos_bandeja_idx ON archivos (bandeja_id);
CREATE INDEX IF NOT EXISTS archivos_sf_bandeja_idx ON archivos (sf_org_id, sf_bandeja_id);
CREATE INDEX IF NOT EXISTS archivos_padre_idx ON archivos (padre_id);
CREATE INDEX IF NOT EXISTS archivos_sha256_idx ON archivos (sha256);

-- Una ejecución (versionada) de la lógica de separación sobre un archivo. Reprocesar = nueva fila.
CREATE TABLE IF NOT EXISTS procesamientos (
  id               TEXT PRIMARY KEY,               -- prc_…
  archivo_id       TEXT NOT NULL REFERENCES archivos (id),
  version_logica   TEXT NOT NULL,                  -- p. ej. separador@1.0.0
  motor            TEXT,                           -- p. ej. vertex/gemini-2.5-flash-lite
  estado           TEXT NOT NULL CHECK (estado IN ('EN_CURSO', 'TERMINADO', 'ERROR')),
  inicio           TIMESTAMPTZ NOT NULL DEFAULT now(),
  fin              TIMESTAMPTZ,
  error            TEXT,
  detalle          JSONB,                          -- análisis página a página
  tokens_entrada   INTEGER,
  tokens_salida    INTEGER,
  coste_estimado   NUMERIC(12, 6),
  solicitado_por   TEXT NOT NULL DEFAULT 'automatico'
);
CREATE INDEX IF NOT EXISTS procesamientos_archivo_idx ON procesamientos (archivo_id, inicio DESC);

-- Un documento lógico (una factura, un albarán…): páginas X–Y de un archivo
CREATE TABLE IF NOT EXISTS documentos (
  id                 TEXT PRIMARY KEY,             -- doc_…
  procesamiento_id   TEXT NOT NULL REFERENCES procesamientos (id),
  archivo_id         TEXT NOT NULL REFERENCES archivos (id),
  bandeja_id         TEXT NOT NULL REFERENCES bandejas (id),
  numero             INTEGER NOT NULL,             -- D01, D02… dentro de la bandeja
  pagina_inicio      INTEGER,
  pagina_fin         INTEGER,
  tipo               TEXT NOT NULL DEFAULT 'DESCONOCIDO' CHECK (tipo IN ('FACTURA', 'FACTURA_SIMPLIFICADA', 'RECTIFICATIVA',
                                                                        'ALBARAN', 'PRESUPUESTO', 'HOJA_CALCULO', 'OTRO', 'DESCONOCIDO')),
  confianza          NUMERIC(4, 3),
  estado             TEXT NOT NULL CHECK (estado IN ('LISTO', 'REQUIERE_REVISION', 'DESCARTADO', 'ERROR', 'SUSTITUIDO')),
  motivos_revision   TEXT[] NOT NULL DEFAULT '{}',
  almacenamiento     TEXT NOT NULL CHECK (almacenamiento IN ('REFERENCIA', 'DERIVADO')),
  bucket             TEXT NOT NULL,
  objeto             TEXT NOT NULL,
  sha256             TEXT,
  nombre_visible     TEXT,
  sustituido_por     TEXT REFERENCES documentos (id),
  sf_sincronizado    BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documentos_bandeja_idx ON documentos (bandeja_id, numero);
CREATE INDEX IF NOT EXISTS documentos_archivo_idx ON documentos (archivo_id);
CREATE INDEX IF NOT EXISTS documentos_estado_idx ON documentos (estado);

-- Todo lo raro que encuentra el procesamiento: sirve para evaluar casuísticas y decidir reglas con datos
CREATE TABLE IF NOT EXISTS incidencias (
  id                 BIGSERIAL PRIMARY KEY,
  codigo             TEXT NOT NULL,                -- ZIP_ANIDADO, PDF_PROTEGIDO, SIN_TEXTO, PAGINA_EN_BLANCO…
  gravedad           TEXT NOT NULL CHECK (gravedad IN ('INFO', 'AVISO', 'ERROR')),
  archivo_id         TEXT REFERENCES archivos (id),
  documento_id       TEXT REFERENCES documentos (id),
  procesamiento_id   TEXT REFERENCES procesamientos (id),
  detalle            JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS incidencias_codigo_idx ON incidencias (codigo, created_at DESC);
CREATE INDEX IF NOT EXISTS incidencias_archivo_idx ON incidencias (archivo_id);

-- Fase 2 (extracción con IA y confirmación del operador) se añadirá aquí: tablas extracciones y
-- confirmaciones, que nunca se sobrescriben entre sí (ver docs/decisiones.md).

-- Fase 1, paso 4: lectura preliminar del clasificador (emisor, NIF, número, fecha, total) y dudas del
-- modelo. No es la extracción de la Fase 2 (esa irá a la tabla extracciones).
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS lectura JSONB;

-- Nombre de la empresa cliente (contexto para la IA: reconocer al cliente entre emisor y receptor)
ALTER TABLE bandejas ADD COLUMN IF NOT EXISTS empresa TEXT;

-- Fase 2: lo que extrae la IA de cada documento, tal cual. NUNCA se modifica: lo que confirme el
-- asesor irá a `confirmaciones`, y comparando las dos se mide el acierto de cada modelo campo a campo.
CREATE TABLE IF NOT EXISTS extracciones (
  id                 TEXT PRIMARY KEY,               -- ext_…
  documento_id       TEXT NOT NULL REFERENCES documentos (id),
  procesamiento_id   TEXT REFERENCES procesamientos (id),
  motor              TEXT NOT NULL,                  -- p. ej. vertex/gemini-2.5-flash-lite
  version_prompt     TEXT NOT NULL,                  -- p. ej. extractor@1
  modos_pagina       TEXT[],                         -- texto / imagen por página enviada
  datos              JSONB NOT NULL,                 -- campos extraídos (esquema en app/clasificador.py)
  confianzas         JSONB,
  motivos_revision   TEXT[] NOT NULL DEFAULT '{}',   -- DESCUADRE, LECTURA_DISCREPANTE, BAJA_CONFIANZA…
  tokens_entrada     INTEGER,
  tokens_salida      INTEGER,
  coste_estimado     NUMERIC(12, 6),
  segundos           NUMERIC(8, 2),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS extracciones_documento_idx ON extracciones (documento_id, created_at DESC);
