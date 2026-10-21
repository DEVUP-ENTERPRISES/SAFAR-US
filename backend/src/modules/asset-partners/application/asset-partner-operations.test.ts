jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));
jest.mock('../../vehicles/application/fleet-import.service', () => ({
  fleetImportService: {
    importRows: jest.fn(async (_userId: string, rows: { vin: string; registrationNumber?: string }[]) => {
      const { VehicleModel } = jest.requireActual('../../vehicles/infrastructure/vehicle.model');
      const v = await VehicleModel.create({
        hostId: 'hf-host', vin: rows[0].vin, registrationNumber: rows[0].registrationNumber, year: 2024, make: 'BMW', model: '5 Series',
        category: 'luxury', status: 'draft', seats: 5, fuelType: 'petrol', transmission: 'automatic', bodyType: 'sedan',
        listing: { title: 'BMW 5 Series' }, pricing: { dailyPrice: 9500, currency: 'USD' },
        location: { city: 'Irving', state: 'TX', type: 'Point', coordinates: [-97, 32.8], address: '2400 Aviation Dr, DFW Airport, TX' },
      });
      return [{ vin: rows[0].vin, status: 'created', vehicleId: v._id }];
    }),
  },
}));
jest.mock('../../hosts/application/host.service', () => ({
  hostService: { requireHostForUser: jest.fn(async () => ({ _id: 'hf-host' })), getByUserId: jest.fn(async () => null) },
}));

import { assetPartnerCarService } from './asset-partner-car.service';
import { assetPartnerPayoutService } from './asset-partner-payout.service';
import { assetPartnerIntakeService, addBusinessDays, intakeStatus } from './asset-partner-intake.service';
import { assetPartnerService } from './asset-partner.service';
import { assetPartnerStatementService } from './asset-partner-statement.service';
import { AssetPartnerApplicationModel } from '../infrastructure/asset-partner-application.model';
import { AssetPartnerModel } from '../infrastructure/asset-partner.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { notificationService } from '../../notifications/application/notification.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});

const OPS = 'house-fleet-user';

async function partner() {
  return assetPartnerService.enrol({ userId: 'partner-user', hostId: 'partner-host', partnerType: 'individual', displayName: 'Jordan Ramirez' });
}

async function approvedApplication(partnerId: string, over: Record<string, unknown> = {}) {
  return AssetPartnerApplicationModel.create({
    reference: `CD-AP-${Math.floor(Math.random() * 1e6)}`, status: 'approved', kind: 'vehicle', partnerId, submittedByUserId: 'partner-user',
    fullName: 'Jordan Ramirez', partnerType: 'individual', email: 'jordan@example.com', phone: '2145550142', address: '1 Main St', city: 'Dallas', state: 'TX', zip: '75201',
    vehicle: { year: '2024', make: 'BMW', model: '5 Series', mileage: 18_400, vin: 'WBA53BJ09RWX12345', plate: 'LUX7' },
    ownership: 'owned', hadAccident: false, smokeFree: true, petFree: true,
    photos: [{ url: 'https://cdn.example.com/front.jpg', key: 'vehicle_photo/2026/10/u/front.jpg', label: 'Front' }],
    insurance: { carrier: 'State Farm', policyNumber: 'SF-1', coverageType: 'full' }, availability: 'fulltime',
    acknowledgedAccurate: true, acknowledgedInspection: true, acknowledgedTerms: true, signature: 'Jordan Ramirez', signedAt: new Date(),
    ...over,
  });
}

describe('approved car to listing', () => {
  it('creates a draft on the fleet tagged to the partner, once', async () => {
    const p = await partner();
    const app = await approvedApplication(p._id);
    await expect(assetPartnerCarService.createListing(app._id, OPS)).rejects.toThrow('Enter the address');
    const first = await assetPartnerCarService.createListing(app._id, OPS, { address: '2400 Aviation Dr, DFW Airport, TX' });
    expect(first.created).toBe(true);
    const car = await VehicleModel.findById(first.vehicleId).lean();
    expect(car).toMatchObject({ hostId: 'hf-host', assetPartnerId: p._id });
    expect(car?.photos?.[0]).toMatchObject({ url: 'https://cdn.example.com/front.jpg', isCover: true });
    expect((await AssetPartnerApplicationModel.findById(app._id).lean())?.vehicleId).toBe(first.vehicleId);

    const again = await assetPartnerCarService.createListing(app._id, OPS);
    expect(again).toEqual({ vehicleId: first.vehicleId, created: false });
    expect(await VehicleModel.countDocuments({})).toBe(1);
  });

  it('refuses an application that is not approved', async () => {
    const p = await partner();
    const app = await approvedApplication(p._id, { status: 'submitted' });
    await expect(assetPartnerCarService.createListing(app._id, OPS)).rejects.toThrow('Approve the application first');
  });
});

