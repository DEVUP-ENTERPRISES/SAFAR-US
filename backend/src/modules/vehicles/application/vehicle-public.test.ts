jest.mock('../../notifications/application/notification.service', () => ({
  notificationService: { send: jest.fn().mockResolvedValue({}) },
}));

import { vehicleService } from './vehicle.service';
import { toPublicVehicle } from './vehicle-public';
import { VehicleModel } from '../infrastructure/vehicle.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const raw = {
  _id: 'veh-1',
  hostId: 'host-1',
  make: 'Honda',
  model: 'Civic',
  year: 2022,
  vin: '1HGCM82633A004352',
  registrationNumber: 'ABC-123',
  pickup: { instructions: 'Bay 44', spotPhotoUrl: 'https://x/p.jpg', accessCode: '4417' },
  location: { type: 'Point', coordinates: [-97.743061, 30.267153], address: '12 Oak St', city: 'Austin', state: 'TX' },
  status: 'listed',
  verificationStatus: 'verified',
  deletedAt: null,
};

async function seed() {
  await HostModel.collection.insertOne({ _id: 'host-1', userId: 'user-1', displayName: 'H', deletedAt: null } as never);
  await VehicleModel.collection.insertOne({ ...raw, photos: [], listing: {}, pricing: {} } as never);
}

describe('public vehicle projection', () => {
  it('drops codes, plate, VIN and the street address, and blurs the coordinates', () => {
    const out = JSON.stringify(toPublicVehicle(raw as never));
    for (const secret of ['4417', 'ABC-123', '1HGCM82633A004352', 'p.jpg', '12 Oak St', '-97.743061', '30.267153']) {
      expect(out).not.toContain(secret);
    }
    const pub = toPublicVehicle(raw as never) as typeof raw;
    expect(pub.location).toMatchObject({ coordinates: [-97.74, 30.27], address: 'Austin, TX', city: 'Austin' });
  });

  it('serves the full document to the owning host and the projection to everyone else', async () => {
    await seed();
    expect((await vehicleService.getForViewer('user-1', 'veh-1')).pickup?.accessCode).toBe('4417');
    for (const viewer of [undefined, 'user-2']) {
      const v = await vehicleService.getForViewer(viewer, 'veh-1');
      expect(JSON.stringify(v)).not.toMatch(/4417|ABC-123|1HGCM82633A004352|12 Oak St/);
    }
  });
});

describe('editing a verified car', () => {
  it('sends it back for review when the plate changes, and leaves it live for a price-only edit', async () => {
    await seed();
    await vehicleService.update('user-1', 'veh-1', { listing: { title: 'New title' } } as never);
    expect(await vehicleService.isBookable('veh-1')).toBe(true);

    const v = await vehicleService.update('user-1', 'veh-1', { registrationNumber: 'ZZZ-999' } as never);
    expect(v).toMatchObject({ status: 'pending_verification', verificationStatus: 'pending' });
    expect(await vehicleService.isBookable('veh-1')).toBe(false);
  });
});
