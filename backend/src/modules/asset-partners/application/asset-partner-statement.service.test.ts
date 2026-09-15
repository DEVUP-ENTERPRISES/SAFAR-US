/**
 * Asset Partner statement maths.
 *
 * This is the number a partner is paid on, and it is NOT host earnings: two of
 * the three deductions in the partner agreement are recurring monthly costs
 * per vehicle that a commission rate cannot express. Getting this wrong
 * overstates someone's income, so the arithmetic is pinned here against the
 * terms published on /asset-partners.
 */
import { assetPartnerStatementService } from './asset-partner-statement.service';
import { assetPartnerService } from './asset-partner.service';
import { AssetPartnerModel } from '../infrastructure/asset-partner.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const PERIOD = '2026-08';

async function enrolPartner() {
  return assetPartnerService.enrol({
    userId: 'user-1',
    hostId: 'host-1',
    partnerType: 'individual',
    displayName: 'Jordan Ramirez',
  });
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
    // Onboarded before the period being reported.
    createdAt: new Date(Date.UTC(2026, 0, 1)),
    pricing: { dailyPrice: 9500, currency: 'USD' },
    location: { city: 'Irving', state: 'TX', type: 'Point', coordinates: [-97, 32.8] },
  });
}

/** A completed trip whose gross booking revenue is `gross` minor units. */
async function addCompletedTrip(vehicleId: string, gross: number, endDay = 15) {
  await BookingModel.create({
    code: `T-${Math.random().toString(36).slice(2, 8)}`,
    guestId: 'guest-1',
    hostId: 'host-1',
    vehicleId,
    status: 'completed',
    period: {
      start: new Date(Date.UTC(2026, 7, endDay - 2)),
      end: new Date(Date.UTC(2026, 7, endDay)),
    },
    priceBreakdown: {
      days: 2,
      subtotal: { amount: gross, currency: 'USD' },
      total: { amount: gross, currency: 'USD' },
      currency: 'USD',
    },
  });
}

