import logging
from typing import Optional
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from backend.config import settings
from backend.services.auth_service import auth_service
from backend.utils.network import get_client_ip
from backend.database.connection import execute_query
from backend.schemas.common import ApiResponse
from backend.security import (
    get_current_user,
    login_limiter,
    otp_request_limiter,
    otp_verify_limiter,
)

logger = logging.getLogger("smart_attendance.auth_router")
router = APIRouter(prefix="/api/auth", tags=["Authentication & Access Control"])

class OTPRequestSchema(BaseModel):
    email: str = Field(..., min_length=3, max_length=150)
    full_name: str = Field(..., min_length=2, max_length=100)
    roll_number: Optional[str] = None
    department: Optional[str] = None
    year: Optional[str] = None
    section: Optional[str] = None

class OTPVerifySchema(BaseModel):
    email: str = Field(..., min_length=3, max_length=150)
    otp: str = Field(..., min_length=6, max_length=6)

class StudentRegistrationSchema(BaseModel):
    email: str = Field(..., min_length=3, max_length=150)
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2, max_length=100)
    roll_number: str = Field(..., min_length=1, max_length=50)
    department: str = Field(..., min_length=1, max_length=100)
    year: str = Field(..., min_length=1, max_length=20)
    section: str = Field(..., min_length=1, max_length=20)
    student_id: Optional[str] = None
    otp: Optional[str] = None
    verification_token: Optional[str] = None
    face_image_base64: Optional[str] = None

class LoginSchema(BaseModel):
    email: str = Field(..., min_length=3, max_length=150)
    password: str = Field(..., min_length=1)

def _set_auth_cookies(response: Response, token: str) -> str:
    """Helper to set secure HttpOnly session cookie and CSRF token."""
    csrf_token = secrets.token_urlsafe(32)
    cookie_secure = settings.is_production or settings.COOKIE_SECURE
    max_age = settings.JWT_EXPIRATION_HOURS * 3600

    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=cookie_secure,
        samesite="lax",
        max_age=max_age,
        path="/"
    )
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,  # Readable by frontend client to populate X-CSRF-Token header
        secure=cookie_secure,
        samesite="lax",
        max_age=max_age,
        path="/"
    )
    return csrf_token

@router.post("/register-request-otp", response_model=ApiResponse[dict], dependencies=[Depends(otp_request_limiter)])
def request_registration_otp(payload: OTPRequestSchema, request: Request):
    """
    Step 1: Request 6-digit OTP for new student registration.
    Enforces uniqueness, 3-minute expiration, and dispatches notification to the student's email.
    Rate-limited to prevent email abuse and account enumeration.
    """
    client_ip = get_client_ip(request)
    ok, msg = auth_service.request_registration_otp(payload.email, payload.full_name, client_ip)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
    return ApiResponse(success=True, message=msg, data={"email": payload.email.strip().lower()})

@router.post("/verify-otp", response_model=ApiResponse[dict], dependencies=[Depends(otp_verify_limiter)])
def verify_otp(payload: OTPVerifySchema, request: Request):
    """
    Step 2: Verify 6-digit OTP validity, attempt limits (<5), and expiration.
    Returns email verification token valid for registration completion.
    Rate-limited to prevent brute-force attacks on OTP codes.
    """
    client_ip = get_client_ip(request)
    ok, msg, token = auth_service.verify_otp_only(payload.email, payload.otp, client_ip)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
    return ApiResponse(
        success=True,
        message=msg,
        data={
            "email": payload.email.strip().lower(),
            "verified": True,
            "verification_token": token
        }
    )

