import base64
import json
import logging
from typing import List, Optional
import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

logger = logging.getLogger("smart_attendance.students_api")
from backend.services.biometric_engine import face_recognition, FACE_RECOGNITION_AVAILABLE

from backend.config import settings
from backend.services.camera_service import camera_manager
from backend.services.recognition_service import recognition_service
from backend.database.connection import execute_query
from backend.database.repository import repo
from backend.schemas.common import ApiResponse
from backend.schemas.student import (
    StudentCreate,
    StudentUpdate,
    StudentResponse,
    StudentDetailResponse,
    StudentProfileStats
)
from backend.security import require_admin, require_student_or_admin
router = APIRouter(prefix="/api/students", tags=["Students & Biometrics"])

class FrameCapturePayload(BaseModel):
    image_base64: Optional[str] = Field(None, max_length=12 * 1024 * 1024)

@router.get("", response_model=ApiResponse[List[StudentResponse]])
def get_students(
    search: Optional[str] = Query(None, max_length=100, description="Search by Name, Roll Number, or Student ID"),
    department: Optional[str] = Query(None, max_length=100, description="Filter by Department"),
    section: Optional[str] = Query(None, max_length=50, description="Filter by Section"),
    limit: int = Query(100, ge=1, le=200, description="Maximum results"),
    admin: dict = Depends(require_admin)
):
    """Retrieve students directory with optional filters. Restricted to administrators."""
    query = """
        SELECT id, student_id, name, roll_number, department, year, section, email,
               face_dataset_count, is_trained, created_at, updated_at
        FROM students
        WHERE 1=1
    """
    params = []
    if search:
        query += " AND (name LIKE %s OR roll_number LIKE %s OR student_id LIKE %s)"
        pattern = f"%{search}%"
        params.extend([pattern, pattern, pattern])

    if department:
        query += " AND department = %s"
        params.append(department)

    if section:
        query += " AND section = %s"
        params.append(section)

    query += " ORDER BY created_at DESC LIMIT %s"
    params.append(limit)
    rows = execute_query(query, tuple(params), fetchall=True) or []
    return ApiResponse(
        success=True,
        message=f"Retrieved {len(rows)} students",
        data=rows
    )

@router.get("/{student_id}", response_model=ApiResponse[StudentDetailResponse])
def get_student_by_id(student_id: str, caller: dict = Depends(require_student_or_admin)):
    """Retrieve student profile with attendance percentage and stats. Restricted to student owner or admin."""
    student = execute_query(
        "SELECT id, student_id, name, roll_number, department, year, section, email, face_dataset_count, is_trained, created_at, updated_at FROM students WHERE student_id = %s",
        (student_id,),
        fetchone=True
    )
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student ID '{student_id}' not found."
        )

    # Class stats
    total_dates_row = execute_query("SELECT COUNT(DISTINCT attendance_date) as total_classes FROM attendance", fetchone=True)
    total_classes = total_dates_row["total_classes"] if total_dates_row and total_dates_row["total_classes"] else 0

    stats_row = execute_query("""
        SELECT
            SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_count,
            SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as late_count,
            SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent_count
        FROM attendance
        WHERE student_id = %s
    """, (student_id,), fetchone=True) or {}

    present = int(stats_row.get("present_count") or 0)
    late = int(stats_row.get("late_count") or 0)
    effective = present + late
    calc_absent = max(0, total_classes - effective)
    pct = round((effective / total_classes * 100.0), 1) if total_classes > 0 else (100.0 if effective > 0 else 0.0)

    student["stats"] = StudentProfileStats(
        total_classes=total_classes,
        present_count=present,
        late_count=late,
        absent_count=calc_absent,
        attendance_percentage=pct
    )
    return ApiResponse(success=True, message="Student profile loaded", data=student)

@router.post("", response_model=ApiResponse[StudentResponse], status_code=status.HTTP_201_CREATED)
def create_student(payload: StudentCreate, admin: dict = Depends(require_admin)):
    """Register student with duplicate validation. Restricted to administrators."""
    # Check duplicate student_id
    if execute_query("SELECT id FROM students WHERE student_id = %s", (payload.student_id,), fetchone=True):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Student ID '{payload.student_id}' already exists."
        )

    # Check duplicate roll_number
    if execute_query("SELECT id FROM students WHERE roll_number = %s", (payload.roll_number,), fetchone=True):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Roll Number '{payload.roll_number}' already exists."
        )

    # Insert into MySQL
    insert_sql = """
        INSERT INTO students (student_id, name, roll_number, department, year, academic_year, section, email, face_dataset_count, is_trained)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 0, FALSE)
    """
    new_id = execute_query(
        insert_sql,
        (payload.student_id, payload.name, payload.roll_number, payload.department, payload.year, payload.year, payload.section, payload.email),
        commit=True
    )

    created = execute_query("SELECT * FROM students WHERE id = %s", (new_id,), fetchone=True)
    return ApiResponse(
        success=True,
        message="Student registered successfully. Ready for face photo enrollment.",
        data=created
    )

