# Fase 1 · Ingestión y separación de documentos

**Objetivo:** archivo recibido → identificar tipo → validar → contar documentos → separar → registrar en SQL → guardar los derivados → relacionarlos con el original. Sin OCR completo ni extracción de datos (eso es la Fase 2), aunque separar exige una clasificación ligera por página.

Decisiones de esta fase: ver [../decisiones.md](../decisiones.md) (28/09/2026).

## 1. Conceptos

```
Bandeja (registro de Salesforce)
 └── Archivo            lo que es físicamente un fichero
      ├── origen SUBIDO        tal cual lo mandó el cliente (evidencia, inmutable)
      └── origen EXTRAIDO_ZIP  fichero sacado de un ZIP (padre = el ZIP)
           └── Procesamiento   una ejecución versionada de la lógica de separación
                └── Documento  unidad lógica: "esta factura" = páginas X–Y de ese archivo
                     ├── (Fase 2) Extracción IA     lo que devuelve el modelo, inmutable
                     └── (Fase 2) Confirmación      lo que valida el operador
```

Un ZIP es un contenedor de archivos, no un documento: cada fichero de dentro se procesa como si se hubiera subido, recordando de qué ZIP sale.

## 2. Modelo SQL

```
bandejas        1 ── N  archivos
archivos        1 ── N  archivos          (padre_id: contenido de un ZIP)
archivos        1 ── N  procesamientos    (reprocesar = nueva fila)
procesamientos  1 ── N  documentos
procesamientos  1 ── N  incidencias       (también ligadas a archivo o documento)
documentos      1 ── N  extracciones      (Fase 2: una por modelo/versión, inmutables)
documentos      1 ── 1  confirmaciones    (Fase 2: lo que valida el operador)
```

**`archivos`** (se amplía la tabla actual):
- Identidad: `id` (ULID `arc_…`), `sf_archivo_id` (solo si SUBIDO), `bandeja_id`, `padre_id`, `origen`.
- Nombre: `nombre_original` (exacto) y `ruta_en_zip`.
- Ubicación: `bucket`, `objeto`.
- Tipo y contenido: `mime_declarado`, `mime_detectado` (por contenido), `extension`, `tamano`, `sha256`, `num_paginas`, `tiene_texto`.
- Procesamiento: `estado`, `procesamiento_actual_id`.
- Fechas: `created_at`, `updated_at`.

**`procesamientos`:**
- `id` (`prc_…`), `archivo_id`.
- `version_logica` (p. ej. `separador@1.0.0`) y `motor` (modelo usado, p. ej. `vertex/gemini-2.5-flash-lite`).
- `estado`, `inicio`, `fin`, `error`.
- `detalle` (JSON con el análisis página a página: tipo, confianza, "empieza documento").
- `tokens_entrada`, `tokens_salida`, `coste_estimado`, `solicitado_por`.

**`documentos`:**
- Identidad: `id` (`doc_…`), `numero` (D01, D02… dentro de la bandeja).
- Relaciones: `procesamiento_id`, `archivo_id`, `bandeja_id`.
- Posición: `pagina_inicio`, `pagina_fin`.
- Clasificación: `tipo`, `confianza`, `estado`, `motivos_revision`.
- Almacenamiento: `almacenamiento` (REFERENCIA o DERIVADO), `bucket`, `objeto`, `sha256`.
- Nombre y reprocesos: `nombre_visible`, `sustituido_por`.
- Sincronización: `sf_sincronizado`, `created_at`.

**`incidencias`:**
- `id`, `codigo` (p. ej. `ZIP_ANIDADO`, `PDF_PROTEGIDO`, `SIN_TEXTO`, `PAGINA_EN_BLANCO`, `FORMATO_NO_SOPORTADO`, `LIMITE_SEGURIDAD`, `EXCEL_PENDIENTE_FLUJO`).
- `gravedad` (INFO, AVISO o ERROR).
- `archivo_id`, `documento_id`, `procesamiento_id`, `detalle` (JSON), `created_at`.
- **Sirve para evaluar casuísticas con datos**: informe por código y por lote de pruebas.

**Fase 2 (se define ahora para no romper el modelo):**
- `extracciones`: `id`, `documento_id`, `motor`, `version_prompt`, `datos` (JSON con los campos extraídos), `confianzas`, `tokens`, `coste`, `created_at`. **Nunca se modifica.**
- `confirmaciones`: `id`, `documento_id`, `extraccion_id` (sobre cuál trabajó el operador), `datos` (JSON confirmado), `sf_usuario_id`, `confirmado_en`.
- **La tasa de acierto por campo y por modelo** se obtiene comparando `extracciones.datos` con `confirmaciones.datos`.

## 3. Estados

**Archivo:**

