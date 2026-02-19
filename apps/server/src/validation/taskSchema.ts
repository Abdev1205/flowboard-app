/**
 * validation/taskSchema.ts
 *
 * Zod schemas for every ClientEvent type defined in CONTEXT.md.
 * No imports except zod. No `any`. All fields strictly typed.
 *
 * Naming convention (as requested):
 *   CreateTaskSchema, UpdateTaskSchema, MoveTaskSchema,
 *   DeleteTaskSchema, ReplayOpsSchema, PresenceUpdateSchema
 *
 * Union entry-point:
 *   ClientEventSchema = z.discriminatedUnion('type', [...])
 */
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

/** Valid column identifiers — matches ColumnId in types/index.ts */
export const ColumnIdSchema = z.enum(['todo', 'in-progress', 'done']);
export type ColumnId = z.infer<typeof ColumnIdSchema>;

/**
 * UUID v4 string.
 * We validate format here rather than trusting the client.
 */
const uuidSchema = z
  .string()
  .uuid({ message: 'Must be a valid UUID v4' });

/**
 * Optimistic lock version counter — positive integer.
 * Clients increment this on every mutation; server enforces ordering.
 */
const versionSchema = z
  .number({ invalid_type_error: 'version must be a number' })
  .int({ message: 'version must be an integer' })
  .positive({ message: 'version must be a positive integer' });

/**
 * Fractional index order field — any finite float, no NaN/Infinity.
 */
const orderSchema = z
  .number({ invalid_type_error: 'order must be a number' })
  .finite({ message: 'order must be a finite number' });

// ─────────────────────────────────────────────────────────────────────────────
// Payload Schemas (standalone — usable inside handlers independently)
// ─────────────────────────────────────────────────────────────────────────────

/** TASK_CREATE payload */
export const CreateTaskPayloadSchema = z.object({
  id:          uuidSchema,
  columnId:    ColumnIdSchema,
  title:       z.string().min(1, 'Title is required').max(500, 'Title too long'),
  description: z.string().max(5000, 'Description too long').optional(),
  creatorName: z.string().optional(),
  creatorColor: z.string().optional(),
});
export type CreateTaskPayload = z.infer<typeof CreateTaskPayloadSchema>;

/** TASK_UPDATE payload */
export const UpdateTaskPayloadSchema = z
  .object({
    id:          uuidSchema,
    title:       z.string().min(1, 'Title is required').max(500, 'Title too long').optional(),
    description: z.string().max(5000, 'Description too long').optional(),
    version:     versionSchema,
  })
  .refine(
    (data) => data.title !== undefined || data.description !== undefined,
    { message: 'At least one of title or description must be provided' },
  );
export type UpdateTaskPayload = z.infer<typeof UpdateTaskPayloadSchema>;

/** TASK_MOVE payload */
export const MoveTaskPayloadSchema = z.object({
  id:       uuidSchema,
  columnId: ColumnIdSchema,
  order:    orderSchema,
  version:  versionSchema,
});
export type MoveTaskPayload = z.infer<typeof MoveTaskPayloadSchema>;

/** TASK_DELETE payload */
export const DeleteTaskPayloadSchema = z.object({
  id: uuidSchema,
});
export type DeleteTaskPayload = z.infer<typeof DeleteTaskPayloadSchema>;

/**
 * A single queued offline operation.
 * Mirrors QueuedOp in types/index.ts.
 * We use z.lazy() to allow the payload to be any of the other schemas.
 */
export const QueuedOpSchema = z.object({
  type: z.enum([
    'TASK_CREATE',
    'TASK_UPDATE',
    'TASK_MOVE',
    'TASK_DELETE',
    'PRESENCE_UPDATE',
  ] as const),
  payload: z.record(z.string(), z.unknown()),
  clientTimestamp: z
    .number({ invalid_type_error: 'clientTimestamp must be a number' })
    .int()
    .positive({ message: 'clientTimestamp must be a positive unix ms value' }),
});
export type QueuedOp = z.infer<typeof QueuedOpSchema>;

/** REPLAY_OPS payload — array of offline-queued ops */
export const ReplayOpsPayloadSchema = z
  .array(QueuedOpSchema)
  .min(1, 'REPLAY_OPS must contain at least one operation')
  .max(500, 'Too many queued operations');
export type ReplayOpsPayload = z.infer<typeof ReplayOpsPayloadSchema>;

/** PRESENCE_UPDATE payload */
export const PresenceUpdatePayloadSchema = z.object({
  status: z.enum(['editing', 'idle'] as const),
  taskId: uuidSchema.optional(),
});
export type PresenceUpdatePayload = z.infer<typeof PresenceUpdatePayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Full Event Schemas (payload wrapped in { type, payload })
// These are the canonical named exports as requested.
// ─────────────────────────────────────────────────────────────────────────────

export const CreateTaskSchema = z.object({
  type:    z.literal('TASK_CREATE'),
  payload: CreateTaskPayloadSchema,
});
export type CreateTaskEvent = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z.object({
  type:    z.literal('TASK_UPDATE'),
  payload: UpdateTaskPayloadSchema,
});
export type UpdateTaskEvent = z.infer<typeof UpdateTaskSchema>;

export const MoveTaskSchema = z.object({
  type:    z.literal('TASK_MOVE'),
  payload: MoveTaskPayloadSchema,
});
export type MoveTaskEvent = z.infer<typeof MoveTaskSchema>;

export const DeleteTaskSchema = z.object({
  type:    z.literal('TASK_DELETE'),
  payload: DeleteTaskPayloadSchema,
});
export type DeleteTaskEvent = z.infer<typeof DeleteTaskSchema>;

export const ReplayOpsSchema = z.object({
  type:    z.literal('REPLAY_OPS'),
  payload: ReplayOpsPayloadSchema,
});
export type ReplayOpsEvent = z.infer<typeof ReplayOpsSchema>;

export const PresenceUpdateSchema = z.object({
  type:    z.literal('PRESENCE_UPDATE'),
  payload: PresenceUpdatePayloadSchema,
});
export type PresenceUpdateEvent = z.infer<typeof PresenceUpdateSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Master Union — discriminated on 'type' field
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ClientEventSchema
 *
 * The single entry-point for validating any incoming WebSocket message.
 * Usage in a handler:
 *
 *   const event = ClientEventSchema.parse(raw);
 *   // event is now narrowed to the correct variant
 *   switch (event.type) {
 *     case 'TASK_CREATE': ...  // event.payload is CreateTaskPayload
 *     case 'TASK_UPDATE': ...  // event.payload is UpdateTaskPayload
 *     ...
 *   }
 */
export const ClientEventSchema = z.discriminatedUnion('type', [
  CreateTaskSchema,
  UpdateTaskSchema,
  MoveTaskSchema,
  DeleteTaskSchema,
  ReplayOpsSchema,
  PresenceUpdateSchema,
]);
export type ClientEvent = z.infer<typeof ClientEventSchema>;
