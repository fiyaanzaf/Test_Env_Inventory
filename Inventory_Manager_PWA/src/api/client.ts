import axios from 'axios';

const API_PORT = 8000;
const BACKEND_URL_KEY = 'backend_url';

/**
 * Get the backend URL.
 * Priority:
 *  1. localStorage (set via QR scan) — used in APK / production
 *  2. Auto-detect from browser hostname — used when opening PWA in browser
 *  3. Fallback to localhost — used in dev
 */
function getBaseURL(): string {
  // 1. Check localStorage (set by QR scan)
  const saved = localStorage.getItem(BACKEND_URL_KEY);
  if (saved) return saved;

  // 2. Auto-detect from browser URL (works when PWA is opened in browser on same network)
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `http://${hostname}:${API_PORT}`;
    }
  }

  // 3. Fallback to localhost (dev mode)
  return `http://127.0.0.1:${API_PORT}`;
}

/** Save backend URL (called after QR scan) */
export function setBackendURL(url: string): void {
  // Normalize: remove trailing slash
  const normalized = url.replace(/\/+$/, '');
  localStorage.setItem(BACKEND_URL_KEY, normalized);
  // Update the axios instance baseURL immediately
  client.defaults.baseURL = normalized;
}

/** Get current saved backend URL */
export function getBackendURL(): string | null {
  return localStorage.getItem(BACKEND_URL_KEY);
}

/** Check if backend URL has been configured (via QR scan or auto-detect) */
export function isBackendConfigured(): boolean {
  return !!localStorage.getItem(BACKEND_URL_KEY);
}

/** Clear saved backend URL (for rescanning) */
export function clearBackendURL(): void {
  localStorage.removeItem(BACKEND_URL_KEY);
  client.defaults.baseURL = getBaseURL();
}

const client = axios.create({
  baseURL: getBaseURL(),
});

export default client;
