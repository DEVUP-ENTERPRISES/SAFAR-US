import type { Request, Response, NextFunction } from 'express';
import { permissionsForRoles, STAFF_ROLES } from '../../../shared/constants/rbac';
import { authorize } from '../../../shared/middleware/authorize';
import { requireAdmin } from '../../../shared/middleware/require-admin';
import { requireMfa } from '../../../shared/middleware/require-mfa';
import { ForbiddenError, NotFoundError } from '../../../core/errors/app-error';
import { UserModel } from '../../users/infrastructure/user.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

/** Who may use the insurance desk, and that its people can't reach the admin console. */

const can = (roles: string[], ...required: string[]) => {
  let err: unknown;
  authorize(...required)({ principal: { permissions: permissionsForRoles(roles) } } as unknown as Request, {} as Response, (e?: unknown) => (err = e));
  return err === undefined;
};

const runAsync = (mw: (req: Request, res: Response, next: NextFunction) => void, userId: string) =>
  new Promise<{ err: unknown; req: Request }>((resolve) => {
    const req = { principal: { userId, roles: [], permissions: [] } } as unknown as Request;
    mw(req, {} as Response, (err?: unknown) => resolve({ err, req }));
  });

describe('insurance desk permissions', () => {
  it('the insurance role opens the desk and runs it, but cannot change commission', () => {
    expect(can(['insurance'], 'insurance:read')).toBe(true);
    expect(can(['insurance'], 'insurance:manage')).toBe(true);
    expect(can(['insurance'], 'insurance:payout')).toBe(true);
    expect(can(['insurance'], 'insurance:commission')).toBe(false);
  });

  it('the insurance role cannot open the admin console or touch other money', () => {
    expect(can(['insurance'], 'admin:read')).toBe(false);
    expect(can(['insurance'], 'payout:manage')).toBe(false);
    expect(can(['insurance'], 'platform:manage')).toBe(false);
  });

  it('admin and super admin can do everything on the desk, commission included', () => {
    for (const role of ['admin', 'super_admin']) {
      expect(can([role], 'insurance:read', 'insurance:manage', 'insurance:payout', 'insurance:commission')).toBe(true);
    }
  });

  it('other staff and customers cannot open the desk', () => {
    for (const role of ['support', 'moderator', 'finance', 'ops', 'host', 'guest']) {
      expect(can([role], 'insurance:read')).toBe(false);
    }
  });

  it('insurance is a staff role everywhere staff are recognised', () => {
    expect(STAFF_ROLES).toContain('insurance');
  });
});

describe('insurance desk gates', () => {
  beforeAll(connectTestDb);
  afterAll(disconnectTestDb);
  beforeEach(clearTestDb);

  it('the staff gate lets an active insurance account through with its permissions from the database', async () => {
    const u = await UserModel.create({ email: 'ins@x.com', roles: ['insurance'], status: 'active' });
    const { err, req } = await runAsync(requireAdmin, String(u._id));
    expect(err).toBeUndefined();
    expect(req.principal!.permissions).toContain('insurance:read');
    expect(req.principal!.permissions).not.toContain('admin:read');
  });

  it('the staff gate hides the desk from a customer and refuses a suspended insurance account', async () => {
    const guest = await UserModel.create({ email: 'g@x.com', roles: ['guest'], status: 'active' });
    expect((await runAsync(requireAdmin, String(guest._id))).err).toBeInstanceOf(NotFoundError);
    const suspended = await UserModel.create({ email: 's@x.com', roles: ['insurance'], status: 'suspended' });
    expect((await runAsync(requireAdmin, String(suspended._id))).err).toBeInstanceOf(ForbiddenError);
  });

  it('when two-step sign-in is required, it is checked live from the database', async () => {
    const off = await UserModel.create({ email: 'a@x.com', roles: ['insurance'], status: 'active' });
    const on = await UserModel.create({ email: 'b@x.com', roles: ['insurance'], status: 'active', mfa: { enabled: true } });
    const blocked = (await runAsync(requireMfa, String(off._id))).err as { code?: string };
    expect(blocked?.code).toBe('MFA_SETUP_REQUIRED');
    expect((await runAsync(requireMfa, String(on._id))).err).toBeUndefined();
  });
});
