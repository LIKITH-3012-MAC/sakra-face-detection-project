import React, { useState, useEffect } from 'react';
import {
  CalendarCheck,
  Search,
  Download,
  Filter,
  RefreshCw,
  PlusCircle,
  Calendar
} from 'lucide-react';
import {
  getAttendance,
  markAttendance,
  getExportCsvUrl
} from '../services/api';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import { formatDate, formatTime, getStatusBadge } from '../utils/formatters';

export default function Attendance() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [search, setSearch] = useState('');

  // Manual Mark Modal
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualData, setManualData] = useState({
    student_id: '',
    status: 'Present',
    attendance_date: new Date().toISOString().split('T')[0],
  });
  const [submittingManual, setSubmittingManual] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadAttendance = async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateFilter) params.attendance_date = dateFilter;
      if (statusFilter) params.status = statusFilter;
      if (departmentFilter) params.department = departmentFilter;
      if (search) params.search = search;

      const res = await getAttendance(params);
      setRecords(res.data || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendance();
  }, [dateFilter, statusFilter, departmentFilter]);

  const handleSearch = (e) => {
    e.preventDefault();
    loadAttendance();
  };

  const handleManualMarkSubmit = async (e) => {
    e.preventDefault();
    if (!manualData.student_id.trim()) {
      showToast('Student ID is required', 'error');
      return;
    }
    setSubmittingManual(true);
    try {
      const res = await markAttendance(manualData);
      showToast(res.message, res.success ? 'success' : 'info');
      setIsManualModalOpen(false);
      setManualData({
        student_id: '',
        status: 'Present',
        attendance_date: new Date().toISOString().split('T')[0],
      });
      loadAttendance();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmittingManual(false);
    }
  };

  const handleExportCsv = () => {
    const url = getExportCsvUrl('attendance', {
      report_date: dateFilter,
      department: departmentFilter
    });
    window.open(url, '_blank');
  };

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Records</h1>
          <p className="page-subtitle">
            Master database logs of biometric classroom attendances with duplicate protection
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => setIsManualModalOpen(true)} className="btn btn-secondary">
            <PlusCircle size={16} /> Manual Mark
          </button>
          <button onClick={handleExportCsv} className="btn btn-secondary">
            <Download size={16} /> Export CSV
          </button>
          <button onClick={loadAttendance} className="btn btn-primary">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '220px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search student name or roll..."
              className="form-control"
              style={{ paddingLeft: '2.25rem' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-secondary">Search</button>
        </form>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', width: '100%' }}>
          <input
            type="date"
            className="form-control"
            style={{ flex: '1 1 140px', minWidth: '130px' }}
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            title="Filter by Specific Date"
          />

          <select
            className="form-select"
            style={{ flex: '1 1 130px', minWidth: '120px' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="Present">Present</option>
            <option value="Late">Late</option>
            <option value="Absent">Absent</option>
          </select>

          <select
            className="form-select"
            style={{ flex: '1 1 150px', minWidth: '140px' }}
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
          >
            <option value="">All Departments</option>
            <option value="Computer Science">Computer Science</option>
            <option value="Information Technology">Information Tech</option>
            <option value="Electronics & Communication">ECE</option>
            <option value="Mechanical Engineering">Mechanical</option>
          </select>

          {(dateFilter || statusFilter || departmentFilter || search) && (
            <button
              onClick={() => {
                setDateFilter('');
                setStatusFilter('');
                setDepartmentFilter('');
                setSearch('');
              }}
              className="btn btn-secondary"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Attendance Records */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Desktop Table View (>= 768px) */}
        <div className="desktop-table-view">
          <div className="table-container" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Roll Number</th>
                  <th>Department</th>
                  <th>Class Date</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      Loading attendance records...
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                      <CalendarCheck size={36} style={{ opacity: 0.4, margin: '0 auto 0.5rem' }} />
                      <p style={{ fontWeight: 600 }}>No attendance records found</p>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        Try adjusting the date filters or start the live camera.
                      </p>
                    </td>
                  </tr>
                ) : (
                  records.map((rec) => {
                    const badge = getStatusBadge(rec.status);
                    return (
                      <tr key={rec.id}>
                        <td className="code-font" style={{ fontWeight: 700 }}>
                          {rec.student_id}
                        </td>
                        <td style={{ fontWeight: 600 }}>{rec.name}</td>
                        <td>{rec.roll_number}</td>
                        <td>{rec.department} ({rec.section})</td>
                        <td>{formatDate(rec.attendance_date)}</td>
                        <td>{formatTime(rec.attendance_time)}</td>
                        <td>
                          <span className={badge.className}>
                            {badge.label}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                          {rec.confidence_score != null && !isNaN(Number(rec.confidence_score))
                            ? `${Number(rec.confidence_score).toFixed(1)}%`
                            : (rec.face_distance != null && !isNaN(Number(rec.face_distance))
                                ? `${Number(rec.face_distance).toFixed(2)} dist`
                                : 'Manual')}
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
        <div className="mobile-card-list" style={{ padding: '0.85rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              Loading attendance records...
            </div>
          ) : records.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              <CalendarCheck size={36} style={{ opacity: 0.4, margin: '0 auto 0.5rem' }} />
              <p style={{ fontWeight: 600 }}>No attendance records found</p>
            </div>
          ) : (
            records.map((rec) => {
              const badge = getStatusBadge(rec.status);
              return (
                <div key={rec.id} className="mobile-card-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                      {rec.name}
                    </span>
                    <span className={badge.className}>
                      {badge.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <span>Roll: <strong style={{ color: 'var(--text-main)' }}>{rec.roll_number}</strong></span>
                    <span>{formatDate(rec.attendance_date)} • {formatTime(rec.attendance_time)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <span>{rec.department} ({rec.section})</span>
                    <span>
                      {rec.confidence_score != null && !isNaN(Number(rec.confidence_score))
                        ? `${Number(rec.confidence_score).toFixed(1)}%`
                        : (rec.face_distance != null && !isNaN(Number(rec.face_distance))
                            ? `${Number(rec.face_distance).toFixed(2)} dist`
                            : 'Manual')}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* MANUAL MARK MODAL */}
      <Modal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        title="Manual Attendance Override"
        footer={(
          <>
            <button onClick={() => setIsManualModalOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button onClick={handleManualMarkSubmit} className="btn btn-primary" disabled={submittingManual}>
              {submittingManual ? 'Marking...' : 'Confirm Attendance'}
            </button>
          </>
        )}
      >
        <form onSubmit={handleManualMarkSubmit}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            Manually record attendance for a student if their camera detection was exempted or for administrative adjustment.
          </p>

          <div className="form-group">
            <label className="form-label">Student ID *</label>
            <input
              type="text"
              className="form-control"
              placeholder="Enter student ID"
              value={manualData.student_id}
              onChange={(e) => setManualData({ ...manualData, student_id: e.target.value })}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Attendance Date</label>
              <input
                type="date"
                className="form-control"
                value={manualData.attendance_date}
                onChange={(e) => setManualData({ ...manualData, attendance_date: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={manualData.status}
                onChange={(e) => setManualData({ ...manualData, status: e.target.value })}
              >
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Absent">Absent</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
