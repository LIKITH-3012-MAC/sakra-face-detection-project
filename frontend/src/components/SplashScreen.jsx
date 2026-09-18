import React, { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";

export default function SplashScreen({ onComplete }) {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const seen = sessionStorage.getItem("sakra_splash_seen");
    if (seen) {
      if (onComplete) onComplete();
      return;
    }

    setVisible(true);

    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, 1500);

    const doneTimer = setTimeout(() => {
      sessionStorage.setItem("sakra_splash_seen", "true");
      setVisible(false);
      if (onComplete) onComplete();
    }, 1850);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        backgroundColor: "#0B132B",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#ffffff",
        fontFamily: "Plus Jakarta Sans, Inter, sans-serif",
        opacity: fading ? 0 : 1,
        transition: "opacity 0.35s ease-out",
        pointerEvents: fading ? "none" : "auto"
      }}
    >
      <div style={{ position: "relative", width: "100px", height: "100px", marginBottom: "1.5rem" }}>
        <div
          style={{
            position: "absolute",
            inset: "-10px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(79, 70, 229, 0.4) 0%, rgba(6, 182, 212, 0) 70%)",
            animation: "pulseGlow 1.6s ease-in-out infinite"
          }}
        />

        <svg
          viewBox="0 0 100 100"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            animation: "spinRing 3s linear infinite"
          }}
        >
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="rgba(16, 185, 129, 0.4)"
            strokeWidth="3"
            strokeDasharray="8 6"
          />
        </svg>

        <div
          style={{
            position: "absolute",
            inset: "12px",
            borderRadius: "20px",
            background: "linear-gradient(135deg, #4F46E5 0%, #06B6D4 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 24px rgba(79, 70, 229, 0.5)"
          }}
        >
          <ShieldCheck size={40} color="#FFFFFF" />
        </div>
      </div>

      <div style={{ textAlign: "center" }}>
        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            margin: "0 0 0.35rem 0",
            background: "linear-gradient(135deg, #FFFFFF 0%, #CBD5E1 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent"
          }}
        >
          Sakra-Lens
        </h1>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "#94A3B8", fontWeight: 500 }}>
          Smart Attendance & Biometric Verification
        </p>
      </div>

      <div
        style={{
          width: "120px",
          height: "3px",
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          borderRadius: "9999px",
          overflow: "hidden",
          marginTop: "2rem"
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "linear-gradient(90deg, #4F46E5, #06B6D4, #10B981)",
            animation: "slideBar 1.4s ease-in-out infinite"
          }}
        />
      </div>

      <style>{`
        @keyframes spinRing {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulseGlow {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes slideBar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
