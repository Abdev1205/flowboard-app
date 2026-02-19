/**
 * lib/conflictNotify.ts
 *
 * Shows a toast notification when the server emits CONFLICT_NOTIFY.
 * Uses sonner (lightweight, zero-dependency toast library).
 *
 * Import the <Toaster /> component once in App.tsx.
 */
import { toast } from 'sonner';
import type { Task } from '@/types';

export interface ConflictPayload {
  taskId:        string;
  resolvedState: Task;
  message:       string;
}

/**
 * Call this inside the useWebSocket CONFLICT_NOTIFY handler.
 * Shows a warning toast and returns the resolvedState for the store rollback.
 */
export function notifyConflict(payload: ConflictPayload): void {
  toast.warning('Conflict resolved', {
    description: payload.message,
    duration:    5000,
    // Tailwind classes work inside sonner via style props
    style: { fontFamily: 'var(--font-body)' },
  });
}
