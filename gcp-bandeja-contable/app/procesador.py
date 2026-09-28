"""Procesador de la Bandeja Contable (Cloud Run privado; lo invoca Cloud Tasks con OIDC).

Fase 1. Por cada archivo recibido:
  tipo real por contenido → validación → ZIP: extraer y procesar su contenido → PDF e imágenes:
  clasificador por página (Vertex AI) → documentos (referencia al original si es uno solo; PDF
  recortado en el bucket de derivados si hay varios) → incidencias → estado final.
Si el clasificador falla, el archivo no da error: queda un documento SIN_CLASIFICAR con su
incidencia y se puede reprocesar. Diseño y estados: docs/fases/fase-1-ingestion.md
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse, PlainTextResponse
from psycopg.types.json import Jsonb
from pydantic import BaseModel

from . import analisis as a
from . import clasificador, config, db, gcp
from .ids import nuevo_id

log = logging.getLogger("bandeja-contable-procesador")

VERSION_LOGICA = "separador@0.2.0"
TIPOS_FACTURA = ("FACTURA", "FACTURA_SIMPLIFICADA", "RECTIFICATIVA")
# Un archivo en PROCESANDO más tiempo que esto se considera abandonado (instancia caída) y se retoma
MINUTOS_ABANDONADO = 70

_EXT_ESPERADAS = {"pdf": ["pdf"], "png": ["png"], "jpeg": ["jpg", "jpeg"], "xlsx": ["xlsx"], "xls": ["xls"], "zip": ["zip"]}


# ===== Registro en base de datos =====


def incidencia(codigo: str, gravedad: str, archivo_id=None, procesamiento_id=None, documento_id=None, detalle=None) -> None:
    db.ejecutar(
        "INSERT INTO incidencias (codigo, gravedad, archivo_id, documento_id, procesamiento_id, detalle) VALUES (%s,%s,%s,%s,%s,%s)",
        (codigo, gravedad, archivo_id, documento_id, procesamiento_id, Jsonb(detalle) if detalle is not None else None),
    )


class Procesamiento:
    """Un procesamiento de un archivo: registra incidencias y cierra con el estado final."""

    def __init__(self, archivo: dict, solicitado_por: str):
        self.archivo = archivo
        self.id = nuevo_id("procesamiento")
        self.detalle: dict = {"version": VERSION_LOGICA}
        self.problemas: list[str] = []  # códigos de gravedad AVISO o ERROR
        self.motor = "determinista"
        self.consumo: clasificador.Consumo | None = None
        db.ejecutar(
            "INSERT INTO procesamientos (id, archivo_id, version_logica, motor, estado, solicitado_por) VALUES (%s,%s,%s,%s,'EN_CURSO',%s)",
            (self.id, archivo["id"], VERSION_LOGICA, self.motor, solicitado_por),
        )

    def incidencia(self, codigo: str, gravedad: str, detalle: dict | None = None) -> None:
        if gravedad != "INFO":
            self.problemas.append(codigo)
        incidencia(codigo, gravedad, archivo_id=self.archivo["id"], procesamiento_id=self.id, detalle=detalle)

    def finalizar(self, estado: str, *, mime=None, sha=None, paginas=None, tiene_texto=None, error=None) -> str:
        c = self.consumo
        db.ejecutar(
            """UPDATE procesamientos SET estado = %s, fin = now(), detalle = %s, error = %s, motor = %s,
                      tokens_entrada = %s, tokens_salida = %s, coste_estimado = %s WHERE id = %s""",
            ("ERROR" if error else "TERMINADO", Jsonb(self.detalle), error, self.motor,
             c.tokens_entrada if c else None, c.tokens_salida if c else None,
             round(c.coste(self.motor.split("/")[-1]), 6) if c else None, self.id),
        )
        db.ejecutar(
            """UPDATE archivos SET estado = %s, mime_detectado = COALESCE(%s, mime_detectado), sha256 = COALESCE(%s, sha256),
                      num_paginas = COALESCE(%s, num_paginas), tiene_texto = COALESCE(%s, tiene_texto),
                      procesamiento_actual_id = %s, updated_at = now() WHERE id = %s""",
            (estado, mime, sha, paginas, tiene_texto, self.id, self.archivo["id"]),
        )
        return estado


def crear_documento(p: Procesamiento, bandeja: dict, sha: str, *, estado: str, motivos: list[str], tipo="DESCONOCIDO",
                    pagina_inicio=None, pagina_fin=None, ext: str = "", contenido: bytes | None = None,
                    confianza=None, lectura: dict | None = None) -> str:
    """Crea un documento con el siguiente número de la bandeja (D01, D02…). El bloqueo por bandeja
    evita que dos tareas en paralelo asignen el mismo número.

    Sin `contenido` el documento es una REFERENCIA al archivo (no se copia); con `contenido` (un PDF
    recortado) se guarda como DERIVADO en el bucket de documentos, en la carpeta del procesamiento."""
    doc_id = nuevo_id("documento")
    bucket, objeto, almacenamiento = p.archivo["bucket"], p.archivo["objeto"], "REFERENCIA"
    if contenido is not None:
        bucket, almacenamiento = config.BUCKET_DOCS, "DERIVADO"
        objeto = f"{p.archivo['sf_org_id']}/{p.archivo['sf_bandeja_id']}/{p.archivo['id']}/{p.id}/{doc_id}.{ext or 'pdf'}"
        sha = a.sha256(contenido)
    with db.conexion() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (bandeja["id"],))
        numero = conn.execute("SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM documentos WHERE bandeja_id = %s", (bandeja["id"],)).fetchone()["n"]
        visible = f"{bandeja.get('numero') or bandeja['id']}_D{numero:02d}{'.' + ext if ext else ''}"
        if contenido is not None:
            blob = gcp.cliente_storage().bucket(bucket).blob(objeto)
            blob.content_disposition = gcp.disposicion("inline", visible)
            blob.metadata = {"documento-id": doc_id, "archivo-id": p.archivo["id"], "paginas": f"{pagina_inicio}-{pagina_fin}"}
            blob.upload_from_string(contenido, content_type=a.MIME.get(ext, "application/pdf"))
        conn.execute(
            """INSERT INTO documentos (id, procesamiento_id, archivo_id, bandeja_id, numero, pagina_inicio, pagina_fin, tipo, confianza,
                                       estado, motivos_revision, almacenamiento, bucket, objeto, sha256, nombre_visible, lectura)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (doc_id, p.id, p.archivo["id"], bandeja["id"], numero, pagina_inicio, pagina_fin, tipo, confianza, estado, motivos,
             almacenamiento, bucket, objeto, sha, visible, Jsonb(lectura) if lectura is not None else None),
        )
    return doc_id


