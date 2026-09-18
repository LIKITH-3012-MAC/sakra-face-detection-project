from backend.routers.health import router as health_router
from backend.routers.students import router as students_router
from backend.routers.attendance import router as attendance_router
from backend.routers.camera import router as camera_router
from backend.routers.reports import router as reports_router
from backend.routers.recognition import router as recognition_router
from backend.routers.auth import router as auth_router
from backend.routers.admin import router as admin_router

__all__ = [
    "health_router",
    "students_router",
    "attendance_router",
    "camera_router",
    "reports_router",
    "recognition_router",
    "auth_router",
    "admin_router",
]

