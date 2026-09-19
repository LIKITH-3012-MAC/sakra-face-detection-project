import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  Mail,
  User,
  Hash,
  Building,
  GraduationCap,
  Layers,
  Camera,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Sparkles,
  KeyRound,
  Eye,
  EyeOff
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { requestRegistrationOtp, verifyOtp, registerStudent } from '../services/api';
import OtpInput from '../components/OtpInput';

export default function WelcomeAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, setAuthSession, isAuthenticated, isAdmin, isStudent } = useAuth();

  // Determine initial state
  const isDirectLogin = location.pathname === '/login';
  const [showWelcome, setShowWelcome] = useState(!isDirectLogin);
  const [activeTab, setActiveTab] = useState(location.pathname === '/register' ? 'register' : 'login');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Multi-step Registration State
  // Step 1: Details, Step 2: OTP, Step 3: Password, Step 4: Face Enrollment
  const [regStep, setRegStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [department, setDepartment] = useState('Computer Science');
  const [year, setYear] = useState('4th Year');
  const [section, setSection] = useState('A');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpTimer, setOtpTimer] = useState(180); // 3 minutes
  const [canResendOtp, setCanResendOtp] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [verificationToken, setVerificationToken] = useState('');

  // Face Enrollment State
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSuccessMsg, setRegSuccessMsg] = useState('');

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      if (isAdmin) {
        navigate('/admin', { replace: true });
      } else {
        navigate('/student/dashboard', { replace: true });
      }
    }
  }, [isAuthenticated, isAdmin, navigate]);

  // ~3-Second Welcome Animation
  useEffect(() => {
    if (showWelcome) {
      const timer = setTimeout(() => {
        setShowWelcome(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showWelcome]);

  // OTP 3-minute Countdown Timer
  useEffect(() => {
    let interval = null;
    if (regStep === 2 && otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer((prev) => {
          if (prev <= 1) {
            setCanResendOtp(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [regStep, otpTimer]);

  // Camera cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Handle Login
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const authUser = await login(loginEmail, loginPassword);
      if (authUser?.role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/student/dashboard', { replace: true });
      }
    } catch (err) {
      setLoginError(err.message || 'Invalid email or password');
    } finally {
      setLoginLoading(false);
    }
  };

  // Step 1: Send OTP
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setRegError('');

    if (!fullName.trim() || !rollNumber.trim() || !email.trim()) {
      setRegError('Please complete all required fields.');
      return;
    }

    setRegLoading(true);
    try {
      const res = await requestRegistrationOtp({
        email: email.trim(),
        full_name: fullName.trim(),
        roll_number: rollNumber.trim(),
        department,
        year,
        section
      });
      setRegStep(2);
      setOtpTimer(180);
      setCanResendOtp(false);
      setRegSuccessMsg(res.message || `Verification code sent to ${email}`);
    } catch (err) {
      setRegError(err.message || 'Failed to dispatch verification code.');
    } finally {
      setRegLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    setRegError('');
    setRegLoading(true);
    try {
      const res = await requestRegistrationOtp({
        email: email.trim(),
        full_name: fullName.trim(),
        roll_number: rollNumber.trim(),
        department,
        year,
        section
      });
      setOtpTimer(180);
      setCanResendOtp(false);
      setRegSuccessMsg('A fresh verification code has been dispatched.');
    } catch (err) {
      setRegError(err.message || 'Failed to resend code.');
    } finally {
      setRegLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setRegError('');
    if (otp.length !== 6) {
      setRegError('Please enter the complete 6-digit verification code.');
      return;
    }

    setRegLoading(true);
    try {
      const res = await verifyOtp({ email: email.trim(), otp: otp.trim() });
      if (res?.data?.verification_token) {
        setVerificationToken(res.data.verification_token);
      }
      setRegStep(3);
      setRegSuccessMsg('Email verified successfully! Now choose your account password.');
    } catch (err) {
      setRegError(err.message || 'Invalid or expired verification code.');
    } finally {
      setRegLoading(false);
    }
  };

  // Step 3: Set Password
  const handlePasswordNext = (e) => {
    e.preventDefault();
    setRegError('');
    if (password.length < 6) {
      setRegError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setRegError('Passwords do not match.');
      return;
    }

    setRegStep(4);
    startWebcam();
  };

  // Step 4: Camera Helpers
  const startWebcam = async () => {
    setCameraActive(false);
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
      setRegError('Unable to access webcam. Please allow camera permissions to complete face enrollment.');
    }
  };

  const captureReferenceShot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedPhoto(dataUrl);
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    setRegError('');
  };

  // Step 4: Finalize Enrollment & Register
  const handleCompleteRegistration = async (skipFace = false) => {
    setRegError('');
    setRegLoading(true);

    const photoPayload = (skipFace === true) ? null : (typeof capturedPhoto === 'string' ? capturedPhoto : null);

    try {
      const res = await registerStudent({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        roll_number: rollNumber.trim(),
        department,
        year,
        section,
        otp: otp.trim(),
        verification_token: verificationToken || null,
        face_image_base64: photoPayload
      });

      if (res?.data?.token && res?.data?.user) {
        setAuthSession(res.data.token, res.data.user);
        // Stop webcam
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }
        navigate('/student/dashboard', { replace: true });
      }
    } catch (err) {
      setRegError(err.message || 'Account registration failed.');
    } finally {
      setRegLoading(false);
    }
  };

  // ----------------------------------------------------
  // Render: 3-Second Welcome Splash Screen
  // ----------------------------------------------------
  if (showWelcome) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        color: '#ffffff',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          animation: 'fadeInScale 1.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={{
            width: '96px',
            height: '96px',
            borderRadius: '24px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.5rem',
            boxShadow: '0 0 40px rgba(79, 70, 229, 0.6)'
          }}>
            <ShieldCheck size={56} color="#ffffff" />
          </div>

          <p style={{
            fontSize: '0.85rem',
            fontWeight: 700,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: '#38bdf8',
            marginBottom: '0.5rem'
          }}>
            Welcome to
          </p>

          <h1 style={{
            fontSize: '3rem',
            fontWeight: 900,
            letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: '0 0 0.75rem 0'
          }}>
            SAKRA-LENS
          </h1>

          <p style={{
            fontSize: '1rem',
            color: '#94a3b8',
            maxWidth: '420px',
            lineHeight: 1.5,
            marginBottom: '2rem'
          }}>
            Biometric Face Recognition & Automated Attendance Management Architecture
          </p>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#38bdf8',
            fontSize: '0.85rem',
            fontWeight: 600
          }}>
            <Sparkles size={16} className="animate-spin" />
            <span>Loading Computer Vision Portal...</span>
          </div>

          <button
            onClick={() => setShowWelcome(false)}
            style={{
              marginTop: '2rem',
              padding: '0.5rem 1.25rem',
              borderRadius: '9999px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.05)',
              color: '#94a3b8',
              fontSize: '0.75rem',
              cursor: 'pointer'
            }}
          >
            Skip Intro →
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // Render: Main Authentication & Enrollment Screen
  // ----------------------------------------------------
  return (
    <div className="auth-page-container" style={{
      backgroundColor: 'var(--bg-app)',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div className="auth-card-wrapper" style={{
        maxWidth: regStep === 4 ? '560px' : '480px'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem', width: '100%' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 0.75rem auto',
            color: 'white',
            boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)'
          }}>
            <ShieldCheck size={32} />
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', margin: 0 }}>
            Sakra-Lens
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Smart Attendance & Biometric Face Verification
          </p>
        </div>

        {/* Main Auth Container Card */}
        <div style={{
          width: '100%',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
          overflow: 'hidden',
          transition: 'max-width 0.3s ease'
        }}>
        {/* Tab Switcher */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-muted)'
        }}>
          <button
            type="button"
            onClick={() => {
              setActiveTab('login');
              setLoginError('');
            }}
            style={{
              padding: '0.85rem',
              fontSize: '0.9rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              color: activeTab === 'login' ? 'var(--primary)' : 'var(--text-secondary)',
              backgroundColor: activeTab === 'login' ? 'var(--bg-surface)' : 'transparent',
              borderBottom: activeTab === 'login' ? '2px solid var(--primary)' : 'none'
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('register');
              setRegError('');
            }}
            style={{
              padding: '0.85rem',
              fontSize: '0.9rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              color: activeTab === 'register' ? 'var(--primary)' : 'var(--text-secondary)',
              backgroundColor: activeTab === 'register' ? 'var(--bg-surface)' : 'transparent',
              borderBottom: activeTab === 'register' ? '2px solid var(--primary)' : 'none'
            }}
          >
            Create Account
          </button>
        </div>

        <div className="auth-card-body" style={{ padding: 'clamp(1rem, 4vw, 2rem)' }}>
          {/* ==================================================== */}
          {/* SIGN IN TAB */}
          {/* ==================================================== */}
          {activeTab === 'login' && (
            <form onSubmit={handleLoginSubmit}>
              <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 0.25rem 0' }}>
                  Welcome Back
                </h2>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                  Sign in with your student or administrator credentials
                </p>
              </div>

              {loginError && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--danger-bg)',
                  color: 'var(--danger)',
                  fontSize: '0.85rem',
                  marginBottom: '1.25rem'
                }}>
                  <AlertCircle size={18} />
                  <span>{loginError}</span>
                </div>
              )}

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                  Email or Identifier
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    required
                    placeholder="Enter your email address"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.7rem 0.85rem 0.7rem 2.5rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      fontSize: '0.875rem',
                      backgroundColor: 'var(--bg-app)',
                      color: 'var(--text-main)'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter your password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.7rem 2.5rem 0.7rem 2.5rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      fontSize: '0.875rem',
                      backgroundColor: 'var(--bg-app)',
                      color: 'var(--text-main)'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    style={{
                      position: 'absolute',
                      right: '0.85rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                {loginLoading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <div style={{
                marginTop: '1.75rem',
                paddingTop: '1.25rem',
                borderTop: '1px solid var(--border-color)',
                textAlign: 'center'
              }}>
                <button
                  type="button"
                  onClick={() => navigate('/admin/login')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <KeyRound size={14} />
                  <span>Dedicated Administrator Portal Access →</span>
                </button>
              </div>
            </form>
          )}

          {/* ==================================================== */}
          {/* CREATE ACCOUNT TAB (Multi-Step Flow) */}
          {/* ==================================================== */}
          {activeTab === 'register' && (
            <div>
              {/* Progress Indicator */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                {[
                  { step: 1, label: 'Details' },
                  { step: 2, label: 'OTP' },
                  { step: 3, label: 'Password' },
                  { step: 4, label: 'Face' },
                ].map((item, idx) => (
                  <React.Fragment key={item.step}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        backgroundColor: regStep >= item.step ? 'var(--primary)' : 'var(--bg-muted)',
                        color: regStep >= item.step ? '#ffffff' : 'var(--text-secondary)',
                        border: `2px solid ${regStep >= item.step ? 'var(--primary)' : 'var(--border-color)'}`
                      }}>
                        {regStep > item.step ? '✓' : item.step}
                      </div>
                      <span style={{ fontSize: '0.65rem', fontWeight: 600, color: regStep === item.step ? 'var(--primary)' : 'var(--text-secondary)' }}>
                        {item.label}
                      </span>
                    </div>
                    {idx < 3 && (
                      <div style={{
                        flex: 1,
                        height: '2px',
                        backgroundColor: regStep > idx + 1 ? 'var(--primary)' : 'var(--border-color)',
                        margin: '0 0.25rem 0.8rem 0.25rem'
                      }} />
                    )}
                  </React.Fragment>
                ))}
              </div>

              {regError && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--danger-bg)',
                  color: 'var(--danger)',
                  fontSize: '0.85rem',
                  marginBottom: '1rem'
                }}>
                  <AlertCircle size={18} />
                  <span>{regError}</span>
                </div>
              )}

              {regSuccessMsg && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--success-bg)',
                  color: '#065f46',
                  fontSize: '0.85rem',
                  marginBottom: '1rem'
                }}>
                  <CheckCircle2 size={18} />
                  <span>{regSuccessMsg}</span>
                </div>
              )}

              {/* Step 1: Academic Details */}
              {regStep === 1 && (
                <form onSubmit={handleRequestOtp}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Full Name *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <User size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input
                        type="text"
                        required
                        placeholder="Enter your full name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem 0.75rem 0.65rem 2.4rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                        Roll Number *
                      </label>
                      <div style={{ position: 'relative' }}>
                        <Hash size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                        <input
                          type="text"
                          required
                          placeholder="Enter roll number"
                          value={rollNumber}
                          onChange={(e) => setRollNumber(e.target.value)}
                          style={{ width: '100%', padding: '0.65rem 0.75rem 0.65rem 2.4rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                        Section *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Enter section"
                        value={section}
                        onChange={(e) => setSection(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                        Department *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Enter department"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                        Year *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Enter academic year"
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                      Student Email Address *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Mail size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input
                        type="email"
                        required
                        placeholder="Enter your email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem 0.75rem 0.65rem 2.4rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                      />
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                      A 6-digit verification code will be sent to this address.
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={regLoading}
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  >
                    {regLoading ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        <span>Sending Verification Code...</span>
                      </>
                    ) : (
                      <>
                        <span>Next: Verify Email OTP</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Step 2: OTP Verification */}
              {regStep === 2 && (
                <form onSubmit={handleVerifyOtp}>
                  <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>
                      Check Your Email
                    </h3>
                    <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: 0 }}>
                      We sent a 6-digit verification code to <strong style={{ color: 'var(--text-main)' }}>{email}</strong>
                    </p>
                  </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', textAlign: 'center' }}>
                      Enter 6-Digit Code
                    </label>
                    <OtpInput
                      length={6}
                      value={otp}
                      onChange={(val) => setOtp(val)}
                      disabled={regLoading}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                      <span style={{ color: otpTimer > 0 ? 'var(--text-secondary)' : 'var(--danger)', fontWeight: 600 }}>
                        {otpTimer > 0 ? `Code expires in: ${Math.floor(otpTimer / 60)}:${(otpTimer % 60).toString().padStart(2, '0')}` : 'Code expired'}
                      </span>
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={!canResendOtp || regLoading}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: canResendOtp ? 'var(--primary)' : 'var(--text-secondary)',
                          cursor: canResendOtp ? 'pointer' : 'default',
                          fontWeight: 600,
                          fontSize: '0.75rem'
                        }}
                      >
                        Resend Code
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setRegStep(1)}
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '0.7rem' }}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={regLoading || otp.length !== 6}
                      className="btn btn-primary"
                      style={{ flex: 2, padding: '0.7rem', fontWeight: 700 }}
                    >
                      {regLoading ? 'Validating...' : 'Verify Code'}
                    </button>
                  </div>
                </form>
              )}

              {/* Step 3: Password Creation */}
              {regStep === 3 && (
                <form onSubmit={handlePasswordNext}>
                  <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>
                      Create Account Password
                    </h3>
                    <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: 0 }}>
                      Set a secure password for student sign-in
                    </p>
                  </div>

                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      Password *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Lock size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        placeholder="At least 6 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem 2.4rem 0.65rem 2.4rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                      >
                        {showRegPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: '1.75rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      Confirm Password *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Lock size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        placeholder="Re-enter password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem 0.75rem 0.65rem 2.4rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setRegStep(2)}
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '0.7rem' }}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ flex: 2, padding: '0.7rem', fontWeight: 700 }}
                    >
                      Next: Face Enrollment →
                    </button>
                  </div>
                </form>
              )}

              {/* Step 4: Biometric Face Enrollment */}
              {regStep === 4 && (
                <div>
                  <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>
                      Biometric Face Enrollment
                    </h3>
                    <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: 0 }}>
                      Capture <strong>ONE</strong> high-quality reference face image for facial verification.
                    </p>
                  </div>

                  <div style={{
                    position: 'relative',
                    width: '100%',
                    height: '280px',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    backgroundColor: '#0f172a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '1.25rem',
                    border: '2px solid var(--border-color)'
                  }}>
                    {capturedPhoto ? (
                      <img
                        src={capturedPhoto}
                        alt="Captured Reference Face"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <>
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        {/* Biometric Target Face Overlay */}
                        <div style={{
                          position: 'absolute',
                          width: '180px',
                          height: '230px',
                          border: '2px dashed #38bdf8',
                          borderRadius: '50%',
                          pointerEvents: 'none',
                          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)'
                        }} />
                      </>
                    )}
                  </div>

                  {capturedPhoto ? (
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button
                        type="button"
                        onClick={retakePhoto}
                        disabled={regLoading}
                        className="btn btn-secondary"
                        style={{ flex: 1, padding: '0.75rem', fontWeight: 600 }}
                      >
                        Retake Photo
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCompleteRegistration(false)}
                        disabled={regLoading}
                        className="btn btn-primary"
                        style={{ flex: 2, padding: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                      >
                        {regLoading ? (
                          <>
                            <RefreshCw size={16} className="animate-spin" />
                            <span>Enrolling Biometrics...</span>
                          </>
                        ) : (
                          <>
                            <span>Complete Registration</span>
                            <CheckCircle2 size={16} />
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button
                        type="button"
                        onClick={() => setRegStep(3)}
                        className="btn btn-secondary"
                        style={{ flex: 1, padding: '0.75rem' }}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={captureReferenceShot}
                        disabled={!cameraActive}
                        className="btn btn-primary"
                        style={{
                          flex: 2,
                          padding: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: '#059669',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        <Camera size={18} />
                        <span>Capture Reference Face</span>
                      </button>
                    </div>
                  )}

                  <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleCompleteRegistration(true)}
                      disabled={regLoading}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                    >
                      Skip face enrollment for now (Enroll later in profile)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
  );
}
