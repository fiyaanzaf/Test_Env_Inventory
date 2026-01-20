import axios from 'axios';

// REPLACE THIS WITH YOUR LAPTOP'S IP ADDRESS
// Keep the port :8000
const BASE_URL = 'http://192.168.1.8:8000'; 

const client = axios.create({
  baseURL: BASE_URL,
});

export default client;