jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));
jest.mock('../../hosts/application/host.service', () => ({
  hostService: { requireHostForUser: jest.fn(async () => ({ _id: 'hf-host' })), getByUserId: jest.fn(async () => null) },
}));
jest.mock('../../vehicles/application/vehicle.service', () => ({
  vehicleService: {
    delist: jest.fn(async (_userId: string, vehicleId: string) => {
      const { VehicleModel } = jest.requireActual('../../vehicles/infrastructure/vehicle.model');
      await VehicleModel.updateOne({ _id: vehicleId }, { status: 'delisted' });
    }),
  },
}));

import { assetPartnerCarService } from './asset-partner-car.service';
import { assetPartnerPortfolioService } from './asset-partner-portfolio.service';
import { assetPartnerMaintenanceService } from './asset-partner-maintenance.service';
import { assetPartnerService } from './asset-partner.service';
import { assetPartnerStatementService } from './asset-partner-statement.service';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});

const OPS = 'house-fleet-user';

async function car(id: string, over: Record<string, unknown> = {}) {
  return VehicleModel.create({
    _id: id, hostId: 'hf-host', year: 2024, make: 'VW', model: 'Atlas', category: 'suv', status: 'listed', seats: 7, registrationNumber: `P-${id}`,
    fuelType: 'petrol', transmission: 'automatic', bodyType: 'suv', listing: { title: 'VW Atlas' }, createdAt: new Date(Date.UTC(2026, 0, 1)),
    pricing: { dailyPrice: 9500, currency: 'USD' }, location: { city: 'Irving', state: 'TX', type: 'Point', coordinates: [-97, 32.8] },
    ...over,
  });
}

async function trip(vehicleId: string, endDay: Date, subtotal: number) {
  await BookingModel.create({
    code: `T-${Math.random()}`, guestId: 'g', hostId: 'hf-host', vehicleId, status: 'completed',
    period: { start: new Date(endDay.getTime() - 2 * 86_400_000), end: endDay },
    priceBreakdown: { days: 2, subtotal: { amount: subtotal, currency: 'USD' }, total: { amount: subtotal, currency: 'USD' }, currency: 'USD' },
  });
}

async function activePartner(name = 'Jordan Ramirez', userId = 'partner-user') {
  const p = await assetPartnerService.enrol({ userId, hostId: `${userId}-host`, partnerType: 'individual', displayName: name });
  return assetPartnerService.transition(p._id, 'active');
}

describe('recording who owns a fleet car', () => {
  it('links an unowned fleet car to a partner from today, and only to one partner', async () => {
    const a = await activePartner();
    const b = await activePartner('Chen Family Trust', 'other-user');
    await car('veh-1');

    expect((await assetPartnerPortfolioService.unassigned(OPS)).map((c) => c.vehicleId)).toEqual(['veh-1']);
    await assetPartnerCarService.assign(OPS, 'veh-1', a._id);
    const linked = await VehicleModel.findById('veh-1').lean();
    expect(linked?.assetPartnerId).toBe(a._id);
    expect(linked?.assetPartnerSince).toBeInstanceOf(Date);
    expect(await assetPartnerPortfolioService.unassigned(OPS)).toEqual([]);

    await expect(assetPartnerCarService.assign(OPS, 'veh-1', b._id)).rejects.toThrow('another partner');
  });

  it('refuses a car outside the House Fleet and a partner who has left', async () => {
    const p = await activePartner();
    await car('veh-x', { hostId: 'someone-else' });
    await expect(assetPartnerCarService.assign(OPS, 'veh-x', p._id)).rejects.toThrow();
    await car('veh-2');
    await assetPartnerService.transition(p._id, 'exited');
    await expect(assetPartnerCarService.assign(OPS, 'veh-2', p._id)).rejects.toThrow('isn’t active');
  });
});

