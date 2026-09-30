import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

/**
 * WebSocket Handler
 * 
 * Critical Behaviour: Real-time conflict detection
 * 
 * Provides:
 * - Live updates when work items change
 * - "User X is viewing this item" presence indicators
 * - Instant notification on stale data
 * - Team-level event broadcasting
 */

interface AuthenticatedSocket extends Socket {
  userId?: string;
  displayName?: string;
}

export function setupWebSocket(io: SocketIOServer) {
  // Authentication middleware for WebSocket
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as { userId: string; email: string };
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`[WS] User connected: ${socket.userId}`);

    // Join team rooms
    socket.on('join:team', (teamId: string) => {
      socket.join(`team:${teamId}`);
      console.log(`[WS] User ${socket.userId} joined team:${teamId}`);
    });

    // Join work item room (for real-time updates on specific items)
    socket.on('join:workItem', (workItemId: string) => {
      socket.join(`workItem:${workItemId}`);
      // Notify others that this user is viewing this item
      socket.to(`workItem:${workItemId}`).emit('presence:viewing', {
        userId: socket.userId,
        workItemId,
      });
      console.log(`[WS] User ${socket.userId} viewing workItem:${workItemId}`);
    });

    // Leave work item room
    socket.on('leave:workItem', (workItemId: string) => {
      socket.leave(`workItem:${workItemId}`);
      socket.to(`workItem:${workItemId}`).emit('presence:left', {
        userId: socket.userId,
        workItemId,
      });
    });

    // User is typing a comment
    socket.on('typing:start', (workItemId: string) => {
      socket.to(`workItem:${workItemId}`).emit('typing:user', {
        userId: socket.userId,
        workItemId,
      });
    });

    socket.on('typing:stop', (workItemId: string) => {
      socket.to(`workItem:${workItemId}`).emit('typing:stopped', {
        userId: socket.userId,
        workItemId,
      });
    });

    socket.on('disconnect', () => {
      console.log(`[WS] User disconnected: ${socket.userId}`);
    });
  });
}
