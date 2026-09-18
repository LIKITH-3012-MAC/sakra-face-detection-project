import axios from 'axios';

// Configurable API base URL (defaults to same-origin reverse/dev proxy to avoid leaking credentials)
export const API_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '';

const client = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT authorization bearer token & API master passkey
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('sakra_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const passkey = import.meta.env.VITE_API_PASSKEY || 'Mom';
  if (passkey) {
    config.headers['X-API-Passkey'] = passkey;
  }
  return config;
});

// Response interceptor to unwrap data and normalize errors
client.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const errorMsg =
      error.response?.data?.message ||
      error.response?.data?.detail ||
      error.message ||
      'An unexpected network error occurred';
    return Promise.reject(new Error(errorMsg));
  }
);

// ----------------------------------------------------
// Authentication & RBAC APIs
// ----------------------------------------------------
export const requestRegistrationOtp = (data) => client.post('/api/auth/register-request-otp', data);
export const verifyOtp = (data) => client.post('/api/auth/verify-otp', data);
export const registerStudent = (data) => client.post('/api/auth/register-student', data);
export const login = (data) => client.post('/api/auth/login', data);
export const adminLogin = (data) => client.post('/api/auth/admin/login', data);
export const getCurrentUser = () => client.get('/api/auth/me');
export const getStudentProfile = () => client.get('/api/auth/student/profile');

// ----------------------------------------------------
// Admin Management APIs
// ----------------------------------------------------
export const getAdminOverview = () => client.get('/api/admin/overview');
export const getAuditLogs = () => client.get('/api/admin/audit-logs');
export const getAdminUsers = () => client.get('/api/admin/users');
export const getAdmins = () => client.get('/api/admin/admins');
export const inviteAdmin = (data) => client.post('/api/admin/invite', data);

// ----------------------------------------------------
// Health & System APIs
// ----------------------------------------------------
export const getHealth = () => client.get('/api/health');
export const getSettings = () => client.get('/api/attendance/settings');
export const updateSettings = (data) => client.put('/api/attendance/settings', data);

// ----------------------------------------------------
// Student Management APIs
// ----------------------------------------------------
export const getStudents = (params = {}) => client.get('/api/students', { params });
export const getStudentById = (studentId) => client.get(`/api/students/${studentId}`);
export const createStudent = (studentData) => client.post('/api/students', studentData);
export const updateStudent = (studentId, studentData) => client.put(`/api/students/${studentId}`, studentData);
export const deleteStudent = (studentId) => client.delete(`/api/students/${studentId}`);

// ----------------------------------------------------
// Face Dataset & Training APIs
// ----------------------------------------------------
export const registerStudentFace = (studentId, imageBase64 = null) =>
  client.post(`/api/students/${studentId}/register-face`, { image_base64: imageBase64 });

export const captureFaceFrame = (studentId, imageBase64 = null) =>
  client.post(`/api/students/${studentId}/capture-frame`, { image_base64: imageBase64 });

export const trainStudentModel = (studentId) => client.post(`/api/students/${studentId}/train`);
export const getDatasetStatus = (studentId) => client.get(`/api/students/${studentId}/dataset-status`);

// ----------------------------------------------------
// Attendance APIs
// ----------------------------------------------------
export const getAttendance = (params = {}) => client.get('/api/attendance', { params });
export const getTodayAttendance = () => client.get('/api/attendance/today');
export const getDashboardStats = () => client.get('/api/attendance/dashboard-stats');
export const markAttendance = (payload) => client.post('/api/attendance/mark', payload);
export const getStudentAttendance = (studentId) => client.get(`/api/attendance/student/${studentId}`);
export const getStudentStats = (studentId) => client.get(`/api/attendance/stats/${studentId}`);

// ----------------------------------------------------
// Camera & Live Recognition APIs
// ----------------------------------------------------
export const getLiveStatus = () => client.get('/api/camera/live-status');
export const recognizeFrame = (imageBase64, autoMark = true, latitude = null, longitude = null, locationAccuracy = null) =>
  client.post('/api/camera/recognize-frame', {
    image_base64: imageBase64,
    auto_mark: autoMark,
    latitude: latitude,
    longitude: longitude,
    location_accuracy: locationAccuracy
  });
export const validatePreviewFrame = (imageBase64) =>
  client.post('/api/camera/validate-preview', { image_base64: imageBase64 });
export const getRecognitionStatus = () => client.get('/api/camera/status');
export const retrainGlobalModel = () => client.post('/api/camera/retrain');

export const getLiveStreamUrl = () => `${API_URL}/api/camera/stream`;

// ----------------------------------------------------
// Reports APIs
// ----------------------------------------------------
export const getDailyReport = (date) => client.get('/api/reports/daily', { params: { report_date: date } });
export const getMonthlyReport = (year, month, department) =>
  client.get('/api/reports/monthly', { params: { year, month, department } });
export const getStudentWiseReport = (params = {}) => client.get('/api/reports/student-wise', { params });
export const getExportCsvUrl = (reportType = 'attendance', extraParams = {}) => {
  const query = new URLSearchParams({ report_type: reportType, ...extraParams }).toString();
  return `${API_URL}/api/reports/export-csv?${query}`;
};

export default {
  requestRegistrationOtp,
  verifyOtp,
  registerStudent,
  login,
  adminLogin,
  getCurrentUser,
  getStudentProfile,
  getAdminOverview,
  getAuditLogs,
  getAdminUsers,
  getAdmins,
  inviteAdmin,
  getHealth,
  getSettings,
  updateSettings,
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  captureFaceFrame,
  trainStudentModel,
  getDatasetStatus,
  getAttendance,
  getTodayAttendance,
  getDashboardStats,
  markAttendance,
  getStudentAttendance,
  getLiveStatus,
  recognizeFrame,
  validatePreviewFrame,
  getLiveStreamUrl,
  getDailyReport,
  getMonthlyReport,
  getStudentWiseReport,
  getExportCsvUrl,
};
