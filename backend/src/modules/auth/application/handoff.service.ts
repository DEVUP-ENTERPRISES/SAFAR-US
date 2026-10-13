import { createHash, randomBytes } from 'crypto';
import { kv } from '../../../infrastructure/cache/kv-store';
import { UnauthorizedError } from '../../../core/errors/app-error';
import { authService, type AuthCtx, type AuthResult } from './auth.service';

/** Long enough to click through, short enough that a leaked code is worthless. */
const TTL_SECONDS = 60;
const keyOf = (code: string) => `auth:handoff:${createHash('sha256').update(code).digest('hex')}`;

/**
 * Moving a signed-in person between CatoDrive's own websites (catodrive.com and
 * the partner site), which keep separate sessions because they are separate
 * origins.
 *
 * The signed-in site asks for a one-time code; the other site redeems it for a
 * session of its own. No token ever travels in a URL: the code is random, only
 * its hash is stored, it lives a minute, and it can be redeemed once.
 */
export class HandoffService {
  async create(userId: string): Promise<{ code: string; expiresIn: number }> {
    const code = randomBytes(32).toString('base64url');
    await kv().set(keyOf(code), userId, TTL_SECONDS);
    return { code, expiresIn: TTL_SECONDS };
  }

  async redeem(code: string, ctx?: AuthCtx): Promise<AuthResult> {
    const key = keyOf(code);
    // Claim first, so two redemptions racing for one code can never both win.
    if (!(await kv().acquire(`${key}:used`, TTL_SECONDS))) throw new UnauthorizedError('This sign-in link has already been used');
    const userId = await kv().get(key);
    await kv().del(key);
    if (!userId) throw new UnauthorizedError('This sign-in link has expired. Sign in again.');
    return authService.issueSessionForUser(userId, ctx);
  }
}

export const handoffService = new HandoffService();
