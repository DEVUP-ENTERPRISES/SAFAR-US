import { parseNttaStatement, centralTime } from '../domain/ntta-statement';
import { tollService } from './toll.service';
import { TollTransactionModel } from '../infrastructure/toll.model';
import { credentialVault } from '../infrastructure/credential-vault';
import { config } from '../../../config';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { TripModel } from '../../trips/infrastructure/trip.model';
import { incidentalsService } from '../../bookings/application/incidentals.service';
import { notificationService } from '../../notifications/application/notification.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

// The NTTA export exactly as the fleet account downloads it (tab-separated).
const STATEMENT = [
  'Posted Date/Time\tTransaction Entry Date/Time\tTransaction Exit Date/Time\tTransaction ID\tLocation\tTollTag ID\tPlate\tTransaction Type\tTransaction Description\tBalance Before\tTransaction Amount\tBalance After\tDAL Unit ID\tDFW Unit ID',
  '09/30/2026 11:26:43\t09/30/2026 10:51:44\t09/30/2026 10:51:44\t9292073011\tPresident George Bush Turnpike - Frankford Main Lane Gantry  - PGBT-MLP8-08\tNTTA0004347679\tTX - WDT9577\tTOLL\tTotal Amount charged for the transaction ($1.55)\t$1,112.98\t-$1.55\t$1,111.43\t\t',
  '09/30/2026 11:09:29\t09/30/2026 10:42:25\t09/30/2026 10:42:25\t9292006285\tPresident George Bush Turnpike - Shiloh Main Lane Gantry  - PGBT-MLP6-09\tNTTA0004347679\tTX - WDT9577\tTOLL\tTotal Amount charged for the transaction ($1.54)\t$1,114.52\t-$1.54\t$1,112.98\t\t',
  '09/30/2026 09:00:00\t09/30/2026 09:00:00\t09/30/2026 09:00:00\t9291000000\tPayment\t\t\tPAYMENT\tAuto-replenish\t$1,000.00\t$150.00\t$1,150.00\t\t',
].join('\n');

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.restoreAllMocks();
});

describe('reading an NTTA statement', () => {
  it('reads each toll with its Texas time, place, tag, plate and amount, and skips payments', () => {
    const r = parseNttaStatement(STATEMENT);
    expect(r.skipped).toBe(1);
    expect(r.errors).toEqual([]);
    expect(r.tolls).toHaveLength(2);
    expect(r.tolls[0]).toMatchObject({
      externalId: '9292073011',
      tagId: 'NTTA0004347679',
      plate: 'WDT9577',
      plateState: 'TX',
      amountCents: 155,
      location: 'President George Bush Turnpike - Frankford Main Lane Gantry - PGBT-MLP8-08',
    });
    // 10:51:44 in Dallas on 30 Sep (daylight time, UTC−5) is 15:51:44 UTC.
    expect(r.tolls[0].occurredAt.toISOString()).toBe('2026-09-30T15:51:44.000Z');
  });

  it('handles winter time and comma-separated exports too', () => {
    expect(centralTime('01/15/2026 08:00:00')!.toISOString()).toBe('2026-01-15T14:00:00.000Z');
    const csv = 'Transaction ID,Transaction Entry Date/Time,Plate,Transaction Type,Transaction Amount,Location\n"123","01/15/2026 08:00:00","TX - ABC 123","TOLL","-$2.10","Dallas North Tollway, Main"';
    expect(parseNttaStatement(csv).tolls[0]).toMatchObject({ externalId: '123', plate: 'ABC123', amountCents: 210, location: 'Dallas North Tollway, Main' });
  });

  it('explains a paste with no header', () => {
    expect(parseNttaStatement('just some text').errors[0].reason).toMatch(/header/);
  });
});

