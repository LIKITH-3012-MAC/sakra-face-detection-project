import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from mysql.connector import Error as MySQLError

from backend.config import settings
from backend.database.connection import init_connection_pool, execute_query
from backend.routers.health import router as health_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("smart_attendance")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Try to initialize MySQL pool
    logger.info("Initializing Smart Attendance System...")
    init_connection_pool()

    from backend.services.biometric_engine import FACE_RECOGNITION_AVAILABLE
    from backend.services.recognition_service import recognition_service
    students = execute_query("SELECT id FROM students", fetchall=True) or []
    encodings_count = recognition_service.load_registered_students()

    engine_status = "ONLINE (dlib ResNet-34 128-D)" if FACE_RECOGNITION_AVAILABLE else "OFFLINE / NOT LOADED"
    banner = f"""
==================================================
SMART ATTENDANCE SYSTEM - STARTUP & BIOMETRICS
==================================================
Biometric Engine   : {engine_status}
Registered Students: {len(students)}
Encodings Loaded   : {encodings_count}
Tolerance Gate     : {recognition_service.tolerance:.2f}
Cloud MySQL        : CONNECTED
==================================================
"""
    print(banner, flush=True)

    yield
    # Shutdown
    logger.info("Shutting down Smart Attendance System...")

from backend.security import (
    RequestSizeLimitMiddleware,
    CorrelationIdMiddleware,
    SecurityHeadersMiddleware,
    ApiPasskeyMiddleware
)

app = FastAPI(
    title="Smart Attendance System API",
    description="Automated Face Recognition Attendance System using FastAPI, OpenCV, and Cloud MySQL",
    version="1.0.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
    lifespan=lifespan
)

# Security Middlewares (LIFO execution order for incoming requests)
app.add_middleware(ApiPasskeyMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(RequestSizeLimitMiddleware, max_size_bytes=settings.MAX_REQUEST_SIZE_BYTES)

# CORS Configuration (Must wrap outer application to handle preflight OPTIONS and inject headers)
configured_origins = [o.strip() for o in settings.FRONTEND_URL.split(",") if o.strip()]
known_origins = [
    "https://lens.sakra-vision.online",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]
origins = list(dict.fromkeys(configured_origins + known_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*(\.vercel\.app|\.sakra-vision\.online)",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token", "X-Request-ID", "Accept", "X-API-Passkey"],
    expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"]
)

# Global Exception Handlers for consistent API response format
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for error in exc.errors():
        field = " -> ".join([str(loc) for loc in error["loc"]])
        errors.append(f"{field}: {error['msg']}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "message": f"Validation Error: {'; '.join(errors)}",
            "data": None
        }
    )

@app.exception_handler(MySQLError)
async def mysql_exception_handler(request: Request, exc: MySQLError):
    logger.error(f"Database Error: {exc.msg}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "message": "A database error occurred. Please try again later.",
            "data": None
        }
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled Exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "message": "An internal server error occurred.",
            "data": None
        }
    )

# Include Routers
from backend.routers import (
    health_router,
    students_router,
    attendance_router,
    camera_router,
    reports_router,
    recognition_router,
    auth_router,
    admin_router
)

app.include_router(health_router)
app.include_router(students_router)
app.include_router(attendance_router)
app.include_router(camera_router)
app.include_router(reports_router)
app.include_router(recognition_router)
app.include_router(auth_router)
app.include_router(admin_router)


@app.get("/")
def root():
    return {
        "success": True,
        "message": "Smart Attendance System API is running. Visit /docs for API documentation."
    }


@app.get("/health", tags=["Health & System"])
def health_check():
    return {
        "status": "healthy",
        "service": "Sakra-Lens API",
        "environment": settings.ENVIRONMENT
    }
