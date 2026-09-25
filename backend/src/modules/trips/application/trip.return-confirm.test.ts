/**
 * A guest cannot close a trip alone: their return waits for the host (or the
 * clock), and only then do the deposit and payout move. Also the guest
 * eligibility re-check at start, the host's own read access, and who may file a claim.
 */
jest.mock('../../payments/infrastructure/gateway.provider', () => ({ paymentGateway: {} }));

import { tripService } from './trip.service';
import { claimService } from '../../claims/application/claim.service';
import { bookingService } from '../../bookings/application/booking.service';
import { depositService } from '../../payments/application/deposit.service';
import { eligibilityService } from '../../bookings/application/eligibility.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { PayoutModel } from '../../payouts/infrastructure/payout.model';
import { PaymentModel } from '../../payments/infrastructure/payment.model';
import { ClaimModel } from '../../claims/infrastructure/claim.model';
import { TripModel } from '../infrastructure/trip.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

const HOUR = 3_600_000;
const GUEST = 'guest-1';
const HOST = 'host-user';
const principal = (userId: string, permissions: string[] = []) => ({ userId, roles: [], permissions, sessionId: 's' });
const guestP = principal(GUEST);
const hostP = principal(HOST);
const adminP = principal('admin-1', ['*']);

async function seedTrip(bookingStatus: 'paid' | 'in_progress' = 'in_progress') {
  await BookingModel.create({
    _id: 'bk-1', code: 'CD-1', guestId: GUEST, hostId: 'host-1', vehicleId: 'veh-1', status: bookingStatus,
    period: { start: new Date(Date.now() - 48 * HOUR), end: new Date(Date.now() + HOUR) },
    priceBreakdown: { days: 2, currency: 'USD', total: { amount: 1, currency: 'USD' }, hostEarnings: { amount: 5000, currency: 'USD' } },
    cancellationPolicy: 'flexible',
  });
  return TripModel.create({
    _id: 'trip-1', bookingId: 'bk-1', vehicleId: 'veh-1', guestId: GUEST, hostId: 'host-1', status: 'active',
    handover: { at: new Date(), odometerStart: 1000 },
  });
}

beforeEach(async () => {
  jest.restoreAllMocks();
  await clearTestDb();
  jest.spyOn(depositService, 'isEnabled').mockResolvedValue(false);
  jest.spyOn(eligibilityService, 'evaluate').mockResolvedValue({ eligible: true, canRequest: true, blockers: [], awaitingReview: false });
  jest.spyOn(tripService as unknown as { isHost: () => Promise<boolean> }, 'isHost').mockImplementation(
    (async (userId: string) => userId === HOST) as never,
  );
  const real = await platformConfigService.get();
  jest.spyOn(platformConfigService, 'get').mockResolvedValue({ ...real, inspection: { ...real.inspection, minReturnPhotos: 0 } });
});