def separar(p: Procesamiento, bandeja: dict, sha: str, imagenes: list[bytes], *, pdf: bytes | None, ext: str,
            duplicado: bool) -> list[str]:
    """Clasifica las páginas con Vertex AI y crea un documento por cada documento encontrado.

    Devuelve los estados de los documentos creados. Si el clasificador falla, deja un único
    documento SIN_CLASIFICAR (con incidencia) para no perder el archivo; se puede reprocesar.
    """
    n = len(imagenes)
    try:
        r = clasificador.clasificar(imagenes)
    except Exception as e:  # noqa: BLE001 - un fallo de Vertex no convierte el archivo en error
        log.exception("clasificador error %s", p.archivo["id"])
        p.incidencia("CLASIFICADOR_FALLIDO", "AVISO", {"error": str(e)[:500], "modelo": clasificador.modelo_configurado()})
        crear_documento(p, bandeja, sha, estado="REQUIERE_REVISION", motivos=["SIN_CLASIFICAR"], pagina_inicio=1, pagina_fin=n, ext=ext)
        return ["REQUIERE_REVISION"]

    p.motor = f"vertex/{r.modelo}"
    p.consumo = r.consumo
    p.detalle["clasificacion"] = {"version": clasificador.VERSION_PROMPT, "paginas": r.paginas,
                                  "llamadas": r.consumo.llamadas, "segundos": round(r.consumo.segundos, 1)}
    blancas = [x["pagina"] for x in r.paginas if x["tipo"] == "EN_BLANCO"]
    if blancas:
        p.incidencia("PAGINAS_EN_BLANCO", "INFO", {"paginas": blancas})
    docs = clasificador.agrupar(r.paginas)
    if not docs:  # todo en blanco
        p.incidencia("DOCUMENTO_EN_BLANCO", "AVISO")
        crear_documento(p, bandeja, sha, estado="REQUIERE_REVISION", motivos=["PAGINA_EN_BLANCO"], pagina_inicio=1, pagina_fin=n, ext=ext)
        return ["REQUIERE_REVISION"]
    if len(docs) > 1:
        p.incidencia("VARIOS_DOCUMENTOS", "INFO", {"documentos": len(docs)})

    estados = []
    un_solo_documento = len(docs) == 1 and docs[0]["pagina_inicio"] == 1 and docs[0]["pagina_fin"] == n
    for d in docs:
        motivos = list(d["motivos"]) + (["DUPLICADO"] if duplicado else [])
        estado = "LISTO" if d["tipo"] in TIPOS_FACTURA and not motivos else "REQUIERE_REVISION"
        # Un PDF con varios documentos se recorta; si es uno solo, o es una imagen, se referencia el original
        contenido = None if un_solo_documento or pdf is None else a.recortar_pdf(pdf, d["pagina_inicio"], d["pagina_fin"])
        lectura = {**d["lectura"], **({"dudas": d["dudas"]} if d["dudas"] else {})}
        crear_documento(p, bandeja, sha, estado=estado, motivos=motivos, tipo=d["tipo"], pagina_inicio=d["pagina_inicio"],
                        pagina_fin=d["pagina_fin"], ext=ext, contenido=contenido, confianza=d["confianza"], lectura=lectura)
        estados.append(estado)
    return estados


