jest.mock('../payments/infrastructure/gateway.provider', () => ({ paymentGateway: new (jest.requireActual('../payments/infrastructure/mock.gateway').MockGateway)() }));

import { connectTestDb, clearTestDb, disconnectTestDb } from '../../testing/mongo';
import { startTestApi, tokenFor, type TestApi } from '../../testing/http';
import { seedUser, seedHost, seedVehicle, seedBooking } from '../../testing/fixtures';
import { TripModel } from '../trips/infrastructure/trip.model';
import { BookingModel } from './infrastructure/booking.model';

let api: TestApi;
beforeAll(async () => {
  await connectTestDb();
  api = await startTestApi();
});
afterAll(async () => {
  await api.close();
  await disconnectTestDb();
});
beforeEach(clearTestDb);

async function world(over: Record<string, unknown> = {}) {
  const guestId = await seedUser();
  const host = await seedHost();
  const vehicleId = await seedVehicle(host.hostId);
  const bookingId = await seedBooking(guestId, host.hostId, vehicleId, over);
  const otherHost = await seedHost();
  return {
    guestId, host, vehicleId, bookingId,
    guest: await tokenFor(guestId),
    hostTok: await tokenFor(host.userId, ['guest', 'host']),
    stranger: await tokenFor(await seedUser()),
    otherHostTok: await tokenFor(otherHost.userId, ['guest', 'host']),
  };
}

const ROUTE_LIST: [string, string, unknown?][] = [
  ['GET', ''],
  ['GET', '/receipts'],
  ['GET', '/cancellation-preview'],
  ['GET', '/extension-preview?newEnd=2027-01-10T10:00:00Z'],
  ['POST', '/cancel', { reason: 'test' }],
  ['GET', '/change-options'],
  ['GET', '/switch-options'],
  ['POST', '/pickup-code'],
  ['GET', '/rebooking-options'],
  ['GET', '/shorten-preview?newEnd=2027-01-10T10:00:00Z'],
  ['GET', '/drivers'],
  ['GET', '/tracking'],
  ['POST', '/payment-session'],
  ['POST', '/deposit-session'],
  ['POST', '/extend', { newEnd: '2027-01-10T10:00:00Z' }],
  ['POST', '/shorten', { newEnd: '2027-01-10T10:00:00Z' }],
  ['POST', '/no-show', { party: 'host' }],
  ['POST', '/on-my-way'],
];
// Every row needs three values: jest treats a missing third argument as a done callback and waits.
const BOOKING_ROUTES = ROUTE_LIST.map(([m, p, b]) => [m, p, b ?? null] as [string, string, unknown]);

describe('nobody but the guest, their host and staff can touch a booking', () => {
  it.each(BOOKING_ROUTES)('A %s /bookings/:id%s refuses a stranger', async (method, suffix, body) => {
    const w = await world();
    const r = await api.call(method, `/bookings/${w.bookingId}${suffix}`, { token: w.stranger, body: body ?? undefined });
    expect([403, 404]).toContain(r.status);
  });

  it.each(BOOKING_ROUTES)('B %s /bookings/:id%s refuses a host who does not own the car', async (method, suffix, body) => {
    const w = await world();
    const r = await api.call(method, `/bookings/${w.bookingId}${suffix}`, { token: w.otherHostTok, body: body ?? undefined });
    expect([403, 404]).toContain(r.status);
  });

  it('C the booking is untouched after every refused attempt', async () => {
    const w = await world();
    for (const [method, suffix, body] of BOOKING_ROUTES) await api.call(method, `/bookings/${w.bookingId}${suffix}`, { token: w.stranger, body: body ?? undefined });
    expect((await BookingModel.findById(w.bookingId).lean())?.status).toBe('paid');
  });
});

describe('trip screens are private too', () => {
  const TRIP_ROUTES: [string, string][] = [
    ['GET', '/trips/booking/:b/inspection'],
    ['GET', '/trips/booking/:b/documents'],
    ['GET', '/trips/booking/:b/guest-photo'],
    ['GET', '/trips/:t'],
    ['POST', '/trips/:t/sos'],
    ['POST', '/trips/:t/complete'],
  ];
  it.each(TRIP_ROUTES)('T %s %s refuses a stranger', async (method, path) => {
    const w = await world({ status: 'in_progress' });
    const trip = await TripModel.create({ bookingId: w.bookingId, vehicleId: w.vehicleId, guestId: w.guestId, hostId: w.host.hostId, status: 'active' });
    const r = await api.call(method, path.replace(':b', w.bookingId).replace(':t', String(trip._id)), { token: w.stranger, body: method === 'GET' ? undefined : {} });
    expect([403, 404]).toContain(r.status);
  });
});

