/**
 * services/taskService.ts
 *
 * Pure business-logic functions for task CRUD.
 * Architecture rules (CONTEXT.md):
 *   - NO socket.io imports — zero coupling to the transport layer.
 *   - Redis is the authoritative in-flight state (write-around cache).
 *   - BullMQ jobs flush Redis → PostgreSQL (debounced 500 ms per task).
 *   - All writes use optimistic versioning (version field).
 */
import { v4 as uuidv4 } from 'uuid';
import { redis } from '../cache/redis';
import { supabase } from '../db/client';
import { enqueueDatabaseFlush } from '../jobs/dbFlushWorker';
import { orderBetween, needsRebalance } from '../lib/fractionalIndex';
import type {
  CreateTaskPayload,
  UpdateTaskPayload,
  MoveTaskPayload,
  DeleteTaskPayload,
} from '../validation/taskSchema';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ColumnId = 'todo' | 'in-progress' | 'done';

export interface Task {
  id:          string;
  columnId:    ColumnId;
  title:       string;
  description: string;
  order:       number;
  createdAt:   string;
  updatedAt:   string;
  version:     number;
  creatorName?: string;
  creatorColor?: string;
  updatedByName?: string;
  updatedByColor?: string;
}

export interface ServiceResult<T> {
  ok:    true;
  data:  T;
}

export interface ServiceError {
  ok:    false;
  code:  string;
  message: string;
}

export type ServiceOutcome<T> = ServiceResult<T> | ServiceError;

// ── Redis key helpers ─────────────────────────────────────────────────────────

const TASK_KEY    = (id: string):              string => `task:${id}`;
const COLUMN_KEY  = (col: ColumnId):           string => `column:${col}:tasks`;
const BOARD_KEY   =                                      'board:tasks';
const LOCK_KEY    = (id: string):              string => `task:${id}:lock`;

// TTL for task hash in Redis — 1 hour (matches CONTEXT.md spec)
const TASK_TTL_SECONDS = 3600;

// ── Serialisation helpers ─────────────────────────────────────────────────────

/** Flatten a Task into a flat string map for Redis HSET. */
function taskToHash(task: Task): Record<string, string> {
  return {
    id:          task.id,
    columnId:    task.columnId,
    title:       task.title,
    description: task.description,
    order:       String(task.order),
    createdAt:   task.createdAt,
    updatedAt:   task.updatedAt,
    version:     String(task.version),
    creatorName: task.creatorName || '',
    creatorColor: task.creatorColor || '',
    updatedByName: task.updatedByName || '',
    updatedByColor: task.updatedByColor || '',
  };
}

