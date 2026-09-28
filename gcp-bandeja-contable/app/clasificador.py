"""Lectura de documentos con IA (Vertex AI), en dos etapas dentro del mismo procesamiento:

1. **Separar** (Fase 1, paso 4): cada página, por lotes, → tipo, dónde empieza cada documento y una
   lectura rápida (emisor, NIF, número, fecha, total) que ayuda a no partir facturas de varias páginas.
2. **Extraer** (Fase 2): cada documento con todas sus páginas juntas → todos los datos de la factura
   (partes, fechas, desglose de IVA, retención, productos…) con su confianza. Se guarda tal cual en
   la tabla `extracciones` (nunca se sobrescribe con lo que confirme el asesor).

Cada página se envía de la forma más fiable y barata:
- PDF electrónico (con capa de texto): su texto exacto + una imagen pequeña para el diseño.
- Escaneo o foto: la imagen a resolución de lectura.

Modelos: catálogo comentado con uno solo activo (comentar y descomentar, o CLASIFICADOR_MODELO en
Cloud Run para una comparación puntual). Todos en Vertex AI, en la UE.
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
logging.getLogger("pypdf").setLevel(logging.ERROR)  # "Rotated text discovered…" no aporta en los logs

# ===== Catálogo de modelos (uno activo) =====
# Precios en USD por millón de tokens (entrada, salida), Vertex AI, septiembre 2026. Revisar en
# https://cloud.google.com/vertex-ai/generative-ai/pricing antes de sacar conclusiones de coste.
MODELOS = {
    # Gemini: regiones de la UE por orden de preferencia; si una está saturada (429) se reintenta en la siguiente
    "gemini-2.5-flash-lite": {"proveedor": "gemini", "id": "gemini-2.5-flash-lite", "regiones": ["europe-southwest1", "europe-west1", "europe-west4"], "precio": (0.10, 0.40)},
    "gemini-2.5-flash": {"proveedor": "gemini", "id": "gemini-2.5-flash", "regiones": ["europe-southwest1", "europe-west1", "europe-west4"], "precio": (0.30, 2.50)},
    # Claude en la multirregión UE ("eu"): +10 % sobre el precio global. Requiere habilitarlo en Model
    # Garden y cuota en el proyecto (hoy 0: la petición devuelve 429 hasta que se pida el aumento).
    "claude-haiku-4-5": {"proveedor": "claude", "id": "claude-haiku-4-5@20251001", "regiones": ["eu"], "precio": (1.10, 5.50)},
}
# Activo: 2.5 Flash. Con las muestras (28/09), Flash-Lite juntaba facturas seguidas y confundía la coma decimal
# (371,59 → 371591); Flash separó bien las 19 páginas (17 documentos) y cuadró todos los importes, a ~3 USD/1.000 págs.
# MODELO_ACTIVO = "gemini-2.5-flash-lite"
MODELO_ACTIVO = "gemini-2.5-flash"
# MODELO_ACTIVO = "claude-haiku-4-5"

VERSION_PROMPT = "separador@3"
VERSION_EXTRACCION = "extractor@1"
PAGINAS_POR_LLAMADA = 8  # lote de páginas por petición al separar
MAX_PAGINAS_EXTRACCION = 20  # un documento más largo se extrae con sus primeras y últimas páginas
DPI_LECTURA = 110  # escaneos y fotos: suficiente para leer una factura (~90 KB por página)
DPI_APOYO = 60  # imagen de apoyo de una página con texto (solo diseño: logos, cortes)
MIN_CARACTERES_TEXTO = 200  # por debajo, la página se lee como imagen aunque tenga algo de texto
UMBRAL_CONFIANZA = 0.80
TOLERANCIA_CUADRE = 0.05  # € de diferencia admitida en Σ bases + Σ cuotas + R.E. − retención = total

TIPOS = ["FACTURA", "FACTURA_SIMPLIFICADA", "RECTIFICATIVA", "ALBARAN", "PRESUPUESTO", "OTRO", "EN_BLANCO"]
TIPOS_EXTRAIBLES = ("FACTURA", "FACTURA_SIMPLIFICADA", "RECTIFICATIVA", "ALBARAN", "PRESUPUESTO")


@dataclass
class Pagina:
    """Una página tal como se envía al modelo: texto exacto (PDF electrónico) y/o imagen."""
    numero: int
    imagen: bytes | None = None
    texto: str | None = None

    @property
    def modo(self) -> str:
        return "texto" if self.texto else "imagen"


@dataclass
class Consumo:
    tokens_entrada: int = 0
    tokens_salida: int = 0
    segundos: float = 0.0
    llamadas: int = 0

    def sumar(self, otro: "Consumo") -> None:
        self.tokens_entrada += otro.tokens_entrada
        self.tokens_salida += otro.tokens_salida
        self.segundos += otro.segundos
        self.llamadas += otro.llamadas

    def coste(self, modelo: str) -> float:
        pe, ps = MODELOS[modelo]["precio"]
        return (self.tokens_entrada * pe + self.tokens_salida * ps) / 1_000_000


@dataclass
class ResultadoClasificacion:
    modelo: str
    paginas: list[dict] = field(default_factory=list)
    consumo: Consumo = field(default_factory=Consumo)


@dataclass
class Extraccion:
    modelo: str
    datos: dict
    consumo: Consumo


def modelo_configurado() -> str:
    m = config.CLASIFICADOR_MODELO or MODELO_ACTIVO
    if m not in MODELOS:
        raise ValueError(f"Modelo de clasificación desconocido: {m}")
    return m


# ===== Páginas =====


def _jpeg(img, calidad: int) -> bytes:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=calidad)
    return buf.getvalue()


def paginas_pdf(datos: bytes, textos: list[str] | None = None) -> list[Pagina]:
    """Páginas del PDF listas para el modelo (pypdfium2: licencia Apache/BSD). Con `textos` (capa de
    texto de un PDF electrónico) las páginas con texto suficiente van como texto + imagen de apoyo."""
    pdf = pdfium.PdfDocument(datos)
    try:
        out = []
        for i in range(len(pdf)):
            texto = (textos[i] if textos and i < len(textos) else "") or ""
            con_texto = len(texto) >= MIN_CARACTERES_TEXTO
            dpi = DPI_APOYO if con_texto else DPI_LECTURA
            imagen = _jpeg(pdf[i].render(scale=dpi / 72).to_pil(), 60 if con_texto else 70)
            out.append(Pagina(i + 1, imagen=imagen, texto=texto if con_texto else None))
        return out
    finally:
        pdf.close()


def pagina_imagen(datos: bytes) -> Pagina:
    """Una foto o escaneo (PNG/JPEG) normalizado a JPEG de tamaño razonable."""
    from PIL import Image

    img = Image.open(io.BytesIO(datos))
    img.thumbnail((1700, 1700))
    return Pagina(1, imagen=_jpeg(img, 75))


# ===== Llamada a los modelos =====


def _partes(paginas: list[Pagina]) -> list[tuple[str, object]]:
    """Contenido común a los dos proveedores: ("texto", str) o ("imagen", bytes)."""
    out: list[tuple[str, object]] = []
    for p in paginas:
        if p.texto:
            out.append(("texto", f"Página {p.numero} (PDF electrónico; este es su texto exacto, úsalo para las cifras):\n{p.texto}"))
            if p.imagen:
                out.append(("texto", f"Imagen de la página {p.numero} (solo para ver el diseño):"))
                out.append(("imagen", p.imagen))
        else:
            out.append(("texto", f"Página {p.numero} (imagen):"))
            out.append(("imagen", p.imagen))
    return out


# Vertex rechaza ráfagas (429: capacidad compartida de la región) o está saturado (503): se reintenta en
# la siguiente región de la UE del modelo y, al dar la vuelta, con espera creciente
REINTENTOS = 8


def _reintentable(e: Exception) -> bool:
    codigo = getattr(e, "code", None) or getattr(e, "status_code", None)
    return codigo in (429, 500, 503, 529) or "RESOURCE_EXHAUSTED" in str(e) or "UNAVAILABLE" in str(e)


def _llamar(modelo: str, partes: list[tuple[str, object]], prompt: str, esquema: dict, max_salida: int,
            credenciales=None, access_token=None) -> tuple[dict, Consumo]:
    regiones = MODELOS[modelo]["regiones"]
    espera = 1.0
    for intento in range(REINTENTOS):
        region = regiones[intento % len(regiones)]
        try:
            return _llamar_una_vez(modelo, region, partes, prompt, esquema, max_salida, credenciales, access_token)
        except Exception as e:  # noqa: BLE001
            if intento == REINTENTOS - 1 or not _reintentable(e):
                raise
            siguiente = regiones[(intento + 1) % len(regiones)]
            if siguiente == regiones[0]:  # se han probado todas: esperar antes de dar otra vuelta
                espera = min(espera * 2, 30)
                time.sleep(espera)
            log.warning("Vertex %s ocupado en %s (%s); reintento en %s", modelo, region, str(e)[:60], siguiente)
    raise RuntimeError("inalcanzable")


def _llamar_una_vez(modelo: str, region: str, partes: list[tuple[str, object]], prompt: str, esquema: dict, max_salida: int,
                    credenciales=None, access_token=None) -> tuple[dict, Consumo]:
    m = MODELOS[modelo]
    t = time.time()
    if m["proveedor"] == "gemini":
        from google import genai
        from google.genai import types

        cliente = genai.Client(vertexai=True, project=config.PROJECT_ID, location=region, credentials=credenciales)
        contenido = [types.Part.from_bytes(data=v, mime_type="image/jpeg") if k == "imagen" else v for k, v in partes] + [prompt]
        r = cliente.models.generate_content(
            model=m["id"], contents=contenido,
            # Sin razonamiento: aquí solo se lee y se clasifica; en 2.5 Flash consumiría el límite de salida
            config=types.GenerateContentConfig(temperature=0, max_output_tokens=max_salida, thinking_config=types.ThinkingConfig(thinking_budget=0),
                                               response_mime_type="application/json", response_schema=esquema),
        )
        u = r.usage_metadata
        datos, te, ts = json.loads(r.text), u.prompt_token_count or 0, u.candidates_token_count or 0
    else:
        from anthropic import AnthropicVertex

        cliente = AnthropicVertex(project_id=config.PROJECT_ID, region=region, access_token=access_token)
        contenido = [{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(v).decode()}}
                     if k == "imagen" else {"type": "text", "text": v} for k, v in partes]
        contenido.append({"type": "text", "text": prompt + "\nResponde solo con un objeto JSON que siga este esquema:\n"
                          + json.dumps(esquema, ensure_ascii=False)})
        r = cliente.messages.create(model=m["id"], max_tokens=max_salida, temperature=0, messages=[{"role": "user", "content": contenido}])
        texto = "".join(b.text for b in r.content if b.type == "text").strip()
        texto = texto[texto.find("{"): texto.rfind("}") + 1]  # por si envuelve el JSON en texto o ```
        datos, te, ts = json.loads(texto), r.usage.input_tokens, r.usage.output_tokens
    return datos, Consumo(te, ts, time.time() - t, 1)


# ===== Etapa 1: separar =====

PROMPT_SEPARAR = """Eres el separador de documentos de un despacho contable español. Recibes páginas consecutivas de un
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

