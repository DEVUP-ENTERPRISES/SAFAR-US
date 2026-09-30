import { vehicleReviewService } from './vehicle-review.service';
import { notificationService } from '../../notifications/application/notification.service';
import { pricingService } from '../../pricing/application/pricing.service';
import { VehicleModel } from '../infrastructure/vehicle.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.restoreAllMocks();
});

const car = (over: Record<string, unknown> = {}) =>
  VehicleModel.collection.insertOne({
    _id: 'car' as never, hostId: 'host', year: 2025, make: 'Chevrolet', model: 'Equinox', status: 'pending_verification', deletedAt: null,
    photos: Array.from({ length: 6 }, (_, i) => ({ url: `https://cdn.test/${i}.jpg` })),
    pricing: { dailyPrice: 6500, currency: 'USD', cleaningFee: 2500 },
    location: { type: 'Point', coordinates: [-97, 32.8], address: '3001 Esters Road, Irving, TX 75062', city: 'Irving', state: 'TX' },
    ...over,
  });

describe('reminding a host about missing items', () => {
  it('sends the host exactly what they still need to add', async () => {
    await car();
    await HostModel.collection.insertOne({ _id: 'host' as never, userId: 'host-user', displayName: 'Fleet' });
    const send = jest.spyOn(notificationService, 'send').mockResolvedValue(undefined as never);

    const r = await vehicleReviewService.remindHost('car');
    expect(r.items).toEqual(['Registration document', 'Insurance document', 'VIN']);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'host-user',
      templateKey: 'vehicle.missing_items',
      deepLink: '/host/listings/car',
      body: expect.stringContaining('Enter the 17-character VIN'),
    }));
  });

  it('refuses when the host has nothing left to add', async () => {
    await car({ vin: '1GNAXUEG0SZ000001' });
    await HostModel.collection.insertOne({ _id: 'host' as never, userId: 'host-user', displayName: 'Fleet' });
    jest.spyOn(notificationService, 'send').mockResolvedValue(undefined as never);
    const { DocumentModel } = await import('../../documents/infrastructure/document.model');
    for (const category of ['registration', 'insurance']) {
      await DocumentModel.collection.insertOne({ vehicleId: 'car', category, url: 'x', deletedAt: null, verification: { status: 'verified' } } as never);
    }
    await expect(vehicleReviewService.remindHost('car')).rejects.toMatchObject({ code: 'NOTHING_MISSING' });
  });
});

describe('cleaning fee', () => {
  it('is never charged, even on a car that still has one set', async () => {
    await car({ status: 'listed', verificationStatus: 'verified' });
    const start = new Date(Date.now() + 3 * 86_400_000);
    const q = await pricingService.quote({ vehicleId: 'car', start, end: new Date(+start + 2 * 86_400_000) } as never);
    expect(q.cleaningFee.amount).toBe(0);
  });
});
