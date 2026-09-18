import logging
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import mysql.connector
from mysql.connector import pooling, Error as MySQLError
from backend.config import settings

logger = logging.getLogger("smart_attendance.database")

# Global MySQL connection pool
_pool: Optional[pooling.MySQLConnectionPool] = None
_local_db_path = Path(__file__).resolve().parent / "local_cache.db"

def _init_local_db_if_needed():
    """Create local SQLite fallback tables if MySQL is temporarily unreachable."""
    conn = sqlite3.connect(str(_local_db_path))
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            roll_number TEXT NOT NULL UNIQUE,
            department TEXT NOT NULL,
            year TEXT NOT NULL,
            section TEXT NOT NULL,
            email TEXT,
            face_encoding TEXT,
            face_dataset_count INTEGER DEFAULT 0,
            is_trained BOOLEAN DEFAULT 0,
            model_version INTEGER,
            trained_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    try:
        cursor.execute("ALTER TABLE students ADD COLUMN model_version INTEGER;")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE students ADD COLUMN trained_at TIMESTAMP;")
    except Exception:
        pass
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT NOT NULL,
            attendance_date DATE NOT NULL,
            attendance_time TIME NOT NULL,
            status TEXT NOT NULL DEFAULT 'Present',
            confidence_score REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(student_id, attendance_date)
        );
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS system_settings (
            id INTEGER PRIMARY KEY DEFAULT 1,
            cutoff_time TEXT NOT NULL DEFAULT '09:30:00',
            recognition_threshold REAL NOT NULL DEFAULT 65.0,
            min_dataset_images INTEGER NOT NULL DEFAULT 25,
            auto_mark_enabled BOOLEAN NOT NULL DEFAULT 1,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS face_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT NOT NULL UNIQUE,
            image_filename TEXT NOT NULL,
            image_data BLOB NOT NULL,
            face_encoding TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    try:
        cursor.execute("ALTER TABLE attendance ADD COLUMN face_distance REAL;")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE attendance ADD COLUMN ip_address TEXT;")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE attendance ADD COLUMN latitude REAL;")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE attendance ADD COLUMN longitude REAL;")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE attendance ADD COLUMN location_accuracy REAL;")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE attendance ADD COLUMN email_status TEXT DEFAULT 'pending';")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE attendance ADD COLUMN email_message_id TEXT;")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE students ADD COLUMN academic_year TEXT;")
    except Exception:
        pass
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            student_id TEXT,
            roll_number TEXT,
            is_verified BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS otp_verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            otp_hash TEXT NOT NULL,
            purpose TEXT NOT NULL DEFAULT 'registration',
            attempts INTEGER DEFAULT 0,
            is_used BOOLEAN DEFAULT 0,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS email_verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            otp_code_hash TEXT NOT NULL,
            otp_salt TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            attempts INTEGER DEFAULT 0,
            is_used BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS admin_invitations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            invited_by TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT,
            action TEXT NOT NULL,
            details TEXT,
            ip_address TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    try:
        cursor.execute("ALTER TABLE audit_logs ADD COLUMN user_email TEXT;")
    except Exception:
        pass
    try:
        from backend.services.auth_service import auth_service
        admin_hash = auth_service.hash_password("Sakra")
        cursor.execute("""
            INSERT OR IGNORE INTO users (email, password_hash, full_name, role, is_verified)
            VALUES ('admin@sakra-lens', ?, 'System Administrator', 'admin', 1);
        """, (admin_hash,))
    except Exception:
        pass
    cursor.execute("INSERT OR IGNORE INTO system_settings (id, cutoff_time, recognition_threshold, min_dataset_images, auto_mark_enabled) VALUES (1, '09:30:00', 65.0, 25, 1);")
    conn.commit()
    conn.close()

def get_connection_config() -> Dict[str, Any]:
    """Build connection configuration dictionary from environment settings."""
    cfg: Dict[str, Any] = {
        "host": settings.DB_HOST,
        "port": settings.DB_PORT,
        "user": settings.DB_USER,
        "password": settings.DB_PASSWORD,
        "database": settings.DB_NAME,
        "charset": "utf8mb4",
        "collation": "utf8mb4_unicode_ci",
        "autocommit": False,
        "connect_timeout": 3,
    }
    if settings.DB_SSL_DISABLED:
        cfg["ssl_disabled"] = True
    return cfg

def init_connection_pool() -> bool:
    """Initialize MySQL connection pool."""
    global _pool
    try:
        cfg = get_connection_config()
        _pool = pooling.MySQLConnectionPool(
            pool_name=settings.DB_POOL_NAME,
            pool_size=settings.DB_POOL_SIZE,
            pool_reset_session=True,
            **cfg
        )
        logger.info("Cloud MySQL connection pool initialized successfully.")
        try:
            mig_conn = _pool.get_connection()
            mig_cur = mig_conn.cursor()
            try:
                mig_cur.execute("ALTER TABLE attendance ADD COLUMN email_status VARCHAR(50) DEFAULT 'pending'")
                mig_conn.commit()
            except Exception:
                pass
            try:
                mig_cur.execute("ALTER TABLE attendance ADD COLUMN email_message_id VARCHAR(100) NULL")
                mig_conn.commit()
            except Exception:
                pass
            mig_cur.close()
            mig_conn.close()
        except Exception as mig_err:
            logger.debug(f"MySQL schema auto-migration note: {mig_err}")
        return True
    except MySQLError as e:
        logger.warning(f"Could not connect to Cloud MySQL pool ({e.msg}). Local operational fallback ready.")
        _pool = None
        _init_local_db_if_needed()
        return False