{cliente}{contexto}Responde solo con el JSON pedido."""

ESQUEMA_SEPARAR = {
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


def _contexto(anterior: dict | None) -> str:
    if not anterior:
        return ""
    datos = {k: anterior.get(k) for k in ("pagina", "tipo", "emisor", "numero")}
    return f"Contexto: la página anterior a este lote era {json.dumps(datos, ensure_ascii=False)}.\n\n"


def clasificar(paginas: list[Pagina], modelo: str | None = None, credenciales=None, access_token=None,
               cliente: str = "") -> ResultadoClasificacion:
    """Clasifica todas las páginas por lotes. Devuelve una entrada por página, en orden."""
    modelo = modelo or modelo_configurado()
    res = ResultadoClasificacion(modelo=modelo)
    anterior = None
    for inicio in range(0, len(paginas), PAGINAS_POR_LLAMADA):
        lote = paginas[inicio: inicio + PAGINAS_POR_LLAMADA]
        datos, c = _llamar(modelo, _partes(lote), PROMPT_SEPARAR.format(cliente=cliente, contexto=_contexto(anterior)), ESQUEMA_SEPARAR, 4000,
                           credenciales, access_token)
        res.consumo.sumar(c)
        por_pagina = {p.get("pagina"): p for p in datos.get("paginas", [])}
        for pg in lote:
            # Página que el modelo no ha devuelto: se marca para revisión en vez de inventarla
            p = por_pagina.get(pg.numero) or {"pagina": pg.numero, "tipo": "OTRO", "empieza_documento": True, "confianza": 0,
                                              "motivo": "El modelo no devolvió esta página"}
            p["confianza"] = max(0.0, min(1.0, float(p.get("confianza") or 0)))
            p["modo"] = pg.modo
            res.paginas.append(p)
        anterior = res.paginas[-1]
    return res


def _norm(s) -> str:
    return "".join(ch for ch in str(s or "").upper() if ch.isalnum())


def _mismo_emisor(a: str, b: str) -> bool:
    """Tolera abreviaturas del mismo emisor ("OBRAMAT" y "OBRAMAT BRICOLAJE BRICOMAN")."""
    return a.startswith(b) or b.startswith(a)


def agrupar(paginas: list[dict]) -> list[dict]:
    """Agrupa las páginas en documentos. Las páginas en blanco no forman documento: separan.

    Cada documento: {pagina_inicio, pagina_fin, tipo, confianza, motivos, lectura, dudas}.
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


