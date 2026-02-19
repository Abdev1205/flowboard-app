-- 001_create_tasks.sql
-- Initial migration: create tasks table
-- Run via Supabase SQL editor or migration tool

CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id   TEXT NOT NULL CHECK (column_id IN ('todo', 'in-progress', 'done')),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  "order"     DOUBLE PRECISION NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_column_order_idx ON tasks (column_id, "order");
