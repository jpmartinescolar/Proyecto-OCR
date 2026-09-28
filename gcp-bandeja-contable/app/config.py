"""Configuración por variables de entorno (las fija infra/crear-entorno.ps1 en Cloud Run)."""

import os

SERVICIO = os.environ.get("SERVICIO", "api")  # "api" o "procesador"
PROJECT_ID = os.environ.get("PROJECT_ID", "")

BUCKET_RAW = os.environ.get("BUCKET_RAW", "")  # originales tal como los subió el cliente
BUCKET_DOCS = os.environ.get("BUCKET_DOCS", "")  # derivados (contenido de ZIP, documentos separados)

INSTANCE_CONNECTION_NAME = os.environ.get("INSTANCE_CONNECTION_NAME", "")
DB_NAME = os.environ.get("DB_NAME", "")
DB_USER = os.environ.get("DB_USER", "")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")

# Cola de Cloud Tasks y procesador. Sin PROCESADOR_URL los archivos confirmados quedan en RECIBIDO.
TASKS_QUEUE = os.environ.get("TASKS_QUEUE", "")  # projects/…/locations/…/queues/…
TASKS_SA = os.environ.get("TASKS_SA", "")  # cuenta con la que Cloud Tasks llama al procesador
PROCESADOR_URL = os.environ.get("PROCESADOR_URL", "")

SIGNED_URL_MINUTES = 15

# Límites de seguridad del procesador (no son reglas de negocio: si se superan, el archivo queda en
# revisión con su incidencia). Ver docs/fases/fase-1-ingestion.md
MAX_BYTES_MEMORIA = int(os.environ.get("MAX_BYTES_MEMORIA", 700 * 1024 * 1024))
ZIP_MAX_ENTRADAS = int(os.environ.get("ZIP_MAX_ENTRADAS", 5000))
ZIP_MAX_BYTES_ENTRADA = int(os.environ.get("ZIP_MAX_BYTES_ENTRADA", 1024 * 1024 * 1024))
ZIP_MAX_BYTES_TOTAL = int(os.environ.get("ZIP_MAX_BYTES_TOTAL", 4 * 1024 * 1024 * 1024))
ZIP_MAX_RATIO = int(os.environ.get("ZIP_MAX_RATIO", 200))
ZIP_MAX_PROFUNDIDAD = int(os.environ.get("ZIP_MAX_PROFUNDIDAD", 5))


def comprobar(*nombres: str) -> None:
    """Falla al arrancar si falta alguna variable obligatoria."""
    faltan = [n for n in nombres if not globals().get(n)]
    if faltan:
        raise RuntimeError(f"Faltan variables de entorno: {', '.join(faltan)}")
