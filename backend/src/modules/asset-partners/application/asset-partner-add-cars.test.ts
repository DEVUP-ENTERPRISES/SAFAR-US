jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));
jest.mock('../../vehicles/application/fleet-import.service', () => ({
  fleetImportService: {
    importRows: jest.fn(async (_userId: string, rows: { vin: string; registrationNumber?: string }[]) => {
      const { VehicleModel } = jest.requireActual('../../vehicles/infrastructure/vehicle.model');
      const out = [];
      for (const r of rows) {
        // A VIN the decoder can't read comes back failed, as the real import does.
        if (r.vin.startsWith('BAD')) { out.push({ vin: r.vin, status: 'failed', reason: 'We couldn’t read this VIN' }); continue; }
        const v = await VehicleModel.create({
          hostId: 'hf-host', vin: r.vin, registrationNumber: r.registrationNumber, year: 2024, make: 'Toyota', model: 'Camry',
          category: 'economy', status: 'draft', seats: 5, fuelType: 'petrol', transmission: 'automatic', bodyType: 'sedan',
          listing: { title: 'Toyota Camry' }, pricing: { dailyPrice: 6500, currency: 'USD' },
          location: { city: 'Irving', state: 'TX', type: 'Point', coordinates: [-97, 32.8], address: '2400 Aviation Dr, DFW Airport, TX' },
        });
        out.push({ vin: r.vin, status: 'created', vehicleId: v._id });
      }
      return out;
    }),
  },
}));
jest.mock('../../hosts/application/host.service', () => ({
  hostService: { requireHostForUser: jest.fn(async () => ({ _id: 'hf-host' })), getByUserId: jest.fn(async () => null) },
}));

