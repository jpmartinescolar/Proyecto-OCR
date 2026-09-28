# Decisiones

Registro de decisiones del proyecto. Formato: fecha · decisión · motivo · alternativas descartadas. Las más recientes arriba.

## 2026-09-28
- **Clasificador: probar primero Gemini 2.5 Flash-Lite y Claude Haiku 4.5, ambos en Vertex AI.** Motivo: son las opciones más económicas dentro de Google (≈ $0,15 y ≈ $2,75 por 1.000 páginas, estimado). La elección final se hará por calidad medida con muestras reales. El código tendrá el catálogo de modelos comentado, con uno activo, para cambiar comentando/descomentando. Descartado como principal: Document AI Custom Splitter/Classifier (≈ $5–10/1.000 páginas, requiere entrenamiento o su versión preentrenada nueva no garantiza residencia de datos en la UE).
- **Dos tablas para los datos de las facturas: lo que extrae la IA y lo que confirma el operador; nunca se sobrescriben.** Motivo: medir la tasa de acierto real de cada modelo (campo a campo) comparando extracción con confirmación.
- **Dos buckets por entorno: `…-raw` (originales, inmutables) y `…-docs` (derivados, regenerables).** Motivo: permisos, retención e inmutabilidad distintos; reprocesar sin tocar originales; auditoría separada. Descartado: un bucket con prefijos (IAM por prefijo complejo, la retención afectaría a todo).
- **Identificadores internos ULID con prefijo** (`arc_`, `prc_`, `doc_`…). Motivo: únicos sin coordinación, ordenables por fecha, válidos en rutas y URLs. Los archivos subidos conservan además su Id de Salesforce.
- **Quitar CIF y nombre original de las rutas de Storage.** El nombre original va en SQL y en los metadatos del objeto, y se sirve al descargar. Motivo: datos personales (NIF de autónomos) y caracteres problemáticos.
- **Estados de archivo y de documento** según [fases/fase-1-ingestion.md](fases/fase-1-ingestion.md) (se ajustarán si hace falta).
- **ZIP sin límites de negocio**: todo se procesa y cada casuística se registra en la tabla `incidencias` para decidir reglas con datos. Solo límites de seguridad configurables (bombas ZIP), que dejan el archivo en revisión con su incidencia.
- **Excel: pendiente de flujo propio** (se conserva el original; sin separación ni importación en la Fase 1).
- **Salesforce mostrará los documentos separados y los datos extraídos reales**: Google avisará a Salesforce al terminar y las pantallas leerán de la API (se sustituye `bandejaContableMock`).

## 2026-09-25
- **Modelo 1:N en Salesforce**: `Bandeja_Contable__c` (envío) + `Bandeja_Contable_Archivo__c` (archivo). Motivo: seguimiento por archivo sin llamar a Google, reintentos, y base para el portal. Descartado: un registro por archivo (prototipo) y seguimiento solo en Cloud SQL.
- **Archivos solo en Cloud Storage; IDs cruzados en los dos sentidos** (Salesforce guarda los de Google; Cloud SQL los de Salesforce).
- **Autenticación con certificado generado en Salesforce, sin claves JSON.** Motivo: la clave privada no sale de Salesforce; Google desaconseja las claves JSON. Descartado: clave JSON convertida e importada.
- **Rama nueva `feature/bandeja-contable` desde `main`** con código portado y nombres definitivos. El prototipo queda en `test/buzon-contable` (tag `archivo/prototipo-buzon-contable`) sin fusionar.
- **Recursos de Google nuevos con nombres definitivos**, sufijo `-dev` en desarrollo; los `buzon-*` se retirarán.
- **UI en LWC dentro de Salesforce, fiel al diseño de Claude Design** (tokens CIDP), para asesores internos. El portal del cliente (solo subida y confirmación) vendrá después reutilizando `bandejaContableNuevo`.
- **Tipos de documentación: Emitida / Recibida / Ticket** (los del prototipo).
- **Datos de ejemplo mientras no exista el backend**, marcados como tales en pantalla.