| Estado | Significado |
|---|---|
| `RECIBIDO` | Confirmado en SQL, pendiente de procesar |
| `EN_COLA` / `PROCESANDO` | En curso |
| `PROCESADO` | Todo separado y clasificado sin incidencias |
| `PROCESADO_CON_INCIDENCIAS` | Separado, pero algún documento requiere revisión |
| `NO_SOPORTADO` | Formato fuera de lo admitido (el original se conserva) |
| `ERROR` | Corrupto, protegido, límite de seguridad… (con incidencia) |

**Documento:**

| Estado | Significado |
|---|---|
| `LISTO` | Parece un documento contable válido; pasa a extracción (Fase 2) |
| `REQUIERE_REVISION` | Separado, pero con dudas |
| `DESCARTADO` | No es un documento contable (confirmado o regla clara) |
| `ERROR` | No se pudo generar o leer |
| `SUSTITUIDO` | Reemplazado por un reproceso (se conserva) |

**Motivos de revisión:** `NO_PARECE_FACTURA`, `SEPARACION_INCIERTA`, `VARIOS_TIPOS_MEZCLADOS`, `ILEGIBLE`, `BAJA_CONFIANZA`, `DUPLICADO`, `PAGINA_EN_BLANCO`, `SIN_CLASIFICAR` (el documento aún no ha pasado por el clasificador; paso 3 hasta el 4), `FLUJO_PENDIENTE` (Excel).

**Códigos de incidencia del procesador (paso 3):**

| Gravedad | Códigos |
|---|---|
| ERROR | `PDF_PROTEGIDO`, `PDF_CORRUPTO`, `PDF_SIN_PAGINAS`, `IMAGEN_CORRUPTA`, `ZIP_CORRUPTO`, `ZIP_PROTEGIDO`, `ZIP_ENTRADA_ILEGIBLE`, `LIMITE_SEGURIDAD` |
| AVISO | `DUPLICADO_ARCHIVO` (mismo sha256 en la org), `TIPO_NO_COINCIDE` (extensión frente a contenido), `FORMATO_NO_SOPORTADO`, `ZIP_VACIO`, `ZIP_LECTURA_INCOMPLETA`, `ENCOLAR_FALLIDO`, `PROCESAMIENTO_FALLIDO` |
| INFO | `SIN_TEXTO` (escaneo), `PAGINAS_SIN_TEXTO`, `ZIP_ANIDADO`, `ARCHIVO_IGNORADO` (`__MACOSX`, `.DS_Store`…), `EXCEL_PENDIENTE_FLUJO` |

Los límites de seguridad de los ZIP son configurables por variable de entorno: `ZIP_MAX_ENTRADAS`, `ZIP_MAX_BYTES_ENTRADA`, `ZIP_MAX_BYTES_TOTAL`, `ZIP_MAX_RATIO` y `ZIP_MAX_PROFUNDIDAD`. `MAX_BYTES_MEMORIA` es el tamaño máximo que se analiza.

**Tipos de documento:** `FACTURA`, `FACTURA_SIMPLIFICADA`, `RECTIFICATIVA`, `ALBARAN`, `PRESUPUESTO`, `HOJA_CALCULO`, `OTRO`, `DESCONOCIDO`.

## 4. Storage

Dos buckets por entorno:

```
RAW (evidencia; retención larga; nadie borra ni sobrescribe)
  gs://centro-inteligencia-bandeja-contable-raw-dev/{sfOrgId}/{sfBandejaId}/{archivoId}.{ext}
     metadata: original-filename, sf-archivo-id, sha256

DOCS (derivados; regenerables; nunca se sobrescriben: cada reproceso escribe en su carpeta)
  gs://centro-inteligencia-bandeja-contable-docs-dev/{sfOrgId}/{sfBandejaId}/{archivoId}/{procesamientoId}/{documentoId}.pdf
  gs://centro-inteligencia-bandeja-contable-docs-dev/{sfOrgId}/{sfBandejaId}/{zipId}/{procesamientoId}/contenido/{archivoHijoId}.{ext}
```

- El nombre del cliente no forma parte de la ruta ni de la identidad. Se guarda en SQL y en los metadatos, y se sirve al descargar con `Content-Disposition`.
- Nombre legible para mostrar y descargar: `BC-00005_D03_factura.pdf`.
- **Sin duplicar de más:**
  - imagen o PDF de un solo documento = **referencia** al objeto raw (sin copia);
  - solo los PDF con varios documentos y el contenido de los ZIP generan **derivados**.

## 5. Reproceso y versiones
- Reprocesar crea un `procesamiento` nuevo (con `version_logica` y `motor`) y documentos nuevos en su carpeta.
- Los anteriores pasan a `SUSTITUIDO` con enlace al nuevo. Nunca se borran.
- Un documento ya confirmado o contabilizado **no se sustituye automáticamente**: queda para decisión humana.
- `archivos.procesamiento_actual_id` apunta a la versión vigente.

