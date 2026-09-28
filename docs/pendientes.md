# Pendientes

Backlog del proyecto. Marcar `[x]` al terminar y mover a "Hecho" con la fecha.

## Fase actual
- [ ] Fase 1 · ingestión y separación de documentos: ver pasos en [fases/fase-1-ingestion.md](fases/fase-1-ingestion.md).
- [ ] Revisión de las 6 pantallas por el usuario (ajustes de diseño).

## Limpieza del prototipo
- [ ] Retirar del sandbox el prototipo con un `destructiveChanges` revisado antes de ejecutar:
  - Apex: `SubirFacturasController`, `GcpBandejaService`, `BandejaEmpresasService`, `GcpSyncQueueable` y sus tests.
  - LWC: `testSubirFacturasA`, `testOcrBandeja`, `testBandejaPanel`.
  - Flexipages y pestañas: `Bandeja_Contable_Panel`, `Test_Subir_Facturas_A`.
  - Metadatos: PS `Bandeja_Contable_Access`, NC `GCP_Bandeja_Contable`, CSP `Bandeja_GCS_Storage`, RSS `Google_OAuth_Token`.
  - Campos obsoletos de `Bandeja_Contable__c`: `Archivo_nombre__c`, `Archivo_tamano__c`, `Archivo_tipo__c`, `GCS_ruta__c`, `Intentos__c`, `Opcion__c`, `Ultimo_error__c`, `Estado_sincronizacion__c`.
  - Registros de prueba antiguos.
- [ ] Borrar `salesforce-sandbox/manifest/destructiveChanges-buzon-contable-example.xml` (desactualizado, nombres Buzon).
- [ ] Retirar en Google los recursos `buzon-*` (Cloud Run, BD `buzon_test`, bucket, SAs, secretos) y **borrar ya las 2 claves JSON de `buzon-api-caller`**.

## Antes de producción
- [ ] Instancia de Cloud SQL dedicada (hoy compartida `db-f1-micro`, zonal, sin recuperación a un punto en el tiempo, IP pública).
- [ ] Subidas abandonadas: regla de ciclo de vida del bucket + conciliación (notificaciones de Storage).
- [ ] Validar el contenido real y pasar antivirus antes del OCR (parte en Fase 1).
- [ ] Política de retención y borrado (RGPD + normativa mercantil/fiscal).
- [ ] Retención bloqueada en el bucket raw de producción (los originales son evidencia).
- [ ] Reencolar archivos que queden en `RECIBIDO` con incidencia `ENCOLAR_FALLIDO` (endpoint o tarea periódica).
- [ ] Monitorización: logs estructurados, alertas en Cloud Run, aviso al administrador cuando un archivo queda en Error (TODO en `BandejaContableSyncQueueable`).
- [ ] Token OIDC en Platform Cache.
- [ ] Rotar el certificado `Bandeja_Contable_GCP` antes del **25/09/2027**.
- [ ] Crear el entorno prod de Google (`crear-entorno.ps1 -Entorno prod`, `cors-prod.json`) y la configuración de la org de producción.
- [ ] CORS del bucket para el dominio de producción y del portal.

## Mejoras de la aplicación
- [ ] "Editar" y el enlace del modal abren la ficha estándar: llevarlos a la pantalla propia.
- [ ] "Reprocesar OCR" (depende de la Fase 1).
- [ ] Portal del cliente: subida + confirmación de carga, reutilizando `bandejaContableNuevo`.
- [ ] Origen Email (ingesta de correos).

## Hecho
- 2026-09-28 · Fase 1, pasos 1–2:
  - buckets raw/docs y cola de Cloud Tasks;
  - rutas decididas por Google, sin CIF ni nombre: resuelve también la validación de la ruta en el backend;
  - nombre original en metadatos y en la descarga;
  - esquema SQL v2.
  - Probado de extremo a extremo con la bandeja "Prueba paso 2" (`aBfS80000000gQfKAI`). Los archivos de BC-00005 se borraron con el bucket antiguo.
- 2026-09-25 · Modelo, subida a Google, 6 pantallas del diseño con datos de ejemplo, entorno dev de Google, autenticación por certificado, prueba de extremo a extremo (BC-00005).
