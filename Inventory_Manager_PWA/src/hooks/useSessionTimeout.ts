import { useEffect, useRef, useCallback } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Stored in localStorage — survives backgrounding, used for background timeout check
const BACKGROUND_AT_KEY = 'session_backgrounded_at';

/**
 * Mobile session timeout hook for Capacitor Android.
 *
 * Two logout scenarios:
 *  1. BACKGROUND 5+ min: When app backgrounds, saves a timestamp to localStorage.
 *     On foreground resume (native Capacitor event), checks elapsed time.
 *
 *  2. IDLE 5 min: Standard browser activity events (touch, click, keypress)
 *     reset a 5-minute countdown timer.
 *
 * NOTE: Swipe-kill detection is intentionally omitted — the app does NOT
 * logout on kill/reopen. Session persists until one of the above occurs.
 */
export const useSessionTimeout = (onTimeout: () => void) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const doLogout = useCallback(() => {
    localStorage.removeItem(BACKGROUND_AT_KEY);
    if (timerRef.current) clearTimeout(timerRef.current);
    onTimeoutRef.current();
  }, []);

  // ── Idle timer (resets on user activity) ────────────────────────
  const resetIdleTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doLogout, IDLE_TIMEOUT_MS);
  }, [doLogout]);

  useEffect(() => {
    const activityEvents: (keyof WindowEventMap)[] = [
      'mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click',
    ];
    activityEvents.forEach(e => window.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer(); // start initial timer

    return () => {
      activityEvents.forEach(e => window.removeEventListener(e, resetIdleTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetIdleTimer]);

  // ── Background timeout — Capacitor native (Android/iOS) ─────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        // App came to foreground — check if we were backgrounded too long
        const backgroundedAt = localStorage.getItem(BACKGROUND_AT_KEY);
        if (backgroundedAt) {
          const elapsed = Date.now() - parseInt(backgroundedAt, 10);
          localStorage.removeItem(BACKGROUND_AT_KEY);
          if (elapsed >= IDLE_TIMEOUT_MS) {
            doLogout();
            return;
          }
        }
        // Session still valid — restart idle timer
        resetIdleTimer();
      } else {
        // App went to background — save timestamp, suspend idle timer
        localStorage.setItem(BACKGROUND_AT_KEY, Date.now().toString());
        if (timerRef.current) clearTimeout(timerRef.current);
      }
    });

    return () => {
      listenerPromise.then(l => l.remove());
    };
  }, [doLogout, resetIdleTimer]);

  // ── Fallback: visibilitychange for browser/non-native PWA ───────
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;

    const handleVisibility = () => {
      if (document.hidden) {
        localStorage.setItem(BACKGROUND_AT_KEY, Date.now().toString());
        if (timerRef.current) clearTimeout(timerRef.current);
      } else {
        const backgroundedAt = localStorage.getItem(BACKGROUND_AT_KEY);
        if (backgroundedAt) {
          const elapsed = Date.now() - parseInt(backgroundedAt, 10);
          localStorage.removeItem(BACKGROUND_AT_KEY);
          if (elapsed >= IDLE_TIMEOUT_MS) {
            doLogout();
            return;
          }
        }
        resetIdleTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [doLogout, resetIdleTimer]);
};
