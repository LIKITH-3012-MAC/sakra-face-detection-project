import React, { useState, useEffect } from 'react';
import {
  Battery,
  BatteryCharging,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
  BatteryWarning,
  Wifi,
  WifiOff,
  Zap
} from 'lucide-react';
import { useLiveClock } from '../hooks/useLiveClock';
import { useDeviceBattery } from '../hooks/useDeviceBattery';

/**
 * MobileDeviceStatusBar:
 * Real, dynamic smartphone status bar component.
 * Displays live device local time, live Battery Status API percentage & charging state,
 * and genuine browser network status with iOS / Android safe-area-inset-top support.
 */
export default function MobileDeviceStatusBar({
  theme = 'dark', // 'dark' (for camera screen) or 'light'
  showNotch = true,
  className = ''
}) {
  const { mobileTime } = useLiveClock();
  const { supported: batterySupported, level: batteryLevel, charging: isCharging } = useDeviceBattery();

  // Honest browser online / offline state
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Determine appropriate battery icon based on real battery level & charging state
  const renderBatteryIcon = () => {
    const iconSize = 15;

    if (isCharging) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', color: '#10b981' }}>
          <BatteryCharging size={iconSize} />
        </span>
      );
    }

    if (!batterySupported || batteryLevel === null) {
      return (
        <span title="Battery Status API unavailable in this browser" style={{ display: 'inline-flex', alignItems: 'center', opacity: 0.6 }}>
          <Battery size={iconSize} />
        </span>
      );
    }

    if (batteryLevel >= 75) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', color: '#10b981' }}>
          <BatteryFull size={iconSize} />
        </span>
      );
    }

    if (batteryLevel >= 30) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', color: '#38bdf8' }}>
          <BatteryMedium size={iconSize} />
        </span>
      );
    }

    if (batteryLevel >= 15) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', color: '#f59e0b' }}>
          <BatteryLow size={iconSize} />
        </span>
      );
    }

    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', color: '#ef4444' }}>
        <BatteryWarning size={iconSize} />
      </span>
    );
  };

  const isDark = theme === 'dark';
  const textColor = isDark ? 'rgba(255, 255, 255, 0.92)' : 'var(--text-main)';
  const mutedTextColor = isDark ? 'rgba(255, 255, 255, 0.6)' : 'var(--text-secondary)';

  return (
    <div
      className={`mobile-device-status-bar ${className}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 'max(0.6rem, env(safe-area-inset-top, 0.6rem))',
        paddingBottom: '0.35rem',
        paddingLeft: '1.25rem',
        paddingRight: '1.25rem',
        fontSize: '0.78rem',
        fontWeight: 700,
        color: textColor,
        zIndex: 20,
        width: '100%',
        userSelect: 'none',
        letterSpacing: '-0.01em'
      }}
    >
      {/* Left: Live Device Current Time (12-hour local format e.g. 9:41) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        minWidth: '45px'
      }}>
        <span style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Plus Jakarta Sans", sans-serif',
          fontWeight: 700,
          fontSize: '0.82rem',
          letterSpacing: '0.02em'
        }}>
          {mobileTime}
        </span>
      </div>

      {/* Center: Dynamic Island / Camera Notch (if enabled) */}
      {showNotch && (
        <div
          style={{
            width: 'clamp(60px, 20vw, 90px)',
            height: '18px',
            backgroundColor: '#000000',
            borderRadius: '20px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            flexShrink: 1,
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          {/* Subtle camera lens reflection indicator */}
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: '#1e293b'
          }} />
          <div style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            backgroundColor: '#064e3b'
          }} />
        </div>
      )}

      {/* Right: Live Genuine Status Icons (WiFi, Real Battery % & Charging) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '0.45rem',
        flexShrink: 0,
        minWidth: '70px'
      }}>
        {/* Genuine Network Connection Icon */}
        <div style={{ display: 'flex', alignItems: 'center' }} title={isOnline ? 'Network Connected' : 'Network Offline'}>
          {isOnline ? (
            <Wifi size={13} color={textColor} />
          ) : (
            <WifiOff size={13} color="#ef4444" />
          )}
        </div>

        {/* Live Device Battery Icon + Percentage */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}
          title={
            batterySupported
              ? `Real Device Battery: ${batteryLevel}%${isCharging ? ' (Charging)' : ''}`
              : 'Device Battery Status API unavailable in this browser'
          }
        >
          {/* Charging Lightning Zap Indicator */}
          {isCharging && (
            <Zap size={10} color="#10b981" style={{ fill: '#10b981' }} />
          )}

          {/* Real Percentage (Only shown when supported - NEVER faked) */}
          {batterySupported && batteryLevel !== null ? (
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              color: isCharging ? '#10b981' : textColor
            }}>
              {batteryLevel}%
            </span>
          ) : (
            <span style={{
              fontSize: '0.65rem',
              fontWeight: 500,
              color: mutedTextColor
            }}>
              {/* Clean fallback without fake percentage */}
            </span>
          )}

          {/* Dynamic Battery Icon */}
          {renderBatteryIcon()}
        </div>
      </div>
    </div>
  );
}
