"""Análisis determinista de archivos (sin IA): tipo real por contenido, PDF, imágenes y ZIP.

Funciones puras sobre bytes: no tocan Google ni la base de datos (se prueban en tests/).
"""

from __future__ import annotations

import hashlib
import io
import re
import zipfile
from dataclasses import dataclass, field

from PIL import Image, UnidentifiedImageError
from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError

from . import config

MIME = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpeg": "image/jpeg",
    "zip": "application/zip",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
}

# Entradas de ZIP que no son documentos del cliente: se ignoran (con incidencia INFO)
_IGNORADOS = [
    re.compile(r"^__MACOSX/"),
    re.compile(r"(^|/)\.DS_Store$"),
    re.compile(r"(^|/)Thumbs\.db$", re.I),
    re.compile(r"(^|/)desktop\.ini$", re.I),
    re.compile(r"(^|/)\._"),
]

# Una página con menos caracteres que esto se considera sin texto (escaneo o en blanco)
MIN_CARACTERES_TEXTO = 20


def sha256(datos: bytes) -> str:
    return hashlib.sha256(datos).hexdigest()


def extension(nombre: str | None) -> str:
    m = re.search(r"\.([A-Za-z0-9]{1,10})$", nombre or "")
    return m.group(1).lower() if m else ""


def detectar_tipo(datos: bytes) -> str:
    """Tipo por los primeros bytes (no por la extensión ni por lo que declara el navegador).

    Un ZIP puede ser un Office moderno (xlsx/docx): se distingue después, al ver sus entradas.
    """
    # Primero las firmas que van en el byte 0: un ZIP que contiene un PDF sin comprimir lleva
    # "%PDF-" entre sus primeros bytes y no debe tomarse por PDF
    if datos.startswith(b"PK\x03\x04") or datos.startswith(b"PK\x05\x06"):
        return "zip"
    if datos.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if datos.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if datos.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):  # OLE2: Office antiguo (xls, doc…)
        return "xls"
    # La norma PDF admite bytes antes de la cabecera: se busca en el primer KB
    if b"%PDF-" in datos[:1024]:
        return "pdf"
    return "desconocido"


# ===== PDF =====


@dataclass
class ResultadoPdf:
    protegido: bool = False
    corrupto: bool = False
    error: str | None = None
    num_paginas: int = 0
    caracteres_por_pagina: list[int] = field(default_factory=list)

    @property
    def tiene_texto(self) -> bool:
        return any(c > MIN_CARACTERES_TEXTO for c in self.caracteres_por_pagina)

    @property
    def paginas_sin_texto(self) -> list[int]:
        return [i + 1 for i, c in enumerate(self.caracteres_por_pagina) if c <= MIN_CARACTERES_TEXTO]


def analizar_pdf(datos: bytes) -> ResultadoPdf:
    """Nº de páginas y cantidad de texto por página. Un PDF sin texto es un escaneo (necesitará
    visión para clasificarlo). Marca protegido o corrupto si no se puede abrir."""
    try:
        lector = PdfReader(io.BytesIO(datos), strict=False)
        if lector.is_encrypted:
            # Algunos PDF están cifrados solo con contraseña de propietario (se abren sin contraseña)
            try:
                if not lector.decrypt(""):
                    return ResultadoPdf(protegido=True)
            except Exception:  # noqa: BLE001 - cifrados no soportados: se tratan como protegidos
                return ResultadoPdf(protegido=True)
        caracteres = []
        for pagina in lector.pages:
            try:
                texto = pagina.extract_text() or ""
            except Exception:  # noqa: BLE001 - una página ilegible no invalida el resto
                texto = ""
            caracteres.append(len(" ".join(texto.split())))
        return ResultadoPdf(num_paginas=len(lector.pages), caracteres_por_pagina=caracteres)
    except (PdfReadError, ValueError, KeyError, TypeError) as e:
        return ResultadoPdf(corrupto=True, error=str(e))


def recortar_pdf(datos: bytes, pagina_inicio: int, pagina_fin: int) -> bytes:
    """PDF nuevo con las páginas pagina_inicio..pagina_fin (base 1, incluidas)."""
    lector = PdfReader(io.BytesIO(datos), strict=False)
    if lector.is_encrypted:
        lector.decrypt("")
    escritor = PdfWriter()
    for i in range(pagina_inicio - 1, pagina_fin):
        escritor.add_page(lector.pages[i])
    buf = io.BytesIO()
    escritor.write(buf)
    return buf.getvalue()