def estado_final(p: Procesamiento, estados_docs: list[str]) -> str:
    return "PROCESADO" if estados_docs and all(s == "LISTO" for s in estados_docs) and not p.problemas else "PROCESADO_CON_INCIDENCIAS"


# ===== Procesamiento de un archivo =====


def procesar_archivo(archivo: dict, bandeja: dict, solicitado_por: str, profundidad: int = 0, contenido: bytes | None = None,
                     raiz: dict | None = None) -> str:
    """Procesa un archivo (subido o extraído de un ZIP) y devuelve su estado final.

    Cada archivo tiene su propio procesamiento; el contenido de un ZIP se procesa aquí mismo.
    `raiz` es el archivo subido del que cuelga y cuándo empezó su procesamiento (para duplicados).
    """
    p = Procesamiento(archivo, solicitado_por)
    if raiz is None:
        raiz = {"id": archivo["id"], "inicio": db.uno("SELECT inicio FROM procesamientos WHERE id = %s", (p.id,))["inicio"]}

    if contenido is None:  # el contenido de un ZIP ya está en memoria: no se vuelve a descargar
        blob = gcp.cliente_storage().bucket(archivo["bucket"]).get_blob(archivo["objeto"])
        if blob is None:
            p.incidencia("ARCHIVO_NO_ENCONTRADO", "ERROR", {"objeto": archivo["objeto"]})
            return p.finalizar("ERROR", error="El objeto no existe en Cloud Storage")
        if blob.size > config.MAX_BYTES_MEMORIA:
            p.incidencia("LIMITE_SEGURIDAD", "ERROR", {"motivo": f"archivo de {blob.size} bytes (máx. en memoria {config.MAX_BYTES_MEMORIA})"})
            return p.finalizar("ERROR", error="Archivo demasiado grande para analizarlo")
        contenido = blob.download_as_bytes()

    sha = a.sha256(contenido)
    # Mismo contenido ya recibido en otra parte: se avisa, no se descarta (lo decide el asesor). Se
    # ignora lo extraído de este mismo envío en un procesamiento anterior (un reproceso no es un duplicado).
    iguales = db.todos(
        """WITH RECURSIVE arbol AS (SELECT id FROM archivos WHERE id = %(raiz)s
                                    UNION ALL SELECT h.id FROM archivos h JOIN arbol ON h.padre_id = arbol.id)
           SELECT id, sf_bandeja_id, nombre_original FROM archivos
           WHERE sha256 = %(sha)s AND id <> %(id)s AND sf_org_id = %(org)s
             AND NOT (id IN (SELECT id FROM arbol) AND created_at < %(inicio)s)
           LIMIT 5""",
        {"raiz": raiz["id"], "sha": sha, "id": archivo["id"], "org": archivo["sf_org_id"], "inicio": raiz["inicio"]},
    )
    if iguales:
        p.incidencia("DUPLICADO_ARCHIVO", "AVISO", {"iguales": iguales})

    tipo = a.detectar_tipo(contenido)
    p.detalle["tipoDetectado"] = tipo
    ext = archivo.get("extension") or a.extension(archivo["nombre_original"])

    # ===== ZIP (u Office moderno, que por dentro es un ZIP) =====
    if tipo == "zip":
        z = a.listar_zip(contenido)
        if z.corrupto:
            p.incidencia("ZIP_CORRUPTO", "ERROR", {"error": z.error})
            return p.finalizar("ERROR", mime=a.MIME["zip"], sha=sha, error="ZIP corrupto")
        if z.office == "xlsx":
            tipo = "xlsx"
        elif z.office == "otro":
            p.detalle["tipoDetectado"] = "office-otro"
            p.incidencia("FORMATO_NO_SOPORTADO", "AVISO", {"tipo": "documento de Office (no Excel)", "extension": ext})
            return p.finalizar("NO_SOPORTADO", sha=sha)
        else:
            return procesar_zip(p, z, bandeja, sha, profundidad, raiz)

    # Word y Excel antiguos comparten formato (OLE2): solo se trata como Excel lo que se llama .xls
    if tipo == "xls" and ext and ext != "xls":
        p.detalle["tipoDetectado"] = "ole2"
        p.incidencia("FORMATO_NO_SOPORTADO", "AVISO", {"tipo": "documento de Office antiguo (no Excel)", "extension": ext})
        return p.finalizar("NO_SOPORTADO", sha=sha)

    if ext and ext not in _EXT_ESPERADAS.get(tipo, []):
        p.incidencia("TIPO_NO_COINCIDE", "AVISO", {"extension": ext, "detectado": tipo})

    # ===== Excel: pendiente de flujo propio (se conserva el original) =====
    if tipo in ("xlsx", "xls"):
        p.incidencia("EXCEL_PENDIENTE_FLUJO", "INFO")
        crear_documento(p, bandeja, sha, tipo="HOJA_CALCULO", estado="REQUIERE_REVISION", motivos=["FLUJO_PENDIENTE"], ext=tipo)
        return p.finalizar("PROCESADO_CON_INCIDENCIAS", mime=a.MIME[tipo], sha=sha)

    # ===== PDF =====
    if tipo == "pdf":
        r = a.analizar_pdf(contenido)
        if r.protegido:
            p.incidencia("PDF_PROTEGIDO", "ERROR")
            return p.finalizar("ERROR", mime=a.MIME["pdf"], sha=sha, error="PDF protegido con contraseña")
        if r.corrupto:
            p.incidencia("PDF_CORRUPTO", "ERROR", {"error": r.error})
            return p.finalizar("ERROR", mime=a.MIME["pdf"], sha=sha, error="PDF corrupto")
        if not r.num_paginas:
            p.incidencia("PDF_SIN_PAGINAS", "ERROR")
            return p.finalizar("ERROR", mime=a.MIME["pdf"], sha=sha, paginas=0, error="PDF sin páginas")
        p.detalle["caracteresPorPagina"] = r.caracteres_por_pagina
        if not r.tiene_texto:
            p.incidencia("SIN_TEXTO", "INFO", {"nota": "Escaneo o imagen: se lee con visión"})
        elif r.paginas_sin_texto:
            p.incidencia("PAGINAS_SIN_TEXTO", "INFO", {"paginas": r.paginas_sin_texto})
        try:
            imagenes = clasificador.paginas_pdf(contenido)
        except Exception as e:  # noqa: BLE001 - PDF que pypdf abre pero no se puede dibujar
            p.incidencia("PDF_NO_RENDERIZABLE", "AVISO", {"error": str(e)[:500]})
            crear_documento(p, bandeja, sha, estado="REQUIERE_REVISION", motivos=["ILEGIBLE"], pagina_inicio=1, pagina_fin=r.num_paginas, ext="pdf")
            return p.finalizar("PROCESADO_CON_INCIDENCIAS", mime=a.MIME["pdf"], sha=sha, paginas=r.num_paginas, tiene_texto=r.tiene_texto)
        estados = separar(p, bandeja, sha, imagenes, pdf=contenido, ext="pdf", duplicado=bool(iguales))
        return p.finalizar(estado_final(p, estados), mime=a.MIME["pdf"], sha=sha, paginas=r.num_paginas, tiene_texto=r.tiene_texto)

    # ===== Imagen: un documento =====
    if tipo in ("png", "jpeg"):
        img = a.analizar_imagen(contenido)
        if img.get("corrupto"):
            p.incidencia("IMAGEN_CORRUPTA", "ERROR", {"error": img.get("error")})
            return p.finalizar("ERROR", mime=a.MIME[tipo], sha=sha, error="Imagen corrupta")
        p.detalle["imagen"] = img
        estados = separar(p, bandeja, sha, [clasificador.pagina_imagen(contenido)], pdf=None,
                          ext="jpg" if tipo == "jpeg" else "png", duplicado=bool(iguales))
        return p.finalizar(estado_final(p, estados), mime=a.MIME[tipo], sha=sha, paginas=1, tiene_texto=False)

    # ===== Formato no soportado: se conserva el original =====
    p.incidencia("FORMATO_NO_SOPORTADO", "AVISO", {"extension": ext, "mimeDeclarado": archivo.get("mime_declarado")})
    return p.finalizar("NO_SOPORTADO", sha=sha)


