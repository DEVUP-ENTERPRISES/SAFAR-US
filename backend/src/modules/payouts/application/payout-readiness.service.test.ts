jest.mock('../../payments/infrastructure/gateway.provider', () => ({ paymentGateway: {} }));

import { payoutReadinessService } from './payout-readiness.service';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('payout readiness', () => {
  it('the House Fleet is always ready: no ID check or bank account, its earnings stay with the platform', async () => {
    const owner = await UserModel.create({ email: 'fleet@x.com', roles: ['host', 'house_fleet'] });
    await HostModel.create({ _id: 'h-fleet', userId: owner._id, displayName: 'Fleet' });

    const r = await payoutReadinessService.forHost(String(owner._id));

    expect(r.ready).toBe(true);
    expect(r.blockers).toEqual([]);
    expect(r.destination).toMatchObject({ platformOwned: true, viaStripe: false });
  });

  it('an ordinary host is not given the House Fleet exemption', async () => {
    const owner = await UserModel.create({ email: 'host@x.com', roles: ['host'] });
    await HostModel.create({ _id: 'h-1', userId: owner._id, displayName: 'Host' });

    const r = await payoutReadinessService.forHost(String(owner._id));

    expect(r.destination.platformOwned).toBeFalsy();
    expect(r.ready).toBe(false);
    expect(r.blockers.length).toBeGreaterThan(0);
  });
});
