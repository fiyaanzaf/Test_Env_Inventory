import { useState, useEffect, useRef, useCallback } from 'react';
import client from '../api/client';

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds
const RECONNECT_WINDOW = 5 * 60 * 1000; // 5 minutes

export type ConnectionStatus = 'connected' | 'disconnected';

/**
 * Monitors backend connectivity via:
 *   1. Axios response interceptor — catches network failures on real API calls
 *   2. Heartbeat ping every 30s — catches disconnection even when idle
 *
 * Returns:
 *   - status: 'connected' | 'disconnected'
 *   - secondsLeft: countdown until full logout (only when disconnected)
 *   - tryReconnect: manual reconnect function
 */
export const useConnectionMonitor = (onFullLogout: () => void) => {
    const [status, setStatus] = useState<ConnectionStatus>('connected');
    const [secondsLeft, setSecondsLeft] = useState(RECONNECT_WINDOW / 1000);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const onFullLogoutRef = useRef(onFullLogout);

    useEffect(() => {
        onFullLogoutRef.current = onFullLogout;
    }, [onFullLogout]);

    // ── Mark disconnected ──────────────────────────────────
    const markDisconnected = useCallback(() => {
        setStatus(prev => {
            if (prev === 'disconnected') return prev;
            return 'disconnected';
        });
    }, []);

    // ── Mark connected ─────────────────────────────────────
    const markConnected = useCallback(() => {
        setStatus('connected');
        setSecondsLeft(RECONNECT_WINDOW / 1000);
    }, []);

    // ── Heartbeat ping ─────────────────────────────────────
    const ping = useCallback(async () => {
        const token = localStorage.getItem('user_token');
        if (!token) return; // not logged in
        try {
            await client.get('/api/v1/users/me', {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 8000,
            });
            markConnected();
        } catch {
            markDisconnected();
        }
    }, [markConnected, markDisconnected]);

    // ── Manual reconnect attempt ───────────────────────────
    const tryReconnect = useCallback(async (): Promise<boolean> => {
        try {
            const token = localStorage.getItem('user_token');
            if (!token) return false;
            await client.get('/api/v1/users/me', {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 8000,
            });
            markConnected();
            return true;
        } catch {
            return false;
        }
    }, [markConnected]);

    // ── Axios response interceptor ─────────────────────────
    useEffect(() => {
        const interceptorId = client.interceptors.response.use(
            response => {
                if (status === 'disconnected') markConnected();
                return response;
            },
            error => {
                if (!error.response) {
                    markDisconnected();
                }
                return Promise.reject(error);
            }
        );

        return () => {
            client.interceptors.response.eject(interceptorId);
        };
    }, [status, markConnected, markDisconnected]);

    // ── Heartbeat interval ─────────────────────────────────
    useEffect(() => {
        heartbeatRef.current = setInterval(ping, HEARTBEAT_INTERVAL);
        return () => {
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        };
    }, [ping]);

    // ── Countdown timer when disconnected ──────────────────
    useEffect(() => {
        if (status === 'disconnected') {
            setSecondsLeft(RECONNECT_WINDOW / 1000);
            countdownRef.current = setInterval(() => {
                setSecondsLeft(prev => {
                    if (prev <= 1) {
                        onFullLogoutRef.current();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            if (countdownRef.current) clearInterval(countdownRef.current);
            setSecondsLeft(RECONNECT_WINDOW / 1000);
        }

        return () => {
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, [status]);

    return { status, secondsLeft, tryReconnect };
};
