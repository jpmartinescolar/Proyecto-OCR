"""API de la Bandeja Contable (Cloud Run privado; la llama Salesforce con un ID token de Google).

Contrato (lo usa BandejaContableGcpService.cls):
  POST /upload-session  registra bandeja y archivo y devuelve la sesión de subida resumible
  POST /confirm         comprueba el objeto subido, lo marca RECIBIDO y encola su procesamiento
  POST /records         archivos de una bandeja con URL firmadas para ver y descargar
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse, PlainTextResponse
from psycopg.types.json import Jsonb
from pydantic import BaseModel

from . import config, db, gcp
from .analisis import extension
from .ids import nuevo_id

log = logging.getLogger("bandeja-contable-api")


@asynccontextmanager
async def ciclo_de_vida(_app: FastAPI):
    config.comprobar("BUCKET_RAW", "BUCKET_DOCS", "INSTANCE_CONNECTION_NAME", "DB_NAME", "DB_USER", "DB_PASSWORD")
    db.preparar_esquema()
    log.info("bandeja-contable-api lista (proyecto %s)", config.PROJECT_ID or "?")
    yield
    db.cerrar()


app = FastAPI(title="Bandeja Contable · API", lifespan=ciclo_de_vida)


def error(estado: int, mensaje: str) -> JSONResponse:
    return JSONResponse(status_code=estado, content={"error": mensaje})


@app.get("/", response_class=PlainTextResponse)
def salud() -> str:
    return "bandeja-contable-api OK"


# ===== /upload-session =====


class BandejaEntrada(BaseModel):
    sfId: str
    numero: str | None = None
    sfAccountId: str | None = None
    cif: str | None = None
    tipo: str | None = None
    observaciones: str | None = None
    origen: str | None = None
    sfUserId: str | None = None


class ArchivoEntrada(BaseModel):
    sfId: str
    nombre: str
    size: float | None = None
    mime: str | None = None
    sfUserId: str | None = None


class SesionEntrada(BaseModel):
    sfOrgId: str
    bandeja: BandejaEntrada
    archivo: ArchivoEntrada
    origin: str | None = None


@app.post("/upload-session")
def upload_session(p: SesionEntrada):
    """Registra la bandeja y el archivo en Cloud SQL y pide a Cloud Storage una sesión resumible.

    La ruta la decide Google: {sfOrgId}/{sfBandejaId}/{archivoId}.{ext}, sin CIF ni nombre del cliente;
    el nombre original queda en SQL y en los metadatos del objeto. Si el archivo ya estaba registrado
    y aún no se subió (reintento), se reutilizan su id y su ruta.
    """
    size = int(p.archivo.size or 0)
    if size <= 0:
        return error(400, "Falta archivo.size o no es válido.")
    b, a = p.bandeja, p.archivo
    try:
        with db.conexion() as conn:
            bandeja_id = conn.execute(
                """INSERT INTO bandejas (id, sf_org_id, sf_bandeja_id, numero, sf_account_id, cif, tipo, observaciones, origen, sf_user_id)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (sf_bandeja_id) DO UPDATE SET
                     numero = EXCLUDED.numero, sf_account_id = EXCLUDED.sf_account_id, cif = EXCLUDED.cif, tipo = EXCLUDED.tipo,
                     observaciones = EXCLUDED.observaciones, origen = EXCLUDED.origen, updated_at = now()
                   RETURNING id""",
                (nuevo_id("bandeja"), p.sfOrgId, b.sfId, b.numero, b.sfAccountId, b.cif, b.tipo, b.observaciones, b.origen, b.sfUserId),
            ).fetchone()["id"]

            existente = conn.execute("SELECT id, objeto, estado FROM archivos WHERE sf_archivo_id = %s", (a.sfId,)).fetchone()
            if existente:
                if existente["estado"] != "SUBIENDO":
                    return error(409, f"El archivo ya está registrado en Google (estado {existente['estado']}).")
                conn.execute(
                    "UPDATE archivos SET nombre_original = %s, mime_declarado = %s, tamano = %s, updated_at = now() WHERE id = %s",
                    (a.nombre, a.mime, size, existente["id"]),
                )
                archivo_id, objeto = existente["id"], existente["objeto"]
            else:
                archivo_id = nuevo_id("archivo")
                ext = extension(a.nombre)
                objeto = f"{p.sfOrgId}/{b.sfId}/{archivo_id}{'.' + ext if ext else ''}"
                conn.execute(
                    """INSERT INTO archivos (id, bandeja_id, origen, sf_org_id, sf_archivo_id, sf_bandeja_id, sf_account_id, cif,
                                             sf_user_id, nombre_original, bucket, objeto, mime_declarado, extension, tamano, estado)
                       VALUES (%s,%s,'SUBIDO',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'SUBIENDO')""",
                    (archivo_id, bandeja_id, p.sfOrgId, a.sfId, b.sfId, b.sfAccountId, b.cif, a.sfUserId or b.sfUserId,
                     a.nombre, config.BUCKET_RAW, objeto, a.mime, ext or None, size),
                )

        mime = a.mime or "application/octet-stream"
        blob = gcp.cliente_storage().bucket(config.BUCKET_RAW).blob(objeto)
        # Metadatos del objeto: el nombre original y los Id viajan con el archivo; al abrirlo o
        # descargarlo el navegador muestra el nombre del cliente aunque la ruta sea otra.
        blob.content_type = mime
        blob.content_disposition = gcp.disposicion("inline", a.nombre)
        blob.metadata = {"nombre-original": a.nombre, "archivo-id": archivo_id, "sf-archivo-id": a.sfId, "sf-bandeja-id": b.sfId}
        # Google solo habilita CORS en las respuestas de la subida si la sesión se crea con el Origin
        # del navegador que va a subir el archivo
        upload_url = blob.create_resumable_upload_session(content_type=mime, size=size, origin=p.origin)
        return {"uploadUrl": upload_url, "gcsPath": objeto, "archivoId": archivo_id, "bandejaId": bandeja_id}
    except Exception:  # noqa: BLE001 - al cliente no se le devuelven detalles internos
        log.exception("upload-session error")
        return error(500, "Error interno al crear la sesión de subida.")


# ===== /confirm =====


class ConfirmacionEntrada(BaseModel):
    sfOrgId: str
    sfArchivoId: str


@app.post("/confirm")
def confirm(p: ConfirmacionEntrada):
    """El navegador ha terminado la subida: se comprueba el objeto, el archivo pasa a RECIBIDO y se
    encola su procesamiento (EN_COLA). Idempotente: confirmar dos veces no encola dos veces."""
    try:
        a = db.uno(
            "SELECT id, bandeja_id, bucket, objeto, estado FROM archivos WHERE sf_archivo_id = %s AND sf_org_id = %s",
            (p.sfArchivoId, p.sfOrgId),
        )
        if not a:
            return error(404, "El archivo no está registrado en Google.")
        blob = gcp.cliente_storage().bucket(a["bucket"]).get_blob(a["objeto"])
        if blob is None:
            return error(404, "El archivo todavía no está en Cloud Storage.")

        estado = a["estado"]
        if estado == "SUBIENDO":
            db.ejecutar(
                "UPDATE archivos SET tamano = %s, crc32c = %s, gcs_generation = %s, estado = 'RECIBIDO', updated_at = now() WHERE id = %s",
                (blob.size, blob.crc32c, str(blob.generation), a["id"]),
            )
            estado = "RECIBIDO"

        if estado == "RECIBIDO" and gcp.procesador_configurado():
            try:
                gcp.encolar_procesamiento(a["id"])
                db.ejecutar("UPDATE archivos SET estado = 'EN_COLA', updated_at = now() WHERE id = %s AND estado = 'RECIBIDO'", (a["id"],))
                estado = "EN_COLA"
            except Exception as e:  # noqa: BLE001 - el archivo está a salvo: se registra y se podrá reencolar
                log.exception("No se ha podido encolar el procesamiento de %s", a["id"])
                db.ejecutar(
                    "INSERT INTO incidencias (codigo, gravedad, archivo_id, detalle) VALUES ('ENCOLAR_FALLIDO', 'AVISO', %s, %s)",
                    (a["id"], Jsonb({"error": str(e)})),
                )

        return {
            "bandejaId": a["bandeja_id"],
            "archivoId": a["id"],
            "gcsObjectId": f"{a['bucket']}/{a['objeto']}/{blob.generation}",
            "size": blob.size,
            "crc32c": blob.crc32c,
            "estado": estado,
        }
    except Exception:  # noqa: BLE001
        log.exception("confirm error")
        return error(500, "Error interno al confirmar la subida.")


# ===== /records =====


class RegistrosEntrada(BaseModel):
    sfOrgId: str
    sfBandejaId: str


@app.post("/records")
def records(p: RegistrosEntrada):
    """Archivos subidos de una bandeja, con dos URL firmadas de solo lectura: viewUrl (se abre en el
    navegador) y descargaUrl (se descarga con el nombre original). Salesforce ya ha comprobado que el
    usuario puede ver esa bandeja antes de llamar aquí."""
    try:
        filas = db.todos(
            """SELECT id, sf_archivo_id, sf_bandeja_id, nombre_original, bucket, objeto, tamano, mime_declarado, mime_detectado,
                      estado, created_at
               FROM archivos WHERE sf_org_id = %s AND sf_bandeja_id = %s AND origen = 'SUBIDO' ORDER BY created_at""",
            (p.sfOrgId, p.sfBandejaId),
        )
        registros = []
        for r in filas:
            ver = descargar = None
            if r["estado"] != "SUBIENDO":
                try:
                    ver = gcp.url_firmada(r["bucket"], r["objeto"], gcp.disposicion("inline", r["nombre_original"]))
                    descargar = gcp.url_firmada(r["bucket"], r["objeto"], gcp.disposicion("attachment", r["nombre_original"]))
                except Exception:  # noqa: BLE001 - sin URL el archivo se lista igual
                    log.exception("No se ha podido firmar la URL de %s", r["objeto"])
            registros.append({
                "id": r["id"],
                "sfArchivoId": r["sf_archivo_id"],
                "sfBandejaId": r["sf_bandeja_id"],
                "nombre": r["nombre_original"],
                "gcsPath": r["objeto"],
                "size": int(r["tamano"] or 0),
                "mime": r["mime_detectado"] or r["mime_declarado"],
                "estado": r["estado"],
                "createdAt": r["created_at"].isoformat(),
                "viewUrl": ver,
                "descargaUrl": descargar,
            })
        return {"registros": registros}
    except Exception:  # noqa: BLE001
        log.exception("records error")
        return error(500, "Error interno al listar los archivos.")