def procesar_zip(p: Procesamiento, z: a.ResultadoZip, bandeja: dict, sha: str, profundidad: int, raiz: dict) -> str:
    """Extrae cada entrada del ZIP al bucket de derivados, la registra como archivo EXTRAIDO_ZIP (con su
    padre y su ruta dentro del ZIP) y la procesa igual que si la hubiera subido el cliente.
    Sin límites de negocio: lo raro se registra como incidencia; solo los límites de seguridad cortan."""
    archivo = p.archivo
    entradas = [e for e in z.entradas if not e.directorio]
    resumen = {"entradas": len(entradas), "extraidas": 0, "ignoradas": 0}
    p.detalle["zip"] = resumen
    if profundidad > 0:
        p.incidencia("ZIP_ANIDADO", "INFO", {"profundidad": profundidad})
    if profundidad >= config.ZIP_MAX_PROFUNDIDAD:
        p.incidencia("LIMITE_SEGURIDAD", "ERROR", {"motivo": f"ZIP anidado a más de {config.ZIP_MAX_PROFUNDIDAD} niveles"})
        return p.finalizar("ERROR", mime=a.MIME["zip"], sha=sha, error="Demasiados niveles de ZIP")
    if len(entradas) > config.ZIP_MAX_ENTRADAS:
        p.incidencia("LIMITE_SEGURIDAD", "ERROR", {"motivo": f"{len(entradas)} entradas (máx. {config.ZIP_MAX_ENTRADAS})"})
        return p.finalizar("ERROR", mime=a.MIME["zip"], sha=sha, error="Demasiadas entradas en el ZIP")
    if not entradas:
        p.incidencia("ZIP_VACIO", "AVISO")

    acumulado = 0
    estados_hijos = []
    for e in entradas:  # de una en una: el procesamiento es secuencial a propósito (memoria)
        if e.ignorada:
            resumen["ignoradas"] += 1
            p.incidencia("ARCHIVO_IGNORADO", "INFO", {"ruta": e.ruta})
            continue
        if e.protegida:
            p.incidencia("ZIP_PROTEGIDO", "ERROR", {"ruta": e.ruta})
            continue
        motivo = a.excede_limites(e, acumulado)
        if motivo:
            p.incidencia("LIMITE_SEGURIDAD", "ERROR", {"ruta": e.ruta, "motivo": motivo})
            continue
        try:
            datos = a.extraer_entrada(z.zip, e, config.ZIP_MAX_BYTES_ENTRADA)
        except Exception as err:  # noqa: BLE001 - una entrada rota no para el resto
            p.incidencia("ZIP_ENTRADA_ILEGIBLE", "ERROR", {"ruta": e.ruta, "error": str(err)})
            continue
        acumulado += len(datos)
        hijo_id = nuevo_id("archivo")
        ext = a.extension(e.nombre)
        objeto = f"{archivo['sf_org_id']}/{archivo['sf_bandeja_id']}/{archivo['id']}/{p.id}/contenido/{hijo_id}{'.' + ext if ext else ''}"
        blob = gcp.cliente_storage().bucket(config.BUCKET_DOCS).blob(objeto)
        blob.content_disposition = gcp.disposicion("inline", e.nombre)
        blob.metadata = {"nombre-original": e.nombre, "ruta-en-zip": e.ruta, "archivo-id": hijo_id, "padre-id": archivo["id"]}
        blob.upload_from_string(datos, content_type=a.MIME.get(a.detectar_tipo(datos), "application/octet-stream"))
        hijo = db.uno(
            """INSERT INTO archivos (id, bandeja_id, padre_id, origen, sf_org_id, sf_bandeja_id, sf_account_id, cif, sf_user_id,
                                     nombre_original, ruta_en_zip, bucket, objeto, extension, tamano, estado)
               VALUES (%s,%s,%s,'EXTRAIDO_ZIP',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'PROCESANDO') RETURNING *""",
            (hijo_id, archivo["bandeja_id"], archivo["id"], archivo["sf_org_id"], archivo["sf_bandeja_id"], archivo["sf_account_id"],
             archivo["cif"], archivo["sf_user_id"], e.nombre, e.ruta, config.BUCKET_DOCS, objeto, ext or None, len(datos)),
        )
        resumen["extraidas"] += 1
        estados_hijos.append(procesar_archivo(hijo, bandeja, f"zip:{p.id}", profundidad + 1, datos, raiz))

    hay_problemas = any(s != "PROCESADO" for s in estados_hijos) or resumen["extraidas"] < len(entradas) - resumen["ignoradas"]
    return p.finalizar("PROCESADO_CON_INCIDENCIAS" if hay_problemas else "PROCESADO", mime=a.MIME["zip"], sha=sha)


