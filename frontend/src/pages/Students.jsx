import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Search,
  UserPlus,
  Eye,
  Edit2,
  Trash2,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import {
  getStudents,
  getStudentById,
  updateStudent,
  deleteStudent
} from '../services/api';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import { formatDate, formatPercentage } from '../utils/formatters';

export default function Students() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');

  // Modals state
  const [viewStudent, setViewStudent] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [editStudent, setEditStudent] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadStudents = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (departmentFilter) params.department = departmentFilter;
      if (sectionFilter) params.section = sectionFilter;

      const res = await getStudents(params);
      setStudents(res.data || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, [departmentFilter, sectionFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadStudents();
  };

  // View Profile
  const handleOpenView = async (studentId) => {
    setViewLoading(true);
    try {
      const res = await getStudentById(studentId);
      setViewStudent(res.data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setViewLoading(false);
    }
  };

  // Edit Student
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await updateStudent(editStudent.student_id, editStudent);
      showToast(res.message, 'success');
      setEditStudent(null);
      loadStudents();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Student
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      const res = await deleteStudent(deleteTarget.student_id);
      showToast(res.message, 'success');
      setDeleteTarget(null);
      loadStudents();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Student Directory</h1>
          <p className="page-subtitle">
            Manage enrolled students, biometric profiles, and individual attendance records
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={loadStudents} className="btn btn-secondary">
            <RefreshCw size={16} /> Refresh
          </button>
          <Link to="/register-student" className="btn btn-primary">
            <UserPlus size={16} /> Register Student
          </Link>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="filter-bar">
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '240px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by Name, Roll No, or Student ID..."
              className="form-control"
              style={{ paddingLeft: '2.25rem' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-secondary">Search</button>
        </form>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            className="form-select"
            style={{ width: '180px' }}
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
          >
            <option value="">All Departments</option>
            <option value="Computer Science">Computer Science</option>
            <option value="Information Technology">Information Technology</option>
            <option value="Electronics & Communication">Electronics & Comm.</option>
            <option value="Mechanical Engineering">Mechanical</option>
            <option value="Civil Engineering">Civil</option>
          </select>

          <select
            className="form-select"
            style={{ width: '130px' }}
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
          >
            <option value="">All Sections</option>
            <option value="A">Section A</option>
            <option value="B">Section B</option>
            <option value="C">Section C</option>
            <option value="D">Section D</option>
          </select>
        </div>
      </div>

      {/* Students Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Name</th>
                <th>Roll Number</th>
                <th>Department</th>
                <th>Year / Sec</th>
                <th>Biometric Reference</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Loading students list...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    <Users size={36} style={{ opacity: 0.4, margin: '0 auto 0.5rem' }} />
                    <p style={{ fontWeight: 600 }}>No students registered yet</p>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      Register students and enroll their biometric face profiles to begin.
                    </p>
                  </td>
                </tr>
              ) : (
                students.map((student) => (
                  <tr key={student.id}>
                    <td className="code-font" style={{ fontWeight: 700 }}>
                      {student.student_id}
                    </td>
                    <td style={{ fontWeight: 600 }}>{student.name}</td>
                    <td>{student.roll_number}</td>
                    <td>{student.department}</td>
                    <td>{student.year} - {student.section}</td>
                    <td>
                      <span className="badge" style={{
                        backgroundColor: student.is_trained ? '#ecfdf5' : '#f8fafc',
                        color: student.is_trained ? '#065f46' : '#64748b',
                        border: `1px solid ${student.is_trained ? '#a7f3d0' : '#e2e8f0'}`
                      }}>
                        {student.is_trained ? 'Reference Enrolled' : 'No Reference'}
                      </span>
                    </td>
                    <td>
                      {student.is_trained ? (
                        <span className="badge badge-present">
                          <CheckCircle2 size={12} /> Active
                        </span>
                      ) : (
                        <span className="badge badge-late">
                          Pending
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                        <button
                          onClick={() => handleOpenView(student.student_id)}
                          className="btn btn-secondary btn-sm"
                          title="View Attendance Profile"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={() => setEditStudent({ ...student })}
                          className="btn btn-secondary btn-sm"
                          title="Edit Student"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(student)}
                          className="btn btn-secondary btn-sm"
                          style={{ color: 'var(--danger)' }}
                          title="Delete Student"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* VIEW PROFILE MODAL */}
      <Modal
        isOpen={!!viewStudent}
        onClose={() => setViewStudent(null)}
        title="Student Attendance Profile"
        maxWidth="600px"
      >
        {viewStudent && (
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              paddingBottom: '1.25rem',
              borderBottom: '1px solid var(--border-color)',
              marginBottom: '1.25rem'
            }}>
              <div style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
                fontWeight: 800
              }}>
                {viewStudent.name.charAt(0)}
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem' }}>{viewStudent.name}</h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  {viewStudent.student_id} • Roll No: {viewStudent.roll_number}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {viewStudent.department} • {viewStudent.year} (Section {viewStudent.section})
                </p>
              </div>
            </div>

            {/* Attendance Statistics Grid */}
            <h4 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>Attendance Statistics</h4>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.75rem',
              marginBottom: '1.25rem'
            }}>
              <div className="card" style={{ padding: '0.875rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Classes</span>
                <p style={{ fontSize: '1.25rem', fontWeight: 800 }}>{viewStudent.stats?.total_classes ?? 0}</p>
              </div>

              <div className="card" style={{ padding: '0.875rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Attendance Rate</span>
                <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {formatPercentage(viewStudent.stats?.attendance_percentage)}
                </p>
              </div>

              <div className="card" style={{ padding: '0.875rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Present / Late</span>
                <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success)' }}>
                  {viewStudent.stats?.present_count ?? 0} <span style={{ fontSize: '0.8125rem', color: 'var(--warning)' }}>({viewStudent.stats?.late_count ?? 0} Late)</span>
                </p>
              </div>

              <div className="card" style={{ padding: '0.875rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Absent</span>
                <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--danger)' }}>
                  {viewStudent.stats?.absent_count ?? 0}
                </p>
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Enrolled on: {formatDate(viewStudent.created_at)}
            </div>
          </div>
        )}
      </Modal>

      {/* EDIT MODAL */}
      <Modal
        isOpen={!!editStudent}
        onClose={() => setEditStudent(null)}
        title="Edit Student Information"
        footer={(
          <>
            <button onClick={() => setEditStudent(null)} className="btn btn-secondary">
              Cancel
            </button>
            <button onClick={handleSaveEdit} className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </>
        )}
      >
        {editStudent && (
          <form onSubmit={handleSaveEdit}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                className="form-control"
                value={editStudent.name || ''}
                onChange={(e) => setEditStudent({ ...editStudent, name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Roll Number</label>
              <input
                type="text"
                className="form-control"
                value={editStudent.roll_number || ''}
                onChange={(e) => setEditStudent({ ...editStudent, roll_number: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Department</label>
                <input
                  type="text"
                  className="form-control"
                  value={editStudent.department || ''}
                  onChange={(e) => setEditStudent({ ...editStudent, department: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Year</label>
                <input
                  type="text"
                  className="form-control"
                  value={editStudent.year || ''}
                  onChange={(e) => setEditStudent({ ...editStudent, year: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-control"
                value={editStudent.email || ''}
                onChange={(e) => setEditStudent({ ...editStudent, email: e.target.value })}
              />
            </div>
          </form>
        )}
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Confirm Student Deletion"
        footer={(
          <>
            <button onClick={() => setDeleteTarget(null)} className="btn btn-secondary">
              Cancel
            </button>
            <button onClick={handleConfirmDelete} className="btn btn-danger" disabled={submitting}>
              {submitting ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </>
        )}
      >
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: '#fee2e2',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
              Are you sure you want to delete {deleteTarget?.name}?
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              This action will delete the student profile, all attendance logs, and biometric face records from Cloud MySQL. This action cannot be undone.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
