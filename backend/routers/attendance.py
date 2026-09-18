from datetime import date, datetime, time
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from mysql.connector import Error as MySQLError

from backend.config import settings
from backend.services.attendance_service import attendance_service
from backend.utils.network import get_client_ip
from backend.database.connection import execute_query
from backend.database.repository import repo
from backend.security import require_admin, require_student_or_admin
from backend.schemas.attendance import (
    AttendanceMarkRequest,
    AttendanceRecordResponse,
    DashboardStats,
    SystemSettingsSchema
)
from backend.schemas.common import ApiResponse

router = APIRouter(prefix="/api/attendance", tags=["Attendance"])

@router.get("", response_model=ApiResponse[List[AttendanceRecordResponse]])
def get_attendance(
    attendance_date: Optional[date] = Query(None, description="Filter by Date (YYYY-MM-DD)"),
    start_date: Optional[date] = Query(None, description="Start date for range"),
    end_date: Optional[date] = Query(None, description="End date for range"),
    student_id: Optional[str] = Query(None, description="Filter by Student ID"),
    department: Optional[str] = Query(None, description="Filter by Department"),
    section: Optional[str] = Query(None, description="Filter by Section"),
    attendance_status: Optional[str] = Query(None, alias="status", description="Filter by Status (Present, Late, Absent)"),
    search: Optional[str] = Query(None, description="Search by Name or Roll Number"),
    admin: dict = Depends(require_admin)
):
    """Retrieve attendance logs with comprehensive filtering."""
    query = """
        SELECT a.id, a.student_id, s.name, s.roll_number, s.department, s.section,
               a.attendance_date, a.attendance_time, a.status, a.confidence_score, a.face_distance,
               a.ip_address, a.latitude, a.longitude, a.location_accuracy,
               a.email_status, a.email_message_id, a.created_at
        FROM attendance a
        JOIN students s ON a.student_id = s.student_id
        WHERE 1=1
    """
    params = []

    if attendance_date:
        query += " AND a.attendance_date = %s"
        params.append(attendance_date)
    elif start_date and end_date:
        query += " AND a.attendance_date BETWEEN %s AND %s"
        params.extend([start_date, end_date])
    elif start_date:
        query += " AND a.attendance_date >= %s"
        params.append(start_date)

    if student_id:
        query += " AND a.student_id = %s"
        params.append(student_id)

    if department:
        query += " AND s.department = %s"
        params.append(department)

    if section:
        query += " AND s.section = %s"
        params.append(section)

    if attendance_status:
        query += " AND a.status = %s"
        params.append(attendance_status)

    if search:
        query += " AND (s.name LIKE %s OR s.roll_number LIKE %s)"
        params.extend([f"%{search}%", f"%{search}%"])

    query += " ORDER BY a.attendance_date DESC, a.attendance_time DESC"

    try:
        records = execute_query(query, params, fetchall=True) or []
        return ApiResponse(
            success=True,
            message=f"Retrieved {len(records)} attendance records",
            data=records
        )
    except MySQLError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {e.msg}"
        )

@router.get("/today", response_model=ApiResponse[List[AttendanceRecordResponse]])
def get_today_attendance(admin: dict = Depends(require_admin)):
    """Retrieve today's attendance logs."""
    today = date.today()
    query = """
        SELECT a.id, a.student_id, s.name, s.roll_number, s.department, s.section,
               a.attendance_date, a.attendance_time, a.status, a.confidence_score, a.face_distance,
               a.ip_address, a.latitude, a.longitude, a.location_accuracy,
               a.email_status, a.email_message_id, a.created_at
        FROM attendance a
        JOIN students s ON a.student_id = s.student_id
        WHERE a.attendance_date = %s
        ORDER BY a.attendance_time DESC
    """
    try:
        records = execute_query(query, (today,), fetchall=True) or []
        return ApiResponse(
            success=True,
            message=f"Retrieved {len(records)} attendance records for today ({today})",
            data=records
        )
    except MySQLError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {e.msg}"
        )

@router.get("/dashboard-stats", response_model=ApiResponse[DashboardStats])
def get_dashboard_stats(admin: dict = Depends(require_admin)):
    """Compute overall dashboard statistics: Total Students, Present Today, Absent Today, Attendance %."""
    today = date.today()

    try:
        # Total registered students
        total_row = execute_query("SELECT COUNT(*) as count FROM students", fetchone=True)
        total_students = total_row["count"] if total_row else 0

        # Today's attendance counts
        stats_query = """
            SELECT
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_today,
                SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as late_today
            FROM attendance
            WHERE attendance_date = %s
        """
        stats_row = execute_query(stats_query, (today,), fetchone=True) or {}
        present_today = int(stats_row.get("present_today") or 0)
        late_today = int(stats_row.get("late_today") or 0)

        total_attended_today = present_today + late_today
        absent_today = max(0, total_students - total_attended_today)

        pct = round((total_attended_today / total_students) * 100.0, 1) if total_students > 0 else 0.0

        stats = DashboardStats(
            total_students=total_students,
            present_today=present_today,
            absent_today=absent_today,
            late_today=late_today,
            attendance_percentage=pct,
            today_date=str(today),
            active_cutoff_time=settings.ATTENDANCE_CUTOFF_TIME
        )

        return ApiResponse(
            success=True,
            message="Dashboard statistics retrieved successfully",
            data=stats
        )
    except MySQLError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {e.msg}"
        )

