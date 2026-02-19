import http   from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import path   from 'node:path';

// ── Environment loading ───────────────────────────────────────────────────────
// process.cwd() = apps/server/ (the directory npm run dev is invoked from).
// In production (Docker/Azure), env vars are injected directly — .env.local
// won't exist and dotenv silently skips it. That's intentional.
//
// Load order (first match per variable wins):
//   1. .env.local  — dev secrets, git-ignored
//   2. .env        — shared defaults
const _cwd = process.cwd();
dotenv.config({ path: path.join(_cwd, '.env.local') });
dotenv.config({ path: path.join(_cwd, '.env') });

import app from './app';
import { registerSocketHandlers } from './ws/router';
import { startDbFlushWorker } from './jobs/dbFlushWorker';
import { cleanAllPresences } from './services/presenceService';

// ...

// ── BullMQ Worker ─────────────────────────────────────────────────────────────
startDbFlushWorker();
cleanAllPresences().then(() => console.log('[Redis] Presence cleared'));

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

// Force main Redis connection to verify connectivity
import { redis } from './cache/redis';
redis.get('ping').then(() => console.log('[Redis] Ping success')).catch(err => console.error('[Redis] Ping failed:', err));


// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`[Server] FlowBoard running on port ${PORT}`);
  console.log(`[Server] Environment : ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`[Server] CORS origin : ${CORS_ORIGIN}`);
});

export default httpServer;