# ===== Servicio =====


def reclamar(archivo_id: str, reprocesar: bool) -> dict | None:
    """Reclama el archivo para procesarlo (atómico: dos tareas a la vez no lo procesan dos veces).

    reprocesar = True permite volver a procesar un archivo ya terminado: sus documentos vigentes pasan
    a SUSTITUIDO y se crea un procesamiento nuevo (nunca se borra nada).
    """
    iniciales = ["RECIBIDO", "EN_COLA"] + (["PROCESADO", "PROCESADO_CON_INCIDENCIAS", "NO_SOPORTADO", "ERROR"] if reprocesar else [])
    archivo = db.uno(
        """UPDATE archivos SET estado = 'PROCESANDO', updated_at = now()
           WHERE id = %s AND origen = 'SUBIDO'
             AND (estado = ANY(%s) OR (estado = 'PROCESANDO' AND updated_at < now() - make_interval(mins => %s)))
           RETURNING *""",
        (archivo_id, iniciales, MINUTOS_ABANDONADO),
    )
    if archivo and reprocesar:
        db.ejecutar(
            """UPDATE documentos SET estado = 'SUSTITUIDO', updated_at = now()
               WHERE estado <> 'SUSTITUIDO' AND archivo_id IN (
                 WITH RECURSIVE arbol AS (SELECT id FROM archivos WHERE id = %s
                                          UNION SELECT h.id FROM archivos h JOIN arbol ON h.padre_id = arbol.id)
                 SELECT id FROM arbol)""",
            (archivo_id,),
        )
    return archivo


