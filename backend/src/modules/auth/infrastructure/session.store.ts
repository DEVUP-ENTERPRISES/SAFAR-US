import { kv } from '../../../infrastructure/cache/kv-store';
import { config } from '../../../config';

/**
 * Session registry backed by the KV store (Redis in prod, in-memory in
 * local dev). The access token carries a session id; every authenticated
 * request checks the session is still live here, so a session can be
 * revoked instantly (logout / ban / suspicious login) regardless of the
 * JWT's remaining validity.
 *
 * We store the refresh token id (jti) to support rotation & replay
 * detection: presenting a rotated-out refresh token is treated as theft.
 */
const key = (sessionId: string): string => `session:${sessionId}`;

export class SessionStore {
  async create(sessionId: string, userId: string, refreshJti: string): Promise<void> {
    await kv().set(key(sessionId), JSON.stringify({ userId, refreshJti }), config.jwt.refreshTtl);
  }

  async isActive(sessionId: string): Promise<boolean> {
    return kv().exists(key(sessionId));
  }

  async getRefreshJti(sessionId: string): Promise<string | null> {
    const raw = await kv().get(key(sessionId));
    if (!raw) return null;
    return (JSON.parse(raw) as { refreshJti: string }).refreshJti;
  }

  async rotate(sessionId: string, userId: string, newRefreshJti: string): Promise<void> {
    await this.create(sessionId, userId, newRefreshJti);
  }

  async revoke(sessionId: string): Promise<void> {
    await kv().del(key(sessionId));
  }
}

export const sessionStore = new SessionStore();
