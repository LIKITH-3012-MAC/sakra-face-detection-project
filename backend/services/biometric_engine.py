"""
Sakra-Lens Centralized Biometric Engine.

Enforces the Single-Check Architecture:
- Imports face_recognition exactly ONCE at module load during application startup.
- Stores the module reference and single availability boolean (FACE_RECOGNITION_AVAILABLE).
- Logs the actual import result exactly ONCE.
- Reused universally across live attendance, frame analysis, student enrollment,
  and diagnostic health endpoints with ZERO repeated imports in request or frame loops.
"""

import logging

logger = logging.getLogger("smart_attendance.biometric_engine")

FACE_RECOGNITION_AVAILABLE: bool = False
face_recognition = None

try:
    import face_recognition as _fr
    face_recognition = _fr
    FACE_RECOGNITION_AVAILABLE = True
    logger.info("Biometric Engine: face_recognition (128-D dlib ResNet) loaded and verified successfully.")
except Exception as e:
    face_recognition = None
    FACE_RECOGNITION_AVAILABLE = False
    logger.warning("Biometric Engine: face_recognition library unavailable on this system (%s).", e)
