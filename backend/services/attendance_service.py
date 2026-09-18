import logging
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, Optional, Tuple
from zoneinfo import ZoneInfo

from backend.config import settings
from backend.database.connection import execute_query
from backend.database.repository import repo
from backend.services.email_service import email_service

logger = logging.getLogger("smart_attendance.attendance_service")

class AttendanceService:
    """
    Attendance business rules & MySQL persistence (Section 26 & Resend Integration).
    - Authoritative timestamp generation in Asia/Kolkata timezone
    - Checks today's attendance in Cloud MySQL
    - Enforces temporal confirmation (MIN_STABLE_RECOGNITIONS = 3)
    - In-memory debouncer/cooldown (60 seconds)
    - Evaluates Present vs Late based on ATTENDANCE_CUTOFF_TIME
    - Captures Client IP, Latitude, and Longitude
    - Parameterized INSERT into Cloud MySQL attendance table
    - Dispatches student confirmation email via Resend (never rolling back on email failure)
    - Formats Section 12 terminal logs
    """

    def __init__(self):
        self.cooldown_cache: Dict[str, datetime] = {}
        self.streak_tracker: Dict[str, int] = defaultdict(int)
        self.cooldown_seconds = 60
        self.min_stable_recognitions = getattr(settings, "MIN_STABLE_RECOGNITIONS", 3)
        self.tz_name = getattr(settings, "TIMEZONE", "Asia/Kolkata")

    def _get_now_in_tz(self) -> datetime:
        """Return current datetime localized to configured timezone (e.g. Asia/Kolkata)."""
        try:
            return datetime.now(ZoneInfo(self.tz_name))
        except Exception:
            return datetime.now()

    def check_temporal_confirmation(self, student_id: str) -> bool:
        """Requires MIN_STABLE_RECOGNITIONS consecutive recognitions before marking."""
        self.streak_tracker[student_id] += 1
        return self.streak_tracker[student_id] >= self.min_stable_recognitions

    def reset_streak(self, student_id: str):
        self.streak_tracker[student_id] = 0

    def evaluate_status(self, arrival_time: time) -> str:
        """Evaluate Present vs Late against ATTENDANCE_CUTOFF_TIME."""
        try:
            parts = settings.ATTENDANCE_CUTOFF_TIME.split(":")
            cutoff = time(int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)
        except Exception:
            cutoff = time(9, 30, 0)
        return "Present" if arrival_time <= cutoff else "Late"

    def mark_attendance(
        self,
        student_id: str,
        face_distance: float,
        attendance_date: Optional[date] = None,
        attendance_time: Optional[time] = None,
        ip_address: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        location_accuracy: Optional[float] = None,
        mode: str = "automatic"
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Process recognition event for attendance marking, MySQL insertion, and Resend email dispatch.
        Returns: (success, message, record_dict)
        """
        now = self._get_now_in_tz()
        cur_date = attendance_date or now.date()
        cur_time = attendance_time or now.time()
        time_str = cur_time.strftime("%H:%M:%S")
        date_str = str(cur_date)

        # 1. Fetch student info dynamically from Cloud MySQL
        student = repo.get_student_by_id(student_id)
        canonical_student_id = student["student_id"] if student else student_id
        student_name = student["name"] if student else student_id
        student_roll = student.get("roll_number", "") if student else ""
        student_dept = student.get("department", "") if student else ""
        student_year = student.get("year", "") if student else ""
        student_acad_year = student.get("academic_year", "") if student else ""
        student_section = student.get("section", "") if student else ""
        student_email = (student.get("email") or "").strip() if student else None

        # Determine display identifier (prefer full roll number if available)
        display_id = student_roll if (student_roll and (len(student_roll) > len(canonical_student_id) or student_roll.startswith("2473A"))) else canonical_student_id

        # 2. In-memory cooldown check per canonical student ID
        last_marked = self.cooldown_cache.get(canonical_student_id)
        if last_marked and (now - last_marked).total_seconds() < self.cooldown_seconds:
            return False, f"Cooldown active for {student_name}", None

        # 3. Cloud MySQL duplicate check for today
        if repo.has_student_attended_today(canonical_student_id, date_str):
            print(f"\n[ATTENDANCE]\n{student_name} already marked today.\nNo duplicate record created.\n")
            self.cooldown_cache[canonical_student_id] = now
            return False, f"{student_name} already marked today", None

        # 4. Evaluate Present vs Late
        status = self.evaluate_status(cur_time)

        # 5. Insert into Cloud MySQL attendance table using canonical foreign key
        ok, record = repo.insert_attendance_record(
            student_id=canonical_student_id,
            attendance_date=date_str,
            attendance_time=time_str,
            status=status,
            face_distance=face_distance,
            confidence_score=round((1.0 - face_distance) * 100.0, 1),
            ip_address=ip_address,
            latitude=latitude,
            longitude=longitude,
            location_accuracy=location_accuracy,
            email_status="pending"
        )

        if ok and record:
            self.cooldown_cache[canonical_student_id] = now
            self.reset_streak(canonical_student_id)

            # Retrieve updated stats from Cloud MySQL
            stats = repo.get_student_attendance_stats(canonical_student_id, date_str)
            today_count = stats.get("today_count", 1)
            total_count = stats.get("total_attendance_count", 1)
            last_attendance_time = stats.get("last_attendance_time", time_str)

            # Terminal Logging as required
            print(
                f"\n[FACE] Recognized Student\n"
                f"[FACE] Student ID: {display_id}\n"
                f"[FACE] Name: {student_name}\n"
                f"[FACE] Distance: {face_distance:.2f}\n"
                f"[FACE] Tolerance: 0.50\n"
            )
            if student_email and "@" in student_email:
                print(
                    f"[MYSQL] Student email resolved\n"
                    f"[MYSQL] Email: {student_email}\n"
                )
            else:
                print(
                    f"[MYSQL] No student email found for {display_id}\n"
                )

            print(
                f"[ATTENDANCE] Attendance inserted successfully\n"
                f"[ATTENDANCE] {'Manual confirmation received' if mode.lower() == 'manual' else 'Automatic attendance processed'}\n"
                f"[ATTENDANCE] Date: {date_str}\n"
                f"[ATTENDANCE] Time: {time_str} IST\n"
                f"[MYSQL] Today's count: {today_count}\n"
                f"[MYSQL] Total count: {total_count}\n"
            )

            # 6. Resend Email Notification Dispatch (DYNAMIC RECIPIENT FROM MySQL)
            # Only sent after database insertion succeeds. Email failure does NOT rollback attendance.
            email_notification = "pending"
            email_status_db = "pending"
            resend_id = None

            if student_email and "@" in student_email:
                try:
                    email_date = now.strftime("%d %B %Y")
                    email_time = now.strftime("%I:%M:%S %p")
                    conf = round((1.0 - face_distance) * 100.0, 1)

                    email_ok, email_msg, resend_id = email_service.send_attendance_notification(
                        student_name=student_name,
                        student_id=canonical_student_id,
                        roll_number=student_roll or canonical_student_id,
                        department=student_dept,
                        section=student_section,
                        email=student_email,
                        attendance_date=email_date,
                        attendance_time=email_time,
                        status=status,
                        face_distance=face_distance,
                        confidence_score=conf,
                        ip_address=ip_address,
                        latitude=latitude,
                        longitude=longitude,
                        location_accuracy=location_accuracy,
                        today_count=today_count,
                        total_attendance_count=total_count,
                        year=student_year,
                        academic_year=student_acad_year,
                        tolerance_gate=0.50,
                        device_info="Sakra-Lens Vision Client",
                        last_attendance_time=last_attendance_time,
                        timezone_str=f"{self.tz_name} (IST)"
                    )
                    email_status_db = "sent" if email_ok else "failed"
                    email_notification = email_status_db
                    if record.get("id"):
                        repo.update_attendance_email_status(record["id"], email_status=email_status_db, email_message_id=resend_id)
                except Exception as mail_err:
                    logger.error(f"Failed to dispatch attendance notification email: {mail_err}")
                    email_status_db = "failed"
                    email_notification = "failed"
                    if record.get("id"):
                        repo.update_attendance_email_status(record["id"], email_status="failed", email_message_id=None)
            else:
                email_notification = "not_configured"
                email_status_db = "not_configured"
                if record.get("id"):
                    repo.update_attendance_email_status(record["id"], email_status="not_configured", email_message_id=None)
                print(f"[RESEND] No registered email address found for student {display_id}. Notification skipped.\n")

            enhanced_record = {
                **record,
                "student_id": canonical_student_id,
                "name": student_name,
                "roll_number": student_roll,
                "department": student_dept,
                "section": student_section,
                "email": student_email,
                "status": status,
                "date": date_str,
                "time": time_str,
                "timezone": self.tz_name,
                "face_distance": face_distance,
                "confidence_score": round((1.0 - face_distance) * 100.0, 1),
                "ip_address": ip_address,
                "latitude": latitude,
                "longitude": longitude,
                "location_accuracy": location_accuracy,
                "today_count": today_count,
                "total_attendance_count": total_count,
                "last_attendance_time": last_attendance_time,
                "email_notification": email_notification,
                "email_status": email_status_db,
                "email_message_id": resend_id
            }

            return True, f"{student_name} marked {status}", enhanced_record

        return False, "Failed to record attendance in database", None

attendance_service = AttendanceService()
