import { useState, useEffect } from 'react';

/**
 * useLiveClock: Single authoritative live clock hook.
 * Provides live time updated every second in both 12-hour mobile (h:mm)
 * and 24-hour desktop (HH:mm:ss) formats using the device's local timezone.
 */
export function useLiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Update every second
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 12-Hour format for mobile status bar (hours and minutes only: "9:41", "10:15")
  const hours12 = now.getHours() % 12 || 12;
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const mobileTime = `${hours12}:${minutes}`;

  // 24-Hour format for desktop navigation bar: "21:42:46"
  const desktopTime = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const amPm = now.getHours() >= 12 ? 'PM' : 'AM';

  return {
    now,
    mobileTime,
    desktopTime,
    seconds,
    amPm
  };
}

export default useLiveClock;
