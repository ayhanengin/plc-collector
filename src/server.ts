import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import connectionRoutes from './api/connectionRoutes';
import tagRoutes from './api/tagRoutes';
import setupRoutes from './api/setupRoutes';
import dataRoutes from './api/dataRoutes';
import bulkImportRoutes from './api/bulkImportRoutes';
import gatewayRoutes from './api/gatewayRoutes';
import { setupWebSocket } from './websocket/realtimeHandler';
import path from 'path';

const app = express();

// Middleware
app.use(cors({
  origin: process.env.WS_CORS_ORIGIN || true,
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));

// API Routes
app.use('/api/connections', connectionRoutes);
app.use('/api/tags/bulk', bulkImportRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/gateways', gatewayRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/data', dataRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '..', 'web', 'dist');
  app.use(express.static(frontendPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// HTTP + Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.WS_CORS_ORIGIN || true,
    methods: ['GET', 'POST'],
  },
});

setupWebSocket(io);

export { app, server, io };
