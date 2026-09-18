import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from pydantic import BaseModel, Field

from backend.database.connection import execute_query
from backend.services.auth_service import auth_service
from backend.utils.network import get_client_ip
from backend.schemas.common import ApiResponse
from backend.security import require_admin, admin_invite_limiter

logger = logging.getLogger("smart_attendance.admin")
router = APIRouter(prefix="/api/admin", tags=["Administrator Operations"])

class AdminInviteSchema(BaseModel):
    email: str = Field(..., min_length=3, max_length=150)
    full_name: Optional[str] = Field("Administrator", max_length=100)

@router.get("/overview", response_model=ApiResponse[dict])
def get_admin_overview(admin: dict = Depends(require_admin)):
    """Retrieve comprehensive system overview for administrators."""

    # User counts
    users_cnt = execute_query("SELECT COUNT(*) as c FROM users", fetchone=True)
    admins_cnt = execute_query("SELECT COUNT(*) as c FROM users WHERE role = 'admin'", fetchone=True)
    # Student counts
    students_cnt = execute_query("SELECT COUNT(*) as c FROM students", fetchone=True)
    # Attendance counts
    attendance_cnt = execute_query("SELECT COUNT(*) as c FROM attendance", fetchone=True)
    today_cnt = execute_query("SELECT COUNT(*) as c FROM attendance WHERE attendance_date = CURDATE()", fetchone=True)
    # Recent audit logs
    recent_audits = execute_query(
        "SELECT id, user_email, action, details, ip_address, created_at FROM audit_logs ORDER BY id DESC LIMIT 20",
        fetchall=True
    ) or []

    total_s = students_cnt.get("c", 0) if students_cnt else 0
    today_a = today_cnt.get("c", 0) if today_cnt else 0
    pct = round((today_a / total_s) * 100.0, 1) if total_s > 0 else 0.0

    return ApiResponse(
        success=True,
        message="Admin overview retrieved",
        data={
            "total_users": users_cnt.get("c", 0) if users_cnt else 0,
            "total_admins": admins_cnt.get("c", 0) if admins_cnt else 0,
            "total_students": total_s,
            "total_attendance_records": attendance_cnt.get("c", 0) if attendance_cnt else 0,
            "today_attendance": today_a,
            "attendance_rate": pct,
            "recent_audit_logs": recent_audits
        }
    )

@router.get("/audit-logs", response_model=ApiResponse[list])
def get_audit_logs(admin: dict = Depends(require_admin)):
    """Retrieve detailed security and system audit logs."""
    logs = execute_query(
        "SELECT id, user_email, action, details, ip_address, created_at FROM audit_logs ORDER BY id DESC LIMIT 100",
        fetchall=True
    ) or []
    return ApiResponse(success=True, message="Audit logs retrieved", data=logs)

@router.get("/users", response_model=ApiResponse[list])
def get_all_users(admin: dict = Depends(require_admin)):
    """List all registered system users with verification and role status."""
    users = execute_query(
        "SELECT id, email, full_name, role, is_verified, created_at FROM users ORDER BY id DESC LIMIT 100",
        fetchall=True
    ) or []
    return ApiResponse(success=True, message="Users retrieved", data=users)

@router.get("/admins", response_model=ApiResponse[list])
def get_all_admins(admin: dict = Depends(require_admin)):
    """List all active administrators with role verification."""
    admins = execute_query(
        "SELECT id, email, full_name, role, is_verified, created_at FROM users WHERE role = 'admin' ORDER BY id DESC LIMIT 100",
        fetchall=True
    ) or []
    return ApiResponse(success=True, message="Administrators retrieved", data=admins)

@router.post("/invite", response_model=ApiResponse[dict], dependencies=[Depends(admin_invite_limiter)])
def invite_admin(payload: AdminInviteSchema, request: Request, admin: dict = Depends(require_admin)):
    """
    Grant administrator access to an email address:
    1. Requires existing authenticated ADMIN
    2. Updates or creates user account with role 'admin'
    3. Dispatches notification to the new administrator
    4. Records security audit log
    Rate-limited to prevent administrator account creation abuse.
    """
    requester_email = admin.get("email") or admin.get("sub", "system")
    client_ip = get_client_ip(request)

    ok, msg, data = auth_service.promote_or_create_admin(
        admin_email=payload.email,
        full_name=payload.full_name or "Administrator",
        requester_email=requester_email,
        ip_address=client_ip
    )

    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

    return ApiResponse(success=True, message=msg, data=data)
