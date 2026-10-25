// Never let a test reach the real processor, whatever keys the local env holds.
jest.mock('../../payments/infrastructure/gateway.provider', () => ({ paymentGateway: new (jest.requireActual('../../payments/infrastructure/mock.gateway').MockGateway)() }));

const mockConfig = {
  extension: { enabled: true, maxDays: 30, swapPolicy: 'auto', swapPriceToleranceBps: 1500, swapMaxAbsorbCents: 5000 },
  booking: { checkoutHoldMinutes: 15, minLeadMinutes: 60 },
  cancellation: {
    flexible: { fullBeforeHours: 24, partialBps: 5000 },
    moderate: { fullBeforeHours: 48, partialBps: 5000 },
    strict: { fullBeforeHours: 168, partialBps: 0 },
  },
  noShow: { graceHours: 2, guestForfeitBps: 5000 },
  payout: { holdHours: 0 },
  tripChanges: {
    undoWindowMinutes: 10, undoMinLeadHours: 2, undoPer30Days: 2,
    pickupShiftMaxHours: 3, pickupShiftsPerTrip: 1,
    freeMovesPerTrip: 1, moveMinLeadHours: 24, switchCarEnabled: true,
    creditBonusBps: 2000, creditEnabled: true,
    exceptionsEnabled: true, exceptionProofRequired: true, exceptionFileWindowHours: 48, exceptionFlagAfter: 2,
  },
};
jest.mock('../../platform-config/application/platform-config.service', () => ({
  platformConfigService: { get: jest.fn(async () => mockConfig) },
}));
jest.mock('./eligibility.service', () => ({ eligibilityService: { evaluate: jest.fn(async () => ({ eligible: true, canRequest: true, blockers: [] })) } }));
jest.mock('../../pricing/application/pricing.service', () => ({ pricingService: { quote: jest.fn() } }));
jest.mock('../../search/application/search.service', () => ({ searchService: { similarTo: jest.fn(async () => []) } }));
jest.mock('../../vehicles/application/vehicle.service', () => ({ vehicleService: { getForBooking: jest.fn(), getById: jest.fn() } }));
jest.mock('../../documents/application/document-compliance.service', () => ({
  documentComplianceService: { hasExpiredMandatoryDoc: jest.fn(async () => false) },
}));
jest.mock('../../vehicles/application/vehicle-lifecycle.service', () => ({
  vehicleLifecycleService: { isOperableForBooking: jest.fn(async () => true) },
}));

import { bookingService } from './booking.service';
import { tripChangeService } from './trip-change.service';
import { BookingModel } from '../infrastructure/booking.model';
import { AvailabilityModel } from '../../availability/infrastructure/availability.model';
import { availabilityService } from '../../availability/application/availability.service';
import { PaymentModel } from '../../payments/infrastructure/payment.model';
import { LedgerModel } from '../../payments/infrastructure/ledger.model';
import { PayoutModel } from '../../payouts/infrastructure/payout.model';
import { paymentGateway } from '../../payments/infrastructure/gateway.provider';
import { ledgerService } from '../../payments/application/ledger.service';
import { walletService } from '../../wallet/application/wallet.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { pricingService } from '../../pricing/application/pricing.service';
import { searchService } from '../../search/application/search.service';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import type { Principal } from '../../../core/types/common';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
  (vehicleService.getForBooking as jest.Mock).mockResolvedValue({ _id: 'v1', bookable: true, instantBook: true, minTripHours: 4, maxTripHours: 720, hostId: 'h1' });
});

const H = 3_600_000;
const money = (amount: number) => ({ amount, currency: 'USD' });
const guest: Principal = { userId: 'g1', roles: ['guest'], permissions: ['booking:cancel:own'] } as unknown as Principal;
const inHours = (h: number) => new Date(Math.ceil((Date.now() + h * H) / H) * H);

function quote(total: number, earnings = Math.round(total * 0.8), commission = Math.round(total * 0.15)) {
  return {
    days: 2,
    base: money(total),
    cleaningFee: money(0),
    discount: money(0),
    addOnsTotal: money(0),
    delivery: money(0),
    protection: money(0),
    serviceFee: money(0),
    protectionPlan: 'basic',
    selectedAddOns: [],
    subtotal: money(total),
    commission: money(commission),
    tax: money(total - earnings - commission),
    taxTotal: money(0),
    hostEarnings: money(earnings),
    total: money(total),
    currency: 'USD',
  };
}

