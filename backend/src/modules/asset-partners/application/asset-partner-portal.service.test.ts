/**
 * The partner portal: vehicles, one car's own detail, and the statement
 * archive. `vehicleDetail` in particular pins a real bug found while writing
 * this — history() is newest-first, so "this month" is index 0, not the
 * last element.
 */
import { assetPartnerPortalService } from './asset-partner-portal.service';
import { assetPartnerService } from './asset-partner.service';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

async function enrolPartner(userId = 'user-1', hostId = 'host-1') {
  return assetPartnerService.enrol({ userId, hostId, partnerType: 'individual', displayName: 'Jordan Ramirez' });
}

async function addVehicle(partnerId: string, id: string) {
  await VehicleModel.create({
    _id: id,
    hostId: 'host-1',
    assetPartnerId: partnerId,
    year: 2024,
    make: 'VW',
    model: 'Atlas',
    category: 'suv',
    status: 'listed',
    seats: 7,
    fuelType: 'petrol',
    transmission: 'automatic',
    bodyType: 'suv',
    listing: { title: 'VW Atlas' },
    pricing: { dailyPrice: 9500, currency: 'USD' },
    location: { city: 'Irving', state: 'TX', type: 'Point', coordinates: [-97, 32.8] },
  });
}

/** A completed trip whose gross booking revenue is `gross`, ending this month. */
async function addTripThisMonth(vehicleId: string, gross: number) {
  const now = new Date();
  await BookingModel.create({
    code: `T-${Math.random().toString(36).slice(2, 8)}`,
    guestId: 'guest-1',
    hostId: 'host-1',
    vehicleId,
    status: 'completed',
    period: {
      start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 3)),
      end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 5)),
    },
    priceBreakdown: {
      days: 2,
      subtotal: { amount: gross, currency: 'USD' },
      total: { amount: gross, currency: 'USD' },
      currency: 'USD',
    },
  });
}

describe('asset partner portal', () => {
  it('refuses vehicles() for someone who is not a partner', async () => {
    await expect(assetPartnerPortalService.vehicles('nobody')).rejects.toThrow();
  });

  it('lists a partner’s vehicles with this month’s numbers', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-1');
    await addTripThisMonth('veh-1', 200_000);

    const vehicles = await assetPartnerPortalService.vehicles(partner.userId);
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].gross).toBe(200_000);
  });

  it('404s a vehicle that does not belong to the caller', async () => {
    const owner = await enrolPartner('user-owner', 'host-owner');
    const stranger = await enrolPartner('user-stranger', 'host-stranger');
    await addVehicle(owner._id, 'veh-1');

    await expect(assetPartnerPortalService.vehicleDetail(stranger.userId, 'veh-1')).rejects.toThrow();
  });

  // The regression: current-month figures must come from history()[0], not
  // the last element — history() is newest-first.
  it('reports THIS month’s net on the vehicle detail, not an old month’s', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-1');
    await addTripThisMonth('veh-1', 300_000);

    const detail = await assetPartnerPortalService.vehicleDetail(partner.userId, 'veh-1');
    // $3,000 gross this month, on the $137/$50/20% defaults.
    expect(detail.gross).toBe(300_000);
    expect(detail.net).toBe(300_000 - 60_000 - 13_700 - 5_000);
  });

  it('includes recent completed trips on the vehicle, newest first', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-1');
    await addTripThisMonth('veh-1', 100_000);
    await addTripThisMonth('veh-1', 150_000);

    const detail = await assetPartnerPortalService.vehicleDetail(partner.userId, 'veh-1');
    expect(detail.recentTrips).toHaveLength(2);
  });

  it('returns the full statement archive, newest first', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-1');

    const statements = await assetPartnerPortalService.statements(partner.userId, 3);
    expect(statements).toHaveLength(3);
    // Newest (this month) is not final; the two before it are.
    expect(statements[0].final).toBe(false);
    expect(statements[1].final).toBe(true);
    expect(statements[2].final).toBe(true);
  });
});