@router.get("/stats/{student_id}", response_model=ApiResponse[dict])
def get_student_stats_api(student_id: str, caller: dict = Depends(require_student_or_admin)):
    """Retrieve current attendance metrics for a student."""
    stats = repo.get_student_attendance_stats(student_id)
    return ApiResponse(
        success=True,
        message="Attendance statistics retrieved",
        data=stats
    )

@router.post("/mark", response_model=ApiResponse[dict])
def mark_attendance_api(payload: AttendanceMarkRequest, request: Request, admin: dict = Depends(require_admin)):
    """Mark attendance for student with duplicate check, cutoff logic, client IP, geolocation, and Resend email dispatch."""
    client_ip = get_client_ip(request)
    distance = payload.face_distance if payload.face_distance is not None else (
        round(1.0 - (payload.confidence_score / 100.0), 3) if payload.confidence_score else 0.38
    )
    success, message, record = attendance_service.mark_attendance(
        student_id=payload.student_id,
        face_distance=distance,
        attendance_date=payload.attendance_date,
        attendance_time=payload.attendance_time,
        ip_address=client_ip,
        latitude=payload.latitude,
        longitude=payload.longitude,
        location_accuracy=payload.location_accuracy,
        mode="manual"
    )

    if not success and not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )

    return ApiResponse(
        success=success,
        message=message,
        data=record
    )

@router.get("/student/{student_id}", response_model=ApiResponse[List[AttendanceRecordResponse]])
def get_student_attendance(student_id: str, caller: dict = Depends(require_student_or_admin)):
    """Retrieve all attendance logs for a specific student."""
    query = """
        SELECT a.id, a.student_id, s.name, s.roll_number, s.department, s.section,
               a.attendance_date, a.attendance_time, a.status, a.confidence_score, a.face_distance,
               a.ip_address, a.latitude, a.longitude, a.location_accuracy, a.created_at
        FROM attendance a
        JOIN students s ON a.student_id = s.student_id
        WHERE a.student_id = %s
        ORDER BY a.attendance_date DESC, a.attendance_time DESC
    """
    records = execute_query(query, (student_id,), fetchall=True) or []
    return ApiResponse(
        success=True,
        message=f"Retrieved {len(records)} attendance logs for student {student_id}",
        data=records
    )

@router.get("/settings", response_model=ApiResponse[SystemSettingsSchema])
def get_system_settings(admin: dict = Depends(require_admin)):
    """Get system attendance cutoff and recognition settings."""
    try:
        row = execute_query("SELECT * FROM system_settings WHERE id = 1", fetchone=True)
        if row:
            return ApiResponse(
                success=True,
                message="Settings retrieved",
                data=SystemSettingsSchema(
                    cutoff_time=str(row["cutoff_time"]),
                    recognition_threshold=float(row["recognition_threshold"]),
                    min_dataset_images=int(row["min_dataset_images"]),
                    auto_mark_enabled=bool(row["auto_mark_enabled"])
                )
            )
    except Exception:
        pass

    return ApiResponse(
        success=True,
        message="Default settings",
        data=SystemSettingsSchema(
            cutoff_time=settings.ATTENDANCE_CUTOFF_TIME,
            recognition_threshold=settings.FACE_RECOGNITION_THRESHOLD,
            min_dataset_images=settings.MIN_DATASET_IMAGES,
            auto_mark_enabled=True
        )
    )

@router.put("/settings", response_model=ApiResponse[SystemSettingsSchema])
def update_system_settings(payload: SystemSettingsSchema, admin: dict = Depends(require_admin)):
    """Update system attendance cutoff and recognition threshold."""
    settings.ATTENDANCE_CUTOFF_TIME = payload.cutoff_time
    settings.FACE_RECOGNITION_THRESHOLD = payload.recognition_threshold
    settings.MIN_DATASET_IMAGES = payload.min_dataset_images

    try:
        execute_query("""
            INSERT INTO system_settings (id, cutoff_time, recognition_threshold, min_dataset_images, auto_mark_enabled)
            VALUES (1, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                cutoff_time = VALUES(cutoff_time),
                recognition_threshold = VALUES(recognition_threshold),
                min_dataset_images = VALUES(min_dataset_images),
                auto_mark_enabled = VALUES(auto_mark_enabled)
        """, (payload.cutoff_time, payload.recognition_threshold, payload.min_dataset_images, payload.auto_mark_enabled), commit=True)
    except Exception:
        pass

    return ApiResponse(
        success=True,
        message="Settings updated successfully",
        data=payload
    )
