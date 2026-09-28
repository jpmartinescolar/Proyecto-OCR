"""Clasificador por página (Fase 1, paso 4): lee cada página como imagen con un modelo de visión de
Vertex AI y decide dónde empieza cada documento, de qué tipo es y hace una lectura preliminar
(emisor, NIF, número, fecha y total) que ayuda a no partir una factura de varias páginas.

La lectura preliminar NO es la extracción de la Fase 2: sirve para separar y para que el asesor vea
qué ha encontrado Google; los datos de la factura se extraerán y confirmarán en sus propias tablas.

Modelos: el catálogo queda comentado con uno solo activo. Para cambiar, comentar y descomentar (o
fijar CLASIFICADOR_MODELO en Cloud Run para una comparación puntual). Todos en Vertex AI, en la UE.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import time
from dataclasses import dataclass, field

import pypdfium2 as pdfium

from . import config

log = logging.getLogger("bandeja-contable-clasificador")

# ===== Catálogo de modelos (uno activo) =====
# Precios en USD por millón de tokens (entrada, salida), Vertex AI, septiembre 2026. Revisar en
# https://cloud.google.com/vertex-ai/generative-ai/pricing antes de sacar conclusiones de coste.
MODELOS = {
    "gemini-2.5-flash-lite": {"proveedor": "gemini", "id": "gemini-2.5-flash-lite", "region": "europe-southwest1", "precio": (0.10, 0.40)},
    "gemini-2.5-flash": {"proveedor": "gemini", "id": "gemini-2.5-flash", "region": "europe-southwest1", "precio": (0.30, 2.50)},
    # Claude en la multirregión UE ("eu"): +10 % sobre el precio global. Requiere cuota en el proyecto
    # (hoy 0: la petición devuelve 429 hasta que se solicite el aumento en la consola de Google Cloud).
    "claude-haiku-4-5": {"proveedor": "claude", "id": "claude-haiku-4-5@20251001", "region": "eu", "precio": (1.10, 5.50)},
}
MODELO_ACTIVO = "gemini-2.5-flash-lite"
# MODELO_ACTIVO = "gemini-2.5-flash"
# MODELO_ACTIVO = "claude-haiku-4-5"

VERSION_PROMPT = "clasificador@2"
PAGINAS_POR_LLAMADA = 8  # lote de páginas por petición (contexto para no partir facturas de varias páginas)
DPI = 110  # suficiente para leer una factura escaneada; ~90 KB por página en JPEG
UMBRAL_CONFIANZA = 0.80

TIPOS = ["FACTURA", "FACTURA_SIMPLIFICADA", "RECTIFICATIVA", "ALBARAN", "PRESUPUESTO", "OTRO", "EN_BLANCO"]

PROMPT = """Eres el separador de documentos de un despacho contable español. Recibes páginas consecutivas de un
archivo que ha subido un cliente (pueden venir varias facturas en el mismo PDF, facturas de varias páginas,
albaranes, justificantes u otros documentos).

Para CADA página devuelve un objeto con:
- pagina: número de página que se te indica.
- tipo: FACTURA, FACTURA_SIMPLIFICADA (ticket), RECTIFICATIVA, ALBARAN, PRESUPUESTO, OTRO (no contable: guías,
  contratos, correos…) o EN_BLANCO.
- empieza_documento: true si en esta página empieza un documento nuevo; false si continúa el de la página
  anterior (misma factura: mismo emisor y número, "página 2 de 3", solo condiciones o totales…). Si el número
  de factura o el emisor cambian respecto a la página anterior, SIEMPRE empieza un documento nuevo, aunque el
  formato sea igual (un mismo proveedor puede tener varias facturas seguidas).
- confianza: de 0 a 1, tu seguridad sobre tipo y corte.
- emisor, nif_emisor, numero, fecha (dd/mm/aaaa) y total (con decimales y coma): solo si se leen en esta página;
  si no, null. No inventes datos.
- motivo: frase corta si dudas (ilegible, mezcla de tipos…); si no, null.

