# bandeja-contable-api (Cloud Run)

API intermedia entre Salesforce (`BandejaContableGcpService.cls`) y Google Cloud para la Bandeja Contable. Los archivos nunca pasan por Salesforce ni por esta API: el navegador los sube directamente a Cloud Storage con una sesión resumible que esta API solicita.

| Endpoint | Entrada | Salida |
|---|---|---|
| `GET /` | — | `bandeja-contable-api OK` (health check) |
| `POST /upload-session` | `{ gcsPath, size, mime, origin }` | `{ uploadUrl }` |
| `POST /confirm` | `{ sfOrgId, bandeja: { sfId, numero, sfAccountId, cif, tipo, observaciones, origen, sfUserId }, archivo: { sfId, nombre, gcsPath, sfUserId } }` | `{ bandejaId, archivoId, gcsObjectId, size, crc32c }` (verifica el objeto en GCS y hace upsert en `bandejas` y `archivos`) |
| `POST /records` | `{ sfOrgId, sfBandejaId }` o `{ sfOrgId, cif }` | `{ registros: [...] }` con URL firmada de lectura (15 min) |

## Modelo de datos (Cloud SQL)

Referencia cruzada de Id en los dos sentidos: cada fila guarda los Id de Salesforce y Salesforce guarda el id de la fila en `Google_Id__c`. El archivo en sí solo está en Cloud Storage.

| Tabla | Salesforce | Clave de upsert | Contenido |
|---|---|---|---|
| `bandejas` | `Bandeja_Contable__c` | `sf_bandeja_id` | nº de bandeja, org, cuenta, CIF, tipo, observaciones, origen, usuario |
| `archivos` | `Bandeja_Contable_Archivo__c` | `sf_archivo_id` | bandeja, org, cuenta, CIF, usuario, nombre, ruta GCS, id de objeto, tamaño, tipo, crc32c |

El esquema lo crea el propio servicio al arrancar (`CREATE TABLE IF NOT EXISTS`).

## Entornos

Proyecto `centro-de-inteligencia-500407`, región `europe-southwest1`. La infraestructura se crea con [infra/crear-entorno.ps1](infra/crear-entorno.ps1) (idempotente).

| Recurso | dev (Sandbox) | prod |
|---|---|---|
| Cloud Run (privado) | `bandeja-contable-api-dev` | `bandeja-contable-api` |
| Bucket | `centro-inteligencia-bandeja-contable-dev` | `centro-inteligencia-bandeja-contable` |
| Base de datos / usuario (instancia `centro-inteligencia-db`, Postgres 16) | `bandeja_contable_dev` / `bandeja_contable_app_dev` | `bandeja_contable` / `bandeja_contable_app` |
| Secreto contraseña BD | `bandeja-contable-db-password-dev` | `bandeja-contable-db-password` |
| SA de ejecución | `bandeja-contable-run-dev` | `bandeja-contable-run` |
| SA que usa Salesforce | `bandeja-contable-caller-dev` | `bandeja-contable-caller` |
| CORS del bucket | `cors-dev.json` | `cors-prod.json` (por crear) |

Redesplegar solo el código (sin tocar infraestructura):

```powershell
gcloud run deploy bandeja-contable-api-dev --source . --region europe-southwest1 --project centro-de-inteligencia-500407
```

## Autenticación Salesforce → Cloud Run

El servicio es privado: Cloud Run rechaza cualquier llamada sin un ID token de Google de una identidad con `roles/run.invoker` (solo la SA *caller* del entorno). El código de la API no valida credenciales; lo hace la plataforma.

1. Salesforce tiene un certificado autofirmado propio (`Bandeja_Contable_GCP`, Setup → Certificate and Key Management). La clave privada se genera y se queda dentro de Salesforce (no exportable).
2. La parte pública (`.crt`) se registra como clave de la SA *caller*: `gcloud iam service-accounts keys upload <cert>.crt --iam-account=bandeja-contable-caller-dev@...`.
3. En cada transacción, Apex firma un JWT con ese certificado (`Auth.JWS`, `iss`/`sub` = email de la SA, `target_audience` = URL del servicio) y lo canjea en `https://oauth2.googleapis.com/token` por un ID token de Google.
4. Apex llama al servicio vía Named Credential con `Authorization: Bearer <id_token>`.

No se crean claves JSON de service account: no hay ningún secreto de Google fuera de Salesforce que pueda filtrarse. Rotación: crear un certificado nuevo en Salesforce, subirlo, cambiar `Certificate_Name__c` y borrar la clave antigua en Google.
