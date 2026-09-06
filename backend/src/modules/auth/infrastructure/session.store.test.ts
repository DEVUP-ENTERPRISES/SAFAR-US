import { sessionStore } from './session.store';
import { setKvStore, InMemoryKvStore } from '../../../infrastructure/cache/kv-store';

/**
 * Session lifecycle against the in-memory KV store — no Redis. This is the
 * revocation half of auth: a token can be signed and valid, but if the session
 * is gone the request must be rejected. Covers create → live → rotate → revoke,
 * per-device revoke, and sign-out-everywhere.
 */
beforeEach(() => {
  // Fresh store each test → deterministic and independent.
  setKvStore(new InMemoryKvStore());
});

describe('sessionStore', () => {
  it('a created session is live, a revoked one is not', async () => {
    await sessionStore.create('s1', 'u1', 'jti1');
    expect(await sessionStore.isActive('s1')).toBe(true);
    await sessionStore.revoke('s1');
    expect(await sessionStore.isActive('s1')).toBe(false);
  });

  it('an unknown session is not active', async () => {
    expect(await sessionStore.isActive('never-existed')).toBe(false);
  });

  it('stores and rotates the refresh jti', async () => {
    await sessionStore.create('s1', 'u1', 'jti1');
    expect(await sessionStore.getRefreshJti('s1')).toBe('jti1');
    await sessionStore.rotate('s1', 'u1', 'jti2');
    expect(await sessionStore.getRefreshJti('s1')).toBe('jti2');
    expect(await sessionStore.isActive('s1')).toBe(true); // rotation keeps it live
  });

  it('belongsTo only matches the owning user', async () => {
    await sessionStore.create('s1', 'u1', 'jti1');
    expect(await sessionStore.belongsTo('s1', 'u1')).toBe(true);
    expect(await sessionStore.belongsTo('s1', 'someone-else')).toBe(false);
  });

  it('lists a user’s sessions', async () => {
    await sessionStore.create('s1', 'u1', 'j1');
    await sessionStore.create('s2', 'u1', 'j2');
    const sessions = await sessionStore.listForUser('u1');
    expect(sessions.map((s) => s.id).sort()).toEqual(['s1', 's2']);
  });

  it('sign-out-everywhere revokes all but the current device', async () => {
    await sessionStore.create('current', 'u1', 'j0');
    await sessionStore.create('phone', 'u1', 'j1');
    await sessionStore.create('laptop', 'u1', 'j2');
    await sessionStore.revokeAllForUser('u1', 'current');
    expect(await sessionStore.isActive('current')).toBe(true);
    expect(await sessionStore.isActive('phone')).toBe(false);
    expect(await sessionStore.isActive('laptop')).toBe(false);
  });

  it('one user’s revoke-all does not touch another user', async () => {
    await sessionStore.create('a1', 'userA', 'j1');
    await sessionStore.create('b1', 'userB', 'j2');
    await sessionStore.revokeAllForUser('userA');
    expect(await sessionStore.isActive('a1')).toBe(false);
    expect(await sessionStore.isActive('b1')).toBe(true);
  });
});
