import { useState, useEffect } from 'react';

/**
 * useDeviceBattery: Subscribes to the real W3C Battery Status API.
 * Reads live battery level and charging status directly from navigator.getBattery().
 * Correctly detects unsupported browsers (Safari, Firefox, etc.) without faking data.
 */
export function useDeviceBattery() {
  const [batteryState, setBatteryState] = useState({
    supported: false,
    level: null,       // Integer 0-100 or null if unsupported
    charging: false,   // boolean
    loading: true
  });

  useEffect(() => {
    let batteryObj = null;
    let isMounted = true;

    const handleLevelChange = () => {
      if (batteryObj && isMounted) {
        const rawLevel = batteryObj.level;
        const pct = typeof rawLevel === 'number' && !isNaN(rawLevel)
          ? Math.round(rawLevel * 100)
          : null;
        setBatteryState(prev => ({
          ...prev,
          level: pct
        }));
      }
    };

    const handleChargingChange = () => {
      if (batteryObj && isMounted) {
        setBatteryState(prev => ({
          ...prev,
          charging: Boolean(batteryObj.charging)
        }));
      }
    };

    const initBattery = async () => {
      try {
        if (
          typeof navigator !== 'undefined' &&
          typeof navigator.getBattery === 'function'
        ) {
          const battery = await navigator.getBattery();
          if (!isMounted) return;

          batteryObj = battery;
          const rawLevel = battery.level;
          const pct = typeof rawLevel === 'number' && !isNaN(rawLevel)
            ? Math.round(rawLevel * 100)
            : null;

          setBatteryState({
            supported: true,
            level: pct,
            charging: Boolean(battery.charging),
            loading: false
          });

          battery.addEventListener('levelchange', handleLevelChange);
          battery.addEventListener('chargingchange', handleChargingChange);
        } else {
          // Battery API unsupported (Safari, Firefox, restricted webviews)
          if (isMounted) {
            setBatteryState({
              supported: false,
              level: null,
              charging: false,
              loading: false
            });
          }
        }
      } catch (err) {
        // Handle security exceptions or rejected promises safely
        if (isMounted) {
          setBatteryState({
            supported: false,
            level: null,
            charging: false,
            loading: false
          });
        }
      }
    };

    initBattery();

    return () => {
      isMounted = false;
      if (batteryObj) {
        try {
          batteryObj.removeEventListener('levelchange', handleLevelChange);
          batteryObj.removeEventListener('chargingchange', handleChargingChange);
        } catch (e) {
          // Cleanup safety
        }
      }
    };
  }, []);

  return batteryState;
}

export default useDeviceBattery;
