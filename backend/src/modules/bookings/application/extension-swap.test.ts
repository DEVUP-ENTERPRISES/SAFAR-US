/**
 * Trip extensions against a real in-memory MongoDB and the mock gateway. What
 * is under test is where money and days can go wrong: the moved guest never
 * pays more and keeps their dates, the ledger re-class balances whether the
 * new car is cheaper, dearer or beyond the platform's cap, and a failed
 * extension charge leaves everybody exactly where they started.
 */

// Never let a test reach the real processor, whatever keys the local env holds.
jest.mock('../../payments/infrastructure/gateway.provider', () => ({ paymentGateway: new (jest.requireActual('../../payments/infrastructure/mock.gateway').MockGateway)() }));

const mockConfig = {
  extension: { enabled: true, maxDays: 30, swapPolicy: 'auto', swapPriceToleranceBps: 1500, swapMaxAbsorbCents: 5000 },
  booking: { checkoutHoldMinutes: 15 },
};
jest.mock('../../platform-config/application/platform-config.service', () => ({
  platformConfigService: { get: jest.fn(async () => mockConfig) },
}));
jest.mock('../../pricing/application/pricing.service', () => ({ pricingService: { quote: jest.fn() } }));
jest.mock('../../search/application/search.service', () => ({ searchService: { similarTo: jest.fn() } }));
jest.mock('../../vehicles/application/vehicle.service', () => ({ vehicleService: { getForBooking: jest.fn(), getById: jest.fn() } }));
jest.mock('../../documents/application/document-compliance.service', () => ({
  documentComplianceService: { hasExpiredMandatoryDoc: jest.fn(async () => false) },
}));
jest.mock('../../vehicles/application/vehicle-lifecycle.service', () => ({
  vehicleLifecycleService: { isOperableForBooking: jest.fn(async () => true) },
}));

import { bookingService } from './booking.service';
import { BookingModel } from '../infrastructure/booking.model';
import { AvailabilityModel } from '../../availability/infrastructure/availability.model';
import { availabilityService, dayKeys } from '../../availability/application/availability.service';
import { PaymentModel } from '../../payments/infrastructure/payment.model';
import { LedgerModel } from '../../payments/infrastructure/ledger.model';
import { paymentGateway } from '../../payments/infrastructure/gateway.provider';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { pricingService } from '../../pricing/application/pricing.service';
import { searchService } from '../../search/application/search.service';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
  Object.assign(mockConfig.extension, { enabled: true, maxDays: 30, swapPolicy: 'auto', swapPriceToleranceBps: 1500, swapMaxAbsorbCents: 5000 });
});

const DAY = 86_400_000;
const day = (n: number) => new Date(Date.UTC(2031, 0, 1) + n * DAY + 10 * 3_600_000);
const money = (amount: number) => ({ amount, currency: 'USD' });

const EXTENDER = 'b-ext';
const BLOCKER = 'b-next';

function quote(total: number, earnings: number, commission: number, tax: number, days = 1) {
  return {
    days,
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
    tax: money(tax),
    taxTotal: money(0),
    hostEarnings: money(earnings),
    total: money(total),
    currency: 'USD',
  };
}

async function seedBooking(over: Record<string, unknown> & { _id: string; guestId: string; start: Date; end: Date }) {
  const { start, end, ...rest } = over;
  const days = dayKeys(start as Date, end as Date).length;
  return BookingModel.create({
    code: `CODE-${over._id}`,
    hostId: 'h1',
    vehicleId: 'v1',
    period: { start, end },
    priceBreakdown: { ...quote(10_000, 8_000, 1_500, 500, days) },
    cancellationPolicy: 'moderate',
    status: 'paid',
    statusHistory: [],
    instantBook: true,
    ...rest,
  });
}

/** A booking's confirmed payment and the ledger entry it would have posted. */
async function seedPaid(bookingId: string, guestId: string, hostId: string, amount = 10_000, earnings = 8_000, commission = 1_500, tax = 500) {
  const txnId = await ledgerService.post({
    refType: 'booking',
    refId: bookingId,
    currency: 'USD',
    description: 'seed',
    legs: [
      { account: Account.gatewayClearing(), direction: 'credit', amount },
      { account: Account.hostPayable(hostId), direction: 'debit', amount: earnings },
      { account: Account.platformRevenue(), direction: 'debit', amount: commission },
      { account: Account.platformTax(), direction: 'debit', amount: tax },
    ],
  });
  const payment = await PaymentModel.create({
    bookingId,
    userId: guestId,
    hostId,
    type: 'booking',
    intentId: `pi_${bookingId}`,
    amount,
    currency: 'USD',
    hostEarnings: earnings,
    commission,
    tax,
    capturedAmount: amount,
    status: 'succeeded',
    ledgerTxnId: txnId,
    idempotencyKey: bookingId,
  });
  await BookingModel.updateOne({ _id: bookingId }, { paymentId: payment._id });
}

