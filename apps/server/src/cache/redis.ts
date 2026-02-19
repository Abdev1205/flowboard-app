/**
 * cache/redis.ts
 *
 * Upstash Redis client via ioredis.
 *
 * Upstash requires HTTP-based REST calls OR a standard Redis protocol URL.
 * We use ioredis with the `rediss://` protocol URL that Upstash provides,
 * which uses TLS. The REDIS_TOKEN is passed as the password.
 *
 * Environment variables (from .env):
 *   REDIS_URL   — e.g. rediss://finer-crawdad-25180.upstash.io:6380
 *                 OR   https://finer-crawdad-25180.upstash.io  (REST URL)
 *   REDIS_TOKEN — Upstash REST token (used as Redis password)
 *
 * Upstash ioredis connection format:
 *   rediss://:<TOKEN>@<HOSTNAME>:6380
 */
import Redis from 'ioredis';

function buildRedisUrl(): string {
  const rawUrl = process.env.REDIS_URL ?? '';
  const token  = process.env.REDIS_TOKEN ?? '';

  if (!rawUrl) {
    throw new Error('[Redis] REDIS_URL environment variable is not set');
  }
  if (!token) {
    throw new Error('[Redis] REDIS_TOKEN environment variable is not set');
  }

  // If REDIS_URL is already a redis(s):// URL, inject the token as password
  if (rawUrl.startsWith('redis://') || rawUrl.startsWith('rediss://')) {
    return rawUrl;
  }

  // Upstash REST URL format → convert to ioredis rediss:// format
  // https://xyz.upstash.io → rediss://:TOKEN@xyz.upstash.io:6380
  const hostname = rawUrl.replace(/^https?:\/\//, '');
  return `rediss://:${token}@${hostname}:6380`;
}

let _redis: Redis | null = null;

/**
 * Returns the shared Redis client (singleton).
 * Lazy-initialised — safe to import in service files.
 */
export function getRedis(): Redis {
  if (_redis) return _redis;

  const connectionUrl = buildRedisUrl();

  _redis = new Redis(connectionUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck:     true,
    lazyConnect:          false,
    retryStrategy: (times: number) => {
      if (times > 5) {
        console.error('[Redis] Max retries exceeded — giving up');
        return null; // stop retrying
      }
      return Math.min(times * 200, 2000); // exponential back-off, cap 2s
    },
  });

  _redis.on('connect', () => console.log('[Redis] Connected to Upstash'));
  _redis.on('ready',   () => console.log('[Redis] Ready'));
  _redis.on('error',   (err: Error) => console.error('[Redis] Error:', err.message));
  _redis.on('close',   () => console.warn('[Redis] Connection closed'));

  return _redis;
}

/**
 * Shared client — import this directly in service files.
 *
 *   import { redis } from '../cache/redis';
 *   await redis.get('key');
 */
export const redis = new Proxy({} as Redis, {
  get(_target, prop: string | symbol) {
    return (getRedis() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export default redis;
