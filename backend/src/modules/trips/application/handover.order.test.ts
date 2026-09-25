/**
 * The handover runs in a fixed order, enforced on the server: host inspection,
 * guest + licence check, pickup code, odometer, then start. Also the pickup-code
 * attempt limit and the baseline rule for charges and claims.
 */
jest.mock('../../payments/infrastructure/gateway.provider', () => ({ paymentGateway: {} }));

import { tripService } from './trip.service';
import { inspectionService, type PhotoInput } from './inspection.service';
import { bookingService } from '../../bookings/application/booking.service';
import { incidentalsService } from '../../bookings/application/incidentals.service';
import { hostTripsService } from '../../bookings/application/host-trips.service';
import { claimService } from '../../claims/application/claim.service';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { TripModel } from '../infrastructure/trip.model';
import { depositService } from '../../payments/application/deposit.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { eventBus } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
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

let seq = 0;
const photo = (owner: string, angle = 'front'): PhotoInput => {
  const key = `trip_photo/2026/09/${owner}/${++seq}-abc.jpg`;
  return { url: `https://cdn.test/${key}`, key, angle, lat: 32.8, lng: -97, accuracyM: 8 };
};
const ANGLES = ['front', 'rear', 'interior', 'dashboard'];
const takePhotos = (owner: string, n = 4) => tripService.addPhotos(owner, 'bk-1', 'pre', ANGLES.slice(0, n).map((a) => photo(owner, a)));

async function setConfig(handover: Record<string, unknown> = {}) {
  const real = await platformConfigService.get();
  jest.spyOn(platformConfigService, 'get').mockResolvedValue({ ...real, handover: { ...real.handover, ...handover } });
}

async function seed(startInHours = 0.5) {
  await VehicleModel.create({
    _id: 'veh-1', hostId: 'host-1', year: 2024, make: 'VW', model: 'Atlas', category: 'suv', status: 'listed',
    seats: 5, fuelType: 'petrol', transmission: 'automatic', bodyType: 'suv', registrationNumber: 'ABC123',
    listing: { title: 'VW Atlas' }, pricing: { dailyPrice: 9500, currency: 'USD' },
    location: { city: 'Irving', state: 'TX', type: 'Point', coordinates: [-97, 32.8] },
  });
  const start = new Date(Date.now() + startInHours * HOUR);
  return BookingModel.create({
    _id: 'bk-1', code: 'CD-1', guestId: GUEST, hostId: 'host-1', vehicleId: 'veh-1', status: 'paid',
    period: { start, end: new Date(+start + 48 * HOUR) },
    priceBreakdown: { days: 2, currency: 'USD', total: { amount: 1, currency: 'USD' } },
    cancellationPolicy: 'flexible',
  });
}

const approveGuest = (licenceExpiry = new Date(Date.now() + 400 * 24 * HOUR)) =>
  KycModel.create({ userId: GUEST, status: 'approved', verifiedFirstName: 'Ada', verifiedLastName: 'Lovelace', licenceExpiry });

const verifyCode = async (code?: string) => {
  const issued = code ?? (await bookingService.issuePickupCode(guestP, 'bk-1')).code;
  return tripService.verifyPickupForBooking(hostP, 'bk-1', issued);
};

beforeEach(async () => {
  jest.restoreAllMocks();
  await clearTestDb();
  jest.spyOn(depositService, 'isEnabled').mockResolvedValue(false);
  jest.spyOn(tripService as unknown as { isHost: () => Promise<boolean> }, 'isHost').mockImplementation(
    (async (userId: string) => userId === HOST) as never,
  );
});

