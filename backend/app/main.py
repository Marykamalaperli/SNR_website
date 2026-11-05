import json
import logging
import re
import time
from uuid import uuid4

from fastapi import FastAPI, Request
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.v1.router import router
from app.core.config import Settings, get_settings
from app.core.errors import error_response, register_error_handlers

logger = logging.getLogger("snr_nest.requests")
logger.setLevel(logging.INFO)
if not logger.handlers:
    logger.addHandler(logging.StreamHandler())
logger.propagate = False


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    application = FastAPI(
        title="SNR NEST API",
        version="0.1.0",
        docs_url="/docs" if settings.app_env != "production" else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.app_env != "production" else None,
    )
    application.dependency_overrides[get_settings] = lambda: settings
    application.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    register_error_handlers(application)

    @application.middleware("http")
    async def request_context(request: Request, call_next):
        incoming = request.headers.get("X-Request-ID", "")
        request_id = incoming if re.fullmatch(r"[A-Za-z0-9_-]{8,64}", incoming) else str(uuid4())
        request.state.request_id = request_id
        start = time.perf_counter()
        try:
            response = await call_next(request)
            # TrustedHost emits a plain 400; normalize it to the public error contract.
            if response.status_code == 400 and request.url.hostname not in settings.allowed_hosts:
                response = error_response(request, 400, "invalid_host", "This host is not allowed.")
        except Exception:
            # Intentionally omit exception text: upstream messages can contain secrets/PII.
            logger.error(json.dumps({"event": "request_failed", "request_id": request_id}))
            response = error_response(
                request, 500, "internal_error", "An unexpected error occurred."
            )
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        if settings.app_env != "production" and request.url.path == "/docs":
            # FastAPI's development-only Swagger UI loads the official CDN assets.
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "img-src 'self' data: https://fastapi.tiangolo.com; frame-ancestors 'none'"
            )
        route = request.scope.get("route")
        logger.info(
            json.dumps(
                {
                    "event": "http_request",
                    "request_id": request_id,
                    "method": request.method,
                    "route": route.path if route else "unmatched",
                    "status": response.status_code,
                    "duration_ms": round((time.perf_counter() - start) * 1000, 2),
                }
            )
        )
        return response

    # CORS outermost ensures even normalized server errors have configured CORS headers.
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID", "Idempotency-Key"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )

    @application.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "snr-nest-api"}

    application.include_router(router)
    return application


app = create_app()
