const listings = jest.fn();
jest.mock('../infrastructure/wheelbase.client', () => ({ fetchDealerListings: (...a: unknown[]) => listings(...a) }));
jest.mock('../../hosts/application/host.service', () => ({
  hostService: { requireHostForUser: jest.fn(async () => ({ _id: 'host-1', userId: 'user-1' })) },
}));

import { wheelbaseImportService } from './wheelbase-import.service';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.restoreAllMocks();
  listings.mockReset();
  const real = await platformConfigService.get();
  jest.spyOn(platformConfigService, 'get').mockResolvedValue({ ...real, insurance: { ...real.insurance, wheelbaseDealerId: '1' } });
  // Photo downloads fail here, so imported photos keep their Wheelbase address.
  global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as never;
});

const listing = (id: number, year: number, make: string, model: string, over: Record<string, unknown> = {}) => ({
  id, name: `${year} ${make} ${model}`, year, make, model, insuranceState: 'approved', coverage: 'normal', minRenterAge: 21,
  details: {
    photoUrls: ['https://img.test/a.jpg', 'https://img.test/b.jpg'], features: ['apple_carplay', 'backup_camera'],
    fuelType: 'gas', seats: 7, pricePerDayCents: 9900, description: 'Family SUV', location: { city: 'Irving', state: 'TX', lat: 32.85, lng: -97 },
    ...over,
  },
});

const draft = (id: string, year: number, make: string, model: string, extra: Record<string, unknown> = {}) =>
  VehicleModel.collection.insertOne({
    _id: id as never, hostId: 'host-1', year, make, model, status: 'draft', deletedAt: null, photos: [], features: [],
    listing: { title: `${make} ${model}`, description: '' },
    location: { type: 'Point', coordinates: [-96.95, 32.87], address: '3001 Esters Rd, Irving, TX', city: 'Irving' },
    ...extra,
  });

describe('import from Wheelbase', () => {
  it('fills the drafts already here and links their insurance, without creating duplicates', async () => {
    listings.mockResolvedValue([listing(10, 2024, 'Buick', 'Envista')]);
    await draft('b1', 2024, 'Buick', 'Envista');
    await draft('b2', 2024, 'Buick', 'Envista');

    const preview = await wheelbaseImportService.preview('user-1', '1');
    expect(preview).toMatchObject({ toUpdate: 2, toCreate: 0 });

    const out = await wheelbaseImportService.run('user-1', '1');
    expect(out[0]).toMatchObject({ outcome: 'updated', vehicleIds: ['b1', 'b2'] });
    const b1 = await VehicleModel.findById('b1').lean();
    expect(b1!.photos.map((p) => p.url)).toEqual(['https://img.test/a.jpg', 'https://img.test/b.jpg']);
    expect(b1!.features).toEqual(['apple_carplay', 'backup_camera']);
    expect(b1!.listing.description).toBe('Family SUV');
    expect(b1!.wheelbase).toMatchObject({ rentalId: 10, insuranceState: 'approved' });

    // Running it again finds the same cars through their link: still two, nothing new.
    await wheelbaseImportService.run('user-1', '1');
    expect(await VehicleModel.countDocuments({ make: 'Buick' })).toBe(2);
  });

  it('never overwrites what the host already set', async () => {
    listings.mockResolvedValue([listing(10, 2024, 'Buick', 'Envista')]);
    await draft('b1', 2024, 'Buick', 'Envista', {
      photos: [{ url: 'https://host.test/mine.jpg', isCover: true }],
      listing: { title: 'Mine', description: 'My own words' },
    });
    await wheelbaseImportService.run('user-1', '1');
    const b1 = await VehicleModel.findById('b1').lean();
    expect(b1!.photos.map((p) => p.url)).toEqual(['https://host.test/mine.jpg']);
    expect(b1!.listing.description).toBe('My own words');
  });

  it('leaves a car that fits two listings for an admin to choose', async () => {
    listings.mockResolvedValue([listing(1, 2023, 'Chevrolet', 'Traverse'), listing(2, 2023, 'Chevrolet', 'Traverse')]);
    await draft('t1', 2023, 'Chevrolet', 'Traverse');
    const preview = await wheelbaseImportService.preview('user-1', '1');
    expect(preview.rows.every((r) => r.action === 'choose')).toBe(true);
    const out = await wheelbaseImportService.run('user-1', '1');
    expect(out.every((r) => r.outcome === 'skipped')).toBe(true);
    expect((await VehicleModel.findById('t1').lean())!.wheelbase).toBeUndefined();
  });

  it('refuses a Wheelbase account that is not the one CatoDrive is connected to', async () => {
    listings.mockResolvedValue([]);
    await expect(wheelbaseImportService.preview('user-1', '999')).rejects.toMatchObject({ httpStatus: 403 });
  });
});