/** A paid booking with its card payment, ledger entry and held days. */
async function seed(opts: { id?: string; start: Date; end: Date; createdAgoMin?: number; vehicleId?: string; policy?: string; extra?: Record<string, unknown> }) {
  const id = opts.id ?? 'b1';
  const vehicleId = opts.vehicleId ?? 'v1';
  await BookingModel.create({
    _id: id,
    code: `CODE-${id}`,
    guestId: 'g1',
    hostId: 'h1',
    vehicleId,
    period: { start: opts.start, end: opts.end },
    priceBreakdown: quote(10_000, 8_000, 1_500),
    cancellationPolicy: opts.policy ?? 'moderate',
    status: 'paid',
    statusHistory: [],
    instantBook: true,
    ...(opts.extra ?? {}),
  });
  // Booked a while ago unless a test says otherwise, so the undo window is normally closed.
  await BookingModel.collection.updateOne({ _id: id } as never, { $set: { createdAt: new Date(Date.now() - (opts.createdAgoMin ?? 24 * 60) * 60_000) } });
  const txnId = await ledgerService.post({
    refType: 'booking',
    refId: id,
    currency: 'USD',
    description: 'seed',
    legs: [
      { account: Account.gatewayClearing(), direction: 'credit', amount: 10_000 },
      { account: Account.hostPayable('h1'), direction: 'debit', amount: 8_000 },
      { account: Account.platformRevenue(), direction: 'debit', amount: 1_500 },
      { account: Account.platformTax(), direction: 'debit', amount: 500 },
    ],
  });
  await PaymentModel.create({
    bookingId: id, userId: 'g1', hostId: 'h1', type: 'booking', intentId: `pi_${id}`, amount: 10_000, currency: 'USD',
    hostEarnings: 8_000, commission: 1_500, tax: 500, capturedAmount: 10_000, status: 'succeeded', ledgerTxnId: txnId, idempotencyKey: id,
  });
  const holdId = await availabilityService.placeHold(vehicleId, opts.start, opts.end);
  await availabilityService.confirmHold(holdId, id);
}

async function ledgerBalances(): Promise<boolean> {
  const rows = await LedgerModel.aggregate<{ _id: string; total: number }>([{ $group: { _id: '$direction', total: { $sum: '$amount' } } }]);
  const by = Object.fromEntries(rows.map((r) => [r._id, r.total]));
  return by.debit === by.credit;
}

const bookedDays = async (bookingId: string) =>
  (await AvailabilityModel.find({ bookingId, state: 'booked' }).lean()).length;

describe('undo window', () => {
  it('refunds in full right after booking, even inside the late-cancel period', async () => {
    await seed({ start: inHours(10), end: inHours(58), createdAgoMin: 2 });
    const refund = jest.spyOn(paymentGateway, 'refund');
    await bookingService.cancel(guest, 'b1', 'Wrong dates', { reasonCode: 'plans_changed' });
    const b = await BookingModel.findById('b1').lean();
    expect(b?.cancellation?.refund.amount).toBe(10_000);
    expect(b?.cancellation?.undo).toBe(true);
    expect(b?.cancellation?.reasonCode).toBe('plans_changed');
    expect(refund).toHaveBeenCalledTimes(1);
    expect(await ledgerBalances()).toBe(true);
  });

  it('applies the normal policy once the window has closed', async () => {
    await seed({ start: inHours(10), end: inHours(58), createdAgoMin: 30 });
    await bookingService.cancel(guest, 'b1', 'Plans changed');
    const b = await BookingModel.findById('b1').lean();
    expect(b?.cancellation?.refund.amount).toBe(5_000);
    expect(b?.cancellation?.undo).toBeUndefined();
  });

  it('is not offered again after the guest used up the allowance', async () => {
    await BookingModel.create([1, 2].map((n) => ({
      _id: `old${n}`, code: `OLD${n}`, guestId: 'g1', hostId: 'h1', vehicleId: 'v9', period: { start: inHours(100), end: inHours(150) },
      priceBreakdown: quote(1_000), status: 'cancelled_guest', statusHistory: [], instantBook: true,
      cancellation: { by: 'g1', role: 'guest', at: new Date(), reason: 'x', refund: money(1_000), undo: true },
    })));
    await seed({ start: inHours(10), end: inHours(58), createdAgoMin: 2 });
    const options = await tripChangeService.options(guest, 'b1');
    expect(options.cancel.undo.active).toBe(false);
    expect(options.cancel.refund.amount).toBe(5_000);
  });
});

