import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Camera,
  CalendarCheck,
  FileBarChart,
  Settings,
  Sparkles,
  ShieldAlert,
  User,
  LogOut
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Sidebar() {
  const { role, isAdmin, isStudent, logout } = useAuth();

  const adminNavItems = [
    { path: '/admin', label: 'Admin Dashboard', icon: LayoutDashboard },
    { path: '/admin/students', label: 'Students Directory', icon: Users },
    { path: '/admin/register-student', label: 'Enroll Student', icon: UserPlus },
    { path: '/admin/live-attendance', label: 'Live Attendance', icon: Camera, highlight: true },
    { path: '/admin/attendance', label: 'Attendance Logs', icon: CalendarCheck },
    { path: '/admin/reports', label: 'Reports & Analytics', icon: FileBarChart },
    { path: '/admin/admins', label: 'Admin Management', icon: ShieldAlert },
    { path: '/admin/settings', label: 'System Settings', icon: Settings },
  ];

  const studentNavItems = [
    { path: '/student/dashboard', label: 'My Dashboard', icon: LayoutDashboard },
    { path: '/student/live-attendance', label: 'Live Attendance', icon: Camera, highlight: true },
    { path: '/student/attendance', label: 'My Attendance Logs', icon: CalendarCheck },
    { path: '/student/profile', label: 'My Profile & Biometrics', icon: User },
  ];

  const navItems = isAdmin ? adminNavItems : studentNavItems;

  return (
    <aside className="desktop-sidebar" style={{
      width: 'var(--sidebar-width)',
      backgroundColor: 'var(--bg-surface)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0
    }}>
      <div style={{ padding: '1.5rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: isAdmin ? '#fef3c7' : 'var(--primary-light)',
          color: isAdmin ? '#92400e' : 'var(--primary-dark)',
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase'
        }}>
          {isAdmin ? <ShieldAlert size={14} /> : <Sparkles size={14} />}
          <span>{isAdmin ? 'Administrator Portal' : 'Student Vision Portal'}</span>
        </div>
      </div>

      <nav style={{ padding: '1rem 0.75rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/admin' || item.path === '/student/dashboard'}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'white' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                textDecoration: 'none',
                transition: 'var(--transition)',
                boxShadow: isActive ? '0 2px 6px rgba(79, 70, 229, 0.25)' : 'none'
              })}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {item.highlight && (
                <span style={{
                  marginLeft: 'auto',
                  fontSize: '0.625rem',
                  padding: '0.15rem 0.4rem',
                  borderRadius: '9999px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  fontWeight: 700
                }}>
                  LIVE
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Logout / Academic Viva Footer */}
      <div style={{
        padding: '1.25rem',
        borderTop: '1px solid var(--border-color)',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)'
      }}>
        <button
          onClick={logout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-muted)',
            color: 'var(--text-secondary)',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: '1rem'
          }}
        >
          <LogOut size={15} />
          <span>Sign Out</span>
        </button>

        <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
          Sakra-Lens System
        </p>
        <p style={{ margin: 0 }}>Smart Attendance Platform</p>
      </div>
    </aside>
  );
}
