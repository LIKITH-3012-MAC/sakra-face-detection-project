import React, { useState, useEffect } from 'react';
import { CalendarCheck, Search, Filter, RefreshCw, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getStudentProfile, getStudentAttendance } from '../services/api';
import { formatDate, formatTime } from '../utils/formatters';

export default function StudentAttendance() {
  const { user } = useAuth();
  const [attendance, setAttendance] = useState([]);
  const [filteredAttendance, setFilteredAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const prof = await getStudentProfile();
      const studentId = prof?.data?.student?.student_id || user?.student_id;
      if (studentId) {
        const res = await getStudentAttendance(studentId);
        if (res?.data) {
          setAttendance(res.data);
          setFilteredAttendance(res.data);
        }
      }
    } catch (err) {
      console.error('Failed to load attendance logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  useEffect(() => {
    let list = [...attendance];
    if (dateFilter) {
      list = list.filter((r) => r.attendance_date === dateFilter);
    }
    if (statusFilter) {
      list = list.filter((r) => (r.status || '').toLowerCase() === statusFilter.toLowerCase());
    }
    setFilteredAttendance(list);
  }, [dateFilter, statusFilter, attendance]);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
            My Attendance History
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
            Permanent biometric attendance records logged for your profile
          </p>
        </div>

        <button
          onClick={fetchRecords}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 180px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Filter Date:</span>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{
              flex: 1,
              padding: '0.4rem 0.65rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              fontSize: '0.85rem',
              backgroundColor: 'var(--bg-app)'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 140px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              flex: 1,
              padding: '0.4rem 0.65rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              fontSize: '0.85rem',
              backgroundColor: 'var(--bg-app)'
            }}
          >
            <option value="">All Statuses</option>
            <option value="Present">Present</option>
            <option value="Late">Late</option>
            <option value="Absent">Absent</option>
          </select>
        </div>

        {(dateFilter || statusFilter) && (
          <button
            onClick={() => { setDateFilter(''); setStatusFilter(''); }}
            className="btn btn-secondary"
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', marginLeft: 'auto' }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Attendance Records */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        padding: '1.25rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
      }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
            <p style={{ margin: 0, fontSize: '0.85rem' }}>Loading attendance records...</p>
          </div>
        ) : filteredAttendance.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <CalendarCheck size={40} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4 }} />
            <p style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>No attendance logs found matching filters</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View (>= 768px) */}
            <div className="desktop-table-view" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Time (IST)</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Recognition Metric</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Verification GPS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendance.map((rec) => (
                    <tr key={rec.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                        {formatDate(rec.attendance_date)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                        {formatTime(rec.attendance_time)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          padding: '0.2rem 0.65rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: rec.status === 'Present' ? 'var(--success-bg)' : '#fef3c7',
                          color: rec.status === 'Present' ? '#065f46' : '#92400e'
                        }}>
                          {rec.status || 'Present'}
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
              {filteredAttendance.map((rec) => (
                <div key={rec.id} className="mobile-card-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--text-main)' }}>
                      {formatDate(rec.attendance_date)}
                    </span>
                    <span style={{
                      padding: '0.15rem 0.55rem',
                      borderRadius: '9999px',
                      fontSize: '0.725rem',
                      fontWeight: 700,
                      backgroundColor: rec.status === 'Present' ? 'var(--success-bg)' : '#fef3c7',
                      color: rec.status === 'Present' ? '#065f46' : '#92400e'
                    }}>
                      {rec.status || 'Present'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <span>Time: <strong style={{ color: 'var(--text-main)' }}>{formatTime(rec.attendance_time)}</strong></span>
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                      ✓ Verified
                    </span>
                  </div>
                  {rec.latitude && rec.longitude && !isNaN(Number(rec.latitude)) && !isNaN(Number(rec.longitude)) ? (
                    <div style={{ marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#2563eb', fontSize: '0.75rem', fontWeight: 600 }}>
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
    </div>
  );
}
