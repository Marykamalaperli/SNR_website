# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY backend/requirements-runtime.txt backend/requirements.lock ./
RUN pip install --no-cache-dir -r requirements-runtime.txt \
    && useradd --uid 10001 --create-home appuser

COPY --chown=appuser:appuser backend/app ./app
COPY --chown=appuser:appuser backend/alembic ./alembic
COPY --chown=appuser:appuser backend/alembic.ini ./alembic.ini

USER appuser
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--no-access-log", "--host", "0.0.0.0", "--port", "8000"]