describe('keep as CatoDrive credit', () => {
  it('puts the refund plus the bonus in the wallet without touching the card, and the books balance', async () => {
    await seed({ start: inHours(10), end: inHours(58) });
    const refund = jest.spyOn(paymentGateway, 'refund');
    const options = await tripChangeService.options(guest, 'b1');
    expect(options.cancel.credit).toEqual({ enabled: true, amount: money(6_000), bonus: money(1_000) });

    await bookingService.cancel(guest, 'b1', 'Plans changed', { choice: 'credit' });
    expect(refund).not.toHaveBeenCalled();
    expect(await walletService.balance('g1')).toBe(6_000);
    const b = await BookingModel.findById('b1').lean();
    expect(b?.cancellation?.choice).toBe('credit');
    expect(b?.cancellation?.creditBonus?.amount).toBe(1_000);
    expect(await ledgerBalances()).toBe(true);
  });

  it('a double tap cannot pay the bonus twice', async () => {
    await seed({ start: inHours(10), end: inHours(58) });
    await Promise.allSettled([
      bookingService.cancel(guest, 'b1', 'x', { choice: 'credit' }),
      bookingService.cancel(guest, 'b1', 'x', { choice: 'credit' }),
    ]);
    expect(await walletService.balance('g1')).toBe(6_000);
  });
});

describe('shift pickup', () => {
  it('moves only the start to an offered time; days and price stay', async () => {
    await seed({ start: inHours(30), end: inHours(78) });
    const { choices } = await bookingService.pickupShiftOptions('g1', 'b1');
    expect(choices).toHaveLength(3);
    const daysBefore = await bookedDays('b1');
    await bookingService.shiftPickup('g1', 'b1', choices[1]);
    const b = await BookingModel.findById('b1').lean();
    expect(b?.period.start.toISOString()).toBe(choices[1]);
    expect(b?.priceBreakdown.total.amount).toBe(10_000);
    expect(b?.changes?.[0].kind).toBe('pickup_shift');
    expect(await bookedDays('b1')).toBe(daysBefore);
  });

  it('refuses a time that was not offered, and a second shift', async () => {
    await seed({ start: inHours(30), end: inHours(78) });
    await expect(bookingService.shiftPickup('g1', 'b1', inHours(40).toISOString())).rejects.toThrow('offered pickup times');
    const { choices } = await bookingService.pickupShiftOptions('g1', 'b1');
    await bookingService.shiftPickup('g1', 'b1', choices[0]);
    await expect(bookingService.shiftPickup('g1', 'b1', choices[1])).rejects.toThrow('already changed');
  });

  it('is not offered on a delivered trip', async () => {
    await seed({ start: inHours(30), end: inHours(78), extra: { delivery: { mode: 'home', address: '1 Main St' } } });
    const res = await bookingService.pickupShiftOptions('g1', 'b1');
    expect(res.available).toBe(false);
  });

  it('only the guest can shift', async () => {
    await seed({ start: inHours(30), end: inHours(78) });
    await expect(bookingService.pickupShiftOptions('someone', 'b1')).rejects.toThrow('Not your booking');
  });
});

