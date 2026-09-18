import React, { useRef, useEffect } from "react";

export default function OtpInput({ length = 6, value = "", onChange, disabled = false }) {
  const inputRefs = useRef([]);

  // Split string into array of individual characters
  const digits = Array.from({ length }, (_, i) => value[i] || "");

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        // Current is empty, focus previous
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleChange = (index, e) => {
    const rawVal = e.target.value;
    // Allow only digits
    const cleanVal = rawVal.replace(/\D/g, "");
    if (!cleanVal) {
      // Deletion
      const newDigits = [...digits];
      newDigits[index] = "";
      onChange(newDigits.join(""));
      return;
    }

    // Single digit entry
    const char = cleanVal.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    const nextVal = newDigits.join("");
    onChange(nextVal);

    // Auto-advance to next box
    if (index < length - 1 && char) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasteData) return;

    onChange(pasteData);

    // Focus the box following the pasted digits, or the last box
    const nextFocusIndex = Math.min(pasteData.length, length - 1);
    inputRefs.current[nextFocusIndex]?.focus();
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "clamp(0.35rem, 2vw, 0.75rem)",
        justifyContent: "center",
        margin: "1rem 0"
      }}
      onPaste={handlePaste}
    >
      {Array.from({ length }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => (inputRefs.current[idx] = el)}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          autoComplete={idx === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${idx + 1} of verification code`}
          disabled={disabled}
          value={digits[idx]}
          onChange={(e) => handleChange(idx, e)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          style={{
            width: "clamp(38px, 12vw, 48px)",
            height: "clamp(46px, 14vw, 56px)",
            textAlign: "center",
            fontSize: "clamp(1.2rem, 4vw, 1.5rem)",
            fontWeight: 800,
            fontFamily: "JetBrains Mono, monospace",
            borderRadius: "10px",
            border: digits[idx] ? "2px solid #4F46E5" : "1.5px solid var(--border-color)",
            backgroundColor: digits[idx] ? "var(--primary-light)" : "var(--bg-surface)",
            color: digits[idx] ? "var(--primary-dark)" : "var(--text-main)",
            outline: "none",
            transition: "all 0.15s ease",
            boxShadow: digits[idx] ? "0 2px 8px rgba(79, 70, 229, 0.15)" : "none"
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "#4F46E5";
            e.target.style.boxShadow = "0 0 0 3px rgba(79, 70, 229, 0.2)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = digits[idx] ? "#4F46E5" : "var(--border-color)";
            e.target.style.boxShadow = digits[idx] ? "0 2px 8px rgba(79, 70, 229, 0.15)" : "none";
          }}
        />
      ))}
    </div>
  );
}