@router.post("/register-student", response_model=ApiResponse[dict])
@router.post("/verify-otp-register", response_model=ApiResponse[dict])
def register_student(payload: StudentRegistrationSchema, request: Request, response: Response):
    """
    Step 3: Complete student registration:
    1. Validates OTP / verification token & password
    2. Stores user with role 'user'
    3. Stores/links student profile in Cloud MySQL
    4. Performs 1-reference face biometric enrollment & generates encoding
    5. Sets HttpOnly session cookie and returns authenticated session token
    """
    client_ip = get_client_ip(request)
    ok, msg, data = auth_service.complete_student_registration(
        email=payload.email,
        password=payload.password,
        full_name=payload.full_name,
        roll_number=payload.roll_number,
        department=payload.department,
        year=payload.year,
        section=payload.section,
        student_id=payload.student_id,
        otp=payload.otp,
        verification_token=payload.verification_token,
        face_image_base64=payload.face_image_base64,
        ip_address=client_ip
    )
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

    token_val = (data or {}).get("access_token") or (data or {}).get("token")
    if token_val:
        data["csrf_token"] = _set_auth_cookies(response, token_val)
        data["access_token"] = token_val
        data["token"] = token_val

    return ApiResponse(success=True, message=msg, data=data)

@router.post("/login", response_model=ApiResponse[dict], dependencies=[Depends(login_limiter)])
def login(payload: LoginSchema, request: Request, response: Response):
    """
    Authenticate existing student or user credentials.
    Sets HttpOnly session cookie, returns bearer token and CSRF token.
    Rate-limited to prevent brute-force attacks.
    """
    client_ip = get_client_ip(request)
    ok, msg, data = auth_service.login(payload.email, payload.password, client_ip)
    if not ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    token_val = (data or {}).get("access_token") or (data or {}).get("token")
    if token_val:
        data["csrf_token"] = _set_auth_cookies(response, token_val)
        data["access_token"] = token_val
        data["token"] = token_val

    return ApiResponse(success=True, message=msg, data=data)

@router.post("/admin/login", response_model=ApiResponse[dict], dependencies=[Depends(login_limiter)])
def admin_login(payload: LoginSchema, request: Request, response: Response):
    """
    Authenticate administrator with strict role verification.
    Sets HttpOnly session cookie, returns bearer token and CSRF token.
    Rate-limited to prevent brute-force attacks.
    """
    client_ip = get_client_ip(request)
    ok, msg, data = auth_service.login(payload.email, payload.password, client_ip)
    if not ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid administrator credentials.")
    if data["user"]["role"] != "admin":
        auth_service.log_audit(payload.email, "ADMIN_ACCESS_DENIED", "Non-admin attempted admin login", client_ip)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Administrator privileges required.")

    token_val = (data or {}).get("access_token") or (data or {}).get("token")
    if token_val:
        data["csrf_token"] = _set_auth_cookies(response, token_val)
        data["access_token"] = token_val
        data["token"] = token_val

    return ApiResponse(success=True, message="Administrator authenticated successfully", data=data)

@router.post("/logout", response_model=ApiResponse[dict])
def logout(response: Response):
    """Clear session authentication and CSRF cookies."""
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="csrf_token", path="/")
    return ApiResponse(success=True, message="Session terminated successfully", data=None)

@router.get("/me", response_model=ApiResponse[dict])
def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    """Validate current session token and retrieve caller profile."""
    return ApiResponse(success=True, message="Session valid", data=current_user)

@router.get("/student/profile", response_model=ApiResponse[dict])
def get_student_portal_profile(current_user: dict = Depends(get_current_user)):
    """Retrieve full profile, academic info, and attendance metrics for authenticated student."""
    email = current_user.get("email")
    student = execute_query(
        "SELECT id, student_id, name, roll_number, department, year, section, email, is_trained FROM students WHERE email = %s",
        (email,),
        fetchone=True
    )

    if not student:
        student = {
            "name": current_user.get("name"),
            "email": email,
            "student_id": current_user.get("student_id") or "N/A",
            "roll_number": current_user.get("roll_number") or "N/A",
            "department": "N/A",
            "year": "N/A",
            "section": "N/A",
            "is_trained": False
        }

    canonical_id = student.get("student_id")
    stats = {}
    if canonical_id and canonical_id != "N/A":
        from backend.database.repository import repo
        stats = repo.get_student_attendance_stats(canonical_id)

    return ApiResponse(
        success=True,
        message="Student profile retrieved",
        data={
            "student": student,
            "stats": stats
        }
    )
