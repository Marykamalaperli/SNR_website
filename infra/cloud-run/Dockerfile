FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt backend/requirements.lock ./
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --uid 10001 --create-home appuser
COPY --chown=appuser:appuser backend/app ./app
USER appuser
EXPOSE 8080
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --no-access-log --host 0.0.0.0 --port ${PORT:-8080}"]
