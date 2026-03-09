import { useEffect, useRef, useCallback } from 'react';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const BG_TIMESTAMP_KEY = 'app_backgrounded_at';

/**
 * Mobile session timeout hook.
 * Logs out the user when:
 *   1. They are idle (no touch/click/keypress/scroll) for 5 minutes
 *   2. The app is backgrounded for 5+ minutes and then reopened
 *   3. The app/browser tab is closed
 */
export const useSessionTimeout = (onTimeout: () => void) => {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onTimeoutRef = useRef(onTimeout);

    useEffect(() => {
        onTimeoutRef.current = onTimeout;
    }, [onTimeout]);

    // ── Idle timer (resets on user activity) ───────────────
    const resetTimer = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            onTimeoutRef.current();
        }, IDLE_TIMEOUT_MS);
    }, []);

    useEffect(() => {
        const activityEvents: (keyof WindowEventMap)[] = [
            'mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click', 'wheel',
        ];

        activityEvents.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
        resetTimer(); // start initial timer

        return () => {
            activityEvents.forEach(e => window.removeEventListener(e, resetTimer));
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [resetTimer]);

    // ── App background/foreground detection ────────────────
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden) {
                // App went to background — save timestamp
                localStorage.setItem(BG_TIMESTAMP_KEY, Date.now().toString());
                // Pause the idle timer
                if (timerRef.current) clearTimeout(timerRef.current);
            } else {
                // App came back to foreground — check how long it was away
                const bgTime = localStorage.getItem(BG_TIMESTAMP_KEY);
                if (bgTime) {
                    const elapsed = Date.now() - parseInt(bgTime, 10);
                    localStorage.removeItem(BG_TIMESTAMP_KEY);
                    if (elapsed >= IDLE_TIMEOUT_MS) {
                        // Was backgrounded for 5+ minutes — logout
                        onTimeoutRef.current();
                        return;
                    }
                }
                // Still within timeout — restart idle timer
                resetTimer();
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            localStorage.removeItem(BG_TIMESTAMP_KEY);
        };
    }, [resetTimer]);

    // ── Logout on app close ────────────────────────────────
    useEffect(() => {
        const handleUnload = () => {
            onTimeoutRef.current();
        };
        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
    }, []);
};
