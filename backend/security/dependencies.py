import logging
from typing import Any, Dict, Optional
from fastapi import Cookie, Depends, Header, HTTPException, Request, status

from backend.config import settings
from backend.services.auth_service import auth_service
from backend.database.connection import execute_query
from backend.database.repository import repo

logger = logging.getLogger("smart_attendance.security")


def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    access_token: Optional[str] = Cookie(None),
) -> Dict[str, Any]:
    """
    Extract and validate authenticated user from either:
    1. Authorization: Bearer <token> header
    2. access_token HttpOnly cookie

    Returns dict containing: id, email, name, role, student_id, roll_number.
    Raises 401 UNAUTHORIZED if token is missing, expired, or tampered.
    """
    token: Optional[str] = None

    # 1. Check Bearer Authorization Header
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()

    # 2. Fall back to Cookie authentication
    elif access_token:
        token = access_token.strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid session token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Cryptographically validate JWT token
    payload = auth_service.decode_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired or is invalid. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email = payload["sub"].strip().lower()

    user_row = None
    try:
        user_row = execute_query(
            "SELECT id, email, full_name, role, is_verified FROM users WHERE email = %s",
            (email,),
            fetchone=True
        )
    except Exception:
        pass

    if not user_row:
        user_row = {
            "id": payload.get("id", 0),
            "email": email,
            "full_name": payload.get("name", ""),
            "role": payload.get("role", "user"),
            "is_verified": True
        }

    # 5. Resolve canonical student_id if user is a student
    student_id = payload.get("student_id")
    roll_number = payload.get("roll_number")

    if not student_id or not roll_number:
        student_row = execute_query(
            "SELECT student_id, roll_number FROM students WHERE email = %s OR roll_number = %s OR student_id = %s",
            (email, roll_number or email, student_id or email),
            fetchone=True
        )
        if student_row:
            student_id = student_row.get("student_id") or student_id
            roll_number = student_row.get("roll_number") or roll_number

    return {
        "id": user_row["id"],
        "email": email,
        "name": user_row.get("full_name") or payload.get("name", ""),
        "role": user_row.get("role", "user"),
        "student_id": student_id,
        "roll_number": roll_number,
        "auth_method": "cookie" if not (authorization and authorization.startswith("Bearer ")) else "bearer"
    }


def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Enforces strict administrator role-based access control (RBAC).
    Raises 403 FORBIDDEN if the authenticated caller is not an admin.
    """
    if current_user.get("role") != "admin":
        auth_service.log_audit(
            current_user.get("email"),
            "UNAUTHORIZED_ADMIN_ACCESS",
            f"User {current_user.get('email')} attempted unauthorized administrative action"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden. Administrator role required to access this resource."
        )
    return current_user


class StudentOwnershipChecker:
    """
    FastAPI dependency enforcing Object-Level Authorization (IDOR prevention).
    Verifies that the authenticated user is either:
    1. An administrator (allowed access to manage/view any student), OR
    2. The student themselves whose verified identity matches the requested student_id.
    """
    def __init__(self, path_param_name: str = "student_id"):
        self.path_param_name = path_param_name

    def __call__(
        self,
        request: Request,
        current_user: Dict[str, Any] = Depends(get_current_user)
    ) -> Dict[str, Any]:
        # Admins are always authorized
        if current_user.get("role") == "admin":
            return current_user

        requested_id = request.path_params.get(self.path_param_name, "").strip()
        user_student_id = (current_user.get("student_id") or "").strip()
        user_roll_number = (current_user.get("roll_number") or "").strip()
        user_email = (current_user.get("email") or "").strip().lower()

        # 1. Allow self-referencing aliases ("me", "self", "@me")
        if requested_id.lower() in ("me", "self", "@me"):
            return current_user

        # 2. Check match against verified student_id or roll_number
        if requested_id and (requested_id == user_student_id or requested_id == user_roll_number):
            return current_user

        # 3. If requested_id represents fallback placeholder from client, allow if user has student identity
        if requested_id in ("undefined", "null", "N/A") and (user_student_id or user_roll_number):
            return current_user

        # 4. If not matched directly, query database to see if requested_id belongs to caller's verified records
        if requested_id:
            target_student = repo.get_student_by_id(requested_id)
            if target_student:
                t_email = (target_student.get("email") or "").strip().lower()
                t_sid = (target_student.get("student_id") or "").strip()
                t_roll = (target_student.get("roll_number") or "").strip()
                if (t_email and t_email == user_email) or (user_student_id and t_sid == user_student_id) or (user_roll_number and t_roll == user_roll_number):
                    return current_user

        # Unauthorized access attempt to another student's record
        auth_service.log_audit(
            user_email,
            "BOLA_IDOR_BLOCKED",
            f"Student attempted unauthorized access to resource belonging to {requested_id}"
        )
        logger.warning(
            f"IDOR attempt blocked: User {user_email} attempted to access data of student {requested_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You are only authorized to access your own student profile and records."
        )


# Pre-configured dependency instance
require_student_or_admin = StudentOwnershipChecker("student_id")


def verify_csrf(
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    CSRF Defense (Double-Submit Cookie Pattern).
    Enforced only when the request was authenticated via browser cookie.
    Direct API clients with Authorization: Bearer are inherently immune to browser CSRF.
    """
    if current_user.get("auth_method") == "cookie" and request.method in ("POST", "PUT", "DELETE", "PATCH"):
        header_token = request.headers.get("X-CSRF-Token")
        cookie_token = request.cookies.get("csrf_token")

        if not header_token or not cookie_token or header_token != cookie_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF validation failed. Missing or invalid CSRF protection token."
            )
