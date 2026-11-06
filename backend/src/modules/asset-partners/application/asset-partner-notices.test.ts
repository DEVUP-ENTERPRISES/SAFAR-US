jest.mock('../../payments/infrastructure/gateway.provider', () => ({ paymentGateway: new (jest.requireActual('../../payments/infrastructure/mock.gateway').MockGateway)() }));
jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));

import { assetPartnerNoticeService, type NoticeInput } from './asset-partner-notice.service';
import { assetPartnerStatementService } from './asset-partner-statement.service';
import { assetPartnerService } from './asset-partner.service';
import { AssetPartnerNoticeModel } from '../infrastructure/asset-partner-notice.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { MaintenanceModel } from '../../maintenance/infrastructure/maintenance.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { ViolationModel } from '../../violations/infrastructure/violation.model';
import { violationService } from '../../violations/application/violation.service';
import { LedgerModel } from '../../payments/infrastructure/ledger.model';
import { notificationService } from '../../notifications/application/notification.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});

const DAY = 86_400_000;

async function world() {
  await UserModel.create({ _id: 'ops-1', email: 'fleet@catodrive.test', roles: ['host', 'house_fleet'], status: 'active' });
  const partner = await assetPartnerService.enrol({ userId: 'partner-user', hostId: 'fleet-host', partnerType: 'individual', displayName: 'Syed K.' });
  await VehicleModel.create({
    _id: 'car-1',
    hostId: 'fleet-host',
    assetPartnerId: partner._id,
    year: 2024,
    make: 'GMC',
    model: 'Acadia',
    registrationNumber: 'XBM9662',
    category: 'suv',
    status: 'listed',
    seats: 7,
    fuelType: 'petrol',
    transmission: 'automatic',
    bodyType: 'suv',
    listing: { title: 'GMC Acadia' },
    createdAt: new Date(Date.UTC(2026, 0, 1)),
    pricing: { dailyPrice: 9000, currency: 'USD' },
    location: { city: 'Irving', state: 'TX', type: 'Point', coordinates: [-97, 32.8] },
  });
  return partner;
}

async function trip(id: string, start: string, end: string, status = 'completed') {
  await BookingModel.collection.insertOne({
    _id: id as never,
    code: `CD-${id.toUpperCase()}`,
    guestId: `guest-${id}`,
    hostId: 'fleet-host',
    vehicleId: 'car-1',
    status,
    period: { start: new Date(start), end: new Date(end) },
    priceBreakdown: { currency: 'USD', subtotal: { amount: 30_000, currency: 'USD' } },
    deletedAt: null,
  });
}

const notice = (over: Partial<NoticeInput> = {}): NoticeInput => ({
  vehicleId: 'car-1',
  type: 'toll',
  issuedBy: 'Harris County Toll Road Authority',
  noticeRef: '012682284602',
  occurredDate: new Date(Date.now() - 20 * DAY).toISOString().slice(0, 10),
  amountCents: 3_480,
  paidByPartner: false,
  evidence: [{ url: 'https://files.example/notice.jpg', key: 'notice/partner-user/a.jpg', kind: 'image' }],
  ...over,
});

