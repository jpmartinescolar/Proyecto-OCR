# Arquitectura · Bandeja Contable

Estado a 28/09/2026. Lo que está en diseño (Fase 1) se describe en [fases/fase-1-ingestion.md](fases/fase-1-ingestion.md).

## Flujo actual

```
Salesforce (LWC bandejaContableNuevo)
  1. crearBandeja            → Bandeja_Contable__c + un Bandeja_Contable_Archivo__c por archivo (Pendiente)
  Por cada archivo:
  2. solicitarSesionSubida   → Apex → Cloud Run /upload-session → sesión resumible de Cloud Storage
  3. el navegador sube el archivo directamente a Cloud Storage (por trozos de 8 MiB, reanudable)
  4. confirmarSubida         → Apex → Cloud Run /confirm → upsert en Cloud SQL (bandejas + archivos)
                             → Salesforce guarda los Google_Id__c (si Google falla: reintento en cola 1/5/10 min)
Pantallas (LWC bandejaContableApp): Salesforce + Cloud Run /records (URL firmadas 15 min para ver/descargar)
```

El archivo **nunca pasa por Salesforce** ni por la API: va del navegador a Cloud Storage.

## Salesforce
- **Objetos**:
  - `Bandeja_Contable__c`: un envío (empresa, tipo Emitida/Recibida/Ticket, observaciones, origen, estado, `Google_Id__c`, roll-ups de archivos, `Estado_subida__c`, `Documentos_total__c`).
  - `Bandeja_Contable_Archivo__c`: un archivo (maestro-detalle; estado de subida, intentos, último error, `GCS_ruta__c` como texto, `Google_Id__c`).
  - `Bandeja_Contable_Config__mdt.Default`: URL de Cloud Run, Named Credential, email de la cuenta de servicio, certificado y tamaño máximo.
- **Apex**:
  - `BandejaContableController`: operaciones de las pantallas.
  - `BandejaContableGcpService`: llamadas a Google.
  - `BandejaContableEmpresasService`: empresas permitidas por usuario.
  - `BandejaContableSyncQueueable`: reintentos.
- **LWC**: `bandejaContableApp` hace de router por URL (`c__vista`…) con 6 pantallas:
  - `bandejaContableListado`
  - `bandejaContableRegistro`
  - `bandejaContableDocumento`
  - `bandejaContableOcr` (listado OCR, también agrupado por empresa)
  - `bandejaContableEmpresa`

  Además: `bandejaContableNuevo` (+ modal) para la subida, y los módulos compartidos `bandejaContableEstilos`, `bandejaContableUtils` y `bandejaContableMock`.
- **Datos de ejemplo**: `bandejaContableMock` genera los documentos OCR, los datos extraídos, el perfil fiscal, las reglas y las skills hasta que existan en Google. Se sustituirá por llamadas a la API con la misma forma de datos.
- **Acceso**: permiso `Bandeja_Contable_Asesor` (+ `Bandeja_Contable_Todas_Empresas` para modo libre). La pestaña `Bandeja_Contable` no está en ninguna app.

## Google Cloud (proyecto `centro-de-inteligencia-500407`, región `europe-southwest1`)

| Recurso | dev (sandbox) | prod |
|---|---|---|
| Cloud Run privado | `bandeja-contable-api-dev` | `bandeja-contable-api` (sin crear) |
| Bucket | `centro-inteligencia-bandeja-contable-dev` (se sustituirá por raw/docs, ver Fase 1) | — |
| Cloud SQL | BD `bandeja_contable_dev`, usuario `bandeja_contable_app_dev`, instancia compartida `centro-inteligencia-db` (Postgres 16) | — |
| Secreto | `bandeja-contable-db-password-dev` | — |
| Cuentas de servicio | `bandeja-contable-run-dev` (API) · `bandeja-contable-caller-dev` (Salesforce) · `bandeja-contable-proc-dev` (procesador) | — |
| Buckets Fase 1 | `centro-inteligencia-bandeja-contable-raw-dev` (originales) · `…-docs-dev` (derivados) | — |
| Cola Cloud Tasks | `bandeja-contable-procesar-dev` en **europe-west1** (Cloud Tasks no existe en Madrid) | — |

Se crean con `gcp-bandeja-contable-api/infra/crear-entorno.ps1 -Entorno dev|prod`.

### Modelo de datos actual (Cloud SQL)
- `bandejas` (clave `sf_bandeja_id`): nº, org, cuenta, CIF, tipo, observaciones, origen, usuario.
- `archivos` (clave `sf_archivo_id`): bandeja, org, cuenta, CIF, usuario, nombre, ruta GCS, id de objeto, tamaño, tipo, crc32c.
- **Referencias cruzadas**: cada fila guarda los IDs de Salesforce, y Salesforce guarda el id de la fila en `Google_Id__c`.

### Autenticación Salesforce → Cloud Run
- Cloud Run es privado: solo lo puede invocar la cuenta `bandeja-contable-caller-*` (`roles/run.invoker`).
- Apex firma un JWT con el certificado de Salesforce `Bandeja_Contable_GCP` y lo canjea en `oauth2.googleapis.com` por un ID token, que envía como Bearer.
- La clave privada no sale de Salesforce; en Google solo está la parte pública (`gcloud iam service-accounts keys upload`).
- **No hay claves JSON.**
- **El certificado caduca el 25/09/2027**: hay que rotarlo antes.