describe('move dates', () => {
  it('charges the difference, moves the days and keeps payout and books in step', async () => {
    await seed({ start: inHours(72), end: inHours(120) });
    (pricingService.quote as jest.Mock).mockResolvedValue(quote(12_000));
    const start = inHours(240);
    const end = inHours(288);
    const preview = await bookingService.movePreview('g1', 'b1', start.toISOString(), end.toISOString());
    expect(preview).toMatchObject({ available: true, difference: money(2_000) });

    await bookingService.moveDates('g1', 'b1', start.toISOString(), end.toISOString());
    const b = await BookingModel.findById('b1').lean();
    expect(b?.period.start.toISOString()).toBe(start.toISOString());
    expect(b?.priceBreakdown.total.amount).toBe(12_000);
    expect(b?.priceBreakdown.hostEarnings.amount).toBe(8_000 + 1_600);
    expect(b?.changes?.[0]).toMatchObject({ kind: 'move', difference: money(2_000) });
    expect(await PaymentModel.countDocuments({ bookingId: 'b1', type: 'booking', status: 'succeeded' })).toBe(2);
    expect(await ledgerService.balance(Account.hostPayable('h1'))).toBe(-9_600);
    const rows = await AvailabilityModel.find({ bookingId: 'b1', state: 'booked' }).lean();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.dayKey >= start.toISOString().slice(0, 10))).toBe(true);
    expect(await ledgerBalances()).toBe(true);
  });

  it('refunds the difference when the new dates cost less', async () => {
    await seed({ start: inHours(72), end: inHours(120) });
    (pricingService.quote as jest.Mock).mockResolvedValue(quote(7_500));
    const refund = jest.spyOn(paymentGateway, 'refund');
    await bookingService.moveDates('g1', 'b1', inHours(240).toISOString(), inHours(288).toISOString());
    expect(refund).toHaveBeenCalledWith('pi_b1', money(2_500), expect.any(String));
    const b = await BookingModel.findById('b1').lean();
    expect(b?.priceBreakdown.total.amount).toBe(7_500);
    expect(b?.priceBreakdown.hostEarnings.amount).toBe(6_000);
    expect(await ledgerBalances()).toBe(true);
  });

  it('keeps the old dates when the car is taken on the new ones', async () => {
    await seed({ start: inHours(72), end: inHours(120) });
    await seed({ id: 'other', start: inHours(240), end: inHours(288) });
    (pricingService.quote as jest.Mock).mockResolvedValue(quote(10_000));
    await expect(bookingService.moveDates('g1', 'b1', inHours(240).toISOString(), inHours(288).toISOString())).rejects.toThrow('not free');
    const b = await BookingModel.findById('b1').lean();
    expect(b?.period.start.getTime()).toBe(inHours(72).getTime());
    expect(await bookedDays('b1')).toBeGreaterThan(0);
  });

  it('puts everything back when the card is declined', async () => {
    await seed({ start: inHours(72), end: inHours(120) });
    const before = await bookedDays('b1');
    (pricingService.quote as jest.Mock).mockResolvedValue(quote(12_000));
    jest.spyOn(paymentGateway, 'createIntent').mockRejectedValueOnce(new Error('card declined'));
    await expect(bookingService.moveDates('g1', 'b1', inHours(240).toISOString(), inHours(288).toISOString())).rejects.toThrow();
    const b = await BookingModel.findById('b1').lean();
    expect(b?.period.start.getTime()).toBe(inHours(72).getTime());
    expect(b?.priceBreakdown.total.amount).toBe(10_000);
    expect(await bookedDays('b1')).toBe(before);
    expect(await AvailabilityModel.countDocuments({ state: 'held' })).toBe(0);
  });

  it('closes inside the lead time and after one move', async () => {
    await seed({ start: inHours(10), end: inHours(58) });
    expect((await bookingService.movePreview('g1', 'b1', inHours(240).toISOString(), inHours(288).toISOString())).reason).toMatch(/24 hours before pickup/);
    await seed({ id: 'b2', start: inHours(72), end: inHours(120), vehicleId: 'v2', extra: { changes: [{ kind: 'move', at: new Date(), by: 'g1', from: { start: new Date(), end: new Date(), vehicleId: 'v2' }, to: { start: new Date(), end: new Date(), vehicleId: 'v2' } }] } });
    expect((await bookingService.movePreview('g1', 'b2', inHours(240).toISOString(), inHours(288).toISOString())).reason).toMatch(/already changed/);
  });
});

describe('switch car', () => {
  it('moves the trip to the similar car the guest picked, same dates, same price', async () => {
    await seed({ start: inHours(72), end: inHours(120) });
    (searchService.similarTo as jest.Mock).mockResolvedValue([{ _id: 'v2', hostId: 'h2', make: 'Kia', model: 'K5', year: 2024 }]);
    (vehicleService.getForBooking as jest.Mock).mockImplementation(async (id: string) => ({ _id: id, bookable: true, instantBook: true, minTripHours: 4, maxTripHours: 720, hostId: id === 'v2' ? 'h2' : 'h1' }));
    (pricingService.quote as jest.Mock).mockResolvedValue(quote(10_000));

    const opts = await bookingService.switchOptions('g1', 'b1');
    expect(opts.vehicles.map((v) => v._id)).toEqual(['v2']);
    await bookingService.switchCar('g1', 'b1', 'v2');
    const b = await BookingModel.findById('b1').lean();
    expect(b).toMatchObject({ vehicleId: 'v2', hostId: 'h2' });
    expect(b?.priceBreakdown.total.amount).toBe(10_000);
    expect(b?.changes?.[0].kind).toBe('switch_car');
    expect(await AvailabilityModel.countDocuments({ vehicleId: 'v1', bookingId: 'b1' })).toBe(0);
    expect(await ledgerBalances()).toBe(true);
  });

  it('refuses a car that was not offered', async () => {
    await seed({ start: inHours(72), end: inHours(120) });
    await expect(bookingService.switchCar('g1', 'b1', 'v9')).rejects.toThrow('no longer available');
  });
});

