import React, { useState, useEffect } from 'react';
import { ShieldCheck, Database, Clock, User, LogOut, Menu } from 'lucide-react';
import { getHealth } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLiveClock } from '../hooks/useLiveClock';
import MobileDeviceStatusBar from './MobileDeviceStatusBar';
import MobileDrawer from './MobileDrawer';

export default function Navbar() {
  const { user, isAdmin, isStudent, logout } = useAuth();
  const [health, setHealth] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { desktopTime } = useLiveClock();

  useEffect(() => {
    const checkSystem = async () => {
      try {
        const res = await getHealth();
        setHealth(res.data);
      } catch (err) {
        setHealth({ database: { connected: false } });
      }
    };

    checkSystem();
    const healthInterval = setInterval(checkSystem, 15000);

    return () => {
      clearInterval(healthInterval);
    };
  }, []);

  const isDbConnected = health?.database?.connected;

  return (
    <>
      {/* ============================================================ */}
      {/* MOBILE TOP NAVIGATION (< 900px)                              */}
      {/* ============================================================ */}
      <div className="mobile-top-nav">
        {/* Real Live Device Status Bar (Local Time, Real Battery API, Network) */}
        <MobileDeviceStatusBar theme="light" showNotch={false} />

        {/* Mobile Header App Bar */}
        <div style={{
          height: '56px',
          padding: '0 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-surface)'
        }}>
          {/* Left: Hamburger Drawer Trigger */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open Navigation Menu"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-muted)',
              color: 'var(--text-main)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <Menu size={20} />
          </button>

          {/* Center: Brand Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)'
            }}>
              <ShieldCheck size={18} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.15 }}>
                Sakra-Lens
              </span>
              <span style={{
                fontSize: '0.625rem',
                fontWeight: 700,
                color: isAdmin ? '#b45309' : 'var(--primary)',
                letterSpacing: '0.02em'
              }}>
                {isAdmin ? 'ADMINISTRATOR' : 'STUDENT VISION'}
              </span>
            </div>
          </div>

          {/* Right: System status pill */}
          <div
            title={isDbConnected ? 'System Ready' : 'Service Offline'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.55rem',
              borderRadius: '9999px',
              backgroundColor: isDbConnected ? 'var(--success-bg)' : 'var(--danger-bg)',
              color: isDbConnected ? '#065f46' : '#991b1b',
              border: `1px solid ${isDbConnected ? '#a7f3d0' : '#fecaca'}`,
              fontSize: '0.7rem',
              fontWeight: 700
            }}
          >
            <Database size={12} />
            <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isDbConnected ? '#10b981' : '#ef4444' }} />
          </div>
        </div>
      </div>

      {/* Slide-out Mobile Navigation Drawer */}
      <MobileDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* ============================================================ */}
      {/* DESKTOP NAVBAR (>= 900px)                                    */}
      {/* ============================================================ */}
      <header
        className="desktop-navbar"
        style={{
          height: '68px',
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-color)',
          padding: '0 2rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 20
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)'
          }}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.2 }}>
              Smart Attendance System
            </h1>
            <p style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>
              Face Recognition & Automated Attendance Engine
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          {/* Real-time Clock */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            padding: '0.35rem 0.75rem',
            backgroundColor: 'var(--bg-muted)',
            borderRadius: 'var(--radius-sm)'
          }}>
            <Clock size={15} color="var(--primary)" />
            <span>{desktopTime}</span>
          </div>

          {/* System Status Pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '0.35rem 0.75rem',
            borderRadius: '9999px',
            backgroundColor: isDbConnected ? 'var(--success-bg)' : 'var(--danger-bg)',
            color: isDbConnected ? '#065f46' : '#991b1b',
            border: `1px solid ${isDbConnected ? '#a7f3d0' : '#fecaca'}`
          }}>
            <Database size={13} />
            <span>{isDbConnected ? 'System Ready' : 'Service Offline'}</span>
            {isDbConnected && <span className="pulse-indicator" />}
          </div>

          {/* User Profile / Role Pill */}
          {user && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-muted)'
            }}>
              <User size={15} color="var(--primary)" />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {user.full_name || user.email}
              </span>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 800,
                padding: '0.15rem 0.45rem',
                borderRadius: '9999px',
                backgroundColor: isAdmin ? '#fef3c7' : '#dbeafe',
                color: isAdmin ? '#92400e' : '#1e40af'
              }}>
                {isAdmin ? 'ADMIN' : 'STUDENT'}
              </span>
            </div>
          )}
        </div>
      </header>
    </>
  );
}
