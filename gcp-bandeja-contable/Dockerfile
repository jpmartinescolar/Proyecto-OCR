# Imagen de los dos servicios de Cloud Run (API y procesador): mismo código, SERVICIO decide cuál arranca.
# Python 3.14, la misma versión que el entorno local (.venv).
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY esquema.sql .
COPY app ./app

# Cloud Run indica el puerto en PORT
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --no-access-log"]