@router.put("/{student_id}", response_model=ApiResponse[StudentResponse])
def update_student(student_id: str, payload: StudentUpdate, admin: dict = Depends(require_admin)):
    """Update student fields. Restricted to administrators."""
    student = execute_query("SELECT * FROM students WHERE student_id = %s", (student_id,), fetchone=True)
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    updates = []
    params = []
    if payload.name:
        updates.append("name = %s")
        params.append(payload.name)
    if payload.roll_number:
        updates.append("roll_number = %s")
        params.append(payload.roll_number)
    if payload.department:
        updates.append("department = %s")
        params.append(payload.department)
    if payload.year:
        updates.append("year = %s")
        params.append(payload.year)
    if payload.section:
        updates.append("section = %s")
        params.append(payload.section)
    if payload.email is not None:
        updates.append("email = %s")
        params.append(payload.email)

    if updates:
        params.append(student_id)
        execute_query(f"UPDATE students SET {', '.join(updates)} WHERE student_id = %s", tuple(params), commit=True)

    updated = execute_query("SELECT * FROM students WHERE student_id = %s", (student_id,), fetchone=True)
    return ApiResponse(success=True, message="Student updated successfully", data=updated)

@router.delete("/{student_id}", response_model=ApiResponse[dict])
def delete_student(student_id: str, admin: dict = Depends(require_admin)):
    """Delete student, cascade-delete attendance, remove face data from Cloud MySQL, and reload model. Restricted to administrators."""
    student = execute_query("SELECT * FROM students WHERE student_id = %s", (student_id,), fetchone=True)
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    # 1. Delete from MySQL students table (FK cascades to attendance)
    execute_query("DELETE FROM students WHERE student_id = %s", (student_id,), commit=True)

    # 2. Delete face data
    repo.delete_face_data(student_id)

    # 3. Reload in-memory recognition service
    recognition_service.load_registered_students()

    return ApiResponse(
        success=True,
        message=f"Student {student['name']} ({student_id}) and biometric data removed.",
        data={"student_id": student_id}
    )


def enroll_single_face_image(student_id: str, frame: np.ndarray):
    """
    Enrolls exactly ONE high-quality reference face image (Section 5):
    1. Validates face quality (1 face rule, size, brightness, blur)
    2. Computes 128-D face encoding via dlib/face_recognition
    3. Persists face image LONGBLOB and JSON encoding to Cloud MySQL face_data table
    4. Updates students table (is_trained = TRUE, face_dataset_count = 1)
    5. Immediately hot-reloads encodings into in-memory recognition service
    """
    if frame is None or frame.size == 0:
        return False, "Invalid image data received.", None

    if face_recognition is None:
        logger.error("Biometric enrollment rejected: face_recognition engine is not loaded on server.")
        return False, "Biometric verification service temporarily unavailable. Please try again shortly.", None

    # Quality Checks
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    face_locations = face_recognition.face_locations(rgb_frame)

    if len(face_locations) == 0:
        return False, "No face detected. Please look directly at the camera.", None
    if len(face_locations) > 1:
        return False, "Multiple faces detected! Only one face should be visible.", None

    top, right, bottom, left = face_locations[0]
    face_w = right - left
    face_h = bottom - top
    bbox = [left, top, face_w, face_h]

    if face_w < 70 or face_h < 70:
        return False, "Face too small. Please move closer to the camera.", {"bbox": bbox}

    # Grayscale for blur & brightness checks
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    face_crop_gray = gray[max(0, top):min(frame.shape[0], bottom), max(0, left):min(frame.shape[1], right)]
    if face_crop_gray.size > 0:
        brightness = float(np.mean(face_crop_gray))
        blur_score = float(cv2.Laplacian(face_crop_gray, cv2.CV_64F).var())
    else:
        brightness = float(np.mean(gray))
        blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    if brightness < 30.0:
        return False, "Lighting is too dark. Please increase room lighting.", {"bbox": bbox, "brightness": brightness}
    if brightness > 235.0:
        return False, "Lighting is too bright. Please avoid direct glare.", {"bbox": bbox, "brightness": brightness}
    if blur_score < 10.0:
        return False, "Image is blurry. Please hold steady.", {"bbox": bbox, "blur": blur_score}

    # Generate 128-D encoding
    encodings = face_recognition.face_encodings(rgb_frame, face_locations)
    if not encodings:
        return False, "Could not extract facial features. Try adjusting camera angle.", {"bbox": bbox}

    encoding_128d = encodings[0]
    encoding_json = json.dumps(encoding_128d.tolist())

    # Encode image to JPEG bytes
    ret, jpeg_buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    if not ret:
        return False, "Could not compress frame to JPEG.", None
    jpeg_bytes = jpeg_buf.tobytes()

    # Save to Cloud MySQL face_data & update students table
    saved = repo.save_face_data(
        student_id=student_id,
        image_filename=f"{student_id}.jpg",
        image_bytes=jpeg_bytes,
        face_encoding_json=encoding_json
    )
    if not saved:
        return False, "Failed to persist face data.", None

    # Hot reload encodings in-memory
    loaded_count = recognition_service.load_registered_students()

    logger.info(f"Student {student_id} enrolled. Encodings in memory: {loaded_count}")

    return True, "Face captured and biometric profile saved successfully!", {
        "student_id": student_id,
        "encoding_length": 128,
        "total_registered": loaded_count,
        "bbox": bbox,
        "brightness": round(brightness, 1),
        "blur_score": round(blur_score, 1)
    }


