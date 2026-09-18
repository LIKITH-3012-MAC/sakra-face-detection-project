import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserPlus,
  Camera,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Video,
  VideoOff,
  Smile,
  ShieldCheck,
  Compass,
  Sliders,
  Check
} from 'lucide-react';
import {
  createStudent,
  registerStudentFace,
  captureFaceFrame,
  getDatasetStatus,
  validatePreviewFrame
} from '../services/api';
import Toast from '../components/Toast';

export default function RegisterStudent() {
  const navigate = useNavigate();

  // Step 1: Form, Step 2: Capture Dataset, Step 3: Enrolled
  const [step, setStep] = useState(1);

  // Form State
  const [formData, setFormData] = useState({
    student_id: '',
    name: '',
    roll_number: '',
    department: 'Computer Science',
    year: '4th Year',
    section: 'A',
    email: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [registeredStudent, setRegisteredStudent] = useState(null);

  // Webcam & Capture State
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);
  const [minRequired, setMinRequired] = useState(25);
  const [targetImages, setTargetImages] = useState(30);
  const [isCapturing, setIsCapturing] = useState(false);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [detectedBbox, setDetectedBbox] = useState(null); // [x, y, w, h]
  const [liveQualityFeedback, setLiveQualityFeedback] = useState(null);
  const [datasetQualitySummary, setDatasetQualitySummary] = useState(null);
  const [training, setTraining] = useState(false);
  const [trainedModelVersion, setTrainedModelVersion] = useState(null);

  // Browser Camera Refs
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const autoCaptureIntervalRef = useRef(null);
  const previewLoopRef = useRef(null);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Form Input Validation
  const validateForm = () => {
    const errors = {};
    if (!formData.student_id.trim()) errors.student_id = 'Student ID is required';
    if (!formData.name.trim()) errors.name = 'Full name is required';
    if (!formData.roll_number.trim()) errors.roll_number = 'Roll number is required';
    if (!formData.department.trim()) errors.department = 'Department is required';
    if (!formData.year.trim()) errors.year = 'Year is required';
    if (!formData.section.trim()) errors.section = 'Section is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  // Step 1: Submit Form
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const res = await createStudent(formData);
      setRegisteredStudent(res.data);
      showToast('Student profile created! Proceeding to face capture...', 'success');
      setStep(2);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2: Camera Controls
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.log('Play handled:', e));
      }
      setCameraActive(true);
      showToast('Webcam connected. Position your face in center.', 'success');
    } catch (err) {
      showToast(`Camera access error: ${err.message}`, 'error');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (previewLoopRef.current) {
      clearInterval(previewLoopRef.current);
      previewLoopRef.current = null;
    }
    if (autoCaptureIntervalRef.current) {
      clearInterval(autoCaptureIntervalRef.current);
      autoCaptureIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setDetectedBbox(null);
    setCameraActive(false);
    setIsCapturing(false);
  };

  // Auto-start camera when reaching Step 2
  useEffect(() => {
    if (step === 2 && !cameraActive) {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [step]);

  // Real-time Face Detection Preview Loop (Active when in Step 2 and camera is on, but not auto-sampling)
  useEffect(() => {
    if (step === 2 && cameraActive && !isCapturing) {
      if (previewLoopRef.current) clearInterval(previewLoopRef.current);
      previewLoopRef.current = setInterval(async () => {
        const frameBase64 = grabFrameBase64();
        if (!frameBase64) return;
        try {
          const res = await validatePreviewFrame(frameBase64);
          if (res.data) {
            setDetectedBbox(res.data.bbox || null);
            setLiveQualityFeedback({
              valid: res.data.is_valid,
              text: res.message
            });
          }
        } catch (e) {
          // Silent preview check error
        }
      }, 450);
    } else {
      if (previewLoopRef.current) {
        clearInterval(previewLoopRef.current);
        previewLoopRef.current = null;
      }
    }
    return () => {
      if (previewLoopRef.current) {
        clearInterval(previewLoopRef.current);
        previewLoopRef.current = null;
      }
    };
  }, [step, cameraActive, isCapturing]);

  // Single Frame Capture Helper
  const grabFrameBase64 = () => {
    if (!videoRef.current || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (video.videoWidth === 0) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  // Compute Capture Guidance Phase (Section 19)
  const getCaptureGuidance = (count) => {
    if (count < 6) return { phase: 1, text: 'Look directly at camera with neutral expression', icon: '👤' };
    if (count < 12) return { phase: 2, text: 'Turn your head slightly to the LEFT (~10°)', icon: '👈' };
    if (count < 18) return { phase: 3, text: 'Turn your head slightly to the RIGHT (~10°)', icon: '👉' };
    if (count < 24) return { phase: 4, text: 'Tilt head slightly UP and DOWN', icon: '👆' };
    return { phase: 5, text: 'Slight smile and natural eye movement', icon: '😊' };
  };

  // Fetch Dataset Summary from Backend
  const refreshDatasetSummary = async (studentId) => {
    try {
      const res = await getDatasetStatus(studentId);
      if (res.success && res.data) {
        setDatasetQualitySummary(res.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Single Face Photo Enrollment (1 Photo -> Biometric Verification Profile)
  const handleCaptureOnePhoto = async () => {
    if (!cameraActive) {
      showToast('Camera is not active. Connect camera first.', 'error');
      return;
    }

    const frameBase64 = grabFrameBase64();
    if (!frameBase64) {
      showToast('Could not grab frame from camera. Try again.', 'error');
      return;
    }

    setIsCapturing(true);
    setLiveQualityFeedback({ valid: true, text: 'Enrolling face biometrics...' });

    try {
      const studentId = registeredStudent?.student_id;
      const res = await registerStudentFace(studentId, frameBase64);
      if (res.success) {
        setCapturedCount(1);
        setTrainedModelVersion(1);
        showToast('Face captured & biometric profile enrolled successfully!', 'success');
        stopCamera();
        setStep(3);
      } else {
        showToast(res.message || 'Face validation failed.', 'error');
        setLiveQualityFeedback({ valid: false, text: `⚠️ ${res.message || res.data?.reason}` });
      }
    } catch (err) {
      showToast(err.message || 'Biometric enrollment error', 'error');
      setLiveQualityFeedback({ valid: false, text: `⚠️ ${err.message}` });
    } finally {
      setIsCapturing(false);
    }
  };

  const guidance = getCaptureGuidance(capturedCount);
  const progressPercentage = Math.min(100, Math.round((capturedCount / targetImages) * 100));

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Student Registration & Face Enrollment</h1>
          <p className="page-subtitle">
            One-shot reference face capture and biometric profile enrollment
          </p>
        </div>
      </div>

      {/* Step Indicators */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2rem',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: step >= 1 ? 'var(--primary)' : 'var(--border-color)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.875rem'
          }}>
            1
          </div>
          <span style={{ fontWeight: step === 1 ? 700 : 500, fontSize: '0.875rem' }}>1. Academic Details</span>
        </div>

        <div style={{ width: '40px', height: '2px', backgroundColor: step >= 2 ? 'var(--primary)' : 'var(--border-color)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: step >= 2 ? 'var(--primary)' : 'var(--border-color)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.875rem'
          }}>
            2
          </div>
          <span style={{ fontWeight: step === 2 ? 700 : 500, fontSize: '0.875rem' }}>2. Reference Face Photo</span>
        </div>

        <div style={{ width: '40px', height: '2px', backgroundColor: step >= 3 ? 'var(--primary)' : 'var(--border-color)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: step >= 3 ? 'var(--success)' : 'var(--border-color)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.875rem'
          }}>
            3
          </div>
          <span style={{ fontWeight: step === 3 ? 700 : 500, fontSize: '0.875rem' }}>3. Face Enrolled</span>
        </div>
      </div>

      {/* STEP 1: Registration Form */}
      {step === 1 && (
        <div className="card" style={{ maxWidth: '750px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserPlus size={20} color="var(--primary)" />
            Step 1: Student Academic Details
          </h2>

          <form onSubmit={handleRegisterSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Student ID *</label>
                <input
                  type="text"
                  name="student_id"
                  className="form-control"
                  placeholder="Enter student ID"
                  value={formData.student_id}
                  onChange={handleInputChange}
                />
                {formErrors.student_id && (
                  <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {formErrors.student_id}
                  </p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Roll Number *</label>
                <input
                  type="text"
                  name="roll_number"
                  className="form-control"
                  placeholder="Enter roll number"
                  value={formData.roll_number}
                  onChange={handleInputChange}
                />
                {formErrors.roll_number && (
                  <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {formErrors.roll_number}
                  </p>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                type="text"
                name="name"
                className="form-control"
                placeholder="Enter full name"
                value={formData.name}
                onChange={handleInputChange}
              />
              {formErrors.name && (
                <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {formErrors.name}
                </p>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Department *</label>
                <select
                  name="department"
                  className="form-select"
                  value={formData.department}
                  onChange={handleInputChange}
                >
                  <option value="Computer Science">Computer Science</option>
                  <option value="Information Technology">Information Technology</option>
                  <option value="Electronics & Communication">Electronics & Communication</option>
                  <option value="Mechanical Engineering">Mechanical Engineering</option>
                  <option value="Civil Engineering">Civil Engineering</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Year *</label>
                <select
                  name="year"
                  className="form-select"
                  value={formData.year}
                  onChange={handleInputChange}
                >
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="4th Year">4th Year</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Section *</label>
                <select
                  name="section"
                  className="form-select"
                  value={formData.section}
                  onChange={handleInputChange}
                >
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                  <option value="D">Section D</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email (Optional)</label>
              <input
                type="email"
                name="email"
                className="form-control"
                placeholder="Enter email address"
                value={formData.email}
                onChange={handleInputChange}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
                style={{ minWidth: '180px' }}
              >
                {submitting ? 'Creating Profile...' : 'Next: Start Camera →'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 2: Reference Face Capture (1 Photo) */}
      {step === 2 && (
        <div className="card" style={{ maxWidth: '850px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem' }}>
                Capture Reference Face: {registeredStudent?.name}
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Student ID: <code className="code-font">{registeredStudent?.student_id}</code> | Roll: <strong>{registeredStudent?.roll_number}</strong>
              </p>
            </div>
            <span className="badge badge-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8125rem' }}>
              1 Photo Enrollment
            </span>
          </div>

          {/* Guidance Banner */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#eef2ff',
            border: '1px solid #c7d2fe',
            color: '#3730a3',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1.25rem',
            fontSize: '0.875rem',
            fontWeight: 600
          }}>
            <span style={{ fontSize: '1.25rem' }}>👤</span>
            <span>Guidance: Look directly at the camera with a neutral expression. Ensure good lighting and hold steady.</span>
          </div>

          {/* Video Viewport */}
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: '640px',
            height: '420px',
            margin: '0 auto 1.25rem',
            backgroundColor: '#0f172a',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid var(--border-color)'
          }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: cameraActive ? 'block' : 'none'
              }}
            />

            {!cameraActive && (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
                <Camera size={48} style={{ marginBottom: '0.75rem', opacity: 0.7 }} />
                <p style={{ fontWeight: 600, color: 'white', marginBottom: '0.25rem' }}>Camera Preview Off</p>
                <button onClick={startCamera} className="btn btn-primary">
                  <Video size={16} /> Turn On Webcam
                </button>
              </div>
            )}

            {/* Target Face Guide Oval */}
            {cameraActive && (
              <div style={{
                position: 'absolute',
                border: '2px dashed rgba(255, 255, 255, 0.65)',
                borderRadius: '50%',
                width: '230px',
                height: '290px',
                pointerEvents: 'none',
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.28)'
              }} />
            )}

            {/* Dynamic Detected Face Bounding Box */}
            {cameraActive && detectedBbox && (
              <div style={{
                position: 'absolute',
                left: `${(detectedBbox[0] / 640) * 100}%`,
                top: `${(detectedBbox[1] / 480) * 100}%`,
                width: `${(detectedBbox[2] / 640) * 100}%`,
                height: `${(detectedBbox[3] / 480) * 100}%`,
                border: '2.5px solid #10b981',
                borderRadius: '6px',
                boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)',
                pointerEvents: 'none',
                transition: 'all 0.15s ease'
              }}>
                <span style={{
                  position: 'absolute',
                  top: '-24px',
                  left: 0,
                  backgroundColor: '#10b981',
                  color: 'white',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  Face Detected ✓
                </span>
              </div>
            )}
          </div>

          {/* Live Quality Feedback Banner */}
          {liveQualityFeedback && (
            <div style={{
              padding: '0.65rem 1rem',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '1rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
              backgroundColor: liveQualityFeedback.valid ? 'var(--success-bg)' : 'var(--danger-bg)',
              color: liveQualityFeedback.valid ? '#065f46' : '#991b1b',
              border: `1px solid ${liveQualityFeedback.valid ? '#a7f3d0' : '#fecaca'}`
            }}>
              {liveQualityFeedback.text}
            </div>
          )}

          {/* Action Button */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '1.25rem' }}>
            <button
              onClick={handleCaptureOnePhoto}
              className="btn btn-primary"
              disabled={!cameraActive || isCapturing}
              style={{
                padding: '0.85rem 2.25rem',
                fontSize: '1rem',
                fontWeight: 700,
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
              }}
            >
              <Camera size={20} />
              {isCapturing ? 'Enrolling Face Profile...' : '📸 Capture & Enroll Face'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Biometric Profile Enrolled */}
      {step === 3 && (
        <div className="card" style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            backgroundColor: 'var(--success-bg)',
            color: 'var(--success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem'
          }}>
            <CheckCircle2 size={40} />
          </div>

          <h2 style={{ fontSize: '1.6rem', marginBottom: '0.5rem', fontWeight: 800 }}>
            Biometric Profile Enrolled!
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.75rem', fontSize: '0.925rem' }}>
            Reference face photo and biometric verification profile for <strong>{registeredStudent?.name}</strong> have been saved successfully.
          </p>

          <div style={{
            backgroundColor: 'var(--bg-main)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            textAlign: 'left',
            marginBottom: '2rem',
            fontSize: '0.875rem',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Student ID:</span>
                <p className="code-font" style={{ fontWeight: 700 }}>{registeredStudent?.student_id}</p>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Roll Number:</span>
                <p style={{ fontWeight: 600 }}>{registeredStudent?.roll_number}</p>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Department:</span>
                <p style={{ fontWeight: 600 }}>{registeredStudent?.department} ({registeredStudent?.section})</p>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Biometric Profile:</span>
                <p style={{ fontWeight: 700, color: 'var(--success)' }}>Enrolled & Active</p>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Verification Status:</span>
                <p style={{ fontWeight: 700, color: 'var(--primary)' }}>Ready</p>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                <p style={{ fontWeight: 700, color: 'var(--success)' }}>Active & Verified ✓</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button
              onClick={() => {
                setStep(1);
                setFormData({
                  student_id: '',
                  name: '',
                  roll_number: '',
                  department: 'Computer Science',
                  year: '4th Year',
                  section: 'A',
                  email: ''
                });
                setCapturedCount(0);
                setRegisteredStudent(null);
                setLiveQualityFeedback(null);
                setDatasetQualitySummary(null);
              }}
              className="btn btn-secondary"
            >
              Enroll Next Student
            </button>
            <button
              onClick={() => navigate('/admin/live-attendance')}
              className="btn btn-primary"
            >
              Test Live Attendance →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
