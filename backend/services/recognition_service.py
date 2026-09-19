import json
import logging
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np

logger = logging.getLogger("smart_attendance.recognition_service")

from backend.services.biometric_engine import face_recognition, FACE_RECOGNITION_AVAILABLE

from backend.config import settings
from backend.database.repository import repo

class RecognitionService:
    """
    128-Dimensional Face Encoding & Recognition Engine (Section 25).
    - Preserves the exact algorithm from reference main.py
    - Loads registered student encodings from Cloud MySQL
    - Generates 128-D face encodings using face_recognition (dlib ResNet)
    - Compares Euclidean distance against all registered encodings
    - Applies strict tolerance gating (TOLERANCE = 0.50)
    - Maps matching encoding -> student_id -> MySQL students table -> student name
    - Rejects unknown faces with zero guessing
    - Outputs formatted terminal logs (Section 20)
    """

    def __init__(self):
        self.tolerance: float = getattr(settings, "FACE_ENCODING_TOLERANCE", 0.50)
        self.frame_scale: float = 0.5  # Optimized frame scale (320x240 on 640x480)
        self.known_encodings: List[np.ndarray] = []
        self.known_student_ids: List[str] = []
        self.known_names: List[str] = []
        self.is_loaded: bool = False

        self.load_registered_students()

    def load_registered_students(self) -> int:
        """
        Load all registered student encodings and IDs from Cloud MySQL.
        """
        self.known_encodings.clear()
        self.known_student_ids.clear()
        self.known_names.clear()

        records = repo.get_all_face_encodings()
        for r in records:
            enc_raw = r.get("face_encoding")
            if not enc_raw:
                continue
            try:
                if isinstance(enc_raw, str):
                    enc_list = json.loads(enc_raw)
                else:
                    enc_list = enc_raw
                vec = np.array(enc_list, dtype=np.float64)
                if vec.shape == (128,):
                    self.known_encodings.append(vec)
                    self.known_student_ids.append(r["student_id"])
                    self.known_names.append(r["name"])
            except Exception as e:
                logger.warning(f"Error parsing encoding for student {r.get('student_id')}: {e}")

        self.is_loaded = len(self.known_encodings) > 0
        logger.info(f"Loaded {len(self.known_encodings)} registered face encodings from Cloud MySQL.")
        return len(self.known_encodings)

    def generate_encoding(self, image_bgr: np.ndarray) -> Optional[np.ndarray]:
        """
        Detect face and generate 128-D encoding for a single image.
        Returns 128-D vector if exactly 1 face is found, else None.
        """
        if face_recognition is None:
            logger.error("face_recognition library is not installed.")
            return None

        rgb_image = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        locations = face_recognition.face_locations(rgb_image)
        if len(locations) != 1:
            logger.warning(f"Expected 1 face for reference encoding, found {len(locations)}")
            return None

        encodings = face_recognition.face_encodings(rgb_image, locations)
        if not encodings:
            return None
        return encodings[0]

    def process_frame(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Process a live video frame, detect all faces, and compare with known encodings.
        Matches the exact logic from main.py:
        1. Resize frame by FRAME_SCALE
        2. Convert BGR -> RGB
        3. Detect face locations
        4. Generate face encodings
        5. Calculate distances against all registered students
        6. Best match index & distance
        7. Check tolerance (<= 0.50)
        8. Resolve identity from MySQL
        """
        results: List[Dict[str, Any]] = []

        if frame is None or frame.size == 0:
            return results

        if face_recognition is None:
            logger.error("face_recognition library is not installed.")
            return results

        # Multi-tier face detection:
        # First try 0.5x scaled frame for high FPS responsiveness
        small_frame = cv2.resize(frame, (0, 0), fx=self.frame_scale, fy=self.frame_scale)
        rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
        face_locations = face_recognition.face_locations(rgb_small_frame)
        active_rgb = rgb_small_frame
        active_scale = self.frame_scale

        # If no face found at 0.5x, fallback to full resolution frame
        if len(face_locations) == 0:
            rgb_full = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            face_locations = face_recognition.face_locations(rgb_full)
            if len(face_locations) > 0:
                active_rgb = rgb_full
                active_scale = 1.0

        num_faces = len(face_locations)
        if num_faces > 0 and settings.FACE_RECOGNITION_DEBUG:
            print(f"\n[FACE DETECTED]\nFaces: {num_faces} (scale={active_scale})")

        # Generate encodings for detected faces
        face_encodings = face_recognition.face_encodings(active_rgb, face_locations)

        for face_encoding, face_location in zip(face_encodings, face_locations):
            # Scale coordinates back to original frame size
            top, right, bottom, left = face_location
            top = int(top / active_scale)
            right = int(right / active_scale)
            bottom = int(bottom / active_scale)
            left = int(left / active_scale)
            bbox = (left, top, right - left, bottom - top)

            if len(self.known_encodings) == 0:
                results.append({
                    "bbox": bbox,
                    "student_id": None,
                    "name": "UNKNOWN",
                    "recognized": False,
                    "distance": 999.0,
                    "tolerance": self.tolerance,
                    "confidence": 0.0
                })
                continue

            # Calculate distance from every registered student
            face_distances = face_recognition.face_distance(self.known_encodings, face_encoding)

            # Find closest registered student
            best_match_index = int(np.argmin(face_distances))
            best_distance = float(face_distances[best_match_index])

            # Check distance against tolerance
            if best_distance <= self.tolerance:
                student_id = self.known_student_ids[best_match_index]
                student = repo.get_student_by_id(student_id)
                name = student["name"] if student else self.known_names[best_match_index]
                confidence = round((1.0 - best_distance) * 100.0, 1)

                print(
                    f"\n[RECOGNITION]\n"
                    f"Student ID : {student_id}\n"
                    f"Name       : {name}\n"
                    f"Distance   : {best_distance:.2f}\n"
                    f"Tolerance  : {self.tolerance:.2f}\n"
                )

                results.append({
                    "bbox": bbox,
                    "student_id": student_id,
                    "name": name,
                    "recognized": True,
                    "distance": round(best_distance, 3),
                    "tolerance": self.tolerance,
                    "confidence": confidence,
                    "roll_number": student.get("roll_number") if student else None,
                    "department": student.get("department") if student else None
                })
            else:
                print(
                    f"\n[RECOGNITION]\n"
                    f"Best distance: {best_distance:.2f}\n"
                    f"Tolerance: {self.tolerance:.2f}\n\n"
                    f"Result: UNKNOWN\n\n"
                    f"[ATTENDANCE]\n"
                    f"No attendance recorded.\n"
                )

                results.append({
                    "bbox": bbox,
                    "student_id": None,
                    "name": "UNKNOWN",
                    "recognized": False,
                    "distance": round(best_distance, 3),
                    "tolerance": self.tolerance,
                    "confidence": 0.0
                })

        return results

    def get_status(self) -> Dict[str, Any]:
        """Diagnostic model and registered student status (Section 24)."""
        return {
            "engine": "face_recognition (128-D Encodings)",
            "engine_available": FACE_RECOGNITION_AVAILABLE,
            "model_loaded": self.is_loaded,
            "registered_students_count": len(self.known_encodings),
            "registered_student_ids": self.known_student_ids,
            "tolerance": self.tolerance
        }

recognition_service = RecognitionService()
