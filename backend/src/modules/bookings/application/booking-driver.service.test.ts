jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));
jest.mock('../../notifications/infrastructure/channel.providers', () => ({ channelProviders: { email: { send: jest.fn(async () => ({ ok: true })) } } }));
jest.mock('../../payments/application/payment.service', () => ({ paymentService: { chargeGuest: jest.fn(async () => true), refundCharge: jest.fn(async () => undefined) } }));

import { bookingDriverService } from './booking-driver.service';
import { BookingDriverModel } from '../infrastructure/booking-driver.model';
import { BookingModel } from '../infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { paymentService } from '../../payments/application/payment.service';
import { channelProviders } from '../../notifications/infrastructure/channel.providers';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});

const charge = paymentService.chargeGuest as jest.Mock;
const refund = paymentService.refundCharge as jest.Mock;
const email = channelProviders.email.send as jest.Mock;
const DAY = 86_400_000;

async function setup(opts: { enabled?: boolean; startsInDays?: number } = {}) {
  const cfg = await platformConfigService.get();
  await platformConfigService.update({ booking: { ...cfg.booking, additionalDriversEnabled: opts.enabled ?? true, additionalDriverFeeCents: 1500, maxAdditionalDrivers: 2, additionalDriverDeadlineHours: 24 } }, 'test');
  const guest = await UserModel.create({ email: 'guest@example.com', firstName: 'Jordan', roles: ['guest'], status: 'active' });
  const driver = await UserModel.create({ email: 'sam@example.com', firstName: 'Sam', roles: ['guest'], status: 'active' });
  await VehicleModel.create({
    _id: 'veh-1', hostId: 'host-1', year: 2024, make: 'BMW', model: 'X5', category: 'suv', status: 'listed', seats: 5, fuelType: 'petrol', transmission: 'automatic',
    bodyType: 'suv', listing: { title: 'BMW X5' }, pricing: { dailyPrice: 15000, currency: 'USD' }, location: { city: 'Dallas', state: 'TX', type: 'Point', coordinates: [-96.8, 32.8] },
  });
  const start = new Date(Date.now() + (opts.startsInDays ?? 5) * DAY);
  const booking = await BookingModel.create({
    code: 'T-DRV1', guestId: String(guest._id), hostId: 'host-1', vehicleId: 'veh-1', status: 'confirmed', period: { start, end: new Date(start.getTime() + 3 * DAY) },
    priceBreakdown: { days: 3, subtotal: { amount: 45000, currency: 'USD' }, total: { amount: 45000, currency: 'USD' }, currency: 'USD' },
  });
  return { guestId: String(guest._id), driverId: String(driver._id), bookingId: String(booking._id), start };
}

const approveId = (userId: string, over: Record<string, unknown> = {}) =>
  KycModel.create({ userId, status: 'approved', licenceExpiry: new Date(Date.now() + 365 * DAY), verifiedDob: new Date('1990-01-01'), ...over });

async function invite(guestId: string, bookingId: string) {
  await bookingDriverService.invite(guestId, bookingId, { name: 'Sam Lee', email: 'Sam@Example.com' });
  await new Promise((r) => setTimeout(r, 50));
  const token = (email.mock.calls[0][0].deepLink as string).split('/').pop()!;
  return token;
}

