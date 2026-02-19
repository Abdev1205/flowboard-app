/**
 * services/auditService.ts
 *
 * Writes conflict events to the conflict_audit_log table.
 * PRD §4.3 FR-14 — "All conflicts logged server-side for audit."
 *
 * Design decisions:
 *   - Fire-and-forget (non-blocking) — conflict resolution MUST NOT wait for
 *     the DB write. If the insert fails we log the error and continue.
 *   - No Redis caching — audit logs are write-only, never read in hot path.
 *   - Uses service-role Supabase client (bypasses RLS).
 */
import { supabase } from '../db/client';
import type { Task } from '../services/taskService';

export interface ConflictAuditEntry {
  taskId:        string;
  winnerEvent:   string;
  loserEvent:    string;
  winnerUserId:  string;
  loserUserId:   string;
  resolvedState: Task;
  resolutionMsg: string;
}

/**
 * Asynchronously appends a conflict resolution record to the audit log.
 * Never throws — failure is logged to console only.
 */
export async function logConflict(entry: ConflictAuditEntry): Promise<void> {
  try {
    const { error } = await supabase.from('conflict_audit_log').insert({
      task_id:        entry.taskId,
      winner_event:   entry.winnerEvent,
      loser_event:    entry.loserEvent,
      winner_user_id: entry.winnerUserId,
      loser_user_id:  entry.loserUserId,
      resolved_state: entry.resolvedState as unknown as Record<string, unknown>,
      resolution_msg: entry.resolutionMsg,
    });

    if (error) {
      console.error('[auditService] Failed to insert conflict_audit_log:', error.message);
    }
  } catch (err) {
    console.error('[auditService] Unexpected error logging conflict:', err);
  }
}
