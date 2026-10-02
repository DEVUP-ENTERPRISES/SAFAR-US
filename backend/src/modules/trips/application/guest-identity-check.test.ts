import sharp from 'sharp';
import { guestIdentityCheckService } from './guest-identity-check.service';
import { tripService } from './trip.service';
import { adminBookingOverviewService } from '../../bookings/application/admin-booking-overview.service';
import { assertIdentityNotBlocked } from '../../bookings/domain/identity-check';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { TripModel } from '../infrastructure/trip.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { AuditLogModel } from '../../audit/infrastructure/audit-log.model';
import { identityProvider } from '../../kyc/infrastructure/identity.provider';
import * as bus from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

const host = { userId: 'hostUser', roles: ['host'], ip: '1.1.1.1', userAgent: 'jest' };
const staff = { userId: 'staff', roles: ['support'], ip: '2.2.2.2', userAgent: 'jest' };

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.restoreAllMocks();
  jest.spyOn(tripService, 'isHostSideOf').mockImplementation(async (userId) => userId === 'hostUser');
  Object.defineProperty(identityProvider, 'canReadPhotos', { value: true, configurable: true });
  jest.spyOn(identityProvider, 'photo').mockImplementation(async () => sharp({ create: { width: 400, height: 500, channels: 3, background: '#dddddd' } }).jpeg().toBuffer());
});

const seed = async (minutesToPickup: number) => {
  const start = new Date(Date.now() + minutesToPickup * 60_000);
  await UserModel.collection.insertMany([
    { _id: 'guest' as never, firstName: 'Ana', lastName: 'Lopez', email: 'ana@example.com', createdAt: new Date() },
    { _id: 'hostUser' as never, firstName: 'Sam', lastName: 'Host' },
    { _id: 'staff' as never, firstName: 'Riya', lastName: 'Ops' },
  ]);
  await VehicleModel.collection.insertOne({ _id: 'car' as never, year: 2024, make: 'Chevrolet', model: 'Equinox', registrationNumber: 'XXY6879', location: { type: 'Point', coordinates: [-96.8, 32.8], state: 'TX' } });
  await BookingModel.collection.insertOne({
    _id: 'bk' as never, code: 'CD-7', guestId: 'guest', hostId: 'host', vehicleId: 'car', status: 'paid',
    period: { start, end: new Date(start.getTime() + 86_400_000) }, priceBreakdown: { currency: 'USD', total: { amount: 10000, currency: 'USD' } },
  });
  await KycModel.collection.insertOne({
    _id: 'k1' as never, userId: 'guest', level: 'full', status: 'approved', documents: [], provider: 'stripe', providerSessionId: 'vs_1',
    verifiedFirstName: 'ANA', verifiedLastName: 'LOPEZ', verifiedDob: new Date('1995-04-02'), licenceExpiry: new Date('2030-01-01'), decisionAt: new Date(),
  });
};

describe('host sees the guest selfie before pickup', () => {
  it('stays closed until an hour before pickup, then opens with the verified name and age', async () => {
    await seed(120);
    expect(await guestIdentityCheckService.status(host, 'bk')).toMatchObject({ open: false, verified: true, verifiedName: 'ANA LOPEZ', photoAvailable: true });
    await expect(guestIdentityCheckService.open(host, 'bk')).rejects.toThrow(/opens shortly before pickup/);

    await BookingModel.updateOne({ _id: 'bk' }, { $set: { 'period.start': new Date(Date.now() + 30 * 60_000) } });
    const s = await guestIdentityCheckService.status(host, 'bk');
    expect(s.open).toBe(true);
    expect(s.age).toBeGreaterThanOrEqual(30);
  });

  it('serves only to the host, stamped, and hides it again once the trip starts', async () => {
    await seed(30);
    await expect(guestIdentityCheckService.status({ ...host, userId: 'guest' }, 'bk')).rejects.toThrow(/Only the host/);
    const v = await guestIdentityCheckService.open(host, 'bk');
    const f = await guestIdentityCheckService.file(host, 'bk', v.token);
    expect(f.contentType).toBe('image/jpeg');
    const { channels } = await sharp(Buffer.from(f.data, 'base64')).stats();
    expect(channels[0].min).toBeLessThan(200);

    await TripModel.collection.insertOne({ _id: 't' as never, bookingId: 'bk', vehicleId: 'car', guestId: 'guest', hostId: 'host', status: 'active', handover: { at: new Date() } });
    await expect(guestIdentityCheckService.file(host, 'bk', v.token)).rejects.toThrow(/hidden again/);
    await new Promise((r) => setTimeout(r, 50));
    expect(await AuditLogModel.countDocuments({ action: 'guest.selfie.opened', resourceId: 'bk' })).toBe(1);
  });

  it('a mismatch blocks the pickup until staff clear it, and alerts staff', async () => {
    await seed(30);
    const emit = jest.spyOn(bus, 'emit');
    await guestIdentityCheckService.record(host, 'bk', 'mismatch', 'Different person');
    expect(emit.mock.calls.filter(([n]) => n === EVENTS.GUEST_IDENTITY_MISMATCH)).toHaveLength(1);
    const blocked = await BookingModel.findById('bk').lean();
    expect(() => assertIdentityNotBlocked(blocked!)).toThrow(/did not match/);

    await guestIdentityCheckService.clear(staff, 'bk', 'Called the guest, ID checked by video');
    const cleared = await BookingModel.findById('bk').lean();
    expect(() => assertIdentityNotBlocked(cleared!)).not.toThrow();
    await expect(guestIdentityCheckService.clear(staff, 'bk', 'again please')).rejects.toThrow(/no open identity mismatch/);
  });
});

describe('staff view of who booked', () => {
  it('shows the guest and their ID summary without any photo, link or key', async () => {
    await seed(300);
    const o = await adminBookingOverviewService.overview('bk', true);
    expect(o.guest).toMatchObject({ name: 'Ana Lopez', email: 'ana@example.com', tripsCompleted: 0 });
    expect(o.guest.identity).toMatchObject({ status: 'approved', verifiedName: 'ANA LOPEZ', source: 'stripe', photosReadable: true });
    expect(o.vehicle).toMatchObject({ name: '2024 Chevrolet Equinox', plate: 'XXY6879' });
    expect(JSON.stringify(o)).not.toMatch(/vs_1|providerSessionId/);
  });

  it('opens ID photos with a reason, for the staff member only, and audits both', async () => {
    await seed(300);
    const v = await adminBookingOverviewService.openId(staff, 'bk', 'Damage claim on CD-7');
    expect(v.items.map((i) => i.id)).toEqual(['selfie', 'licence_front', 'licence_back']);
    const f = await adminBookingOverviewService.idFile(staff, 'bk', v.token, 'licence_front');
    expect(f.contentType).toBe('image/jpeg');
    await expect(adminBookingOverviewService.idFile({ ...staff, userId: 'other' }, 'bk', v.token, 'selfie')).rejects.toThrow(/closed/);
    await new Promise((r) => setTimeout(r, 50));
    expect(await AuditLogModel.findOne({ action: 'guest.id.opened' }).lean()).toMatchObject({ reason: 'Damage claim on CD-7', actorId: 'staff' });
  });

  it('says plainly when the Stripe read key is missing', async () => {
    await seed(300);
    Object.defineProperty(identityProvider, 'canReadPhotos', { value: false, configurable: true });
    await expect(adminBookingOverviewService.openId(staff, 'bk', 'Damage claim')).rejects.toThrow(/read key/);
  });
});