describe('extra drivers', () => {
  it('invites by email, approves after the ID check, then charges the guest once', async () => {
    const { guestId, driverId, bookingId } = await setup();
    const token = await invite(guestId, bookingId);
    await new Promise((r) => setTimeout(r, 30));
    expect(email.mock.calls[0][0]).toMatchObject({ target: { email: 'sam@example.com' }, title: 'Jordan added you as a driver on CatoDrive' });
    expect(await BookingDriverModel.findOne({ bookingId }).lean()).not.toHaveProperty('token');

    const first = await bookingDriverService.accept(driverId, token);
    expect(first.status).toBe('verifying');
    expect(first.needs.length).toBeGreaterThan(0);
    expect(charge).not.toHaveBeenCalled();

    await approveId(driverId);
    await bookingDriverService.onIdentityApproved(driverId);
    const d = await BookingDriverModel.findOne({ bookingId }).lean();
    expect(d).toMatchObject({ status: 'approved', active: true });
    expect(charge).toHaveBeenCalledTimes(1);
    expect(charge).toHaveBeenCalledWith(expect.objectContaining({ guestId, amount: 1500, idempotencyKey: `charge_driver_${d!._id}` }));
    expect((await BookingModel.findById(bookingId).lean())?.additionalDrivers?.map((x) => x.name)).toEqual(['Sam Lee']);

    await bookingDriverService.check(driverId, token);
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it('refunds the fee when the driver is removed before pickup', async () => {
    const { guestId, driverId, bookingId } = await setup();
    await approveId(driverId);
    const token = await invite(guestId, bookingId);
    await bookingDriverService.accept(driverId, token);
    const d = await BookingDriverModel.findOne({ bookingId }).lean();
    const out = await bookingDriverService.remove(guestId, bookingId, d!._id);
    expect(out.status).toBe('removed');
    expect(out.refundedAt).toBeDefined();
    expect(refund).toHaveBeenCalledWith(bookingId, `driver_${d!._id}`, 'card', 1500);
    expect((await BookingModel.findById(bookingId).lean())?.additionalDrivers).toEqual([]);
  });

  it('declines an expired license with no charge, allows one retry, and frees the slot after', async () => {
    const { guestId, driverId, bookingId } = await setup();
    await approveId(driverId, { licenceExpiry: new Date(Date.now() + 2 * DAY) });
    const token = await invite(guestId, bookingId);
    const r = await bookingDriverService.accept(driverId, token);
    expect(r).toMatchObject({ status: 'declined', canRetry: true });
    expect(r.declineReasons?.[0]).toMatch(/expires before this trip ends/);
    expect(charge).not.toHaveBeenCalled();

    const again = await bookingDriverService.check(driverId, token);
    expect(again).toMatchObject({ status: 'declined', canRetry: false });
    expect((await BookingDriverModel.findOne({ bookingId }).lean())?.active).toBe(false);
    await expect(bookingDriverService.check(driverId, token)).rejects.toThrow('can’t be tried again');
  });

  it('keeps the driver waiting for payment when the guest’s card fails, then pays on retry', async () => {
    const { guestId, driverId, bookingId } = await setup();
    await approveId(driverId);
    charge.mockResolvedValueOnce(false);
    const token = await invite(guestId, bookingId);
    expect((await bookingDriverService.accept(driverId, token)).status).toBe('payment_failed');
    const d = await BookingDriverModel.findOne({ bookingId }).lean();
    expect((await bookingDriverService.retryPayment(guestId, bookingId, d!._id)).status).toBe('approved');
  });

  it('enforces the switch, the deadline, the limit, ownership and the guest’s own email', async () => {
    const off = await setup({ enabled: false });
    await expect(bookingDriverService.invite(off.guestId, off.bookingId, { name: 'Sam', email: 'sam@example.com' })).rejects.toThrow('aren’t available');
    await clearTestDb();

    const late = await setup({ startsInDays: 0.5 });
    await expect(bookingDriverService.invite(late.guestId, late.bookingId, { name: 'Sam', email: 'sam@example.com' })).rejects.toThrow('24 hours before pickup');
    await clearTestDb();

    const s = await setup();
    await expect(bookingDriverService.invite(s.driverId, s.bookingId, { name: 'Sam', email: 'x@example.com' })).rejects.toThrow('Only the guest');
    await expect(bookingDriverService.invite(s.guestId, s.bookingId, { name: 'Me', email: 'GUEST@example.com' })).rejects.toThrow('your email');
    await bookingDriverService.invite(s.guestId, s.bookingId, { name: 'A', email: 'a@example.com' });
    await expect(bookingDriverService.invite(s.guestId, s.bookingId, { name: 'A again', email: 'a@example.com' })).rejects.toThrow('already on the trip');
    await bookingDriverService.invite(s.guestId, s.bookingId, { name: 'B', email: 'b@example.com' });
    await expect(bookingDriverService.invite(s.guestId, s.bookingId, { name: 'C', email: 'c@example.com' })).rejects.toThrow('can’t add more');
  });

  it('lets only one account take an invite, and never the guest', async () => {
    const { guestId, driverId, bookingId } = await setup();
    const token = await invite(guestId, bookingId);
    await expect(bookingDriverService.accept(guestId, token)).rejects.toThrow('already the driver');
    await bookingDriverService.accept(driverId, token);
    const other = await UserModel.create({ email: 'other@example.com', roles: ['guest'], status: 'active' });
    await expect(bookingDriverService.accept(String(other._id), token)).rejects.toThrow('another account');
    expect((await bookingDriverService.preview(token, String(other._id))).yours).toBe(false);
  });

  it('refunds every driver when the trip is cancelled, and expires invites at pickup', async () => {
    const { guestId, driverId, bookingId, start } = await setup();
    await approveId(driverId);
    const token = await invite(guestId, bookingId);
    await bookingDriverService.accept(driverId, token);
    await bookingDriverService.invite(guestId, bookingId, { name: 'Pat', email: 'pat@example.com' });
    expect(await bookingDriverService.sweep(new Date(start.getTime() + 1000))).toBe(1);

    await bookingDriverService.onBookingCancelled(bookingId);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(await BookingDriverModel.countDocuments({ bookingId, active: true })).toBe(0);
    await expect(bookingDriverService.preview(token)).rejects.toThrow('no longer valid');
  });
});
