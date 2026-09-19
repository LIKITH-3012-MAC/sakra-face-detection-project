import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Camera,
  CameraOff,
  Play,
  Square,
  RefreshCw,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Wifi,
  Battery,
  Signal,
  ChevronLeft,
  Calendar,
  Clock,
  MapPin,
  Mail,
  Sparkles,
  Smartphone,
  Layers,
  Check,
  ShieldCheck
} from 'lucide-react';
import {
  getLiveStatus,
  getTodayAttendance,
  recognizeFrame,
  markAttendance,
  API_URL
} from '../services/api';
import { formatTime, getStatusBadge } from '../utils/formatters';
import Toast from '../components/Toast';
import MobileDeviceStatusBar from '../components/MobileDeviceStatusBar';

// Audio chime using browser Web Audio API
const playSuccessChime = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.42);
  } catch (e) {
    // Audio optional
  }
};

/**
 * Modern Segmented Radial Notch Ring (60 radial ticks around a circle)
 */
function SegmentedNotchRing({ state, progress = 75 }) {
  const ticks = useMemo(() => {
    const arr = [];
    const count = 60;
    const cx = 150;
    const cy = 150;
    const rIn = 126;
    const rOut = 138;

    for (let i = 0; i < count; i++) {
      const angle = (i * 2 * Math.PI) / count;
      const x1 = cx + rIn * Math.cos(angle);
      const y1 = cy + rIn * Math.sin(angle);
      const x2 = cx + rOut * Math.cos(angle);
      const y2 = cy + rOut * Math.sin(angle);
      arr.push({ id: i, x1, y1, x2, y2, angle });
    }
    return arr;
  }, []);

  const getTickColor = (index) => {
    if (state === 'SUCCESS') return '#10b981';
    if (state === 'ALREADY_MARKED') return '#38bdf8';
    if (state === 'UNKNOWN') return '#ef4444';
    if (state === 'MULTIPLE_FACES') return '#f59e0b';
    if (state === 'MATCHING') {
      const activeTicks = Math.round((progress / 100) * 60);
      return index <= activeTicks ? '#10b981' : 'rgba(16, 185, 129, 0.25)';
    }
    if (state === 'DETECTED') return '#34d399';
    return 'rgba(16, 185, 129, 0.4)';
  };

  return (
    <svg
      viewBox="0 0 300 300"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 5
      }}
    >
      {/* Outer subtle glow circle */}
      <circle
        cx="150"
        cy="150"
        r="140"
        fill="none"
        stroke={
          state === 'SUCCESS'
            ? 'rgba(16, 185, 129, 0.4)'
            : state === 'ALREADY_MARKED'
            ? 'rgba(56, 189, 248, 0.4)'
            : 'rgba(16, 185, 129, 0.15)'
        }
        strokeWidth="1.5"
      />

      {/* 60 Radial Segmented Ticks */}
      {ticks.map((t) => (
        <line
          key={t.id}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={getTickColor(t.id)}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ transition: 'stroke 0.25s ease' }}
        />
      ))}

      {/* Inner guiding circle */}
      <circle
        cx="150"
        cy="150"
        r="124"
        fill="none"
        stroke={
          state === 'SUCCESS'
            ? '#10b981'
            : state === 'ALREADY_MARKED'
            ? '#38bdf8'
            : 'rgba(16, 185, 129, 0.3)'
        }
        strokeWidth="1"
      />
    </svg>
  );
}

/**
 * Biometric Wireframe Face Mesh Drawing Helper
 * Renders anthropometrically proportioned triangulated mesh on detected face
 */
