"""Acceso a Cloud Storage y Cloud Tasks."""

from __future__ import annotations

import json
from datetime import timedelta
from urllib.parse import quote

import google.auth
from google.api_core.exceptions import AlreadyExists
from google.auth.transport.requests import Request
from google.cloud import storage, tasks_v2

from . import config

_storage: storage.Client | None = None
_tareas: tasks_v2.CloudTasksClient | None = None


def cliente_storage() -> storage.Client:
    global _storage
    if _storage is None:
        _storage = storage.Client(project=config.PROJECT_ID or None)
    return _storage


def disposicion(tipo: str, nombre: str) -> str:
    """Content-Disposition con el nombre original (RFC 5987: admite tildes y espacios)."""
    return f"{tipo}; filename*=UTF-8''{quote(nombre, safe='')}"


def url_firmada(bucket: str, objeto: str, disposicion_respuesta: str) -> str:
    """URL firmada V4 de solo lectura. En Cloud Run no hay clave privada: se firma con la API IAM
    (signBlob) con la identidad del servicio, que necesita roles/iam.serviceAccountTokenCreator sobre sí misma."""
    credenciales, _ = google.auth.default()
    credenciales.refresh(Request())
    blob = cliente_storage().bucket(bucket).blob(objeto)
    return blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=config.SIGNED_URL_MINUTES),
        method="GET",
        response_disposition=disposicion_respuesta,
        service_account_email=getattr(credenciales, "service_account_email", None),
        access_token=credenciales.token,
    )


def procesador_configurado() -> bool:
    """Hasta que exista el procesador (paso 3 de la Fase 1), los archivos quedan en RECIBIDO."""
    return bool(config.TASKS_QUEUE and config.TASKS_SA and config.PROCESADOR_URL)


def encolar_procesamiento(archivo_id: str, sufijo: str = "inicial") -> None:
    """Crea la tarea "procesar archivo_id". El nombre de la tarea incluye el archivo: Cloud Tasks
    rechaza un nombre repetido durante un tiempo, lo que evita procesar dos veces por un reintento."""
    global _tareas
    if _tareas is None:
        _tareas = tasks_v2.CloudTasksClient()
    tarea = {
        "name": f"{config.TASKS_QUEUE}/tasks/{archivo_id}-{sufijo}",
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": f"{config.PROCESADOR_URL}/procesar",
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"archivoId": archivo_id}).encode(),
            "oidc_token": {"service_account_email": config.TASKS_SA, "audience": config.PROCESADOR_URL},
        },
    }
    try:
        _tareas.create_task(parent=config.TASKS_QUEUE, task=tarea)
    except AlreadyExists:
        pass  # ya estaba encolada
