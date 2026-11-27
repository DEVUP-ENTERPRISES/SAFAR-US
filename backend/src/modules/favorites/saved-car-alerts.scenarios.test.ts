jest.mock('../payments/infrastructure/gateway.provider', () => ({ paymentGateway: new (jest.requireActual('../payments/infrastructure/mock.gateway').MockGateway)() }));
jest.mock('../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));

import { connectTestDb, clearTestDb, disconnectTestDb } from '../../testing/mongo';
import { startTestApi, tokenFor, type TestApi } from '../../testing/http';
import { seedUser, seedHost, seedVehicle, seedBooking } from '../../testing/fixtures';
import { savedCarAlertsService, headlinePrice } from './application/saved-car-alerts.service';
import { FavoriteModel } from './infrastructure/favorite.model';
import { DateWatchModel } from './infrastructure/date-watch.model';
import { availabilityService } from '../availability/application/availability.service';
import { notificationService } from '../notifications/application/notification.service';
import { categoryFor } from '../notifications/domain/notification-channel';
import { kv } from '../../infrastructure/cache/kv-store';

let api: TestApi;
beforeAll(async () => {
  await connectTestDb();
  api = await startTestApi();
});
afterAll(async () => {
  await api.close();
  await disconnectTestDb();
});
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});

const DAY = 86_400_000;
const send = notificationService.send as jest.Mock;
const sentWith = (key: string) => send.mock.calls.map(([n]) => n).filter((n) => n.templateKey === key);

async function savedCar() {
  const { hostId } = await seedHost();
  const vehicleId = await seedVehicle(hostId);
  const fan = await seedUser();
  await FavoriteModel.create({ userId: fan, vehicleId });
  for (const k of ['price', 'listed']) await kv().del(`alert:${k}:${fan}:${vehicleId}`).catch(() => undefined);
  return { hostId, vehicleId, fan };
}

describe('price-drop alerts', () => {
  it('a real drop tells everyone who saved the car, with a link to it', async () => {
    const w = await savedCar();
    expect(await savedCarAlertsService.onPriceChange(w.vehicleId, { dailyPrice: 6000 }, { dailyPrice: 5000 })).toBe(1);
    expect(sentWith('wishlist.price_drop')[0]).toMatchObject({ userId: w.fan, deepLink: `/vehicles/${w.vehicleId}`, body: expect.stringContaining('$50/day, down from $60') });
  });

  it('a promo switching on counts as a drop', async () => {
    const w = await savedCar();
    expect(await savedCarAlertsService.onPriceChange(w.vehicleId, { dailyPrice: 6000 }, { dailyPrice: 6000, promoActive: true, promoDiscountBps: 2000 })).toBe(1);
    expect(headlinePrice({ dailyPrice: 6000, promoActive: true, promoDiscountBps: 2000 })).toBe(4800);
  });

  it('a tiny drop is not news', async () => {
    const w = await savedCar();
    expect(await savedCarAlertsService.onPriceChange(w.vehicleId, { dailyPrice: 6000 }, { dailyPrice: 5800 })).toBe(0);
  });

  it('a host dropping the price twice in a row alerts each guest once', async () => {
    const w = await savedCar();
    await savedCarAlertsService.onPriceChange(w.vehicleId, { dailyPrice: 8000 }, { dailyPrice: 7000 });
    await savedCarAlertsService.onPriceChange(w.vehicleId, { dailyPrice: 7000 }, { dailyPrice: 6000 });
    expect(sentWith('wishlist.price_drop')).toHaveLength(1);
  });

  it('these alerts follow the guest’s promotions setting', () => {
    expect(categoryFor('wishlist.price_drop')).toBe('promotions');
    expect(categoryFor('wishlist.dates_open')).toBe('promotions');
  });

  it('a car off the marketplace sends nothing', async () => {
    const { hostId } = await seedHost();
    const vehicleId = await seedVehicle(hostId, { status: 'paused' });
    await FavoriteModel.create({ userId: await seedUser(), vehicleId });
    expect(await savedCarAlertsService.onPriceChange(vehicleId, { dailyPrice: 9000 }, { dailyPrice: 5000 })).toBe(0);
  });

  it('back-on-the-site alerts are limited too', async () => {
    const w = await savedCar();
    await savedCarAlertsService.onListed(w.vehicleId);
    await savedCarAlertsService.onListed(w.vehicleId);
    expect(sentWith('wishlist.available')).toHaveLength(1);
  });
});

