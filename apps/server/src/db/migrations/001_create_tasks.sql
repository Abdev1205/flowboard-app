-- =============================================================================
-- 001_create_tasks.sql
-- Creates the core tasks table with all required columns, constraints,
-- indexes, and an auto-update trigger for updated_at.
--
-- Run via: Supabase SQL Editor → paste and execute
-- Or: node -r ts-node/register apps/server/src/db/migrate.ts
-- =============================================================================

-- ── Enable uuid extension (Supabase has it by default, but guard anyway) ─────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Tasks table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Column the task belongs to — enforced as an enum-like constraint
  column_id   TEXT          NOT NULL
                            CHECK (column_id IN ('todo', 'in-progress', 'done')),

  title       TEXT          NOT NULL
                            CHECK (char_length(title) BETWEEN 1 AND 500),

  description TEXT          NOT NULL
                            DEFAULT ''
                            CHECK (char_length(description) <= 5000),

  -- Fractional index — arbitrary precision float for O(1) reordering
  "order"     DOUBLE PRECISION NOT NULL,

  -- Optimistic concurrency lock counter — incremented on every mutation
  version     INTEGER       NOT NULL DEFAULT 1
                            CHECK (version >= 1),

  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary query pattern: fetch all tasks in a column sorted by order
CREATE INDEX IF NOT EXISTS tasks_column_order_idx
  ON tasks (column_id, "order" ASC);

-- Used by conflict detection: look up a single task by id + version quickly
CREATE INDEX IF NOT EXISTS tasks_id_version_idx
  ON tasks (id, version);

-- ── Auto-update trigger for updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_set_updated_at ON tasks;
CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ── Comments ──────────────────────────────────────────────────────────────────
COMMENT ON TABLE  tasks              IS 'FlowBoard task items';
COMMENT ON COLUMN tasks.column_id   IS 'Kanban column: todo | in-progress | done';
COMMENT ON COLUMN tasks."order"     IS 'Fractional index for O(1) reordering. Never use array index.';
COMMENT ON COLUMN tasks.version     IS 'Optimistic lock counter. Clients must match server version to mutate.';