# ===== Imágenes =====


def analizar_imagen(datos: bytes) -> dict:
    """Dimensiones y formato de una imagen; {"corrupto": True} si no se puede leer."""
    try:
        with Image.open(io.BytesIO(datos)) as img:
            img.verify()
        with Image.open(io.BytesIO(datos)) as img:
            return {"ancho": img.width, "alto": img.height, "formato": (img.format or "").lower()}
    except (UnidentifiedImageError, OSError, SyntaxError) as e:
        return {"corrupto": True, "error": str(e)}


# ===== ZIP =====


@dataclass
class EntradaZip:
    info: zipfile.ZipInfo
    ruta: str
    nombre: str
    directorio: bool
    ignorada: bool
    protegida: bool
    tamano: int
    comprimido: int


def _nombre_real(info: zipfile.ZipInfo) -> str:
    """Nombre de la entrada con tildes y eñes correctas.

    Si el ZIP no marca los nombres como UTF-8 (bit 11), Python los descodifica como cp437. Los ZIP
    creados en Windows en España suelen usar cp850, y otras herramientas UTF-8 sin marcarlo.
    """
    if info.flag_bits & 0x800:
        return info.filename
    crudo = info.filename.encode("cp437", errors="replace")
    for codificacion in ("utf-8", "cp850"):
        try:
            return crudo.decode(codificacion)
        except UnicodeDecodeError:
            continue
    return info.filename


@dataclass
class ResultadoZip:
    corrupto: bool = False
    error: str | None = None
    zip: zipfile.ZipFile | None = None
    entradas: list[EntradaZip] = field(default_factory=list)
    office: str | None = None  # "xlsx", "otro" (docx, pptx…) o None si es un ZIP normal


def listar_zip(datos: bytes) -> ResultadoZip:
    """Recorre un ZIP y devuelve sus entradas sin descomprimir. Detecta si es un Office moderno."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(datos))
    except (zipfile.BadZipFile, ValueError, OSError) as e:
        return ResultadoZip(corrupto=True, error=str(e))
    entradas = []
    for info in zf.infolist():
        ruta = _nombre_real(info)
        entradas.append(
            EntradaZip(
                info=info,
                ruta=ruta,
                nombre=ruta.rstrip("/").split("/")[-1],
                directorio=info.is_dir(),
                ignorada=any(r.search(ruta) for r in _IGNORADOS),
                protegida=bool(info.flag_bits & 0x1),
                tamano=info.file_size,
                comprimido=info.compress_size,
            )
        )
    nombres = [e.ruta for e in entradas]
    office = None
    if "[Content_Types].xml" in nombres:
        office = "xlsx" if any(n.startswith("xl/") for n in nombres) else "otro"
    return ResultadoZip(zip=zf, entradas=entradas, office=office)


def extraer_entrada(zf: zipfile.ZipFile, entrada: EntradaZip, max_bytes: int) -> bytes:
    """Descomprime una entrada; falla si supera max_bytes (lee como mucho max_bytes + 1)."""
    with zf.open(entrada.info) as f:
        datos = f.read(max_bytes + 1)
    if len(datos) > max_bytes:
        raise ValueError(f"La entrada supera el límite de {max_bytes} bytes")
    return datos


def excede_limites(entrada: EntradaZip, acumulado: int, limites: dict | None = None) -> str | None:
    """Motivo por el que una entrada no se debe descomprimir (límites de seguridad), o None.

    La relación de compresión delata las "bombas ZIP" (pocos KB que se expanden a GB).
    """
    lim = limites or {
        "max_bytes_entrada": config.ZIP_MAX_BYTES_ENTRADA,
        "max_bytes_total": config.ZIP_MAX_BYTES_TOTAL,
        "max_ratio": config.ZIP_MAX_RATIO,
    }
    if entrada.tamano > lim["max_bytes_entrada"]:
        return f"entrada de {entrada.tamano} bytes (máx. {lim['max_bytes_entrada']})"
    if acumulado + entrada.tamano > lim["max_bytes_total"]:
        return f"el ZIP supera {lim['max_bytes_total']} bytes descomprimido"
    if entrada.comprimido > 0 and entrada.tamano > 10 * 1024 * 1024 and entrada.tamano / entrada.comprimido > lim["max_ratio"]:
        return f"relación de compresión {round(entrada.tamano / entrada.comprimido)}:1 (máx. {lim['max_ratio']}:1)"
    return None
