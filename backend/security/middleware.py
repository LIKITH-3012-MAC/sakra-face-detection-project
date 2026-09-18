import uuid
import logging
import secrets
from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from backend.config import settings
from backend.utils.network import get_client_ip
from backend.security.rate_limiter import limiter

logger = logging.getLogger("smart_attendance.middleware")


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Rejects requests whose body size exceeds MAX_REQUEST_SIZE_BYTES (default: 10MB).
    Prevents memory exhaustion attacks, multi-megabyte base64 flooding, and denial of service.
    """
    def __init__(self, app, max_size_bytes: int = 10 * 1024 * 1024):
        super().__init__(app)
        self.max_size_bytes = max_size_bytes

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                length = int(content_length)
                if length > self.max_size_bytes:
                    logger.warning(f"Rejected oversized request ({length} bytes > {self.max_size_bytes} limit)")
                    return JSONResponse(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        content={
                            "success": False,
                            "message": f"Payload Too Large. Maximum allowed request size is {self.max_size_bytes // (1024 * 1024)}MB.",
                            "data": None
                        }
                    )
            except ValueError:
                pass

        return await call_next(request)


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Attaches a unique X-Request-ID UUID to every incoming HTTP request and response.
    Enables distributed tracing, correlation across security audit logs, and diagnostic telemetry.
    """
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming_id = request.headers.get("X-Request-ID")
        # Validate format or generate fresh UUID4
        if incoming_id and len(incoming_id) <= 64 and incoming_id.replace("-", "").isalnum():
            request_id = incoming_id
        else:
            request_id = str(uuid.uuid4())

        request.state.correlation_id = request_id
        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Applies production-grade defensive HTTP response headers at the application boundary.
    - Prevents MIME-type sniffing (nosniff)
    - Blocks clickjacking via iframe embedding (X-Frame-Options: DENY)
    - Protects referrer leakage
    - Limits browser feature permissions (camera and geolocation allowed only for self)
    - Enforces HSTS in production HTTPS environments
    """
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response: Response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(self), geolocation=(self), microphone=()"

        # HSTS only when HTTPS or in production
        if settings.is_production or request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return response


class ApiPasskeyMiddleware(BaseHTTPMiddleware):
    """
    API-Wide Master Passkey Enforcement Middleware.

    Intercepts all incoming HTTP requests to ensure valid master passkey authentication.
    Rules:
    1. Dedicated HTTP Header: X-API-Passkey (case-insensitive in ASGI/HTTP headers)
    2. Constant-time comparison using secrets.compare_digest()
    3. Sliding-window brute-force rate limiting on failed attempts per client IP
    4. Generic 401 Unauthorized responses with {"detail": "Unauthorized"}
    5. Zero logging of passkey values; never exposes secret in response or logs
    6. Whitelist exemptions for infrastructure probes (/api/health, /health, /),
       development documentation (/docs, /redoc, /openapi.json), and CORS preflight (OPTIONS)
    """

    EXCLUDED_PATHS = {
        "/api/health",
        "/health",
        "/",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/docs/oauth2-redirect",
    }

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # 1. Allow CORS preflight OPTIONS requests without credential requirement
        if request.method == "OPTIONS":
            return await call_next(request)

        # 2. Check whitelist for infrastructure / docs endpoints
        path = request.url.path.rstrip("/") or "/"
        if path in self.EXCLUDED_PATHS:
            return await call_next(request)

        # 3. Check brute-force rate limit for client IP
        client_ip = get_client_ip(request)
        rate_key = f"passkey_failed:{client_ip}"
        max_fails = getattr(settings, "API_PASSKEY_FAIL_LIMIT", 10)
        window_sec = getattr(settings, "API_PASSKEY_FAIL_WINDOW", 60)

        is_blocked, retry_after = limiter.is_blocked(rate_key, max_fails, window_sec)
        if is_blocked:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Too many invalid passkey attempts. Please try again later."},
                headers={"Retry-After": str(retry_after)}
            )

        # 4. Extract and validate passkey using constant-time comparison
        header_name = getattr(settings, "API_PASSKEY_HEADER", "X-API-Passkey")
        provided_passkey = request.headers.get(header_name)
        configured_passkey = getattr(settings, "API_MASTER_PASSKEY", "Mom")

        valid = False
        if provided_passkey and configured_passkey:
            valid = secrets.compare_digest(provided_passkey, configured_passkey)

        # Also validate requests originating from authorized production frontend origin
        if not valid:
            origin = request.headers.get("origin")
            referer = request.headers.get("referer", "")
            trusted_origins = [
                settings.FRONTEND_URL.rstrip("/"),
                "https://lens.sakra-vision.online",
                "http://localhost:5173",
                "http://127.0.0.1:5173"
            ]
            if origin and any(origin == t or origin.endswith(".sakra-vision.online") or origin.endswith(".vercel.app") for t in trusted_origins):
                valid = True
            elif referer and any(referer.startswith(t) for t in trusted_origins):
                valid = True

        if not valid:
            # Record failed attempt in sliding window rate limiter
            allowed, _, retry_after = limiter.is_allowed(rate_key, max_fails, window_sec)
            if not allowed:
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"detail": "Too many invalid passkey attempts. Please try again later."},
                    headers={"Retry-After": str(retry_after)}
                )

            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Unauthorized"}
            )

        # 5. Passkey is valid; proceed to next middleware / route handler
        return await call_next(request)

