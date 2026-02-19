/**
 * ws/handlers/task.handler.ts
 *
 * One exported function per client event type.
 * Architecture rules (CONTEXT.md):
 *   - First line of every handler: validate payload with Zod schema.
 *   - Delegate all business logic to taskService / conflictService.
 *   - Never import services inside services — only handlers do I/O composition.
 */
import type { Socket, Server } from 'socket.io';
import {
  CreateTaskPayloadSchema,
  UpdateTaskPayloadSchema,
  MoveTaskPayloadSchema,
  DeleteTaskPayloadSchema,
  ReplayOpsPayloadSchema,
  type QueuedOp,
} from '../../validation/taskSchema';
import {
  createTask,
  updateTask,
  moveTask,
  deleteTask,
} from '../../services/taskService';
import {
  acquireMoveLock,
  releaseMoveLock,
  buildConflictPayload,
} from '../../services/conflictService';
import { logConflict } from '../../services/auditService';

// ── Helper — emit a typed error back to the calling socket ────────────────────

function emitError(socket: Socket, code: string, message: string): void {
  socket.emit('ERROR', { code, message });
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * TASK_CREATE
 * Creates a new task and broadcasts TASK_CREATED to the whole board room.
 */
export async function handleTaskCreate(
  socket: Socket,
  io:     Server,
  raw:    unknown,
): Promise<void> {
  const parsed = CreateTaskPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return emitError(socket, 'VALIDATION_ERROR', parsed.error.message);
  }

  const result = await createTask(parsed.data);

  if (!result.ok) {
    return emitError(socket, result.code, result.message);
  }

  io.emit('TASK_CREATED', result.data);
}

/**
 * TASK_UPDATE
 * Updates content fields (title / description).
 * Broadcasts TASK_UPDATED to all clients.
 *
 * Implements DESIGN.md Rule 1 (field-level merge) via the service —
 * position fields are untouched.
 */
export async function handleTaskUpdate(
  socket: Socket,
  io:     Server,
  raw:    unknown,
): Promise<void> {
  const parsed = UpdateTaskPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return emitError(socket, 'VALIDATION_ERROR', parsed.error.message);
  }

  const result = await updateTask(parsed.data);

  if (!result.ok) {
    if (result.code === 'VERSION_MISMATCH') {
      return emitError(socket, 'VERSION_MISMATCH', result.message);
    }
    return emitError(socket, result.code, result.message);
  }

  io.emit('TASK_UPDATED', result.data);
}

/**
 * TASK_MOVE
 * Moves a task to a new column / position.
 *
 * Implements DESIGN.md Rule 2 (concurrent move + move):
 *   1. Acquire Redis mutex on task:{id}:lock
 *   2. If lock fails → emit CONFLICT_NOTIFY to the losing client
 *   3. If lock succeeds → apply move, broadcast TASK_MOVED, release lock
 */
export async function handleTaskMove(
  socket: Socket,
  io:     Server,
  raw:    unknown,
): Promise<void> {
  const parsed = MoveTaskPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return emitError(socket, 'VALIDATION_ERROR', parsed.error.message);
  }

  const payload = parsed.data;

  // Fetch current task state (needed both for the mutex and for CONFLICT_NOTIFY)
  const { getAllTasks } = await import('../../services/taskService');
  const allTasks = await getAllTasks();
  const current  = allTasks.find((t) => t.id === payload.id);

  if (!current) {
    return emitError(socket, 'NOT_FOUND', `Task ${payload.id} not found`);
  }

  // ── Acquire per-task move lock (Rule 2) ──────────────────────────────────
  const lockResult = await acquireMoveLock(payload.id, current);

  if (!lockResult.acquired) {
    // This client lost the race — send CONFLICT_NOTIFY only to them
    const conflictPayload = buildConflictPayload(
      payload.id,
      lockResult.resolvedState!,
      'TASK_MOVE',
    );
    socket.emit('CONFLICT_NOTIFY', conflictPayload);

    // FR-14 — fire-and-forget audit log (never blocks the response path)
    void logConflict({
      taskId:        payload.id,
      winnerEvent:   'TASK_MOVE',
      loserEvent:    'TASK_MOVE',
      winnerUserId:  'server', // mutex holder — no userId in v1
      loserUserId:   socket.id,
      resolvedState: lockResult.resolvedState!,
      resolutionMsg: conflictPayload.message,
    });
    return;
  }

  try {
    const result = await moveTask(payload);

    if (!result.ok) {
      return emitError(socket, result.code, result.message);
    }

    io.emit('TASK_MOVED', result.data);
  } finally {
    // Always release the lock — even on error
    await releaseMoveLock(payload.id);
  }
}

/**
 * TASK_DELETE
 * Deletes a task and broadcasts TASK_DELETED to all clients.
 */
export async function handleTaskDelete(
  socket: Socket,
  io:     Server,
  raw:    unknown,
): Promise<void> {
  const parsed = DeleteTaskPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return emitError(socket, 'VALIDATION_ERROR', parsed.error.message);
  }

  const result = await deleteTask(parsed.data);

  if (!result.ok) {
    return emitError(socket, result.code, result.message);
  }

  io.emit('TASK_DELETED', { id: result.data.id });
}

/**
 * REPLAY_OPS
 * Replays queued offline operations in client-timestamp order.
 * Each op is validated again and processed through the normal handler chain
 * so conflict resolution applies exactly as it does for live ops.
 */
export async function handleReplayOps(
  socket: Socket,
  io:     Server,
  raw:    unknown,
): Promise<void> {
  const parsed = ReplayOpsPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return emitError(socket, 'VALIDATION_ERROR', parsed.error.message);
  }

  // Sort by clientTimestamp ascending so older ops run first
  const ops: QueuedOp[] = [...parsed.data].sort(
    (a, b) => a.clientTimestamp - b.clientTimestamp,
  );

  for (const op of ops) {
    switch (op.type) {
      case 'TASK_CREATE':
        await handleTaskCreate(socket, io, op.payload);
        break;
      case 'TASK_UPDATE':
        await handleTaskUpdate(socket, io, op.payload);
        break;
      case 'TASK_MOVE':
        await handleTaskMove(socket, io, op.payload);
        break;
      case 'TASK_DELETE':
        await handleTaskDelete(socket, io, op.payload);
        break;
      case 'PRESENCE_UPDATE':
        // Presence ops during offline are dropped — stale presence is meaningless
        break;
    }
  }
}
