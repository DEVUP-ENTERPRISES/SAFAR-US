import { kv } from '../../../infrastructure/cache/kv-store';
import { isRedisHealthy } from '../../../infrastructure/cache/redis.client';
import { logger } from '../../../infrastructure/logging/logger';
import { config } from '../../../config';

/**
 * Session registry backed by the KV store (Redis in prod, in-memory in dev).
 * Each session carries device metadata (UA/IP) and is indexed per user so a
 * customer can see & revoke their active devices. The access token's session
 * id is validated on every request, so revoking here logs a device out
 * immediately despite the JWT's remaining validity.
 *
 * Resilience: the access token is a short-lived, independently-verified JWT, so
 * the session registry is a *revocation* layer, not the source of truth for who
 * you are. When Redis is unavailable we therefore degrade instead of failing:
 * writes become best-effort and liveness checks fail OPEN (trust the signed,
 * short-lived JWT) rather than 500-ing every request or locking everyone out.
 * Every degraded call is logged so the loss of instant revocation is visible.
 * Real errors while Redis is healthy still throw — we only degrade on an outage.
 */
export interface SessionMeta {
  userId: string;
  refreshJti: string;
  userAgent?: string;
  ip?: string;
  createdAt: string;
}

export interface SessionView {
  id: string;
  userAgent?: string;
  ip?: string;
  createdAt: string;
}

const sKey = (id: string): string => `session:${id}`;
const idxKey = (userId: string): string => `usersessions:${userId}`;

/**
 * Run a session-store operation, degrading gracefully on a Redis outage.
 * If Redis is healthy the error is real and rethrown; if it's down we log and
 * return the caller-chosen fallback (e.g. `true` to fail open, `undefined` to
 * make a write best-effort).
 */
async function resilient<T>(op: () => Promise<T>, fallback: T, action: string): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (isRedisHealthy()) throw err;
    logger.warn(
      { action, err: (err as Error).message },
      'Session store degraded — Redis unavailable; continuing on the signed JWT',
    );
    return fallback;
  }
}

async function readIndex(userId: string): Promise<string[]> {
  const raw = await kv().get(idxKey(userId));
  return raw ? (JSON.parse(raw) as string[]) : [];
}
async function writeIndex(userId: string, ids: string[]): Promise<void> {
  await kv().set(idxKey(userId), JSON.stringify(ids), config.jwt.refreshTtl);
}

export class SessionStore {
  async create(
    sessionId: string,
    userId: string,
    refreshJti: string,
    meta: { userAgent?: string; ip?: string } = {},
  ): Promise<void> {
    const record: SessionMeta = {
      userId,
      refreshJti,
      userAgent: meta.userAgent,
      ip: meta.ip,
      createdAt: new Date().toISOString(),
    };
    // Best-effort: if the registry write fails during an outage, login still
    // succeeds on the issued JWT — we just can't track/revoke this device yet.
    await resilient(async () => {
      await kv().set(sKey(sessionId), JSON.stringify(record), config.jwt.refreshTtl);
      const idx = await readIndex(userId);
      if (!idx.includes(sessionId)) await writeIndex(userId, [sessionId, ...idx]);
    }, undefined, 'create');
  }

  /**
   * Is this session still live? Fails OPEN on a Redis outage: the bearer is a
   * short-lived, signed JWT that has already been verified, so trusting it
   * briefly beats locking every user out. Revocation resumes when Redis is back.
   */
  async isActive(sessionId: string): Promise<boolean> {
    return resilient(() => kv().exists(sKey(sessionId)), true, 'isActive');
  }

  private async read(sessionId: string): Promise<SessionMeta | null> {
    const raw = await kv().get(sKey(sessionId));
    return raw ? (JSON.parse(raw) as SessionMeta) : null;
  }

  async getRefreshJti(sessionId: string): Promise<string | null> {
    return resilient(async () => (await this.read(sessionId))?.refreshJti ?? null, null, 'getRefreshJti');
  }

  /** Rotate the refresh token id while preserving device metadata. */
  async rotate(sessionId: string, userId: string, newRefreshJti: string): Promise<void> {
    await resilient(async () => {
      const existing = await this.read(sessionId);
      const record: SessionMeta = {
        userId,
        refreshJti: newRefreshJti,
        userAgent: existing?.userAgent,
        ip: existing?.ip,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };
      await kv().set(sKey(sessionId), JSON.stringify(record), config.jwt.refreshTtl);
    }, undefined, 'rotate');
  }

  async revoke(sessionId: string): Promise<void> {
    await resilient(async () => {
      const rec = await this.read(sessionId);
      await kv().del(sKey(sessionId));
      if (rec) {
        const idx = await readIndex(rec.userId);
        await writeIndex(rec.userId, idx.filter((id) => id !== sessionId));
      }
    }, undefined, 'revoke');
  }

  /** List a user's active devices/sessions (drops any that have expired). */
  async listForUser(userId: string): Promise<SessionView[]> {
    return resilient(async () => {
      const ids = await readIndex(userId);
      const out: SessionView[] = [];
      const live: string[] = [];
      for (const id of ids) {
        const rec = await this.read(id);
        if (rec) {
          out.push({ id, userAgent: rec.userAgent, ip: rec.ip, createdAt: rec.createdAt });
          live.push(id);
        }
      }
      if (live.length !== ids.length) await writeIndex(userId, live);
      return out;
    }, [], 'listForUser');
  }

  /** Revoke all sessions for a user, optionally keeping one (e.g. current). */
  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    await resilient(async () => {
      const ids = await readIndex(userId);
      for (const id of ids) {
        if (id !== exceptSessionId) await kv().del(sKey(id));
      }
      await writeIndex(userId, exceptSessionId ? [exceptSessionId] : []);
    }, undefined, 'revokeAllForUser');
  }

  /** Confirm a session belongs to a user (guards revoke-by-id). */
  async belongsTo(sessionId: string, userId: string): Promise<boolean> {
    return resilient(async () => (await this.read(sessionId))?.userId === userId, false, 'belongsTo');
  }
}

export const sessionStore = new SessionStore();