describe('guest-ended return', () => {
  it('leaves the return unconfirmed and pays nothing until the host confirms', async () => {
    await seedTrip();
    const done = await tripService.complete(GUEST, 'trip-1', { odometerEnd: 1100 });
    expect(done.status).toBe('completed');
    expect(done.returnConfirmed).toBe(false);
    expect(await PayoutModel.countDocuments()).toBe(0);

    await expect(tripService.confirmReturn(guestP, 'trip-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const confirmed = await tripService.confirmReturn(hostP, 'trip-1', { odometerEnd: 1120 });
    expect(confirmed.returnConfirmed).toBe(true);
    expect(confirmed.returnConfirmedBy).toBe(HOST);
    expect(confirmed.return?.odometerEnd).toBe(1120);
    expect(await PayoutModel.countDocuments({ bookingId: 'bk-1' })).toBe(1);
    await expect(tripService.confirmReturn(hostP, 'trip-1')).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('a host completion is confirmed immediately', async () => {
    await seedTrip();
    const done = await tripService.complete(HOST, 'trip-1', { odometerEnd: 1100 });
    expect(done.returnConfirmed).toBe(true);
  });

  it('holds the deposit while the return is unconfirmed', async () => {
    await seedTrip();
    await tripService.complete(GUEST, 'trip-1', {});
    await BookingModel.updateOne({ _id: 'bk-1' }, { 'period.end': new Date(Date.now() - 30 * 24 * HOUR) });
    await PaymentModel.create({ userId: GUEST, bookingId: 'bk-1', type: 'deposit', intentId: 'pi_1', amount: 20000, currency: 'USD', status: 'authorized' });
    jest.spyOn(depositService, 'isEnabled').mockResolvedValue(true);
    const release = jest.spyOn(depositService, 'release').mockResolvedValue(true as never);

    expect(await depositService.releaseDue()).toBe(0);
    await tripService.confirmReturn(hostP, 'trip-1');
    expect(await depositService.releaseDue()).toBe(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('auto-confirms after the window, but an open dispute blocks it', async () => {
    await seedTrip();
    await tripService.complete(GUEST, 'trip-1', {});

    expect(await tripService.sweepUnconfirmedReturns()).toBe(0);

    await TripModel.updateOne({ _id: 'trip-1' }, { 'return.at': new Date(Date.now() - 13 * HOUR) });
    const claim = await ClaimModel.create({ type: 'damage', bookingId: 'bk-1', claimantId: HOST, description: 'scratch on door', status: 'opened' });
    expect(await tripService.sweepUnconfirmedReturns()).toBe(0);
    expect((await TripModel.findById('trip-1').lean())?.returnConfirmed).toBe(false);

    await ClaimModel.updateOne({ _id: claim._id }, { status: 'closed' });
    expect(await tripService.sweepUnconfirmedReturns()).toBe(1);
    const trip = await TripModel.findById('trip-1').lean();
    expect(trip?.returnConfirmed).toBe(true);
    expect(trip?.returnConfirmedBy).toBe('system');
    expect(await PayoutModel.countDocuments({ bookingId: 'bk-1' })).toBe(1);
  });
});

describe('start re-checks the guest', () => {
  it('refuses a guest who is no longer eligible, but lets an admin through that gate', async () => {
    await seedTrip('paid');
    await TripModel.deleteMany({});
    jest.spyOn(eligibilityService, 'evaluate').mockResolvedValue({ eligible: false, canRequest: false, blockers: ['account_suspended'], awaitingReview: false });
    const cfg = await platformConfigService.get();
    jest.spyOn(platformConfigService, 'get').mockResolvedValue({ ...cfg, handover: { ...cfg.handover, hostInspectionRequired: false } });
    await expect(tripService.start(hostP, 'bk-1', { odometerStart: 1 })).rejects.toMatchObject({ code: 'GUEST_NOT_ELIGIBLE' });
    await expect(tripService.start(adminP, 'bk-1', { odometerStart: 1 })).rejects.not.toMatchObject({ code: 'GUEST_NOT_ELIGIBLE' });
  });
});

describe('host-side trip access', () => {
  it('lets the host side through the public check and refuses a stranger', async () => {
    const trip = await seedTrip();
    expect(await tripService.isHostSideOf(HOST, trip)).toBe(true);
    expect(await tripService.isHostSideOf('stranger', trip)).toBe(false);
  });
});

describe('who may file a claim', () => {
  const claim = (bookingId?: string, tripId?: string) => ({ type: 'dispute' as const, bookingId, tripId, description: 'a real dispute' });

  it('refuses someone who is not the guest or host side of the booking', async () => {
    await seedTrip();
    await expect(claimService.create('stranger', claim('bk-1'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await ClaimModel.countDocuments()).toBe(0);
  });

  it('refuses a trip that belongs to another booking', async () => {
    await seedTrip();
    await BookingModel.create({
      _id: 'bk-2', code: 'CD-2', guestId: 'guest-2', hostId: 'host-1', vehicleId: 'veh-1', status: 'paid',
      period: { start: new Date(), end: new Date(Date.now() + HOUR) },
      priceBreakdown: { days: 1, currency: 'USD', total: { amount: 1, currency: 'USD' } }, cancellationPolicy: 'flexible',
    });
    await expect(claimService.create('guest-2', claim('bk-2', 'trip-1'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(claimService.create(GUEST, claim(undefined, 'nope'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets the guest and the host side file, against each other', async () => {
    await seedTrip();
    jest.spyOn(bookingService, 'getDoc').mockResolvedValue((await BookingModel.findById('bk-1').lean()) as never);
    const byHost = await claimService.create(HOST, claim('bk-1', 'trip-1'));
    expect(byHost.respondentId).toBe(GUEST);
    const byGuest = await claimService.create(GUEST, claim('bk-1'));
    expect(byGuest.claimantId).toBe(GUEST);
  });
});