describe('guest rules on their own booking', () => {
  it('G1 the guest sees their own booking', async () => {
    const w = await world();
    expect((await api.call('GET', `/bookings/${w.bookingId}`, { token: w.guest })).status).toBe(200);
  });

  it('G2 the guest’s list holds only their bookings', async () => {
    const w = await world();
    const mine = await api.call<{ _id: string }[]>('GET', '/bookings', { token: w.guest });
    expect(mine.body.data?.map((b) => b._id)).toEqual([w.bookingId]);
    expect((await api.call<unknown[]>('GET', '/bookings', { token: w.stranger })).body.data).toHaveLength(0);
  });

  it('G3 a guest cannot approve or decline their own request', async () => {
    const w = await world({ status: 'pending_approval' });
    expect([403, 404]).toContain((await api.call('POST', `/bookings/${w.bookingId}/confirm`, { token: w.guest })).status);
    expect([403, 404]).toContain((await api.call('POST', `/bookings/${w.bookingId}/decline`, { token: w.guest })).status);
  });

  it('G4 a guest cannot report themselves as a no-show', async () => {
    const w = await world();
    expect((await api.call('POST', `/bookings/${w.bookingId}/no-show`, { token: w.guest, body: { party: 'guest' } })).status).toBe(403);
  });

  it('G5 only the guest gets the pickup code, not the host', async () => {
    const w = await world({ status: 'confirmed' });
    expect((await api.call('POST', `/bookings/${w.bookingId}/pickup-code`, { token: w.hostTok })).status).toBe(403);
  });

  it('G6 a cancelled booking cannot be cancelled again', async () => {
    const w = await world({ status: 'cancelled_guest' });
    expect((await api.call('POST', `/bookings/${w.bookingId}/cancel`, { token: w.guest, body: { reason: 'again' } })).status).toBe(409);
  });

  it('G7 a booking that does not exist is a 404, not a crash', async () => {
    const w = await world();
    expect((await api.call('GET', '/bookings/does-not-exist', { token: w.guest })).status).toBe(404);
  });

  it('G8 the host view never exposes the pickup code hash', async () => {
    const w = await world({ pickupCodeHash: 'secret-hash' });
    const r = await api.call<Record<string, unknown>>('GET', `/bookings/${w.bookingId}`, { token: w.hostTok });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body.data)).not.toContain('secret-hash');
  });

  it('G9 signed-out callers cannot list or open bookings', async () => {
    const w = await world();
    expect((await api.call('GET', '/bookings')).status).toBe(401);
    expect((await api.call('GET', `/bookings/${w.bookingId}`)).status).toBe(401);
  });
});

describe('quotes', () => {
  it('Q1 a car that does not exist is a 404', async () => {
    const r = await api.call('POST', '/bookings/quote', { body: { vehicleId: 'nope', start: '2027-01-10T10:00:00Z', end: '2027-01-12T10:00:00Z' } });
    expect(r.status).toBe(404);
  });

  it('Q2 an end before the start is refused', async () => {
    const { hostId } = await seedHost();
    const v = await seedVehicle(hostId);
    const r = await api.call('POST', '/bookings/quote', { body: { vehicleId: v, start: '2027-01-12T10:00:00Z', end: '2027-01-10T10:00:00Z' } });
    expect([409, 422]).toContain(r.status);
  });

  it('Q3 a start in the past is refused', async () => {
    const { hostId } = await seedHost();
    const v = await seedVehicle(hostId);
    const r = await api.call('POST', '/bookings/quote', { body: { vehicleId: v, start: '2020-01-10T10:00:00Z', end: '2020-01-12T10:00:00Z' } });
    expect([409, 422]).toContain(r.status);
  });

  it('Q4 a signed-out visitor gets a price but no price lock', async () => {
    const { hostId } = await seedHost();
    const v = await seedVehicle(hostId);
    const start = new Date(Date.now() + 5 * 86_400_000);
    const r = await api.call<{ total: { amount: number }; priceLock?: unknown }>('POST', '/bookings/quote', { body: { vehicleId: v, start: start.toISOString(), end: new Date(start.getTime() + 2 * 86_400_000).toISOString() } });
    expect(r.status).toBe(200);
    expect(r.body.data?.total.amount).toBeGreaterThan(0);
    expect(r.body.data?.priceLock).toBeUndefined();
  });

  it('Q5 an unlisted car cannot be quoted', async () => {
    const { hostId } = await seedHost();
    const v = await seedVehicle(hostId, { status: 'draft' });
    const start = new Date(Date.now() + 5 * 86_400_000);
    const r = await api.call('POST', '/bookings/quote', { body: { vehicleId: v, start: start.toISOString(), end: new Date(start.getTime() + 2 * 86_400_000).toISOString() } });
    expect([404, 409]).toContain(r.status);
  });
});

