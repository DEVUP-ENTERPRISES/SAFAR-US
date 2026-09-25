/**
 * Money-safety races in the booking service: a double cancel refunds once, a
 * replayed rebooking guarantee pays once, and an idempotency key never crosses
 * users. The gateway is mocked so nothing can reach the real processor.
 */
jest.mock('../../payments/infrastructure/gateway.provider', () => ({ paymentGateway: new (jest.requireActual('../../payments/infrastructure/mock.gateway').MockGateway)() }));

const mockConfig = {
  cancellation: { flexible: { fullBeforeHours: 24, partialBps: 5000 }, moderate: { fullBeforeHours: 48, partialBps: 5000 }, strict: { fullBeforeHours: 168, partialBps: 0 } },
  rebookingProtection: { enabled: true, coverageBps: 10000, maxCoverageCents: 15000, windowHours: 72, hostPenalty: { enabled: false } },
  legal: { termsVersion: 'v1' },
  booking: { maxOpenPendingPerGuest: 3, checkoutHoldMinutes: 15 },
  handover: { maxCodeAttempts: 5 },
  extension: { enabled: true, maxDays: 30, swapPolicy: 'auto', swapPriceToleranceBps: 1500, swapMaxAbsorbCents: 5000 },
};
jest.mock('../../platform-config/application/platform-config.service', () => ({
  platformConfigService: { get: jest.fn(async () => mockConfig) },
}));
jest.mock('../../hosts/application/host.service', () => ({ hostService: { getByUserId: jest.fn(async () => null), getById: jest.fn(), requireHostForUser: jest.fn(async () => ({ _id: 'h1' })) } }));
jest.mock('./eligibility.service', () => ({ eligibilityService: { evaluate: jest.fn(async () => ({ eligible: true, canRequest: true, blockers: [] })) } }));
jest.mock('../../pricing/application/pricing.service', () => ({ pricingService: { quote: jest.fn() } }));
jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));
jest.mock('../../vehicles/application/vehicle.service', () => ({
  vehicleService: {
    getForBooking: jest.fn(async () => {
      throw new Error('reached vehicle lookup');
    }),
  },
}));

import { bookingService } from './booking.service';
import { BookingModel } from '../infrastructure/booking.model';
import { PaymentModel } from '../../payments/infrastructure/payment.model';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { hostService } from '../../hosts/application/host.service';
import { eligibilityService } from './eligibility.service';
import { pricingService } from '../../pricing/application/pricing.service';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { availabilityService } from '../../availability/application/availability.service';
import { createHash } from 'crypto';
import { toPublicBooking } from './booking.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});

const money = (amount: number) => ({ amount, currency: 'USD' });
const breakdown = (total: number) => ({
  days: 1, base: money(total), cleaningFee: money(0), discount: money(0), addOnsTotal: money(0), delivery: money(0), protection: money(0),
  serviceFee: money(0), protectionPlan: 'basic', selectedAddOns: [], subtotal: money(total), commission: money(0), tax: money(0), taxTotal: money(0),
  hostEarnings: money(total), total: money(total), currency: 'USD',
});
const HOUR = 3_600_000;

async function seedPaidBooking(id: string, over: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 10 * HOUR);
  const booking = await BookingModel.create({
    _id: id, code: `C-${id}`, guestId: 'g1', hostId: 'h1', vehicleId: 'v1', period: { start, end: new Date(start.getTime() + 24 * HOUR) },
    priceBreakdown: breakdown(10_000), cancellationPolicy: 'moderate', status: 'paid', statusHistory: [], instantBook: true, ...over,
  });
  await ledgerService.post({
    refType: 'booking', refId: id, currency: 'USD', description: 'seed',
    legs: [
      { account: Account.gatewayClearing(), direction: 'credit', amount: 10_000 },
      { account: Account.hostPayable('h1'), direction: 'debit', amount: 10_000 },
    ],
  });
  await PaymentModel.create({
    bookingId: id, userId: 'g1', hostId: 'h1', type: 'booking', intentId: `pi_${id}`, amount: 10_000, currency: 'USD', hostEarnings: 10_000,
    commission: 0, tax: 0, capturedAmount: 10_000, status: 'succeeded', idempotencyKey: `k_${id}`,
  });
  return booking;
}

const guest = { userId: 'g1', permissions: [] } as never;

