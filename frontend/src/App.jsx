import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import MobileBottomNav from './components/MobileBottomNav';
import SplashScreen from './components/SplashScreen';
import OfflineBanner from './components/OfflineBanner';
import UpdateAvailableBanner from './components/UpdateAvailableBanner';
import InstallPromptModal from './components/InstallPromptModal';
import { usePWA } from './hooks/usePWA';

// Public & Auth Pages
import WelcomeAuth from './pages/WelcomeAuth';
import AdminLogin from './pages/AdminLogin';

// Student Portal Pages
import StudentDashboard from './pages/StudentDashboard';
import StudentAttendance from './pages/StudentAttendance';
import StudentProfile from './pages/StudentProfile';

// Admin & Existing Portal Pages
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import RegisterStudent from './pages/RegisterStudent';
import LiveAttendance from './pages/LiveAttendance';
import Attendance from './pages/Attendance';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import AdminManagement from './pages/AdminManagement';

// Loading Screen to prevent blank white screens during session initialization
function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#061a12',
      color: '#ffffff',
      gap: '1.25rem',
      fontFamily: 'Plus Jakarta Sans, Inter, sans-serif'
    }}>
      <div style={{
        width: '44px',
        height: '44px',
        borderRadius: '50%',
        border: '3px solid rgba(16, 185, 129, 0.2)',
        borderTopColor: '#10b981',
        animation: 'spin 0.8s linear infinite'
      }} />
      <div style={{ textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}>
          Sakra-Lens
        </h3>
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#6ee7b7' }}>
          Verifying security session & portal access...
        </p>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// Protected Route for any authenticated user
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isAuthenticated) {
    return <Navigate to="/welcome" replace />;
  }
  return children;
}

// Protected Route strictly for Administrators
function AdminRoute({ children }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }
  if (!isAdmin) {
    if (location.pathname.includes('live-attendance')) {
      return <Navigate to="/student/live-attendance" replace />;
    }
    if (location.pathname.includes('attendance')) {
      return <Navigate to="/student/attendance" replace />;
    }
    return <Navigate to="/student/dashboard" replace />;
  }
  return children;
}

// Protected Route strictly for Students
function StudentRoute({ children }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!isAuthenticated) {
    return <Navigate to="/welcome" replace />;
  }
  if (isAdmin) {
    if (location.pathname.includes('live-attendance')) {
      return <Navigate to="/admin/live-attendance" replace />;
    }
    if (location.pathname.includes('attendance')) {
      return <Navigate to="/admin/attendance" replace />;
    }
    return <Navigate to="/admin" replace />;
  }
  return children;
}

// Root redirect handler
function RootRedirect() {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isAuthenticated) {
    return <Navigate to="/welcome" replace />;
  }
  return isAdmin ? <Navigate to="/admin" replace /> : <Navigate to="/student/dashboard" replace />;
}

// Smart Attendance Redirect: routes seamlessly to student or admin attendance
function AttendanceRedirect() {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/welcome" replace />;
  return isAdmin ? <Navigate to="/admin/attendance" replace /> : <Navigate to="/student/attendance" replace />;
}

// Smart Live Attendance Redirect: routes seamlessly to student or admin live attendance
function LiveAttendanceRedirect() {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/welcome" replace />;
  return isAdmin ? <Navigate to="/admin/live-attendance" replace /> : <Navigate to="/student/live-attendance" replace />;
}

function MainLayout({ children }) {
  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">
        <Navbar />
        <main className="page-body">
          {children}
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}

export default function App() {
  const { isInstalled, canInstall, isOnline, isIOS, updateAvailable, installApp, updateApp } = usePWA();

  return (
    <AuthProvider>
      <SplashScreen />
      <OfflineBanner isOnline={isOnline} />
      <UpdateAvailableBanner updateAvailable={updateAvailable} onUpdate={updateApp} />
      <InstallPromptModal
        canInstall={canInstall}
        isInstalled={isInstalled}
        isIOS={isIOS}
        onInstall={installApp}
      />
      <Router>
        <Routes>
          {/* Public Authentication Routes */}
          <Route path="/welcome" element={<WelcomeAuth />} />
          <Route path="/login" element={<WelcomeAuth />} />
          <Route path="/register" element={<WelcomeAuth />} />
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* Root Route */}
          <Route path="/" element={<RootRedirect />} />

          {/* Student Portal Protected Routes */}
          <Route
            path="/student/dashboard"
            element={
              <StudentRoute>
                <MainLayout>
                  <StudentDashboard />
                </MainLayout>
              </StudentRoute>
            }
          />
          <Route
            path="/student/live-attendance"
            element={
              <StudentRoute>
                <MainLayout>
                  <LiveAttendance />
                </MainLayout>
              </StudentRoute>
            }
          />
          <Route
            path="/student/attendance"
            element={
              <StudentRoute>
                <MainLayout>
                  <StudentAttendance />
                </MainLayout>
              </StudentRoute>
            }
          />
          <Route
            path="/student/profile"
            element={
              <StudentRoute>
                <MainLayout>
                  <StudentProfile />
                </MainLayout>
              </StudentRoute>
            }
          />

          {/* Dedicated Admin Portal Protected Routes */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <MainLayout>
                  <Dashboard />
                </MainLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/students"
            element={
              <AdminRoute>
                <MainLayout>
                  <Students />
                </MainLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/register-student"
            element={
              <AdminRoute>
                <MainLayout>
                  <RegisterStudent />
                </MainLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/live-attendance"
            element={
              <AdminRoute>
                <MainLayout>
                  <LiveAttendance />
                </MainLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/attendance"
            element={
              <AdminRoute>
                <MainLayout>
                  <Attendance />
                </MainLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <AdminRoute>
                <MainLayout>
                  <Reports />
                </MainLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/admins"
            element={
              <AdminRoute>
                <MainLayout>
                  <AdminManagement />
                </MainLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <AdminRoute>
                <MainLayout>
                  <Settings />
                </MainLayout>
              </AdminRoute>
            }
          />

          {/* Backward-Compatible Route Fallbacks */}
          <Route path="/dashboard" element={<RootRedirect />} />
          <Route
            path="/students"
            element={
              <AdminRoute>
                <Navigate to="/admin/students" replace />
              </AdminRoute>
            }
          />
          <Route
            path="/register-student"
            element={
              <AdminRoute>
                <Navigate to="/admin/register-student" replace />
              </AdminRoute>
            }
          />
          <Route path="/live-attendance" element={<LiveAttendanceRedirect />} />
          <Route path="/attendance" element={<AttendanceRedirect />} />
          <Route
            path="/reports"
            element={
              <AdminRoute>
                <Navigate to="/admin/reports" replace />
              </AdminRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <AdminRoute>
                <Navigate to="/admin/settings" replace />
              </AdminRoute>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
