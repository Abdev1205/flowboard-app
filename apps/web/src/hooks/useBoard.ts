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
import { usePresenceStore } from '@/store/presenceStore';
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

      const { myUserId, users } = usePresenceStore.getState();
      const me = myUserId ? users[myUserId] : null;

      const optimisticTask: Task = {
        id:          uuidv4(),
        columnId,
        title,
        description: description ?? '',
        order,
        createdAt:   now,
        updatedAt:   now,
        version:     1,
        creatorName: me?.displayName || 'Anonymous',
        creatorColor: me?.color || '#cbd5e1',
      };

      // 1. Instant UI
      optimisticCreate(optimisticTask);

      // 2. Emit (server will create its own ID — confirmCreate replaces this)
      emit({
        type: 'TASK_CREATE',
        payload: { 
          id: optimisticTask.id, 
          columnId, 
          title, 
          description,
          creatorName: optimisticTask.creatorName,
          creatorColor: optimisticTask.creatorColor,
        },
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
      
      // Find indices
      const oldIdx = task.columnId === toColumn ? col.findIndex(t => t.id === task.id) : -1;
      const overIdx = overTaskId ? col.findIndex((t) => t.id === overTaskId) : -1;

      // Determine insertion point
      // If moving DOWN in the same column (old < over), insert AFTER the target.
      // Otherwise (moving UP or different column), insert BEFORE the target.
      const isMovingDown = oldIdx !== -1 && overIdx !== -1 && oldIdx < overIdx;

      let prev: Task | null;
      let next: Task | null;

      if (isMovingDown) {
        // Insert after overTaskId
        prev = col[overIdx];
        next = col[overIdx + 1] ?? null;
      } else {
        // Insert before overTaskId (default)
        // If we are moving UP, and overIdx is same as oldIdx (can't happen with dnd checks usually)
        // But if overIdx is 0, prev is null.
        prev = overIdx > 0 ? col[overIdx - 1] : null;
        next = overIdx >= 0 && overTaskId ? col[overIdx] : null;
      }

      // If inserting "before" the task being moved (edge case logic), shift?
      // No, fractional indexing handles "between X and Y".
      // Note: If `prev` is `task` itself (because we didn't filter it out of `col`), 
      // `orderBetween` handles it? No.
      // `col` includes `task`.
      // If moving down (A->B), prev is B. next is C. A is not involved in prev/next.
      // If moving up (C->B), prev is A. next is B. A is not C.
      // So checking direction is sufficient.

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
