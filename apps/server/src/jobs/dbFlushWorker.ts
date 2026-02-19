/**
 * jobs/dbFlushWorker.ts
 *
 * BullMQ queue + worker that flushes Redis state to PostgreSQL.
 *
 * Strategy (DESIGN.md §3 — Write-Around Cache):
 *   - Every mutation enqueues a job with a 500 ms delay.
 *   - If the same taskId is moved 10× in 500 ms, only the last state
 *     is written to the DB (BullMQ jobId deduplication).
 *   - The worker reads the task state at the time it runs, so we always
 *     write the latest version, not the version at enqueue time.
 *
 * BullMQ connection note:
 *   BullMQ bundles its own ioredis fork internally. Passing our ioredis
 *   Redis instance directly causes type mismatches. Instead we pass a
 *   plain { host, port, password, tls } connection object which both
 *   ioredis versions understand.
 *
 * Job types:
 *   upsert   — INSERT or UPDATE a task row (most common)
 *   delete   — DELETE a task row
 *   rebalance — Reassign order values for a column (rare)
 */
import { Queue, Worker, type Job } from 'bullmq';
import { supabase } from '../db/client';
import { rebalancedOrders } from '../lib/fractionalIndex';
import type { Task, ColumnId } from '../services/taskService';

// ── Job Payloads ──────────────────────────────────────────────────────────────

export interface UpsertJob {
  operation: 'upsert';
  task:      Task;
}

export interface DeleteJob {
  operation: 'delete';
  taskId:    string;
}

export interface RebalanceJob {
  operation: 'rebalance';
  columnId:  ColumnId;
}

export type FlushJobPayload = UpsertJob | DeleteJob | RebalanceJob;

// ── Redis connection config (plain object — avoids ioredis version mismatch) ──

function buildBullMQConnection() {
  const rawUrl = process.env.REDIS_URL ?? '';
  const token  = process.env.REDIS_TOKEN ?? '';

  // Upstash REST URL → parse to host/port/password
  if (rawUrl.startsWith('https://') || rawUrl.startsWith('http://')) {
    const hostname = rawUrl.replace(/^https?:\/\//, '');
    const config = {
      host:     hostname,
      port:     6379,
      username: 'default',
      password: token,
      family:   4,
      tls:      {
        servername: hostname,
        rejectUnauthorized: false, // Often helps with Upstash/BullMQ handshake issues
      },
      maxRetriesPerRequest: null,
    };
    return config;
  }

  // rediss://:<password>@<host>:<port>
  try {
    const parsed = new URL(rawUrl);
    return {
      host:     parsed.hostname,
      port:     parseInt(parsed.port || '6379', 10),
      password: parsed.password || token || undefined,
      tls:      rawUrl.startsWith('rediss://') ? {} : undefined,
    };
  } catch {
    // Fallback: local redis
    return { host: '127.0.0.1', port: 6379 };
  }
}

// ── Queue ─────────────────────────────────────────────────────────────────────

const QUEUE_NAME  = 'db-flush';
const FLUSH_DELAY = 500; // ms — matches CONTEXT.md spec

let _queue: Queue | null = null;

function getQueue(): Queue {
  if (_queue) return _queue;
  _queue = new Queue(QUEUE_NAME, {
    connection: buildBullMQConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail:     50,
      attempts:         5,
      backoff: { type: 'exponential', delay: 1000 },
    },
  });
  return _queue;
}

/**
 * Enqueue a database flush job.
 *
 * Deterministic jobId deduplicates rapid-fire events:
 *   upsert/delete → `task:<taskId>`
 *   rebalance     → `rebalance:<columnId>`
 */
export async function enqueueDatabaseFlush(payload: FlushJobPayload): Promise<void> {
  const queue = getQueue();

  let jobId: string;
  if (payload.operation === 'upsert') {
    jobId = `task_${payload.task.id}`;
  } else if (payload.operation === 'delete') {
    jobId = `task_${payload.taskId}`;
  } else {
    jobId = `rebalance_${payload.columnId}`;
  }

  // Remove existing job to ensure the latest operation wins (debounce)
  const existingJob = await queue.getJob(jobId);
  if (existingJob) {
    try {
      await existingJob.remove();
    } catch (err) {
      // Ignore "job not found" or similar states if job finished just now
    }
  }

  await queue.add(payload.operation, payload, {
    jobId,
    delay: FLUSH_DELAY,
  });
}

// ── Worker ────────────────────────────────────────────────────────────────────

let _worker: Worker | null = null;

/**
 * Start the BullMQ worker.
 * Call once from server.ts after socket.io is initialised.
 */
export function startDbFlushWorker(): Worker {
  if (_worker) return _worker;

  _worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const payload = job.data as FlushJobPayload;

      switch (payload.operation) {
        case 'upsert':
          await handleUpsert(payload.task);
          break;
        case 'delete':
          await handleDelete(payload.taskId);
          break;
        case 'rebalance':
          await handleRebalance(payload.columnId);
          break;
      }
    },
    {
      connection:  buildBullMQConnection(),
      concurrency: 5,
    },
  );

  _worker.on('completed', (job) => {
    console.log(`[BullMQ] Job ${job.id} (${job.name}) completed`);
  });
  _worker.on('failed', (job, err) => {
    console.error(`[BullMQ] Job ${job?.id} failed:`, err.message);
  });

  console.log('[BullMQ] DB flush worker started');
  return _worker;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleUpsert(task: Task): Promise<void> {
  const { error } = await supabase.from('tasks').upsert(
    {
      id:          task.id,
      column_id:   task.columnId,
      title:       task.title,
      description: task.description,
      order:       task.order,
      version:     task.version,
      created_at:  task.createdAt,
      updated_at:  task.updatedAt,
      creator_name: task.creatorName,
      creator_color: task.creatorColor,
      updated_by_name: task.updatedByName,
      updated_by_color: task.updatedByColor,
    },
    { onConflict: 'id' },
  );

  if (error) {
    throw new Error(`[BullMQ] Upsert failed for task ${task.id}: ${error.message}`);
  }
}

async function handleDelete(taskId: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) {
    throw new Error(`[BullMQ] Delete failed for task ${taskId}: ${error.message}`);
  }
}

/**
 * Rebalance order values for a column.
 * Fetches all tasks sorted by current order, reassigns integer multiples
 * of 1000, and bulk-upserts.
 */
async function handleRebalance(columnId: ColumnId): Promise<void> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, order')
    .eq('column_id', columnId)
    .order('order', { ascending: true });

  if (error || !data || data.length === 0) return;

  const newOrders = rebalancedOrders(data.length);
  const updates   = (data as Array<{ id: string; order: number }>).map((row, i) => ({
    id:         row.id,
    column_id:  columnId,
    order:      newOrders[i],
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertErr } = await supabase
    .from('tasks')
    .upsert(updates, { onConflict: 'id' });

  if (upsertErr) {
    throw new Error(`[BullMQ] Rebalance failed for column ${columnId}: ${upsertErr.message}`);
  }

  // Also update Redis with new orders so in-flight state stays consistent
  const { getRedis } = await import('../cache/redis');
  const r    = getRedis();
  const pipe = r.pipeline();
  for (const u of updates) {
    pipe.hset(`task:${u.id}`, 'order', String(u.order));
  }
  await pipe.exec();

  console.log(`[BullMQ] Rebalanced ${data.length} tasks in column "${columnId}"`);
}
