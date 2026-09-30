# Decisiones

Registro de decisiones del proyecto. Formato: fecha · decisión · motivo · alternativas descartadas. Las más recientes arriba.

## 2026-09-30
- **Documento con el diseño v2 Híbrido del 30/09**: tres capas (contable, fiscal y financiera) con su estado "Pre-validado" o "N incidencias", Rosetta IA en lugar de la pestaña Chat IA, pestañas Correos, Tesorería y Análisis de gasto, y validar con riesgo eligiendo cómo se resuelve (skill, aceptación del cliente u otros). Detalle en [diseno.md](diseno.md#qué-cambia-en-la-v2-híbrido-del-3009).
- **Se quita lo que el diseño quita**: el resumen de riesgos de la pestaña Datos (con "Riesgo económico" y "Pregunta a la IA"), la línea de pasos y "Confirmar datos" de la capa 1. Motivo: el estado de cada capa y la ventana de validar sustituyen a esas piezas. El cálculo del riesgo económico se conserva en `bandejaContableCalculos.riesgosFiscales` para la pantalla de riesgo no prescrito.
- **"Ampliar" abre un panel sobre la mitad izquierda de la pantalla que mide lo que el PDF** (`bandejaContableVisorAmpliado`): el ancho de esa mitad y el alto de una página a ese ancho. Se abre con el botón, con la lupa que aparece al pasar por el documento o, en imágenes y en la vista de ejemplo, pulsándolo. El panel va anclado a la página (se mueve con su scroll), así que nunca queda tapado para siempre por la cabecera de Lightning y no hace falta adivinar su altura. El lector se crea ya con el tamaño final, reutilizando el PDF descargado y con el spinner estándar hasta que carga. El visor de la página no se toca: al cerrar no hay saltos. Se cierra con un clic fuera, con la × estándar (`lightning-button-icon`) o con Esc; dentro, "Página completa / Ajustar al ancho". Descartados:
  - `lightning-modal`: solo tiene tamaños fijos, siempre sale centrado y no se cierra con clic fuera; adaptarlo obligaría a forzar sus estilos internos;
  - el panel fijo sobre la ventana: la cabecera de Lightning lo tapaba;
  - la animación: el lector de PDF recalcula en cada fotograma;
  - la lupa que clona la página del prototipo;
  - el doble clic sobre el PDF: el lector del navegador, en otro dominio, se queda con los eventos.
- **La página se abre en el listado OCR**, primera pestaña, como en el diseño.

## 2026-09-29
- **Un único estado de procesamiento para el usuario: Cargando · Procesando · Procesado · Error**, calculado con la misma regla en el listado, la ficha de la bandeja y cada archivo (`bandejaContableUtils.estadoProceso`). Por dentro se mantienen los estados técnicos (archivo en Salesforce, archivo y documentos en Google). En una bandeja manda el archivo menos avanzado; los documentos por revisar y los archivos con error se indican aparte. Motivo: "Subida: Completada" aparecía en cuanto el archivo estaba registrado, antes de procesarse, y en la ficha no había documentos. "Procesado" en lugar de "Listo" o "Completada" (el usuario no quiere "Listo"; "Completado" ya es el estado de revisión del asesor). El estado de un documento sin incidencias pasa de "Listo" a "Correcto".
- **La interfaz no nombra a Google** (ni a ningún proveedor): es un detalle técnico. Los detalles técnicos quedan en tooltips.
- **Se puede entrar en una bandeja mientras se procesa**: la ficha muestra filas de carga hasta tener datos, un aviso "Estamos procesando los documentos (n de m archivos terminados)" y los documentos a medida que salen; Reprocesar queda desactivado. Descartado: bloquear la entrada hasta que termine.
- **Estado del listado con una consulta agrupada** (`/status`, solo lectura de Cloud SQL) después de pintar el listado, y refresco automático mientras algo esté en curso. El aviso de Google a Salesforce al terminar queda para una fase posterior (necesita un usuario de integración con credenciales en Google).
- **Los listados no firman URL ni traen la extracción**: `/documents` solo devuelve datos; la URL firmada y los datos extraídos se piden con `/document` al abrir cada documento. Motivo: cada URL firmada es una llamada a IAM; con 17 documentos `/documents` tardaba ~3 s siempre, aunque todo estuviera procesado. La API reutiliza además sus credenciales entre firmas.
- **Una instancia mínima de la API** (`--min-instances=1`): sin ella, la primera consulta tras un rato sin uso tardaba ~6 s por el arranque en frío.
- **Sin caché del token de Google en Salesforce** por ahora: el sandbox no tiene capacidad de Platform Cache (solo una partición de Sage sin capacidad) y guardarlo en un registro sería guardar una credencial en la base de datos. Cada llamada sigue pidiendo su token.
- **Visor del documento con el lector de PDF del navegador sin su barra** (`#toolbar=0`) y controles propios (zoom, girar, páginas, descargar). "Ajustado" es un zoom calculado con el ancho real de la página (`view=FitH` dejaba márgenes). Descartado: pdf.js (en Lightning trabaja sin Web Worker y la carga era lenta).

## 2026-09-28
- **Extracción en el mismo procesamiento que la separación** (arranca la Fase 2): cada documento se extrae con todas sus páginas justo después de separarse; resultado inmutable en `extracciones`. Motivo: el modelo ya ve cada página, y el asesor recibe las facturas separadas y leídas sin pasos manuales. Ver [fases/fase-2-extraccion.md](fases/fase-2-extraccion.md).
- **PDF electrónicos como texto** (más una imagen de apoyo) y escaneos como imagen. Motivo: el texto da las cifras exactas y cuesta menos.
- **Modelo activo Gemini 2.5 Flash** en lugar de Flash-Lite: con las muestras, Flash-Lite juntaba facturas seguidas y confundía la coma decimal; Flash acertó con ~5 veces el coste (≈ 3 USD por 1.000 páginas). Claude Haiku 4.5 se comparará cuando haya cuota.
- **Comprobaciones deterministas sobre lo extraído** (cuadre, total frente a la lectura al separar, destinatario, varios documentos): un error del modelo no pasa como correcto, va a revisión con su motivo.
- **Clasificador (paso 4):** páginas como imagen con `pypdfium2` (Apache/BSD; se mantiene fuera PyMuPDF por AGPL), lotes de 8 páginas por llamada y **reglas deterministas sobre la lectura del modelo** (otro número de factura u otro emisor = otro documento; mismo número y emisor = mismo documento). Motivo: con las muestras, el modelo solo juntaba facturas seguidas del mismo proveedor; con las reglas, el PDF de 19 páginas sale en sus 17 documentos reales. Gemini en `europe-southwest1` (Madrid) y Claude en la multirregión `eu` (residencia en la UE).
- **Lectura preliminar** (emisor, NIF, número, fecha, total) guardada en `documentos.lectura`: sirve para separar y para que el asesor reconozca cada documento. No es la extracción de la Fase 2, que irá a `extracciones`.
- **Estados legibles en Salesforce:** "requiere revisión" se muestra en ámbar como trabajo del asesor, no como error; solo ERROR va en rojo. La ficha de la bandeja no muestra documentos de ejemplo cuando el archivo ya está en Google.
- **UI adaptada al diseño v2 ya, sin esperar a la Fase 2**, con los datos reales que hay y el resto de ejemplo, comentado y marcado en pantalla.
- **Datos del cliente desde Salesforce** (`BandejaContableClienteService`): contrato contable y fiscal abierto, obligaciones tributarias en alta, actividades económicas (IAE), locales afectos, socios y administradores, y dirección de facturación. Lo que no existe (régimen de IVA, prorrata, ROI, turismos, censo AEAT/VIES) queda de ejemplo y listado como pendiente. Descartado: duplicar estos datos en Cloud SQL.
- **Las comprobaciones que dependen de datos inexistentes se marcan "Ejemplo"** en pantalla (censo, deudores, prorrata, histórico del proveedor, duplicados) para no dar por buena una comprobación que no se ha hecho.
- **Backend de Google en Python + FastAPI** (se rehízo la primera versión en Node). El contrato con Salesforce no cambia. Librerías:
  - `pypdf` para los PDF (licencia BSD). Descartado PyMuPDF por su licencia AGPL.
  - `Pillow` para las imágenes y `zipfile` de la librería estándar para los ZIP.
  - `psycopg 3` para Postgres.
  - `google-cloud-storage` y `google-cloud-tasks`.

  Imagen Docker con Python 3.14. En local, un entorno virtual `.venv` creado con el Python que trae el SDK de Google (en el equipo no hay otro Python).
- **Datos que aún no existen: de ejemplo y bien comentados** en el código (qué falta, de dónde saldrá, qué hay que aclarar) y marcados en pantalla. Se aplica a notas, tareas, chat, censo de la AEAT y lo que no haya en Salesforce.
- **La cola de Cloud Tasks va en europe-west1 (Bélgica).** Motivo: Cloud Tasks no está disponible en europe-southwest1. La cola solo guarda el id del archivo a procesar; archivos, BD y procesador siguen en Madrid (todo en la UE).
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
- **Rama nueva `feature/bandeja-contable` desde `main`** con código portado y nombres definitivos. El prototipo queda en `test/buzon-contable` (tag `archivo/prototipo-buzon-contable`) sin fusionar. El 29/09 la rama se renombró a `legacy/prototipo-buzon-contable` (mismo contenido) y se publicaron la rama y el tag en GitHub.
- **Recursos de Google nuevos con nombres definitivos**, sufijo `-dev` en desarrollo; los `buzon-*` se retirarán.
- **UI en LWC dentro de Salesforce, fiel al diseño de Claude Design** (tokens CIDP), para asesores internos. El portal del cliente (solo subida y confirmación) vendrá después reutilizando `bandejaContableNuevo`.
- **Tipos de documentación: Emitida / Recibida / Ticket** (los del prototipo).
- **Datos de ejemplo mientras no exista el backend**, marcados como tales en pantalla.
