import axios from 'axios';

// Auto-detect the server IP from the browser URL
// Works on any WiFi — uses the same IP you used to open the PWA
const API_PORT = 8000;
const BASE_URL =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://127.0.0.1:${API_PORT}`
    : `http://${window.location.hostname}:${API_PORT}`;

const client = axios.create({
  baseURL: BASE_URL,
});

export default client;
