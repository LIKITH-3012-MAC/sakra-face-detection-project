import base64
import uuid
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app import app
from backend.config import settings
from backend.database.connection import execute_query
from backend.services.auth_service import auth_service
from backend.security.rate_limiter import limiter

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_test_students():
    """Seed Student Alpha and Student Beta for IDOR and RBAC testing."""
    execute_query("""
        INSERT INTO students (student_id, name, roll_number, department, year, section, email)
        VALUES ('SEC-STD-001', 'Student Alpha', 'ROLL-ALPHA-01', 'CSE', '4th Year', 'A', 'alpha@student.test')
        ON DUPLICATE KEY UPDATE name=VALUES(name)
    """, commit=True)

    execute_query("""
        INSERT INTO students (student_id, name, roll_number, department, year, section, email)
        VALUES ('SEC-STD-002', 'Student Beta', 'ROLL-BETA-02', 'ECE', '4th Year', 'B', 'beta@student.test')
        ON DUPLICATE KEY UPDATE name=VALUES(name)
    """, commit=True)

@pytest.fixture(autouse=True)
def reset_rate_limits():
    """Reset sliding window rate limiter before each test."""
    limiter.clear()


def get_admin_token() -> str:
    return auth_service.create_token({
        "id": 1,
        "email": "admin@sakra-lens",
        "full_name": "System Administrator",
        "role": "admin"
    })


def get_student_a_token() -> str:
    return auth_service.create_token({
        "id": 101,
        "email": "alpha@student.test",
        "full_name": "Student Alpha",
        "role": "user",
        "student_id": "SEC-STD-001",
        "roll_number": "ROLL-ALPHA-01"
    })


def get_student_b_token() -> str:
    return auth_service.create_token({
        "id": 102,
        "email": "beta@student.test",
        "full_name": "Student Beta",
        "role": "user",
        "student_id": "SEC-STD-002",
        "roll_number": "ROLL-BETA-02"
    })


# ============================================================================
# VECTORS 1, 2, 3: ADMIN OVERVIEW RBAC
# ============================================================================

def test_admin_overview_unauthenticated_401():
    """Vector 1: Unauthenticated request to /api/admin/overview returns HTTP 401."""
    res = client.get("/api/admin/overview")
    assert res.status_code == 401