function drawFaceWireframe(ctx, bbox, canvasW, canvasH, isMatching = false) {
  if (!bbox || bbox.length !== 4) return;
  const [left, top, w, h] = bbox;

  // Canonical landmarks calculated from bounding box
  const cx = left + w * 0.5;
  const pTop = { x: cx, y: top + h * 0.08 };
  const pForeheadL = { x: left + w * 0.28, y: top + h * 0.16 };
  const pForeheadR = { x: left + w * 0.72, y: top + h * 0.16 };
  const pTempleL = { x: left + w * 0.12, y: top + h * 0.28 };
  const pTempleR = { x: left + w * 0.88, y: top + h * 0.28 };

  const pBrowInL = { x: left + w * 0.42, y: top + h * 0.30 };
  const pBrowMidL = { x: left + w * 0.30, y: top + h * 0.27 };
  const pBrowInR = { x: left + w * 0.58, y: top + h * 0.30 };
  const pBrowMidR = { x: left + w * 0.70, y: top + h * 0.27 };

  const pEyeL = { x: left + w * 0.32, y: top + h * 0.37 };
  const pEyeR = { x: left + w * 0.68, y: top + h * 0.37 };

  const pNoseBridge = { x: cx, y: top + h * 0.45 };
  const pNoseTip = { x: cx, y: top + h * 0.60 };
  const pNoseWingL = { x: left + w * 0.38, y: top + h * 0.58 };
  const pNoseWingR = { x: left + w * 0.62, y: top + h * 0.58 };

  const pCheekL = { x: left + w * 0.18, y: top + h * 0.55 };
  const pCheekR = { x: left + w * 0.82, y: top + h * 0.55 };

  const pMouthL = { x: left + w * 0.35, y: top + h * 0.73 };
  const pMouthR = { x: left + w * 0.65, y: top + h * 0.73 };
  const pMouthTop = { x: cx, y: top + h * 0.70 };
  const pMouthBot = { x: cx, y: top + h * 0.78 };

  const pJawL = { x: left + w * 0.22, y: top + h * 0.82 };
  const pJawR = { x: left + w * 0.78, y: top + h * 0.82 };
  const pChin = { x: cx, y: top + h * 0.94 };

  const meshLines = [
    // Forehead and temples
    [pTop, pForeheadL], [pTop, pForeheadR],
    [pForeheadL, pTempleL], [pForeheadR, pTempleR],
    [pForeheadL, pBrowMidL], [pForeheadR, pBrowMidR],
    [pTop, pBrowInL], [pTop, pBrowInR],
    [pBrowInL, pBrowInR],

    // Brows to eyes and nose bridge
    [pBrowInL, pNoseBridge], [pBrowInR, pNoseBridge],
    [pBrowMidL, pEyeL], [pBrowMidR, pEyeR],
    [pTempleL, pEyeL], [pTempleR, pEyeR],
    [pEyeL, pNoseBridge], [pEyeR, pNoseBridge],

    // Nose triangulation
    [pNoseBridge, pNoseTip],
    [pNoseBridge, pNoseWingL], [pNoseBridge, pNoseWingR],
    [pNoseWingL, pNoseTip], [pNoseWingR, pNoseTip],

    // Cheeks
    [pEyeL, pCheekL], [pEyeR, pCheekR],
    [pCheekL, pNoseWingL], [pCheekR, pNoseWingR],
    [pCheekL, pJawL], [pCheekR, pJawR],

    // Mouth
    [pNoseTip, pMouthTop],
    [pNoseWingL, pMouthL], [pNoseWingR, pMouthR],
    [pMouthL, pMouthTop], [pMouthR, pMouthTop],
    [pMouthL, pMouthBot], [pMouthR, pMouthBot],

    // Jawline & Chin
    [pMouthBot, pChin],
    [pJawL, pChin], [pJawR, pChin],
    [pCheekL, pMouthL], [pCheekR, pMouthR]
  ];

  ctx.save();
  ctx.lineWidth = isMatching ? 1.6 : 1.2;
  ctx.strokeStyle = isMatching ? 'rgba(52, 211, 153, 0.75)' : 'rgba(52, 211, 153, 0.55)';
  ctx.fillStyle = '#34d399';
  ctx.shadowBlur = isMatching ? 8 : 4;
  ctx.shadowColor = '#10b981';

  // Draw triangulated mesh lines
  meshLines.forEach(([p1, p2]) => {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  });

  // Draw landmark vertex dots
  const allPoints = [
    pTop, pForeheadL, pForeheadR, pTempleL, pTempleR,
    pBrowInL, pBrowMidL, pBrowInR, pBrowMidR,
    pEyeL, pEyeR, pNoseBridge, pNoseTip, pNoseWingL, pNoseWingR,
    pCheekL, pCheekR, pMouthL, pMouthR, pMouthTop, pMouthBot,
    pJawL, pJawR, pChin
  ];

  allPoints.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, isMatching ? 2.5 : 2.0, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function renderEmailBadge(record) {
  const status = (record?.email_status || record?.email_notification || '').toLowerCase();

  if (status === 'sent') {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: '#059669',
        backgroundColor: '#ecfdf5',
        border: '1px solid #a7f3d0',
        borderRadius: '9999px',
        padding: '2px 8px'
      }}>
        <CheckCircle2 size={12} />
        <span>Email Sent</span>
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: '#dc2626',
        backgroundColor: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '9999px',
        padding: '2px 8px'
      }}>
        <AlertTriangle size={12} />
        <span>Email Failed</span>
      </span>
    );
  }

  if (status === 'not_configured' || status === 'skipped') {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        fontSize: '0.75rem',
        fontWeight: 500,
        color: '#6b7280',
        backgroundColor: '#f3f4f6',
        border: '1px solid #e5e7eb',
        borderRadius: '9999px',
        padding: '2px 8px'
      }}>
        <Mail size={12} />
        <span>Email Not Sent</span>
      </span>
    );
  }

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.3rem',
      fontSize: '0.75rem',
      fontWeight: 500,
      color: '#d97706',
      backgroundColor: '#fffbeb',
      border: '1px solid #fde68a',
      borderRadius: '9999px',
      padding: '2px 8px'
    }}>
      <RefreshCw size={11} />
      <span>Email Pending</span>
    </span>
  );
}

