import { staffService } from './staff.service';
import { UserModel } from '../../users/infrastructure/user.model';
import { verifyPassword } from '../../auth/application/password';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('staffService', () => {
  it('creates a staff login whose generated password works and is never stored in plain text', async () => {
    const r = await staffService.create({ name: 'Asha Rao', role: 'support' });
    expect(r.username).toMatch(/^asha\.rao\.\d{4}@staff\.catodrive\.com$/);
    expect(r.password).toHaveLength(16);
    const u = await UserModel.findById(r.id).select('+passwordHash').lean();
    expect(u!.roles).toEqual(['support']);
    expect(JSON.stringify(u)).not.toContain(r.password);
    expect((await verifyPassword(u!.passwordHash!, r.password)).valid).toBe(true);
  });

  it('refuses a taken email and never touches the main admin', async () => {
    await UserModel.create({ email: 'boss@x.com', roles: ['super_admin'], status: 'active' });
    const boss = await UserModel.findOne({ email: 'boss@x.com' });
    await expect(staffService.create({ name: 'Dup', role: 'ops', email: 'boss@x.com' })).rejects.toThrow(/already/);
    await expect(staffService.resetPassword(boss!._id)).rejects.toThrow(/main admin/);
    await expect(staffService.setActive(boss!._id, false, 'x')).rejects.toThrow(/main admin/);
  });

  it('resets the password, suspends and reactivates a staff member', async () => {
    const r = await staffService.create({ name: 'Lee Tan', role: 'finance' });
    const reset = await staffService.resetPassword(r.id);
    expect(reset.password).not.toBe(r.password);
    await staffService.setActive(r.id, false, 'admin');
    expect((await UserModel.findById(r.id).lean())!.status).toBe('suspended');
    await staffService.setActive(r.id, true, 'admin');
    expect((await UserModel.findById(r.id).lean())!.status).toBe('active');
  });

  it('will not manage an ordinary member', async () => {
    const m = await UserModel.create({ email: 'guest@x.com', roles: ['guest'], status: 'active' });
    await expect(staffService.setRole(m._id, 'ops')).rejects.toThrow(/not a staff/);
  });
});

describe('appointed admin role', () => {
  it('can do staff work but never hold the all-access permission', async () => {
    const { permissionsForRoles } = await import('../../../shared/constants/rbac');
    const perms = permissionsForRoles(['admin']);
    expect(perms).toEqual(expect.arrayContaining(['admin:read', 'payment:refund', 'platform:manage', 'kyc:review']));
    expect(perms).not.toContain('*');
    const r = await staffService.create({ name: 'Second Admin', role: 'admin' });
    expect((await UserModel.findById(r.id).lean())!.roles).toEqual(['admin']);
  });
});