import { assetPartnerCarService } from './asset-partner-car.service';
import { assetPartnerService } from './asset-partner.service';
import { AssetPartnerModel } from '../infrastructure/asset-partner.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { AuditLogModel } from '../../audit/infrastructure/audit-log.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const OP = { userId: 'ops-1', roles: ['fleet_owner'] };
const ADDRESS = '2400 Aviation Dr, DFW Airport, TX';
// Audit entries are written in the background; wait for them rather than racing.
async function eventually<T>(read: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  for (let i = 0; i < 50; i += 1) {
    const v = await read();
    if (ok(v)) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  return read();
}

const vin = (n: number) => `4T1B11HK5KU${String(100000 + n)}`;

async function partner(userId = 'partner-user') {
  return assetPartnerService.enrol({ userId, hostId: `${userId}-host`, partnerType: 'individual', displayName: 'Jordan Ramirez' });
}

async function fleetCar(v: string, over: Record<string, unknown> = {}) {
  return VehicleModel.create({
    hostId: 'hf-host', vin: v, year: 2022, make: 'Honda', model: 'Accord', category: 'economy', status: 'draft', seats: 5,
    fuelType: 'petrol', transmission: 'automatic', bodyType: 'sedan', listing: { title: 'Honda Accord' }, pricing: { dailyPrice: 6000, currency: 'USD' },
    location: { city: 'Irving', state: 'TX', type: 'Point', coordinates: [-97, 32.8], address: ADDRESS },
    ...over,
  });
}

describe('ops adds a partner’s cars', () => {
  it('adds ten cars in one go, each tied to the partner, with an audit entry', async () => {
    const p = await partner();
    const rows = Array.from({ length: 10 }, (_, i) => ({ vin: vin(i), plate: `abc${i}` }));
    const result = await assetPartnerCarService.addCars(OP, p._id, { address: ADDRESS, rows });
    expect(result.filter((r) => r.status === 'added')).toHaveLength(10);
    expect(await VehicleModel.countDocuments({ assetPartnerId: p._id })).toBe(10);
    expect(await eventually(() => AuditLogModel.countDocuments({ action: 'asset_partner.cars.added', resourceId: p._id }), (n) => n === 1)).toBe(1);
  });

  it('reports each problem row and still adds the rest', async () => {
    const p = await partner();
    const other = await partner('other-user');
    await fleetCar(vin(50), { assetPartnerId: other._id });
    await fleetCar(vin(51), { hostId: 'someone-else' });
    await fleetCar(vin(52), { assetPartnerId: p._id });

    const result = await assetPartnerCarService.addCars(OP, p._id, {
      address: ADDRESS,
      rows: [{ vin: 'short' }, { vin: vin(50) }, { vin: vin(51) }, { vin: vin(52) }, { vin: 'BADVIN00000000001' }, { vin: vin(53) }, { vin: vin(53) }],
    });
    const by = Object.fromEntries(result.map((r) => [r.vin, r]));
    expect(by.SHORT.reason).toMatch(/17-character/);
    expect(by[vin(50)].reason).toMatch(/another partner/);
    expect(by[vin(51)].reason).toMatch(/another host/);
    expect(by[vin(52)].status).toBe('already');
    expect(by.BADVIN00000000001.status).toBe('failed');
    expect(by[vin(53)].status).toBe('added');
    expect(result.filter((r) => r.vin === vin(53))).toHaveLength(1);
  });

  it('brings back a car that was returned to the same partner earlier', async () => {
    const p = await partner();
    const car = await fleetCar(vin(60), { assetPartnerId: p._id, assetPartnerEndedAt: new Date('2026-01-01') });
    const [r] = await assetPartnerCarService.addCars(OP, p._id, { rows: [{ vin: vin(60) }] });
    expect(r.status).toBe('added');
    expect((await VehicleModel.findById(car._id).lean())?.assetPartnerEndedAt).toBeUndefined();
  });

  it('needs an address for new cars when the fleet has none, and refuses a paused partner', async () => {
    const p = await partner();
    const [r] = await assetPartnerCarService.addCars(OP, p._id, { rows: [{ vin: vin(70) }] });
    expect(r).toMatchObject({ status: 'failed', reason: expect.stringMatching(/address/) });
    await AssetPartnerModel.updateOne({ _id: p._id }, { status: 'suspended' });
    await expect(assetPartnerCarService.addCars(OP, p._id, { address: ADDRESS, rows: [{ vin: vin(71) }] })).rejects.toThrow('isn’t active');
  });

  it('refuses more than the batch limit', async () => {
    const p = await partner();
    const rows = Array.from({ length: 26 }, (_, i) => ({ vin: vin(i) }));
    await expect(assetPartnerCarService.addCars(OP, p._id, { address: ADDRESS, rows })).rejects.toThrow('up to 25');
  });
});

describe('unlinking a car added by mistake', () => {
  it('unlinks a car with no bookings and records why', async () => {
    const p = await partner();
    const car = await fleetCar(vin(80), { assetPartnerId: p._id, assetPartnerSince: new Date() });
    await assetPartnerCarService.unlink(OP, car._id, 'Wrong partner picked');
    expect((await VehicleModel.findById(car._id).lean())?.assetPartnerId).toBeUndefined();
    expect(await eventually(() => AuditLogModel.findOne({ action: 'asset_partner.car.unlinked' }).lean(), (d) => !!d)).toMatchObject({ reason: 'Wrong partner picked', resourceId: p._id });
  });

  it('refuses once the car has a booking with the partner', async () => {
    const p = await partner();
    const car = await fleetCar(vin(81), { assetPartnerId: p._id, assetPartnerSince: new Date(Date.now() - 86_400_000) });
    await BookingModel.collection.insertOne({ _id: 'b-1', vehicleId: car._id, createdAt: new Date() } as never);
    await expect(assetPartnerCarService.unlink(OP, car._id, 'Wrong partner')).rejects.toThrow('Return to owner');
    expect((await VehicleModel.findById(car._id).lean())?.assetPartnerId).toBe(p._id);
  });
});