# ===== Etapa 2: extraer =====

PROMPT_EXTRAER = """Eres el extractor de datos de un despacho contable español. Recibes TODAS las páginas de un único
documento ({tipo}). Extrae sus datos para contabilizarlo.
{cliente}
Reglas:
- Copia los datos tal como aparecen; si un dato no está, null. No inventes ni calcules lo que no se lee
  (sí puedes deducir el tipo de IVA a partir de base y cuota si solo aparecen esos dos).
- Importes como números con punto decimal (1234.56), sin símbolo de moneda. Negativos en abonos.
  Las facturas españolas usan coma decimal y punto de miles: "1.234,56" es 1234.56 y "371,59" es 371.59
  (nunca 371591). Comprueba que base + cuota se parece al total impreso.
- Fechas en formato dd/mm/aaaa.
- lineas_iva: una entrada por cada tipo de IVA del cuadro de impuestos (base, tipo en %, cuota y, si hay
  recargo de equivalencia, su tipo y cuota). Las líneas exentas o no sujetas van con tipo 0.
- retencion: la retención de IRPF si la hay (tipo en % e importe positivo).
- productos: las líneas de detalle (descripción, cantidad, precio unitario, tipo de IVA, importe sin IVA).
- confianzas: de 0 a 1 para cada grupo de datos, según lo legible y seguro que sea.
- Si es un PDF electrónico, usa su texto exacto para las cifras; la imagen solo sirve para el diseño.
- varios_documentos: true si estas páginas NO son un único documento (p. ej. dos facturas con distinto número);
  en ese caso extrae solo el primero.

Responde solo con el JSON pedido."""