## 6. Servicios de Google

| Servicio | Uso |
|---|---|
| Cloud Tasks (`bandeja-contable-procesar-dev`, **europe-west1**: no existe en Madrid; solo guarda el id a procesar) | `/confirm` encola "procesar archivo X": reintentos, concurrencia limitada y sin duplicados (nombre de tarea) |
| Cloud Run `bandeja-contable-procesador-dev` (privado, nuevo) | Procesa: más memoria y CPU, hasta 60 min; solo lo invoca Cloud Tasks |
| Cloud Storage | Buckets raw y docs |
| Cloud SQL | Tablas nuevas en `bandeja_contable_dev` |
| Vertex AI | Clasificador por página (Gemini / Claude) |
| Secret Manager, Logging | Configuración y trazas |

## 7. Separación y clasificación

1. **Determinista** (librerías `file-type`, `pdf-lib`, `pdfjs`, `yauzl`, `sharp`):
   - tipo real, corrupto, protegido y nº de páginas;
   - si tiene texto (si no, es un escaneo) y páginas en blanco;
   - extraer los ZIP y dividir los PDF.
2. **Clasificador por página, intercambiable:**
   - Recibe cada página como imagen (y su texto si lo hay).
   - Devuelve un JSON con: tipo, confianza, "empieza un documento nuevo" y motivos.
   - **Una factura de varias páginas no debe partirse.**
   - **Modelos a probar primero:** `gemini-2.5-flash-lite` y `claude-haiku-4-5`, ambos en Vertex AI (región UE).
   - **El catálogo completo de modelos queda comentado en el código, con uno solo activo**, para cambiar comentando y descomentando.
   - Cada procesamiento registra `motor`, tokens y coste para comparar.
3. Confianza baja o casos dudosos → `REQUIERE_REVISION` con motivo.

**Comparación de modelos (con muestras reales):** cortes correctos, tipo correcto, % en revisión, coste real por página y latencia.

## 8. Casos límite
- **PDF:** factura de varias páginas; varias facturas en un PDF; factura + justificante de pago; páginas en blanco como separador; escaneo sin texto; PDF protegido o corrupto; 0 páginas; PDF enorme.
- **ZIP:** ZIP dentro de ZIP; bomba ZIP (límites de seguridad configurables → revisión); `__MACOSX` y `.DS_Store`; nombres con otra codificación; ZIP con contraseña. Sin límites de negocio: se registra todo en `incidencias`.
- **Duplicados:** mismo `sha256` en otra bandeja; misma factura escaneada dos veces (NIF + número, Fase 2).
- **Excel:** se conserva; documento `HOJA_CALCULO` con incidencia `EXCEL_PENDIENTE_FLUJO`.
- **Formatos futuros:** HEIC, TIFF de varias páginas, `.eml` (origen Email).

## 9. Integración con Salesforce (final de la fase)
- Al terminar, Google avisa a Salesforce: `Documentos_total__c` y estado.
- Nuevos endpoints de documentos para las pantallas.
- Las pantallas de registro, documento y OCR dejan de usar `bandejaContableMock`.

## 10. Pasos

| Paso | Qué | Estado |
|---|---|---|
| 0 | Documentación (`CLAUDE.md`, `docs/`) | Hecho 28/09 |
| 1 | Infraestructura dev: buckets raw/docs, cola de Cloud Tasks (europe-west1), SA del procesador. El Cloud Run del procesador se crea en el paso 3 y el bucket antiguo se retira en el paso 2 | Hecho 28/09 |
| 2 | Rutas sin CIF ni nombre, decididas por Google en `/upload-session`; metadatos y `Content-Disposition`; esquema SQL v2 (`esquema.sql`: `archivos` ampliada, `procesamientos`, `documentos`, `incidencias`); `/confirm` encola cuando exista el procesador; bucket antiguo retirado. Probado de extremo a extremo | Hecho 28/09 |
| 3 | Procesador sin IA: tipo, validación, ZIP, páginas, texto, blancos, protección → documentos provisionales e incidencias | Pendiente |
| 4 | Clasificador intercambiable: Gemini 2.5 Flash-Lite y Claude Haiku 4.5 en Vertex, comparados con muestras | Pendiente |
| 5 | Integración con Salesforce: endpoints de documentos, aviso de vuelta, pantallas con datos reales | Pendiente |

**Muestras (las aporta el usuario, 20–30, anonimizadas):**
- PDF de 1 factura con varias páginas; PDF con varias facturas; PDF mezclado (factura + albarán + otro).
- Escaneos malos, fotos de móvil, tickets.
- PDF protegido, archivo corrupto, PDF con páginas en blanco.
- ZIP normal, ZIP con carpetas, ZIP dentro de ZIP.
- 1–2 Excel.
- Algo que no sea factura (contrato, nómina).
