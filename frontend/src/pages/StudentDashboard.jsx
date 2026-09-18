import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  GraduationCap,
  CalendarCheck,
  Clock,
  Camera,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowUpRight,
  Sparkles,
  MapPin
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getStudentProfile, getStudentAttendance } from '../services/api';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [profileData, setProfileData] = useState(null);
  const [recentAttendance, setRecentAttendance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStudentData = async () => {
      try {
        setLoading(true);
        const res = await getStudentProfile();
        if (res?.data) {
          setProfileData(res.data);
          const studentId = res.data.student?.student_id;
          if (studentId && studentId !== 'N/A') {
            const attRes = await getStudentAttendance(studentId);
            if (attRes?.data) {
              setRecentAttendance(attRes.data.slice(0, 10));
            }
          }
        }
      } catch (err) {
        console.error('Failed to load student portal data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadStudentData();
  }, []);

  const student = profileData?.student || {};
  const stats = profileData?.stats || {};
  const pct = stats.attendance_percentage ?? 0.0;
  const isPresentToday = stats.present_today > 0 || stats.late_today > 0;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '2rem' }}>
      {/* Student Greeting Banner */}
      <div className="student-greeting-banner" style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
        borderRadius: 'var(--radius-lg)',
        padding: '2rem',
        color: '#ffffff',
        marginBottom: '2rem',
        boxShadow: '0 10px 25px -5px rgba(30, 58, 138, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', minWidth: 0, flex: '1 1 300px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.75rem',
            fontWeight: 800,
            flexShrink: 0
          }}>
            {student.name ? student.name.charAt(0).toUpperCase() : 'S'}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#bfdbfe', fontWeight: 700 }}>
                Academic Student Portal
              </span>
              {student.is_trained && (
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.5rem',
                  borderRadius: '9999px',
                  backgroundColor: '#10b981',
                  color: '#ffffff'
                }}>
                  Biometric Face Enrolled
                </span>
              )}
            </div>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 800, margin: '0 0 0.25rem 0', wordBreak: 'break-word' }}>
              {student.name || user?.full_name || 'Student'}
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#dbeafe', margin: 0, wordBreak: 'break-word' }}>
              Roll No: <strong>{student.roll_number || user?.roll_number || 'N/A'}</strong> • {student.department || 'Computer Science'} • {student.year || '4th Year'} (Sec {student.section || 'A'})
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/student/live-attendance')}
          className="btn student-banner-btn"
          style={{
            backgroundColor: '#ffffff',
            color: '#1e3a8a',
            fontWeight: 700,
            fontSize: '0.9rem',
            padding: '0.75rem 1.5rem',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}
        >
          <Camera size={18} />
          <span>Take Live Attendance</span>
          <ArrowUpRight size={16} />
        </button>
      </div>

      {/* Metrics Row */}
      <div className="student-metrics-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.25rem',
        marginBottom: '2rem'
      }}>
        {/* Today's Status */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          padding: '1.5rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Today's Status</span>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: isPresentToday ? 'var(--success-bg)' : 'var(--danger-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isPresentToday ? '#059669' : '#dc2626'
            }}>
              {isPresentToday ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: isPresentToday ? '#059669' : 'var(--text-main)' }}>
            {isPresentToday ? 'Present' : 'Not Marked Yet'}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem', margin: 0 }}>
            {isPresentToday ? 'Logged via Biometric Verification' : 'Open camera to mark attendance today'}
          </p>
        </div>

        {/* Overall Percentage */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          padding: '1.5rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Attendance Rate</span>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: pct >= 75 ? 'var(--success-bg)' : '#fef3c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: pct >= 75 ? '#059669' : '#d97706'
            }}>
              <GraduationCap size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: pct >= 75 ? 'var(--primary)' : '#d97706' }}>
            {pct.toFixed(1)}%
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem', margin: 0 }}>
            {pct >= 75 ? 'Meets eligibility requirement (≥75%)' : 'Below 75% target'}
          </p>
        </div>

        {/* Total Attended Classes */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          padding: '1.5rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Attended</span>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'var(--primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)'
            }}>
              <CalendarCheck size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>
            {stats.total_attendance_count ?? 0}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem', margin: 0 }}>
            Total valid attendances recorded
          </p>
        </div>

        {/* Last Attendance Time */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          padding: '1.5rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Last Record</span>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)'
            }}>
              <Clock size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
            {stats.last_attendance_time || 'N/A'}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem', margin: 0 }}>
            IST Timezone Timestamp
          </p>
        </div>
      </div>

      {/* Recent Attendance Logs Table */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        padding: '1.5rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              My Attendance History
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
              Confirmed biometric attendance entries recorded
            </p>
          </div>
          <button
            onClick={() => navigate('/student/attendance')}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', fontWeight: 600 }}
          >
            View All Records →
          </button>
        </div>

        {recentAttendance.length === 0 ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <CalendarCheck size={40} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4 }} />
            <p style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>No attendance records found</p>
            <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Your biometric attendance records will appear here as soon as you are recognized on camera.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View (>= 768px) */}
            <div className="desktop-table-view" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Time (IST)</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Verification</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAttendance.map((rec) => (
                    <tr key={rec.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                        {rec.attendance_date}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                        {rec.attendance_time}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          padding: '0.2rem 0.6rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: rec.status === 'Present' ? 'var(--success-bg)' : '#fef3c7',
                          color: rec.status === 'Present' ? '#065f46' : '#92400e'
                        }}>
                          {rec.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Verified</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#2563eb' }}>
                          <MapPin size={13} />
                          <span>Location Verified</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List (< 768px) */}
            <div className="mobile-card-list">
              {recentAttendance.map((rec) => (
                <div key={rec.id} className="mobile-card-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                      {rec.attendance_date}
                    </span>
                    <span style={{
                      padding: '0.15rem 0.55rem',
                      borderRadius: '9999px',
                      fontSize: '0.725rem',
                      fontWeight: 700,
                      backgroundColor: rec.status === 'Present' ? 'var(--success-bg)' : '#fef3c7',
                      color: rec.status === 'Present' ? '#065f46' : '#92400e'
                    }}>
                      {rec.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <span>Time: <strong style={{ color: 'var(--text-main)' }}>{rec.attendance_time}</strong></span>
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                      ✓ Verified
                    </span>
                  </div>
                  {rec.latitude && rec.longitude ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#2563eb' }}>
                      <MapPin size={13} />
                      <span>Location Verified</span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .student-greeting-banner {
            padding: 1.25rem !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 1.25rem !important;
          }
          .student-banner-btn {
            width: 100% !important;
            justify-content: center !important;
          }
          .student-metrics-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 0.75rem !important;
          }
        }
        @media (max-width: 480px) {
          .student-metrics-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
