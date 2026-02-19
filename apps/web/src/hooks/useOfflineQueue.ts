/**
 * hooks/useOfflineQueue.ts
 *
 * Manages the offline operation queue.
 *
 * When the socket disconnects, operations are buffered here.
 * On reconnect, the queue is emitted as a single REPLAY_OPS event
 * so the server can re-apply them in order with conflict resolution.
 *
 * Storage: sessionStorage (survives soft refreshes but not tab close).
 * The queue is also mirrored in a React ref to avoid stale closure issues.
 */
import { useRef, useCallback } from 'react';
import type { ClientEvent, QueuedOp } from '@/types';

const STORAGE_KEY = 'flowboard:offline-queue';

function loadQueue(): QueuedOp[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedOp[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedOp[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage quota exceeded — queue lives only in memory
  }
}

export function useOfflineQueue() {
  const queueRef = useRef<QueuedOp[]>(loadQueue());

  /**
   * Enqueue a failed operation for later replay.
   * Call this from useWebSocket when the socket is offline.
   */
  const enqueue = useCallback((event: ClientEvent) => {
    if (event.type === 'REPLAY_OPS') return; // never queue a replay itself

    const op: QueuedOp = {
      type:            event.type as QueuedOp['type'],
      payload:         event.payload as QueuedOp['payload'],
      clientTimestamp: Date.now(),
    };

    queueRef.current = [...queueRef.current, op];
    saveQueue(queueRef.current);
  }, []);

  /**
   * Return current queue and clear it atomically.
   * Call this on socket reconnect before sending REPLAY_OPS.
   */
  const flushQueue = useCallback((): QueuedOp[] => {
    const ops = [...queueRef.current];
    queueRef.current = [];
    saveQueue([]);
    return ops;
  }, []);

  /** Peek at the queue without removing — for UI "N pending ops" badge. */
  const pendingCount = useCallback((): number => queueRef.current.length, []);

  return { enqueue, flushQueue, pendingCount };
}
