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


def pdf_en_blanco(paginas=1):
    w = PdfWriter()
    for _ in range(paginas):
        w.add_blank_page(width=200, height=300)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def test_paginas_escaneadas_van_como_imagen():
    pags = clasificador.paginas_pdf(pdf_en_blanco())
    assert len(pags) == 1 and pags[0].modo == "imagen" and pags[0].imagen[:2] == b"\xff\xd8"  # JPEG


def test_paginas_con_texto_van_como_texto_con_imagen_de_apoyo():
    texto = "Factura 123 " * 30
    pags = clasificador.paginas_pdf(pdf_en_blanco(2), [texto, "poco"])
    assert pags[0].modo == "texto" and pags[0].texto == texto and pags[0].imagen
    assert pags[1].modo == "imagen" and pags[1].texto is None  # poco texto: se lee como imagen


def test_importes_en_formato_espanol():
    assert clasificador.importe("1.234,56 €") == 1234.56
    assert clasificador.importe("371,59") == 371.59
    assert clasificador.importe("0.31") == 0.31
    assert clasificador.importe("-100,88") == -100.88
    assert clasificador.importe(None) is None


FACTURA = {"lineas_iva": [{"base": 100, "tipo": 21, "cuota": 21}], "total": 121, "confianzas": {"total": 0.95},
           "emisor": {"nif": "A11111111"}, "receptor": {"nif": "B22222222"}}


def test_revisar_extraccion_correcta():
    assert clasificador.revisar_extraccion(FACTURA, "B22222222", "121,00") == []


def test_revisar_extraccion_descuadre_y_confianza():
    x = {**FACTURA, "total": 150, "confianzas": {"total": 0.5}}
    assert clasificador.revisar_extraccion(x) == ["DESCUADRE", "BAJA_CONFIANZA"]


def test_retencion_y_recargo_cuadran():
    x = {"lineas_iva": [{"base": 100, "tipo": 21, "cuota": 21, "tipo_recargo": 5.2, "cuota_recargo": 5.2}],
         "retencion": {"tipo": 15, "importe": 15}, "total": 111.2, "confianzas": {}}
    assert clasificador.revisar_extraccion(x) == []


def test_coma_decimal_mal_leida_se_detecta():
    # Caso real: "371,59" extraído como 371591 (bases y cuotas infladas igual: el cuadre no lo ve)
    x = {"lineas_iva": [{"base": 307100, "tipo": 21, "cuota": 64491}], "total": 371591, "confianzas": {}}
    assert clasificador.revisar_extraccion(x, None, "371,59") == ["LECTURA_DISCREPANTE"]


def test_otra_empresa_y_ticket_sin_receptor():
    assert clasificador.revisar_extraccion(FACTURA, "B99999999") == ["NO_CORRESPONDE_EMPRESA"]
    assert clasificador.revisar_extraccion(FACTURA, "ESB22222222") == []  # con prefijo de país
    ticket = {**FACTURA, "receptor": None}
    assert clasificador.revisar_extraccion(ticket, "B99999999") == []  # los tickets no traen receptor


def test_contexto_cliente():
    assert "RECEPTOR" in clasificador.contexto_cliente("ABANTI", "B84816925", "Recibida")
    assert "EMISOR" in clasificador.contexto_cliente(None, "B84816925", "Emitida")
    assert clasificador.contexto_cliente(None, None, "Recibida") == ""


def test_factura_estructurada():
    assert analisis.detectar_tipo(b'<?xml version="1.0"?><fe:Facturae xmlns:fe="http://www.facturae.es/">') == "xml"
    assert analisis.es_factura_estructurada(b'<?xml version="1.0"?><fe:Facturae>') == "Facturae"
    assert analisis.es_factura_estructurada(b"<rsm:CrossIndustryInvoice>") == "CII"
    assert analisis.es_factura_estructurada(b"<nada/>") is None
    assert analisis.xml_embebidos(pdf_en_blanco()) == []


def test_catalogo_con_un_modelo_activo():
    assert clasificador.MODELO_ACTIVO in clasificador.MODELOS
    assert clasificador.modelo_configurado() == clasificador.MODELO_ACTIVO


def test_iva_agrupado_por_tipo():
    lineas = [{"base": 10, "tipo": 21, "cuota": 2.1}, {"base": 5.5, "tipo": 21, "cuota": 1.16}, {"base": 3, "tipo": 10, "cuota": 0.3}]
    g = clasificador.agrupar_iva(lineas)
    assert g == [{"base": 15.5, "tipo": 21, "cuota": 3.26, "tipo_recargo": None, "cuota_recargo": None},
                 {"base": 3.0, "tipo": 10, "cuota": 0.3, "tipo_recargo": None, "cuota_recargo": None}]


def test_varios_documentos_en_la_extraccion():
    assert clasificador.revisar_extraccion({**FACTURA, "varios_documentos": True}) == ["SEPARACION_INCIERTA"]
