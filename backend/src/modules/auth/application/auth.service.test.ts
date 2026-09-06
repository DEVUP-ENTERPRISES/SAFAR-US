/**
 * Auth flow integration: register → login → refresh → logout, against a REAL
 * userRepository backed by an ephemeral in-memory MongoDB. Sessions use the
 * in-memory KV store. Redis is reported healthy so refresh runs its reuse
 * check (the store itself is still in-memory — no Redis process).
 */
jest.mock('../../../infrastructure/cache/redis.client', () => ({
  ...jest.requireActual('../../../infrastructure/cache/redis.client'),
  isRedisHealthy: () => true,
}));

import { authService } from './auth.service';
import { tokenService } from './token.service';
import { sessionStore } from '../infrastructure/session.store';
import { userRepository } from '../../users/infrastructure/user.repository';
import { UserModel } from '../../users/infrastructure/user.model';
import { setKvStore, InMemoryKvStore } from '../../../infrastructure/cache/kv-store';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

const PW = 'CorrectHorse9!';
const reg = (over: Record<string, unknown> = {}) =>
  authService.register({ email: 'guest@x.com', password: PW, firstName: 'Sam', ...over } as never);

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  setKvStore(new InMemoryKvStore());
});

describe('register', () => {
  it('creates an account and returns tokens', async () => {
    const res = await reg();
    expect(res.tokens.accessToken).toBeTruthy();
    expect(res.tokens.refreshToken).toBeTruthy();
    expect(res.user.email).toBe('guest@x.com');
    expect(res.user.roles).toEqual(['guest']);
  });

  it('never exposes the password or its hash in the result', async () => {
    const res = await reg();
    const blob = JSON.stringify(res);
    expect(blob).not.toContain(PW);
    expect(blob.toLowerCase()).not.toContain('passwordhash');
    expect(blob).not.toContain('$argon2');
  });

  it('stores the password only as an argon2 hash, never in the clear', async () => {
    await reg();
    const doc = await UserModel.findOne({ email: 'guest@x.com' }).select('+passwordHash').lean();
    expect((doc as { passwordHash?: string })?.passwordHash).toMatch(/^\$argon2/);
    expect(JSON.stringify(doc)).not.toContain(PW);
  });

  it('rejects a duplicate email', async () => {
    await reg();
    await expect(reg()).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });
});

describe('login', () => {
  it('succeeds with the right password', async () => {
    await reg();
    const res = await authService.login({ email: 'guest@x.com', password: PW });
    expect(res.tokens.accessToken).toBeTruthy();
  });

  it('rejects a wrong password', async () => {
    await reg();
    await expect(authService.login({ email: 'guest@x.com', password: 'wrong-pass' }))
      .rejects.toThrow(/invalid credentials/i);
  });

  it('rejects an unknown email with the SAME message (no user enumeration)', async () => {
    await expect(authService.login({ email: 'nobody@x.com', password: PW }))
      .rejects.toThrow(/invalid credentials/i);
  });

  it('blocks a suspended account', async () => {
    const res = await reg();
    await userRepository.setStatus(res.user.id, 'suspended');
    await expect(authService.login({ email: 'guest@x.com', password: PW }))
      .rejects.toThrow(/not active/i);
  });

  it('demands a 2FA code when MFA is enabled', async () => {
    const res = await reg();
    await UserModel.updateOne({ _id: res.user.id }, { mfa: { enabled: true, secret: 'JBSWY3DPEHPK3PXP' } });
    await expect(authService.login({ email: 'guest@x.com', password: PW }))
      .rejects.toMatchObject({ code: 'MFA_REQUIRED' });
  });
});

describe('refresh & logout', () => {
  it('rotates the token pair on refresh', async () => {
    const { tokens } = await reg();
    const next = await authService.refresh(tokens.refreshToken);
    expect(next.refreshToken).toBeTruthy();
    expect(next.refreshToken).not.toBe(tokens.refreshToken); // rotated
  });

  it('detects reuse of a rotated-out refresh token and kills the session', async () => {
    const { tokens } = await reg();
    const sid = tokenService.verifyRefresh(tokens.refreshToken).sid;
    await authService.refresh(tokens.refreshToken); // rotates; old token now stale
    await expect(authService.refresh(tokens.refreshToken)).rejects.toThrow(/reuse/i);
    expect(await sessionStore.isActive(sid)).toBe(false); // whole session revoked
  });

  it('logout invalidates the session so its refresh token stops working', async () => {
    const { tokens } = await reg();
    const sid = tokenService.verifyRefresh(tokens.refreshToken).sid;
    await authService.logout(sid);
    expect(await sessionStore.isActive(sid)).toBe(false);
    await expect(authService.refresh(tokens.refreshToken)).rejects.toThrow(/expired or revoked/i);
  });

  it('will not let a user revoke a session that is not theirs', async () => {
    const a = await reg();
    const b = await reg({ email: 'other@x.com' });
    const bSid = tokenService.verifyRefresh(b.tokens.refreshToken).sid;
    await expect(authService.revokeSession(a.user.id, bSid)).rejects.toThrow(/not your session/i);
    // b's session is untouched
    expect(await sessionStore.isActive(bSid)).toBe(true);
  });
});
