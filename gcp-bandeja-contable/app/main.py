"""Punto de entrada común de los dos servicios de Cloud Run de la Bandeja Contable.

Mismo código y mismos módulos (db, ids, esquema); cada servicio arranca su aplicación según SERVICIO:
  SERVICIO=api (por defecto)  → app.api         (sesiones de subida, confirmación, listados)
  SERVICIO=procesador         → app.procesador  (ingestión y separación de documentos)
"""

import logging

from . import config

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")

if config.SERVICIO == "procesador":
    from .procesador import app  # noqa: F401
else:
    from .api import app  # noqa: F401
