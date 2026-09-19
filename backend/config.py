import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Base backend directory
BASE_DIR = Path(__file__).resolve().parent

os.environ["OPENCV_AVFOUNDATION_SKIP_AUTH"] = "1"

import sys

# Support external python packages if installed in anaconda site-packages
for extra_path in ["/opt/anaconda3/lib/python3.13/site-packages", "/opt/homebrew/lib/python3.13/site-packages"]:
    if os.path.exists(extra_path) and extra_path not in sys.path:
        sys.path.insert(0, extra_path)

class Settings(BaseSettings):
    # Cloud MySQL Database Settings (Loaded from backend/.env)
    DB_HOST: str = ""
    DB_PORT: int = 3306
    DB_NAME: str = "smart_attendance"
    DB_USER: str = ""
    DB_PASSWORD: str = ""
    DB_SSL_DISABLED: bool = False
    DB_POOL_NAME: str = "attendance_pool"
    DB_POOL_SIZE: int = 5

    # Face Quality & Capture Validation
    MIN_FACE_WIDTH: int = 70
    MIN_FACE_HEIGHT: int = 70
    MIN_BRIGHTNESS: float = 30.0
    MAX_BRIGHTNESS: float = 235.0
    MIN_BLUR_VARIANCE: float = 10.0

    # 128-D Face Recognition Parameters
    FACE_ENCODING_TOLERANCE: float = 0.50
    FACE_RECOGNITION_DEBUG: bool = True
    MIN_STABLE_RECOGNITIONS: int = 3

    # Camera Index for server streaming
    CAMERA_INDEX: int = 0

    # Attendance Policy
    ATTENDANCE_CUTOFF_TIME: str = "09:30:00"

    # CORS & Server
    FRONTEND_URL: str = "https://lens.sakra-vision.online"
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Resend Email Configuration (Loaded from backend/.env)
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "Sakra-Lens <noreply@yourdomain.com>"
    TIMEZONE: str = "Asia/Kolkata"

    # Security & Production Settings
    ENVIRONMENT: str = "development"
    JWT_SECRET: str = "sakra_lens_production_super_jwt_secret_key_2026"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 24
    OTP_EXPIRATION_MINUTES: int = 3
    MAX_OTP_ATTEMPTS: int = 5
    MAX_REQUEST_SIZE_BYTES: int = 10 * 1024 * 1024  # 10MB
    # Attendance & Recognition Threshold Settings
    FACE_RECOGNITION_THRESHOLD: float = 65.0
    MIN_DATASET_IMAGES: int = 25

    COOKIE_SECURE: bool = False
    INITIAL_ADMIN_PASSWORD: str = "Sakra"

    # API Master Passkey (server-side only)
    API_MASTER_PASSKEY: str = "Mom"
    API_PASSKEY_HEADER: str = "X-API-Passkey"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

