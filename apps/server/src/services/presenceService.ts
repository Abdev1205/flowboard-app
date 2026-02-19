/**
 * services/presenceService.ts
 *
 * User presence state stored in Redis.
 * Each connected user's presence is stored as a Redis Hash.
 * A Redis Set tracks all currently-connected user IDs.
 *
 * Key schema:
 *   presence:<socketId>        HASH  { userId, displayName, color, editingTaskId?, connectedAt }
 *   presence:active            SET   { socketId, ... }
 *
 * TTL: 2 hours — covers typical work sessions. The disconnect handler
 * removes the entry immediately on clean disconnect.
 *
 * Architecture rules (CONTEXT.md): NO socket.io imports here.
 */
import { redis } from '../cache/redis';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserPresence {
  userId:        string;
  displayName:   string;
  color:         string;   // hex colour, randomly assigned on connect
  editingTaskId?: string;
  connectedAt:  string;   // ISO 8601
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESENCE_KEY    = (socketId: string): string => `presence:${socketId}`;
const ACTIVE_SET_KEY  = 'presence:active';
const PRESENCE_TTL    = 7200; // 2 hours in seconds

/** Presence colours from BRANDING.md — assigned round-robin on connect. */
const PRESENCE_COLOURS: string[] = [
  '#3B82F6', // --presence-1  blue
  '#8B5CF6', // --presence-2  violet
  '#EC4899', // --presence-3  pink
  '#F59E0B', // --presence-4  amber
  '#10B981', // --presence-5  emerald
  '#EF4444', // --presence-6  red
];

// ── Colour assignment ─────────────────────────────────────────────────────────

/**
 * Pick a colour for a new user that is least-used among active users.
 * Falls back to random if the Redis set is empty.
 */
export async function assignPresenceColour(): Promise<string> {
  const activeIds = await redis.smembers(ACTIVE_SET_KEY);

  if (activeIds.length === 0) return PRESENCE_COLOURS[0];

  // Count usage of each colour
  const counts = new Map<string, number>(PRESENCE_COLOURS.map((c) => [c, 0]));

  const pipeline = redis.pipeline();
  for (const sid of activeIds) pipeline.hget(PRESENCE_KEY(sid), 'color');
  const results = await pipeline.exec();

  if (results) {
    for (const [, color] of results) {
      if (typeof color === 'string' && counts.has(color)) {
        counts.set(color, (counts.get(color) ?? 0) + 1);
      }
    }
  }

  // Return the colour with the lowest usage count
  let chosen = PRESENCE_COLOURS[0];
  let minCount = Infinity;
  for (const [color, count] of counts) {
    if (count < minCount) {
      minCount = count;
      chosen   = color;
    }
  }
  return chosen;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * Register a newly-connected user.
 * Called in the socket 'connect' event handler.
 */
export async function addPresence(
  socketId:    string,
  displayName: string,
): Promise<UserPresence> {
  const color = await assignPresenceColour();
  const presence: UserPresence = {
    userId:      socketId, // use socketId as userId — unique per connection
    displayName,
    color,
    connectedAt: new Date().toISOString(),
  };

  const pipeline = redis.pipeline();
  pipeline.hset(PRESENCE_KEY(socketId), {
    userId:      presence.userId,
    displayName: presence.displayName,
    color:       presence.color,
    connectedAt: presence.connectedAt,
  });
  pipeline.expire(PRESENCE_KEY(socketId), PRESENCE_TTL);
  pipeline.sadd(ACTIVE_SET_KEY, socketId);
  await pipeline.exec();

  return presence;
}

/**
 * Remove a disconnected user.
 * Called in the socket 'disconnect' event handler.
 */
export async function removePresence(socketId: string): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.del(PRESENCE_KEY(socketId));
  pipeline.srem(ACTIVE_SET_KEY, socketId);
  await pipeline.exec();
}

/**
 * Update editing status for a user (PRESENCE_UPDATE event).
 * Sets or clears the editingTaskId field.
 */
export async function updatePresenceStatus(
  socketId: string,
  status:   'editing' | 'idle',
  taskId?:  string,
): Promise<UserPresence | null> {
  const presence = await getPresence(socketId);
  if (!presence) return null;

  if (status === 'editing' && taskId) {
    await redis.hset(PRESENCE_KEY(socketId), 'editingTaskId', taskId);
    presence.editingTaskId = taskId;
  } else {
    await redis.hdel(PRESENCE_KEY(socketId), 'editingTaskId');
    delete presence.editingTaskId;
  }

  // Refresh TTL on activity
  await redis.expire(PRESENCE_KEY(socketId), PRESENCE_TTL);

  return presence;
}

/**
 * Get a single user's presence by socketId.
 */
export async function getPresence(socketId: string): Promise<UserPresence | null> {
  const hash = await redis.hgetall(PRESENCE_KEY(socketId));
  if (!hash || !hash.userId) return null;

  return {
    userId:        hash.userId,
    displayName:   hash.displayName,
    color:         hash.color,
    editingTaskId: hash.editingTaskId ?? undefined,
    connectedAt:   hash.connectedAt,
  };
}

/**
 * Get all currently-active presences.
 * Used for BOARD_SNAPSHOT and PRESENCE_STATE broadcasts.
 */
/**
 * Wipe all presence data.
 * Called on server startup to remove stale state from previous runs.
 */
export async function cleanAllPresences(): Promise<void> {
  // We only delete the set. Individual hash keys will expire via TTL.
  await redis.del(ACTIVE_SET_KEY);
}

/**
 * Get all currently-active presences.
 * Used for BOARD_SNAPSHOT and PRESENCE_STATE broadcasts.
 *
 * Checks for stale members (IDs in the set but with expired/missing hash keys)
 * and lazily removes them to keep the set clean.
 */
export async function getAllPresences(): Promise<UserPresence[]> {
  const socketIds = await redis.smembers(ACTIVE_SET_KEY);
  if (socketIds.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const sid of socketIds) pipeline.hgetall(PRESENCE_KEY(sid));
  const results = await pipeline.exec();

  if (!results) return [];

  const presences: UserPresence[] = [];
  const staleIds: string[] = [];

  results.forEach((res, index) => {
    const [err, hash] = res;
    // hgetall returns {} if key missing, so check for a required field like userId
    if (!err && hash && (hash as Record<string, string>).userId) {
      const h = hash as Record<string, string>;
      presences.push({
        userId:        h.userId,
        displayName:   h.displayName,
        color:         h.color,
        editingTaskId: h.editingTaskId ?? undefined,
        connectedAt:   h.connectedAt,
      });
    } else {
      // If key is missing or invalid, mark for removal
      staleIds.push(socketIds[index]);
    }
  });

  // Self-heal: remove stale IDs found in the set
  if (staleIds.length > 0) {
    await redis.srem(ACTIVE_SET_KEY, ...staleIds);
  }

  return presences;
}