@router.post("/{student_id}/register-face")
@router.post("/{student_id}/capture")
@router.post("/{student_id}/capture-frame")
def capture_and_register_face(
    student_id: str,
    payload: FrameCapturePayload,
    caller: dict = Depends(require_student_or_admin)
):
    """
    Capture exactly ONE high-quality reference face image:
    Generates 128-D face encoding, persists to Cloud MySQL, and hot-reloads recognition engine.
    """
    target_id = student_id.strip()
    if target_id.lower() in ("me", "self", "@me") or target_id in ("undefined", "null", "N/A"):
        target_id = (caller.get("student_id") or caller.get("roll_number") or caller.get("email") or "").strip()

    student = repo.get_student_by_id(target_id)
    if not student and caller.get("email"):
        student = execute_query(
            "SELECT id, student_id, name, roll_number FROM students WHERE email = %s LIMIT 1",
            (caller["email"].strip().lower(),),
            fetchone=True
        )

    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Student '{student_id}' does not exist.")

    canonical_student_id = student["student_id"]

    frame = None
    if payload.image_base64:
        try:
            b64_str = payload.image_base64
            if "," in b64_str:
                b64_str = b64_str.split(",")[1]
            img_bytes = base64.b64decode(b64_str)
            nparr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame is not None:
                h, w = frame.shape[:2]
                if h > 4096 or w > 4096:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Image resolution exceeds maximum allowed limit (4096x4096)."
                    )
        except HTTPException:
            raise
        except Exception as e:
            return {
                "success": False,
                "message": f"Frame decode error: {str(e)}",
                "data": {"captured": False, "reason": "invalid_frame"}
            }
    else:
        ret, frame = camera_manager.read_frame()
        if not ret or frame is None:
            return {
                "success": False,
                "message": "Camera unavailable on server. Switch to laptop webcam.",
                "data": {"captured": False, "reason": "camera_unavailable"}
            }

    success, msg, data = enroll_single_face_image(canonical_student_id, frame)
    if not success:
        return {
            "success": False,
            "message": msg,
            "data": {
                "captured": False,
                "reason": msg,
                **(data or {})
            }
        }

    return {
        "success": True,
        "message": msg,
        "data": {
            "captured": True,
            "image_number": 1,
            "total_images": 1,
            "target_images": 1,
            "minimum_required": 1,
            "ready_for_training": True,
            "is_trained": True,
            "cloud_stored": True,
            "student_name": student["name"],
            **(data or {})
        }
    }


@router.get("/{student_id}/biometric-status")
@router.get("/{student_id}/dataset-status")
def get_student_biometric_status(
    student_id: str,
    caller: dict = Depends(require_student_or_admin)
):
    """Return biometric enrollment status and quality metrics from Cloud MySQL."""
    student = execute_query(
        "SELECT id, name, is_trained, face_dataset_count FROM students WHERE student_id = %s",
        (student_id,),
        fetchone=True
    )
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    face_record = repo.get_student_face_data(student_id)
    has_face = bool(face_record and face_record.get("face_encoding"))

    return ApiResponse(
        success=True,
        message=f"Student face status: {'Registered' if has_face else 'Not Registered'}",
        data={
            "student_id": student_id,
            "student_name": student["name"],
            "has_face_registered": has_face,
            "is_trained": has_face,
            "biometric_enrolled": has_face,
            "valid_images": 1 if has_face else 0,
            "total_images": 1 if has_face else 0,
            "target_images": 1,
            "minimum_required": 1,
            "ready_for_training": has_face,
            "model_version": 1,
            "engine": "128-D Euclidean Face Embedding Engine"
        }
    )


@router.get("/{student_id}/photo")
def get_student_photo(
    student_id: str,
    caller: dict = Depends(require_student_or_admin)
):
    """Serve enrolled reference face photo from Cloud MySQL."""
    face_record = repo.get_student_face_data(student_id)
    if not face_record or not face_record.get("image_data"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Face photo not found.")
    return Response(content=face_record["image_data"], media_type="image/jpeg")


@router.post("/{student_id}/reload-biometrics")
@router.post("/reload-biometrics")
@router.post("/{student_id}/train")
@router.post("/retrain-global")
def reload_encodings_endpoint(
    student_id: Optional[str] = None,
    admin: dict = Depends(require_admin)
):
    """
    Reload registered 128-D student face encodings from Cloud MySQL into recognition engine performance cache.
    (No neural network retraining is performed; encodings are loaded directly from MySQL).
    """
    count = recognition_service.load_registered_students()
    return ApiResponse(
        success=True,
        message=f"Loaded {count} student encodings from Cloud MySQL into recognition engine.",
        data={"registered_count": count}
    )
