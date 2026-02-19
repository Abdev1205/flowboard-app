/**
 * services/conflictService.ts
 *
 * Redis-mutex-backed conflict detection and resolution.
 *
 * Implements exactly the three conflict rules from DESIGN.md / CONTEXT.md:
 *
 *  Rule 1 — Concurrent MOVE + EDIT:
 *    Field-level merge. TASK_MOVE owns (columnId, order).
 *    TASK_UPDATE owns (title, description). Both applied atomically.
 *    No conflict notification needed.
 *
 *  Rule 2 — Concurrent MOVE + MOVE:
 *    Server-arrival-timestamp wins. Per-task Redis mutex (SET NX PX).
 *    Loser gets CONFLICT_NOTIFY with resolvedState.
 *
 *  Rule 3 — Concurrent REORDER + INSERT:
 *    Fractional indexing resolves this naturally (no special handling needed).
 *
 * Architecture rules (CONTEXT.md):
 *   - NO socket.io imports — pure functions only.
 *   - Uses ioredis SET NX PX as a lightweight advisory mutex.
 */
import { redis } from '../cache/redis';
import { LOCK_KEY } from './taskService';
import type { Task } from './taskService';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Lock TTL in milliseconds — enough for one round-trip. */
const LOCK_TTL_MS = 2000;

/** Unique identifier for this server process (advisory lock owner). */
const SERVER_ID = `server:${process.pid}`;

// ── Mutex ─────────────────────────────────────────────────────────────────────

export interface AcquireResult {
  acquired: boolean;
  /** The current authoritative task state (for CONFLICT_NOTIFY payload). */
  resolvedState?: Task;
}

/**
 * Attempt to acquire an advisory lock on `task:{id}:lock`.
 *
 * Uses Redis SET NX (set-if-not-exists) with a TTL so the lock is always
 * released even if the server crashes mid-operation.
 *
 * @param taskId  The task being modified.
 * @param currentTask  Your view of the task — returned to the loser as resolvedState.
 * @returns  { acquired: true } if you won, { acquired: false, resolvedState } if you lost.
 */
export async function acquireMoveLock(
  taskId:      string,
  currentTask: Task,
): Promise<AcquireResult> {
  const key    = LOCK_KEY(taskId);
  const result = await redis.set(key, SERVER_ID, 'PX', LOCK_TTL_MS, 'NX');

  if (result === 'OK') {
    return { acquired: true };
  }

  // Lock already held — caller is the loser
  return { acquired: false, resolvedState: currentTask };
}

/**
 * Release the advisory lock.
 * Only deletes the key if we still own it (Lua script for atomicity).
 */
export async function releaseMoveLock(taskId: string): Promise<void> {
  const key = LOCK_KEY(taskId);

  // Atomic check-and-delete: only release if we own the lock
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  await redis.eval(luaScript, 1, key, SERVER_ID);
}

// ── Field-level Merge (Rule 1) ────────────────────────────────────────────────

export type MoveFields = Pick<Task, 'columnId' | 'order'>;
export type EditFields = Pick<Task, 'title' | 'description'>;

/**
 * Merge concurrent move and edit operations at the field level.
 *
 * TASK_MOVE payload → overwrites (columnId, order)
 * TASK_UPDATE payload → overwrites (title, description)
 *
 * Both are applied to the current state. The merged result is complete and
 * broadcasted without a CONFLICT_NOTIFY.
 *
 * @param current   Current authoritative task state in Redis.
 * @param move      Position fields from TASK_MOVE (may be null if no move happened).
 * @param edit      Content fields from TASK_UPDATE (may be null if no edit happened).
 */
export function mergeMovAndEdit(
  current: Task,
  move:    MoveFields | null,
  edit:    EditFields | null,
): Task {
  const now = new Date().toISOString();
  return {
    ...current,
    // Position fields — from TASK_MOVE (or keep current)
    columnId: move?.columnId ?? current.columnId,
    order:    move?.order    ?? current.order,
    // Content fields — from TASK_UPDATE (or keep current)
    title:       edit?.title       ?? current.title,
    description: edit?.description ?? current.description,
    // Advance version only once for the merged result
    version:   current.version + 1,
    updatedAt: now,
  };
}

// ── Conflict Notification Payload ─────────────────────────────────────────────

export interface ConflictNotifyPayload {
  taskId:        string;
  resolvedState: Task;
  message:       string;
}

/**
 * Build the CONFLICT_NOTIFY payload to send to the losing client.
 * The client will roll back its optimistic update to `resolvedState`.
 */
export function buildConflictPayload(
  taskId:       string,
  resolvedState: Task,
  loserAction:  'TASK_MOVE' | 'TASK_UPDATE',
): ConflictNotifyPayload {
  return {
    taskId,
    resolvedState,
    message:
      loserAction === 'TASK_MOVE'
        ? 'Another user moved this task first. Your move was not applied.'
        : 'Another user updated this task first. Your update was not applied.',
  };
}
