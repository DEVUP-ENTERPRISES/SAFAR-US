/**
 * Referral credit is platform money that can be spent on a booking and paid to a
 * host as cash, so it must not be farmable. Real in-memory Mongo; the host lookup
 * is stubbed.
 */
const getById = jest.fn();
jest.mock('../../hosts/application/host.service', () => ({ hostService: { getById: (...a: unknown[]) => getById(...a) } }));

import { referralService } from './referral.service';
import { ConversionModel } from '../infrastructure/referral.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { PaymentMethodModel } from '../../payments/infrastructure/payment-method.model';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  getById.mockReset().mockResolvedValue({ userId: 'some-other-host' });
});

const REFERRER = 'referrer';
const REFEREE = 'referee';

async function pending(referee = REFEREE, referrer = REFERRER) {
  return ConversionModel.create({ code: 'CODE', referrerId: referrer, refereeId: referee, status: 'pending' });
}

async function trip(id: string, guestId: string, totalCents: number) {
  await BookingModel.collection.insertOne({
    _id: id,
    guestId,
    hostId: 'host-doc-1',
    status: 'completed',
    priceBreakdown: { total: { amount: totalCents, currency: 'USD' } },
  } as never);
}

const card = (userId: string, last4 = '4242') =>
  PaymentMethodModel.create({ userId, provider: 'stripe', brand: 'visa', last4, expMonth: 1, expYear: 2030 });

describe('referral.convert', () => {
  it('rewards both sides after a genuine first trip', async () => {
    await pending();
    await trip('b1', REFEREE, 20_000);

    await referralService.convert(REFEREE, 'b1');

    expect((await ConversionModel.findOne({ refereeId: REFEREE }).lean())?.status).toBe('converted');
    expect(await ledgerService.balance(Account.userWallet(REFERRER))).toBeGreaterThan(0);
    expect(await ledgerService.balance(Account.userWallet(REFEREE))).toBeGreaterThan(0);
  });

  it('waits, without rejecting, when the trip is below the minimum spend', async () => {
    await pending();
    await trip('b1', REFEREE, 1_000);

    await referralService.convert(REFEREE, 'b1');

    expect((await ConversionModel.findOne({ refereeId: REFEREE }).lean())?.status).toBe('pending');
    expect(await ledgerService.balance(Account.userWallet(REFERRER))).toBe(0);
  });

  it('rejects a referee who booked the referrer’s own car', async () => {
    await pending();
    await trip('b1', REFEREE, 20_000);
    getById.mockResolvedValue({ userId: REFERRER });

    await referralService.convert(REFEREE, 'b1');

    const c = await ConversionModel.findOne({ refereeId: REFEREE }).lean();
    expect(c?.status).toBe('rejected');
    expect(c?.rejectedReason).toBe('booked_referrers_car');
    expect(await ledgerService.balance(Account.userWallet(REFERRER))).toBe(0);
  });

  it('rejects two accounts that use the same card', async () => {
    await pending();
    await trip('b1', REFEREE, 20_000);
    await card(REFERRER);
    await card(REFEREE);

    await referralService.convert(REFEREE, 'b1');

    expect((await ConversionModel.findOne({ refereeId: REFEREE }).lean())?.rejectedReason).toBe('same_card');
  });

  it('stops rewarding a referrer once the cap is reached', async () => {
    for (let i = 0; i < 10; i++) {
      await ConversionModel.create({ code: 'C', referrerId: REFERRER, refereeId: `old-${i}`, status: 'converted' });
    }
    await pending();
    await trip('b1', REFEREE, 20_000);

    await referralService.convert(REFEREE, 'b1');

    expect((await ConversionModel.findOne({ refereeId: REFEREE }).lean())?.rejectedReason).toBe('referrer_limit');
    expect(await ledgerService.balance(Account.userWallet(REFERRER))).toBe(0);
  });

  it('two completions at once pay once', async () => {
    await pending();
    await trip('b1', REFEREE, 20_000);

    await Promise.all([referralService.convert(REFEREE, 'b1'), referralService.convert(REFEREE, 'b1')]);

    const credits = await ledgerService.balance(Account.userWallet(REFERRER));
    await referralService.convert(REFEREE, 'b1');
    expect(await ledgerService.balance(Account.userWallet(REFERRER))).toBe(credits);
    expect(credits).toBe(2_000);
  });
});
