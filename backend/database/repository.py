import logging
import json
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Any, Dict, List, Optional, Tuple
from backend.database.connection import execute_query

logger = logging.getLogger('smart_attendance.repository')

class DatabaseRepository:
    """
    Centralized repository pattern isolating database operations.
    Handles student records, binary face datasets, model artifacts, and attendance logs.
    """

    @staticmethod
    def get_student_by_id(student_id: str) -> Optional[Dict[str, Any]]:
        query = """
            SELECT id, student_id, name, roll_number, department, year, academic_year, section, email,
                   face_dataset_count, is_trained, model_version, trained_at, created_at, updated_at
            FROM students
            WHERE student_id = %s OR roll_number = %s
            ORDER BY (student_id = %s) DESC
            LIMIT 1
        """
        return execute_query(query, (student_id, student_id, student_id), fetchone=True)

    @staticmethod
    def get_all_registered_students() -> List[Dict[str, Any]]:
        query = """
            SELECT id, student_id, name, roll_number, department, year, section, email,
                   face_dataset_count, is_trained, model_version, trained_at
            FROM students
            ORDER BY student_id ASC
        """
        return execute_query(query, fetchall=True) or []

    @staticmethod
    def update_student_training_status(
        student_id: str,
        count: int,
        is_trained: bool,
        model_version: int
    ) -> bool:
        query = """
            UPDATE students
            SET face_dataset_count = %s,
                is_trained = %s,
                model_version = %s,
                trained_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE student_id = %s
        """
        execute_query(query, (count, is_trained, model_version, student_id), commit=True)
        return True

    @staticmethod
    def save_face_data(
        student_id: str,
        image_filename: str,
        image_bytes: bytes,
        face_encoding_json: str
    ) -> bool:
        """
        Store single reference face photo (LONGBLOB) and 128D face encoding in MySQL face_data table,
        and update students table face_encoding and is_trained status.
        """
        try:
            # 1. Insert/Update face_data
            query = """
                INSERT INTO face_data (student_id, image_filename, image_data, face_encoding)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    image_filename = VALUES(image_filename),
                    image_data = VALUES(image_data),
                    face_encoding = VALUES(face_encoding),
                    created_at = CURRENT_TIMESTAMP
            """
            execute_query(query, (student_id, image_filename, image_bytes, face_encoding_json), commit=True)

            # 2. Update students table
            execute_query(
                "UPDATE students SET face_encoding = %s, face_dataset_count = 1, is_trained = TRUE, updated_at = CURRENT_TIMESTAMP WHERE student_id = %s",
                (face_encoding_json, student_id),
                commit=True
            )
            return True
        except Exception as e:
            logger.error(f"Error saving face_data for {student_id}: {e}")
            return False

    @staticmethod
    def get_all_face_encodings() -> List[Dict[str, Any]]:
        """
        Retrieve all registered students with valid 128D face encodings.
        """
        query = """
            SELECT s.student_id, s.name, s.roll_number, s.department, s.section,
                   COALESCE(fd.face_encoding, s.face_encoding) as face_encoding,
                   fd.image_filename
            FROM students s
            LEFT JOIN face_data fd ON s.student_id = fd.student_id
            WHERE (fd.face_encoding IS NOT NULL AND fd.face_encoding != '')
               OR (s.face_encoding IS NOT NULL AND s.face_encoding != '')
            ORDER BY s.student_id ASC
        """
        return execute_query(query, fetchall=True) or []

    @staticmethod
    def get_student_face_data(student_id: str) -> Optional[Dict[str, Any]]:
        query = "SELECT student_id, image_filename, image_data, face_encoding, created_at FROM face_data WHERE student_id = %s"
        return execute_query(query, (student_id,), fetchone=True)

    @staticmethod
    def delete_face_data(student_id: str) -> bool:
        query = "DELETE FROM face_data WHERE student_id = %s"
        execute_query(query, (student_id,), commit=True)
        execute_query("UPDATE students SET face_encoding = NULL, is_trained = FALSE, face_dataset_count = 0 WHERE student_id = %s", (student_id,), commit=True)
        return True

    @staticmethod
    def has_student_attended_today(student_id: str, attendance_date: str) -> bool:
        student = DatabaseRepository.get_student_by_id(student_id)
        canonical_id = student["student_id"] if student else student_id
        query = 'SELECT id FROM attendance WHERE student_id = %s AND attendance_date = %s'
        row = execute_query(query, (canonical_id, attendance_date), fetchone=True)
        return bool(row)

    @staticmethod
    def insert_attendance_record(
        student_id: str,
        attendance_date: str,
        attendance_time: str,
        status: str,
        face_distance: Optional[float] = None,
        confidence_score: Optional[float] = None,
        ip_address: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        location_accuracy: Optional[float] = None,
        email_status: str = "pending",
        email_message_id: Optional[str] = None
    ) -> Tuple[bool, Optional[Dict[str, Any]]]:
        try:
            score = confidence_score if confidence_score is not None else (
                round((1.0 - face_distance) * 100.0, 1) if face_distance is not None else None
            )
            insert_sql = """
                INSERT INTO attendance (
                    student_id, attendance_date, attendance_time, status,
                    face_distance, confidence_score, ip_address, latitude,
                    longitude, location_accuracy, email_status, email_message_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            new_id = execute_query(
                insert_sql,
                (student_id, attendance_date, attendance_time, status, face_distance, score, ip_address, latitude, longitude, location_accuracy, email_status, email_message_id),
                commit=True
            )
            record = execute_query('SELECT * FROM attendance WHERE id = %s', (new_id,), fetchone=True)
            return True, record
        except Exception as e:
            err_str = str(e)
            if "1062" in err_str or "Duplicate entry" in err_str:
                logger.info(f"Duplicate attendance attempt prevented for {student_id} on {attendance_date}")
            else:
                logger.warning(f'Could not insert attendance for {student_id} on {attendance_date}: {e}')
            return False, None

    @staticmethod
    def update_attendance_email_status(
        attendance_id: int,
        email_status: str,
        email_message_id: Optional[str] = None
    ) -> bool:
        try:
            query = "UPDATE attendance SET email_status = %s, email_message_id = %s WHERE id = %s"
            execute_query(query, (email_status, email_message_id, attendance_id), commit=True)
            return True
        except Exception as e:
            logger.error(f"Error updating email status for attendance record {attendance_id}: {e}")
            return False

    @staticmethod
    def get_student_attendance_stats(student_id: str, attendance_date: Optional[str] = None) -> Dict[str, Any]:
        """
        Compute attendance metrics for a student:
        - today_count: number of attendance records for the student today
        - total_attendance_count: total attendance records ever recorded for this student
        - last_attendance_time: most recent attendance timestamp / time string
        - already_marked_today: True if today_count > 0
        """
        try:
            student = DatabaseRepository.get_student_by_id(student_id)
            canonical_id = student["student_id"] if student else student_id

            if not attendance_date:
                now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
                attendance_date = now_ist.strftime("%Y-%m-%d")

            today_row = execute_query(
                "SELECT COUNT(*) AS cnt FROM attendance WHERE student_id = %s AND attendance_date = %s",
                (canonical_id, attendance_date),
                fetchone=True
            )
            today_count = int(today_row.get("cnt", 0)) if today_row else 0

            total_row = execute_query(
                "SELECT COUNT(*) AS cnt FROM attendance WHERE student_id = %s",
                (canonical_id,),
                fetchone=True
            )
            total_count = int(total_row.get("cnt", 0)) if total_row else 0

            last_row = execute_query(
                "SELECT attendance_date, attendance_time FROM attendance WHERE student_id = %s ORDER BY attendance_date DESC, attendance_time DESC, id DESC LIMIT 1",
                (canonical_id,),
                fetchone=True
            )
            last_time_str = "Not marked"
            if last_row and last_row.get("attendance_time"):
                last_time_str = str(last_row["attendance_time"])

            return {
                "today_count": today_count,
                "total_attendance_count": total_count,
                "last_attendance_time": last_time_str,
                "already_marked_today": today_count > 0,
            }
        except Exception as e:
            logger.error(f"Error calculating attendance stats for student {student_id}: {e}")
            return {
                "today_count": 0,
                "total_attendance_count": 0,
                "last_attendance_time": "Not marked",
                "already_marked_today": False,
            }

repo = DatabaseRepository()
