const order: string[] = [];
const transfer = jest.fn();
jest.mock('./connect.service', () => ({
  connectService: { enabled: true, transfer: (...a: unknown[]) => transfer(...a) },
}));
jest.mock('./payout-readiness.service', () => ({ payoutReadinessService: { forHost: async () => ({ ready: true }) } }));
jest.mock('../../payments/infrastructure/gateway.provider', () => ({ paymentGateway: {} }));
jest.mock('../../platform-config/application/platform-config.service', () => ({
  platformConfigService: {
    get: async () => ({
      payoutTrust: { newHostTripThreshold: 0, newHostExtraHoldHours: 0 },
      payout: { holdHours: 24, instantFeeBps: 100, instantFeeMinCents: 10 },
      incidentals: { disputeWindowHours: 72 },
    }),
  },
}));

import { payoutService } from './payout.service';
import { PayoutModel } from '../infrastructure/payout.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { LedgerModel } from '../../payments/infrastructure/ledger.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  order.length = 0;
  transfer.mockReset().mockImplementation(async (_h, _a, key: string) => {
    order.push(`transfer:${key}`);
    return { transferId: `tr_${key}` };
  });
});

const seed = (over: Record<string, unknown> = {}) =>
  PayoutModel.create({ hostId: 'h1', bookingId: 'b1', amount: 10_000, currency: 'USD', status: 'scheduled', scheduledFor: new Date(Date.now() + 86_400_000), ...over });

describe('instant payout', () => {
  it('is claimed once under parallel calls and transfers before the ledger is posted', async () => {
    const p = await seed();

    const results = await Promise.allSettled([1, 2, 3, 4].map(() => payoutService.instantPayout("h1", "u1")));

    const paid = results.filter((r) => r.status === 'fulfilled' && (r.value as { paidCount: number }).paidCount === 1);
    expect(paid).toHaveLength(1);
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(transfer.mock.calls[0][2]).toBe(`payout_${p._id}`);
    expect(transfer.mock.calls[0][1].amount).toBe(9_900);
    expect(await LedgerModel.distinct('txnId', { refId: p._id })).toEqual([`payout_${p._id}`]);
    const row = await PayoutModel.findById(p._id).lean();
    expect(row?.status).toBe('paid');
    expect(row?.providerRef).toBe(`tr_payout_${p._id}`);
  });

  it('skips extras and held payouts, and releases the claim when the transfer fails', async () => {
    await seed({ kind: 'extra', tag: 't1' });
    await seed({ status: 'held' });
    const ok = await seed();
    transfer.mockRejectedValueOnce(new Error('bank down'));

    const r = await payoutService.instantPayout('h1', 'u1');

    expect(r.paidCount).toBe(0);
    const row = await PayoutModel.findById(ok._id).lean();
    expect(row?.status).toBe('scheduled');
    expect(row?.lastError).toContain('bank down');
    expect(await LedgerModel.countDocuments({})).toBe(0);
  });

  it('runForHost cannot pay a payout a second run already claimed', async () => {
    await seed({ scheduledFor: new Date(Date.now() - 1000) });
    const [a, b] = await Promise.all([payoutService.runForHost('h1'), payoutService.runForHost('h1')]);
    expect(a.paid + b.paid).toBe(1);
    expect(transfer).toHaveBeenCalledTimes(1);
  });
});

describe('House Fleet payouts', () => {
  it('settles on the books without sending money anywhere, and leaves other hosts alone', async () => {
    const owner = await UserModel.create({ email: 'fleet@x.com', roles: ['host', 'house_fleet'] });
    await HostModel.create({ _id: 'h-fleet', userId: owner._id, displayName: 'Fleet' });
    const p = await seed({ hostId: 'h-fleet', bookingId: 'bf' });

    const r = await payoutService.instantPayout('h-fleet', owner._id);

    expect(r.paidCount).toBe(1);
    expect(transfer).not.toHaveBeenCalled();
    expect((await PayoutModel.findById(p._id).lean())?.status).toBe('paid');
    expect(await LedgerModel.distinct('txnId', { refId: p._id })).toEqual([`payout_${p._id}`]);
  });
});
