/**
 * ws/handlers/presence.handler.ts
 *
 * Presence-related WebSocket handlers.
 * Responsible for:
 *   - onConnect:  register presence, emit BOARD_SNAPSHOT
 *   - onDisconnect: remove presence, broadcast updated PRESENCE_STATE
 *   - handlePresenceUpdate: update editing status, broadcast PRESENCE_STATE
 */
import type { Socket, Server } from 'socket.io';
import { PresenceUpdatePayloadSchema } from '../../validation/taskSchema';
import {
  addPresence,
  removePresence,
  updatePresenceStatus,
  getAllPresences,
} from '../../services/presenceService';
import { getAllTasks } from '../../services/taskService';

// ── Helper ────────────────────────────────────────────────────────────────────

function emitError(socket: Socket, code: string, message: string): void {
  socket.emit('ERROR', { code, message });
}

// ── Connect ───────────────────────────────────────────────────────────────────

/**
 * Called when a new socket connects.
 *
 * 1. Register the user's presence in Redis.
 * 2. Send BOARD_SNAPSHOT (all tasks + all presences) to the new client only.
 * 3. Broadcast updated PRESENCE_STATE to all other clients.
 *
 * The displayName is either provided as a socket handshake auth param
 * (socket.handshake.auth.displayName) or falls back to "User <shortId>".
 */
export async function onConnect(socket: Socket, io: Server): Promise<void> {
  const displayName =
    (socket.handshake.auth as Record<string, unknown>)?.displayName as string | undefined
    ?? `User ${socket.id.slice(0, 6)}`;

  try {
    const presence = await addPresence(socket.id, displayName);
    const [tasks, presences] = await Promise.all([
      getAllTasks(),
      getAllPresences(),
    ]);

    // Send full board state only to this client
    socket.emit('BOARD_SNAPSHOT', { tasks, presence: presences });

    // Broadcast updated presence list to all OTHER clients
    socket.broadcast.emit('PRESENCE_STATE', presences);

    console.log(`[WS] ${displayName} connected (${socket.id}) — colour ${presence.color}`);
  } catch (err) {
    console.error('[presence.handler.onConnect]', err);
    emitError(socket, 'CONNECT_FAILED', 'Failed to initialise board state');
  }
}

// ── Disconnect ────────────────────────────────────────────────────────────────

/**
 * Called when a socket disconnects (clean or timeout).
 * Removes presence from Redis and broadcasts the updated list.
 */
export async function onDisconnect(
  socket: Socket,
  io:     Server,
  reason: string,
): Promise<void> {
  try {
    await removePresence(socket.id);
    const presences = await getAllPresences();
    io.emit('PRESENCE_STATE', presences);

    console.log(`[WS] ${socket.id} disconnected — reason: ${reason}`);
  } catch (err) {
    console.error('[presence.handler.onDisconnect]', err);
  }
}

// ── PRESENCE_UPDATE ───────────────────────────────────────────────────────────

/**
 * PRESENCE_UPDATE
 * Client signals it is editing or has finished editing a task.
 * Updates Redis and broadcasts the new PRESENCE_STATE to all clients.
 */
export async function handlePresenceUpdate(
  socket: Socket,
  io:     Server,
  raw:    unknown,
): Promise<void> {
  const parsed = PresenceUpdatePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return emitError(socket, 'VALIDATION_ERROR', parsed.error.message);
  }

  const { status, taskId } = parsed.data;

  try {
    await updatePresenceStatus(socket.id, status, taskId);
    const presences = await getAllPresences();
    io.emit('PRESENCE_STATE', presences);
  } catch (err) {
    console.error('[presence.handler.handlePresenceUpdate]', err);
    emitError(socket, 'PRESENCE_UPDATE_FAILED', String(err));
  }
}
