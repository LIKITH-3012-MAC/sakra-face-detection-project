import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Camera,
  UserPlus,
  RefreshCw,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import StatCard from '../components/StatCard';
import { getDashboardStats, getTodayAttendance } from '../services/api';
import { formatDate, formatTime, getStatusBadge } from '../utils/formatters';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [todayRecords, setTodayRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, attendanceRes] = await Promise.all([
        getDashboardStats(),
        getTodayAttendance()
      ]);
      setStats(statsRes.data);
      setTodayRecords(attendanceRes.data || []);
    } catch (err) {
      setError(err.message || 'Failed to connect to backend server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Smart Attendance Dashboard</h1>
          <p className="page-subtitle">
            Real-time biometric attendance tracking and college classroom analytics
          </p>
        </div>
        <div className="admin-header-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={fetchDashboardData}
            className="btn btn-secondary"
            title="Refresh statistics"
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            Refresh
          </button>
          <Link to="/admin/live-attendance" className="btn btn-primary">
            <Camera size={16} />
            Start Live Camera
          </Link>
        </div>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          color: '#991b1b',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <ShieldAlert size={20} />
          <div>
            <p style={{ fontWeight: 600 }}>Backend Connection Notice</p>
            <p style={{ fontSize: '0.8125rem' }}>{error}</p>
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="stats-grid">
        <StatCard
          title="Total Registered Students"
          value={stats?.total_students ?? 0}
          icon={Users}
          color="primary"
          subtext="Enrolled in computer vision registry"
        />
        <StatCard
          title="Present Today"
          value={stats?.present_today ?? 0}
          icon={CheckCircle2}
          color="success"
          subtext={`Includes on-time arrivals`}
        />
        <StatCard
          title="Absent Today"
          value={stats?.absent_today ?? 0}
          icon={XCircle}
          color="danger"
          subtext="Unrecorded or absent students"
        />
        <StatCard
          title="Today's Attendance Rate"
          value={`${stats?.attendance_percentage ?? 0}%`}
          icon={TrendingUp}
          color="warning"
          subtext={`Cutoff: ${stats?.active_cutoff_time || '09:30 AM'}`}
        />
      </div>

      {/* Quick Launch Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        gap: '1.25rem',
        marginBottom: '1.75rem'
      }}>
        <div className="card" style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
          color: 'white'
        }}>
          <h3 style={{ color: 'white', marginBottom: '0.5rem' }}>Live Camera Attendance</h3>
          <p style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '1.25rem' }}>
            Launch the live camera for continuous multi-face detection, instant identification, and automated attendance.
          </p>
          <Link
            to="/admin/live-attendance"
            className="btn"
            style={{ backgroundColor: 'white', color: '#4f46e5', fontWeight: 700 }}
          >
            Launch Camera Feed <ArrowRight size={16} />
          </Link>
        </div>

        <div className="card" style={{
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <h3 style={{ marginBottom: '0.5rem' }}>New Student Registration</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Register new student profiles and enroll reference photos for automated biometric verification.
            </p>
          </div>
          <div style={{ marginTop: '1.25rem' }}>
            <Link to="/admin/register-student" className="btn btn-secondary">
              <UserPlus size={16} /> Enroll New Student
            </Link>
          </div>
        </div>
      </div>

      {/* Today's Attendance Table */}
      <div className="card">
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <div>
            <h3 style={{ fontSize: '1.125rem' }}>Today's Live Attendance Stream</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Real-time records marked today ({formatDate(stats?.today_date || new Date().toISOString())})
            </p>
          </div>
          <Link to="/admin/attendance" style={{ fontSize: '0.8125rem', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
            View Full History →
          </Link>
        </div>

        {/* Desktop Table View (>= 768px) */}
        <div className="desktop-table-view">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Roll Number</th>
                  <th>Department</th>
                  <th>Section</th>
                  <th>Marked Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      Loading attendance records...
                    </td>
                  </tr>
                ) : todayRecords.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                        <Clock size={32} color="var(--text-muted)" />
                        <p style={{ fontWeight: 600 }}>No attendance marked today yet</p>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                          Start the live camera or manually mark attendance
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  todayRecords.slice(0, 8).map((record) => {
                    const badge = getStatusBadge(record.status);
                    return (
                      <tr key={record.id}>
                        <td className="code-font">{record.student_id}</td>
                        <td style={{ fontWeight: 600 }}>{record.name}</td>
                        <td>{record.roll_number}</td>
                        <td>{record.department}</td>
                        <td>{record.section}</td>
                        <td>{formatTime(record.attendance_time)}</td>
                        <td>
                          <span className={badge.className}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Card List (< 768px) */}
        <div className="mobile-card-list">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
              Loading attendance records...
            </div>
          ) : todayRecords.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)' }}>
              <Clock size={28} color="var(--text-muted)" style={{ margin: '0 auto 0.5rem auto' }} />
              <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>No attendance marked today yet</p>
            </div>
          ) : (
            todayRecords.slice(0, 8).map((record) => {
              const badge = getStatusBadge(record.status);
              return (
                <div key={record.id} className="mobile-card-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--text-main)' }}>
                      {record.name}
                    </span>
                    <span className={badge.className}>
                      {badge.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <span>Roll No: <strong style={{ color: 'var(--text-main)' }}>{record.roll_number}</strong></span>
                    <span>{formatTime(record.attendance_time)}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {record.department} (Sec {record.section}) • ID: <span className="code-font">{record.student_id}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Privacy Notice Banner */}
      <div className="privacy-banner">
        <span>🔒</span>
        <span>
          <strong>Biometric Data Notice:</strong> Face images and vector representations are collected strictly for academic identification purposes within this demonstration and are never distributed publicly.
        </span>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .admin-header-actions {
            width: 100%;
          }
          .admin-header-actions > * {
            flex: 1 1 auto;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
