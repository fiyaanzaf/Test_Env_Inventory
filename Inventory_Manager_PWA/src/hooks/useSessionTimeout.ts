import { useEffect, useRef, useCallback } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const LAST_ACTIVE_KEY = 'session_last_active';

/**
 * Mobile session timeout hook for Capacitor Android.
 *
 * Handles THREE scenarios:
 *   1. User is IDLE for 5 minutes (no touch/click/keypress) → logout
 *   2. App is BACKGROUNDED for 5+ minutes → logout on resume
 *   3. App is KILLED and reopened later → logout on next open
 *
 * How it works:
 *   - Continuously updates a "last active" timestamp in localStorage
 *   - When the app comes to foreground (native event) or on mount,
 *     checks if too much time has passed since last activity
 *   - Uses Capacitor's native App plugin for reliable background/foreground detection
 *   - Falls back to visibilitychange for browser/PWA usage
 */
export const useSessionTimeout = (onTimeout: () => void) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  const activityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  // ── Update "last active" timestamp continuously ────────
  const touchActivity = useCallback(() => {
    localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
  }, []);

  // ── Check if session has expired ───────────────────────
  const checkSessionExpiry = useCallback(() => {
    const lastActive = localStorage.getItem(LAST_ACTIVE_KEY);
    if (lastActive) {
      const elapsed = Date.now() - parseInt(lastActive, 10);
      if (elapsed >= IDLE_TIMEOUT_MS) {
        // Too long since last activity — force logout
        localStorage.removeItem(LAST_ACTIVE_KEY);
        onTimeoutRef.current();
        return true;
      }
    }
    return false;
  }, []);

  // ── Check on mount (handles app kill + reopen) ─────────
  useEffect(() => {
    // If the app was killed and reopened, check the stored timestamp
    const lastActive = localStorage.getItem(LAST_ACTIVE_KEY);
    if (lastActive) {
      const elapsed = Date.now() - parseInt(lastActive, 10);
      if (elapsed >= IDLE_TIMEOUT_MS) {
        localStorage.removeItem(LAST_ACTIVE_KEY);
        onTimeoutRef.current();
        return;
      }
    }
    // If session is valid, mark as active now
    touchActivity();
  }, [touchActivity]);

  // ── Idle timer (resets on user activity) ────────────────
  const resetTimer = useCallback(() => {
    touchActivity();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      localStorage.removeItem(LAST_ACTIVE_KEY);
      onTimeoutRef.current();
    }, IDLE_TIMEOUT_MS);
  }, [touchActivity]);

  useEffect(() => {
    const activityEvents: (keyof WindowEventMap)[] = [
      'mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click', 'wheel',
    ];

    activityEvents.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer(); // start initial timer

    // Also update the timestamp every 30 seconds while active
    // (so the stored timestamp stays fresh even without explicit user events)
    activityIntervalRef.current = setInterval(touchActivity, 30_000);

    return () => {
      activityEvents.forEach(e => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
      if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
    };
  }, [resetTimer, touchActivity]);

  // ── Capacitor native app state (Android/iOS) ───────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        // App came to foreground — check if session expired
        if (!checkSessionExpiry()) {
          // Session still valid — restart idle timer
          resetTimer();
        }
      } else {
        // App went to background — save timestamp, pause idle timer
        touchActivity();
        if (timerRef.current) clearTimeout(timerRef.current);
      }
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, [checkSessionExpiry, resetTimer, touchActivity]);

  // ── Fallback: visibilitychange for browser/PWA ─────────
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return; // native uses App plugin above

    const handleVisibility = () => {
      if (document.hidden) {
        touchActivity();
        if (timerRef.current) clearTimeout(timerRef.current);
      } else {
        if (!checkSessionExpiry()) {
          resetTimer();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [checkSessionExpiry, resetTimer, touchActivity]);
};
