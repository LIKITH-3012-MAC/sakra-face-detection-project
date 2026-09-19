import uuid
import logging
from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from backend.config import settings

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