_TXT = {"type": "string", "nullable": True}
_NUM = {"type": "number", "nullable": True}
_PARTE = {"type": "object", "nullable": True, "properties": {"nombre": _TXT, "nif": _TXT, "direccion": _TXT, "codigo_postal": _TXT}}
ESQUEMA_EXTRAER = {
    "type": "object",
    "properties": {
        "tipo": {"type": "string", "enum": TIPOS[:-1]},
        "emisor": _PARTE,
        "receptor": _PARTE,
        "numero": _TXT,
        "fecha_emision": _TXT,
        "fecha_operacion": _TXT,
        "fecha_vencimiento": _TXT,
        "periodo_facturado": _TXT,
        "moneda": _TXT,
        "factura_rectificada": _TXT,
        "lineas_iva": {"type": "array", "items": {"type": "object", "properties": {
            "base": _NUM, "tipo": _NUM, "cuota": _NUM, "tipo_recargo": _NUM, "cuota_recargo": _NUM}}},
        "retencion": {"type": "object", "nullable": True, "properties": {"tipo": _NUM, "importe": _NUM}},
        "total": _NUM,
        "mencion_exencion": _TXT,
        "direccion_suministro": _TXT,
        "forma_pago": _TXT,
        "iban": _TXT,
        "productos": {"type": "array", "items": {"type": "object", "properties": {
            "descripcion": _TXT, "cantidad": _NUM, "precio_unitario": _NUM, "tipo_iva": _NUM, "importe": _NUM}}},
        "confianzas": {"type": "object", "properties": {
            "emisor": _NUM, "receptor": _NUM, "numero": _NUM, "fechas": _NUM, "lineas_iva": _NUM, "total": _NUM, "productos": _NUM}},
        "observaciones": _TXT,
        "varios_documentos": {"type": "boolean"},
    },
    "required": ["tipo", "lineas_iva", "total", "confianzas"],
}


def contexto_cliente(nombre: str | None, cif: str | None, tipo_bandeja: str | None) -> str:
    """Quién es el cliente del despacho: sin esto el modelo confunde emisor y receptor en los tickets."""
    if not (nombre or cif):
        return ""
    quien = " ".join(x for x in (nombre, f"(NIF {cif})" if cif else "") if x)
    papel = {"Emitida": "el EMISOR (son facturas que emite)", "Recibida": "el RECEPTOR (son facturas que recibe; nunca es el emisor)",
             "Ticket": "el RECEPTOR (son gastos y tickets que paga; nunca es el emisor)"}.get(tipo_bandeja or "", "el emisor o el receptor")
    return f"El cliente del despacho es {quien}; en estos documentos es {papel}. No pongas su NIF como NIF del proveedor.\n"


