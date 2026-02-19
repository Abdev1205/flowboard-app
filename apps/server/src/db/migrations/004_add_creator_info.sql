
-- 004_add_creator_info.sql
-- Adds creator metadata to tasks for persistent attribution.

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS creator_name TEXT DEFAULT 'Anonymous',
ADD COLUMN IF NOT EXISTS creator_color TEXT DEFAULT '#cbd5e1';  -- slate-300 default

COMMENT ON COLUMN tasks.creator_name IS 'Display name of the user who created the task (snapshot).';
COMMENT ON COLUMN tasks.creator_color IS 'Hex color of the user who created the task (snapshot).';