{contexto}Responde solo con el JSON pedido."""

ESQUEMA = {
    "type": "object",
    "properties": {
        "paginas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "pagina": {"type": "integer"},
                    "tipo": {"type": "string", "enum": TIPOS},
                    "empieza_documento": {"type": "boolean"},
                    "confianza": {"type": "number"},
                    "emisor": {"type": "string", "nullable": True},
                    "nif_emisor": {"type": "string", "nullable": True},
                    "numero": {"type": "string", "nullable": True},
                    "fecha": {"type": "string", "nullable": True},
                    "total": {"type": "string", "nullable": True},
                    "motivo": {"type": "string", "nullable": True},
                },
                "required": ["pagina", "tipo", "empieza_documento", "confianza"],
            },
        }
    },
    "required": ["paginas"],
}


@dataclass
class Consumo:
    tokens_entrada: int = 0
    tokens_salida: int = 0
    segundos: float = 0.0
    llamadas: int = 0

    def coste(self, modelo: str) -> float:
        pe, ps = MODELOS[modelo]["precio"]
        return (self.tokens_entrada * pe + self.tokens_salida * ps) / 1_000_000


@dataclass
class ResultadoClasificacion:
    modelo: str
    paginas: list[dict] = field(default_factory=list)
    consumo: Consumo = field(default_factory=Consumo)


def modelo_configurado() -> str:
    m = config.CLASIFICADOR_MODELO or MODELO_ACTIVO
    if m not in MODELOS:
        raise ValueError(f"Modelo de clasificación desconocido: {m}")
    return m


# ===== Páginas como imagen =====


def paginas_pdf(datos: bytes) -> list[bytes]:
    """Cada página del PDF como JPEG (pypdfium2: licencia Apache/BSD)."""
    pdf = pdfium.PdfDocument(datos)
    try:
        out = []
        for i in range(len(pdf)):
            img = pdf[i].render(scale=DPI / 72).to_pil().convert("RGB")
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=70)
            out.append(buf.getvalue())
        return out
    finally:
        pdf.close()


def pagina_imagen(datos: bytes) -> bytes:
    """Una foto o escaneo (PNG/JPEG) normalizado a JPEG de tamaño razonable."""
    from PIL import Image

    img = Image.open(io.BytesIO(datos)).convert("RGB")
    img.thumbnail((1700, 1700))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=75)
    return buf.getvalue()


# ===== Llamadas a los modelos =====


def _contexto(anterior: dict | None) -> str:
    if not anterior:
        return ""
    datos = {k: anterior.get(k) for k in ("pagina", "tipo", "emisor", "numero")}
    return f"Contexto: la página anterior a este lote era {json.dumps(datos, ensure_ascii=False)}.\n\n"


def _gemini(modelo: dict, imagenes: list[tuple[int, bytes]], prompt: str, credenciales=None) -> tuple[dict, int, int]:
    from google import genai
    from google.genai import types

    cliente = genai.Client(vertexai=True, project=config.PROJECT_ID, location=modelo["region"], credentials=credenciales)
    partes = []
    for n, img in imagenes:
        partes.append(f"Página {n}:")
        partes.append(types.Part.from_bytes(data=img, mime_type="image/jpeg"))
    partes.append(prompt)
    r = cliente.models.generate_content(
        model=modelo["id"],
        contents=partes,
        config=types.GenerateContentConfig(temperature=0, response_mime_type="application/json", response_schema=ESQUEMA),
    )
    u = r.usage_metadata
    return json.loads(r.text), u.prompt_token_count or 0, u.candidates_token_count or 0


def _claude(modelo: dict, imagenes: list[tuple[int, bytes]], prompt: str, access_token=None) -> tuple[dict, int, int]:
    from anthropic import AnthropicVertex

    cliente = AnthropicVertex(project_id=config.PROJECT_ID, region=modelo["region"], access_token=access_token)
    contenido = []
    for n, img in imagenes:
        contenido.append({"type": "text", "text": f"Página {n}:"})
        contenido.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(img).decode()}})
    contenido.append({"type": "text", "text": prompt + '\nFormato: {"paginas": [ ... ]}'})
    r = cliente.messages.create(model=modelo["id"], max_tokens=4000, temperature=0, messages=[{"role": "user", "content": contenido}])
    texto = "".join(b.text for b in r.content if b.type == "text").strip()
    texto = texto[texto.find("{"): texto.rfind("}") + 1]  # por si envuelve el JSON en texto o ```
    return json.loads(texto), r.usage.input_tokens, r.usage.output_tokens


def clasificar(imagenes: list[bytes], modelo: str | None = None, credenciales=None, access_token=None) -> ResultadoClasificacion:
    """Clasifica todas las páginas por lotes. Devuelve una entrada por página, en orden."""
    modelo = modelo or modelo_configurado()
    m = MODELOS[modelo]
    res = ResultadoClasificacion(modelo=modelo)
    anterior = None
    for inicio in range(0, len(imagenes), PAGINAS_POR_LLAMADA):
        lote = [(i + 1, imagenes[i]) for i in range(inicio, min(inicio + PAGINAS_POR_LLAMADA, len(imagenes)))]
        prompt = PROMPT.format(contexto=_contexto(anterior))
        t = time.time()
        if m["proveedor"] == "gemini":
            datos, te, ts = _gemini(m, lote, prompt, credenciales)
        else:
            datos, te, ts = _claude(m, lote, prompt, access_token)
        res.consumo.segundos += time.time() - t
        res.consumo.tokens_entrada += te
        res.consumo.tokens_salida += ts
        res.consumo.llamadas += 1
        por_pagina = {p.get("pagina"): p for p in datos.get("paginas", [])}
        for n, _ in lote:
            # Página que el modelo no ha devuelto: se marca para revisión en vez de inventarla
            p = por_pagina.get(n) or {"pagina": n, "tipo": "OTRO", "empieza_documento": True, "confianza": 0, "motivo": "El modelo no devolvió esta página"}
            p["confianza"] = max(0.0, min(1.0, float(p.get("confianza") or 0)))
            res.paginas.append(p)
        anterior = res.paginas[-1]
    return res


# ===== De páginas a documentos =====


def _norm(s) -> str:
    return "".join(ch for ch in str(s or "").upper() if ch.isalnum())


def _mismo_emisor(a: str, b: str) -> bool:
    """Tolera abreviaturas del mismo emisor ("OBRAMAT" y "OBRAMAT BRICOLAJE BRICOMAN")."""
    return a.startswith(b) or b.startswith(a)


def agrupar(paginas: list[dict]) -> list[dict]:
    """Agrupa las páginas en documentos. Las páginas en blanco no forman documento: separan.

    Cada documento: {pagina_inicio, pagina_fin, paginas, tipo, confianza, motivos, lectura}.
    """
    docs: list[dict] = []
    actual = None
    for p in paginas:
        if p["tipo"] == "EN_BLANCO":
            actual = None
            continue
        nuevo = actual is None or p.get("empieza_documento", True)
        if actual:
            numero, emisor = _norm(p.get("numero")), _norm(p.get("emisor"))
            num_actual, emi_actual = _norm(actual["lectura"].get("numero")), _norm(actual["lectura"].get("emisor"))
            # Reglas deterministas sobre la lectura (corrigen al modelo, comprobado con las muestras):
            # otro número de factura u otro emisor = otro documento; mismo número y emisor = mismo documento
            if (numero and num_actual and numero != num_actual) or (emisor and emi_actual and not _mismo_emisor(emisor, emi_actual)):
                nuevo = True
            elif nuevo and numero and numero == num_actual and (not emisor or not emi_actual or _mismo_emisor(emisor, emi_actual)):
                nuevo = False
        if nuevo:
            actual = {"pagina_inicio": p["pagina"], "pagina_fin": p["pagina"], "paginas": [p], "lectura": {}}
            docs.append(actual)
        else:
            actual["pagina_fin"] = p["pagina"]
            actual["paginas"].append(p)
        for k in ("emisor", "nif_emisor", "numero", "fecha", "total"):
            if p.get(k) and not actual["lectura"].get(k):
                actual["lectura"][k] = p[k]
    for d in docs:
        tipos = [p["tipo"] for p in d["paginas"]]
        d["tipo"] = tipos[0]
        d["confianza"] = round(min(p["confianza"] for p in d["paginas"]), 3)
        motivos = []
        if len(set(tipos)) > 1:
            motivos.append("VARIOS_TIPOS_MEZCLADOS")
        if d["tipo"] in ("OTRO", "ALBARAN", "PRESUPUESTO"):
            motivos.append("NO_PARECE_FACTURA")
        if d["confianza"] < UMBRAL_CONFIANZA:
            motivos.append("BAJA_CONFIANZA")
        d["motivos"] = motivos
        d["dudas"] = [p["motivo"] for p in d["paginas"] if p.get("motivo")]
        d.pop("paginas")
    return docs
