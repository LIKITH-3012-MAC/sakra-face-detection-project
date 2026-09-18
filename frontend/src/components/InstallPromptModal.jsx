import React, { useState } from "react";
import { Download, Share, PlusSquare, X, Smartphone, ShieldCheck } from "lucide-react";

export default function InstallPromptModal({ canInstall, isInstalled, isIOS, onInstall }) {
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // If already running inside standalone PWA, never show install prompt
  if (isInstalled || dismissed || !canInstall) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
    } else {
      const accepted = await onInstall();
      if (!accepted) {
        // User cancelled or prompt failed
      }
    }
  };

  return (
    <>
      {/* Subtle Floating Install Chip (Bottom-right on desktop, bottom-left on mobile above nav) */}
      <div
        className="pwa-install-banner"
        style={{
          position: "fixed",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
          right: "1rem",
          zIndex: 80,
          backgroundColor: "#0B132B",
          color: "#FFFFFF",
          padding: "0.55rem 0.9rem",
          borderRadius: "9999px",
          border: "1px solid rgba(79, 70, 229, 0.4)",
          boxShadow: "0 8px 20px rgba(0, 0, 0, 0.35)",
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          fontSize: "0.8rem",
          fontWeight: 600,
          animation: "slideUp 0.3s ease-out"
        }}
      >
        <div
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "6px",
            background: "linear-gradient(135deg, #4F46E5 0%, #06B6D4 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <ShieldCheck size={14} color="#FFF" />
        </div>

        <span style={{ color: "#E2E8F0" }}>Install Sakra-Lens App</span>

        <button
          onClick={handleInstallClick}
          style={{
            backgroundColor: "#4F46E5",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "9999px",
            padding: "0.3rem 0.75rem",
            fontSize: "0.75rem",
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem"
          }}
        >
          <Download size={12} />
          <span>Install</span>
        </button>

        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss install banner"
          style={{
            background: "none",
            border: "none",
            color: "#94A3B8",
            cursor: "pointer",
            padding: "2px",
            display: "flex",
            alignItems: "center"
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* iOS Add to Home Screen Instructions Modal */}
      {showIOSModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            backgroundColor: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: "1rem"
          }}
          onClick={() => setShowIOSModal(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "420px",
              backgroundColor: "#0B132B",
              borderRadius: "20px",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              padding: "1.5rem",
              color: "#FFFFFF",
              animation: "slideUp 0.3s ease-out"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "linear-gradient(135deg, #4F46E5 0%, #06B6D4 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <ShieldCheck size={20} color="#FFF" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Install on iPhone / iPad</h3>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "#94A3B8" }}>Install Sakra-Lens directly to your Home Screen</p>
                </div>
              </div>
              <button
                onClick={() => setShowIOSModal(false)}
                style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", margin: "1.25rem 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.85rem" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(255, 255, 255, 0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Share size={18} color="#38BDF8" />
                </div>
                <span>1. Tap the <strong>Share</strong> button in Safari toolbar</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.85rem" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(255, 255, 255, 0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <PlusSquare size={18} color="#10B981" />
                </div>
                <span>2. Scroll down and tap <strong>Add to Home Screen</strong></span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.85rem" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(255, 255, 255, 0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Smartphone size={18} color="#A78BFA" />
                </div>
                <span>3. Tap <strong>Add</strong> in the top-right corner</span>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "12px",
                backgroundColor: "rgba(255, 255, 255, 0.12)",
                color: "#FFFFFF",
                border: "none",
                fontWeight: 700,
                fontSize: "0.9rem",
                cursor: "pointer"
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
