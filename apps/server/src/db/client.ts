/**
 * db/client.ts
 *
 * Supabase PostgreSQL client singleton.
 *
 * We expose two clients:
 *   - `supabase`  — Supabase JS client (for simple CRUD via the Supabase API)
 *   - `db`        — Raw postgres connection string for direct SQL (used by BullMQ
 *                   flush worker and complex transactions via Supabase's REST API)
 *
 * Environment variables:
 *   DATABASE_URL — full PostgreSQL connection string from Supabase
 *                  (Settings → Database → Connection string → URI)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── Validate env ──────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`[DB] Required environment variable "${key}" is not set`);
  return value;
}

// ── Parse Supabase project URL + anon key from DATABASE_URL ──────────────────
//
// Supabase JS client needs:
//   - Project URL:  https://<ref>.supabase.co
//   - Service-role key OR anon key
//
// For server-side use we use the service-role key (bypasses RLS).
// If you only have DATABASE_URL, we derive the project URL from it.

function getSupabaseConfig(): { url: string; key: string } {
  // Prefer explicit vars if provided
  const explicitUrl = process.env.SUPABASE_URL;
  const explicitKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (explicitUrl && explicitKey) {
    return { url: explicitUrl, key: explicitKey };
  }

  // Derive project URL from DATABASE_URL
  // postgresql://postgres:[password]@db.<ref>.supabase.co:5432/postgres
  const dbUrl = requireEnv('DATABASE_URL');
  const match = dbUrl.match(/@db\.([^.]+)\.supabase\.co/);
  if (!match) {
    throw new Error(
      '[DB] Cannot derive Supabase project URL from DATABASE_URL. ' +
      'Provide SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY explicitly.',
    );
  }
  const projectRef = match[1];
  const supabaseUrl = `https://${projectRef}.supabase.co`;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
  if (!key) {
    throw new Error(
      '[DB] SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) is required. ' +
      'Find it in Supabase → Settings → API.',
    );
  }

  return { url: supabaseUrl, key };
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;

  const { url, key } = getSupabaseConfig();

  _supabase = createClient(url, key, {
    auth: {
      persistSession: false,   // server-side — no session storage
      autoRefreshToken: false,
    },
  });

  console.log('[DB] Supabase client initialised');
  return _supabase;
}

/**
 * Shared Supabase client — import this in service files.
 *
 *   import { supabase } from '../db/client';
 *   const { data, error } = await supabase.from('tasks').select('*');
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop: string | symbol) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/**
 * Raw DATABASE_URL — for BullMQ worker, direct pg queries, etc.
 */
export const DATABASE_URL = process.env.DATABASE_URL ?? '';

export default supabase;
