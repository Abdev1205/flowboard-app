/**
 * db/migrate.ts
 *
 * Programmatic migration runner.
 * Reads SQL files from migrations/ in filename order and executes them
 * against the Supabase PostgreSQL instance via the pg driver.
 *
 * Usage:
 *   npm run migrate          (from apps/server)
 *
 * Idempotent: all SQL statements use IF NOT EXISTS / CREATE OR REPLACE,
 * so re-running is safe.
 *
 * Env vars loaded from (first match wins):
 *   apps/server/.env.local  ← dev secrets live here
 *   apps/server/.env
 */
import dotenv from 'dotenv';
import fs     from 'node:fs';
import path   from 'node:path';
import pg     from 'pg';

// ── Load env vars ─────────────────────────────────────────────────────────────
// process.cwd() = apps/server/ when running `npm run migrate` from that directory.
// .env.local is git-ignored and holds dev secrets; .env holds shared defaults.
const _cwd = process.cwd();
dotenv.config({ path: path.join(_cwd, '.env.local') });
dotenv.config({ path: path.join(_cwd, '.env') });

// ── Constants ─────────────────────────────────────────────────────────────────
const { Client } = pg;
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// ── Runner ────────────────────────────────────────────────────────────────────
async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error(
      '[migrate] DATABASE_URL is not set.\n' +
      `         Looked for .env.local / .env in: ${_cwd}`,
    );
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }, // Supabase requires SSL
  });

  try {
    await client.connect();
    console.log('[migrate] Connected to PostgreSQL ✔');

    // Read migration files sorted by filename (001, 002, 003…)
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.warn('[migrate] No .sql files found in', MIGRATIONS_DIR);
      return;
    }

    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql      = fs.readFileSync(filePath, 'utf8');

      console.log(`[migrate] Running ${file}…`);
      await client.query(sql);
      console.log(`[migrate] ✓ ${file} complete`);
    }

    console.log('\n[migrate] All migrations applied ✅');
  } catch (err) {
    console.error('[migrate] Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
