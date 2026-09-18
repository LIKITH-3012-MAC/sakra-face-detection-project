import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function Toast(props) {
  const toastData = props.toast || (props.message ? { message: props.message, type: props.type } : null);
  if (!toastData) return null;
  const onClose = props.onClose;

  const types = {
    success: {
      bg: '#ecfdf5',
      border: '#a7f3d0',
      color: '#065f46',
      icon: CheckCircle2
    },
    error: {
      bg: '#fef2f2',
      border: '#fecaca',
      color: '#991b1b',
      icon: AlertCircle
    },
    info: {
      bg: '#eef2ff',
      border: '#c7d2fe',
      color: '#3730a3',
      icon: Info
    }
  };

  const current = types[toastData.type] || types.info;
  const Icon = current.icon;

  return (
    <div style={{
      position: 'fixed',
      bottom: '1.5rem',
      right: '1.5rem',
      zIndex: 100,
      minWidth: '320px',
      maxWidth: '450px',
      backgroundColor: current.bg,
      border: `1px solid ${current.border}`,
      color: current.color,
      borderRadius: 'var(--radius-md)',
      padding: '0.875rem 1rem',
      boxShadow: 'var(--shadow-lg)',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      animation: 'slideIn 0.25s ease-out'
    }}>
      <Icon size={20} style={{ flexShrink: 0 }} />
      <p style={{ fontSize: '0.875rem', fontWeight: 600, flex: 1, margin: 0 }}>
        {toastData.message}
      </p>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: '0.2rem',
            display: 'flex'
          }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
