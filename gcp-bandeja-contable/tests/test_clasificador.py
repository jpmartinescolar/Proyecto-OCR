"""Agrupación de páginas en documentos y recorte de PDF (sin llamar a Vertex)."""

import io

from pypdf import PdfReader, PdfWriter

from app import analisis, clasificador


def pag(n, tipo="FACTURA", empieza=True, conf=0.9, **lectura):
    return {"pagina": n, "tipo": tipo, "empieza_documento": empieza, "confianza": conf, **lectura}


def rangos(docs):
    return [(d["pagina_inicio"], d["pagina_fin"]) for d in docs]


def test_factura_de_varias_paginas_no_se_parte():
    docs = clasificador.agrupar([pag(1, emisor="AWS", numero="E1"), pag(2, empieza=False), pag(3, empieza=False, numero="E1")])
    assert rangos(docs) == [(1, 3)]
    assert docs[0]["lectura"] == {"emisor": "AWS", "numero": "E1"}


def test_otro_numero_es_otro_documento_aunque_el_modelo_diga_que_continua():
    # Caso real de las muestras: dos facturas de OBRAMAT seguidas (028034 y 027945)
    docs = clasificador.agrupar([pag(1, emisor="OBRAMAT", numero="011-0004-028034"),
                                 pag(2, empieza=False, emisor="OBRAMAT", numero="011-0004-027945"),
                                 pag(3, empieza=False)])
    assert rangos(docs) == [(1, 1), (2, 3)]


def test_otro_emisor_es_otro_documento():
    docs = clasificador.agrupar([pag(1, "ALBARAN", emisor="pinturas IMCASA"), pag(2, empieza=False, emisor="GARCIA NOBLEJAS")])
    assert rangos(docs) == [(1, 1), (2, 2)]


def test_mismo_numero_y_emisor_une_aunque_el_modelo_diga_que_empieza():
    docs = clasificador.agrupar([pag(1, emisor="OBRAMAT BRICOLAJE", numero="F-1"), pag(2, emisor="OBRAMAT", numero="F-1")])
    assert rangos(docs) == [(1, 2)]


def test_paginas_en_blanco_separan_y_no_son_documento():
    docs = clasificador.agrupar([pag(1), pag(2, "EN_BLANCO"), pag(3, empieza=False)])
    assert rangos(docs) == [(1, 1), (3, 3)]


def test_motivos_de_revision():
    docs = clasificador.agrupar([pag(1, "OTRO"), pag(2, conf=0.5), pag(3), pag(4, "ALBARAN", empieza=False)])
    assert docs[0]["motivos"] == ["NO_PARECE_FACTURA"]
    assert docs[1]["motivos"] == ["BAJA_CONFIANZA"]
    assert docs[2]["motivos"] == ["VARIOS_TIPOS_MEZCLADOS"]


def test_recortar_pdf():
    w = PdfWriter()
    for _ in range(5):
        w.add_blank_page(width=100, height=100)
    buf = io.BytesIO()
    w.write(buf)
    recorte = analisis.recortar_pdf(buf.getvalue(), 2, 4)
    assert len(PdfReader(io.BytesIO(recorte)).pages) == 3


def test_paginas_pdf_como_imagen():
    w = PdfWriter()
    w.add_blank_page(width=200, height=300)
    buf = io.BytesIO()
    w.write(buf)
    imgs = clasificador.paginas_pdf(buf.getvalue())
    assert len(imgs) == 1 and imgs[0][:2] == b"\xff\xd8"  # JPEG


def test_catalogo_con_un_modelo_activo():
    assert clasificador.MODELO_ACTIVO in clasificador.MODELOS
    assert clasificador.modelo_configurado() == clasificador.MODELO_ACTIVO
