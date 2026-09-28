# bandeja-contable (Google Cloud · Python + FastAPI)

El mismo código se despliega como **dos servicios de Cloud Run** privados. La variable `SERVICIO` decide cuál arranca (`app/main.py`):

| Servicio | `SERVICIO` | Quién lo llama | Qué hace |
|---|---|---|---|
| `bandeja-contable-api-*` | `api` | Salesforce (`BandejaContableGcpService.cls`) con un ID token | Sesiones de subida, confirmación, listados |
| `bandeja-contable-procesador-*` | `procesador` | Cloud Tasks (cola `bandeja-contable-procesar-*`) con OIDC | Ingestión y separación de documentos (Fase 1) |

Los archivos nunca pasan por Salesforce ni por la API: el navegador los sube directamente al bucket de originales con una sesión resumible que pide la API.

## Código
- `app/api.py` y `app/procesador.py`: las dos aplicaciones FastAPI.
- `app/analisis.py`: análisis determinista de los archivos (tipo real, PDF, imágenes, ZIP). Son funciones puras.
- `app/db.py`: acceso a Postgres (psycopg 3).
- `app/gcp.py`: Storage y Cloud Tasks.
- `app/ids.py`: identificadores ULID con prefijo.
- `app/config.py`: variables de entorno.
- `esquema.sql`: tablas. Se aplica al arrancar y es idempotente.
- `Dockerfile` (Python 3.14) y `requirements.txt`. Para desarrollo, `requirements-dev.txt`.

**Local** (entorno virtual `.venv` en la raíz del repo, creado con el Python que trae el SDK de Google):

```powershell
..\.venv\Scripts\python -m pip install -r requirements-dev.txt
..\.venv\Scripts\python -m pytest
```

## API

| Endpoint | Entrada | Salida |
|---|---|---|
| `GET /` | — | `bandeja-contable-api OK` |
| `POST /upload-session` | `{ sfOrgId, bandeja: { sfId, numero, sfAccountId, cif, tipo, observaciones, origen, sfUserId }, archivo: { sfId, nombre, size, mime, sfUserId }, origin }` | `{ uploadUrl, gcsPath, archivoId, bandejaId }`. Google registra la bandeja y el archivo y decide la ruta |
| `POST /confirm` | `{ sfOrgId, sfArchivoId }` | `{ bandejaId, archivoId, gcsObjectId, size, crc32c, estado }`. El archivo pasa a `RECIBIDO` y se encola (`EN_COLA`) |
| `POST /records` | `{ sfOrgId, sfBandejaId }` | `{ registros: [...] }` con `viewUrl` (ver) y `descargaUrl` (descargar con el nombre original), válidas 15 min |

## Procesador

`POST /procesar { archivoId, reprocesar? }`. Los fallos definitivos (corrupto, no soportado…) se registran y responden 200; los temporales responden 500 y Cloud Tasks los reintenta. Diseño, estados e incidencias: [docs/fases/fase-1-ingestion.md](../docs/fases/fase-1-ingestion.md).

## Modelo de datos y almacenamiento
Ver [docs/arquitectura.md](../docs/arquitectura.md). Resumen:
- **Referencias cruzadas:** cada fila guarda los IDs de Salesforce, y Salesforce guarda el ID de Google en `Google_Id__c`.
- **Buckets:**
  - `…-raw-*`: originales, ruta `{org}/{bandejaSF}/{arc_…}.{ext}`, sin CIF ni nombre.
  - `…-docs-*`: derivados, por ejemplo el contenido de los ZIP.

## Entornos y despliegue
Proyecto `centro-de-inteligencia-500407`, región `europe-southwest1`; la cola de Cloud Tasks está en `europe-west1`, porque Cloud Tasks no existe en Madrid. Todo se crea y se despliega con [infra/crear-entorno.ps1](infra/crear-entorno.ps1) `-Entorno dev|prod`, que es idempotente. Detalles en [docs/despliegue.md](../docs/despliegue.md).

## Autenticación Salesforce → Cloud Run
- El servicio es privado: solo lo puede invocar la cuenta *caller* del entorno (`roles/run.invoker`).
- Apex firma un JWT con el certificado de Salesforce `Bandeja_Contable_GCP` (su clave privada no sale de Salesforce) y lo canjea en `oauth2.googleapis.com` por un ID token, que envía como Bearer.
- En Google solo está la parte pública (`gcloud iam service-accounts keys upload <cert>.crt`). **No hay claves JSON.**
- El certificado caduca el 25/09/2027.
