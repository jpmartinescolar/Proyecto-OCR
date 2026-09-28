# Hoja de ruta

Ajustada el 28/09/2026 con el diseño v2 ([diseno.md](diseno.md)). Cada fase se diseña en `docs/fases/` antes de implementarla.

| Fase | Contenido | Depende de | Estado |
|---|---|---|---|
| **0 · Base** | Modelo Salesforce, subida a Google, 6 pantallas v1 con datos de ejemplo, entorno dev, autenticación | — | Hecho (25/09) |
| **1 · Ingestión y separación** | Buckets raw/docs, esquema v2, procesador (tipo, validación, ZIP, páginas), clasificador por página (Gemini 2.5 Flash-Lite / Claude Haiku 4.5 en Vertex), documentos separados en Salesforce. [Diseño](fases/fase-1-ingestion.md) | Muestras | En curso (pasos 0–2 hechos) |
| **2 · Extracción con IA** | Campos de la factura (v2: cuentas, fechas de devengo y contables, divisa, IVA por línea con deducibilidad, R.E., retención, código de transacción, productos), confianza por campo, consumo de IA por documento. Tablas `extracciones` (IA, inmutable) y `confirmaciones` (operador). Skills del cliente en el prompt | Fase 1 | Pendiente |
| **3 · Revisión en Salesforce (UI v2)** | Pantallas al diseño v2: cabecera y acciones del documento (validar, no contabilizar con motivo, reabrir, bloqueo), pestañas, listado OCR por tipo y situación fiscal, editor de skills. Estado contable del documento. Sustituir los datos de ejemplo por la API | Fases 1–2 (se puede adelantar con datos de ejemplo) | Pendiente |
| **4 · Comprobaciones y riesgo** | Motor de comprobaciones fiscales y operativas (proveedor, requisitos, deducibilidad, regularización, histórico). Riesgo económico, IS, IVA e IRPF por documento; pantalla de riesgo no prescrito; aceptar el riesgo al validar. Integraciones con VIES, censo AEAT, deudores de la AEAT y paraísos fiscales. Datos del cliente (perfil fiscal, IAE, locales, turismos, vinculados, prorrata) | Fase 2 + fuentes de datos | Pendiente |
| **5 · Colaboración y asistente** | Notas con adjuntos, tareas asignables, chat IA por factura (Vertex) con histórico, "Pregunta a la IA" desde cada riesgo, motivo de no contabilizar sugerido por la IA | Fases 2–4 | Pendiente |
| **6 · Salida** | Envío al software contable de destino (a3ERP…), aviso al cliente del motivo de no contabilizar, portal del cliente (subida y confirmación) | Fases 2–3 | Pendiente |
| **7 · Producción** | Entorno prod de Google, instancia de Cloud SQL dedicada, retención, monitorización, retirada del Buzón contable legacy (cuando el usuario lo decida) | Todo lo anterior | Pendiente |

## Decisiones abiertas (a resolver antes de cada fase)
- **Fase 3:** ¿se adapta la UI al diseño v2 ya, con datos de ejemplo, o después de la Fase 2?
- **Fase 4:**
  - ¿De dónde salen los datos del cliente (perfil fiscal, IAE, locales, turismos, vinculados, prorrata)? ¿Salesforce (Account u otros objetos) u otro sistema?
  - ¿Hay certificado digital o credenciales para el censo de la AEAT? VIES tiene un servicio público.
- **Fase 5:** ¿dónde se guardan notas, tareas y chats: Salesforce (Notes, Tasks, Files) o Cloud SQL? Las tareas de Salesforce ya tienen asignación y vencimientos.
- **Fase 6:** ¿qué softwares contables de destino hay que soportar y cómo aceptan los datos (fichero de importación, API)?
