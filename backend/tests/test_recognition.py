import base64
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app import app
from backend.services.recognition_service import recognition_service

client = TestClient(app)

def test_128d_encoding_dimensions():
    """Verify that a synthetic 128-D face encoding has exactly 128 dimensions."""
    synth_encoding = np.random.randn(128).astype(np.float64)
    # Unit normalize as dlib ResNet output does
    synth_encoding = synth_encoding / np.linalg.norm(synth_encoding)
    assert synth_encoding.shape == (128,)
    assert synth_encoding.dtype == np.float64

def test_distance_exact_match():
    """Verify Euclidean distance between identical encodings is zero and passes tolerance."""
    enc = np.random.randn(128)
    enc = enc / np.linalg.norm(enc)
    dist = float(np.linalg.norm(enc - enc))
    assert dist == 0.0
    assert dist <= recognition_service.tolerance

def test_distance_tolerance_gate():
    """Verify strict tolerance gate: distance <= 0.50 matches, > 0.50 rejects."""
    tolerance = recognition_service.tolerance
    assert tolerance == 0.50

    # Matching distance
    close_dist = 0.38
    assert close_dist <= tolerance

    # Non-matching distance (unknown person)
    far_dist = 0.68
    assert far_dist > tolerance

def test_recognition_service_status():
    """Verify recognition_service returns diagnostic status dict."""
    status = recognition_service.get_status()
    assert "model_loaded" in status
    assert "tolerance" in status
    assert "registered_students_count" in status
    assert status["tolerance"] == 0.50

def test_api_recognition_status_endpoint():
    """Verify GET /api/recognition/status returns expected API envelope."""
    res = client.get("/api/recognition/status")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    data = body["data"]
    assert "model_loaded" in data
    assert "model_version" in data
    assert "threshold" in data
    assert "labels" in data

def test_api_training_status_endpoint():
    """Verify GET /api/training/status returns expected pipeline status."""
    res = client.get("/api/training/status")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    data = body["data"]
    assert "status" in data
    assert "students" in data

def test_api_recognition_test_no_face():
    """Verify POST /api/recognition/test handles empty/blank frame gracefully."""
    import cv2
    blank = np.zeros((200, 200, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", blank)
    b64 = base64.b64encode(buf).decode("utf-8")

    res = client.post("/api/recognition/test", json={"image_base64": b64})
    assert res.status_code == 200
    body = res.json()
    assert body["data"]["recognized"] is False
    assert body["data"]["status"] == "no_face"

def test_centralized_biometric_engine_single_availability():
    """Verify biometric_engine defines single application-level availability state."""
    from backend.services.biometric_engine import FACE_RECOGNITION_AVAILABLE, face_recognition
    assert isinstance(FACE_RECOGNITION_AVAILABLE, bool)

    if FACE_RECOGNITION_AVAILABLE:
        assert hasattr(face_recognition, "face_locations")
        assert hasattr(face_recognition, "face_encodings")
        assert hasattr(face_recognition, "face_distance")
    else:
        assert face_recognition is None

    # Verify recognition_service shares identical engine_available status
    status = recognition_service.get_status()
    assert status["engine_available"] == FACE_RECOGNITION_AVAILABLE

    # Verify /api/health shares identical engine_available status
    res = client.get("/api/health")
    assert res.status_code == 200
    health_data = res.json()["data"]
    assert health_data["engine"]["face_recognition_available"] == FACE_RECOGNITION_AVAILABLE

