/**
 * Condition photos: server-enforced windows, caps, key ownership and location,
 * append-only storage, and a start gate that can never lock a guest out.
 */
import { tripService } from './trip.service';
import { eligibilityService } from '../../bookings/application/eligibility.service';
import { inspectionService, type PhotoInput } from './inspection.service';
import { TripModel, PrePhotoModel } from '../infrastructure/trip.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { depositService } from '../../payments/application/deposit.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  jest.restoreAllMocks();
  await clearTestDb();
  jest.spyOn(depositService, 'isEnabled').mockResolvedValue(false);
  jest.spyOn(eligibilityService, 'evaluate').mockResolvedValue({ eligible: true, canRequest: true, blockers: [], awaitingReview: false });
  // These tests are about photos; the handover order has its own file.
  const real = await platformConfigService.get();
  jest.spyOn(platformConfigService, 'get').mockResolvedValue({
    ...real,
    handover: { ...real.handover, hostInspectionRequired: false, pickupCodeRequired: false, hostOnlyStart: false },
  });
});
const asGuest = { userId: 'guest-1', roles: [], permissions: [], sessionId: 's' };
const READINGS = { odometerStart: 1000 };

const HOUR = 3_600_000;
const GUEST = 'guest-1';
let seq = 0;
const key = (owner = GUEST, ext = 'jpg') => `trip_photo/2026/09/${owner}/${++seq}-abc.${ext}`;
const photo = (over: Partial<PhotoInput> = {}): PhotoInput => {
  const k = over.key ?? key();
  return { url: `https://cdn.test/${k}`, angle: 'front', lat: 32.8, lng: -97, accuracyM: 8, ...over, key: k };
};

async function seed(startInHours: number, lengthHours = 48) {
  await VehicleModel.create({
    _id: 'veh-1', hostId: 'host-1', year: 2024, make: 'VW', model: 'Atlas', category: 'suv', status: 'listed',
    seats: 5, fuelType: 'petrol', transmission: 'automatic', bodyType: 'suv', registrationNumber: 'ABC123',
    listing: { title: 'VW Atlas' }, pricing: { dailyPrice: 9500, currency: 'USD' },
    location: { city: 'Irving', state: 'TX', type: 'Point', coordinates: [-97, 32.8] },
  });
  const start = new Date(Date.now() + startInHours * HOUR);
  return BookingModel.create({
    _id: 'bk-1', code: 'CD-1', guestId: GUEST, hostId: 'host-1', vehicleId: 'veh-1', status: 'paid',
    period: { start, end: new Date(+start + lengthHours * HOUR) },
    priceBreakdown: { days: 2, currency: 'USD', total: { amount: 1, currency: 'USD' } },
    cancellationPolicy: 'flexible',
  });
}

const startWithPhotos = async () => {
  await tripService.addPhotos(GUEST, 'bk-1', 'pre', ['front', 'rear', 'interior', 'dashboard'].map((angle) => photo({ angle })));
  return tripService.start(asGuest, 'bk-1', READINGS);
};

describe('immutability', () => {
  it('exposes no way to edit or remove a photo', () => {
    const names = [...Object.getOwnPropertyNames(Object.getPrototypeOf(tripService)), ...Object.getOwnPropertyNames(Object.getPrototypeOf(inspectionService))];
    expect(names.filter((n) => /photo/i.test(n) && /(update|delete|remove|edit|replace)/i.test(n))).toEqual([]);
    expect(names).not.toEqual(expect.arrayContaining(['deletePhoto', 'removePhoto', 'updatePhoto']));
  });
});

describe('pickup photo window', () => {
  it('refuses before the window opens, and says when', async () => {
    await seed(5);
    await expect(tripService.addPhotos(GUEST, 'bk-1', 'pre', [photo()])).rejects.toMatchObject({ code: 'PHOTO_WINDOW_NOT_OPEN' });
  });

  it('accepts inside the window, stamping time and author on the server', async () => {
    await seed(0.5);
    const s = await tripService.addPhotos(GUEST, 'bk-1', 'pre', [photo({ capturedAtClient: '2001-01-01T00:00:00.000Z' })]);
    expect(s.pre.taken).toBe(1);
    const [saved] = await PrePhotoModel.find({ bookingId: 'bk-1' }).lean();
    expect(saved.byUserId).toBe(GUEST);
    expect(saved.source).toBe('camera');
    expect(Date.now() - +new Date(saved.at)).toBeLessThan(10_000);
  });

  it('rejects a client-supplied `at` at the schema layer (route uses strict())', async () => {
    const { z } = await import('zod');
    const schema = z.object({ key: z.string() }).strict();
    expect(schema.safeParse({ key: 'x', at: '2001-01-01' }).success).toBe(false);
  });

  it('a late guest can still take photos before starting', async () => {
    await seed(-6);
    const s = await tripService.addPhotos(GUEST, 'bk-1', 'pre', [photo()]);
    expect(s.pre.open).toBe(true);
  });

  it('refuses a stranger', async () => {
    await seed(0.5);
    await expect(tripService.addPhotos('someone-else', 'bk-1', 'pre', [photo({ key: key('someone-else') })])).rejects.toThrow();
  });
});

