import base64
import logging
from datetime import datetime
from typing import Any, Dict, Optional
import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.config import settings
from backend.services.recognition_service import recognition_service
from backend.database.repository import repo
from backend.schemas.common import ApiResponse
from backend.security import require_admin

logger = logging.getLogger("smart_attendance.recognition_router")
router = APIRouter(tags=["Recognition & Training Diagnostics"])

class RecognitionTestRequest(BaseModel):
    image_base64: str = Field(..., max_length=12 * 1024 * 1024)

@router.get("/api/recognition/status", response_model=ApiResponse[dict])
def get_recognition_status():
    """
    Diagnostic status endpoint:
    Returns model state, registered student count, and tolerance threshold.
    """
    raw_status = recognition_service.get_status()
    return ApiResponse(
        success=True,
        message="Recognition engine status retrieved",
        data={
            "model_loaded": raw_status["model_loaded"],
            "model_version": "v2.1",
            "trained_students": raw_status["registered_students_count"],
            "trained_images": raw_status["registered_students_count"],
            "labels_loaded": raw_status["model_loaded"],
            "labels": raw_status["registered_student_ids"],
            "threshold": raw_status["tolerance"],
            "tolerance": raw_status["tolerance"]
        }
    )

@router.get("/api/training/status", response_model=ApiResponse[dict])
def get_training_status():
    """
    Training pipeline status endpoint:
    Returns model readiness, registered student count, and engine type.
    """
    count = len(recognition_service.known_encodings)
    return ApiResponse(
        success=True,
        message="Training pipeline status retrieved",
        data={
            "status": "ready" if count > 0 else "not_trained",
            "model_version": "v2.1",
            "students": count,
            "images": count,
            "last_trained_at": datetime.now().isoformat()
        }
    )

@router.post("/api/recognition/test", response_model=ApiResponse[dict])
def test_recognition_endpoint(payload: RecognitionTestRequest):
    """
    Standalone recognition verification endpoint:
    Allows uploading or submitting a single face frame to verify predicted student,
    student ID, distance, tolerance, and Recognized/Unknown status without marking attendance.
    """
    try:
        b64 = payload.image_base64
        if "," in b64:
            b64 = b64.split(",")[1]
        img_bytes = base64.b64decode(b64)
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Could not decode image")
        h, w = frame.shape[:2]
        if h > 4096 or w > 4096:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Image resolution exceeds maximum allowed limit (4096x4096)."
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image format: {str(e)}"
        )

    detections = recognition_service.process_frame(frame)
    if not detections:
        return ApiResponse(
            success=False,
            message="No face detected in test image",
            data={
                "predicted_student": None,
                "student_id": None,
                "distance": 999.0,
                "threshold": recognition_service.tolerance,
                "tolerance": recognition_service.tolerance,
                "recognized": False,
                "status": "no_face"
            }
        )

    # Primary detection
    primary = detections[0]

    return ApiResponse(
        success=True,
        message=f"Recognition result: {'RECOGNIZED' if primary['recognized'] else 'UNKNOWN'}",
        data={
            "predicted_student": primary["name"] if primary["recognized"] else None,
            "student_id": primary.get("student_id"),
            "distance": primary.get("distance"),
            "threshold": recognition_service.tolerance,
            "tolerance": recognition_service.tolerance,
            "recognized": primary["recognized"],
            "status": "recognized" if primary["recognized"] else "unknown"
        }
    )

@router.post("/api/training/retrain", response_model=ApiResponse[dict])
def trigger_retraining(admin: dict = Depends(require_admin)):
    """
    Trigger reload of all registered student encodings from Cloud MySQL.
    """
    count = recognition_service.load_registered_students()
    return ApiResponse(
        success=True,
        message=f"Biometric models refreshed. {count} active student profiles loaded.",
        data=recognition_service.get_status()
    )