describe('a car going back to its owner', () => {
  it('comes off the marketplace and is charged only for the months it was in the programme', async () => {
    const p = await activePartner();
    await car('veh-1', { assetPartnerId: p._id, assetPartnerSince: new Date(Date.UTC(2026, 6, 15)) });

    expect((await assetPartnerStatementService.statement(p, '2026-06')).lines).toHaveLength(0);
    expect((await assetPartnerStatementService.statement(p, '2026-07')).lines).toHaveLength(1);

    await assetPartnerCarService.end(OPS, 'veh-1');
    const ended = await VehicleModel.findById('veh-1').lean();
    expect(ended?.status).toBe('delisted');
    expect(ended?.assetPartnerEndedAt).toBeInstanceOf(Date);

    await VehicleModel.updateOne({ _id: 'veh-1' }, { assetPartnerEndedAt: new Date(Date.UTC(2026, 7, 20)) });
    expect((await assetPartnerStatementService.statement(p, '2026-08')).lines).toHaveLength(1);
    expect((await assetPartnerStatementService.statement(p, '2026-09')).lines).toHaveLength(0);
  });

  it('refuses a car that is not a partner car', async () => {
    await car('veh-1');
    await expect(assetPartnerCarService.end(OPS, 'veh-1')).rejects.toThrow('isn’t a partner car');
  });
});

describe('portfolio', () => {
  it('shows each car with its owner, price, fee and the month’s money matching the partner’s statement', async () => {
    const p = await activePartner();
    await car('veh-1', { assetPartnerId: p._id });
    await car('veh-2', { assetPartnerId: p._id, make: 'BMW', model: 'X5' });
    await car('veh-3');
    await trip('veh-1', new Date(Date.UTC(2026, 7, 12)), 200_000);
    await assetPartnerMaintenanceService.create({ vehicleId: 'veh-2', type: 'repair', scheduledFor: new Date(), costCents: 90_000 });

    const cars = await assetPartnerPortfolioService.cars('2026-08');
    expect(cars.map((c) => c.vehicleId).sort()).toEqual(['veh-1', 'veh-2']);
    const atlas = cars.find((c) => c.vehicleId === 'veh-1')!;
    expect(atlas).toMatchObject({ partnerName: 'Jordan Ramirez', dailyPrice: 9500, managementFeeBps: 2000, plate: 'P-veh-1', pendingRepairs: 0 });
    expect(atlas.month).toMatchObject({ trips: 1, gross: 200_000, managementFee: 40_000 });
    expect(cars.find((c) => c.vehicleId === 'veh-2')!.pendingRepairs).toBe(1);

    const statement = await assetPartnerStatementService.statement(p, '2026-08');
    const overview = await assetPartnerPortfolioService.overview('2026-08');
    expect(overview.month).toMatchObject({ trips: 1, gross: 200_000, managementFee: 40_000, partnerNet: statement.totals.net });
    expect(overview.cars).toEqual({ inProgramme: 2, listed: 2, returned: 0 });
    expect(overview.partners.active).toBe(1);
    expect(overview.todo.repairsAwaitingPartner).toBe(1);
    expect(overview.todo.lastMonth).toBe('2026-07');
  });

  it('lists every partner repair with the car and owner named', async () => {
    const p = await activePartner();
    await car('veh-1', { assetPartnerId: p._id });
    await assetPartnerMaintenanceService.create({ vehicleId: 'veh-1', type: 'service', scheduledFor: new Date(), costCents: 10_000 });
    await assetPartnerMaintenanceService.create({ vehicleId: 'veh-1', type: 'repair', scheduledFor: new Date(), costCents: 90_000 });

    const pending = await assetPartnerMaintenanceService.listAll({ approval: 'pending' });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ vehicleLabel: '2024 VW Atlas', partnerName: 'Jordan Ramirez', cost: 90_000 });
    expect(await assetPartnerMaintenanceService.listAll()).toHaveLength(2);
  });
});