describe('start gate order', () => {
  it('walks the gates in order with a distinct code each, then starts', async () => {
    await seed();
    const body = { odometerStart: 1200 };

    await expect(tripService.start(guestP, 'bk-1', body)).rejects.toMatchObject({ code: 'HOST_ONLY_START', httpStatus: 403 });
    await expect(tripService.start(hostP, 'bk-1', body)).rejects.toMatchObject({ code: 'HOST_INSPECTION_REQUIRED' });

    await takePhotos(HOST);
    await expect(tripService.start(hostP, 'bk-1', body)).rejects.toMatchObject({ code: 'LICENCE_CONFIRMATION_REQUIRED' });
    await expect(tripService.start(hostP, 'bk-1', { ...body, licenceConfirmed: true })).rejects.toMatchObject({ code: 'GUEST_NOT_VERIFIED' });

    await approveGuest(new Date(Date.now() + 2 * HOUR));
    await expect(tripService.start(hostP, 'bk-1', { ...body, licenceConfirmed: true })).rejects.toMatchObject({ code: 'LICENCE_EXPIRES_DURING_TRIP' });
    await KycModel.updateOne({ userId: GUEST }, { licenceExpiry: new Date(Date.now() + 400 * 24 * HOUR) });

    await expect(tripService.start(hostP, 'bk-1', { ...body, licenceConfirmed: true })).rejects.toMatchObject({ code: 'PICKUP_CODE_REQUIRED' });
    await verifyCode();
    await expect(tripService.start(hostP, 'bk-1', { licenceConfirmed: true })).rejects.toMatchObject({ code: 'ODOMETER_REQUIRED' });

    const trip = await tripService.start(hostP, 'bk-1', { ...body, licenceConfirmed: true });
    expect(trip.pickupVerified).toBe(true);
    expect(trip.licenseConfirmed).toBe(true);
    expect(trip.licenseCheck?.verifiedName).toBe('Ada Lovelace');
    expect(trip.handover.odometerStart).toBe(1200);
  });

  it('an admin may start for the host and skips the inspection gate, but not the rest', async () => {
    await seed();
    await approveGuest();
    await expect(tripService.start(adminP, 'bk-1', { odometerStart: 5 })).rejects.toMatchObject({ code: 'LICENCE_CONFIRMATION_REQUIRED' });
    await expect(tripService.start(adminP, 'bk-1', { odometerStart: 5, licenceConfirmed: true })).rejects.toMatchObject({ code: 'PICKUP_CODE_REQUIRED' });
    await verifyCode();
    await expect(tripService.start(adminP, 'bk-1', { odometerStart: 5, licenceConfirmed: true })).resolves.toMatchObject({ status: 'active' });
  });

  it('a stranger is refused outright', async () => {
    await seed();
    await expect(tripService.start(principal('nobody'), 'bk-1', {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('with every toggle off the trip starts with only an odometer reading', async () => {
    await seed();
    await setConfig({ hostInspectionRequired: false, pickupCodeRequired: false, hostOnlyStart: false });
    await expect(tripService.start(guestP, 'bk-1', {})).rejects.toMatchObject({ code: 'ODOMETER_REQUIRED' });
    await expect(tripService.start(guestP, 'bk-1', { odometerStart: 10 })).resolves.toMatchObject({ status: 'active' });
  });

  it('turning hostOnlyStart off lets a guest start once the other gates pass', async () => {
    await seed();
    await setConfig({ hostOnlyStart: false, hostInspectionRequired: false, pickupCodeRequired: false });
    await expect(tripService.start(guestP, 'bk-1', { odometerStart: 10 })).resolves.toBeDefined();
  });
});

describe('host inspection counts host-side photos only', () => {
  it('guest photos do not satisfy the gate', async () => {
    const booking = await seed();
    await takePhotos(GUEST);
    expect(inspectionService.hostPrePhotoCount((await inspectionService.state(booking, HOST)).photos, GUEST)).toBe(0);
    await expect(tripService.start(hostP, 'bk-1', { odometerStart: 1 })).rejects.toMatchObject({ code: 'HOST_INSPECTION_REQUIRED' });
    await takePhotos(HOST, 3);
    await expect(tripService.start(hostP, 'bk-1', { odometerStart: 1 })).rejects.toMatchObject({ code: 'HOST_INSPECTION_REQUIRED' });
  });

  it('is still enforced before the window opens, and skipped once it has closed', async () => {
    await seed(10);
    await expect(tripService.start(hostP, 'bk-1', { odometerStart: 1 })).rejects.toMatchObject({ code: 'HOST_INSPECTION_REQUIRED' });
    await BookingModel.updateOne({ _id: 'bk-1' }, { period: { start: new Date(Date.now() - 60 * HOUR), end: new Date(Date.now() - 12 * HOUR) } });
    await expect(tripService.start(hostP, 'bk-1', { odometerStart: 1 })).rejects.toMatchObject({ code: 'LICENCE_CONFIRMATION_REQUIRED' });
  });
});

describe('pickup code', () => {
  it('is verified against the booking before any trip exists', async () => {
    await seed();
    expect(await TripModel.countDocuments()).toBe(0);
    await expect(verifyCode()).resolves.toEqual({ pickupVerified: true });
    const b = await BookingModel.findById('bk-1').lean();
    expect(b?.pickupVerifiedAt).toBeInstanceOf(Date);
    expect(b?.pickupVerifiedBy).toBe(HOST);
  });

  it('only the host side or an admin may verify it', async () => {
    await seed();
    const { code } = await bookingService.issuePickupCode(guestP, 'bk-1');
    await expect(tripService.verifyPickupForBooking(guestP, 'bk-1', code)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(tripService.verifyPickupForBooking(adminP, 'bk-1', code)).resolves.toBeDefined();
  });

  it('counts wrong tries, locks at the limit, notifies, and a new code resets it', async () => {
    await seed();
    const locked = jest.fn();
    eventBus.subscribe(EVENTS.PICKUP_CODE_LOCKED, async (e) => void locked(e.payload));
    await setConfig({ maxCodeAttempts: 3 });
    const { code } = await bookingService.issuePickupCode(guestP, 'bk-1');
    const wrong = code === '000000' ? '111111' : '000000';

    await expect(verifyCode(wrong)).rejects.toMatchObject({ code: 'PICKUP_CODE_INVALID', message: expect.stringContaining('2 tries left') });
    await expect(verifyCode(wrong)).rejects.toMatchObject({ code: 'PICKUP_CODE_INVALID', message: expect.stringContaining('1 try left') });
    await expect(verifyCode(wrong)).rejects.toMatchObject({ code: 'PICKUP_CODE_LOCKED' });
    await expect(verifyCode(code)).rejects.toMatchObject({ code: 'PICKUP_CODE_LOCKED' });
    expect(locked).toHaveBeenCalledTimes(1);

    const fresh = await bookingService.issuePickupCode(guestP, 'bk-1');
    await expect(verifyCode(fresh.code)).resolves.toEqual({ pickupVerified: true });
  });

  it('issuing a new code clears an earlier verification', async () => {
    await seed();
    await verifyCode();
    await bookingService.issuePickupCode(guestP, 'bk-1');
    expect((await BookingModel.findById('bk-1').lean())?.pickupVerifiedAt).toBeUndefined();
  });

  it('the old trip-addressed endpoint still works after the trip exists', async () => {
    await seed();
    await setConfig({ hostInspectionRequired: false, pickupCodeRequired: false, hostOnlyStart: false });
    const trip = await tripService.start(guestP, 'bk-1', { odometerStart: 1 });
    const { code } = await bookingService.issuePickupCode(guestP, 'bk-1');
    expect((await tripService.verifyPickup(hostP, trip._id, code)).pickupVerified).toBe(true);
  });
});

describe('baseline for charges and claims', () => {
  const charge = (type: 'cleaning' | 'toll', by = HOST) =>
    incidentalsService.charge('bk-1', [{ type, amount: 500, note: 'a long enough note', evidenceUrl: 'https://x.test/e.jpg' }], by);

  beforeEach(() => {
    jest.spyOn(incidentalsService, 'collect').mockResolvedValue('card');
  });

  it('refuses a cleaning charge with no host pickup photos, but lets a toll through', async () => {
    await seed();
    await expect(charge('cleaning')).rejects.toMatchObject({ code: 'BASELINE_REQUIRED' });
    await expect(charge('toll')).resolves.toBeDefined();
  });

  it('lets the system bill fuel with no baseline, and a host with a baseline bill cleaning', async () => {
    await seed();
    await expect(incidentalsService.chargeFuelShortfall('bk-1', 80, 40)).resolves.toBeGreaterThan(0);
    await takePhotos(HOST);
    await expect(charge('cleaning')).resolves.toBeDefined();
  });

  it('turning the rule off lifts it', async () => {
    await seed();
    await setConfig({ baselineRequiredForCharges: false });
    await expect(charge('cleaning')).resolves.toBeDefined();
  });

  it('a damage claim needs the baseline; a guest-side photo set does not count', async () => {
    await seed();
    const claim = { type: 'damage' as const, bookingId: 'bk-1', description: 'Dent', evidence: [{ url: 'https://x.test/d.jpg', kind: 'image' as const }] };
    await takePhotos(GUEST);
    await expect(claimService.create(HOST, claim)).rejects.toMatchObject({ code: 'BASELINE_REQUIRED', message: expect.stringContaining('damage cannot be charged') });
  });
});

describe('host trip timeline', () => {
  it('reports each step from real data and locks what follows', async () => {
    await seed();
    const m = { amount: 100, currency: 'USD' };
    await BookingModel.updateOne({ _id: 'bk-1' }, { priceBreakdown: { days: 2, currency: 'USD', base: m, subtotal: m, commission: m, tax: m, hostEarnings: m, total: m } });
    await takePhotos(HOST, 2);
    const s = await inspectionService.state((await BookingModel.findById('bk-1').lean())!, HOST);
    expect(s.pre.taken).toBe(2);
    jest.spyOn(hostTripsService as unknown as { scopeFor: () => Promise<{ hostId: string }> }, 'scopeFor').mockResolvedValue({ hostId: 'host-1' });
    const trip = (await hostTripsService.one(HOST, 'bk-1'))!;
    expect(trip.timeline.map((t) => t.key)).toEqual(['inspect', 'verify_guest', 'pickup_code', 'start', 'on_trip', 'return_photos', 'return', 'payout']);
    expect(trip.timeline[0]).toMatchObject({ state: 'current', detail: '2 of 4 photos' });
    expect(trip.timeline[1].state).toBe('locked');
    expect(trip.handover).toMatchObject({ inspection: { taken: 2, required: 4, open: true }, pickupVerified: false, codeLocked: false });

    await setConfig({ pickupCodeRequired: false, hostInspectionRequired: false });
    const off = (await hostTripsService.one(HOST, 'bk-1'))!;
    expect(off.timeline[0]).toMatchObject({ state: 'done', detail: 'Not required' });
    expect(off.timeline[2]).toMatchObject({ state: 'done', detail: 'Not required' });
    expect(off.timeline[1].state).toBe('current');
  });
});