describe('exceptions', () => {
  const proof = 'claim/2031/01/g1/abc.jpg';

  async function lateCancel() {
    await seed({ start: inHours(10), end: inHours(58) });
    await bookingService.cancel(guest, 'b1', 'Flight cancelled', { reasonCode: 'flight_cancelled' });
    await PayoutModel.create({ tag: 'retained_b1', hostId: 'h1', bookingId: 'b1', amount: 4_000, currency: 'USD', kind: 'extra', status: 'scheduled', scheduledFor: new Date() });
  }

  it('approving returns what was kept and drops the host share that was waiting', async () => {
    await lateCancel();
    await tripChangeService.fileException('g1', 'b1', { reasonCode: 'flight_cancelled', proofKeys: [proof] });
    expect((await PayoutModel.findOne({ tag: 'retained_b1' }).lean())?.status).toBe('held');
    const refund = jest.spyOn(paymentGateway, 'refund');
    await tripChangeService.decideException('staff', 'b1', { decision: 'approved' });
    expect(refund).toHaveBeenCalledWith('pi_b1', money(5_000), expect.any(String));
    const b = await BookingModel.findById('b1').lean();
    expect(b?.exception).toMatchObject({ status: 'approved', refund: money(5_000) });
    expect(b?.cancellation?.charged?.amount).toBe(0);
    expect(await PayoutModel.countDocuments({ tag: 'retained_b1' })).toBe(0);
    expect(await ledgerBalances()).toBe(true);
  });

  it('a partial decision scales the host share and cannot be decided twice', async () => {
    await lateCancel();
    await tripChangeService.fileException('g1', 'b1', { reasonCode: 'health', proofKeys: [proof] });
    await tripChangeService.decideException('staff', 'b1', { decision: 'partial', amountCents: 2_500 });
    expect((await PayoutModel.findOne({ tag: 'retained_b1' }).lean())).toMatchObject({ amount: 2_000, status: 'scheduled' });
    await expect(tripChangeService.decideException('staff', 'b1', { decision: 'approved' })).rejects.toThrow('already decided');
  });

  it('rejects proof that is not the guest’s own private upload', async () => {
    await lateCancel();
    await expect(tripChangeService.fileException('g1', 'b1', { reasonCode: 'weather', proofKeys: ['claim/2031/01/someoneelse/x.jpg'] })).rejects.toThrow('could not be attached');
    await expect(tripChangeService.fileException('g1', 'b1', { reasonCode: 'weather', proofKeys: ['vehicle_photo/2031/01/g1/x.jpg'] })).rejects.toThrow('could not be attached');
    await expect(tripChangeService.fileException('g1', 'b1', { reasonCode: 'weather', proofKeys: [] })).rejects.toThrow('Add a photo');
  });

  it('flags proof reused from another request', async () => {
    await BookingModel.create({
      _id: 'older', code: 'OLDER', guestId: 'g1', hostId: 'h1', vehicleId: 'v9', period: { start: inHours(100), end: inHours(150) },
      priceBreakdown: quote(1_000), status: 'cancelled_guest', statusHistory: [], instantBook: true,
      exception: { status: 'rejected', reasonCode: 'weather', proofKeys: [proof], requestedAt: new Date() },
    });
    await lateCancel();
    await tripChangeService.fileException('g1', 'b1', { reasonCode: 'weather', proofKeys: [proof] });
    const b = await BookingModel.findById('b1').lean();
    expect(b?.exception?.flagged).toBe(true);
  });

  it('is refused after a full refund', async () => {
    await seed({ start: inHours(200), end: inHours(250) });
    await bookingService.cancel(guest, 'b1', 'x');
    await expect(tripChangeService.fileException('g1', 'b1', { reasonCode: 'weather', proofKeys: [proof] })).rejects.toThrow('full refund');
  });
});

describe('failed screening check', () => {
  it('ends every upcoming trip with a full refund and leaves started ones alone', async () => {
    await seed({ start: inHours(1), end: inHours(49) });
    await seed({ id: 'started', start: inHours(-2), end: inHours(20), vehicleId: 'v2', extra: { tripId: 't1', status: 'in_progress' } });
    const cancelled = await bookingService.cancelForFailedCheck('g1', 'background');
    expect(cancelled.map((c) => c.bookingId)).toEqual(['b1']);
    const b = await BookingModel.findById('b1').lean();
    expect(b?.status).toBe('cancelled_system');
    expect(b?.cancellation?.refund.amount).toBe(10_000);
    expect((await BookingModel.findById('started').lean())?.status).toBe('in_progress');
  });
});
