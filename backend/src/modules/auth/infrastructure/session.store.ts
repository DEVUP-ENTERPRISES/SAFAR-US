import { kv } from '../../../infrastructure/cache/kv-store';
import { logger } from '../../../infrastructure/logging/logger';
import { config } from '../../../config';
import { SessionModel } from './session.model';

/**
 * Session registry: MongoDB is the record, the KV store (Redis) is a cache.
 *
 * Each session carries device metadata and is validated on every request, so
 * revoking it logs a device out immediately despite the JWT's remaining life.
 *
 * Why the record lives in MongoDB. Sessions used to exist only in Redis, so
 * anything that emptied it — a Redis restart without persistence, the in-memory
 * fallback after a failed connect, a redeploy — made every session look
 * "not found" and signed every user out at once. Now a cache miss (or a Redis
 * outage) is answered from MongoDB and the cache is refilled, so restarting the
 * API, Redis or both never logs anyone out. Revocation is exact in every case:
 * it deletes the record and the cached copy.
 */
export interface SessionMeta {
  userId: string;
  refreshJti: string;
  prevRefreshJti?: string;
  rotatedAt?: string;
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
const ttlMs = (): number => config.jwt.refreshTtl * 1000;
/** The cache only bounds how stale a revocation can look: if a delete is missed (cache outage, another instance), the database wins within this many seconds. */
const CACHE_SECONDS = 60;

/** The cache is an optimisation; its failure must never fail a request. */
async function cache<T>(op: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await op();
  } catch (err) {
    logger.debug({ err: (err as Error).message }, 'session cache unavailable — using the database');
    return fallback;
  }
}

export class SessionStore {
  async create(
    sessionId: string,
    userId: string,
    refreshJti: string,
    meta: { userAgent?: string; ip?: string } = {},
  ): Promise<void> {
    const now = new Date();
    await SessionModel.updateOne(
      { _id: sessionId },
      {
        $set: { userId, refreshJti, userAgent: meta.userAgent, ip: meta.ip, expiresAt: new Date(now.getTime() + ttlMs()) },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    const record: SessionMeta = { userId, refreshJti, userAgent: meta.userAgent, ip: meta.ip, createdAt: now.toISOString() };
    await cache(() => kv().set(sKey(sessionId), JSON.stringify(record), CACHE_SECONDS), undefined);
  }

  /** Cache first, then the database (refilling the cache); null when the session is gone or expired. */
  private async read(sessionId: string, fresh = false): Promise<SessionMeta | null> {
    const cached = fresh ? null : await cache(() => kv().get(sKey(sessionId)), null);
    if (cached) return JSON.parse(cached) as SessionMeta;

    const doc = await SessionModel.findById(sessionId).lean();
    if (!doc || doc.expiresAt.getTime() <= Date.now()) return null;
    const record: SessionMeta = {
      userId: doc.userId,
      refreshJti: doc.refreshJti,
      prevRefreshJti: doc.prevRefreshJti,
      rotatedAt: doc.rotatedAt?.toISOString(),
      userAgent: doc.userAgent,
      ip: doc.ip,
      createdAt: doc.createdAt.toISOString(),
    };
    const remaining = Math.min(CACHE_SECONDS, Math.max(1, Math.floor((doc.expiresAt.getTime() - Date.now()) / 1000)));
    await cache(() => kv().set(sKey(sessionId), JSON.stringify(record), remaining), undefined);
    return record;
  }

  async isActive(sessionId: string): Promise<boolean> {
    return (await this.read(sessionId)) !== null;
  }

  async getRefreshJti(sessionId: string): Promise<string | null> {
    return (await this.read(sessionId))?.refreshJti ?? null;
  }

  /** The current refresh id plus the one it replaced and when, so a retried refresh can be told from a stolen token. */
  async getRefreshState(sessionId: string): Promise<{ jti: string; prevJti?: string; rotatedAt?: Date } | null> {
    // Always from the database: a stale copy on one instance must never make a valid refresh look like token theft.
    const s = await this.read(sessionId, true);
    return s ? { jti: s.refreshJti, prevJti: s.prevRefreshJti, rotatedAt: s.rotatedAt ? new Date(s.rotatedAt) : undefined } : null;
  }

  /** Rotate the refresh token id, keeping device metadata and sliding the expiry. */
  async rotate(sessionId: string, userId: string, newRefreshJti: string): Promise<void> {
    // A session that only ever lived in the cache (created before it was persisted) is written to the database here.
    const prior = await this.read(sessionId).catch(() => null);
    const expiresAt = new Date(Date.now() + ttlMs());
    await SessionModel.updateOne(
      { _id: sessionId },
      {
        $set: { userId, refreshJti: newRefreshJti, prevRefreshJti: prior?.refreshJti, rotatedAt: new Date(), expiresAt, userAgent: prior?.userAgent, ip: prior?.ip },
        $setOnInsert: { createdAt: prior ? new Date(prior.createdAt) : new Date() },
      },
      { upsert: true },
    );
    const record: SessionMeta = {
      userId,
      refreshJti: newRefreshJti,
      prevRefreshJti: prior?.refreshJti,
      rotatedAt: new Date().toISOString(),
      userAgent: prior?.userAgent,
      ip: prior?.ip,
      createdAt: prior?.createdAt ?? new Date().toISOString(),
    };
    await cache(() => kv().set(sKey(sessionId), JSON.stringify(record), CACHE_SECONDS), undefined);
  }

  async revoke(sessionId: string): Promise<void> {
    await SessionModel.deleteOne({ _id: sessionId });
    await cache(() => kv().del(sKey(sessionId)), undefined);
  }

  /** List a user's active devices/sessions, newest first. */
  async listForUser(userId: string): Promise<SessionView[]> {
    const docs = await SessionModel.find({ userId, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map((d) => ({ id: d._id, userAgent: d.userAgent, ip: d.ip, createdAt: d.createdAt.toISOString() }));
  }

  /** Revoke all sessions for a user, optionally keeping one (e.g. current). */
  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    const filter = { userId, ...(exceptSessionId ? { _id: { $ne: exceptSessionId } } : {}) };
    const ids = (await SessionModel.find(filter, { _id: 1 }).lean()).map((d) => d._id);
    await SessionModel.deleteMany(filter);
    for (const id of ids) await cache(() => kv().del(sKey(id)), undefined);
  }

  /** Confirm a session belongs to a user (guards revoke-by-id). */
  async belongsTo(sessionId: string, userId: string): Promise<boolean> {
    return (await this.read(sessionId))?.userId === userId;
  }
}

export const sessionStore = new SessionStore();