async function book(bookingId: string, vehicleId: string, start: Date, end: Date) {
  const holdId = await availabilityService.placeHold(vehicleId, start, end);
  await availabilityService.confirmHold(holdId, bookingId);
}

/** The extender's trip on v1 (days 10-12) and the next guest's on v1 (days 13-15). */
async function seedScenario(blockerOver: Record<string, unknown> = {}) {
  await seedBooking({ _id: EXTENDER, guestId: 'g1', start: day(10), end: day(12) });
  await seedPaid(EXTENDER, 'g1', 'h1');
  await book(EXTENDER, 'v1', day(10), day(12));

  await seedBooking({ _id: BLOCKER, guestId: 'g2', start: day(13), end: day(15), ...blockerOver });
  await seedPaid(BLOCKER, 'g2', 'h1');
  await book(BLOCKER, 'v1', day(13), day(15));
}

function stubCars(candidateTotals: { total: number; earnings: number; commission: number; tax: number }, extension = quote(6_000, 4_800, 900, 300, 2)) {
  (searchService.similarTo as jest.Mock).mockResolvedValue([{ _id: 'v2', hostId: 'h2', make: 'Kia', model: 'Seltos', year: 2024 }]);
  (vehicleService.getForBooking as jest.Mock).mockResolvedValue({ bookable: true, instantBook: true, minTripHours: 1, maxTripHours: 24 * 60 });
  (pricingService.quote as jest.Mock).mockImplementation(async ({ vehicleId }: { vehicleId: string }) =>
    vehicleId === 'v2'
      ? quote(candidateTotals.total, candidateTotals.earnings, candidateTotals.commission, candidateTotals.tax, 3)
      : extension,
  );
}

/** Ledger totals across every account: a balanced ledger has equal debits and credits. */
async function ledgerBalanced() {
  const rows = await LedgerModel.find().lean();
  const sum = (d: string) => rows.filter((r) => r.direction === d).reduce((s, r) => s + r.amount, 0);
  expect(sum('debit')).toBe(sum('credit'));
}

const extendTo = (n: number) => bookingService.requestExtension('g1', EXTENDER, day(n).toISOString());

