const completeJson = jest.fn();
jest.mock('../infrastructure/ai.gateway', () => ({
  aiGateway: { isEnabled: () => true, completeJson: (...a: unknown[]) => completeJson(...a) },
}));
jest.mock('../../../infrastructure/storage/storage.provider', () => ({
  storageGateway: { createDownloadUrl: async (k: string) => `https://cdn.test/${k}` },
}));

import { photoMatchService } from './photo-match.service';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  completeJson.mockReset();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: async () => new ArrayBuffer(10),
  }) as never;
});

async function car() {
  const v = await VehicleModel.collection.insertOne({
    _id: 'v1' as never, make: 'Buick', model: 'Encore', year: 2021, registrationNumber: 'ABC-1O23',
    specs: { color: 'Dark Grey' },
    photos: [{ url: 'u', key: 'vehicle_photo/a.jpg' }, { url: 'u', key: 'vehicle_photo/b.heic' }],
  });
  return String(v.insertedId);
}

const answer = (o: Record<string, unknown>) =>
  completeJson.mockResolvedValue({ content: { plate: 'ABC 1023', make: 'Buick', model: 'Encore GX', color: 'gray', sameCarInAllPhotos: true, note: 'ok', ...o }, model: 'm' });

describe('photo match', () => {
  it('matches despite plate look-alikes, a longer model name and grey/gray; skips HEIC', async () => {
    answer({});
    const r = await photoMatchService.check(await car());
    expect(r!.status).toBe('match');
    expect(r!.photosChecked).toBe(1);
  });

  it('flags a different plate or colour', async () => {
    answer({ plate: 'XYZ 999', color: 'red' });
    const r = await photoMatchService.check(await car());
    expect(r!.status).toBe('mismatch');
    expect(r!.fields.filter((f) => f.result === 'mismatch').map((f) => f.key)).toEqual(['plate', 'color']);
  });

  it('says partial when the plate is not visible, and saves the result on the car', async () => {
    answer({ plate: null });
    const id = await car();
    await photoMatchService.check(id);
    const v = await VehicleModel.findById(id).lean();
    expect(v!.photoMatch!.status).toBe('partial');
  });

  it('never throws when the AI call fails', async () => {
    completeJson.mockRejectedValue(new Error('down'));
    const r = await photoMatchService.check(await car());
    expect(r!.status).toBe('unchecked');
  });
});
