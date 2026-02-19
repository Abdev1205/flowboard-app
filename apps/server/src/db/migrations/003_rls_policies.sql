-- =============================================================================
-- 003_rls_policies.sql
-- Row Level Security — allow the service-role key to bypass RLS,
-- and deny anon/public access to task data.
--
-- Run AFTER 001 and 002.
-- =============================================================================

-- ── Enable RLS on both tables ─────────────────────────────────────────────────
ALTER TABLE tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflict_audit_log ENABLE ROW LEVEL SECURITY;

-- ── tasks: service-role has full access, anon has none ───────────────────────
-- The server uses the service-role key — it bypasses RLS automatically in
-- Supabase. These policies cover direct PostgREST / anon key access (deny all).

-- Drop existing policies if re-running to keep migration idempotent
DROP POLICY IF EXISTS tasks_deny_anon   ON tasks;
DROP POLICY IF EXISTS tasks_allow_service ON tasks;

-- Deny all access from the public / anon role
CREATE POLICY tasks_deny_anon
  ON tasks
  FOR ALL
  TO anon
  USING (false);

-- Allow service-role full access (this is the default but explicit is clearer)
CREATE POLICY tasks_allow_service
  ON tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── conflict_audit_log: service-role insert only, no updates/deletes ─────────
DROP POLICY IF EXISTS audit_deny_anon          ON conflict_audit_log;
DROP POLICY IF EXISTS audit_allow_service_read ON conflict_audit_log;
DROP POLICY IF EXISTS audit_allow_service_insert ON conflict_audit_log;

CREATE POLICY audit_deny_anon
  ON conflict_audit_log
  FOR ALL
  TO anon
  USING (false);

CREATE POLICY audit_allow_service_read
  ON conflict_audit_log
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY audit_allow_service_insert
  ON conflict_audit_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- No UPDATE or DELETE policies for service_role on audit_log — append-only.