describe('asset partner statement', () => {
  it('deducts the management fee, insurance and detailing from gross', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-1');
    await addCompletedTrip('veh-1', 200_000); // $2,000 gross

    const s = await assetPartnerStatementService.statement(partner, PERIOD);

    // Published defaults: 20% fee, $137 insurance, $50 detailing.
    expect(s.totals.gross).toBe(200_000);
    expect(s.totals.managementFee).toBe(40_000);
    expect(s.totals.insurance).toBe(13_700);
    expect(s.totals.detailing).toBe(5_000);
    expect(s.totals.net).toBe(200_000 - 40_000 - 13_700 - 5_000); // $1,413
  });

  /*
   * The whole reason this service exists. Host earnings would report
   * gross − fee and stop there, which is $1,600 on a $2,000 month — $187 more
   * than the partner actually receives.
   */
  it('is lower than gross-less-fee, because the recurring costs are real', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-1');
    await addCompletedTrip('veh-1', 200_000);

    const s = await assetPartnerStatementService.statement(partner, PERIOD);
    const grossLessFeeOnly = 200_000 - 40_000;
    expect(s.totals.net).toBeLessThan(grossLessFeeOnly);
    expect(grossLessFeeOnly - s.totals.net).toBe(13_700 + 5_000);
  });

  // Insurance and detailing are incurred by HOLDING the car, not renting it.
  // An idle car really does produce a negative month, and the partner's paper
  // statement shows that — hiding it would misrepresent the agreement.
  it('still charges the monthly costs on a car that earned nothing', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-idle');

    const s = await assetPartnerStatementService.statement(partner, PERIOD);
    expect(s.totals.gross).toBe(0);
    expect(s.totals.trips).toBe(0);
    expect(s.totals.net).toBe(-(13_700 + 5_000));
  });

  it('charges the monthly costs once per vehicle, not once per partner', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-1');
    await addVehicle(partner._id, 'veh-2');

    const s = await assetPartnerStatementService.statement(partner, PERIOD);
    expect(s.lines).toHaveLength(2);
    expect(s.totals.insurance).toBe(2 * 13_700);
    expect(s.totals.detailing).toBe(2 * 5_000);
  });

  it('counts only trips that completed inside the period', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-1');
    await addCompletedTrip('veh-1', 100_000, 15); // August
    await BookingModel.create({
      code: 'T-SEPT',
      guestId: 'guest-1',
      hostId: 'host-1',
      vehicleId: 'veh-1',
      status: 'completed',
      period: { start: new Date(Date.UTC(2026, 8, 2)), end: new Date(Date.UTC(2026, 8, 4)) },
      priceBreakdown: {
        days: 2,
        subtotal: { amount: 999_999, currency: 'USD' },
        total: { amount: 999_999, currency: 'USD' },
        currency: 'USD',
      },
    });

    const s = await assetPartnerStatementService.statement(partner, PERIOD);
    expect(s.totals.trips).toBe(1);
    expect(s.totals.gross).toBe(100_000);
  });

  it('ignores trips that were never completed', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-1');
    await BookingModel.create({
      code: 'T-CANC',
      guestId: 'guest-1',
      hostId: 'host-1',
      vehicleId: 'veh-1',
      status: 'cancelled_guest',
      period: { start: new Date(Date.UTC(2026, 7, 10)), end: new Date(Date.UTC(2026, 7, 12)) },
      priceBreakdown: {
        days: 2,
        subtotal: { amount: 500_000, currency: 'USD' },
        total: { amount: 500_000, currency: 'USD' },
        currency: 'USD',
      },
    });

    const s = await assetPartnerStatementService.statement(partner, PERIOD);
    expect(s.totals.gross).toBe(0);
  });

  it('never counts another partner’s vehicle', async () => {
    const mine = await enrolPartner();
    const theirs = await AssetPartnerModel.create({
      userId: 'user-2',
      hostId: 'host-2',
      partnerType: 'fleet',
      displayName: 'Someone Else',
      terms: {},
    });
    await addVehicle(mine._id, 'veh-mine');
    await addVehicle(theirs._id, 'veh-theirs');
    await addCompletedTrip('veh-theirs', 300_000);

    const s = await assetPartnerStatementService.statement(mine, PERIOD);
    expect(s.lines.map((l) => l.vehicleId)).toEqual(['veh-mine']);
    expect(s.totals.gross).toBe(0);
  });

  it('pays out on the configured day of the FOLLOWING month', async () => {
    const partner = await enrolPartner();
    const s = await assetPartnerStatementService.statement(partner, PERIOD);
    // August's statement is paid on 5 September — "on the 5th, covering trips
    // completed the prior month".
    expect(s.payoutDate.toISOString().slice(0, 10)).toBe('2026-09-05');
    expect(s.payoutMethod).toBe('check');
  });

  it('honours a negotiated fee over the platform default', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-1');
    await addCompletedTrip('veh-1', 200_000);
    // A fleet deal: 15% and no detailing recharge.
    const updated = await assetPartnerService.setTerms(partner._id, {
      managementFeeBps: 1500,
      detailingMonthlyCents: 0,
    });

    const s = await assetPartnerStatementService.statement(updated, PERIOD);
    expect(s.totals.managementFee).toBe(30_000);
    expect(s.totals.detailing).toBe(0);
    expect(s.terms.negotiated).toBe(true);
    // Unstated fields still fall back to the platform default.
    expect(s.totals.insurance).toBe(13_700);
  });

  it('marks a finished month final and the running month not', async () => {
    const partner = await enrolPartner();
    const past = await assetPartnerStatementService.statement(partner, PERIOD);
    expect(past.final).toBe(true);

    const now = new Date();
    const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const current = await assetPartnerStatementService.statement(partner, thisMonth);
    expect(current.final).toBe(false);
  });
});
