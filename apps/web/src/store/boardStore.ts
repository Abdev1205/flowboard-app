/**
 * store/boardStore.ts
 *
 * Zustand store for all task and board state.
 *
 * Responsibilities:
 *   - Hold the canonical list of tasks (source of truth for board UI)
 *   - Apply optimistic mutations immediately (before server confirmation)
 *   - Roll back on CONFLICT_NOTIFY
 *   - Sort tasks by `order` per column
 *
 * Zustand v5 pattern: `create` + `immer` middleware for nested mutations.
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Task, ColumnId } from '@/types';
import { orderBetween } from '@/lib/fractionalIndex';

// ── State shape ───────────────────────────────────────────────────────────────

export interface BoardState {
  /** All tasks keyed by id for O(1) lookup */
  tasks: Record<string, Task>;

  /** Whether the board has received its first BOARD_SNAPSHOT */
  isLoaded: boolean;

  /** Whether socket is currently connected */
  isConnected: boolean;
}

export interface BoardActions {
  // Lifecycle
  setConnected: (v: boolean) => void;
  loadSnapshot: (tasks: Task[]) => void;

  // Optimistic mutations (applied immediately, rolled back on conflict)
  optimisticCreate:  (task: Task) => void;
  optimisticUpdate:  (id: string, patch: Partial<Pick<Task, 'title' | 'description'>>) => void;
  optimisticMove:    (id: string, columnId: ColumnId, order: number) => void;
  optimisticDelete:  (id: string) => void;

  // Server confirmations (replace optimistic with server truth)
  confirmCreate:  (task: Task) => void;
  confirmUpdate:  (task: Task) => void;
  confirmMove:    (task: Task) => void;
  confirmDelete:  (id: string) => void;

  // Conflict rollback
  rollback: (taskId: string, resolvedState: Task) => void;

  // Selectors (computed, not state)
  getColumn: (columnId: ColumnId) => Task[];
  getTask:   (id: string) => Task | undefined;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns tasks in a column sorted by fractional order ascending. */
function sortedColumn(tasks: Record<string, Task>, columnId: ColumnId): Task[] {
  return Object.values(tasks)
    .filter((t) => t.columnId === columnId)
    .sort((a, b) => a.order - b.order);
}

/** Compute next order value when appending to the bottom of a column. */
export function nextOrderFor(tasks: Record<string, Task>, columnId: ColumnId): number {
  const col = sortedColumn(tasks, columnId);
  const last = col[col.length - 1] ?? null;
  return orderBetween(last?.order ?? null, null);
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useBoardStore = create<BoardState & BoardActions>()(
  immer((set, get) => ({
    // ── Initial state ──────────────────────────────────────────────────────
    tasks:       {},
    isLoaded:    false,
    isConnected: false,

    // ── Lifecycle ──────────────────────────────────────────────────────────

    setConnected: (v) =>
      set((s) => {
        s.isConnected = v;
      }),

    loadSnapshot: (tasks) =>
      set((s) => {
        s.tasks = {};
        for (const t of tasks) s.tasks[t.id] = t;
        s.isLoaded = true;
      }),

    // ── Optimistic mutations ───────────────────────────────────────────────

    optimisticCreate: (task) =>
      set((s) => {
        s.tasks[task.id] = task;
      }),

    optimisticUpdate: (id, patch) =>
      set((s) => {
        if (!s.tasks[id]) return;
        Object.assign(s.tasks[id], patch, { updatedAt: new Date().toISOString() });
      }),

    optimisticMove: (id, columnId, order) =>
      set((s) => {
        if (!s.tasks[id]) return;
        s.tasks[id].columnId = columnId;
        s.tasks[id].order    = order;
        s.tasks[id].updatedAt = new Date().toISOString();
      }),

    optimisticDelete: (id) =>
      set((s) => {
        delete s.tasks[id];
      }),

    // ── Server confirmations (replace with server state) ───────────────────

    confirmCreate:  (task) => set((s) => { s.tasks[task.id] = task; }),
    confirmUpdate:  (task) => set((s) => { s.tasks[task.id] = task; }),
    confirmMove:    (task) => set((s) => { s.tasks[task.id] = task; }),
    confirmDelete:  (id)   => set((s) => { delete s.tasks[id]; }),

    // ── Conflict rollback ──────────────────────────────────────────────────

    rollback: (taskId, resolvedState) =>
      set((s) => {
        s.tasks[taskId] = resolvedState;
      }),

    // ── Selectors (inline, stable via Zustand) ─────────────────────────────

    getColumn:  (columnId) => sortedColumn(get().tasks, columnId),
    getTask:    (id)       => get().tasks[id],
  })),
);
