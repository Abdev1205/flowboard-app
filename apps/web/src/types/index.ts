// ─────────────────────────────────────────────────────────────────────────────
// FlowBoard — Shared Types
// Auto-synced with CONTEXT.md — do NOT rename these types.
// ─────────────────────────────────────────────────────────────────────────────

export type ColumnId = 'todo' | 'in-progress' | 'done';

export interface Task {
  id: string;           // uuid v4
  columnId: ColumnId;
  title: string;
  description: string;
  order: number;        // fractional index
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
  version: number;      // optimistic lock counter
  creatorName?: string;
  creatorColor?: string;
}

export interface UserPresence {
  userId: string;
  displayName: string;
  color: string;        // hex, randomly assigned on connect
  editingTaskId?: string;
  connectedAt: string;
}

// ── Offline Queue ─────────────────────────────────────────────────────────────

export interface QueuedOp {
  type: ClientEventType;
  payload: ClientEvent['payload'];
  clientTimestamp: number; // Date.now() at time of operation
}

// ── WebSocket Events — Client → Server ────────────────────────────────────────

export type ClientEventType =
  | 'TASK_CREATE'
  | 'TASK_UPDATE'
  | 'TASK_MOVE'
  | 'TASK_DELETE'
  | 'REPLAY_OPS'
  | 'PRESENCE_UPDATE';

export type ClientEvent =
  | {
      type: 'TASK_CREATE';
      payload: { columnId: ColumnId; title: string; description?: string };
    }
  | {
      type: 'TASK_UPDATE';
      payload: { id: string; title?: string; description?: string; version: number };
    }
  | {
      type: 'TASK_MOVE';
      payload: { id: string; columnId: ColumnId; order: number; version: number };
    }
  | {
      type: 'TASK_DELETE';
      payload: { id: string };
    }
  | {
      type: 'REPLAY_OPS';
      payload: QueuedOp[];
    }
  | {
      type: 'PRESENCE_UPDATE';
      payload: { status: 'editing' | 'idle'; taskId?: string };
    };

// ── WebSocket Events — Server → Client ────────────────────────────────────────

export type ServerEvent =
  | {
      type: 'BOARD_SNAPSHOT';
      payload: { tasks: Task[]; presence: UserPresence[] };
    }
  | {
      type: 'TASK_CREATED';
      payload: Task;
    }
  | {
      type: 'TASK_UPDATED';
      payload: Task;
    }
  | {
      type: 'TASK_MOVED';
      payload: Task;
    }
  | {
      type: 'TASK_DELETED';
      payload: { id: string };
    }
  | {
      type: 'CONFLICT_NOTIFY';
      payload: { taskId: string; resolvedState: Task; message: string };
    }
  | {
      type: 'PRESENCE_STATE';
      payload: UserPresence[];
    }
  | {
      type: 'ERROR';
      payload: { code: string; message: string };
    };
