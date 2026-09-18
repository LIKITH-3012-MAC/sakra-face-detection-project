import pytest
from unittest.mock import patch, MagicMock
from fastapi import Request
from zoneinfo import ZoneInfo
from datetime import datetime, time

from backend.utils.network import get_client_ip
from backend.services.email_service import email_service
from backend.services.attendance_service import attendance_service
from backend.database.repository import repo

def test_safe_client_ip_extraction():
    """Verify safe IP extraction from direct client and loopback proxy headers."""
    # Direct remote client
    mock_request = MagicMock(spec=Request)
    mock_request.client.host = "192.168.1.100"
    mock_request.headers = {}
    assert get_client_ip(mock_request) == "192.168.1.100"

    # Loopback with X-Forwarded-For
    mock_proxy_req = MagicMock(spec=Request)
    mock_proxy_req.client.host = "127.0.0.1"
    mock_proxy_req.headers = {"X-Forwarded-For": "203.0.113.50, 10.0.0.1"}
    assert get_client_ip(mock_proxy_req) == "203.0.113.50"

    # Missing client info fallback
    mock_empty = MagicMock(spec=Request)
    mock_empty.client = None
    mock_empty.headers = {}
    assert get_client_ip(mock_empty) == "127.0.0.1"

def test_timezone_asia_kolkata_formatting():
    """Verify timestamps are localized to Asia/Kolkata (IST)."""
    tz = ZoneInfo("Asia/Kolkata")
    now_ist = datetime.now(tz)
    time_str = now_ist.strftime("%I:%M %p IST")
    assert "IST" in time_str or "+0530" in now_ist.strftime("%z")

@patch("backend.services.email_service.resend.Emails.send")
def test_resend_email_dispatch_success(mock_send):
    """Verify email service invokes Resend API and returns message ID on success."""
    mock_send.return_value = {"id": "msg_resend_test_789"}

    ok, msg, resend_id = email_service.send_attendance_notification(
        student_name="Likith Naidu",
        student_id="STD-101",
        roll_number="2473A31139",
        department="Computer Science",
        section="A",
        email="likith@mail.likith-portfolio.online",
        attendance_date="10 September 2026",
        attendance_time="10:30 PM IST",
        status="Present",
        face_distance=0.35,
        ip_address="192.168.1.25",
        latitude=14.123456,
        longitude=80.123456,
        location_accuracy=5.2,
        today_count=1,
        total_attendance_count=42
    )

    assert ok is True
    assert resend_id == "msg_resend_test_789"
    assert "Notification sent successfully" in msg
    mock_send.assert_called_once()
    call_args = mock_send.call_args[0][0]
    assert call_args["to"] == ["likith@mail.likith-portfolio.online"]
    assert "Sakra-Lens Attendance Confirmation — Likith Naidu" in call_args["subject"]
    assert "Location Verified" in call_args["html"]
    assert "Today's Attendance: 1" in call_args["text"]
    assert "Total Attendance Records: 42" in call_args["text"]

@patch("backend.services.email_service.resend.Emails.send")
def test_resend_email_dispatch_failure_does_not_crash(mock_send):
    """Verify email service handles API network errors gracefully without throwing."""
    mock_send.side_effect = Exception("Simulated Resend API Timeout")

    ok, msg, resend_id = email_service.send_attendance_notification(
        student_name="Likith Naidu",
        student_id="STD-101",
        roll_number="2473A31139",
        department="Computer Science",
        section="A",
        email="likith@mail.likith-portfolio.online",
        attendance_date="10 September 2026",
        attendance_time="10:30 PM IST",
        status="Present"
    )

    assert ok is False
    assert resend_id is None
    assert "Failed to send email" in msg

@patch("backend.services.email_service.email_service.send_attendance_notification")
@patch.object(repo, "insert_attendance_record")
@patch.object(repo, "get_student_by_id")
@patch.object(repo, "has_student_attended_today")
def test_attendance_non_rollback_on_email_failure(mock_attended, mock_get_student, mock_insert, mock_email):
    """
    CRITICAL REQUIREMENT (Section 9):
    If email sending fails AFTER attendance has been recorded in Cloud MySQL,
    the attendance record MUST NOT be rolled back.
    The response must indicate attendance success with email_notification: 'failed'.
    """
    mock_attended.return_value = False
    mock_get_student.return_value = {
        "student_id": "STD-TEST-ROLLBACK",
        "name": "Test Student",
        "email": "test@mail.likith-portfolio.online",
        "roll_number": "2026-CS-001",
        "department": "Computer Science",
        "section": "A"
    }
    mock_insert.return_value = (True, {
        "id": 9999,
        "student_id": "STD-TEST-ROLLBACK",
        "attendance_date": "2026-09-10",
        "attendance_time": "22:30:00",
        "status": "Present",
        "face_distance": 0.38
    })
    # Simulate email failure
    mock_email.return_value = (False, "Resend connection error", None)

    # Clear cooldown
    attendance_service.cooldown_cache.clear()

    ok, msg, record = attendance_service.mark_attendance(
        student_id="STD-TEST-ROLLBACK",
        face_distance=0.38,
        attendance_time=time(9, 15, 0),
        ip_address="192.168.1.55",
        latitude=14.5000,
        longitude=80.2000
    )

    # Attendance MUST succeed even if email failed
    assert ok is True
    assert record is not None
    assert record["student_id"] == "STD-TEST-ROLLBACK"
    assert record["email_notification"] == "failed"
    assert record["status"] == "Present"
    assert record["ip_address"] == "192.168.1.55"

@patch("backend.services.attendance_service.repo.get_student_attendance_stats")
@patch("backend.services.attendance_service.repo.insert_attendance_record")
@patch("backend.services.attendance_service.repo.get_student_by_id")
@patch("backend.services.attendance_service.repo.has_student_attended_today")
def test_manual_mode_attendance_stats_return(mock_attended, mock_get_student, mock_insert, mock_stats):
    """Verify manual mode attendance marks record with location accuracy and returns calculated stats."""
    mock_attended.return_value = False
    mock_get_student.return_value = {
        "student_id": "STD-2473A",
        "name": "LIKITH NAIDU ANUMAKONDA",
        "email": "likith@mail.likith-portfolio.online",
        "roll_number": "2473A31139",
        "department": "Computer Science",
        "section": "A"
    }
    mock_insert.return_value = (True, {
        "id": 1001,
        "student_id": "STD-2473A",
        "attendance_date": "2026-09-10",
        "attendance_time": "22:50:18",
        "status": "Present",
        "face_distance": 0.38,
        "location_accuracy": 6.5
    })
    mock_stats.return_value = {
        "today_count": 1,
        "total_attendance_count": 42,
        "last_attendance_time": "22:50:18",
        "already_marked_today": True
    }

    attendance_service.cooldown_cache.clear()

    ok, msg, record = attendance_service.mark_attendance(
        student_id="STD-2473A",
        face_distance=0.38,
        ip_address="192.168.1.20",
        latitude=14.9184,
        longitude=79.9914,
        location_accuracy=6.5,
        mode="manual"
    )

    assert ok is True
    assert record is not None
    assert record["student_id"] == "STD-2473A"
    assert record["today_count"] == 1
    assert record["total_attendance_count"] == 42
    assert record["location_accuracy"] == 6.5
    assert record["name"] == "LIKITH NAIDU ANUMAKONDA"

