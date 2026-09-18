import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, CalendarCheck2, Camera, User, Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function MobileBottomNav() {
  const { isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) return null;

  // Don't show on auth pages
  const isAuthPage = ["/welcome", "/login", "/register", "/admin/login"].includes(location.pathname);
  if (isAuthPage) return null;

  const dashboardPath = isAdmin ? "/admin" : "/student/dashboard";
  const attendancePath = isAdmin ? "/admin/attendance" : "/student/attendance";
  const cameraPath = isAdmin ? "/admin/live-attendance" : "/student/live-attendance";
  const profilePath = isAdmin ? "/admin/settings" : "/student/profile";

  const isScannerActive = location.pathname.includes("live-attendance");

  return (
    <nav
      className="mobile-bottom-nav"
      aria-label="Mobile bottom navigation"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
        display: "none", // Hidden on desktop (shown on mobile < 900px via CSS)
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.35)"
      }}
    >
      <div
        style={{
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          padding: "0 0.5rem",
          maxWidth: "500px",
          margin: "0 auto"
        }}
      >
        {/* Tab 1: Dashboard */}
        <NavLink
          to={dashboardPath}
          end
          style={({ isActive }) => ({
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            color: isActive ? "#38BDF8" : "#94A3B8",
            gap: "4px",
            fontSize: "0.68rem",
            fontWeight: isActive ? 700 : 500,
            transition: "all 0.15s ease"
          })}
        >
          {({ isActive }) => (
            <>
              <div
                style={{
                  padding: "4px 12px",
                  borderRadius: "12px",
                  backgroundColor: isActive ? "rgba(56, 189, 248, 0.15)" : "transparent"
                }}
              >
                <LayoutDashboard size={20} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span>Home</span>
            </>
          )}
        </NavLink>

        {/* Tab 2: Attendance Records */}
        <NavLink
          to={attendancePath}
          style={({ isActive }) => ({
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            color: isActive ? "#38BDF8" : "#94A3B8",
            gap: "4px",
            fontSize: "0.68rem",
            fontWeight: isActive ? 700 : 500,
            transition: "all 0.15s ease"
          })}
        >
          {({ isActive }) => (
            <>
              <div
                style={{
                  padding: "4px 12px",
                  borderRadius: "12px",
                  backgroundColor: isActive ? "rgba(56, 189, 248, 0.15)" : "transparent"
                }}
              >
                <CalendarCheck2 size={20} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span>History</span>
            </>
          )}
        </NavLink>

        {/* Tab 3: Prominent Center Live Scanner Action */}
        <NavLink
          to={cameraPath}
          style={{
            textDecoration: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            margin: "-24px 0 0 0"
          }}
        >
          <div
            style={{
              width: "54px",
              height: "54px",
              borderRadius: "50%",
              background: isScannerActive
                ? "linear-gradient(135deg, #10B981 0%, #06B6D4 100%)"
                : "linear-gradient(135deg, #4F46E5 0%, #06B6D4 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFFFFF",
              boxShadow: isScannerActive
                ? "0 8px 24px rgba(16, 185, 129, 0.5)"
                : "0 8px 20px rgba(79, 70, 229, 0.45)",
              border: "3px solid #0F172A",
              transform: isScannerActive ? "scale(1.08)" : "scale(1)",
              transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease"
            }}
          >
            <Camera size={24} strokeWidth={2.5} />
          </div>
          <span
            style={{
              fontSize: "0.68rem",
              fontWeight: 700,
              color: isScannerActive ? "#34D399" : "#CBD5E1",
              marginTop: "4px"
            }}
          >
            Scanner
          </span>
        </NavLink>

        {/* Tab 4: Profile / Settings */}
        <NavLink
          to={profilePath}
          style={({ isActive }) => ({
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            color: isActive ? "#38BDF8" : "#94A3B8",
            gap: "4px",
            fontSize: "0.68rem",
            fontWeight: isActive ? 700 : 500,
            transition: "all 0.15s ease"
          })}
        >
          {({ isActive }) => (
            <>
              <div
                style={{
                  padding: "4px 12px",
                  borderRadius: "12px",
                  backgroundColor: isActive ? "rgba(56, 189, 248, 0.15)" : "transparent"
                }}
              >
                {isAdmin ? (
                  <SettingsIcon size={20} strokeWidth={isActive ? 2.5 : 2} />
                ) : (
                  <User size={20} strokeWidth={isActive ? 2.5 : 2} />
                )}
              </div>
              <span>{isAdmin ? "Settings" : "Profile"}</span>
            </>
          )}
        </NavLink>
      </div>
    </nav>
  );
}
