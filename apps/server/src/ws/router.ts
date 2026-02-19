/**
 * ws/router.ts
 *
 * WebSocket event router — routing ONLY, zero business logic.
 *
 * Architecture rule (CONTEXT.md §Architecture Rules #1):
 *   "ws/router.ts only parses event type and delegates. Zero business logic."
 *
 * Pattern:
 *   socket.on(<eventType>, (raw) => handler(socket, io, raw))
 *
 * The router does NOT validate payloads — each handler does that as its
 * first step via Zod safeParse. The router simply maps event names to
 * the correct handler function.
 */
import type { Socket, Server } from 'socket.io';
import {
  handleTaskCreate,
  handleTaskUpdate,
  handleTaskMove,
  handleTaskDelete,
  handleReplayOps,
} from './handlers/task.handler';
import {
  onConnect,
  onDisconnect,
  handlePresenceUpdate,
} from './handlers/presence.handler';

/**
 * registerSocketHandlers
 *
 * Call this once per socket connection from server.ts:
 *
 *   io.on('connection', (socket) => registerSocketHandlers(socket, io));
 */
export function registerSocketHandlers(socket: Socket, io: Server): void {
  // ── Connect lifecycle ───────────────────────────────────────────────────────
  // Called immediately on connection — sends BOARD_SNAPSHOT to the new client.
  void onConnect(socket, io);

  // ── Task events ─────────────────────────────────────────────────────────────

  socket.on('TASK_CREATE', (raw: unknown) => {
    void handleTaskCreate(socket, io, raw);
  });

  socket.on('TASK_UPDATE', (raw: unknown) => {
    void handleTaskUpdate(socket, io, raw);
  });

  socket.on('TASK_MOVE', (raw: unknown) => {
    void handleTaskMove(socket, io, raw);
  });

  socket.on('TASK_DELETE', (raw: unknown) => {
    void handleTaskDelete(socket, io, raw);
  });

  socket.on('REPLAY_OPS', (raw: unknown) => {
    void handleReplayOps(socket, io, raw);
  });

  // ── Presence events ─────────────────────────────────────────────────────────

  socket.on('PRESENCE_UPDATE', (raw: unknown) => {
    void handlePresenceUpdate(socket, io, raw);
  });

  // ── Disconnect lifecycle ────────────────────────────────────────────────────

  socket.on('disconnect', (reason: string) => {
    void onDisconnect(socket, io, reason);
  });
}
