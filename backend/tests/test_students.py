import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend.schemas.student import StudentCreate
from backend.database.connection import check_database_connection

client = TestClient(app)

def test_api_health_endpoint():
    """Verify /api/health returns standard JSON envelope."""
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "status" in data["data"]
    assert "database" in data["data"]

from backend.services.auth_service import auth_service

def test_student_validation_empty_id():
    """Verify Pydantic validation rejects empty student_id when called by admin."""
    invalid_payload = {
        "student_id": "",
        "name": "Test Student",
        "roll_number": "2026-CS-999",
        "department": "Computer Science",
        "year": "4th Year",
        "section": "A"
    }
    admin_token = auth_service.create_token({"email": "admin@sakra-lens", "role": "admin"})
    res = client.post("/api/students", json=invalid_payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 422
    data = res.json()
    assert data["success"] is False
    assert "Validation Error" in data["message"]

def test_student_validation_valid():
    """Verify StudentCreate schema validates proper inputs."""
    valid = StudentCreate(
        student_id="STD-001",
        name="Likith Naidu",
        roll_number="2026-CS-001",
        department="Computer Science",
        year="4th Year",
        section="A"
    )
    assert valid.student_id == "STD-001"
    assert valid.name == "Likith Naidu"

def test_database_connection_check():
    """Verify check_database_connection returns boolean and status description."""
    is_connected, msg = check_database_connection()
    assert isinstance(is_connected, bool)
    assert isinstance(msg, str)
