jest.mock('../config', () => {
  const actual = jest.requireActual('../config');
  return { config: { ...actual.config, admin: { email: 'Boss@Example.com', password: 'EnvPass#2027', name: 'Main Admin', enabled: true } } };
});

import { seedAdmin } from './seed-admin';
import { authService } from '../modules/auth/application/auth.service';
import { hashPassword, verifyPassword } from '../modules/auth/application/password';
import { attemptGuard } from '../modules/auth/application/attempt-guard';
import { UserModel } from '../modules/users/infrastructure/user.model';
import { setKvStore, InMemoryKvStore, kv } from '../infrastructure/cache/kv-store';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  setKvStore(new InMemoryKvStore());
});

const stored = async () => (await UserModel.findOne({ email: 'boss@example.com' }).select('+passwordHash').lean())!;

describe('main admin seed', () => {
  it('creates the admin with the env password', async () => {
    await seedAdmin();
    const u = await stored();
    expect(u.roles).toContain('super_admin');
    expect((await verifyPassword(u.passwordHash!, 'EnvPass#2027')).valid).toBe(true);
  });

  it('replaces an older password with the env one and lifts the login lock', async () => {
    await UserModel.create({ email: 'boss@example.com', passwordHash: await hashPassword('OldPass#1'), roles: ['guest'], status: 'active' });
    await kv().set('al:login:boss@example.com', '1', 3600);
    await seedAdmin();
    const u = await stored();
    expect(u.roles).toContain('super_admin');
    expect((await verifyPassword(u.passwordHash!, 'EnvPass#2027')).valid).toBe(true);
    await expect(attemptGuard.assertOpen('login', 'boss@example.com')).resolves.toBeUndefined();
  });

  it('leaves a matching password untouched', async () => {
    await seedAdmin();
    const before = (await stored()).passwordHash;
    await seedAdmin();
    expect((await stored()).passwordHash).toBe(before);
  });

  it('never issues an email reset for the main admin', async () => {
    await seedAdmin();
    expect(await authService.requestPasswordReset('boss@example.com')).toEqual({ sent: true });
    await expect(authService.resetPassword('boss@example.com', '000000', 'Hacked#123')).rejects.toThrow();
  });
});
