import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import 'dotenv/config';
import app from './app';
import { registerSocketHandlers } from './ws/router';
import { startDbFlushWorker } from './jobs/dbFlushWorker';

const PORT        = Number(process.env.PORT ?? 8080);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

// ── HTTP Server ───────────────────────────────────────────────────────────────
const httpServer = http.createServer(app);

// ── Socket.IO ─────────────────────────────────────────────────────────────────
export const io = new SocketIOServer(httpServer, {
  cors: {
    origin:      CORS_ORIGIN,
    methods:     ['GET', 'POST'],
    credentials: true,
  },
  // Prefer WebSocket, fall back to polling
  transports: ['websocket', 'polling'],
});

// ── Wire WS Router ────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);
  registerSocketHandlers(socket, io);
});

// ── BullMQ Worker ─────────────────────────────────────────────────────────────
startDbFlushWorker();

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`[Server] FlowBoard running on port ${PORT}`);
  console.log(`[Server] Environment : ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`[Server] CORS origin : ${CORS_ORIGIN}`);
});

export default httpServer;
