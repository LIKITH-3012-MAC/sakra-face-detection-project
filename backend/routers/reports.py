import csv
import io
from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
import pandas as pd
from mysql.connector import Error as MySQLError

from backend.database.connection import execute_query
from backend.schemas.common import ApiResponse
from backend.security import require_admin

router = APIRouter(prefix="/api/reports", tags=["Reports"])

@router.get("/daily", response_model=ApiResponse[dict])
def get_daily_report(
    report_date: Optional[date] = Query(None, description="Date for report (YYYY-MM-DD)"),
    admin: dict = Depends(require_admin)
):
    """Generate daily attendance report for a specific date."""
    target_date = report_date or date.today()
    query = """
        SELECT a.id, a.student_id, s.name, s.roll_number, s.department, s.section,
               a.attendance_date, a.attendance_time, a.status, a.confidence_score
        FROM attendance a
        JOIN students s ON a.student_id = s.student_id
        WHERE a.attendance_date = %s
        ORDER BY a.attendance_time ASC
    """
    records = execute_query(query, (target_date,), fetchall=True) or []

    # Get total students registered
    total_students_row = execute_query("SELECT COUNT(*) as count FROM students", fetchone=True)
    total_students = total_students_row["count"] if total_students_row else 0

    present_count = sum(1 for r in records if r["status"] == "Present")
    late_count = sum(1 for r in records if r["status"] == "Late")
    total_attended = present_count + late_count
    absent_count = max(0, total_students - total_attended)
    pct = round((total_attended / total_students * 100.0), 1) if total_students > 0 else 0.0

    return ApiResponse(
        success=True,
        message=f"Daily report generated for {target_date}",
        data={
            "report_date": str(target_date),
            "summary": {
                "total_students": total_students,
                "present": present_count,
                "late": late_count,
                "absent": absent_count,
                "attendance_percentage": pct
            },
            "records": records
        }
    )

@router.get("/monthly", response_model=ApiResponse[dict])
def get_monthly_report(
    year: int = Query(..., ge=2020, le=2035, description="Year e.g. 2026"),
    month: int = Query(..., ge=1, le=12, description="Month 1-12"),
    department: Optional[str] = Query(None, description="Filter by department"),
    admin: dict = Depends(require_admin)
):
    """Generate monthly aggregated attendance report."""
    query = """
        SELECT a.attendance_date,
               COUNT(DISTINCT a.student_id) as attended_count,
               SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) as present_count,
               SUM(CASE WHEN a.status = 'Late' THEN 1 ELSE 0 END) as late_count
        FROM attendance a
        JOIN students s ON a.student_id = s.student_id
        WHERE YEAR(a.attendance_date) = %s AND MONTH(a.attendance_date) = %s
    """
    params = [year, month]
    if department:
        query += " AND s.department = %s"
        params.append(department)

    query += " GROUP BY a.attendance_date ORDER BY a.attendance_date ASC"

    records = execute_query(query, tuple(params), fetchall=True) or []

    return ApiResponse(
        success=True,
        message=f"Monthly report for {year}-{month:02d}",
        data={
            "year": year,
            "month": month,
            "department": department or "All Departments",
            "daily_aggregates": records
        }
    )

@router.get("/student-wise", response_model=ApiResponse[List[dict]])
def get_student_wise_report(
    department: Optional[str] = Query(None),
    section: Optional[str] = Query(None),
    admin: dict = Depends(require_admin)
):
    """Generate comprehensive student-wise attendance percentage report."""
    # Total distinct class days conducted
    total_dates_row = execute_query("SELECT COUNT(DISTINCT attendance_date) as total_days FROM attendance", fetchone=True)
    total_days = total_dates_row["total_days"] if total_dates_row and total_dates_row["total_days"] else 0

    query = """
        SELECT s.student_id, s.name, s.roll_number, s.department, s.year, s.section,
               COUNT(a.id) as total_attended,
               SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) as present_count,
               SUM(CASE WHEN a.status = 'Late' THEN 1 ELSE 0 END) as late_count
        FROM students s
        LEFT JOIN attendance a ON s.student_id = a.student_id
        WHERE 1=1
    """
    params = []
    if department:
        query += " AND s.department = %s"
        params.append(department)
    if section:
        query += " AND s.section = %s"
        params.append(section)

    query += " GROUP BY s.student_id, s.name, s.roll_number, s.department, s.year, s.section ORDER BY s.roll_number ASC"

    rows = execute_query(query, tuple(params), fetchall=True) or []

    results = []
    for r in rows:
        present = int(r.get("present_count") or 0)
        late = int(r.get("late_count") or 0)
        attended = present + late
        absent = max(0, total_days - attended)
        pct = round((attended / total_days * 100.0), 1) if total_days > 0 else (100.0 if attended > 0 else 0.0)

        results.append({
            "student_id": r["student_id"],
            "name": r["name"],
            "roll_number": r["roll_number"],
            "department": r["department"],
            "year": r["year"],
            "section": r["section"],
            "total_classes": total_days,
            "present": present,
            "late": late,
            "absent": absent,
            "percentage": pct
        })

    return ApiResponse(
        success=True,
        message=f"Student-wise report generated for {len(results)} students",
        data=results
    )

@router.get("/export-csv")
def export_attendance_csv(
    report_type: str = Query("attendance", description="'attendance', 'daily', or 'student-wise'"),
    report_date: Optional[date] = Query(None),
    department: Optional[str] = Query(None),
    section: Optional[str] = Query(None),
    admin: dict = Depends(require_admin)
):
    """Export attendance data directly as a downloadable CSV file."""
    output = io.StringIO()
    writer = csv.writer(output)

    if report_type == "student-wise":
        # Export student-wise percentage
        report_res = get_student_wise_report(department=department, section=section, admin=admin)
        students_data = report_res.data or []

        writer.writerow(["Student ID", "Name", "Roll Number", "Department", "Year", "Section", "Total Classes", "Present", "Late", "Absent", "Attendance %"])
        for s in students_data:
            writer.writerow([
                s["student_id"],
                s["name"],
                s["roll_number"],
                s["department"],
                s["year"],
                s["section"],
                s["total_classes"],
                s["present"],
                s["late"],
                s["absent"],
                f"{s['percentage']}%"
            ])
        filename = f"student_attendance_summary_{date.today()}.csv"

    else:
        # Export attendance logs
        query = """
            SELECT a.student_id, s.name, s.roll_number, s.department, s.year, s.section,
                   a.attendance_date, a.attendance_time, a.status, a.confidence_score
            FROM attendance a
            JOIN students s ON a.student_id = s.student_id
            WHERE 1=1
        """
        params = []
        if report_date:
            query += " AND a.attendance_date = %s"
            params.append(report_date)
        if department:
            query += " AND s.department = %s"
            params.append(department)
        if section:
            query += " AND s.section = %s"
            params.append(section)

        query += " ORDER BY a.attendance_date DESC, a.attendance_time DESC"
        records = execute_query(query, tuple(params), fetchall=True) or []

        writer.writerow(["Student ID", "Name", "Roll Number", "Department", "Year", "Section", "Date", "Time", "Status", "Confidence Score"])
        for r in records:
            writer.writerow([
                r["student_id"],
                r["name"],
                r["roll_number"],
                r["department"],
                r["year"],
                r["section"],
                str(r["attendance_date"]),
                str(r["attendance_time"]),
                r["status"],
                r["confidence_score"] or "N/A"
            ])
        filename = f"attendance_records_{report_date or date.today()}.csv"

    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
