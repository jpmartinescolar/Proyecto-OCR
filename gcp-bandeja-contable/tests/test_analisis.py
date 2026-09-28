"""Pruebas del análisis determinista con archivos generados en el propio test (sin datos reales).

Ejecutar desde gcp-bandeja-contable/:  ..\\.venv\\Scripts\\python -m pytest
"""

import io
import zipfile

from PIL import Image
from reportlab.pdfgen import canvas

from app import analisis as a


def pdf_con_paginas(textos: list[str]) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    for t in textos:
        if t:
            c.drawString(50, 780, t)
        c.showPage()
    c.save()
    return buf.getvalue()


def imagen(formato: str) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (3, 2), "white").save(buf, format=formato)
    return buf.getvalue()


def zip_con(entradas: list[tuple[str, bytes | None]], utf8: bool = True) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for ruta, contenido in entradas:
            info = zipfile.ZipInfo(ruta)
            if not utf8:
                info.flag_bits &= ~0x800
            if contenido is None:
                z.mkdir(ruta.rstrip("/")) if hasattr(z, "mkdir") else z.writestr(ruta, b"")
            else:
                z.writestr(info, contenido)
    return buf.getvalue()


def test_detecta_el_tipo_por_el_contenido():
    assert a.detectar_tipo(pdf_con_paginas(["hola"])) == "pdf"
    assert a.detectar_tipo(imagen("PNG")) == "png"
    assert a.detectar_tipo(imagen("JPEG")) == "jpeg"
    assert a.detectar_tipo(zip_con([("a.txt", b"x")])) == "zip"
    assert a.detectar_tipo(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1\x00") == "xls"
    assert a.detectar_tipo(b"MZ ejecutable") == "desconocido"


def test_pdf_paginas_texto_y_escaneos():
    r = a.analizar_pdf(pdf_con_paginas(["Factura FE-001 de Endesa Energia por suministro", "", "Factura FE-002 total 121,00 euros"]))
    assert r.num_paginas == 3
    assert r.tiene_texto
    assert r.paginas_sin_texto == [2]
    assert not a.analizar_pdf(pdf_con_paginas(["", ""])).tiene_texto


def test_pdf_corrupto():
    assert a.analizar_pdf(b"%PDF-1.7\nesto no es un pdf de verdad").corrupto or a.analizar_pdf(b"%PDF-1.7\nx").num_paginas == 0


def test_imagenes():
    assert a.analizar_imagen(imagen("PNG")) == {"ancho": 3, "alto": 2, "formato": "png"}
    assert a.analizar_imagen(imagen("JPEG"))["formato"] == "jpeg"
    assert a.analizar_imagen(b"\x89PNG\r\n\x1a\n roto")["corrupto"]


def test_zip_entradas_basura_y_anidado():
    interior = zip_con([("dentro.pdf", pdf_con_paginas(["x"]))])
    r = a.listar_zip(zip_con([
        ("facturas/enero ñ.pdf", pdf_con_paginas(["Factura enero"])),
        ("foto.png", imagen("PNG")),
        ("__MACOSX/facturas/._enero.pdf", b"basura"),
        (".DS_Store", b"basura"),
        ("otro.zip", interior),
    ]))
    assert r.office is None
    utiles = [e for e in r.entradas if not e.directorio and not e.ignorada]
    assert sorted(e.ruta for e in utiles) == ["facturas/enero ñ.pdf", "foto.png", "otro.zip"]
    assert len([e for e in r.entradas if e.ignorada]) == 2
    pdf = a.extraer_entrada(r.zip, next(e for e in utiles if e.nombre == "enero ñ.pdf"), 10 * 1024 * 1024)
    assert a.detectar_tipo(pdf) == "pdf"
    assert a.detectar_tipo(a.extraer_entrada(r.zip, next(e for e in utiles if e.nombre == "otro.zip"), 10 * 1024 * 1024)) == "zip"


def test_zip_de_windows_con_nombres_en_cp850():
    # Windows en España guarda los nombres en cp850 sin marcar UTF-8
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        info = zipfile.ZipInfo("factura año ñandú.pdf".encode("cp850").decode("cp437"))
        z.writestr(info, b"%PDF-1.4")
    r = a.listar_zip(buf.getvalue())
    assert r.entradas[0].nombre == "factura año ñandú.pdf"


def test_zip_que_es_un_office():
    assert a.listar_zip(zip_con([("[Content_Types].xml", b"<Types/>"), ("xl/workbook.xml", b"<w/>")])).office == "xlsx"
    assert a.listar_zip(zip_con([("[Content_Types].xml", b"<Types/>"), ("word/document.xml", b"<w/>")])).office == "otro"


def test_limites_de_seguridad():
    lim = {"max_bytes_entrada": 100, "max_bytes_total": 1000, "max_ratio": 200}

    def e(tamano, comprimido):
        return a.EntradaZip(info=None, ruta="x", nombre="x", directorio=False, ignorada=False, protegida=False, tamano=tamano, comprimido=comprimido)

    assert "entrada de 500 bytes" in a.excede_limites(e(500, 400), 0, lim)
    assert "supera 1000 bytes" in a.excede_limites(e(90, 80), 950, lim)
    assert "relación de compresión" in a.excede_limites(e(50 * 1024 * 1024, 1024), 0, {**lim, "max_bytes_entrada": 10**12, "max_bytes_total": 10**12})
    assert a.excede_limites(e(90, 80), 0, lim) is None


def test_zip_corrupto():
    assert a.listar_zip(b"PK\x03\x04 no es un zip").corrupto