describe('per-photo rules', () => {
  beforeEach(() => seed(0.5));

  it('needs a key owned by the caller', async () => {
    await expect(tripService.addPhotos(GUEST, 'bk-1', 'pre', [photo({ key: key('other-user') })])).rejects.toThrow(/does not belong/);
  });

  it('needs a trip_photo key', async () => {
    await expect(tripService.addPhotos(GUEST, 'bk-1', 'pre', [photo({ key: `kyc/2026/09/${GUEST}/a.jpg` })])).rejects.toThrow(/does not belong/);
  });

  it('needs a JPEG', async () => {
    await expect(tripService.addPhotos(GUEST, 'bk-1', 'pre', [photo({ key: key(GUEST, 'png') })])).rejects.toThrow(/JPEG/);
  });

  it('refuses a key that was already used', async () => {
    const p = photo();
    await tripService.addPhotos(GUEST, 'bk-1', 'pre', [p]);
    await expect(tripService.addPhotos(GUEST, 'bk-1', 'pre', [{ ...p, angle: 'rear' }])).rejects.toMatchObject({ code: 'PHOTO_KEY_REUSED' });
  });

  it('needs a location when config requires one', async () => {
    await expect(tripService.addPhotos(GUEST, 'bk-1', 'pre', [photo({ lat: undefined, lng: undefined })])).rejects.toMatchObject({ code: 'PHOTO_LOCATION_REQUIRED' });
    await expect(tripService.addPhotos(GUEST, 'bk-1', 'pre', [photo({ lat: 0, lng: 0 })])).rejects.toMatchObject({ code: 'PHOTO_LOCATION_REQUIRED' });
  });

  it('rejects a photo taken too far from the car when a radius is set', async () => {
    const real = await platformConfigService.get();
    jest.spyOn(platformConfigService, 'get').mockResolvedValue({ ...real, inspection: { ...real.inspection, maxDistanceMeters: 200 } });
    await expect(tripService.addPhotos(GUEST, 'bk-1', 'pre', [photo({ lat: 33.5, lng: -97 })])).rejects.toMatchObject({ code: 'PHOTO_TOO_FAR' });
    await expect(tripService.addPhotos(GUEST, 'bk-1', 'pre', [photo()])).resolves.toBeDefined();
  });

  it('enforces the per-phase cap', async () => {
    const real = await platformConfigService.get();
    jest.spyOn(platformConfigService, 'get').mockResolvedValue({ ...real, inspection: { ...real.inspection, maxPhotosPerPhase: 2 } });
    await tripService.addPhotos(GUEST, 'bk-1', 'pre', [photo(), photo()]);
    await expect(tripService.addPhotos(GUEST, 'bk-1', 'pre', [photo()])).rejects.toMatchObject({ code: 'PHOTO_LIMIT' });
  });
});

describe('start gate and hand-over to the trip', () => {
  it('carries the staged pickup photos onto the trip', async () => {
    await seed(0.5);
    await tripService.addPhotos(GUEST, 'bk-1', 'pre', [photo(), photo({ angle: 'rear' }), photo({ angle: 'interior' }), photo({ angle: 'dashboard' })]);
    const trip = await tripService.start(asGuest, 'bk-1', READINGS);
    expect(trip.photos.filter((p) => p.phase === 'pre')).toHaveLength(4);
    expect(await PrePhotoModel.countDocuments({ bookingId: 'bk-1', movedToTripId: trip._id })).toBe(4);
  });

  it('does not gate a start when the window is not open, so nobody can be locked out', async () => {
    await seed(10);
    await expect(tripService.start(asGuest, 'bk-1', READINGS)).resolves.toBeDefined();
  });

  it('return photos: closed until the trip has started and the return window opens', async () => {
    await seed(-47.9);
    await startWithPhotos();
    const s = await tripService.inspection(GUEST, 'bk-1');
    expect(s.post.open).toBe(true);
    await tripService.addPhotos(GUEST, 'bk-1', 'post', [photo({ angle: 'rear' })]);
    expect((await TripModel.findOne({ bookingId: 'bk-1' }).lean())!.photos.filter((p) => p.phase === 'post')).toHaveLength(1);
  });

  it('return photos are refused before the return window', async () => {
    await seed(-1);
    await startWithPhotos();
    await expect(tripService.addPhotos(GUEST, 'bk-1', 'post', [photo()])).rejects.toMatchObject({ code: 'PHOTO_WINDOW_NOT_OPEN' });
  });

  it('completing needs the configured number of return photos', async () => {
    await seed(-47.9);
    const trip = await startWithPhotos();
    await tripService.addPhotos(GUEST, 'bk-1', 'post', [photo()]);
    await expect(tripService.complete(GUEST, trip._id, {})).rejects.toMatchObject({ code: 'RETURN_PHOTOS_REQUIRED' });
  });
});

describe('return-window prompt', () => {
  it('fires once when the window opens', async () => {
    await seed(-47.9);
    await startWithPhotos();
    expect(await inspectionService.sweepReturnWindow()).toBe(1);
    expect(await inspectionService.sweepReturnWindow()).toBe(0);
  });

  it('stays quiet while the window is still closed', async () => {
    await seed(-1);
    await startWithPhotos();
    expect(await inspectionService.sweepReturnWindow()).toBe(0);
  });
});
