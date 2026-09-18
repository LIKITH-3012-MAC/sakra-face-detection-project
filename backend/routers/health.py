from datetime import datetime
from fastapi import APIRouter
import cv2
from backend.config import settings
from backend.database.connection import check_database_connection
from backend.schemas.common import ApiResponse

router = APIRouter(prefix="/api", tags=["Health & System"])

@router.get("/health", response_model=ApiResponse[dict])
def get_system_health():
    """Check API server, database connectivity, camera availability, and face model status."""
    db_connected, db_message = check_database_connection()

    # Camera configuration check (avoid hardware webcam polling)
    camera_available = settings.CAMERA_INDEX is not None

    # Face recognition & computer vision engine availability
    from backend.services.recognition_service import recognition_service, FACE_RECOGNITION_AVAILABLE
    model_trained = recognition_service.is_loaded
    opencv_available = hasattr(cv2, "imdecode")

    data = {
        "status": "healthy" if db_connected else "degraded",
        "timestamp": datetime.now().isoformat(),
        "database": {
            "connected": db_connected,
            "status": "operational" if db_connected else "offline"
        },
        "camera": {
            "index": settings.CAMERA_INDEX,
            "accessible": camera_available
        },
        "engine": {
            "face_recognition_available": FACE_RECOGNITION_AVAILABLE,
            "opencv_available": opencv_available,
            "database_available": db_connected
        },
        "model": {
            "trained": model_trained,
            "threshold": recognition_service.tolerance,
            "tolerance": recognition_service.tolerance
        }
    }

    message = "System operational" if db_connected else f"Database not connected: {db_message}"
    return ApiResponse(
        success=True,
        message=message,
        data=data
    )