describe('monthly payouts', () => {
  async function partnerWithEarnings() {
    const p = await partner();
    await VehicleModel.create({
      _id: 'veh-1', hostId: 'hf-host', assetPartnerId: p._id, year: 2024, make: 'VW', model: 'Atlas', category: 'suv', status: 'listed', seats: 7,
      fuelType: 'petrol', transmission: 'automatic', bodyType: 'suv', listing: { title: 'VW Atlas' }, createdAt: new Date(Date.UTC(2026, 0, 1)),
      pricing: { dailyPrice: 9500, currency: 'USD' }, location: { city: 'Irving', state: 'TX', type: 'Point', coordinates: [-97, 32.8] },
    });
    await BookingModel.create({
      code: 'T-1', guestId: 'g', hostId: 'hf-host', vehicleId: 'veh-1', status: 'completed',
      period: { start: new Date(Date.UTC(2026, 7, 10)), end: new Date(Date.UTC(2026, 7, 12)) },
      priceBreakdown: { days: 2, subtotal: { amount: 200_000, currency: 'USD' }, total: { amount: 200_000, currency: 'USD' }, currency: 'USD' },
    });
    return p;
  }

  it('lists what each partner is owed, records the payment once, and shows it on their statement', async () => {
    const p = await partnerWithEarnings();
    const net = (await assetPartnerStatementService.statement(p, '2026-08')).totals.net;
    expect(net).toBeGreaterThan(0);

    const before = await assetPartnerPayoutService.month('2026-08');
    expect(before.rows).toHaveLength(1);
    expect(before.rows[0]).toMatchObject({ partnerId: p._id, net, paid: undefined });
    expect(before.totals).toMatchObject({ due: net, paid: 0, unpaid: net });

    await expect(assetPartnerPayoutService.record(OPS, { partnerId: p._id, period: '2026-08', amount: net + 1, method: 'zelle', reference: 'ZL-1' })).rejects.toThrow('more than');
    await assetPartnerPayoutService.record(OPS, { partnerId: p._id, period: '2026-08', amount: net, method: 'zelle', reference: 'ZL-1' });
    await expect(assetPartnerPayoutService.record(OPS, { partnerId: p._id, period: '2026-08', amount: net, method: 'zelle', reference: 'ZL-2' })).rejects.toThrow('already recorded');
    expect(notificationService.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'partner-user', templateKey: 'account.asset_partner_payout_sent' }));

    const after = await assetPartnerPayoutService.month('2026-08');
    expect(after.totals.unpaid).toBe(0);
    expect((await assetPartnerStatementService.statement(p, '2026-08')).paid).toMatchObject({ amount: net, method: 'zelle', reference: 'ZL-1' });
  });

  it('will not pay a month that has not ended or owes nothing', async () => {
    const p = await partner();
    const now = new Date();
    const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    await expect(assetPartnerPayoutService.month(thisMonth)).rejects.toThrow('once it has ended');
    await expect(assetPartnerPayoutService.record(OPS, { partnerId: p._id, period: '2026-08', amount: 100, method: 'check', reference: '1001' })).rejects.toThrow('Nothing is owed');
  });
});

describe('intake report (Exhibit A)', () => {
  const INPUT = {
    vehicle: { year: '2024', make: 'BMW', model: '5 Series', trim: '530i', color: 'Black', vin: 'wba53bj09rwx12345', plate: 'lux7' },
    odometer: 18_420, intakeDate: new Date('2026-10-20T15:00:00Z'), location: 'DFW Airport lot C', fuelLevel: 'full' as const,
    preExistingDamage: 'Small scratch on the rear bumper', signedName: 'Syed Ali Iqbal', signedTitle: 'CEO',
  };

  it('counts the objection window in business days', () => {
    expect(addBusinessDays(new Date('2026-10-23T12:00:00Z'), 3).toISOString().slice(0, 10)).toBe('2026-10-28');
    const doc = { catodriveSignature: { signedAt: new Date('2026-10-23T12:00:00Z') } } as never;
    expect(intakeStatus(doc, 3, new Date('2026-10-27T12:00:00Z')).status).toBe('awaiting_partner');
    expect(intakeStatus(doc, 3, new Date('2026-10-29T12:00:00Z')).status).toBe('deemed_accepted');
  });

  it('is signed by CatoDrive, then acknowledged once by the partner, with a PDF either way', async () => {
    const p = await partner();
    const draft = await assetPartnerIntakeService.draftFor(p._id);
    expect(draft).toEqual({});
    const app = await approvedApplication(p._id);
    expect(await assetPartnerIntakeService.draftFor(p._id, app._id)).toMatchObject({ applicationId: app._id, odometer: 18_400, vehicle: { vin: 'WBA53BJ09RWX12345' } });

    const intake = await assetPartnerIntakeService.create(p._id, OPS, INPUT);
    expect(intake).toMatchObject({ status: 'awaiting_partner', vehicle: { vin: 'WBA53BJ09RWX12345', plate: 'LUX7' } });
    expect(notificationService.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'partner-user', templateKey: 'account.asset_partner_intake_ready' }));

    const full = (await AssetPartnerModel.findById(p._id).lean())!;
    await expect(assetPartnerIntakeService.respond(full, intake._id, { kind: 'objected', objection: 'short' })).rejects.toThrow('what is wrong');
    const ack = await assetPartnerIntakeService.respond(full, intake._id, { kind: 'acknowledged', signedName: 'Jordan Ramirez' }, '203.0.113.9');
    expect(ack).toMatchObject({ status: 'acknowledged', partnerResponse: { signedName: 'Jordan Ramirez', ip: '203.0.113.9' } });
    await expect(assetPartnerIntakeService.respond(full, intake._id, { kind: 'objected', objection: 'The scratch is not mine at all' })).rejects.toThrow('no longer be changed');

    const pdf = await assetPartnerIntakeService.pdf(p._id, intake._id);
    expect(pdf.pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.filename).toBe('CatoDrive-Intake-Report-WBA53BJ09RWX12345.pdf');
    await expect(assetPartnerIntakeService.pdf('another-partner', intake._id)).rejects.toThrow();
  });
});
