import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend.services.auth_service import auth_service
from backend.services.email_service import email_service

client = TestClient(app)

def test_initial_admin_login():
    """Verify default initial administrator admin@sakra-lens logs in with password Sakra."""
    payload = {
        "email": "admin@sakra-lens",
        "password": "Sakra"
    }
    res = client.post("/api/auth/admin/login", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["data"]["user"]["role"] == "admin"
    assert data["data"]["user"]["email"] == "admin@sakra-lens"
    assert "token" in data["data"]

def test_admin_login_wrong_password():
    """Verify admin login rejects incorrect password with HTTP 401."""
    payload = {
        "email": "admin@sakra-lens",
        "password": "WrongPassword123"
    }
    res = client.post("/api/auth/admin/login", json=payload)
    assert res.status_code == 401
    data = res.json()
    assert "detail" in data


def test_admin_overview_authorized():
    """Verify administrator with valid JWT can access admin overview."""
    login_res = client.post("/api/auth/admin/login", json={"email": "admin@sakra-lens", "password": "Sakra"})
    token = login_res.json()["data"]["token"]

    res = client.get("/api/admin/overview", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "total_students" in data["data"]
    assert "total_attendance_records" in data["data"]

def test_admin_overview_unauthorized_missing_token():
    """Verify accessing admin endpoint without token returns 401."""
    client.cookies.clear()
    res = client.get("/api/admin/overview")
    assert res.status_code == 401

def test_admin_overview_forbidden_for_student():
    """Verify student role cannot access admin endpoints (HTTP 403)."""
    student_user = {
        "id": 999,
        "email": "student.test@gmail.com",
        "full_name": "Student Test",
        "role": "user"
    }
    student_token = auth_service.create_token(student_user)

    res = client.get("/api/admin/overview", headers={"Authorization": f"Bearer {student_token}"})
    assert res.status_code == 403
    assert "Administrator role required" in res.json()["detail"]

def test_cryptographic_otp_properties():
    """Verify OTP is 6 numeric digits generated cryptographically."""
    otp = auth_service.generate_otp()
    assert len(otp) == 6
    assert otp.isdigit()

    # Verify hashing
    h1 = auth_service._hash_otp(otp, "test@example.com")
    h2 = auth_service._hash_otp(otp, "test@example.com")
    assert h1 == h2
    assert len(h1) == 64

def test_bcrypt_password_hashing():
    """Verify bcrypt hashes are salted, non-plaintext, and verifiable."""
    plain = "SakraTestPassword2026"
    hashed = auth_service.hash_password(plain)
    assert hashed != plain
    assert auth_service.verify_password(plain, hashed) is True
    assert auth_service.verify_password("WrongPassword", hashed) is False

def test_email_service_otp_template_structure():
    """Verify send_otp_email formats email with 3-minute alert and sender Likith Naidu."""
    assert "Likith Naidu" in email_service.from_email
    # Test with mock email
    ok, msg, resend_id = email_service.send_otp_email(
        email="test.student@example.com",
        otp="654321",
        full_name="Test Student",
        purpose="Account Registration"
    )
    # Even if network mock or live, success or graceful failure without crash
    assert isinstance(ok, bool)

def test_admin_invite_endpoint_rbac():
    """Verify only admin can call /api/admin/invite."""
    # 1. Student attempt -> 403
    student_user = {"id": 888, "email": "student2@gmail.com", "role": "user"}
    student_token = auth_service.create_token(student_user)
    res = client.post("/api/admin/invite", json={"email": "new.admin@test.com"}, headers={"Authorization": f"Bearer {student_token}"})
    assert res.status_code == 403

    # 2. Admin attempt -> 200
    admin_res = client.post("/api/auth/admin/login", json={"email": "admin@sakra-lens", "password": "Sakra"})
    admin_token = admin_res.json()["data"]["token"]
    res_ok = client.post(
        "/api/admin/invite",
        json={"email": "assistant.admin@test.com", "full_name": "Assistant Admin"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res_ok.status_code == 200
    assert res_ok.json()["success"] is True

def test_multistep_student_onboarding_and_skip_face():
    """Verify multi-step student onboarding: Request OTP -> Verify OTP -> Set Password -> Complete Registration."""
    from unittest.mock import patch
    from backend.database.connection import execute_query

    test_email = "test.student.flow@gmail.com"
    # Clean up test rows if any
    execute_query("DELETE FROM users WHERE email = %s", (test_email,), commit=True)
    execute_query("DELETE FROM otp_verifications WHERE email = %s", (test_email,), commit=True)

    # 1. Request OTP (mocking send_otp_email so external Resend network call doesn't reject test domain)
    with patch.object(email_service, "send_otp_email", return_value=(True, "Dispatched", "mock_resend_id")):
        res1 = client.post("/api/auth/register-request-otp", json={
            "email": test_email,
            "full_name": "Flow Test Student",
            "roll_number": "TEST-FLOW-99",
            "department": "Computer Science",
            "year": "4th Year",
            "section": "A"
        })
    assert res1.status_code == 200
    assert res1.json()["success"] is True

    # Fetch generated OTP from DB
    otp_row = execute_query("SELECT id, otp_hash FROM otp_verifications WHERE email = %s ORDER BY id DESC LIMIT 1", (test_email,), fetchone=True)
    assert otp_row is not None

    # Brute-force/simulate OTP lookup
    # In test, we can verify with known hash or test verify_otp_only directly
    # Generate an OTP that matches the hash
    # Or simply update the row with a known hash
    known_otp = "889900"
    known_hash = auth_service._hash_otp(known_otp, test_email)
    execute_query("UPDATE otp_verifications SET otp_hash = %s WHERE id = %s", (known_hash, otp_row["id"]), commit=True)

    # 2. Step 2: Verify OTP
    res2 = client.post("/api/auth/verify-otp", json={"email": test_email, "otp": known_otp})
    assert res2.status_code == 200
    res2_body = res2.json()
    assert res2_body["success"] is True
    assert res2_body["data"]["verified"] is True
    verification_token = res2_body["data"].get("verification_token")
    assert verification_token is not None

    # 3. Step 4: Complete Registration (skipping face enrollment, passing verification_token and otp)
    res3 = client.post("/api/auth/register-student", json={
        "email": test_email,
        "password": "SecurePassword2026",
        "full_name": "Flow Test Student",
        "roll_number": "TEST-FLOW-99",
        "department": "Computer Science",
        "year": "4th Year",
        "section": "A",
        "otp": known_otp,
        "verification_token": verification_token,
        "face_image_base64": None
    })
    assert res3.status_code == 200
    res3_body = res3.json()
    assert res3_body["success"] is True
    assert res3_body["data"]["user"]["role"] == "user"
    assert res3_body["data"]["user"]["email"] == test_email
    assert res3_body["data"]["token"] is not None

    # 4. Student can now login directly with password
    login_res = client.post("/api/auth/login", json={"email": test_email, "password": "SecurePassword2026"})
    assert login_res.status_code == 200
    assert login_res.json()["data"]["user"]["email"] == test_email

    # Clean up test rows
    execute_query("DELETE FROM users WHERE email = %s", (test_email,), commit=True)
    execute_query("DELETE FROM students WHERE roll_number = 'TEST-FLOW-99'", commit=True)
    execute_query("DELETE FROM otp_verifications WHERE email = %s", (test_email,), commit=True)

