# Proyecto-OCR · Bandeja Contable

Bandeja Contable: los asesores suben documentación contable de una empresa desde Salesforce; los archivos van a Google Cloud, donde se separan en documentos, se clasifican y (fase posterior) se extraen sus datos con IA para revisarlos y confirmarlos en Salesforce.

## Dónde está cada cosa
- `salesforce-sandbox/`: proyecto Salesforce DX (org sandbox `comunidad--full`, alias `sandbox`).
- `gcp-bandeja-contable/`: código de Google en **Python + FastAPI** (paquete `app/`, `Dockerfile`), desplegado como dos servicios de Cloud Run que comparten módulos: la API y el procesador (`SERVICIO=procesador`). Infraestructura en `infra/crear-entorno.ps1`. Tests: `..\.venv\Scripts\python -m pytest` desde esa carpeta (entorno virtual `.venv` en la raíz, no versionado).
- `docs/hoja-de-ruta.md`: fases del proyecto y decisiones abiertas por fase.
- `docs/diseno.md`: el diseño de Claude Design (zip en la raíz, no versionado) y qué implica.
- `docs/arquitectura.md`: cómo funciona hoy (flujo, entornos, modelo de datos, autenticación).
- `docs/decisiones.md`: decisiones tomadas y su motivo. **Consultar antes de proponer algo ya decidido.**
- `docs/pendientes.md`: backlog y deuda técnica.
- `docs/fases/`: diseño de cada fase (la actual es `fase-1-ingestion.md`).
- `docs/despliegue.md`: cómo desplegar Salesforce y Google, y cómo deshacer.

## Reglas
- **Producción intacta**: no tocar el Buzón contable actual (`areaContableFiscal`, `Buzon_contable__c`). La Bandeja vive en la pestaña oculta `Bandeja_Contable`, visible solo con el permiso `Bandeja_Contable_Asesor`.
- **Nomenclatura de producción** desde el primer día: nada de `test`, `Buzon`, `opción A`. Prefijos `Bandeja_Contable_` (metadatos), `BandejaContable*` (Apex), `bandejaContable*` (LWC). En Google, sufijo `-dev` / `_dev` para el entorno de desarrollo.
- **Desplegar en Salesforce solo con `salesforce-sandbox/manifest/bandeja-contable.xml`**, nunca con `package.xml`: otras personas cambian el sandbox directamente sin git y no hay que pisarlas.
- **Los archivos solo se guardan en Google Cloud Storage.** Salesforce guarda datos del formulario, seguimiento y referencias (IDs de Google). Cloud SQL guarda los IDs de Salesforce.
- **Nunca sobrescribir lo que extrae la IA con lo que confirma el operador**: son tablas distintas (sirven para medir la tasa de acierto de cada modelo).
- Los cambios que tocan el sandbox o Google se confirman con el usuario antes de ejecutarlos.
- **Backend en Python + FastAPI, nunca Node.** Si algo no fuera viable en Python, explicarlo y preguntar.
- **Lo que no tiene todavía datos reales va como datos de ejemplo, bien comentado** en el código (qué falta, de dónde saldrá, qué hay que aclarar) y marcado en pantalla como "Datos de ejemplo".
- El usuario escribe en español; documentación y mensajes de la aplicación en español.
