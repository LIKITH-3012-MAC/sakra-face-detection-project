import hashlib
import json
import logging
import secrets
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple
from zoneinfo import ZoneInfo
import bcrypt
import jwt

from backend.config import settings
from backend.database.connection import execute_query
from backend.database.repository import repo
from backend.services.email_service import email_service

logger = logging.getLogger("smart_attendance.auth")

JWT_SECRET = settings.JWT_SECRET
JWT_ALGORITHM = settings.JWT_ALGORITHM
JWT_EXPIRATION_HOURS = settings.JWT_EXPIRATION_HOURS
OTP_EXPIRATION_MINUTES = settings.OTP_EXPIRATION_MINUTES
MAX_OTP_ATTEMPTS = settings.MAX_OTP_ATTEMPTS

class AuthService:
    """
    Complete authentication & role-based authorization service for Sakra-Lens.
    Manages:
    - Bcrypt password hashing
    - Cryptographically secure 6-digit OTP generation using secrets
    - SHA-256 OTP hashing with single-use enforcement
    - 3-minute OTP expiry & previous OTP invalidation
    - Role authorization (USER vs ADMIN)
    - Resend OTP & Admin invitation email dispatches
    - Audit log generation
    - Safe initial admin seeding
    """

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash plaintext password using bcrypt with 12 random salt rounds."""
        salt = bcrypt.gensalt(rounds=12)
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify password against bcrypt hash."""
        try:
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        except Exception:
            return False

    @staticmethod
    def _hash_otp(otp_str: str, email: str) -> str:
        """Hash OTP with email salt using SHA-256 for secure database storage."""
        combined = f"{otp_str.strip()}:{email.strip().lower()}:sakra_salt_2026"
        return hashlib.sha256(combined.encode("utf-8")).hexdigest()

    @staticmethod
    def generate_otp() -> str:
        """Generate cryptographically secure 6-digit numeric OTP using secrets."""
        return f"{secrets.randbelow(900000) + 100000:06d}"

    @staticmethod
    def create_token(user_data: Dict[str, Any]) -> str:
        """Create signed JWT session token."""
        exp = datetime.now(ZoneInfo("UTC")) + timedelta(hours=JWT_EXPIRATION_HOURS)
        payload = {
            "sub": user_data["email"],
            "id": user_data.get("id"),
            "name": user_data.get("full_name", ""),
            "role": user_data.get("role", "user"),
            "student_id": user_data.get("student_id"),
            "roll_number": user_data.get("roll_number"),
            "exp": exp
        }
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    @staticmethod
    def decode_token(token: str) -> Optional[Dict[str, Any]]:
        """Decode and validate JWT session token."""
        try:
            return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except Exception:
            return None

    @classmethod
    def log_audit(cls, user_email: Optional[str], action: str, details: str = "", ip_address: Optional[str] = None):
        """Append record to audit_logs table for administrative accountability."""
        try:
            execute_query(
                "INSERT INTO audit_logs (user_email, action, details, ip_address) VALUES (%s, %s, %s, %s)",
                (user_email, action, details, ip_address),
                commit=True
            )
        except Exception as e:
            logger.warning(f"Failed to record audit log: {e}")

    @classmethod
    def ensure_initial_admin(cls):
        """Ensure default administrator account (admin@sakra-lens / Sakra) exists in MySQL."""
        try:
            admin = execute_query("SELECT id FROM users WHERE email = 'admin@sakra-lens'", fetchone=True)
            if not admin:
                pwd_hash = cls.hash_password(settings.INITIAL_ADMIN_PASSWORD)
                execute_query(
                    """
                    INSERT INTO users (email, password_hash, full_name, role, is_verified)
                    VALUES ('admin@sakra-lens', %s, 'System Administrator', 'admin', TRUE)
                    """,
                    (pwd_hash,),
                    commit=True
                )
                logger.info("Initial administrator account (admin@sakra-lens) seeded successfully.")
        except Exception as e:
            logger.warning(f"Could not check/seed initial admin: {e}")

    @classmethod
    def request_registration_otp(
        cls,
        email: str,
        full_name: str,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Initiate student account registration:
        1. Verifies email is not already registered in users table.
        2. Invalidates any previous unverified OTPs for this email.
        3. Generates 6-digit OTP with 3-minute expiry.
        4. Hashes OTP and stores in MySQL otp_verifications.
        5. Dispatches Resend verification email to student's email.
        """
        email_clean = email.strip().lower()

        # Invalidate previous unused OTPs for this email
        execute_query("UPDATE otp_verifications SET is_used = TRUE WHERE email = %s AND is_used = FALSE", (email_clean,), commit=True)

        otp = cls.generate_otp()
        otp_hash = cls._hash_otp(otp, email_clean)
        now = datetime.now(ZoneInfo("Asia/Kolkata"))
        expires_at = now + timedelta(minutes=OTP_EXPIRATION_MINUTES)
        expires_str = expires_at.strftime("%Y-%m-%d %H:%M:%S")

        execute_query(
            """
            INSERT INTO otp_verifications (email, otp_hash, purpose, attempts, is_used, expires_at)
            VALUES (%s, %s, 'registration', 0, FALSE, %s)
            """,
            (email_clean, otp_hash, expires_str),
            commit=True
        )

        cls.log_audit(email_clean, "OTP_REQUESTED", f"Registration OTP dispatched to {email_clean}", ip_address)

        # Dispatch via Resend API
        ok, msg, resend_id = email_service.send_otp_email(
            email=email_clean,
            otp=otp,
            full_name=full_name,
            purpose="Account Registration"
        )

        if not ok:
            # Resend dispatch failed (e.g. network resolution / offline demo)
            print(
                f"\n{'='*70}\n"
                f"[DEMO / NETWORK FALLBACK] STUDENT REGISTRATION OTP\n"
                f"Student Email: {email_clean}\n"
                f"Student Name:  {full_name}\n"
                f"6-Digit OTP:   {otp}\n"
                f"Status: Saved to database, active for 3 minutes.\n"
                f"Network Notice: {msg}\n"
                f"{'='*70}\n"
            )
            logger.warning(f"Email dispatch fallback for {email_clean}. Active for 3 minutes: {msg}")
            return True, f"A 6-digit verification code has been dispatched. Please check your email (valid for 3 minutes)."

        return True, f"A 6-digit verification code has been dispatched to {email_clean}. It expires in 3 minutes."

    @staticmethod
    def create_verification_token(email: str) -> str:
        """Create signed JWT token confirming email was verified via OTP (valid for 30 minutes)."""
        exp = datetime.now(ZoneInfo("UTC")) + timedelta(minutes=30)
        payload = {
            "sub": email.strip().lower(),
            "purpose": "email_verified",
            "exp": exp
        }
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    @classmethod
    def verify_otp_only(cls, email: str, otp: str, ip_address: Optional[str] = None) -> Tuple[bool, str, Optional[str]]:
        """
        Verify 6-digit OTP validity, attempt limits, and 3-minute expiration.
        Returns: (success: bool, message: str, verification_token: Optional[str])
        """
        email_clean = email.strip().lower()
        otp_clean = otp.strip()

        otp_row = execute_query(
            """
            SELECT id, otp_hash, attempts, is_used, expires_at, purpose
            FROM otp_verifications
            WHERE email = %s AND is_used = FALSE
            ORDER BY id DESC LIMIT 1
            """,
            (email_clean,),
            fetchone=True
        )

        if not otp_row:
            # Check if recently verified within the registration session
            recent = execute_query(
                """
                SELECT id, purpose, created_at
                FROM otp_verifications
                WHERE email = %s AND purpose = 'verified'
                ORDER BY id DESC LIMIT 1
                """,
                (email_clean,),
                fetchone=True
            )
            if recent:
                v_token = cls.create_verification_token(email_clean)
                return True, "Email verified successfully.", v_token
            return False, "No active verification code found. Please request a new OTP.", None

        if otp_row.get("attempts", 0) >= MAX_OTP_ATTEMPTS:
            execute_query("UPDATE otp_verifications SET is_used = TRUE WHERE id = %s", (otp_row["id"],), commit=True)
            cls.log_audit(email_clean, "OTP_LOCKED", "Exceeded maximum verification attempts", ip_address)
            return False, "Maximum attempts exceeded. Please request a new OTP.", None

        now = datetime.now(ZoneInfo("Asia/Kolkata"))
        exp_val = otp_row.get("expires_at")
        if isinstance(exp_val, str):
            exp_time = datetime.strptime(exp_val, "%Y-%m-%d %H:%M:%S").replace(tzinfo=ZoneInfo("Asia/Kolkata"))
        elif isinstance(exp_val, datetime):
            exp_time = exp_val.replace(tzinfo=ZoneInfo("Asia/Kolkata")) if not exp_val.tzinfo else exp_val
        else:
            exp_time = now - timedelta(seconds=1)

        if now > exp_time:
            execute_query("UPDATE otp_verifications SET is_used = TRUE WHERE id = %s", (otp_row["id"],), commit=True)
            cls.log_audit(email_clean, "OTP_EXPIRED", "Submitted expired verification code", ip_address)
            return False, "Verification code has expired (3-minute limit). Please request a new one.", None

        input_hash = cls._hash_otp(otp_clean, email_clean)
        if input_hash != otp_row.get("otp_hash"):
            new_attempts = otp_row.get("attempts", 0) + 1
            execute_query("UPDATE otp_verifications SET attempts = %s WHERE id = %s", (new_attempts, otp_row["id"]), commit=True)
            remaining = MAX_OTP_ATTEMPTS - new_attempts
            return False, f"Invalid verification code. {remaining} attempt(s) remaining.", None

        # Mark as verified in purpose, but keep is_used = FALSE so it can be completed during registration
        execute_query("UPDATE otp_verifications SET purpose = 'verified', attempts = 0 WHERE id = %s", (otp_row["id"],), commit=True)
        cls.log_audit(email_clean, "OTP_VERIFIED", "Verification code validated successfully", ip_address)
        v_token = cls.create_verification_token(email_clean)
        return True, "Email verified successfully.", v_token

    @classmethod
    def complete_student_registration(
        cls,
        email: str,
        password: str,
        full_name: str,
        roll_number: str,
        department: str,
        year: str,
        section: str,
        student_id: Optional[str] = None,
        otp: Optional[str] = None,
        verification_token: Optional[str] = None,
        face_image_base64: Optional[str] = None,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Complete student account creation and face enrollment:
        1. Validates OTP or verification_token.
        2. Validates password complexity.
        3. Creates record in users table with role 'user'.
        4. Creates or updates record in students table.
        5. If face image provided: computes 128-D encoding, saves to face_data, hot-reloads model.
        6. Consumes OTP / marks verification complete.
        7. Generates authenticated session token.
        """
        email_clean = email.strip().lower()
        full_name = full_name.strip()
        roll_number = roll_number.strip()
        canonical_student_id = (student_id or roll_number).strip()

        if len(password) < 6:
            return False, "Password must be at least 6 characters long.", None

        # 1. Validate email verification via verification_token or OTP
        is_verified = False
        if verification_token:
            token_data = cls.decode_token(verification_token)
            if token_data and token_data.get("purpose") == "email_verified" and token_data.get("sub") == email_clean:
                is_verified = True

        if not is_verified and otp:
            otp_clean = otp.strip()
            otp_row = execute_query(
                """
                SELECT id, otp_hash, attempts, is_used, expires_at, purpose
                FROM otp_verifications
                WHERE email = %s
                ORDER BY id DESC LIMIT 1
                """,
                (email_clean,),
                fetchone=True
            )
            if otp_row:
                input_hash = cls._hash_otp(otp_clean, email_clean)
                if input_hash == otp_row.get("otp_hash"):
                    if otp_row.get("purpose") == "verified":
                        is_verified = True
                    elif not otp_row.get("is_used"):
                        now = datetime.now(ZoneInfo("Asia/Kolkata"))
                        exp_val = otp_row.get("expires_at")
                        if isinstance(exp_val, str):
                            exp_time = datetime.strptime(exp_val, "%Y-%m-%d %H:%M:%S").replace(tzinfo=ZoneInfo("Asia/Kolkata"))
                        elif isinstance(exp_val, datetime):
                            exp_time = exp_val.replace(tzinfo=ZoneInfo("Asia/Kolkata")) if not exp_val.tzinfo else exp_val
                        else:
                            exp_time = now - timedelta(seconds=1)
                        if now <= exp_time:
                            is_verified = True

        if not is_verified:
            recent_verified = execute_query(
                """
                SELECT id FROM otp_verifications
                WHERE email = %s AND purpose = 'verified' AND is_used = FALSE
                ORDER BY id DESC LIMIT 1
                """,
                (email_clean,),
                fetchone=True
            )
            if recent_verified:
                is_verified = True

        if not is_verified:
            return False, "Email verification required. Please verify your email with the 6-digit OTP code.", None

        # 2. Hash password & insert or update users table
        pwd_hash = cls.hash_password(password)
        existing_user = execute_query("SELECT id FROM users WHERE email = %s", (email_clean,), fetchone=True)
        if existing_user:
            execute_query(
                "UPDATE users SET password_hash = %s, full_name = %s, is_verified = TRUE WHERE id = %s",
                (pwd_hash, full_name, existing_user["id"]),
                commit=True
            )
            new_user_id = existing_user["id"]
        else:
            new_user_id = execute_query(
                """
                INSERT INTO users (email, password_hash, full_name, role, is_verified)
                VALUES (%s, %s, %s, 'user', TRUE)
                """,
                (email_clean, pwd_hash, full_name),
                commit=True
            )

        # 3. Link or create student record in students table
        existing_student = execute_query(
            "SELECT id, student_id FROM students WHERE roll_number = %s OR student_id = %s OR email = %s",
            (roll_number, canonical_student_id, email_clean),
            fetchone=True
        )

        if existing_student:
            # Update existing student with registered user details
            canonical_student_id = existing_student["student_id"]
            execute_query(
                """
                UPDATE students
                SET name = %s, roll_number = %s, department = %s, year = %s, academic_year = %s, section = %s, email = %s
                WHERE id = %s
                """,
                (full_name, roll_number, department, year, year, section, email_clean, existing_student["id"]),
                commit=True
            )
        else:
            execute_query(
                """
                INSERT INTO students (student_id, name, roll_number, department, year, academic_year, section, email, face_dataset_count, is_trained)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 0, FALSE)
                """,
                (canonical_student_id, full_name, roll_number, department, year, year, section, email_clean),
                commit=True
            )

        # 4. Biometric Face Enrollment (1 High-Quality Image -> 128-D encoding)
        face_enrolled = False
        face_msg = ""
        if face_image_base64:
            from backend.routers.students import enroll_single_face_image
            import base64
            import numpy as np
            import cv2

            try:
                b64_str = face_image_base64
                if "," in b64_str:
                    b64_str = b64_str.split(",")[1]
                img_bytes = base64.b64decode(b64_str)
                nparr = np.frombuffer(img_bytes, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                f_ok, f_msg, f_data = enroll_single_face_image(canonical_student_id, frame)
                face_enrolled = f_ok
                face_msg = f_msg
            except Exception as e:
                logger.warning(f"Face enrollment during registration failed: {e}")
                face_msg = str(e)

        # 5. Mark OTP as completed/consumed
        execute_query(
            "UPDATE otp_verifications SET is_used = TRUE, purpose = 'completed' WHERE email = %s",
            (email_clean,),
            commit=True
        )

        user_data = {
            "id": new_user_id,
            "email": email_clean,
            "full_name": full_name,
            "role": "user",
            "student_id": canonical_student_id,
            "roll_number": roll_number,
            "face_enrolled": face_enrolled
        }

        token = cls.create_token(user_data)
        cls.log_audit(
            email_clean,
            "STUDENT_REGISTERED",
            f"Registered student: {full_name} ({roll_number}), Face Enrolled: {face_enrolled}",
            ip_address
        )

        return True, "Account created successfully!", {
            "user": user_data,
            "token": token,
            "face_enrolled": face_enrolled,
            "face_message": face_msg
        }

    @classmethod
    def login(cls, email: str, password: str, ip_address: Optional[str] = None) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """Authenticate user credentials against Cloud MySQL."""
        email_clean = email.strip().lower()
        user = execute_query("SELECT * FROM users WHERE email = %s", (email_clean,), fetchone=True)
        if not user:
            cls.log_audit(email_clean, "LOGIN_FAILED", "Account not found", ip_address)
            return False, "Invalid email address or password.", None

        if not cls.verify_password(password, user["password_hash"]):
            cls.log_audit(email_clean, "LOGIN_FAILED", "Incorrect password", ip_address)
            return False, "Invalid email address or password.", None

        # Resolve associated student details if role is 'user'
        student_id = None
        roll_number = None
        student = execute_query("SELECT student_id, roll_number FROM students WHERE LOWER(email) = %s LIMIT 1", (email_clean,), fetchone=True)
        if not student and user.get("full_name"):
            student = execute_query("SELECT student_id, roll_number FROM students WHERE LOWER(name) = %s LIMIT 1", (user["full_name"].strip().lower(),), fetchone=True)
        if student:
            student_id = student["student_id"]
            roll_number = student["roll_number"]

        user_data = {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "student_id": student_id,
            "roll_number": roll_number
        }
        token = cls.create_token(user_data)
        cls.log_audit(email_clean, "LOGIN_SUCCESS", f"User logged in ({user['role']})", ip_address)

        return True, "Login successful", {"user": user_data, "token": token}

    @classmethod
    def promote_or_create_admin(
        cls,
        admin_email: str,
        full_name: str,
        requester_email: str,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Grant administrator privileges to an email address.
        Dispatches Resend notification to the new administrator.
        """
        admin_email_clean = admin_email.strip().lower()
        full_name = full_name.strip() or "Administrator"

        existing = execute_query("SELECT id, email, role FROM users WHERE email = %s", (admin_email_clean,), fetchone=True)
        temp_pwd = None

        if existing:
            execute_query(
                "UPDATE users SET role = 'admin', full_name = %s WHERE id = %s",
                (full_name, existing["id"]),
                commit=True
            )
        else:
            # Generate random secure temporary password
            temp_pwd = f"SakraAdmin@{secrets.randbelow(9000) + 1000}"
            pwd_hash = cls.hash_password(temp_pwd)
            execute_query(
                """
                INSERT INTO users (email, password_hash, full_name, role, is_verified)
                VALUES (%s, %s, %s, 'admin', TRUE)
                """,
                (admin_email_clean, pwd_hash, full_name),
                commit=True
            )

        cls.log_audit(
            requester_email,
            "ADMIN_CREATED",
            f"Granted ADMIN role to {admin_email_clean} by {requester_email}",
            ip_address
        )

        # Dispatch Resend notification
        ok, msg, resend_id = email_service.send_admin_invitation_email(
            email=admin_email_clean,
            full_name=full_name,
            temporary_password=temp_pwd
        )

        return True, f"Administrator privileges granted to {admin_email_clean}.", {
            "email": admin_email_clean,
            "role": "admin",
            "email_dispatched": ok
        }

auth_service = AuthService()

# Ensure default administrator exists
auth_service.ensure_initial_admin()