describe('tell me when my dates open up', () => {
  const dates = () => {
    const start = new Date(Date.now() + 5 * DAY);
    return { start, end: new Date(start.getTime() + 2 * DAY) };
  };

  it('quotes say so straight away when the dates are taken', async () => {
    const { hostId } = await seedHost();
    const vehicleId = await seedVehicle(hostId);
    const { start, end } = dates();
    const b = await seedBooking(await seedUser(), hostId, vehicleId, { status: 'confirmed', period: { start, end } });
    await availabilityService.confirmHold(await availabilityService.placeHold(vehicleId, start, end), b);
    const r = await api.call('POST', '/bookings/quote', { body: { vehicleId, start: start.toISOString(), end: end.toISOString() } });
    expect(r.status).toBe(409);
    expect(r.body.error?.code).toBe('NOT_AVAILABLE');
  });

  it('a guest watches taken dates and hears the moment the booking is cancelled', async () => {
    const { hostId } = await seedHost();
    const vehicleId = await seedVehicle(hostId);
    const { start, end } = dates();
    const b = await seedBooking(await seedUser(), hostId, vehicleId, { status: 'confirmed', period: { start, end } });
    await availabilityService.confirmHold(await availabilityService.placeHold(vehicleId, start, end), b);
    const waiter = await seedUser();
    const r = await api.call('POST', '/favorites/watch', { token: await tokenFor(waiter), body: { vehicleId, start: start.toISOString(), end: end.toISOString() } });
    expect(r.status).toBe(201);

    expect(await savedCarAlertsService.checkWatches(vehicleId)).toBe(0);
    await availabilityService.releaseBooking(b);
    expect(await savedCarAlertsService.checkWatches(vehicleId)).toBe(1);
    const alert = sentWith('wishlist.dates_open')[0];
    expect(alert).toMatchObject({ userId: waiter, priority: 'high' });
    expect(alert.deepLink).toContain(`/vehicles/${vehicleId}?start=`);
    expect(await savedCarAlertsService.checkWatches(vehicleId)).toBe(0);
  });

  it('past dates, reversed dates and unknown cars are refused', async () => {
    const tok = await tokenFor(await seedUser());
    const { hostId } = await seedHost();
    const vehicleId = await seedVehicle(hostId);
    const now = Date.now();
    expect((await api.call('POST', '/favorites/watch', { token: tok, body: { vehicleId, start: new Date(now - DAY).toISOString(), end: new Date(now).toISOString() } })).status).toBe(422);
    expect((await api.call('POST', '/favorites/watch', { token: tok, body: { vehicleId, start: new Date(now + 3 * DAY).toISOString(), end: new Date(now + 2 * DAY).toISOString() } })).status).toBe(422);
    expect((await api.call('POST', '/favorites/watch', { token: tok, body: { vehicleId: 'nope', start: new Date(now + 2 * DAY).toISOString(), end: new Date(now + 3 * DAY).toISOString() } })).status).toBe(404);
  });

  it('watching the same dates twice keeps one watch, and a guest can remove it', async () => {
    const { hostId } = await seedHost();
    const vehicleId = await seedVehicle(hostId);
    const tok = await tokenFor(await seedUser());
    const { start, end } = dates();
    const body = { vehicleId, start: start.toISOString(), end: end.toISOString() };
    await api.call('POST', '/favorites/watch', { token: tok, body });
    await api.call('POST', '/favorites/watch', { token: tok, body });
    const list = await api.call<{ _id: string }[]>('GET', '/favorites/watches', { token: tok });
    expect(list.body.data).toHaveLength(1);
    await api.call('DELETE', `/favorites/watches/${list.body.data![0]._id}`, { token: tok });
    expect(await DateWatchModel.countDocuments()).toBe(0);
  });

  it('a guest cannot remove someone else’s watch', async () => {
    const { hostId } = await seedHost();
    const vehicleId = await seedVehicle(hostId);
    const owner = await seedUser();
    const { start, end } = dates();
    const w = await savedCarAlertsService.watch(owner, vehicleId, start, end);
    await api.call('DELETE', `/favorites/watches/${w._id}`, { token: await tokenFor(await seedUser()) });
    expect(await DateWatchModel.countDocuments()).toBe(1);
  });
});
