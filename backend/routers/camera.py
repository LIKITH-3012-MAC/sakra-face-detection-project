import base64
import json
import logging
import time
from typing import Dict, List, Optional
import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.services.biometric_engine import face_recognition, FACE_RECOGNITION_AVAILABLE

from backend.config import settings
from backend.services.recognition_service import recognition_service
from backend.services.attendance_service import attendance_service
from backend.utils.network import get_client_ip
from backend.database.repository import repo
from backend.schemas.common import ApiResponse
from backend.security import require_admin, get_current_user

logger = logging.getLogger("smart_attendance.camera")
router = APIRouter(prefix="/api/camera", tags=["Camera & Live Recognition"])

# Global state for tracking recent live detection events
recent_events: List[dict] = []
active_stream_state = {
    "is_streaming": False,
    "last_seen_students": {},
    "unknown_faces_count": 0
}

class FrameRecognitionRequest(BaseModel):
    image_base64: str = Field(..., max_length=12 * 1024 * 1024)
    auto_mark: bool = True
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    location_accuracy: Optional[float] = Field(None, ge=0.0, le=10000.0)

class PreviewValidationRequest(BaseModel):
    image_base64: str = Field(..., max_length=12 * 1024 * 1024)

def generate_live_stream():
    """
    Generator that captures frames from OpenCV webcam,
    runs 128-D face recognition against Cloud MySQL encodings,
    annotates bounding boxes (Green = Recognized with distance, Red = UNKNOWN),
    marks attendance when tolerance matches, and yields MJPEG frames.
    """
    cap = cv2.VideoCapture(settings.CAMERA_INDEX)
    if not cap.isOpened():
        logger.warning(f"Cannot open webcam at index {settings.CAMERA_INDEX}")
        while True:
            placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(placeholder, "Backend Server Camera Inaccessible", (50, 220),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 165, 255), 2)
            cv2.putText(placeholder, "Switch to 'Laptop Webcam' mode on the top-right", (30, 265),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 1)
            _, jpeg = cv2.imencode(".jpg", placeholder)
            frame_bytes = jpeg.tobytes()
            yield (b"--frame\r\n"
                   b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n")
            time.sleep(1.0)

    active_stream_state["is_streaming"] = True
    try:
        while True:
            success, frame = cap.read()
            if not success or frame is None:
                time.sleep(0.05)
                continue

            # Run 128-D recognition pipeline
            detections = recognition_service.process_frame(frame)

            for det in detections:
                left, top, w, h = det["bbox"]
                name = det["name"]
                student_id = det.get("student_id")
                recognized = det.get("recognized", False)
                distance = det.get("distance", 999.0)

                if recognized and student_id:
                    box_color = (0, 200, 0)  # Green for recognized
                    label_text = f"{name} ({distance:.2f})"

                    # Mark attendance via service (debounced + temporal confirmation + MySQL insert)
                    if attendance_service.check_temporal_confirmation(student_id):
                        ok, msg, rec = attendance_service.mark_attendance(
                            student_id=student_id,
                            face_distance=distance,
                            mode="automatic"
                        )
                        if ok and rec:
                            recent_events.insert(0, {
                                "student_id": student_id,
                                "name": name,
                                "time": str(rec.get("attendance_time", "")),
                                "status": rec.get("status", "Present"),
                                "type": "marked"
                            })
                            if len(recent_events) > 50:
                                recent_events.pop()
                else:
                    box_color = (0, 0, 255)  # Red for unknown
                    label_text = f"UNKNOWN ({distance:.2f})"
                    active_stream_state["unknown_faces_count"] += 1

                # Draw bounding box
                cv2.rectangle(frame, (left, top), (left + w, top + h), box_color, 2)
                # Draw label header
                cv2.rectangle(frame, (left, max(0, top - 25)), (left + w, max(0, top)), box_color, cv2.FILLED)
                cv2.putText(frame, label_text, (left + 5, max(15, top - 7)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

            # Encode as JPEG
            ret, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if not ret:
                continue

            frame_bytes = buffer.tobytes()
            yield (b"--frame\r\n"
                   b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n")

    except Exception as e:
        logger.error(f"Stream generation loop error: {e}")
    finally:
        active_stream_state["is_streaming"] = False
        cap.release()

@router.get("/stream")
def video_feed(admin: dict = Depends(require_admin)):
    """
    MJPEG live video stream with annotated face detection & 128-D recognition.
    Directly consumable by <img src="/api/camera/stream" /> in React frontend.
    """
    return StreamingResponse(
        generate_live_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@router.get("/live-status", response_model=ApiResponse[dict])
def get_live_status(admin: dict = Depends(require_admin)):
    """Get live attendance recognition events and unknown face count."""
    return ApiResponse(
        success=True,
        message="Live status retrieved",
        data={
            "recent_events": recent_events[:15],
            "unknown_face_count": active_stream_state["unknown_faces_count"],
            "is_streaming": active_stream_state["is_streaming"],
            "camera_index": settings.CAMERA_INDEX
        }
    )

@router.post("/recognize-frame", response_model=ApiResponse[dict])
def recognize_frame_snapshot(payload: FrameRecognitionRequest, request: Request, user: dict = Depends(get_current_user)):
    """
    Process an uploaded frame (base64 image from browser camera) for 128-D face recognition.
    Answers dual-mode requirement: allows frontend camera to recognize and mark attendance,
    with client IP, geolocation (lat/long), and Resend email notification.
    """
    client_ip = get_client_ip(request)

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

    # Process frame with 128-D Recognition Service
    detections = recognition_service.process_frame(frame)
    if not detections:
        return ApiResponse(
            success=True,
            message="No face detected in camera snapshot.",
            data={"faces_found": 0, "detections": []}
        )

    results = []
    for det in detections:
        student_id = det.get("student_id")
        student_name = det.get("name")
        recognized = det.get("recognized", False)
        distance = det.get("distance", 999.0)

        mark_result = None
        roll_number = None
        department = None
        section = None
        year = None
        today_count = 0
        total_attendance_count = 0
        last_attendance_time = "Not marked"
        already_marked_today = False

        if recognized and student_id:
            # Query actual student profile from Cloud MySQL
            student_info = repo.get_student_by_id(student_id)
            if student_info:
                student_name = student_info.get("name") or student_name or student_id
                roll_number = student_info.get("roll_number")
                department = student_info.get("department")
                section = student_info.get("section")
                year = student_info.get("year") or student_info.get("academic_year")
                student_id = student_info.get("student_id") or student_id

            # Retrieve real-time attendance stats from Cloud MySQL
            stats = repo.get_student_attendance_stats(student_id)
            today_count = stats.get("today_count", 0)
            total_attendance_count = stats.get("total_attendance_count", 0)
            last_attendance_time = stats.get("last_attendance_time", "Not marked")
            already_marked_today = stats.get("already_marked_today", False)

            # Only auto-mark attendance if auto_mark flag is explicitly True (Automatic Mode)
            if payload.auto_mark and attendance_service.check_temporal_confirmation(student_id):
                ok, msg, rec = attendance_service.mark_attendance(
                    student_id=student_id,
                    face_distance=distance,
                    ip_address=client_ip,
                    latitude=payload.latitude,
                    longitude=payload.longitude,
                    location_accuracy=payload.location_accuracy,
                    mode="automatic"
                )
                mark_result = {"success": ok, "message": msg, "record": rec}
                if ok and rec:
                    today_count = rec.get("today_count", today_count)
                    total_attendance_count = rec.get("total_attendance_count", total_attendance_count)
                    last_attendance_time = rec.get("last_attendance_time", last_attendance_time)
                    already_marked_today = True

                    recent_events.insert(0, {
                        "student_id": student_id,
                        "name": student_name,
                        "roll_number": roll_number,
                        "department": department,
                        "section": section,
                        "time": str(rec.get("attendance_time", "")),
                        "status": rec.get("status", "Present"),
                        "email_notification": rec.get("email_notification", "pending"),
                        "email_status": rec.get("email_status", "pending"),
                        "email_message_id": rec.get("email_message_id"),
                        "ip_address": client_ip,
                        "latitude": payload.latitude,
                        "longitude": payload.longitude,
                        "location_accuracy": payload.location_accuracy,
                        "type": "marked"
                    })
                    if len(recent_events) > 50:
                        recent_events.pop()
        else:
            active_stream_state["unknown_faces_count"] += 1

        results.append({
            "bbox": det["bbox"],
            "student_id": student_id,
            "name": student_name,
            "roll_number": roll_number,
            "department": department,
            "section": section,
            "year": year,
            "recognized": recognized,
            "distance": distance,
            "tolerance": det.get("tolerance", recognition_service.tolerance),
            "confidence": det.get("confidence", 0.0),
            "confidence_score": det.get("confidence", 0.0),
            "ip_address": client_ip,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "location_accuracy": payload.location_accuracy,
            "today_count": today_count,
            "total_attendance_count": total_attendance_count,
            "last_attendance_time": last_attendance_time,
            "already_marked_today": already_marked_today,
            "attendance": mark_result
        })

    return ApiResponse(
        success=True,
        message=f"Processed {len(detections)} face(s)",
        data={
            "faces_found": len(detections),
            "detections": results,
            "unknown_face_count": active_stream_state["unknown_faces_count"]
        }
    )


@router.post("/validate-preview", response_model=ApiResponse[dict])
def validate_preview_frame(payload: PreviewValidationRequest):
    """
    Real-time face detection & quality validation for registration preview.
    Does NOT save images or mark attendance.
    Returns validation status, reason, face bounding box, and metrics.
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid image: {e}")

    # Detect faces
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    if face_recognition is not None:
        locations = face_recognition.face_locations(rgb)
    else:
        locations = []

    if len(locations) == 0:
        return ApiResponse(
            success=False,
            message="No face detected. Please look directly at the camera.",
            data={"is_valid": False, "reason": "no_face", "bbox": None, "metrics": {}}
        )

    if len(locations) > 1:
        return ApiResponse(
            success=False,
            message="Multiple faces detected! Only one face should be visible.",
            data={"is_valid": False, "reason": "multiple_faces", "bbox": None, "metrics": {}}
        )

    top, right, bottom, left = locations[0]
    face_w = right - left
    face_h = bottom - top
    bbox = [left, top, face_w, face_h]

    if face_w < 70 or face_h < 70:
        return ApiResponse(
            success=False,
            message="Move closer to camera.",
            data={"is_valid": False, "reason": "face_too_small", "bbox": bbox, "metrics": {}}
        )

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    face_gray = gray[max(0, top):min(frame.shape[0], bottom), max(0, left):min(frame.shape[1], right)]
    if face_gray.size > 0:
        brightness = float(np.mean(face_gray))
        blur_score = float(cv2.Laplacian(face_gray, cv2.CV_64F).var())
    else:
        brightness = float(np.mean(gray))
        blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    metrics = {
        "brightness": round(brightness, 1),
        "blur_score": round(blur_score, 1),
        "face_width": face_w,
        "face_height": face_h
    }

    if brightness < 30.0:
        return ApiResponse(
            success=False,
            message="Lighting is too dark.",
            data={"is_valid": False, "reason": "too_dark", "bbox": bbox, "metrics": metrics}
        )
    if brightness > 235.0:
        return ApiResponse(
            success=False,
            message="Lighting is too bright.",
            data={"is_valid": False, "reason": "too_bright", "bbox": bbox, "metrics": metrics}
        )
    if blur_score < 10.0:
        return ApiResponse(
            success=False,
            message="Hold still (motion blur detected).",
            data={"is_valid": False, "reason": "too_blurry", "bbox": bbox, "metrics": metrics}
        )

    return ApiResponse(
        success=True,
        message="Face detected & quality verified ✓",
        data={
            "is_valid": True,
            "reason": "valid",
            "bbox": bbox,
            "metrics": metrics
        }
    )


@router.get("/status", response_model=ApiResponse[dict])
def get_recognition_model_status(admin: dict = Depends(require_admin)):
    """
    Diagnostic endpoint (Section 24):
    Returns model loaded status, registered student count, and tolerance gate.
    """
    return ApiResponse(
        success=True,
        message="Recognition model status retrieved",
        data=recognition_service.get_status()
    )


@router.post("/retrain", response_model=ApiResponse[dict])
def retrain_model_endpoint(admin: dict = Depends(require_admin)):
    """
    Hot reload registered encodings from database into recognition service.
    """
    count = recognition_service.load_registered_students()
    return ApiResponse(
        success=True,
        message=f"Reloaded {count} student encodings.",
        data=recognition_service.get_status()
    )

