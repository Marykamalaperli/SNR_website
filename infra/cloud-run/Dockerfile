# syntax=docker/dockerfile:1
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements-runtime.txt backend/requirements.lock ./
# Optional public CA bundle for managed build proxies; never retained in a layer.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; \
    pip install --no-cache-dir -r requirements-runtime.txt \
    && useradd --uid 10001 --create-home appuser
COPY --chown=appuser:appuser backend/app ./app
USER appuser
EXPOSE 8080
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --no-access-log --host 0.0.0.0 --port ${PORT:-8080}"]
