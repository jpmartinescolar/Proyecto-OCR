"""Pruebas de humo: las dos aplicaciones cargan y responden, y los identificadores son correctos.

(Sin base de datos ni Google: no se entra en el ciclo de vida de la aplicación.)
"""

import importlib
import re

from fastapi.testclient import TestClient

from app import ids


def test_ids_con_prefijo_y_ordenables():
    a, b = ids.nuevo_id("archivo"), ids.nuevo_id("archivo")
    assert re.fullmatch(r"arc_[0-9A-HJKMNP-TV-Z]{26}", a)
    assert a != b
    assert ids.ulid(1000) < ids.ulid(2000), "más reciente = mayor"
    assert ids.nuevo_id("documento").startswith("doc_")


def test_api_y_procesador_responden(monkeypatch):
    from app import api, procesador

    assert TestClient(api.app).get("/").text == "bandeja-contable-api OK"
    assert TestClient(procesador.app).get("/").text == "bandeja-contable-procesador OK"


def test_main_elige_el_servicio(monkeypatch):
    from app import config

    monkeypatch.setattr(config, "SERVICIO", "procesador")
    import app.main as main

    importlib.reload(main)
    assert main.app.title == "Bandeja Contable · Procesador"
    monkeypatch.setattr(config, "SERVICIO", "api")
    importlib.reload(main)
    assert main.app.title == "Bandeja Contable · API"


def test_validacion_de_entrada_de_la_api():
    from app import api

    cliente = TestClient(api.app)
    # Faltan campos obligatorios: FastAPI responde 422 sin tocar la base de datos
    assert cliente.post("/upload-session", json={"sfOrgId": "x"}).status_code == 422
    assert cliente.post("/confirm", json={}).status_code == 422