@asynccontextmanager
async def ciclo_de_vida(_app: FastAPI):
    config.comprobar("BUCKET_RAW", "BUCKET_DOCS", "INSTANCE_CONNECTION_NAME", "DB_NAME", "DB_USER", "DB_PASSWORD")
    db.preparar_esquema()
    log.info("bandeja-contable-procesador listo")
    yield
    db.cerrar()


app = FastAPI(title="Bandeja Contable · Procesador", lifespan=ciclo_de_vida)


@app.get("/", response_class=PlainTextResponse)
def salud() -> str:
    return "bandeja-contable-procesador OK"


class ProcesarEntrada(BaseModel):
    archivoId: str
    reprocesar: bool = False


@app.post("/procesar")
def procesar(p: ProcesarEntrada):
    """Cloud Tasks reintenta si la respuesta no es 2xx: los fallos definitivos (archivo corrupto, formato
    no soportado…) se registran y responden 200; solo los temporales (red, BD) responden 500."""
    archivo = None
    try:
        archivo = reclamar(p.archivoId, p.reprocesar)
        if not archivo:
            return {"archivoId": p.archivoId, "omitido": "El archivo no está pendiente de procesar."}
        bandeja = db.uno("SELECT id, numero FROM bandejas WHERE id = %s", (archivo["bandeja_id"],))
        estado = procesar_archivo(archivo, bandeja, "reproceso" if p.reprocesar else "automatico")
        log.info("procesado %s → %s", p.archivoId, estado)
        return {"archivoId": p.archivoId, "estado": estado}
    except Exception as e:  # noqa: BLE001 - se devuelve a la cola para que Cloud Tasks lo reintente
        log.exception("procesar error %s", p.archivoId)
        if archivo:
            try:
                db.ejecutar("UPDATE archivos SET estado = 'EN_COLA', updated_at = now() WHERE id = %s AND estado = 'PROCESANDO'", (p.archivoId,))
                incidencia("PROCESAMIENTO_FALLIDO", "AVISO", archivo_id=p.archivoId, detalle={"error": str(e)})
            except Exception:  # noqa: BLE001
                log.exception("Tampoco se ha podido registrar el fallo")
        return JSONResponse(status_code=500, content={"error": "Error temporal al procesar; se reintentará."})
