"""Conexión a Cloud SQL (Postgres) y esquema."""

from contextlib import contextmanager
from pathlib import Path

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from . import config

_pool: ConnectionPool | None = None


def abrir() -> ConnectionPool:
    """Abre el pool (Cloud Run + Cloud SQL: socket unix montado con --add-cloudsql-instances)."""
    global _pool
    if _pool is None:
        conninfo = (
            f"host=/cloudsql/{config.INSTANCE_CONNECTION_NAME} dbname={config.DB_NAME} "
            f"user={config.DB_USER} password={config.DB_PASSWORD}"
        )
        _pool = ConnectionPool(conninfo, min_size=1, max_size=5, kwargs={"row_factory": dict_row}, open=True)
    return _pool


def cerrar() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def preparar_esquema() -> None:
    """Crea las tablas si no existen (esquema.sql es idempotente)."""
    sql = (Path(__file__).resolve().parent.parent / "esquema.sql").read_text(encoding="utf-8")
    with abrir().connection() as conn:
        conn.execute(sql)


@contextmanager
def conexion():
    """Conexión con transacción: commit al salir bien, rollback si hay excepción."""
    with abrir().connection() as conn:
        yield conn


def uno(sql: str, params: tuple | list = ()) -> dict | None:
    with conexion() as conn:
        return conn.execute(sql, params).fetchone()


def todos(sql: str, params: tuple | list = ()) -> list[dict]:
    with conexion() as conn:
        return conn.execute(sql, params).fetchall()


def ejecutar(sql: str, params: tuple | list = ()) -> None:
    with conexion() as conn:
        conn.execute(sql, params)