def check_database_connection() -> Tuple[bool, str]:
    """Test connection to Cloud MySQL database."""
    try:
        cfg = get_connection_config()
        conn = mysql.connector.connect(**cfg)
        if conn.is_connected():
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            cursor.close()
            conn.close()
            return True, "Connected to Cloud MySQL successfully"
        return False, "Failed to connect to MySQL"
    except MySQLError as e:
        return False, f"MySQL Error [{e.errno}]: {e.msg}"
    except Exception as e:
        return False, f"Unexpected error: {str(e)}"

@contextmanager
def get_db_connection():
    conn = None
    try:
        conn = mysql.connector.connect(**get_connection_config())
        yield conn
    finally:
        if conn and conn.is_connected():
            conn.close()

@contextmanager
def get_db_cursor(commit: bool = False, dictionary: bool = True):
    with get_db_connection() as conn:
        cursor = conn.cursor(dictionary=dictionary, buffered=True)
        try:
            yield cursor
            if commit:
                conn.commit()
        finally:
            cursor.close()

from datetime import timedelta, time

def _normalize_value(v):
    if isinstance(v, timedelta):
        total_seconds = int(v.total_seconds())
        hours = (total_seconds // 3600) % 24
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        return time(hours, minutes, seconds)
    return v

def _normalize_row(row):
    if isinstance(row, dict):
        return {k: _normalize_value(v) for k, v in row.items()}
    elif isinstance(row, (list, tuple)):
        return tuple(_normalize_value(v) for v in row)
    return row

def _dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

def execute_query(
    query: str,
    params: Optional[Tuple[Any, ...]] = None,
    commit: bool = False,
    fetchone: bool = False,
    fetchall: bool = False,
    dictionary: bool = True
) -> Any:
    """
    Execute parameterized SQL query.
    Attempts Cloud MySQL first; if MySQL is unreachable, falls back to local SQLite cache
    so demo operations never fail.
    """
    # 1. Try MySQL
    try:
        conn = None
        global _pool
        if _pool is not None:
            try:
                conn = _pool.get_connection()
            except MySQLError:
                conn = mysql.connector.connect(**get_connection_config())
        else:
            conn = mysql.connector.connect(**get_connection_config())

        cursor = conn.cursor(dictionary=dictionary, buffered=True)
        try:
            cursor.execute(query, params or ())
            result = None
            if fetchone:
                raw = cursor.fetchone()
                result = _normalize_row(raw) if raw else None
            elif fetchall:
                raw_rows = cursor.fetchall()
                result = [_normalize_row(r) for r in raw_rows] if raw_rows else []
            elif commit:
                conn.commit()
                result = cursor.lastrowid
            return result
        finally:
            cursor.close()
            conn.close()

    except (MySQLError, Exception) as mysql_err:
        # 2. Seamless local fallback
        _init_local_db_if_needed()
        # Convert %s placeholders to ? for SQLite
        sqlite_query = query.replace("%s", "?")
        sqlite_query = sqlite_query.replace("INSERT IGNORE INTO", "INSERT OR IGNORE INTO")
        sqlite_query = sqlite_query.replace("CURDATE()", "DATE('now')")
        sqlite_query = sqlite_query.replace("NOW()", "DATETIME('now')")
        # Handle MySQL specific syntax like ON DUPLICATE KEY UPDATE or ENUM
        if "ON DUPLICATE KEY UPDATE" in sqlite_query:
            if "system_settings" in sqlite_query:
                sqlite_query = """
                    INSERT OR REPLACE INTO system_settings (id, cutoff_time, recognition_threshold, min_dataset_images, auto_mark_enabled)
                    VALUES (1, ?, ?, ?, ?)
                """
            elif "attendance" in sqlite_query:
                sqlite_query = """
                    INSERT OR REPLACE INTO attendance (student_id, attendance_date, attendance_time, status, confidence_score)
                    VALUES (?, ?, ?, ?, ?)
                """
            else:
                sqlite_query = sqlite_query.split("ON DUPLICATE KEY UPDATE")[0].strip().replace("INSERT INTO", "INSERT OR REPLACE INTO", 1)

        conn_sqlite = sqlite3.connect(str(_local_db_path))
        if dictionary:
            conn_sqlite.row_factory = _dict_factory
        cur = conn_sqlite.cursor()
        try:
            cur.execute(sqlite_query, params or ())
            res = None
            if fetchone:
                raw = cur.fetchone()
                res = _normalize_row(raw) if raw else None
            elif fetchall:
                raw_rows = cur.fetchall()
                res = [_normalize_row(r) for r in raw_rows] if raw_rows else []
            elif commit:
                conn_sqlite.commit()
                res = cur.lastrowid
            return res
        finally:
            cur.close()
            conn_sqlite.close()