describe('matching and billing tolls', () => {
  const tripStart = new Date('2026-09-30T13:00:00Z');
  const tripEnd = new Date('2026-10-01T13:00:00Z');

  const seed = async (status = 'completed') => {
    await VehicleModel.collection.insertOne({ _id: 'car' as never, registrationNumber: 'wdt 9577', deletedAt: null });
    await BookingModel.collection.insertOne({
      _id: 'bk' as never, code: 'CD-1', guestId: 'guest', hostId: 'host', vehicleId: 'car', status,
      period: { start: tripStart, end: tripEnd }, priceBreakdown: { currency: 'USD', total: { amount: 10000, currency: 'USD' } },
    });
    await TripModel.collection.insertOne({ _id: 'trip' as never, bookingId: 'bk', vehicleId: 'car', status: 'completed', handover: { at: tripStart }, return: { at: tripEnd } });
  };

  it('matches tolls to the trip by plate, never stores one twice, and keeps tolls outside a trip as the fleet’s', async () => {
    await seed();
    const first = await tollService.importNtta(STATEMENT, 'staff');
    expect(first).toMatchObject({ read: 2, added: 2, matched: 2, duplicates: 0, skipped: 1 });
    expect(await tollService.importNtta(STATEMENT, 'staff')).toMatchObject({ added: 0, duplicates: 2 });

    const outside = STATEMENT.split('\n').slice(0, 2).join('\n').replace('9292073011', '9999').replace(/09\/30\/2026 10:51:44/g, '09/20/2026 10:51:44');
    expect(await tollService.importNtta(outside, 'staff')).toMatchObject({ added: 1, noTrip: 1 });
  });

  it('flags a toll on a car it doesn’t know, and matches it once staff pick the car', async () => {
    await seed();
    await tollService.importNtta(STATEMENT.replace(/WDT9577/g, 'ZZZ0000'), 'staff');
    const [t] = await tollService.list({ status: 'unknown_car' });
    expect(t).toBeDefined();
    expect((await tollService.assign(t._id, 'car')).status).toBe('matched');
  });

  it('bills a finished trip once, with the fee once, and tells the guest each toll', async () => {
    await seed();
    await tollService.importNtta(STATEMENT, 'staff');
    const real = await platformConfigService.get();
    jest.spyOn(platformConfigService, 'get').mockResolvedValue({ ...real, tolls: { ...real.tolls, feeCents: 500 } });
    const charge = jest.spyOn(incidentalsService, 'charge').mockResolvedValue({
      total: 809,
      items: [{ id: 'inc-1', type: 'toll', amount: 309, collected: true }, { id: 'inc-2', type: 'other', amount: 500, collected: true }],
    });
    const send = jest.spyOn(notificationService, 'send').mockResolvedValue(undefined as never);

    expect(await tollService.bill('bk')).toEqual({ billed: 2, totalCents: 809, collected: true });
    expect(charge).toHaveBeenCalledWith('bk', [
      { type: 'toll', amount: 309, note: '2 tolls (NTTA) during your trip' },
      { type: 'other', amount: 500, note: 'Toll processing fee' },
    ], 'system', { notify: false });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'guest', templateKey: 'booking.tolls_charged', title: 'Tolls from your trip: $8.09' }));
    expect(await TollTransactionModel.countDocuments({ status: 'billed', incidentalId: 'inc-1' })).toBe(2);
    expect(await tollService.bill('bk')).toBeNull();
  });

  it('does not bill a trip that is still running', async () => {
    await seed('in_progress');
    await tollService.importNtta(STATEMENT, 'staff');
    const charge = jest.spyOn(incidentalsService, 'charge');
    expect(await tollService.bill('bk')).toBeNull();
    expect(charge).not.toHaveBeenCalled();
  });
});

describe('saved toll logins', () => {
  it('seals a login so the stored value never contains it, and opens it again', () => {
    const before = config.tolls.credentialsKey;
    (config.tolls as { credentialsKey?: string }).credentialsKey = 'a'.repeat(64);
    try {
      const sealed = credentialVault.seal('secret-password');
      expect(JSON.stringify(sealed)).not.toContain('secret-password');
      expect(credentialVault.open(sealed)).toBe('secret-password');
    } finally {
      (config.tolls as { credentialsKey?: string }).credentialsKey = before;
    }
  });
});
