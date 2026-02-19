// validation/taskSchema.ts — Zod schemas for all WebSocket payloads
// Will be implemented in the next step
import { z } from 'zod';

export const columnIdSchema = z.enum(['todo', 'in-progress', 'done']);

// Placeholder schemas — will be fully implemented in next step
export const taskCreateSchema = z.object({
  columnId:    columnIdSchema,
  title:       z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
});

export const taskUpdateSchema = z.object({
  id:          z.string().uuid(),
  title:       z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  version:     z.number().int().positive(),
});

export const taskMoveSchema = z.object({
  id:       z.string().uuid(),
  columnId: columnIdSchema,
  order:    z.number().finite(),
  version:  z.number().int().positive(),
});

export const taskDeleteSchema = z.object({
  id: z.string().uuid(),
});

export const presenceUpdateSchema = z.object({
  status: z.enum(['editing', 'idle']),
  taskId: z.string().uuid().optional(),
});