describe('cancel race', () => {
  it('two parallel guest cancels refund the policy share once', async () => {
    await seedPaidBooking('b1');

    const results = await Promise.allSettled([bookingService.cancel(guest, 'b1', 'x'), bookingService.cancel(guest, 'b1', 'x')]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const p = await PaymentModel.findOne({ bookingId: 'b1' }).lean();
    expect(p?.refundedAmount).toBe(5_000);
    expect((await BookingModel.findById('b1').lean())?.status).toBe('cancelled_guest');
  });

  it('rolls the cancellation back when the refund fails', async () => {
    await seedPaidBooking('b2');
    await PaymentModel.deleteMany({ bookingId: 'b2' });

    await expect(bookingService.cancel(guest, 'b2', 'x')).rejects.toBeDefined();

    expect((await BookingModel.findById('b2').lean())?.status).toBe('paid');
  });
});

describe('rebooking guarantee', () => {
  it('a replayed rebook pays the difference once', async () => {
    const original = await seedPaidBooking('orig', { status: 'cancelled_host', cancellation: { at: new Date() } });
    const replacement = await seedPaidBooking('repl', { priceBreakdown: breakdown(12_000) });
    const apply = () =>
      (bookingService as unknown as { applyRebookingProtection(o: unknown, r: unknown): Promise<number> }).applyRebookingProtection(
        original.toObject(),
        replacement.toObject(),
      );

    const first = await apply();
    const second = await apply();
    const parallel = await Promise.all([apply(), apply()]);

    expect(first).toBe(2_000);
    expect(second).toBe(0);
    expect(parallel).toEqual([0, 0]);
    expect(await ledgerService.balance(Account.userWallet('g1'))).toBe(2_000);
  });
});

describe('idempotency key scope', () => {
  const dto = { vehicleId: 'v1', start: new Date(Date.now() + 48 * HOUR).toISOString(), end: new Date(Date.now() + 72 * HOUR).toISOString() } as never;

  it('does not return another user booking for the same key', async () => {
    await seedPaidBooking('mine', { idempotencyKey: 'g1:KEY' });

    await expect(bookingService.create('g2', dto, 'KEY')).rejects.toThrow('reached vehicle lookup');
    expect((await bookingService.create('g1', dto, 'KEY'))._id).toBe('mine');
  });
});

describe('booking privacy and the pickup code', () => {
  it('never exposes the code hash or internals to a host', async () => {
    const b = await seedPaidBooking('p1', { pickupCodeHash: 'abc', pickupCodeAttempts: 2, holdId: 'h', idempotencyKey: 'g1:k', terms: { version: 'v1', acceptedAt: new Date(), ip: '1.2.3.4' } });
    (hostService.getByUserId as jest.Mock).mockResolvedValue({ _id: 'h1' });

    const seen = await bookingService.get({ userId: 'hu', permissions: [] } as never, 'p1');
    expect(seen).not.toHaveProperty('pickupCodeHash');
    expect(seen).not.toHaveProperty('pickupCodeAttempts');
    expect(seen).not.toHaveProperty('holdId');
    expect(seen).not.toHaveProperty('paymentId');
    expect(seen).not.toHaveProperty('idempotencyKey');
    expect((seen.terms as { ip?: string }).ip).toBeUndefined();
    const page = await bookingService.listForHost('hu');
    expect(page.items[0]).not.toHaveProperty('pickupCodeHash');
    expect(toPublicBooking(b.toObject(), true)).not.toHaveProperty('pickupCodeHash');
  });

  it('stores a keyed hash, verifies it, and still honours a legacy bare SHA-256 code', async () => {
    await seedPaidBooking('p2');
    const { code } = await bookingService.issuePickupCode(guest, 'p2');
    const stored = (await BookingModel.findById('p2').lean())?.pickupCodeHash;
    expect(stored?.startsWith('v2:')).toBe(true);
    await expect(bookingService.verifyPickupCode('p2', code === '000000' ? '111111' : '000000', 'hu')).rejects.toMatchObject({ code: 'PICKUP_CODE_INVALID' });
    await bookingService.verifyPickupCode('p2', code, 'hu');
    expect((await BookingModel.findById('p2').lean())?.pickupVerifiedAt).toBeTruthy();

    await seedPaidBooking('p3', { pickupCodeHash: createHash('sha256').update('123456').digest('hex') });
    await bookingService.verifyPickupCode('p3', '123456', 'hu');
    expect((await BookingModel.findById('p3').lean())?.pickupVerifiedAt).toBeTruthy();
  });
});

describe('shortening a trip', () => {
  const setup = async (policy: string, removedTotal: number) => {
    const start = new Date(Date.now() + 10 * HOUR);
    await seedPaidBooking('s1', {
      cancellationPolicy: policy,
      period: { start, end: new Date(start.getTime() + 70 * HOUR) },
      priceBreakdown: { ...breakdown(9_000), days: 3 },
    });
    (vehicleService.getForBooking as jest.Mock).mockResolvedValue({ minTripHours: 1 });
    (pricingService.quote as jest.Mock).mockResolvedValue({ ...breakdown(removedTotal), days: 1 });
    return new Date(start.getTime() + 2 * HOUR).toISOString();
  };

  it('applies the cancellation policy to the released tail', async () => {
    const newEnd = await setup('moderate', 3_000);
    await bookingService.requestShorten('g1', 's1', newEnd);
    expect((await PaymentModel.findOne({ bookingId: 's1' }).lean())?.refundedAmount).toBe(1_500);
  });

  it('never refunds more than the tail share of what was paid', async () => {
    const newEnd = await setup('flexible', 8_000);
    await bookingService.requestShorten('g1', 's1', newEnd);
    expect((await PaymentModel.findOne({ bookingId: 's1' }).lean())?.refundedAmount).toBe(3_000);
  });

  it('two parallel shortens refund once', async () => {
    const newEnd = await setup('flexible', 3_000);
    const r = await Promise.allSettled([bookingService.requestShorten('g1', 's1', newEnd), bookingService.requestShorten('g1', 's1', newEnd)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((await PaymentModel.findOne({ bookingId: 's1' }).lean())?.refundedAmount).toBe(3_000);
  });
});

describe('host approval and holds', () => {
  it('refuses to confirm after the approval deadline', async () => {
    await seedPaidBooking('c1', { status: 'pending_approval', approvalDeadline: new Date(Date.now() - 1_000), holdId: 'nohold' });
    (hostService.getByUserId as jest.Mock).mockResolvedValue({ _id: 'h1' });
    await expect(bookingService.confirm('hu', 'c1')).rejects.toMatchObject({ code: 'APPROVAL_EXPIRED' });
  });

  it('confirmHold throws when the hold has lapsed, and is safe to repeat', async () => {
    const holdId = await availabilityService.placeHold('v9', new Date(Date.now() + 5 * 86_400_000), new Date(Date.now() + 6 * 86_400_000));
    await availabilityService.confirmHold(holdId, 'bk');
    await availabilityService.confirmHold(holdId, 'bk');
    await expect(availabilityService.confirmHold('gone', 'bk')).rejects.toMatchObject({ code: 'HOLD_LOST' });
  });

  it('caps open pending requests per guest', async () => {
    for (const i of [1, 2, 3]) await seedPaidBooking(`o${i}`, { status: 'pending_approval' });
    const dto = { vehicleId: 'v1', start: new Date(Date.now() + 48 * HOUR).toISOString(), end: new Date(Date.now() + 72 * HOUR).toISOString() } as never;
    await expect(bookingService.create('g1', dto, 'NEWKEY')).rejects.toMatchObject({ code: 'TOO_MANY_OPEN_REQUESTS' });
  });
});

describe('extension re-checks', () => {
  it('refuses when verification does not cover the new end, or the trip already ended', async () => {
    await seedPaidBooking('e1');
    (eligibilityService.evaluate as jest.Mock).mockResolvedValueOnce({ eligible: false, canRequest: true, blockers: [] });
    const newEnd = new Date(Date.now() + 200 * HOUR).toISOString();
    await expect(bookingService.requestExtension('g1', 'e1', newEnd)).rejects.toMatchObject({ code: 'NOT_ELIGIBLE' });

    await seedPaidBooking('e2', { status: 'in_progress', period: { start: new Date(Date.now() - 48 * HOUR), end: new Date(Date.now() - HOUR) } });
    await expect(bookingService.requestExtension('g1', 'e2', newEnd)).rejects.toMatchObject({ code: 'TRIP_ENDED' });
  });
});
