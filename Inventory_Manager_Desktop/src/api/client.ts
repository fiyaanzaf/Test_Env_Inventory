import axios from 'axios';

// Auto-detect host — works for both localhost and LAN access from other laptops
const BASE_URL = `http://${window.location.hostname}:8000`;

const client = axios.create({
  baseURL: BASE_URL,
});

export default client;