describe('extension swap ledger', () => {
  it('re-classes a cheaper car: guest keeps the price, new host gets the new split, books balance', async () => {
    await seedScenario();
    stubCars({ total: 9_500, earnings: 7_600, commission: 1_425, tax: 475 });

    await extendTo(14);

    const moved = await BookingModel.findById(BLOCKER).lean();
    expect(moved?.vehicleId).toBe('v2');
    expect(moved?.hostId).toBe('h2');
    expect(moved?.swap).toMatchObject({ fromVehicleId: 'v1', toVehicleId: 'v2', reason: 'extension', extendedByBookingId: EXTENDER });
    expect(moved?.priceBreakdown.total.amount).toBe(10_000);
    expect(moved?.period.start).toEqual(day(13));
    expect(moved?.priceBreakdown.hostEarnings.amount).toBe(7_600);

    const pay = await PaymentModel.findOne({ bookingId: BLOCKER }).lean();
    expect(pay).toMatchObject({ amount: 10_000, hostId: 'h2', hostEarnings: 7_600, tax: 475, commission: 1_925 });

    // Old host keeps only the extension earnings; the new host owes-out the new split.
    expect(await ledgerService.debitBalance(Account.hostPayable('h1'))).toBe(8_000 + 8_000 + 4_800 - 8_000);
    expect(await ledgerService.debitBalance(Account.hostPayable('h2'))).toBe(7_600);
    expect(await ledgerService.debitBalance(Account.platformRevenue())).toBe(1_500 + 1_500 + 900 - 1_500 + 1_925);
    expect(await ledgerService.debitBalance(Account.platformTax())).toBe(500 + 500 + 300 - 500 + 475);
    expect(await ledgerService.balance(Account.guaranteeExpense())).toBe(0);
    await ledgerBalanced();

    // The moved guest holds the new car for exactly their dates; the extender holds the freed ones.
    const onV2 = await AvailabilityModel.find({ vehicleId: 'v2' }).lean();
    expect(onV2.map((r) => r.dayKey).sort()).toEqual(dayKeys(day(13), day(15)));
    expect(onV2.every((r) => r.state === 'booked' && r.bookingId === BLOCKER)).toBe(true);
    const onV1 = await AvailabilityModel.find({ vehicleId: 'v1' }).lean();
    expect(onV1.every((r) => r.bookingId === EXTENDER)).toBe(true);
    expect(onV1.map((r) => r.dayKey).sort()).toEqual(dayKeys(day(10), day(14)));
  });

  it('absorbs a pricier car within the cap without going negative', async () => {
    await seedScenario();
    stubCars({ total: 10_400, earnings: 8_500, commission: 1_400, tax: 500 });

    await extendTo(14);

    expect((await BookingModel.findById(BLOCKER).lean())?.priceBreakdown.total.amount).toBe(10_000);
    expect(await ledgerService.debitBalance(Account.hostPayable('h2'))).toBe(8_500);
    expect(await ledgerService.balance(Account.guaranteeExpense())).toBe(0);
    await ledgerBalanced();
  });

  it('funds a shortfall from the guarantee account when the new split exceeds what was paid', async () => {
    await seedScenario();
    stubCars({ total: 10_400, earnings: 9_800, commission: 0, tax: 600 });

    await extendTo(14);

    // 9,800 + 600 owed against 10,000 paid: the platform covers the 400.
    expect(await ledgerService.balance(Account.guaranteeExpense())).toBe(400);
    expect(await ledgerService.debitBalance(Account.hostPayable('h2'))).toBe(9_800);
    expect((await PaymentModel.findOne({ bookingId: BLOCKER }).lean())?.commission).toBe(0);
    await ledgerBalanced();
  });

  it('refuses a swap that would cost the platform more than the absorb cap', async () => {
    await seedScenario();
    mockConfig.extension.swapMaxAbsorbCents = 500;
    stubCars({ total: 10_600, earnings: 8_600, commission: 1_400, tax: 600 });

    const preview = await bookingService.extensionPreview('g1', EXTENDER, day(14).toISOString());
    expect(preview.available).toBe(false);
    expect(preview.swap).toBeUndefined();
    await expect(extendTo(14)).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
    expect((await BookingModel.findById(BLOCKER).lean())?.vehicleId).toBe('v1');
  });

  it('refuses a car priced outside the tolerance, even a much cheaper one', async () => {
    await seedScenario();
    stubCars({ total: 6_000, earnings: 4_800, commission: 900, tax: 300 });
    await expect(extendTo(14)).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
  });

  it('reports the swap in the preview when it would make the extension possible', async () => {
    await seedScenario();
    stubCars({ total: 9_500, earnings: 7_600, commission: 1_425, tax: 475 });

    const preview = await bookingService.extensionPreview('g1', EXTENDER, day(14).toISOString());
    expect(preview.available).toBe(false);
    expect(preview.swap).toMatchObject({ possible: true, vehicle: { id: 'v2', make: 'Kia' } });
    expect(preview.extraCost?.amount).toBe(6_000);
    // A preview changes nothing.
    expect((await BookingModel.findById(BLOCKER).lean())?.vehicleId).toBe('v1');
  });

  it('does not swap when the policy is off', async () => {
    await seedScenario();
    mockConfig.extension.swapPolicy = 'off';
    stubCars({ total: 9_500, earnings: 7_600, commission: 1_425, tax: 475 });
    await expect(extendTo(14)).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
  });
});

describe('who is never moved', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['a trip that has started', { tripId: 'trip-1' }],
    ['an in-progress trip', { status: 'in_progress' }],
    ['a booking that is not yet paid', { status: 'pending_approval' }],
    ['the extender themselves', { guestId: 'g1' }],
    ['a trip already in the past', { start: new Date(Date.now() - 2 * DAY), end: new Date(Date.now() - DAY) }],
  ];

  it.each(cases)('leaves %s alone', async (_name, over) => {
    // Past bookings sit outside the extension window, so give them the blocking days directly.
    await seedScenario(over.start ? {} : over);
    if (over.start) await BookingModel.updateOne({ _id: BLOCKER }, { 'period.start': over.start, 'period.end': over.end });
    stubCars({ total: 9_500, earnings: 7_600, commission: 1_425, tax: 475 });

    await expect(extendTo(14)).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
    expect((await BookingModel.findById(BLOCKER).lean())?.vehicleId).toBe('v1');
    expect(await AvailabilityModel.countDocuments({ vehicleId: 'v2' })).toBe(0);
  });

  it('never moves a host block', async () => {
    await seedBooking({ _id: EXTENDER, guestId: 'g1', start: day(10), end: day(12) });
    await seedPaid(EXTENDER, 'g1', 'h1');
    await book(EXTENDER, 'v1', day(10), day(12));
    await availabilityService.block('v1', day(13), day(14));
    stubCars({ total: 9_500, earnings: 7_600, commission: 1_425, tax: 475 });

    const preview = await bookingService.extensionPreview('g1', EXTENDER, day(14).toISOString());
    expect(preview).toMatchObject({ available: false, reason: 'The host has blocked those days.' });
    await expect(extendTo(14)).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
  });

  it('never moves two bookings at once', async () => {
    await seedScenario();
    await seedBooking({ _id: 'b-third', guestId: 'g3', start: day(14), end: day(14) });
    await AvailabilityModel.updateOne({ vehicleId: 'v1', dayKey: dayKeys(day(14), day(14))[0] }, { bookingId: 'b-third' });
    stubCars({ total: 9_500, earnings: 7_600, commission: 1_425, tax: 475 });
    await expect(extendTo(15)).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
  });
});

