import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const api = axios.create({ baseURL: `${API_URL}/api` });

export const socket = io(API_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});
