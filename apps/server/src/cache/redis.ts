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

// Return type is technically RedisOptions but IORedis types are loose here
function buildRedisConfig(): any {
  const rawUrl = process.env.REDIS_URL ?? '';
  const token  = process.env.REDIS_TOKEN ?? '';

  if (!rawUrl) throw new Error('[Redis] REDIS_URL not set');
  if (!token)  throw new Error('[Redis] REDIS_TOKEN not set');

  // If full rediss:// URL, parse it (or just return it if we didn't need special options)
  // But we need family: 4, so we must parse or pass options alongside.
  
  // Upstash REST URL handling
  const hostname = rawUrl.replace(/^https?:\/\//, '').replace(/^rediss?:\/\//, '');
  
  // Clean hostname if it keeps port
  const [hostFromUrl, portStr] = hostname.split(':');
  const host = hostFromUrl;
  const port = portStr ? parseInt(portStr, 10) : 6379; // Standard Upstash TCP port

  return {
    host,
    port,
    username: 'default', // Upstash standard user
    password: token,
    family:   4, // Force IPv4
    connectTimeout: 10000, // 10s timeout
    tls:      {
      servername: host,
      rejectUnauthorized: false, 
    },
    // Common settings
    maxRetriesPerRequest: 3, 
    enableReadyCheck:     true,
    lazyConnect:          false,
    retryStrategy: (times: number) => {
      if (times > 5) {
        console.error('[Redis] Max retries exceeded — giving up');
        return null;
      }
      return Math.min(times * 200, 2000);
    },
  };
}

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;

  // Use the config object
  const config = buildRedisConfig();
  
  _redis = new Redis(config);

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
