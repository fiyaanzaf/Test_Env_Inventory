import axios from 'axios';

// REPLACE THIS WITH YOUR LAPTOP'S IP ADDRESS
// Keep the port :8000
const BASE_URL = 'http://127.0.0.1:8000'; 

const client = axios.create({
  baseURL: BASE_URL,
});

export default client;