describe('tolls and tickets a partner receives by post', () => {
  it('matches a notice to the trip that had the car and tells that guest, once', async () => {
    await world();
    const at = new Date(Date.now() - 20 * DAY);
    await trip('a', new Date(at.getTime() - DAY).toISOString(), new Date(at.getTime() + DAY).toISOString());
    const n = await assetPartnerNoticeService.upload('partner-user', notice({ occurredAt: at }));
    expect(n).toMatchObject({ status: 'matched', bookingId: 'a' });
    const v = await ViolationModel.findById(n.violationId).lean();
    expect(v).toMatchObject({ guestId: 'guest-a', amount: 3_480, partnerNoticeId: n._id, status: 'reported' });
    expect(notificationService.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'guest-a', templateKey: 'violation.reported' }));
    await expect(assetPartnerNoticeService.upload('partner-user', notice({ occurredAt: at }))).rejects.toThrow('already sent us this notice');
  });

  it('a date-only notice matches the trip on that local day; two trips or none go to ops', async () => {
    await world();
    await trip('day', '2026-10-03T15:00:00Z', '2026-10-05T15:00:00Z');
    const one = await assetPartnerNoticeService.upload('partner-user', notice({ noticeRef: 'P-1', occurredDate: '2026-10-04' }));
    expect(one.status).toBe('matched');

    await trip('am', '2026-10-10T13:00:00Z', '2026-10-10T17:00:00Z');
    await trip('pm', '2026-10-10T19:00:00Z', '2026-10-11T02:00:00Z');
    const two = await assetPartnerNoticeService.upload('partner-user', notice({ noticeRef: 'P-2', occurredDate: '2026-10-10' }));
    expect(two).toMatchObject({ status: 'needs_review', reviewReason: 'several_trips' });
    expect(two.candidateBookingIds.sort()).toEqual(['am', 'pm']);
    expect(notificationService.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'ops-1', templateKey: 'asset_partner.notice_review' }));

    const assigned = await assetPartnerNoticeService.assign(two._id, 'pm', 'ops-1');
    expect(assigned).toMatchObject({ status: 'matched', bookingId: 'pm' });

    const none = await assetPartnerNoticeService.upload('partner-user', notice({ noticeRef: 'P-3', occurredDate: '2026-10-20' }));
    expect(none).toMatchObject({ status: 'needs_review', reviewReason: 'no_trip' });
  });

  it('a notice too old to charge the guest goes to ops instead', async () => {
    await world();
    const end = new Date(Date.now() - 200 * DAY);
    await trip('old', new Date(end.getTime() - 2 * DAY).toISOString(), end.toISOString());
    const n = await assetPartnerNoticeService.upload('partner-user', notice({ occurredAt: new Date(end.getTime() - DAY), occurredDate: new Date(end.getTime() - DAY).toISOString().slice(0, 10) }));
    expect(n).toMatchObject({ status: 'needs_review', reviewReason: 'too_late' });
    expect(await ViolationModel.countDocuments()).toBe(0);
  });

  it('pays the partner back for a notice they paid that CatoDrive takes on, and not for one it rejects', async () => {
    const partner = await world();
    const period = new Date().toISOString().slice(0, 7);
    const paid = await assetPartnerNoticeService.upload('partner-user', notice({ noticeRef: 'R-1', paidByPartner: true, amountCents: 10_000 }));
    await assetPartnerNoticeService.absorb(paid._id, 'ops-1', 'Car was with our captain for a delivery');
    const wrong = await assetPartnerNoticeService.upload('partner-user', notice({ noticeRef: 'R-2', paidByPartner: true, amountCents: 5_000 }));
    await expect(assetPartnerNoticeService.reject(wrong._id, 'ops-1', ' ')).rejects.toThrow('Add a short note');
    await assetPartnerNoticeService.reject(wrong._id, 'ops-1', 'Plate on the notice is a different car');

    const s = await assetPartnerStatementService.statement(partner, period);
    expect(s.totals.noticeRefunds).toBe(10_000);
    expect((await AssetPartnerNoticeModel.findById(wrong._id).lean())!.status).toBe('rejected');
  });
});

describe('repairs on the partner statement', () => {
  it('charges finished, approved repairs in their month and caps a damage repair at the deductible', async () => {
    const partner = await world();
    const terms = await assetPartnerService.termsFor(partner);
    const inMonth = new Date('2026-08-12T12:00:00Z');
    const base = { vehicleId: 'car-1', hostId: 'fleet-host', assetPartnerId: partner._id, scheduledFor: inMonth, status: 'completed' };
    await MaintenanceModel.create([
      { ...base, type: 'repair', cost: 30_000, approval: 'not_required', completedAt: inMonth },
      { ...base, type: 'repair', cost: terms.deductibleCapCents + 150_000, approval: 'approved', damageIncident: true, completedAt: inMonth },
      { ...base, type: 'repair', cost: 90_000, approval: 'declined', completedAt: inMonth },
      { ...base, type: 'cleaning', cost: 4_000, approval: 'not_required', completedAt: inMonth },
      { ...base, type: 'service', cost: 20_000, approval: 'not_required' },
      { ...base, type: 'repair', cost: 70_000, approval: 'approved', completedAt: new Date('2026-09-02T12:00:00Z') },
    ]);
    const s = await assetPartnerStatementService.statement(partner, '2026-08');
    expect(s.totals.repairs).toBe(30_000 + terms.deductibleCapCents);
    expect(s.lines[0].repairs).toBe(30_000 + terms.deductibleCapCents);
    expect(s.totals.net).toBe(s.lines[0].net);
  });
});

describe('charging a citation', () => {
  it('never marks a citation charged unless the guest’s card actually paid', async () => {
    await world();
    const at = new Date(Date.now() - 10 * DAY);
    await trip('c', new Date(at.getTime() - DAY).toISOString(), new Date(at.getTime() + DAY).toISOString());
    const n = await assetPartnerNoticeService.upload('partner-user', notice({ noticeRef: 'C-1', occurredAt: at }));
    const after = await violationService.charge('ops-1', n.violationId!);
    expect(after.status).toBe('charge_failed');
    expect(after.collected).toBeUndefined();
    expect(await LedgerModel.countDocuments({ refType: 'violation' })).toBe(0);
  });
});
