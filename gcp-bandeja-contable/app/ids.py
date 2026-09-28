"""Identificadores internos: ULID con prefijo de tipo (p. ej. "arc_01J9Z3K8QW…").

ULID = 48 bits de tiempo (ms) + 80 bits aleatorios en base32 de Crockford: único sin coordinación,
ordenable por fecha de creación y válido en rutas de Storage y URLs.
"""

import secrets
import time

_ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

PREFIJOS = {
    "bandeja": "bnd",
    "archivo": "arc",
    "procesamiento": "prc",
    "documento": "doc",
    "extraccion": "ext",
    "confirmacion": "cnf",
}


def ulid(ahora_ms: int | None = None) -> str:
    t = int(time.time() * 1000) if ahora_ms is None else ahora_ms
    tiempo = ""
    for _ in range(10):
        tiempo = _ALFABETO[t % 32] + tiempo
        t //= 32
    aleatorio = "".join(_ALFABETO[b % 32] for b in secrets.token_bytes(16))
    return tiempo + aleatorio


def nuevo_id(tipo: str) -> str:
    if tipo not in PREFIJOS:
        raise ValueError(f"Tipo de identificador desconocido: {tipo}")
    return f"{PREFIJOS[tipo]}_{ulid()}"