export default function LiveAttendance() {
  // View Modes: 'modern_phone' (Mockup matching reference image) or 'split_dashboard'
  const [viewMode, setViewMode] = useState('split_dashboard');

  // UI Recognition States: 'WAITING' | 'DETECTED' | 'MATCHING' | 'SUCCESS' | 'UNKNOWN' | 'ALREADY_MARKED'
  const [uiState, setUiState] = useState('WAITING');
  const [matchingProgress, setMatchingProgress] = useState(0);
  const [recognizedStudent, setRecognizedStudent] = useState(null);
  const [successMeta, setSuccessMeta] = useState(null);

  // Mode: 'automatic' or 'manual'
  const [attendanceMode, setAttendanceMode] = useState('automatic');
  const attendanceModeRef = useRef('automatic');

  // Camera Source: 'browser_camera' (webcam) or 'backend_stream'
  const [cameraSource, setCameraSource] = useState('browser_camera');
  const [isStreaming, setIsStreaming] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  // Today attendance history and logs
  const [markedToday, setMarkedToday] = useState([]);
  const [unknownCount, setUnknownCount] = useState(0);
  const [liveDetections, setLiveDetections] = useState([]);
  const [toast, setToast] = useState(null);

  // Geolocation
  const [geoCoords, setGeoCoords] = useState({ latitude: null, longitude: null, accuracy: null });
  const geoCoordsRef = useRef({ latitude: null, longitude: null, accuracy: null });

  // DOM and Loop Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const browserLoopRef = useRef(null);
  const successResetTimerRef = useRef(null);
  const isProcessingFrameRef = useRef(false);

  useEffect(() => {
    attendanceModeRef.current = attendanceMode;
  }, [attendanceMode]);

  // Request browser geolocation for attendance verification
  const acquireLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          };
          setGeoCoords(coords);
          geoCoordsRef.current = coords;
        },
        (err) => {
          console.warn('GPS location access denied:', err.message);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    }
  };

  useEffect(() => {
    acquireLocation();
  }, []);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchTodayList = async () => {
    try {
      const res = await getTodayAttendance();
      setMarkedToday(res.data || []);
      const statusRes = await getLiveStatus();
      setUnknownCount(statusRes.data?.unknown_face_count || 0);
    } catch (err) {
      console.error('Error fetching today attendance:', err);
    }
  };

  useEffect(() => {
    fetchTodayList();
  }, []);

  // Browser Webcam Engine
  const startBrowserCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported by your browser or requires a secure HTTPS connection.');
      setIsStreaming(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;
        video.muted = true;
        video.setAttribute('playsinline', 'true');
        video.onloadedmetadata = () => {
          video.play().catch((e) => console.warn('Video play caught:', e));
        };
        try {
          await video.play();
        } catch (e) {
          console.warn('Initial video play caught:', e);
        }
      }
      setIsStreaming(true);
      setUiState('WAITING');

      if (browserLoopRef.current) clearInterval(browserLoopRef.current);

      // Main Recognition Loop (every 750ms)
      browserLoopRef.current = setInterval(async () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video.videoWidth === 0 || video.videoHeight === 0) return;

        // Skip processing if currently showing Success or Already Marked card, or if frame is in-flight
        if (uiState === 'SUCCESS' || uiState === 'ALREADY_MARKED' || isProcessingFrameRef.current) return;
        isProcessingFrameRef.current = true;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.82);

        const isAuto = attendanceModeRef.current === 'automatic';

        try {
          const res = await recognizeFrame(
            base64,
            isAuto,
            geoCoordsRef.current.latitude,
            geoCoordsRef.current.longitude,
            geoCoordsRef.current.accuracy
          );

          if (res.success && res.data) {
            const detections = res.data.detections || [];
            setLiveDetections(detections);
            setUnknownCount(res.data.unknown_face_count || 0);

            // Clear overlay canvas
            const overlay = overlayCanvasRef.current;
            if (overlay) {
              overlay.width = video.videoWidth;
              overlay.height = video.videoHeight;
              const octx = overlay.getContext('2d');
              octx.clearRect(0, 0, overlay.width, overlay.height);
            }

            if (detections.length === 0) {
              setUiState('WAITING');
              setMatchingProgress(0);
              return;
            }

            const primaryFace = detections[0];
            const bbox = primaryFace.bbox;

            // Multiple Faces
            if (detections.length > 1) {
              setUiState('MULTIPLE_FACES');
              showToast('Multiple faces detected! Please ensure only one person is in frame.', 'warning');
              return;
            }

            // Exactly ONE face detected
            if (overlay) {
              const octx = overlay.getContext('2d');
              drawFaceWireframe(octx, bbox, video.videoWidth, video.videoHeight, primaryFace.recognized);
            }

            // Recognized Student
            if (primaryFace.recognized && primaryFace.student_id) {
              setRecognizedStudent(primaryFace);

              // Check if auto-marked or already marked today
              const attSuccess = primaryFace.attendance?.success;
              const alreadyMarked = primaryFace.already_marked_today;

              if (attSuccess) {
                setUiState('MATCHING');
                setMatchingProgress(Math.min(95, Math.round(primaryFace.confidence || 75)));

                setTimeout(() => {
                  setMatchingProgress(100);
                  const now = new Date();
                  const timeFormatted = now.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  });
                  const dateFormatted = now.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  });

                  setSuccessMeta({
                    time: timeFormatted,
                    date: dateFormatted,
                    status: primaryFace.attendance?.record?.status || 'Present',
                    emailNotification: primaryFace.attendance?.record?.email_notification || 'sent'
                  });

                  setUiState('SUCCESS');
                  playSuccessChime();
                  fetchTodayList();

                  // Auto reset after 5 seconds to scan next student
                  if (successResetTimerRef.current) clearTimeout(successResetTimerRef.current);
                  successResetTimerRef.current = setTimeout(() => {
                    handleScanNext();
                  }, 5000);
                }, 400);
              } else if (alreadyMarked) {
                setMatchingProgress(100);
                const dateFormatted = new Date().toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                });
                setSuccessMeta({
                  time: primaryFace.last_attendance_time || 'Earlier Session',
                  date: dateFormatted,
                  status: 'Already Present',
                  emailNotification: 'confirmed'
                });
                setUiState('ALREADY_MARKED');
                if (successResetTimerRef.current) clearTimeout(successResetTimerRef.current);
                successResetTimerRef.current = setTimeout(() => {
                  handleScanNext();
                }, 5000);
              } else if (isAuto) {
                setUiState('MATCHING');
                setMatchingProgress(Math.min(90, Math.round(primaryFace.confidence || 85)));
              } else {
                setUiState('DETECTED');
                setMatchingProgress(100);
              }
            } else {
              // Unknown face
              setUiState('UNKNOWN');
              setMatchingProgress(0);
            }
          }
        } catch (e) {
          // Silent frame catch
        } finally {
          isProcessingFrameRef.current = false;
        }
      }, 750);

    } catch (err) {
      setCameraError(err.message || 'Permission denied or webcam unavailable');
      showToast('Cannot access webcam: ' + err.message, 'error');
      setIsStreaming(false);
    }
  };

  const stopBrowserCamera = () => {
    if (browserLoopRef.current) {
      clearInterval(browserLoopRef.current);
      browserLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (successResetTimerRef.current) {
      clearTimeout(successResetTimerRef.current);
    }
    setLiveDetections([]);
    setIsStreaming(false);
    setUiState('WAITING');
    setMatchingProgress(0);
  };

  useEffect(() => {
    startBrowserCamera();
    return () => {
      stopBrowserCamera();
    };
  }, []);

  const handleManualMarkSuccess = async () => {
    if (!recognizedStudent) return;
    try {
      const payload = {
        student_id: recognizedStudent.student_id,
        face_distance: recognizedStudent.distance || 0.35,
        latitude: geoCoordsRef.current.latitude,
        longitude: geoCoordsRef.current.longitude,
        location_accuracy: geoCoordsRef.current.accuracy
      };
      const res = await markAttendance(payload);
      if (res.success && res.data) {
        setSuccessMeta({
          time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
          date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          status: res.data.status || 'Present',
          emailNotification: res.data.email_notification || 'sent'
        });
        setUiState('SUCCESS');
        playSuccessChime();
        fetchTodayList();
      }
    } catch (err) {
      showToast(err.message || 'Failed to record attendance', 'error');
    }
  };

  const handleScanNext = () => {
    if (successResetTimerRef.current) clearTimeout(successResetTimerRef.current);
    setUiState('WAITING');
    setRecognizedStudent(null);
    setSuccessMeta(null);
    setMatchingProgress(0);
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Top Controls Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.5rem',
        padding: '0.75rem 1.25rem',
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            backgroundColor: '#064e3b',
            color: '#34d399',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Camera size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
              Live Attendance
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
              Live Face Verification
            </p>
          </div>
        </div>

        {/* View Mode & Action Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* View Mode Switch */}
          <div className="view-mode-toggle" style={{ display: 'flex', backgroundColor: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', padding: '3px' }}>
            <button
              onClick={() => setViewMode('modern_phone')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.65rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: viewMode === 'modern_phone' ? '#10b981' : 'transparent',
                color: viewMode === 'modern_phone' ? '#ffffff' : 'var(--text-secondary)'
              }}
            >
              <Smartphone size={14} />
              <span>Modern Scanner</span>
            </button>
            <button
              onClick={() => setViewMode('split_dashboard')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.65rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: viewMode === 'split_dashboard' ? '#10b981' : 'transparent',
                color: viewMode === 'split_dashboard' ? '#ffffff' : 'var(--text-secondary)'
              }}
            >
              <Layers size={14} />
              <span>Split Dashboard</span>
            </button>
          </div>

          {/* Mode Selector: Automatic vs Manual */}
          <button
            onClick={() => {
              const newMode = attendanceMode === 'automatic' ? 'manual' : 'automatic';
              setAttendanceMode(newMode);
              showToast('Switched to ' + (newMode === 'automatic' ? 'Automatic' : 'Manual') + ' Mode', 'info');
            }}
            className="btn btn-secondary"
            style={{ fontSize: '0.75rem', padding: '0.45rem 0.75rem', fontWeight: 600 }}
          >
            Mode: <strong style={{ color: attendanceMode === 'automatic' ? '#10b981' : '#f59e0b', marginLeft: '0.25rem' }}>
              {attendanceMode === 'automatic' ? 'Automatic (Auto-Mark)' : 'Manual'}
            </strong>
          </button>

          {/* Camera Start / Stop */}
          {isStreaming ? (
            <button
              onClick={stopBrowserCamera}
              className="btn btn-danger"
              style={{ fontSize: '0.75rem', padding: '0.45rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Square size={14} />
              <span>Stop Camera</span>
            </button>
          ) : (
            <button
              onClick={startBrowserCamera}
              className="btn btn-primary"
              style={{ fontSize: '0.75rem', padding: '0.45rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#059669' }}
            >
              <Play size={14} />
              <span>Start Camera</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Layout Container */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: '2rem',
        flexWrap: 'wrap'
      }}>
        {/* ============================================================ */}
        {/* MODERN PHONE FACE RECOGNITION CONTAINER (Matching Reference) */}
        {/* ============================================================ */}
        <div
          className="phone-scanner-frame"
          style={{
            width: '100%',
            maxWidth: '420px',
            minHeight: 'min(680px, 90vh)',
            backgroundColor: '#061a12',
            backgroundImage: 'radial-gradient(circle at 50% 20%, #0d3824 0%, #061a12 65%, #020d09 100%)',
            borderRadius: '36px',
            border: '6px solid #0f172a',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(16, 185, 129, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
            fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif',
            color: '#ffffff'
          }}
        >
          {/* Hidden Canvas for Frame Capture */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Real Live Device Status Bar (Local Time, Battery API, Honest Network) */}
          <MobileDeviceStatusBar theme="dark" showNotch={true} />

          {/* Top Navigation Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1.5rem',
            zIndex: 10
          }}>
            <button
              onClick={handleScanNext}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Reset / Back"
            >
              <ChevronLeft size={20} />
            </button>

            <span style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
              Face Verification
            </span>

            <div style={{ width: '36px' }} />
          </div>

          {/* Subtitle Prompt */}
          <div style={{
            textAlign: 'center',
            padding: '0 1.5rem',
            minHeight: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10
          }}>
            {uiState === 'SUCCESS' ? (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '0.35rem 0.85rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: '#34d399'
              }}>
                <CheckCircle2 size={14} />
                <span>Attendance Marked</span>
              </div>
            ) : uiState === 'ALREADY_MARKED' ? (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                padding: '0.35rem 0.85rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: '#38bdf8'
              }}>
                <CheckCircle2 size={14} />
                <span>Attendance Already Recorded</span>
              </div>
            ) : uiState === 'MULTIPLE_FACES' ? (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                padding: '0.35rem 0.85rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: '#fbbf24'
              }}>
                <AlertTriangle size={14} />
                <span>Multiple Faces Detected</span>
              </div>
            ) : uiState === 'MATCHING' ? (
              <span style={{ fontSize: '0.825rem', color: '#a7f3d0', fontWeight: 600 }}>
                Verifying identity...
              </span>
            ) : uiState === 'DETECTED' ? (
              <span style={{ fontSize: '0.825rem', color: '#34d399', fontWeight: 600 }}>
                Face aligned in camera reticle
              </span>
            ) : uiState === 'UNKNOWN' ? (
              <span style={{ fontSize: '0.825rem', color: '#f87171', fontWeight: 600 }}>
                Face not recognized. Please register or try again.
              </span>
            ) : (
              <span style={{ fontSize: '0.825rem', color: 'rgba(255, 255, 255, 0.75)', fontWeight: 500 }}>
                Please put your face in front of the camera
              </span>
            )}
          </div>

          {/* ============================================================ */}
          {/* CENTER VIEWPORT (Camera, Reticle, Face Mesh, or Success Card) */}
          {/* ============================================================ */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            padding: '1rem'
          }}>
            {/* SUCCESS / ALREADY_MARKED STATE UI */}
            {(uiState === 'SUCCESS' || uiState === 'ALREADY_MARKED') && recognizedStudent ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                width: '100%',
                padding: '0 1rem',
                animation: 'fadeInScale 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
              }}>
                {/* Circular Student Avatar with Checkmark Badge */}
                <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
                  <div style={{
                    width: '120px',
                    height: '120px',
                    borderRadius: '50%',
                    border: `3.5px solid ${uiState === 'ALREADY_MARKED' ? '#38bdf8' : '#10b981'}`,
                    boxShadow: `0 0 25px ${uiState === 'ALREADY_MARKED' ? 'rgba(56, 189, 248, 0.45)' : 'rgba(16, 185, 129, 0.45)'}`,
                    overflow: 'hidden',
                    backgroundColor: '#064e3b'
                  }}>
                    <img
                      src={`${API_URL}/api/students/${recognizedStudent.student_id}/photo`}
                      alt={recognizedStudent.name}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(recognizedStudent.name || 'Student')}&background=064e3b&color=34d399&bold=true`;
                      }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>

                  {/* Checkmark Badge on Avatar */}
                  <div style={{
                    position: 'absolute',
                    bottom: '2px',
                    right: '4px',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: uiState === 'ALREADY_MARKED' ? '#0284c7' : '#10b981',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '3px solid #061a12',
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)'
                  }}>
                    <Check size={18} strokeWidth={3} />
                  </div>
                </div>

                {/* Welcome Back & Student Details */}
                <span style={{ fontSize: '0.9rem', color: uiState === 'ALREADY_MARKED' ? '#38bdf8' : '#34d399', fontWeight: 700, marginBottom: '0.2rem' }}>
                  {uiState === 'ALREADY_MARKED' ? 'Verified • Already Recorded' : 'Welcome Back!'}
                </span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.35rem 0', color: '#ffffff' }}>
                  {recognizedStudent.name}
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.7)', margin: '0 0 1.25rem 0' }}>
                  ID: {recognizedStudent.student_id} • {recognizedStudent.department || 'Computer Science'} - Section {recognizedStudent.section || 'A'}
                </p>

                {/* Frosted Glass Details Card */}
                <div style={{
                  width: '100%',
                  backgroundColor: 'rgba(6, 40, 26, 0.65)',
                  backdropFilter: 'blur(12px)',
                  border: `1px solid ${uiState === 'ALREADY_MARKED' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(52, 211, 153, 0.25)'}`,
                  borderRadius: '18px',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                  marginBottom: '1.25rem',
                  fontSize: '0.825rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(255, 255, 255, 0.75)' }}>
                      <Calendar size={15} style={{ color: uiState === 'ALREADY_MARKED' ? '#38bdf8' : '#34d399' }} />
                      <span>Date</span>
                    </div>
                    <span style={{ fontWeight: 600, color: '#ffffff' }}>
                      {successMeta?.date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(255, 255, 255, 0.75)' }}>
                      <Clock size={15} style={{ color: uiState === 'ALREADY_MARKED' ? '#38bdf8' : '#34d399' }} />
                      <span>Time Recorded</span>
                    </div>
                    <span style={{ fontWeight: 600, color: '#ffffff' }}>
                      {recognizedStudent.last_attendance_time || successMeta?.time || 'Recorded'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(255, 255, 255, 0.75)' }}>
                      <ShieldCheck size={15} style={{ color: uiState === 'ALREADY_MARKED' ? '#38bdf8' : '#34d399' }} />
                      <span>Attendance Status</span>
                    </div>
                    <span style={{
                      fontWeight: 700,
                      color: '#34d399',
                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '6px'
                    }}>
                      Present
                    </span>
                  </div>
                </div>

                {/* Pill Button: Attendance Recorded / Scan Next */}
                <button
                  onClick={handleScanNext}
                  style={{
                    width: '100%',
                    padding: '0.85rem',
                    backgroundColor: uiState === 'ALREADY_MARKED' ? '#0284c7' : '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '9999px',
                    fontSize: '0.95rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: uiState === 'ALREADY_MARKED' ? '0 4px 15px rgba(2, 132, 199, 0.4)' : '0 4px 15px rgba(16, 185, 129, 0.4)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Check size={20} strokeWidth={3} />
                  <span>{uiState === 'ALREADY_MARKED' ? 'Already Marked • Scan Next' : 'Attendance Recorded'}</span>
                </button>
              </div>
            ) : (
              /* SCANNING / DETECTION / MATCHING / WAITING VIEWPORT */
              <div
                className="reticle-container"
                style={{
                  position: 'relative',
                  width: 'clamp(230px, 68vw, 280px)',
                  height: 'clamp(230px, 68vw, 280px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {/* Circular Segmented Notch Ring */}
                <SegmentedNotchRing state={uiState} progress={matchingProgress} />

                {/* Circular Video Feed Viewport */}
                <div
                  className="reticle-video-wrapper"
                  style={{
                    width: 'clamp(195px, 58vw, 240px)',
                    height: 'clamp(195px, 58vw, 240px)',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    position: 'relative',
                    backgroundColor: '#04150e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {/* Real-time Video Element */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: 'scaleX(-1)'
                    }}
                  />

                  {/* Face Mesh / Wireframe Overlay Canvas */}
                  <canvas
                    ref={overlayCanvasRef}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: 'scaleX(-1)',
                      pointerEvents: 'none',
                      zIndex: 3
                    }}
                  />

                  {/* Camera Inactive Screen */}
                  {!isStreaming && !cameraError && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundColor: 'rgba(4, 21, 14, 0.95)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 10
                    }}>
                      <CameraOff size={32} color="#10b981" style={{ marginBottom: '0.5rem', opacity: 0.6 }} />
                      <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', marginBottom: '0.75rem' }}>
                        Camera Off
                      </span>
                      <button
                        onClick={startBrowserCamera}
                        className="btn btn-primary"
                        style={{ fontSize: '0.75rem', padding: '0.4rem 0.85rem', backgroundColor: '#059669' }}
                      >
                        Start Camera
                      </button>
                    </div>
                  )}

                  {/* Camera Error Screen */}
                  {cameraError && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundColor: 'rgba(24, 10, 10, 0.95)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '1rem',
                      textAlign: 'center',
                      zIndex: 10
                    }}>
                      <AlertCircle size={30} color="#ef4444" style={{ marginBottom: '0.5rem' }} />
                      <span style={{ fontSize: '0.75rem', color: '#fca5a5', marginBottom: '0.75rem', lineHeight: 1.3 }}>
                        {cameraError}
                      </span>
                      <button
                        onClick={startBrowserCamera}
                        className="btn btn-primary"
                        style={{ fontSize: '0.7rem', padding: '0.35rem 0.75rem', backgroundColor: '#dc2626' }}
                      >
                        Retry Camera
                      </button>
                    </div>
                  )}

                  {/* Biometric Guide Reticle when Waiting for Face (Transparent overlay - video 100% visible) */}
                  {isStreaming && uiState === 'WAITING' && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundColor: 'transparent',
                      pointerEvents: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 4
                    }}>
                      <div style={{
                        width: '140px',
                        height: '170px',
                        borderRadius: '45%',
                        border: '1.5px dashed rgba(16, 185, 129, 0.5)',
                        boxShadow: '0 0 15px rgba(16, 185, 129, 0.15)',
                        animation: 'pulseGlow 2.4s infinite'
                      }} />
                    </div>
                  )}

                  {/* Scanning Radar Sweep when in MATCHING State */}
                  {uiState === 'MATCHING' && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '50%',
                      background: 'conic-gradient(from 0deg, rgba(16, 185, 129, 0.45) 0deg, transparent 90deg, transparent 360deg)',
                      animation: 'radarSpin 1.8s linear infinite',
                      pointerEvents: 'none',
                      zIndex: 4
                    }} />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ============================================================ */}
          {/* BOTTOM METRICS & STATUS TEXT (Matching Reference Image) */}
          {/* ============================================================ */}
          <div style={{
            padding: '1.25rem 1.5rem 2rem 1.5rem',
            textAlign: 'center',
            zIndex: 10,
            minHeight: '130px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end'
          }}>
            {uiState === 'SUCCESS' ? (
              <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)' }}>
                <span>Ready for next student in 5 seconds...</span>
              </div>
            ) : uiState === 'ALREADY_MARKED' ? (
              /* State 5: Already Recorded */
              <div>
                <div style={{
                  fontSize: '1.35rem',
                  fontWeight: 800,
                  color: '#38bdf8',
                  lineHeight: 1.2,
                  marginBottom: '0.35rem',
                  textShadow: '0 0 20px rgba(56, 189, 248, 0.4)'
                }}>
                  Verified • Already Recorded
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#bae6fd' }}>
                  Attendance Already Recorded
                </div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: '0.2rem' }}>
                  Recorded at {recognizedStudent?.last_attendance_time || successMeta?.time || 'earlier today'}
                </div>
              </div>
            ) : uiState === 'MATCHING' ? (
              /* State 3: Verifying Identity */
              <div>
                <div style={{
                  fontSize: '1.45rem',
                  fontWeight: 800,
                  color: '#10b981',
                  lineHeight: 1.2,
                  marginBottom: '0.35rem',
                  textShadow: '0 0 20px rgba(16, 185, 129, 0.4)'
                }}>
                  Verifying Identity...
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#a7f3d0' }}>
                  Verifying Biometrics...
                </div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: '0.2rem' }}>
                  Matching facial landmarks
                </div>
              </div>
            ) : uiState === 'DETECTED' ? (
              /* State 2: Face Detected */
              <div>
                <div style={{
                  fontSize: '1.45rem',
                  fontWeight: 800,
                  color: '#10b981',
                  lineHeight: 1.2,
                  marginBottom: '0.35rem',
                  textShadow: '0 0 20px rgba(16, 185, 129, 0.4)'
                }}>
                  Face Detected
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 500, color: '#a7f3d0' }}>
                  Face aligned in camera reticle
                </div>
                {attendanceMode === 'manual' && (
                  <button
                    onClick={handleManualMarkSuccess}
                    className="btn btn-primary"
                    style={{
                      marginTop: '0.75rem',
                      width: '100%',
                      padding: '0.65rem',
                      backgroundColor: '#059669',
                      fontWeight: 700
                    }}
                  >
                    Confirm & Record Attendance
                  </button>
                )}
              </div>
            ) : uiState === 'MULTIPLE_FACES' ? (
              /* State 7: Multiple Faces Detected */
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fbbf24', marginBottom: '0.25rem' }}>
                  Multiple Faces Detected
                </div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                  Please keep only one face in the frame.
                </div>
              </div>
            ) : uiState === 'UNKNOWN' ? (
              /* State 6: Unknown Face Alert */
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444', marginBottom: '0.25rem' }}>
                  Face Not Recognized
                </div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                  Please register your face or try again.
                </div>
                <div style={{ fontSize: '0.75rem', color: '#fca5a5', marginTop: '0.25rem' }}>
                  Face not recognized. Please position your face clearly in good lighting.
                </div>
              </div>
            ) : (
              /* State 1: Waiting for Face */
              <div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'rgba(255, 255, 255, 0.85)', marginBottom: '0.25rem' }}>
                  Detecting face...
                </div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)' }}>
                  Position your face inside the circle
                </div>
              </div>
            )}
          </div>

          {/* Mobile Footer Metrics Strip (Today's Attended, Unknown Faces, System Status) */}
          <div style={{
            marginTop: 'auto',
            padding: '0.65rem 1rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(2, 13, 9, 0.65)',
            backdropFilter: 'blur(8px)',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.5rem',
            textAlign: 'center',
            zIndex: 10
          }}>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.55)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Attended
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#34d399', marginTop: '2px' }}>
                {markedToday.length}
              </div>
            </div>
            <div style={{ borderLeft: '1px solid rgba(255, 255, 255, 0.08)', borderRight: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.55)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Unknown
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ef4444', marginTop: '2px' }}>
                {unknownCount}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.55)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Status
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
                Ready
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* RIGHT PANEL: LIVE ATTENDANCE FEED & STATS (Split Dashboard) */}
        {/* ============================================================ */}
        <div
          className="attendance-feed-panel"
          style={{
            flex: '1 1 500px',
            display: viewMode === 'split_dashboard' ? 'flex' : 'none',
            flexDirection: 'column',
            gap: '1.25rem'
          }}
        >
          {/* Today's Metrics Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '1rem'
          }}>
            <div className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <UserCheck size={20} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Today's Attended</span>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>{markedToday.length}</h3>
              </div>
            </div>

            <div className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Unknown Faces</span>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>{unknownCount}</h3>
              </div>
            </div>

            <div className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={20} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>System Status</span>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--primary)' }}>Ready</h3>
              </div>
            </div>
          </div>

          {/* Today's Live Attendance Records Container */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                Today's Attendance
              </h3>
              <button
                onClick={fetchTodayList}
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <RefreshCw size={12} />
                <span>Refresh</span>
              </button>
            </div>

            {markedToday.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>No attendance recorded today yet.</p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem' }}>Faces recognized in the camera will be recorded here automatically.</p>
              </div>
            ) : (
              <>
                {/* Desktop Tabular View (>= 768px) */}
                <div className="desktop-table-view" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '0.65rem' }}>Student</th>
                        <th style={{ padding: '0.65rem' }}>Roll No</th>
                        <th style={{ padding: '0.65rem' }}>Time (IST)</th>
                        <th style={{ padding: '0.65rem' }}>Status</th>
                        <th style={{ padding: '0.65rem' }}>Email Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {markedToday.map((rec, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.65rem', fontWeight: 600 }}>
                            {rec.name || rec.student_name || rec.student_id}
                          </td>
                          <td style={{ padding: '0.65rem', color: 'var(--text-secondary)' }}>
                            {rec.roll_number || rec.student_id}
                          </td>
                          <td style={{ padding: '0.65rem' }}>
                            {formatTime(rec.attendance_time || rec.time)}
                          </td>
                          <td style={{ padding: '0.65rem' }}>
                            {(() => {
                              const badge = getStatusBadge(rec.status || 'Present');
                              return (
                                <span className={badge?.className || 'badge badge-present'}>
                                  {badge?.label || rec.status || 'Present'}
                                </span>
                              );
                            })()}
                          </td>
                          <td style={{ padding: '0.65rem' }}>
                            {renderEmailBadge(rec)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View (< 768px) */}
                <div className="mobile-card-list">
                  {markedToday.map((rec, idx) => {
                    const badge = getStatusBadge(rec.status || 'Present');
                    return (
                      <div key={idx} className="mobile-card-item">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--text-main)' }}>
                            {rec.name || rec.student_name || rec.student_id}
                          </span>
                          <span className={badge?.className || 'badge badge-present'}>
                            {badge?.label || rec.status || 'Present'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          <span>Roll No: <strong style={{ color: 'var(--text-main)' }}>{rec.roll_number || rec.student_id}</strong></span>
                          <span>{formatTime(rec.attendance_time || rec.time)}</span>
                        </div>
                        <div style={{ marginTop: '0.2rem' }}>
                          {renderEmailBadge(rec)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Global CSS animations for radar sweep and biometric glow */}
      <style>{`
        @keyframes radarSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.04); }
        }
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (max-width: 899px) {
          .phone-scanner-frame {
            max-width: 100% !important;
            border-radius: 24px !important;
            border: 1px solid rgba(16, 185, 129, 0.35) !important;
            min-height: auto !important;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4) !important;
          }
          .phone-scanner-frame .mobile-device-status-bar {
            display: none !important;
          }
          .attendance-feed-panel {
            display: flex !important;
            width: 100% !important;
            flex: 1 1 100% !important;
          }
          .view-mode-toggle {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
