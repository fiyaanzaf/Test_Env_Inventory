import { useEffect, useRef, useCallback } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Stored in localStorage → survives kill (used for background timeout)
const BACKGROUND_AT_KEY = 'session_backgrounded_at';

// Stored in sessionStorage → CLEARED when app is killed on Android
// Its absence on mount = app was killed and freshly reopened
const SESSION_ALIVE_KEY = 'session_alive';

/**
 * Mobile session timeout hook for Capacitor Android.
 *
 * Three logout scenarios:
 *  1. SWIPE KILL → REOPEN: sessionStorage is wiped by Android when
 *     the process is killed. On mount, if SESSION_ALIVE_KEY is absent,
 *     we know the app was freshly launched after a kill → logout.
 *
 *  2. BACKGROUND 5+ min: When app backgrounds, we save a timestamp to
 *     localStorage. On foreground resume (native), we check elapsed time.
 *
 *  3. IDLE 5 min: Standard browser activity events reset a timer.
 */
export const useSessionTimeout = (onTimeout: () => void) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const doLogout = useCallback(() => {
    sessionStorage.removeItem(SESSION_ALIVE_KEY);
    localStorage.removeItem(BACKGROUND_AT_KEY);
    if (timerRef.current) clearTimeout(timerRef.current);
    onTimeoutRef.current();
  }, []);

  // ── Check 1: Swipe-kill detection ─────────────────────────────────
  // sessionStorage is wiped when Android kills the WebView process.
  // If SESSION_ALIVE_KEY is absent on mount, this is a fresh launch → logout.
  useEffect(() => {
    const isAlive = sessionStorage.getItem(SESSION_ALIVE_KEY);
    if (!isAlive) {
      // Fresh app launch (or first-ever launch — covered below)
      // Check localStorage: if user was logged in before, force logout.
      // authStore will handle showing login screen; we just call onTimeout.
      // Guard: only logout if there's evidence of a previous session.
      const hadSession = localStorage.getItem('user_token') || localStorage.getItem('auth-storage');
      if (hadSession) {
        doLogout();
        return;
      }
    }
    // Mark session as alive for this WebView process
    sessionStorage.setItem(SESSION_ALIVE_KEY, 'true');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  // ── Check 2: Background timeout (Capacitor native) ────────────────
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doLogout]);

  // ── Check 3: Idle timeout (browser activity events) ───────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ── Fallback: visibilitychange for browser / non-native PWA ───────
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
