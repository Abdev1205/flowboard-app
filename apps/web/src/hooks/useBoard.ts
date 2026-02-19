/**
 * hooks/useBoard.ts
 *
 * Action hooks that compose optimistic UI + WS emit in a single call.
 *
 * Pattern for each action:
 *   1. Apply optimistic update to store (instant UI feedback)
 *   2. Emit WS event (may be queued if offline)
 *
 * The WS hook handles confirmation (replacing optimistic state with server
 * truth) and rollback (restoring state on CONFLICT_NOTIFY).
 */
import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useBoardStore, nextOrderFor } from '@/store/boardStore';
import { orderBetween } from '@/lib/fractionalIndex';
import type { ColumnId, Task } from '@/types';

/**
 * Emit function signature — accepts any { type, payload } object.
 * Injected from useWebSocket so this hook stays free of socket.io coupling.
 */
type EmitFn = (event: { type: string; payload: unknown }) => void;

export function useBoard(emit: EmitFn) {
  const {
    tasks,
    optimisticCreate,
    optimisticUpdate,
    optimisticMove,
    optimisticDelete,
    getColumn,
  } = useBoardStore();

  // ── CREATE ─────────────────────────────────────────────────────────────────

  const createTask = useCallback(
    (columnId: ColumnId, title: string, description?: string) => {
      const order = nextOrderFor(tasks, columnId);
      const now   = new Date().toISOString();

      const optimisticTask: Task = {
        id:          uuidv4(),
        columnId,
        title,
        description: description ?? '',
        order,
        createdAt:   now,
        updatedAt:   now,
        version:     1,
      };

      // 1. Instant UI
      optimisticCreate(optimisticTask);

      // 2. Emit (server will create its own ID — confirmCreate replaces this)
      emit({
        type: 'TASK_CREATE',
        payload: { id: optimisticTask.id, columnId, title, description },
      });
    },
    [tasks, optimisticCreate, emit],
  );

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  const updateTask = useCallback(
    (task: Task, patch: { title?: string; description?: string }) => {
      // 1. Instant UI
      optimisticUpdate(task.id, patch);

      // 2. Emit
      emit({
        type: 'TASK_UPDATE',
        payload: { id: task.id, version: task.version, ...patch },
      });
    },
    [optimisticUpdate, emit],
  );

  // ── MOVE ───────────────────────────────────────────────────────────────────

  const moveTask = useCallback(
    (
      task:         Task,
      toColumn:     ColumnId,
      overTaskId:   string | null, // task it was dropped on (null = bottom of column)
    ) => {
      const col  = getColumn(toColumn);
      const overIdx = overTaskId ? col.findIndex((t) => t.id === overTaskId) : -1;

      // Compute new fractional order
      const prev = overIdx > 0             ? col[overIdx - 1] : null;
      const next = overIdx >= 0 && overTaskId ? col[overIdx]     : null;
      const order = orderBetween(prev?.order ?? null, next?.order ?? null);

      // 1. Instant UI
      optimisticMove(task.id, toColumn, order);

      // 2. Emit
      emit({
        type:    'TASK_MOVE',
        payload: { id: task.id, columnId: toColumn, order, version: task.version },
      });
    },
    [getColumn, optimisticMove, emit],
  );

  // ── DELETE ─────────────────────────────────────────────────────────────────

  const deleteTask = useCallback(
    (task: Task) => {
      // 1. Instant UI
      optimisticDelete(task.id);

      // 2. Emit
      emit({ type: 'TASK_DELETE', payload: { id: task.id } });
    },
    [optimisticDelete, emit],
  );

  return { createTask, updateTask, moveTask, deleteTask };
}
