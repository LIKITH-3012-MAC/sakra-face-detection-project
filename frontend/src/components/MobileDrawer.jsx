import React, { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
  LogOut,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * MobileDrawer:
 * Slide-out navigation drawer designed specifically for mobile and tablet viewports (< 900px).
 * Replaces the desktop vertical sidebar on mobile devices with a smooth, native touch experience.
 */
export default function MobileDrawer({ isOpen, onClose }) {
  const { user, role, isAdmin, logout } = useAuth();
  const location = useLocation();

  // Close drawer on route change
  useEffect(() => {
    if (isOpen) {
      onClose();
    }
  }, [location.pathname]);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scrolling when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

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
    <>
      {/* Semi-transparent Backdrop Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(2, 6, 23, 0.65)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 998,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.28s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        aria-hidden={!isOpen}
      />

      {/* Slide-out Drawer Panel */}
      <aside
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: 0,
          width: 'min(300px, 84vw)',
          backgroundColor: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-color)',
          boxShadow: isOpen ? '0 25px 50px -12px rgba(0, 0, 0, 0.35)' : 'none',
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch'
        }}
        aria-modal="true"
        role="dialog"
      >
        {/* Drawer Header */}
        <div style={{
          padding: '1.25rem 1.25rem 1rem 1.25rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.45rem 0.75rem',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: isAdmin ? '#fef3c7' : 'var(--primary-light)',
            color: isAdmin ? '#92400e' : 'var(--primary-dark)',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase'
          }}>
            {isAdmin ? <ShieldAlert size={14} /> : <Sparkles size={14} />}
            <span>{isAdmin ? 'Administrator' : 'Student Vision'}</span>
          </div>

          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-muted)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* User Identity Pill on Mobile */}
        {user && (
          <div style={{
            margin: '0.85rem 1rem 0.25rem 1rem',
            padding: '0.75rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-muted)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.9rem',
              flexShrink: 0
            }}>
              {(user.full_name || user.name || user.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'var(--text-main)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {user.full_name || user.name || user.email}
              </div>
              <div style={{
                fontSize: '0.7rem',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {user.roll_number ? `Roll No: ${user.roll_number}` : user.email}
              </div>
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav style={{
          padding: '0.85rem 0.75rem',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem'
        }}>
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
                  padding: '0.75rem 0.9rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.9rem',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'white' : 'var(--text-main)',
                  backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'background-color 0.15s ease',
                  minHeight: '44px'
                })}
              >
                <Icon size={20} />
                <span>{item.label}</span>
                {item.highlight && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '0.625rem',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '9999px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    fontWeight: 800
                  }}>
                    LIVE
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Drawer Footer with Sign Out */}
        <div style={{
          padding: '1rem',
          borderTop: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-surface)'
        }}>
          <button
            onClick={() => {
              onClose();
              logout();
            }}
            style={{
              width: '100%',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-muted)',
              color: 'var(--text-main)',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: '0.85rem'
            }}
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>

          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            <p style={{ fontWeight: 700, color: 'var(--text-main)', margin: '0 0 0.15rem 0' }}>
              Sakra-Lens System
            </p>
            <p style={{ margin: 0 }}>Smart Attendance Platform</p>
          </div>
        </div>
      </aside>
    </>
  );
}