describe('failed extension charge', () => {
  it('puts the moved guest back and releases the new car', async () => {
    await seedScenario();
    stubCars({ total: 9_500, earnings: 7_600, commission: 1_425, tax: 475 });
    const before = (await AvailabilityModel.find({ bookingId: BLOCKER }).lean()).map((r) => r.dayKey).sort();
    const ledgerBefore = await LedgerModel.countDocuments();
    jest.spyOn(paymentGateway, 'createIntent').mockRejectedValueOnce(new Error('card declined'));

    await expect(extendTo(14)).rejects.toThrow('card declined');

    const blocker = await BookingModel.findById(BLOCKER).lean();
    expect(blocker?.vehicleId).toBe('v1');
    expect(blocker?.swap).toBeUndefined();
    const after = await AvailabilityModel.find({ bookingId: BLOCKER }).lean();
    expect(after.map((r) => r.dayKey).sort()).toEqual(before);
    expect(after.every((r) => r.vehicleId === 'v1' && r.state === 'booked')).toBe(true);
    expect(await AvailabilityModel.countDocuments({ vehicleId: 'v2' })).toBe(0);
    expect(await LedgerModel.countDocuments()).toBe(ledgerBefore);
    expect((await BookingModel.findById(EXTENDER).lean())?.period.end).toEqual(day(12));
  });
});

describe('extension records and receipts', () => {
  it('records the extension and its receipts sum to the booking total', async () => {
    await seedBooking({ _id: EXTENDER, guestId: 'g1', start: day(10), end: day(12) });
    await seedPaid(EXTENDER, 'g1', 'h1');
    await book(EXTENDER, 'v1', day(10), day(12));
    stubCars({ total: 9_500, earnings: 7_600, commission: 1_425, tax: 475 });

    const updated = await extendTo(14);

    expect(updated.extensions).toHaveLength(1);
    expect(updated.extensions?.[0]).toMatchObject({ receiptNo: 'CODE-b-ext-R1', days: 2, prevEnd: day(12) });
    expect(updated.priceBreakdown.total.amount).toBe(16_000);
    expect(updated.priceBreakdown.subtotal.amount).toBe(16_000);
    expect(updated.priceBreakdown.hostEarnings.amount).toBe(12_800);

    const { receipts, summary } = await bookingService.receipts({ userId: 'g1', permissions: [] } as never, EXTENDER);
    expect(receipts.map((r) => r.receiptNo)).toEqual(['CODE-b-ext-R0', 'CODE-b-ext-R1']);
    for (const r of receipts) expect(r.lines.reduce((s, l) => s + l.amount, 0)).toBe(r.total.amount);
    expect(receipts.reduce((s, r) => s + r.total.amount, 0)).toBe(summary.total.amount);
    expect(receipts[0].total.amount).toBe(10_000);
    expect(receipts[1].paymentRef).toBeDefined();
  });

  it('enforces the configured enabled flag and maximum length', async () => {
    await seedBooking({ _id: EXTENDER, guestId: 'g1', start: day(10), end: day(12) });
    await seedPaid(EXTENDER, 'g1', 'h1');
    await book(EXTENDER, 'v1', day(10), day(12));
    stubCars({ total: 9_500, earnings: 7_600, commission: 1_425, tax: 475 });

    mockConfig.extension.maxDays = 2;
    await expect(extendTo(15)).rejects.toThrow(/up to 2 days/);
    mockConfig.extension.enabled = false;
    await expect(extendTo(13)).rejects.toMatchObject({ code: 'EXTENSIONS_DISABLED' });
  });
});