def extraer(paginas: list[Pagina], tipo: str, cliente: str = "", modelo: str | None = None,
            credenciales=None, access_token=None) -> Extraccion:
    """Extrae todos los datos de UN documento con todas sus páginas (una factura de varias páginas se
    lee entera). Un documento muy largo se lee con sus primeras y últimas páginas (el detalle y los totales).
    `cliente`: texto de contexto_cliente()."""
    modelo = modelo or modelo_configurado()
    if len(paginas) > MAX_PAGINAS_EXTRACCION:
        mitad = MAX_PAGINAS_EXTRACCION // 2
        paginas = paginas[:mitad] + paginas[-mitad:]
    prompt = PROMPT_EXTRAER.format(tipo=tipo.lower().replace("_", " "), cliente=cliente)
    datos, c = _llamar(modelo, _partes(paginas), prompt, ESQUEMA_EXTRAER, 8000, credenciales, access_token)
    datos["lineas_iva"] = agrupar_iva(datos.get("lineas_iva") or [])
    return Extraccion(modelo=modelo, datos=datos, consumo=c)


def agrupar_iva(lineas: list[dict]) -> list[dict]:
    """Una línea por tipo de IVA (y de recargo): el modelo a veces devuelve una por producto."""
    grupos: dict = {}
    for ln in lineas:
        clave = (ln.get("tipo"), ln.get("tipo_recargo"))
        g = grupos.setdefault(clave, {"base": 0.0, "tipo": ln.get("tipo"), "cuota": 0.0, "tipo_recargo": ln.get("tipo_recargo"), "cuota_recargo": 0.0})
        for k in ("base", "cuota", "cuota_recargo"):
            g[k] = round(g[k] + (ln.get(k) or 0), 2)
    for g in grupos.values():
        if not g["tipo_recargo"] and not g["cuota_recargo"]:
            g["tipo_recargo"] = g["cuota_recargo"] = None
    return list(grupos.values())


def importe(texto) -> float | None:
    """ "1.234,56 €" → 1234.56 (formato español). None si no es un importe."""
    s = "".join(ch for ch in str(texto or "") if ch.isdigit() or ch in ",.-")
    if not any(ch.isdigit() for ch in s):
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif s.count(".") > 1:
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def revisar_extraccion(datos: dict, cif_cliente: str | None = None, total_lectura=None) -> list[str]:
    """Motivos de revisión que salen de los datos extraídos (deterministas, sin IA).

    `total_lectura`: el total que leyó la etapa de separación; si no coincide con el extraído, uno de los
    dos se ha leído mal (p. ej. la coma decimal tomada por separador de miles)."""
    motivos = []
    if datos.get("varios_documentos"):
        motivos.append("SEPARACION_INCIERTA")
    leido = importe(total_lectura)
    total_extraido = datos.get("total")
    if leido is not None and total_extraido is not None and abs(abs(leido) - abs(total_extraido)) > max(TOLERANCIA_CUADRE, abs(leido) * 0.01):
        motivos.append("LECTURA_DISCREPANTE")
    lineas = datos.get("lineas_iva") or []
    suma = sum((ln.get("base") or 0) + (ln.get("cuota") or 0) + (ln.get("cuota_recargo") or 0) for ln in lineas)
    retencion = (datos.get("retencion") or {}).get("importe") or 0
    total = datos.get("total")
    if total is None or not lineas or abs(suma - abs(retencion) - total) > TOLERANCIA_CUADRE:
        motivos.append("DESCUADRE")
    confianzas = [v for v in (datos.get("confianzas") or {}).values() if isinstance(v, (int, float))]
    if confianzas and min(confianzas) < UMBRAL_CONFIANZA:
        motivos.append("BAJA_CONFIANZA")
    # El cliente del despacho debe ser el receptor (recibidas) o el emisor (emitidas). Solo se comprueba
    # si la factura trae el NIF del receptor: los tickets no lo llevan.
    cif = _norm(cif_cliente)
    receptor = _norm((datos.get("receptor") or {}).get("nif"))
    if cif and receptor:
        nifs = {receptor, _norm((datos.get("emisor") or {}).get("nif"))} - {""}
        if not any(n == cif or cif.endswith(n) or n.endswith(cif) for n in nifs):  # tolera prefijo de país (ESB12345678)
            motivos.append("NO_CORRESPONDE_EMPRESA")
    return motivos
