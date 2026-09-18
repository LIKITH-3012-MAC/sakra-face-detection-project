from typing import Optional, List, Union
from datetime import date, time, datetime, timedelta
from enum import Enum
from pydantic import BaseModel, Field, ConfigDict, field_validator

class AttendanceStatus(str, Enum):
    PRESENT = "Present"
    LATE = "Late"
    ABSENT = "Absent"

class AttendanceMarkRequest(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=50, description="Student ID to mark attendance for")
    status: Optional[AttendanceStatus] = Field(None, description="Present or Late (if omitted, evaluated via cutoff time)")
    attendance_date: Optional[date] = Field(None, description="Date (defaults to today)")
    attendance_time: Optional[Union[time, str]] = Field(None, description="Time (defaults to current time)")
    confidence_score: Optional[float] = Field(None, ge=0.0, le=100.0, description="Face recognition confidence score")
    face_distance: Optional[float] = Field(None, ge=0.0, le=2.0, description="Face recognition Euclidean distance")
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0, description="Client GPS latitude")
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0, description="Client GPS longitude")
    location_accuracy: Optional[float] = Field(None, ge=0.0, le=10000.0, description="Client GPS accuracy in meters")

class AttendanceRecordResponse(BaseModel):
    id: int
    student_id: str
    name: Optional[str] = None
    roll_number: Optional[str] = None
    department: Optional[str] = None
    section: Optional[str] = None
    attendance_date: date
    attendance_time: Union[time, str]
    status: str
    confidence_score: Optional[float] = None
    face_distance: Optional[float] = None
    ip_address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_accuracy: Optional[float] = None
    today_count: Optional[int] = None
    total_attendance_count: Optional[int] = None
    last_attendance_time: Optional[str] = None
    timezone: Optional[str] = None
    email_notification: Optional[str] = None
    email_status: Optional[str] = None
    email_message_id: Optional[str] = None
    created_at: Optional[datetime] = None

    @field_validator("attendance_time", mode="before")
    @classmethod
    def serialize_attendance_time(cls, v):
        if isinstance(v, timedelta):
            total_seconds = int(v.total_seconds())
            hours = (total_seconds // 3600) % 24
            minutes = (total_seconds % 3600) // 60
            seconds = total_seconds % 60
            return time(hours, minutes, seconds)
        return v

    model_config = ConfigDict(from_attributes=True)

class DashboardStats(BaseModel):
    total_students: int
    present_today: int
    absent_today: int
    late_today: int
    attendance_percentage: float
    today_date: str
    active_cutoff_time: str

class SystemSettingsSchema(BaseModel):
    cutoff_time: str
    recognition_threshold: float
    min_dataset_images: int
    auto_mark_enabled: bool
