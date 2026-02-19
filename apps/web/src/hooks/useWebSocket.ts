/**
 * hooks/useWebSocket.ts
 *
 * Manages the socket.io connection lifecycle and all server event handling.
 *
 * Responsibilities:
 *   - Connect / reconnect with exponential back-off
 *   - Route every ServerEvent to the correct store action
 *   - Detect offline → online transitions and replay queued ops
 *   - Export `emit()` for sending ClientEvents (enqueues if offline)
 *
 * Architecture rule: this hook is the ONLY place socket.io is imported.
 * Services, stores, and components never touch the socket directly.
 */
import { useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useBoardStore } from '@/store/boardStore';
import { usePresenceStore } from '@/store/presenceStore';
import { notifyConflict } from '@/lib/conflictNotify';
import { useOfflineQueue } from './useOfflineQueue';
import type { ClientEvent, ServerEvent } from '@/types';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8080';

export function useWebSocket(displayName: string) {
  const socketRef = useRef<Socket | null>(null);
  const isOnline  = useRef<boolean>(false);

  const { enqueue, flushQueue }       = useOfflineQueue();
  const { loadSnapshot, setConnected, confirmCreate,
          confirmUpdate, confirmMove,  confirmDelete, rollback } = useBoardStore();
  const { loadUsers }                 = usePresenceStore();

  // ── Stable emit — enqueues when offline ───────────────────────────────────

  const emit = useCallback((event: ClientEvent) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event.type, event.payload);
    } else {
      enqueue(event);
    }
  }, [enqueue]);

  // ── Connection + event binding ─────────────────────────────────────────────

  useEffect(() => {
    const socket = io(WS_URL, {
      transports:     ['websocket', 'polling'],
      reconnection:   true,
      reconnectionDelay:    1000,
      reconnectionDelayMax: 10000,
      auth: { displayName },
    });

    socketRef.current = socket;

    // ── Connect ────────────────────────────────────────────────────────────
    socket.on('connect', () => {
      isOnline.current = true;
      setConnected(true);

      // Replay any ops that accumulated while offline
      const pending = flushQueue();
      if (pending.length > 0) {
        socket.emit('REPLAY_OPS', pending);
      }
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      isOnline.current = false;
      setConnected(false);
    });

    // ── Server events → store actions ──────────────────────────────────────

    socket.on('BOARD_SNAPSHOT', (payload: Extract<ServerEvent, { type: 'BOARD_SNAPSHOT' }>['payload']) => {
      loadSnapshot(payload.tasks);
      loadUsers(payload.presence);
    });

    socket.on('TASK_CREATED', (task: Extract<ServerEvent, { type: 'TASK_CREATED' }>['payload']) => {
      confirmCreate(task);
    });

    socket.on('TASK_UPDATED', (task: Extract<ServerEvent, { type: 'TASK_UPDATED' }>['payload']) => {
      confirmUpdate(task);
    });

    socket.on('TASK_MOVED', (task: Extract<ServerEvent, { type: 'TASK_MOVED' }>['payload']) => {
      confirmMove(task);
    });

    socket.on('TASK_DELETED', ({ id }: Extract<ServerEvent, { type: 'TASK_DELETED' }>['payload']) => {
      confirmDelete(id);
    });

    socket.on('CONFLICT_NOTIFY', (payload: Extract<ServerEvent, { type: 'CONFLICT_NOTIFY' }>['payload']) => {
      rollback(payload.taskId, payload.resolvedState);
      notifyConflict(payload);
    });

    socket.on('PRESENCE_STATE', (users: Extract<ServerEvent, { type: 'PRESENCE_STATE' }>['payload']) => {
      loadUsers(users);
    });

    socket.on('ERROR', ({ code, message }: Extract<ServerEvent, { type: 'ERROR' }>['payload']) => {
      console.error(`[WS Error] ${code}: ${message}`);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // displayName is set once at mount — intentionally not in dep array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { emit, isOnline: isOnline.current };
}
