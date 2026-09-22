/**
 * revenueBySource against a real in-memory MongoDB — proves the actual
 * bucketing logic (Host vs Asset Partner vs House Fleet), not just that
 * the aggregation runs without throwing.
 */
import { financeReportService } from './finance-report.service';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import { config } from '../../../config';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const money = (cents: number) => ({ amount: cents, currency: 'USD' });

function baseVehicle(overrides: Record<string, unknown>) {
  return {
    make: 'Kia', model: 'K5', year: 2023, bodyType: 'sedan',
    transmission: 'automatic', fuelType: 'petrol', seats: 5,
    location: { coordinates: [-96.8, 32.9] },
    listing: { title: 'Test car' },
    pricing: { dailyPrice: 6000 },
    status: 'listed',
    ...overrides,
  };
}

function baseBooking(overrides: Record<string, unknown>) {
  return {
    code: `CD-${Math.random().toString(36).slice(2, 8)}`,
    guestId: 'guest-1',
    period: { start: new Date('2026-01-01'), end: new Date('2026-01-03') },
    status: 'completed',
    priceBreakdown: {
      days: 2,
      base: money(10000),
      cleaningFee: money(0),
      discount: money(0),
      subtotal: money(10000),
      commission: money(2000),
      tax: money(500),
      hostEarnings: money(8000),
      total: money(12500),
      currency: 'USD',
    },
    ...overrides,
  };
}

describe('revenueBySource', () => {
  it('buckets a plain host booking under Host (self-serve)', async () => {
    await VehicleModel.create(baseVehicle({ _id: 'veh-host', hostId: 'host-plain' }));
    await BookingModel.create(baseBooking({ hostId: 'host-plain', vehicleId: 'veh-host' }));

    const { sources } = await financeReportService.revenueBySource();
    const host = sources.find((s) => s.label === 'Host (self-serve)')!;
    expect(host.trips).toBe(1);
    expect(host.gmv).toBe(12500);
    expect(host.platformRevenue).toBe(2000);
    expect(sources.find((s) => s.label === 'Asset Partners')!.trips).toBe(0);
  });

  it('buckets a booking on an Asset-Partner vehicle under Asset Partners', async () => {
    await VehicleModel.create(baseVehicle({ _id: 'veh-partner', hostId: 'host-of-partner-car', assetPartnerId: 'partner-1' }));
    await BookingModel.create(baseBooking({ hostId: 'host-of-partner-car', vehicleId: 'veh-partner' }));

    const { sources } = await financeReportService.revenueBySource();
    expect(sources.find((s) => s.label === 'Asset Partners')!.trips).toBe(1);
    expect(sources.find((s) => s.label === 'Host (self-serve)')!.trips).toBe(0);
  });

  it('buckets a booking on the House Fleet host under House Fleet', async () => {
    const fleetUser = await UserModel.create({ email: config.houseFleet.email, roles: ['host'] });
    const fleetHost = await HostModel.create({ userId: fleetUser._id, displayName: 'CatoDrive Fleet' });
    await VehicleModel.create(baseVehicle({ _id: 'veh-fleet', hostId: fleetHost._id }));
    await BookingModel.create(baseBooking({ hostId: fleetHost._id, vehicleId: 'veh-fleet' }));

    const { sources } = await financeReportService.revenueBySource();
    expect(sources.find((s) => s.label === 'House Fleet')!.trips).toBe(1);
    expect(sources.find((s) => s.label === 'Host (self-serve)')!.trips).toBe(0);
  });

  it('ignores unpaid bookings', async () => {
    await VehicleModel.create(baseVehicle({ _id: 'veh-pending', hostId: 'host-x' }));
    await BookingModel.create(baseBooking({ hostId: 'host-x', vehicleId: 'veh-pending', status: 'pending_payment' }));

    const { sources } = await financeReportService.revenueBySource();
    expect(sources.every((s) => s.trips === 0)).toBe(true);
  });
});
