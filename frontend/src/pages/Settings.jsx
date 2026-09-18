import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Clock,
  Sliders,
  Database,
  Shield,
  Save,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { getSettings, updateSettings, getHealth, getRecognitionStatus, retrainGlobalModel } from '../services/api';
import Toast from '../components/Toast';

export default function Settings() {
  const [settingsData, setSettingsData] = useState({
    cutoff_time: '09:30:00',
    recognition_threshold: 65.0,
    min_dataset_images: 25,
    auto_mark_enabled: true
  });
  const [healthData, setHealthData] = useState(null);
  const [recognitionModelStatus, setRecognitionModelStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadSettingsAndHealth = async () => {
    setLoading(true);
    try {
      const [settingsRes, healthRes, recStatusRes] = await Promise.all([
        getSettings(),
        getHealth(),
        getRecognitionStatus().catch(() => ({ data: null }))
      ]);
      if (settingsRes.data) {
        setSettingsData(settingsRes.data);
      }
      setHealthData(healthRes.data);
      if (recStatusRes?.data) {
        setRecognitionModelStatus(recStatusRes.data);
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettingsAndHealth();
  }, []);

  const handleRetrainGlobal = async () => {
    setRetraining(true);
    try {
      const res = await retrainGlobalModel();
      showToast(res.message || 'Model retrained successfully!', 'success');
      loadSettingsAndHealth();
    } catch (err) {
      showToast(err.message || 'Retraining failed', 'error');
    } finally {
      setRetraining(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await updateSettings(settingsData);
      showToast(res.message || 'Settings saved successfully', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">System Settings & Configuration</h1>
          <p className="page-subtitle">
            Configure attendance timing policies, recognition thresholds, and inspect system status
          </p>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '1.5rem',
        alignItems: 'start'
      }}>
        {/* Attendance & Model Settings Card */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <Sliders size={20} color="var(--primary)" />
            <h3 style={{ fontSize: '1.125rem' }}>Attendance & Recognition Rules</h3>
          </div>

          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">Attendance Cutoff Time (HH:MM:SS)</label>
              <input
                type="text"
                className="form-control"
                value={settingsData.cutoff_time}
                onChange={(e) => setSettingsData({ ...settingsData, cutoff_time: e.target.value })}
                placeholder="09:30:00"
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                Arrivals before this time are marked <strong>Present</strong>. Arrivals after this time are marked <strong>Late</strong>.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">
                Recognition Distance Threshold: <strong>{settingsData.recognition_threshold}</strong>
              </label>
              <input
                type="range"
                min="40"
                max="90"
                step="1"
                className="form-control"
                value={settingsData.recognition_threshold}
                onChange={(e) => setSettingsData({ ...settingsData, recognition_threshold: parseFloat(e.target.value) })}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                <span>Strict (40)</span>
                <span>Balanced (65)</span>
                <span>Permissive (90)</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                Lower values require higher similarity. Faces with distance greater than threshold are flagged as <strong>Unknown Face</strong>.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Minimum Required Face Dataset Images</label>
              <input
                type="number"
                min="10"
                max="50"
                className="form-control"
                value={settingsData.min_dataset_images}
                onChange={(e) => setSettingsData({ ...settingsData, min_dataset_images: parseInt(e.target.value) || 25 })}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                Recommended: 25 to 30 images captured with slight head angle rotations.
              </p>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%' }}>
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </form>
        </div>

        {/* Database & System Information Card */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <Database size={20} color="var(--primary)" />
            <h3 style={{ fontSize: '1.125rem' }}>System Status & Diagnostics</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>System Connection:</span>
              <p className="code-font" style={{ fontWeight: 700 }}>
                Secure Cloud Database
              </p>
            </div>

            <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Service Environment:</span>
              <p className="code-font" style={{ fontWeight: 700 }}>
                {healthData?.database?.status || 'Operational'}
              </p>
            </div>

            <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Database Status:</span>
              <p style={{
                fontWeight: 700,
                color: healthData?.database?.connected ? 'var(--success)' : 'var(--danger)'
              }}>
                {healthData?.database?.connected ? 'Connected & Operational' : 'Service Offline (Please check connection)'}
              </p>
            </div>

            <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Biometric Verification Engine:</span>
              <p style={{ fontWeight: 600 }}>
                High-Precision Biometric Face Recognition
              </p>
            </div>

            <div style={{
              padding: '0.875rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: '#ecfdf5',
              border: '1px solid #a7f3d0',
              color: '#065f46',
              fontSize: '0.75rem'
            }}>
              <p style={{ fontWeight: 700, marginBottom: '0.2rem' }}>🔒 Security & Data Protection:</p>
              <p>
                All student biometric profiles and attendance records are encrypted and securely stored in compliance with institutional data and privacy standards.
              </p>
            </div>
          </div>
        </div>

        {/* Recognition Model Diagnostics Card (Section 61) */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={20} color="var(--primary)" />
              <h3 style={{ fontSize: '1.125rem' }}>Recognition Model Status</h3>
            </div>
            <span className={recognitionModelStatus?.model_loaded ? 'badge badge-present' : 'badge badge-late'}>
              {recognitionModelStatus?.model_loaded ? 'Ready ✓' : 'Not Trained'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Model Version:</span>
              <p style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--primary)' }}>
                v{recognitionModelStatus?.model_version ?? 0}
              </p>
            </div>

            <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Students Enrolled:</span>
              <p style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                {recognitionModelStatus?.trained_students ?? 0}
              </p>
            </div>

            <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Images Used:</span>
              <p style={{ fontWeight: 700 }}>
                {recognitionModelStatus?.trained_images ?? 0}
              </p>
            </div>

            <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Recognition Threshold:</span>
              <p style={{ fontWeight: 700 }}>
                {recognitionModelStatus?.threshold ?? 65.0}
              </p>
            </div>
          </div>

          {recognitionModelStatus?.active_labels && Object.keys(recognitionModelStatus.active_labels).length > 0 && (
            <div style={{ marginBottom: '1.25rem', padding: '0.75rem', backgroundColor: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block', marginBottom: '0.35rem' }}>
                Active Enrolled Student Identifiers:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {Object.entries(recognitionModelStatus.active_labels).map(([num, sid]) => (
                  <span key={num} className="code-font" style={{ fontSize: '0.75rem', backgroundColor: 'var(--bg-muted)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    ID: <strong>{sid}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleRetrainGlobal}
            className="btn btn-secondary"
            disabled={retraining}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <RefreshCw size={14} className={retraining ? 'spin-icon' : ''} />
            {retraining ? 'Retraining Global Model...' : 'Retrain Global Model Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
