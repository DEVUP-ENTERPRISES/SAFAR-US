jest.mock('../../platform-config/application/platform-config.service', () => ({
  platformConfigService: { get: jest.fn(async () => ({ booking: { checkoutHoldMinutes: 15 } })) },
}));

import { availabilityService, dayAfter } from './availability.service';
import { AvailabilityModel } from '../infrastructure/availability.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  await VehicleModel.collection.insertMany([
    { _id: 'car-tx', location: { state: 'TX' }, listing: { turnaroundDays: 0 } },
    { _id: 'car-none', location: {}, listing: { turnaroundDays: 0 } },
  ] as never[]);
});

const keysOf = async (vehicleId: string) =>
  (await AvailabilityModel.find({ vehicleId }).lean()).map((r) => r.dayKey).sort();

// 8 PM on 16 Oct 2031 in Texas (CDT) is already 17 Oct in UTC; drop-off is 8 PM the next evening.
const pickup = new Date('2031-10-17T01:00:00Z');
const dropoff = new Date('2031-10-18T01:00:00Z');

describe('calendar days follow the car time zone', () => {
  it('an evening pickup in Texas holds the Texas dates', async () => {
    await availabilityService.placeHold('car-tx', pickup, dropoff);
    expect(await keysOf('car-tx')).toEqual(['2031-10-16', '2031-10-17']);
  });

  it('a car without a state keeps UTC dates', async () => {
    await availabilityService.placeHold('car-none', pickup, dropoff);
    expect(await keysOf('car-none')).toEqual(['2031-10-17', '2031-10-18']);
  });

  it('a host block stays on the dates the host picked', async () => {
    await availabilityService.block('car-tx', new Date('2031-10-18'), new Date('2031-10-18'));
    expect(await keysOf('car-tx')).toEqual(['2031-10-18']);
    // The block on the 18th only matters once the trip reaches the 18th in Texas.
    expect(await availabilityService.isAvailable('car-tx', pickup, new Date('2031-10-17T22:00:00Z'))).toBe(true);
    expect(await availabilityService.isAvailable('car-tx', pickup, dropoff)).toBe(true);
    expect(await availabilityService.isAvailable('car-tx', pickup, new Date('2031-10-18T15:00:00Z'))).toBe(false);
  });

  it('confirm counts the same days the hold placed', async () => {
    const holdId = await availabilityService.placeHold('car-tx', pickup, dropoff);
    const expected = (await availabilityService.tripDayKeys('car-tx', pickup, dropoff)).length;
    await expect(availabilityService.confirmHold(holdId, 'b1', expected)).resolves.toBeUndefined();
  });

  it('shortening frees the local days after the new end', async () => {
    const holdId = await availabilityService.placeHold('car-tx', pickup, new Date('2031-10-20T01:00:00Z'));
    await availabilityService.confirmHold(holdId, 'b2');
    await availabilityService.releaseRange('b2', new Date('2031-10-18T15:00:00Z'), new Date('2031-10-20T01:00:00Z'));
    expect(await keysOf('car-tx')).toEqual(['2031-10-16', '2031-10-17']);
  });

  it('search agrees with the single-car check', async () => {
    await availabilityService.block('car-tx', new Date('2031-10-16'), new Date('2031-10-16'));
    const free = await availabilityService.availableAmong(['car-tx', 'car-none'], pickup, dropoff);
    expect([...free]).toEqual(['car-none']);
  });

  it('an extension starts at local midnight', () => {
    expect(dayAfter(pickup, 'America/Chicago').toISOString()).toBe('2031-10-17T05:00:00.000Z');
  });
});
