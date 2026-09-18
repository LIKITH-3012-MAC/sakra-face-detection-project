import React from "react";
import { Sparkles, RefreshCw } from "lucide-react";

export default function UpdateAvailableBanner({ updateAvailable, onUpdate }) {
  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 99999,
        backgroundColor: "#0B132B",
        color: "#FFFFFF",
        padding: "0.5rem 1rem",
        borderRadius: "9999px",
        border: "1px solid #10B981",
        boxShadow: "0 8px 24px rgba(16, 185, 129, 0.35)",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        fontSize: "0.85rem",
        fontWeight: 600,
        animation: "slideDown 0.3s ease-out"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#34D399" }}>
        <Sparkles size={16} />
        <span>New version ready</span>
      </div>
      <button
        onClick={onUpdate}
        style={{
          backgroundColor: "#10B981",
          color: "#0B132B",
          border: "none",
          borderRadius: "9999px",
          padding: "0.3rem 0.75rem",
          fontSize: "0.75rem",
          fontWeight: 800,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem"
        }}
      >
        <RefreshCw size={12} />
        <span>Update Now</span>
      </button>
    </div>
  );
}