describe('car pages', () => {
  it('V1 the public car page never shows the VIN or plate', async () => {
    const { hostId } = await seedHost();
    const v = await seedVehicle(hostId, { vin: '1HGCM82633A004352', registrationNumber: 'ABC123' });
    const r = await api.call<Record<string, unknown>>('GET', `/vehicles/${v}`);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body.data)).not.toContain('1HGCM82633A004352');
    expect(JSON.stringify(r.body.data)).not.toContain('ABC123');
  });

  it('V2b the guest who booked a car still sees it after it is unlisted', async () => {
    const { hostId } = await seedHost();
    const v = await seedVehicle(hostId, { status: 'unlisted' });
    const guest = await seedUser();
    await seedBooking(guest, hostId, v, { status: 'completed' });
    expect((await api.call('GET', `/vehicles/${v}`, { token: await tokenFor(guest) })).status).toBe(200);
  });

  it('V2 a draft car is not visible to a stranger', async () => {
    const { hostId } = await seedHost();
    const v = await seedVehicle(hostId, { status: 'draft' });
    expect([403, 404]).toContain((await api.call('GET', `/vehicles/${v}`, { token: await tokenFor(await seedUser()) })).status);
  });

  it('V3 a guest cannot edit or delist someone else’s car', async () => {
    const { hostId } = await seedHost();
    const v = await seedVehicle(hostId);
    const tok = await tokenFor(await seedUser());
    expect([403, 404]).toContain((await api.call('PATCH', `/vehicles/${v}`, { token: tok, body: { listing: { title: 'Mine now' } } })).status);
    expect([403, 404]).toContain((await api.call('POST', `/vehicles/${v}/status`, { token: tok, body: { status: 'unlisted' } })).status);
  });
});

describe('favorites', () => {
  it('F1 a guest saves and removes a car', async () => {
    const { hostId } = await seedHost();
    const v = await seedVehicle(hostId);
    const tok = await tokenFor(await seedUser());
    expect([200, 201]).toContain((await api.call('POST', '/favorites', { token: tok, body: { vehicleId: v } })).status);
    expect((await api.call<string[]>('GET', '/favorites/ids', { token: tok })).body.data).toEqual([v]);
    expect((await api.call('DELETE', `/favorites/${v}`, { token: tok })).status).toBe(200);
    expect((await api.call<string[]>('GET', '/favorites/ids', { token: tok })).body.data).toEqual([]);
  });

  it('F2 saving the same car twice keeps one favorite', async () => {
    const { hostId } = await seedHost();
    const v = await seedVehicle(hostId);
    const tok = await tokenFor(await seedUser());
    await api.call('POST', '/favorites', { token: tok, body: { vehicleId: v } });
    await api.call('POST', '/favorites', { token: tok, body: { vehicleId: v } });
    expect((await api.call<string[]>('GET', '/favorites/ids', { token: tok })).body.data).toEqual([v]);
  });

  it('F3 a car that does not exist cannot be saved', async () => {
    const tok = await tokenFor(await seedUser());
    expect([404, 422]).toContain((await api.call('POST', '/favorites', { token: tok, body: { vehicleId: 'nope' } })).status);
  });
});
