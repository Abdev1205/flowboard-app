-- =============================================================================
-- 002_create_audit_log.sql
-- Conflict audit log — PRD §4.3 FR-14: "All conflicts logged server-side"
--
-- Append-only table. Rows are never updated or deleted.
-- Partitioned logically by month via conflict_at index.
-- =============================================================================

CREATE TABLE IF NOT EXISTS conflict_audit_log (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Task that had the conflict
  task_id         UUID          NOT NULL,

  -- The two event types that collided (e.g. TASK_MOVE vs TASK_MOVE)
  winner_event    TEXT          NOT NULL,
  loser_event     TEXT          NOT NULL,

  -- Socket IDs of winner and loser (no auth in v1 — userId = socketId)
  winner_user_id  TEXT          NOT NULL,
  loser_user_id   TEXT          NOT NULL,

  -- Server-side snapshot of the resolved task state after conflict resolution
  resolved_state  JSONB         NOT NULL,

  -- Human-readable summary of what happened
  resolution_msg  TEXT          NOT NULL,

  conflict_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Most common query: "show me all conflicts for task X"
CREATE INDEX IF NOT EXISTS conflict_audit_task_idx
  ON conflict_audit_log (task_id, conflict_at DESC);

-- Analytics: "how many conflicts in the last 24h"
CREATE INDEX IF NOT EXISTS conflict_audit_time_idx
  ON conflict_audit_log (conflict_at DESC);

-- ── Comments ──────────────────────────────────────────────────────────────────
COMMENT ON TABLE conflict_audit_log IS
  'Append-only log of all server-resolved conflicts. Never mutated after insert.';

COMMENT ON COLUMN conflict_audit_log.resolved_state IS
  'Full Task JSON snapshot at time of resolution — useful for debugging.';
