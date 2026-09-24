# buzon-api (Cloud Run)

API intermedia entre Salesforce (`GcpBuzonService.cls`) y Google Cloud para el prototipo "Subir facturas" del Buzón Contable. Implementa exactamente el contrato que espera el Apex:

- `POST /upload-session` `{ gcsPath, size, mime }` → `{ uploadUrl }` (sesión de subida resumible de Cloud Storage).
- `POST /confirm` `{ sfRecordId, sfAccountId, sfOrgId, sfUserId, cif, gcsPath, mime }` → `{ id, size, crc32c }` (verifica el objeto en GCS y hace upsert en Cloud SQL).

## Infraestructura (proyecto `centro-de-inteligencia-500407`, región `europe-southwest1`)

- **Cloud Run**: servicio `buzon-api`, privado (requiere IAM, sin `--allow-unauthenticated`).
- **Bucket**: `centro-inteligencia-buzon-test` (nuevo, separado de los buckets de la otra app), con CORS para el dominio del Sandbox.
- **Cloud SQL**: base de datos `buzon_test` dentro de la instancia existente `centro-inteligencia-db` (Postgres 16), con su propio usuario `buzon_test_app` — aislada de la app "Centro de Inteligencia" y pensada para borrarse sin afectar nada al terminar las pruebas.
- **Service accounts**:
  - `buzon-api-run@...` — identidad de ejecución del propio Cloud Run (acceso al bucket, Cloud SQL, sus secretos).
  - `buzon-api-caller@...` — identidad que Salesforce usa para autenticarse contra el Cloud Run privado (tiene `roles/run.invoker` sobre `buzon-api`).
- **Secret Manager**: `buzon-api-key` (sin uso en la versión privada, quedó reservado por si se simplifica a auth por API key más adelante), `buzon-db-password`.

## Autenticación desde Salesforce (Cloud Run privado)

Salesforce firma un JWT con la clave de `buzon-api-caller`, lo canjea en `https://oauth2.googleapis.com/token` (flujo `target_audience`) por un ID token de Google, y lo manda como `Authorization: Bearer <id_token>` en cada llamada. Ver `GcpBuzonService.obtenerIdToken()`.

## Pendiente de configurar manualmente (ver checklist en el chat)

1. Dar permisos a `buzon_test_app` sobre la base de datos `buzon_test` (GRANT/ALTER OWNER).
2. Generar la clave JSON de `buzon-api-caller` y convertirla en un certificado importable en Salesforce.
3. Importar ese certificado en Setup → Certificate and Key Management, con Developer Name `Buzon_GCP_Caller` (o actualizar `Buzon_Test_Config__mdt.Certificate_Name__c` si se usa otro nombre).
