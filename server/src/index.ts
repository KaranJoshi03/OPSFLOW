import express from 'express';
import 'express-async-errors';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config/env';
import { authRouter } from './routes/auth.routes';
import { workItemRouter } from './routes/workItems.routes';
import { teamRouter } from './routes/teams.routes';
import { userRouter } from './routes/users.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { aiRouter } from './routes/ai.routes';
import { errorHandler } from './middleware/errorHandler';
import { setupWebSocket } from './websocket/handler';
import { setupQueues } from './jobs/queue';
import { prisma } from './config/database';

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new SocketIOServer(server, {
  cors: {
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  },
});

// Make io accessible in routes
app.set('io', io);

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// Root check
app.get('/', (_req, res) => {
  res.send('OpsFlow API is running. Please access the client at http://localhost:5173');
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/work-items', workItemRouter);
app.use('/api/teams', teamRouter);
app.use('/api/users', userRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/ai', aiRouter);

// Error handler
app.use(errorHandler);

// Start server
const PORT = config.PORT;

async function start() {
  try {
    // Test DB connection
    await prisma.$connect();
    console.log('✅ Database connected');

    // Setup WebSocket
    setupWebSocket(io);
    console.log('✅ WebSocket server ready');

    // Setup job queues
    await setupQueues();
    console.log('✅ Job queues ready');

    server.listen(PORT, () => {
      console.log(`🚀 OpsFlow server running on http://localhost:${PORT}`);
      console.log(`📡 WebSocket server running on ws://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();

export { app, server, io };
