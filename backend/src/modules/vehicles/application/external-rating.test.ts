import { vehicleService } from './vehicle.service';
import { VehicleModel } from '../infrastructure/vehicle.model';
import { toPublicVehicle } from './vehicle-public';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const car = () => VehicleModel.create({
  _id: 'v1', hostId: 'h1', make: 'Kia', model: 'K5', year: 2023, bodyType: 'sedan', transmission: 'automatic', fuelType: 'petrol', seats: 5,
  location: { coordinates: [-96.8, 32.9] }, listing: { title: 'K5' }, pricing: { dailyPrice: 6000 }, status: 'listed',
});

describe('external rating', () => {
  it('is stored with its source, kept apart from the CatoDrive rating, and shown publicly', async () => {
    await car();
    await vehicleService.adminSetExternalRating('v1', { source: 'Turo', rating: 4.9, trips: 42 });
    const v = (await VehicleModel.findById('v1').lean())!;
    expect(v.externalRating).toEqual({ source: 'Turo', rating: 4.9, trips: 42 });
    expect(v.ratingAvg).toBe(0);
    expect(v.ratingCount).toBe(0);
    expect((toPublicVehicle(v as never) as { externalRating?: unknown }).externalRating).toBeTruthy();
  });

  it('can be cleared', async () => {
    await car();
    await vehicleService.adminSetExternalRating('v1', { source: 'Turo', rating: 4.9, trips: 42 });
    await vehicleService.adminSetExternalRating('v1', null);
    expect((await VehicleModel.findById('v1').lean())!.externalRating).toBeUndefined();
  });
});
