import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  GraduationCap,
  Mail,
  Hash,
  Building,
  Camera,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Calendar
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getStudentProfile, registerStudentFace } from '../services/api';

export default function StudentProfile() {
  const { user } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Camera re-enrollment modal
  const [showFaceModal, setShowFaceModal] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState('');
  const [enrollError, setEnrollError] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await getStudentProfile();
      if (res?.data) {
        setProfileData(res.data);
      }
    } catch (err) {
      console.error('Failed to load student profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    setShowFaceModal(true);
    setEnrollError('');
    setEnrollMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setCameraActive(true);
        };
      }
    } catch (err) {
      setEnrollError('Webcam permission denied or camera not found.');
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    setShowFaceModal(false);
    setCameraActive(false);
  };

  const captureAndEnroll = async () => {
    if (!videoRef.current) return;
    setEnrolling(true);
    setEnrollError('');
    setEnrollMsg('');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

      const studentId = student.student_id;
      const res = await registerStudentFace(studentId, dataUrl);
      if (res?.success) {
        setEnrollMsg('Biometric face profile updated successfully!');
        fetchProfile();
        setTimeout(() => closeCamera(), 1500);
      } else {
        setEnrollError(res?.message || 'Face validation failed.');
      }
    } catch (err) {
      setEnrollError(err.message || 'Face enrollment failed.');
    } finally {
      setEnrolling(false);
    }
  };

  const student = profileData?.student || {};

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
          My Student Profile
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
          Registered biometric credentials and academic classification
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Academic Details Card */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          padding: '1.75rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '1.5rem',
              fontWeight: 800
            }}>
              {student.name ? student.name.charAt(0).toUpperCase() : 'S'}
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                {student.name || user?.full_name}
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                Verified Student Identity
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                Roll Number
              </label>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.25rem', wordBreak: 'break-word' }}>
                {student.roll_number || 'N/A'}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                Student ID
              </label>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.25rem', fontFamily: 'monospace', wordBreak: 'break-word' }}>
                {student.student_id || 'N/A'}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                Department
              </label>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.25rem', wordBreak: 'break-word' }}>
                {student.department || 'N/A'}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                Academic Year & Section
              </label>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.25rem', wordBreak: 'break-word' }}>
                {student.year || 'N/A'} — Section {student.section || 'N/A'}
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                Registered Notification Email
              </label>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--primary)', marginTop: '0.25rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                {student.email || user?.email}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                All automated attendance confirmation emails are delivered to this address.
              </span>
            </div>
          </div>
        </div>

        {/* Biometric Status Card */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          padding: '1.75rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Camera size={20} color="var(--primary)" />
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                Biometric Face Model Status
              </h2>
            </div>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.85rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: student.is_trained ? 'var(--success-bg)' : '#fef3c7',
              color: student.is_trained ? '#065f46' : '#92400e'
            }}>
              {student.is_trained ? '✓ Biometric Profile Active' : 'Face Not Enrolled'}
            </span>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
            The Sakra-Lens vision engine uses <strong>one high-quality reference photo</strong> to verify attendance.
          </p>

          <button
            onClick={startCamera}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}
          >
            <Camera size={16} />
            <span>{student.is_trained ? 'Update Reference Face Photo' : 'Enroll Reference Face Photo'}</span>
          </button>
        </div>
      </div>

      {/* Face Enrollment Modal */}
      {showFaceModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            maxWidth: '520px',
            width: '100%',
            padding: '1.75rem',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
              Biometric Reference Capture
            </h3>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
              Look directly at the webcam with good lighting. Exactly 1 face must be clearly visible.
            </p>

            {enrollError && (
              <div style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--danger-bg)',
                color: 'var(--danger)',
                fontSize: '0.85rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <AlertCircle size={16} />
                <span>{enrollError}</span>
              </div>
            )}

            {enrollMsg && (
              <div style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--success-bg)',
                color: '#065f46',
                fontSize: '0.85rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <CheckCircle2 size={16} />
                <span>{enrollMsg}</span>
              </div>
            )}

            <div style={{
              width: '100%',
              height: '280px',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              backgroundColor: '#0f172a',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div style={{
                position: 'absolute',
                width: '180px',
                height: '230px',
                border: '2px dashed #38bdf8',
                borderRadius: '50%',
                pointerEvents: 'none'
              }} />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={closeCamera}
                disabled={enrolling}
                className="btn btn-secondary"
                style={{ flex: 1, padding: '0.75rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={captureAndEnroll}
                disabled={!cameraActive || enrolling}
                className="btn btn-primary"
                style={{ flex: 2, padding: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                {enrolling ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Enrolling Face Profile...</span>
                  </>
                ) : (
                  <>
                    <Camera size={18} />
                    <span>Capture & Enroll</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
