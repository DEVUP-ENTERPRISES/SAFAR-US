jest.mock('../payments/infrastructure/gateway.provider', () => ({ paymentGateway: new (jest.requireActual('../payments/infrastructure/mock.gateway').MockGateway)() }));

import { connectTestDb, clearTestDb, disconnectTestDb } from '../../testing/mongo';
import { startTestApi, tokenFor, type TestApi } from '../../testing/http';
import { seedUser, seedHost, seedVehicle, seedBooking } from '../../testing/fixtures';
import { ReviewModel } from './infrastructure/review.model';
import { VehicleModel } from '../vehicles/infrastructure/vehicle.model';

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

const DAY = 86_400_000;
const finished = (end: Date) => ({ status: 'completed', period: { start: new Date(end.getTime() - 2 * DAY), end }, statusHistory: [{ from: 'in_progress', to: 'completed', at: end, by: 'system' }] });

async function world(completedDaysAgo = 1, status = 'completed') {
  const guestId = await seedUser();
  const host = await seedHost();
  const vehicleId = await seedVehicle(host.hostId);
  const end = new Date(Date.now() - completedDaysAgo * DAY);
  const bookingId = await seedBooking(guestId, host.hostId, vehicleId, status === 'completed' ? finished(end) : { status });
  return { guestId, host, vehicleId, bookingId, guest: await tokenFor(guestId), hostTok: await tokenFor(host.userId, ['guest', 'host']) };
}

describe('reviews', () => {
  it('R1 a guest reviews a finished trip; it stays hidden until the host writes', async () => {
    const w = await world();
    const r = await api.call<{ status: string }>('POST', '/reviews', { token: w.guest, body: { bookingId: w.bookingId, rating: 5, comment: 'Great' } });
    expect(r.status).toBe(201);
    expect(r.body.data?.status).toBe('pending');
    expect((await api.call<unknown[]>('GET', `/reviews?subjectId=${w.host.hostId}`)).body.data).toHaveLength(0);
  });

  it('R2 both reviews publish together and the car rating updates', async () => {
    const w = await world();
    await api.call('POST', '/reviews', { token: w.guest, body: { bookingId: w.bookingId, rating: 4 } });
    await api.call('POST', '/reviews', { token: w.hostTok, body: { bookingId: w.bookingId, rating: 5 } });
    expect(await ReviewModel.countDocuments({ status: 'published' })).toBe(2);
    expect((await VehicleModel.findById(w.vehicleId).lean())?.ratingAvg).toBe(4);
  });

  it('R3 the other side’s pending review is redacted', async () => {
    const w = await world();
    await api.call('POST', '/reviews', { token: w.hostTok, body: { bookingId: w.bookingId, rating: 1, comment: 'secret' } });
    const r = await api.call<{ rating?: number; comment?: string; pending?: boolean }[]>('GET', `/reviews/booking/${w.bookingId}`, { token: w.guest });
    expect(r.body.data?.[0]).toMatchObject({ pending: true });
    expect(r.body.data?.[0].rating).toBeUndefined();
    expect(r.body.data?.[0].comment).toBeUndefined();
  });

  it('R4 a trip that has not finished cannot be reviewed', async () => {
    const w = await world(1, 'paid');
    expect((await api.call('POST', '/reviews', { token: w.guest, body: { bookingId: w.bookingId, rating: 5 } })).status).toBe(409);
  });

  it('R5 one review per side', async () => {
    const w = await world();
    await api.call('POST', '/reviews', { token: w.guest, body: { bookingId: w.bookingId, rating: 5 } });
    expect((await api.call('POST', '/reviews', { token: w.guest, body: { bookingId: w.bookingId, rating: 1 } })).status).toBe(409);
  });

  it('R6 a stranger cannot review a booking', async () => {
    const w = await world();
    const other = await tokenFor(await seedUser());
    expect((await api.call('POST', '/reviews', { token: other, body: { bookingId: w.bookingId, rating: 1 } })).status).toBe(403);
  });

  it('R7 ratings outside 1 to 5, or decimals, are refused', async () => {
    const w = await world();
    for (const rating of [0, 6, 4.5]) {
      expect((await api.call('POST', '/reviews', { token: w.guest, body: { bookingId: w.bookingId, rating } })).status).toBe(422);
    }
  });

  it('R8 reviews close after the window, so a late review cannot answer a released one', async () => {
    const w = await world(60);
    const r = await api.call('POST', '/reviews', { token: w.guest, body: { bookingId: w.bookingId, rating: 1 } });
    expect(r.status).toBe(409);
    expect(r.body.error?.code).toBe('REVIEW_WINDOW_CLOSED');
  });

  it('R9 listing reviews needs a subject', async () => {
    expect((await api.call('GET', '/reviews')).status).toBe(422);
    expect((await api.call('GET', '/reviews/distribution')).status).toBe(422);
  });

  it('R10 a deleted review stops counting toward the car rating', async () => {
    const w = await world();
    await api.call('POST', '/reviews', { token: w.guest, body: { bookingId: w.bookingId, rating: 1 } });
    await api.call('POST', '/reviews', { token: w.hostTok, body: { bookingId: w.bookingId, rating: 5 } });
    await ReviewModel.updateOne({ direction: 'guest_to_host' }, { deletedAt: new Date() });
    const second = await seedBooking(w.guestId, w.host.hostId, w.vehicleId, finished(new Date(Date.now() - DAY)));
    await api.call('POST', '/reviews', { token: w.guest, body: { bookingId: second, rating: 5 } });
    await api.call('POST', '/reviews', { token: w.hostTok, body: { bookingId: second, rating: 5 } });
    expect((await VehicleModel.findById(w.vehicleId).lean())?.ratingAvg).toBe(5);
  });

  it('R11 a booking’s reviews are private to its participants', async () => {
    const w = await world();
    const other = await tokenFor(await seedUser());
    expect((await api.call('GET', `/reviews/booking/${w.bookingId}`, { token: other })).status).toBe(403);
  });
});
