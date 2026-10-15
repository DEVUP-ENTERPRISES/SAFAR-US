import type { Request, Response } from 'express';
import { requireFleetOwner } from './require-fleet-owner';
import { requireAdmin } from './require-admin';
import { UserModel } from '../../modules/users/infrastructure/user.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const run = (mw: typeof requireFleetOwner, userId: string) =>
  new Promise<{ err: unknown; req: Request }>((resolve) => {
    const req = { principal: { userId, roles: ['house_fleet', 'admin'], permissions: ['*'] } } as unknown as Request;
    mw(req, {} as Response, (err?: unknown) => resolve({ err, req }));
  });

const user = async (roles: string[], status = 'active') => String((await UserModel.create({ email: `${roles.join('-')}-${status}@example.com`, roles, status }))._id);

describe('operations panel gate', () => {
  it('lets the House Fleet account in with only Asset Partner powers, whatever its token says', async () => {
    const { err, req } = await run(requireFleetOwner, await user(['house_fleet']));
    expect(err).toBeUndefined();
    expect(req.principal!.permissions).toEqual(['admin:read', 'host:manage']);
  });

  it('turns away customers, hosts, staff and a suspended House Fleet account', async () => {
    for (const roles of [['guest'], ['host'], ['admin'], ['house_fleet', 'admin']]) {
      expect((await run(requireFleetOwner, await user(roles))).err).toBeTruthy();
    }
    expect((await run(requireFleetOwner, await user(['house_fleet'], 'suspended'))).err).toBeTruthy();
  });

  it('the House Fleet account still cannot open the admin console', async () => {
    expect((await run(requireAdmin, await user(['house_fleet']))).err).toBeTruthy();
  });
});
