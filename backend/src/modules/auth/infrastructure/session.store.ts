import { kv } from '../../../infrastructure/cache/kv-store';
import { config } from '../../../config';

/**
 * Session registry backed by the KV store (Redis in prod, in-memory in dev).
 * Each session carries device metadata (UA/IP) and is indexed per user so a
 * customer can see & revoke their active devices. The access token's session
 * id is validated on every request, so revoking here logs a device out
 * immediately despite the JWT's remaining validity.
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
    await kv().set(sKey(sessionId), JSON.stringify(record), config.jwt.refreshTtl);
    const idx = await readIndex(userId);
    if (!idx.includes(sessionId)) await writeIndex(userId, [sessionId, ...idx]);
  }

  async isActive(sessionId: string): Promise<boolean> {
    return kv().exists(sKey(sessionId));
  }

  private async read(sessionId: string): Promise<SessionMeta | null> {
    const raw = await kv().get(sKey(sessionId));
    return raw ? (JSON.parse(raw) as SessionMeta) : null;
  }

  async getRefreshJti(sessionId: string): Promise<string | null> {
    return (await this.read(sessionId))?.refreshJti ?? null;
  }

  /** Rotate the refresh token id while preserving device metadata. */
  async rotate(sessionId: string, userId: string, newRefreshJti: string): Promise<void> {
    const existing = await this.read(sessionId);
    const record: SessionMeta = {
      userId,
      refreshJti: newRefreshJti,
      userAgent: existing?.userAgent,
      ip: existing?.ip,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    await kv().set(sKey(sessionId), JSON.stringify(record), config.jwt.refreshTtl);
  }

  async revoke(sessionId: string): Promise<void> {
    const rec = await this.read(sessionId);
    await kv().del(sKey(sessionId));
    if (rec) {
      const idx = await readIndex(rec.userId);
      await writeIndex(rec.userId, idx.filter((id) => id !== sessionId));
    }
  }

  /** List a user's active devices/sessions (drops any that have expired). */
  async listForUser(userId: string): Promise<SessionView[]> {
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
  }

  /** Revoke all sessions for a user, optionally keeping one (e.g. current). */
  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    const ids = await readIndex(userId);
    for (const id of ids) {
      if (id !== exceptSessionId) await kv().del(sKey(id));
    }
    await writeIndex(userId, exceptSessionId ? [exceptSessionId] : []);
  }

  /** Confirm a session belongs to a user (guards revoke-by-id). */
  async belongsTo(sessionId: string, userId: string): Promise<boolean> {
    return (await this.read(sessionId))?.userId === userId;
  }
}

export const sessionStore = new SessionStore();
