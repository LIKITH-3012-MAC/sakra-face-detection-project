import React, { useState, useEffect } from "react";
import { WifiOff, Wifi, RefreshCw } from "lucide-react";

export default function OfflineBanner({ isOnline }) {
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
    } else if (wasOffline) {
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
        setWasOffline(false);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (!isOnline) {
    return (
      <div
        role="alert"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 9999,
          backgroundColor: "#EF4444",
          color: "#FFFFFF",
          padding: "0.5rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.825rem",
          fontWeight: 600,
          boxShadow: "0 2px 8px rgba(239, 68, 68, 0.4)",
          animation: "slideDown 0.25s ease-out"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <WifiOff size={16} />
          <span>You are currently offline. Biometric attendance requires network access.</span>
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "rgba(255, 255, 255, 0.2)",
            border: "1px solid rgba(255, 255, 255, 0.35)",
            color: "#FFFFFF",
            padding: "0.2rem 0.6rem",
            borderRadius: "4px",
            fontSize: "0.75rem",
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem"
          }}
        >
          <RefreshCw size={12} />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  if (showReconnected) {
    return (
      <div
        role="status"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 9999,
          backgroundColor: "#10B981",
          color: "#FFFFFF",
          padding: "0.45rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          fontSize: "0.825rem",
          fontWeight: 600,
          boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
          animation: "slideDown 0.25s ease-out"
        }}
      >
        <Wifi size={16} />
        <span>Back online. Connection restored.</span>
      </div>
    );
  }

  return null;
}
