import { connectTestDb, clearTestDb, disconnectTestDb } from '../../testing/mongo';
import { startTestApi, type TestApi } from '../../testing/http';
import { seedHost, seedVehicle, seedUser, seedBooking } from '../../testing/fixtures';
import { availabilityService } from '../availability/application/availability.service';

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

const DALLAS = 'lat=32.78&lng=-96.8';
type Car = { _id: string; pricing: { dailyPrice: number } };

// Cars spread outward from the search point; the cheapest is the farthest away.
async function fleet() {
  const { hostId } = await seedHost();
  const ids: string[] = [];
  for (let i = 0; i < 6; i++) {
    ids.push(await seedVehicle(hostId, { pricing: { dailyPrice: 9000 - i * 1000, currency: 'USD' }, location: { type: 'Point', coordinates: [-96.8 + i * 0.02, 32.78], city: 'Dallas' } }));
  }
  return { hostId, ids };
}

describe('search, from the guest side', () => {
  it('S1 finds listed, verified cars near the guest', async () => {
    await fleet();
    const r = await api.call<Car[]>('GET', `/search/vehicles?${DALLAS}`);
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(6);
  });

  it('S2 hides unlisted, unverified and deleted cars', async () => {
    const { hostId } = await seedHost();
    await seedVehicle(hostId, { status: 'draft' });
    await seedVehicle(hostId, { verificationStatus: 'pending' });
    await seedVehicle(hostId, { deletedAt: new Date() });
    expect((await api.call<Car[]>('GET', `/search/vehicles?${DALLAS}`)).body.data).toHaveLength(0);
  });

  it('S3 cheapest first means cheapest in the whole area, not just the nearest few', async () => {
    await fleet();
    const r = await api.call<Car[]>('GET', `/search/vehicles?${DALLAS}&sort=price_asc&limit=2`);
    expect(r.body.data?.map((c) => c.pricing.dailyPrice)).toEqual([4000, 5000]);
  });

  it('S4 most expensive first', async () => {
    await fleet();
    const r = await api.call<Car[]>('GET', `/search/vehicles?${DALLAS}&sort=price_desc&limit=1`);
    expect(r.body.data?.[0].pricing.dailyPrice).toBe(9000);
  });

  it('S5 nearest first by default', async () => {
    const { ids } = await fleet();
    const r = await api.call<Car[]>('GET', `/search/vehicles?${DALLAS}&limit=1`);
    expect(r.body.data?.[0]._id).toBe(ids[0]);
  });

  it('S6 instantBook=false shows request-to-book cars, not instant ones', async () => {
    const { hostId } = await seedHost();
    const instant = await seedVehicle(hostId);
    const request = await seedVehicle(hostId, { listing: { title: 'Request car', instantBook: false } });
    expect((await api.call<Car[]>('GET', `/search/vehicles?${DALLAS}&instantBook=false`)).body.data?.map((c) => c._id)).toEqual([request]);
    expect((await api.call<Car[]>('GET', `/search/vehicles?${DALLAS}&instantBook=true`)).body.data?.map((c) => c._id)).toEqual([instant]);
  });

  it('S7 an end date before the start date is refused', async () => {
    const r = await api.call('GET', `/search/vehicles?${DALLAS}&start=2026-12-10T10:00:00Z&end=2026-12-09T10:00:00Z`);
    expect(r.status).toBe(422);
  });

  it('S8 a start date without an end is refused', async () => {
    expect((await api.call('GET', `/search/vehicles?${DALLAS}&start=2026-12-10T10:00:00Z`)).status).toBe(422);
  });

  it('S9 cars already booked for the dates are left out', async () => {
    const { hostId, ids } = await fleet();
    const guest = await seedUser();
    const start = new Date(Date.now() + 5 * 86_400_000);
    const end = new Date(start.getTime() + 2 * 86_400_000);
    const bookingId = await seedBooking(guest, hostId, ids[0], { status: 'confirmed', period: { start, end } });
    await availabilityService.confirmHold(await availabilityService.placeHold(ids[0], start, end), bookingId);
    const r = await api.call<Car[]>('GET', `/search/vehicles?${DALLAS}&start=${start.toISOString()}&end=${end.toISOString()}`);
    expect(r.body.data?.map((c) => c._id)).not.toContain(ids[0]);
    expect(r.body.data).toHaveLength(5);
  });

  it('S10 a price range with max below min is refused', async () => {
    expect((await api.call('GET', `/search/vehicles?${DALLAS}&priceMin=9000&priceMax=1000`)).status).toBe(422);
  });

  it('S11 price range filters the list', async () => {
    await fleet();
    const r = await api.call<Car[]>('GET', `/search/vehicles?${DALLAS}&priceMin=5000&priceMax=7000`);
    expect(r.body.data?.map((c) => c.pricing.dailyPrice).sort()).toEqual([5000, 6000, 7000]);
  });

  it('S12 filter counts agree with the result list when delivery is on', async () => {
    const { hostId } = await seedHost();
    await seedVehicle(hostId, { listing: { title: 'Delivers', instantBook: true, delivery: { home: true } } });
    await seedVehicle(hostId);
    const list = await api.call<Car[]>('GET', `/search/vehicles?${DALLAS}&delivery=true`);
    const counts = await api.call<{ total: number }>('GET', `/search/filter-counts?${DALLAS}&delivery=true`);
    expect(list.body.data).toHaveLength(1);
    expect(counts.body.data?.total).toBe(1);
  });

  it('S13 bad coordinates are refused', async () => {
    expect((await api.call('GET', '/search/vehicles?lat=999&lng=-96.8')).status).toBe(422);
    expect((await api.call('GET', '/search/vehicles')).status).toBe(422);
  });

  it('S14 a make search treats regex characters as plain text', async () => {
    await fleet();
    const r = await api.call<Car[]>('GET', `/search/vehicles?${DALLAS}&make=${encodeURIComponent('.*')}`);
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(0);
  });

  it('S15 search results never carry private car fields', async () => {
    const { hostId } = await seedHost();
    await seedVehicle(hostId, { vin: '1HGCM82633A004352', registrationNumber: 'ABC123' });
    const car = (await api.call<Record<string, unknown>[]>('GET', `/search/vehicles?${DALLAS}`)).body.data?.[0] ?? {};
    expect(car.vin).toBeUndefined();
    expect(car.registrationNumber).toBeUndefined();
  });

  it('S16 never more than 50 results per page', async () => {
    expect((await api.call('GET', `/search/vehicles?${DALLAS}&limit=500`)).status).toBe(422);
  });
});