def test_admin_overview_student_forbidden_403():
    """Vector 2: Student JWT accessing /api/admin/overview returns HTTP 403."""
    token = get_student_a_token()
    res = client.get("/api/admin/overview", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403
    assert "Administrator role required" in res.json()["detail"]


def test_admin_overview_admin_authorized_200():
    """Vector 3: Admin JWT accessing /api/admin/overview returns HTTP 200."""
    token = get_admin_token()
    res = client.get("/api/admin/overview", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["success"] is True


# ============================================================================
# VECTORS 4, 5, 6, 7, 8: IDOR / OBJECT-LEVEL ACCESS CONTROL
# ============================================================================

def test_student_idor_access_other_student_403():
    """Vector 4: Student A accessing /api/students/{student_B_id} returns HTTP 403."""
    token = get_student_a_token()
    res = client.get("/api/students/SEC-STD-002", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403
    assert "only authorized to access your own student profile" in res.json()["detail"]


def test_student_access_own_record_200():
    """Vector 5: Student A accessing /api/students/{student_A_id} returns HTTP 200."""
    token = get_student_a_token()
    res = client.get("/api/students/SEC-STD-001", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["data"]["student_id"] == "SEC-STD-001"


def test_student_idor_access_other_student_photo_403():
    """Vector 6: Student A accessing /api/students/{student_B_id}/photo returns HTTP 403."""
    token = get_student_a_token()
    res = client.get("/api/students/SEC-STD-002/photo", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


def test_student_idor_attendance_other_student_403():
    """Vector 7: Student A accessing /api/attendance/student/{student_B_id} returns HTTP 403."""
    token = get_student_a_token()
    res = client.get("/api/attendance/student/SEC-STD-002", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


def test_student_idor_attendance_stats_other_student_403():
    """Vector 8: Student A accessing /api/attendance/stats/{student_B_id} returns HTTP 403."""
    token = get_student_a_token()
    res = client.get("/api/attendance/stats/SEC-STD-002", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


# ============================================================================
# VECTORS 9, 10, 11: PRIVILEGED ENDPOINTS INTEGRITY
# ============================================================================

def test_attendance_mark_direct_non_admin_forbidden():
    """Vector 9: Non-admin calling POST /api/attendance/mark returns HTTP 403 or 401."""
    token = get_student_a_token()
    payload = {"student_id": "SEC-STD-001", "confidence_score": 98.5}
    res = client.post("/api/attendance/mark", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403

    # Unauthenticated attempt
    res_unauth = client.post("/api/attendance/mark", json=payload)
    assert res_unauth.status_code == 401


def test_student_train_endpoint_non_admin_forbidden():
    """Vector 10: Non-admin calling POST /api/students/{student_id}/train returns HTTP 403 or 401."""
    token = get_student_a_token()
    res = client.post("/api/students/SEC-STD-001/train", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


def test_reports_daily_non_admin_forbidden():
    """Vector 11: Non-admin calling GET /api/reports/daily returns HTTP 403 or 401."""
    token = get_student_a_token()
    res = client.get("/api/reports/daily", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


# ============================================================================
# VECTORS 12, 13, 14: SLIDING-WINDOW RATE LIMITING
# ============================================================================

def test_rate_limit_login_endpoint():
    """Vector 12: Rate limit on /api/auth/login triggers HTTP 429 after 5 requests/min."""
    test_ip = f"198.51.100.{uuid.uuid4().hex[:6]}"
    headers = {"X-Forwarded-For": test_ip}

    # 5 allowed attempts
    for _ in range(5):
        res = client.post(
            "/api/auth/login",
            json={"email": "nonexistent@test.com", "password": "wrong"},
            headers=headers
        )
        assert res.status_code in [400, 401]

    # 6th attempt must be rejected by rate limiter
    res_blocked = client.post(
        "/api/auth/login",
        json={"email": "nonexistent@test.com", "password": "wrong"},
        headers=headers
    )
    assert res_blocked.status_code == 429
    assert "Too many requests" in res_blocked.json()["detail"]


def test_rate_limit_otp_request_endpoint():
    """Vector 13: Rate limit on /api/auth/register-request-otp triggers HTTP 429 after 3 requests/5min."""
    test_ip = f"198.51.101.{uuid.uuid4().hex[:6]}"
    headers = {"X-Forwarded-For": test_ip}
    repeated_email = f"repeated_otp_{test_ip}@test.com"

    # 3 allowed requests
    for i in range(3):
        res = client.post(
            "/api/auth/register-request-otp",
            json={"email": repeated_email, "full_name": "Test User"},
            headers=headers
        )
        assert res.status_code in [200, 400]

    # 4th request must be rejected by rate limiter
    res_blocked = client.post(
        "/api/auth/register-request-otp",
        json={"email": repeated_email, "full_name": "Test User"},
        headers=headers
    )
    assert res_blocked.status_code == 429


def test_rate_limit_cv_recognize_frame_endpoint():
    """Vector 14: Rate limit on /api/camera/recognize-frame triggers HTTP 429 after 30 requests/min."""
    test_ip = f"198.51.102.{uuid.uuid4().hex[:6]}"
    admin_token = get_admin_token()
    headers = {
        "X-Forwarded-For": test_ip,
        "Authorization": f"Bearer {admin_token}"
    }

    blank = np.zeros((100, 100, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", blank)
    b64 = base64.b64encode(buf).decode("utf-8")

    # 30 allowed requests
    for _ in range(30):
        res = client.post(
            "/api/camera/recognize-frame",
            json={"image_base64": b64, "auto_mark": False},
            headers=headers
        )
        assert res.status_code == 200

    # 31st request must trigger 429
    res_blocked = client.post(
        "/api/camera/recognize-frame",
        json={"image_base64": b64, "auto_mark": False},
        headers=headers
    )
    assert res_blocked.status_code == 429


# ============================================================================
# VECTORS 15, 16, 17, 18, 19, 20: SECURITY HEADERS, BOUNDS, SIZES, COOKIES
# ============================================================================

def test_security_headers_present():
    """Vector 15: Security headers present on responses."""
    res = client.get("/api/health")
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"
    assert res.headers.get("referrer-policy") == "strict-origin-when-cross-origin"


def test_correlation_id_x_request_id():
    """Vector 16: Correlation ID X-Request-ID attached and client trace ID preserved."""
    # 1. System auto-generates UUID
    res1 = client.get("/api/health")
    assert "x-request-id" in res1.headers
    assert len(res1.headers["x-request-id"]) > 10

    # 2. Preserves incoming client ID
    custom_id = "sakra-client-trace-778899"
    res2 = client.get("/api/health", headers={"X-Request-ID": custom_id})
    assert res2.headers.get("x-request-id") == custom_id


def test_request_size_limit_middleware_413():
    """Vector 17: Request with Content-Length > 10MB returns HTTP 413 Payload Too Large."""
    # 10MB + 10 bytes
    headers = {"Content-Length": str(10 * 1024 * 1024 + 10)}
    res = client.post("/api/health", content=b"test", headers=headers)
    assert res.status_code == 413
    data = res.json()
    assert "Payload Too Large" in data.get("message", data.get("detail", ""))


def test_oversized_image_dimensions_rejected_400():
    """Vector 18: Face frame with dimensions exceeding 4096px rejected with HTTP 400."""
    oversized = np.zeros((4097, 50, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", oversized)
    b64 = base64.b64encode(buf).decode("utf-8")

    res = client.post("/api/camera/validate-preview", json={"image_base64": b64})
    assert res.status_code == 400
    assert "Image resolution exceeds maximum allowed limit" in res.json()["detail"]


def test_attendance_mark_gps_bounds_validation_422():
    """Vector 19: Attendance GPS coordinates out of bounds rejected with HTTP 422."""
    admin_token = get_admin_token()
    payload = {
        "student_id": "SEC-STD-001",
        "latitude": 95.0,     # Out of [-90, 90]
        "longitude": 200.0,   # Out of [-180, 180]
        "location_accuracy": -5.0 # Out of [0, 10000]
    }
    res = client.post(
        "/api/attendance/mark",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res.status_code == 422


def test_dual_authentication_bearer_and_cookie():
    """Vector 20: Dual authentication works seamlessly via Bearer header or HttpOnly cookie."""
    admin_token = get_admin_token()

    # 1. Bearer Header
    res_bearer = client.get("/api/admin/overview", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_bearer.status_code == 200
    assert res_bearer.json()["success"] is True

    # 2. HttpOnly Cookie
    client.cookies.set("access_token", admin_token)
    try:
        res_cookie = client.get("/api/admin/overview")
        assert res_cookie.status_code == 200
        assert res_cookie.json()["success"] is True
    finally:
        client.cookies.clear()
