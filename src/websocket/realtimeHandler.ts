import { Server } from 'socket.io';
import { poller } from '../core/Poller';

export function setupWebSocket(io: Server): void {
  poller.setIO(io);

  io.on('connection', (socket) => {
    console.log(`🌐 WebSocket client connected: ${socket.id}`);

    socket.on('subscribe', (data: { connectionId?: number; tagIds?: number[] }) => {
      if (data.connectionId) {
        socket.join(`connection:${data.connectionId}`);
      }
      if (data.tagIds) {
        for (const tagId of data.tagIds) {
          socket.join(`tag:${tagId}`);
        }
      }
    });

    socket.on('unsubscribe', (data: { connectionId?: number; tagIds?: number[] }) => {
      if (data.connectionId) {
        socket.leave(`connection:${data.connectionId}`);
      }
      if (data.tagIds) {
        for (const tagId of data.tagIds) {
          socket.leave(`tag:${tagId}`);
        }
      }
    });

    socket.on('disconnect', () => {
      console.log(`🌐 WebSocket client disconnected: ${socket.id}`);
    });
  });

  console.log('🌐 WebSocket handler initialized');
}
