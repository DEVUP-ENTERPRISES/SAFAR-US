jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));
jest.mock('../../notifications/application/notify-house-fleet', () => ({ notifyHouseFleet: jest.fn(async () => undefined) }));
jest.mock('../../payments/application/payment.service', () => ({ paymentService: { refundBooking: jest.fn(async () => undefined), cancelAuthorization: jest.fn(async () => undefined) } }));

import { accountActionService } from './account-action.service';
import { UserModel } from '../infrastructure/user.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { DeviceModel, DenyEntryModel } from '../../risk/infrastructure/risk.models';
import { riskService } from '../../risk/application/risk.service';
import { paymentService } from '../../payments/application/payment.service';
import { notificationService } from '../../notifications/application/notification.service';
import { notifyHouseFleet } from '../../notifications/application/notify-house-fleet';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});

const DAY = 86_400_000;
const STAFF = 'staff-1';

async function guestWithBookings() {
  const u = await UserModel.create({ email: 'bad@example.com', phone: '+12145550100', firstName: 'Bad', roles: ['guest'], status: 'active' });
  const id = String(u._id);
  const mk = (code: string, status: string, startInDays: number) => BookingModel.create({
    code, guestId: id, hostId: 'host-1', vehicleId: 'veh-1', status,
    period: { start: new Date(Date.now() + startInDays * DAY), end: new Date(Date.now() + (startInDays + 2) * DAY) },
    priceBreakdown: { days: 2, currency: 'USD', total: { amount: 20000, currency: 'USD' } },
    cancellationPolicy: 'flexible',
  });
  await mk('TURA-UP1', 'paid', 3);
  await mk('TURA-LIVE', 'in_progress', -1);
  await KycModel.create({ userId: id, status: 'approved', licenceNumberHash: 'lic-hash-1' });
  await DeviceModel.create({ fingerprint: 'fp-1', userIds: [id] });
  return id;
}

describe('account actions', () => {
  it('needs a reason, and never restricts the main admin', async () => {
    const id = await guestWithBookings();
    await expect(accountActionService.apply(id, 'suspended', 'no', STAFF)).rejects.toThrow('reason');
    const admin = await UserModel.create({ email: 'boss@example.com', roles: ['super_admin'], status: 'active' });
    await expect(accountActionService.apply(String(admin._id), 'banned', 'testing the guard', STAFF)).rejects.toThrow('main admin');
  });

  it('suspending records who and why, keeps bookings but sends them to ops, and tells the person', async () => {
    const id = await guestWithBookings();
    const r = await accountActionService.apply(id, 'suspended', 'Reported reckless driving', STAFF);
    expect(r).toMatchObject({ flaggedBookings: ['TURA-UP1'], inProgress: ['TURA-LIVE'], cancelledBookings: [] });
    expect(await UserModel.findById(id).lean()).toMatchObject({ status: 'suspended', statusReason: 'Reported reckless driving', statusChangedBy: STAFF });
    expect((await BookingModel.findOne({ code: 'TURA-UP1' }).lean())?.status).toBe('paid');
    expect(notificationService.send).toHaveBeenCalledWith(expect.objectContaining({ userId: id, title: 'Your CatoDrive account is suspended' }));
    expect(notifyHouseFleet).toHaveBeenCalled();
  });

  it('banning cancels upcoming bookings with a full refund and blocks the identity from coming back', async () => {
    const id = await guestWithBookings();
    const r = await accountActionService.apply(id, 'banned', 'Licence belongs to someone else', STAFF, { blockIdentity: true });
    expect(r.cancelledBookings).toEqual(['TURA-UP1']);
    expect(paymentService.refundBooking).toHaveBeenCalledWith(expect.any(String), { amount: 20000, currency: 'USD' }, expect.stringContaining('Account closed'));
    expect((await BookingModel.findOne({ code: 'TURA-UP1' }).lean())?.status).toBe('cancelled_system');
    expect(r.identityBlocked).toEqual(expect.arrayContaining(['email', 'phone', 'licence', '1 device']));
    expect(await riskService.isDenied('bad@example.com')).toBe(true);
    expect(await DenyEntryModel.exists({ type: 'licence', valueHash: 'kyc:lic-hash-1' })).toBeTruthy();
    expect((await DeviceModel.findOne({ fingerprint: 'fp-1' }).lean())?.blocked).toBe(true);
  });

  it('a new account with the banned licence is flagged as deny-listed', async () => {
    const id = await guestWithBookings();
    await accountActionService.apply(id, 'banned', 'Fraudulent identity', STAFF, { blockIdentity: true });
    const fresh = await UserModel.create({ email: 'new@example.com', roles: ['guest'], status: 'active' });
    await KycModel.create({ userId: String(fresh._id), status: 'approved', licenceNumberHash: 'lic-hash-1' });
    const risk = await riskService.evaluate({ userId: String(fresh._id), context: 'booking' } as never);
    expect(risk.signals.map((s: { signal: string }) => s.signal)).toContain('blacklisted');
    expect(risk.band).toBe('block');
  });
});