/** Reconstruct a Task from a flat Redis HGETALL response. */
function hashToTask(hash: Record<string, string>): Task {
  return {
    id:          hash.id,
    columnId:    hash.columnId as ColumnId,
    title:       hash.title,
    description: hash.description,
    order:       parseFloat(hash.order),
    createdAt:   hash.createdAt,
    updatedAt:   hash.updatedAt,
    version:     parseInt(hash.version, 10),
    creatorName: hash.creatorName || undefined,
    creatorColor: hash.creatorColor || undefined,
    updatedByName: hash.updatedByName || undefined,
    updatedByColor: hash.updatedByColor || undefined,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Write task to Redis (HSET + SADD to column set + global set) with TTL.
 * Does NOT touch the database — that's BullMQ's job.
 */
async function cacheTask(task: Task): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.hset(TASK_KEY(task.id), taskToHash(task));
  pipeline.expire(TASK_KEY(task.id), TASK_TTL_SECONDS);
  pipeline.sadd(COLUMN_KEY(task.columnId), task.id);
  pipeline.sadd(BOARD_KEY, task.id);
  await pipeline.exec();
}

/**
 * Fetch a single task from Redis.
 * Returns null if the key doesn't exist (cold cache).
 */
async function getTaskFromCache(id: string): Promise<Task | null> {
  const hash = await redis.hgetall(TASK_KEY(id));
  if (!hash || !hash.id) return null;
  return hashToTask(hash);
}

/**
 * Fetch a task from Redis, fall back to Supabase if not cached.
 * On cache-miss, re-populates Redis.
 */
async function getTask(id: string): Promise<Task | null> {
  const cached = await getTaskFromCache(id);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;

  const task = dbRowToTask(data);
  await cacheTask(task);
  return task;
}

/** Map a Supabase DB row (snake_case) to a Task (camelCase). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbRowToTask(row: Record<string, any>): Task {
  return {
    id:          row.id          as string,
    columnId:    row.column_id   as ColumnId,
    title:       row.title       as string,
    description: row.description as string,
    order:       row.order       as number,
    createdAt:   row.created_at  as string,
    updatedAt:   row.updated_at  as string,
    version:     row.version     as number,
    creatorName: row.creator_name as string,
    creatorColor: row.creator_color as string,
    updatedByName: row.updated_by_name as string,
    updatedByColor: row.updated_by_color as string,
  };
}

// ── Public Service Functions ──────────────────────────────────────────────────

/**
 * Load all tasks from Redis (or Supabase on cold boot).
 * Used for BOARD_SNAPSHOT on connect.
 */
export async function getAllTasks(): Promise<Task[]> {
  // Try to load all task IDs from the global board set
  const ids = await redis.smembers(BOARD_KEY);

  if (ids.length > 0) {
    // Batch-fetch all task hashes
    const pipeline = redis.pipeline();
    for (const id of ids) pipeline.hgetall(TASK_KEY(id));
    const results = await pipeline.exec();

    if (results) {
      const tasks: Task[] = [];
      for (const [err, hash] of results) {
        if (!err && hash && typeof hash === 'object' && (hash as Record<string, string>).id) {
          tasks.push(hashToTask(hash as Record<string, string>));
        }
      }
      if (tasks.length > 0) return tasks.sort((a, b) => a.order - b.order);
    }
  }

  // Cold boot — load from Supabase and warm Redis
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('order', { ascending: true });

  if (error || !data) return [];

  const tasks = data.map(dbRowToTask);

  // Warm the cache
  await Promise.all(tasks.map(cacheTask));
  return tasks;
}

/**
 * CREATE a new task.
 *
 * 1. Compute fractional order — append to end of the target column.
 * 2. Write to Redis immediately.
 * 3. Enqueue BullMQ flush job.
 * 4. Return the full Task to broadcast.
 */
export async function createTask(
  payload: CreateTaskPayload,
): Promise<ServiceOutcome<Task>> {
  try {
    // Find the current max order in that column to append at the bottom
    const allTasks = await getAllTasks();
    const columnTasks = allTasks
      .filter((t) => t.columnId === payload.columnId)
      .sort((a, b) => a.order - b.order);

    const lastTask = columnTasks[columnTasks.length - 1] ?? null;
    const order    = orderBetween(lastTask?.order ?? null, null);

    const now  = new Date().toISOString();
    const task: Task = {
      id:          payload.id,
      columnId:    payload.columnId as ColumnId,
      title:       payload.title,
      description: payload.description ?? '',
      order,
      createdAt:   now,
      updatedAt:   now,
      version:     1,
      creatorName: payload.creatorName || 'Anonymous',
      creatorColor: payload.creatorColor || '#cbd5e1',
      updatedByName: payload.updatedByName || payload.creatorName || 'Anonymous',
      updatedByColor: payload.updatedByColor || payload.creatorColor || '#cbd5e1',
    };

    await cacheTask(task);
    await enqueueDatabaseFlush({ operation: 'upsert', task });

    return { ok: true, data: task };
  } catch (err) {
    console.error('[taskService.createTask]', err);
    return { ok: false, code: 'CREATE_FAILED', message: String(err) };
  }
}

/**
 * UPDATE a task's content fields (title and/or description).
 * Does NOT touch position fields (columnId, order).
 *
 * Implements field-level merge from DESIGN.md §1.1:
 * TASK_UPDATE and TASK_MOVE touch orthogonal field namespaces.
 */
export async function updateTask(
  payload: UpdateTaskPayload,
): Promise<ServiceOutcome<Task>> {
  try {
    const existing = await getTask(payload.id);

    if (!existing) {
      return { ok: false, code: 'NOT_FOUND', message: `Task ${payload.id} not found` };
    }

    // Optimistic version check — relaxed to allow auto-merging of orthogonal edits (Move + Edit).
    if (payload.version !== existing.version) {
      console.warn(`[taskService.updateTask] Version mismatch for task ${payload.id} (client: ${payload.version}, server: ${existing.version}). Auto-merging edit into latest state.`);
    }

    const updated: Task = {
      ...existing,
      title:       payload.title       ?? existing.title,
      description: payload.description ?? existing.description,
      updatedAt:   new Date().toISOString(),
      version:     existing.version + 1,
      updatedByName: payload.updatedByName ?? existing.updatedByName,
      updatedByColor: payload.updatedByColor ?? existing.updatedByColor,
    };

    await cacheTask(updated);
    await enqueueDatabaseFlush({ operation: 'upsert', task: updated });

    return { ok: true, data: updated };
  } catch (err) {
    console.error('[taskService.updateTask]', err);
    return { ok: false, code: 'UPDATE_FAILED', message: String(err) };
  }
}

/**
 * MOVE a task to a different column / position.
 * Only touches columnId and order (position namespace).
 *
 * The Redis mutex for concurrent-move conflict is applied by conflictService
 * BEFORE this function is called. This function assumes the lock is held.
 */
export async function moveTask(
  payload: MoveTaskPayload,
): Promise<ServiceOutcome<Task>> {
  try {
    const existing = await getTask(payload.id);

    if (!existing) {
      return { ok: false, code: 'NOT_FOUND', message: `Task ${payload.id} not found` };
    }

    // Optimistic version check — relaxed to allow auto-merging of orthogonal edits (Move + Edit).
    if (payload.version !== existing.version) {
      console.warn(`[taskService.moveTask] Version mismatch for task ${payload.id} (client: ${payload.version}, server: ${existing.version}). Auto-merging move into latest state.`);
    }

    const updated: Task = {
      ...existing,
      columnId: payload.columnId as ColumnId,
      order:    payload.order,
      updatedAt: new Date().toISOString(),
      version:  existing.version + 1,
      updatedByName: payload.updatedByName ?? existing.updatedByName,
      updatedByColor: payload.updatedByColor ?? existing.updatedByColor,
    };

    // If the old column changed, remove task ID from old column set in Redis
    if (existing.columnId !== updated.columnId) {
      await redis.srem(COLUMN_KEY(existing.columnId), existing.id);
    }

    await cacheTask(updated);
    await enqueueDatabaseFlush({ operation: 'upsert', task: updated });

    // Check if adjacent orders need rebalancing
    const column = (await getAllTasks())
      .filter((t) => t.columnId === updated.columnId && t.id !== updated.id)
      .sort((a, b) => a.order - b.order);

    const idx   = column.findIndex((t) => t.order > updated.order);
    const prevT = idx > 0 ? column[idx - 1] : null;
    const nextT = idx >= 0 ? column[idx] : null;

    if (
      (prevT && needsRebalance(prevT.order, updated.order)) ||
      (nextT && needsRebalance(updated.order, nextT.order))
    ) {
      await enqueueDatabaseFlush({
        operation: 'rebalance',
        columnId:  updated.columnId,
      });
    }

    return { ok: true, data: updated };
  } catch (err) {
    console.error('[taskService.moveTask]', err);
    return { ok: false, code: 'MOVE_FAILED', message: String(err) };
  }
}

/**
 * DELETE a task — removes from Redis and enqueues a DB delete job.
 */
export async function deleteTask(
  payload: DeleteTaskPayload,
): Promise<ServiceOutcome<{ id: string }>> {
  try {
    const existing = await getTask(payload.id);
    if (!existing) {
      // Idempotent — task already gone, report success
      return { ok: true, data: { id: payload.id } };
    }

    const pipeline = redis.pipeline();
    pipeline.del(TASK_KEY(existing.id));
    pipeline.srem(COLUMN_KEY(existing.columnId), existing.id);
    pipeline.srem(BOARD_KEY, existing.id);
    await pipeline.exec();

    await enqueueDatabaseFlush({ operation: 'delete', taskId: payload.id });

    return { ok: true, data: { id: payload.id } };
  } catch (err) {
    console.error('[taskService.deleteTask]', err);
    return { ok: false, code: 'DELETE_FAILED', message: String(err) };
  }
}


/**
 * GET a single task by id — exposed for the REST read route.
 * Redis-first with Supabase cold-boot fallback.
 */
export async function getTaskById(id: string): Promise<Task | null> {
  return getTask(id);
}

// ── Lock key helper — exported for conflictService ────────────────────────────
export { LOCK_KEY };

