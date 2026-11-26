jest.mock('../../ai/application/damage-review.service', () => ({
  damageReviewService: { enabled: jest.fn(() => true), get: jest.fn(async () => null), review: jest.fn() },
}));
jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));

import { damageCheckService } from './damage-check.service';
import { damageReviewService } from '../../ai/application/damage-review.service';
import { notificationService } from '../../notifications/application/notification.service';
import { TripModel } from '../infrastructure/trip.model';
import { kv } from '../../../infrastructure/cache/kv-store';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
  (damageReviewService.enabled as jest.Mock).mockReturnValue(true);
  (damageReviewService.get as jest.Mock).mockResolvedValue(null);
});

const review = damageReviewService.review as jest.Mock;
const settle = () => new Promise((r) => setTimeout(r, 50));
const photo = (phase: string, by: string, n: number) => ({ url: `u${phase}${n}`, key: `k${phase}${n}`, phase, byUserId: by, at: new Date() });

async function trip(id: string, postCount: number) {
  await kv().del(`damage-check:runs:${id}`).catch(() => undefined);
  await kv().del(`damage-check:lock:${id}`).catch(() => undefined);
  await TripModel.create({
    _id: id, bookingId: `bk-${id}`, vehicleId: 'v1', guestId: 'g1', hostId: 'h1', status: 'completed', handover: { at: new Date() },
    photos: [...Array.from({ length: 7 }, (_, i) => photo('pre', 'staff', i)), ...Array.from({ length: postCount }, (_, i) => photo('post', 'g1', i))],
  });
  return id;
}

describe('instant damage check', () => {
  it('runs once the guest’s return photos are in, and tells them when it is clear', async () => {
    const id = await trip('t1', 6);
    review.mockResolvedValue({ verdict: 'no_new_damage', needsHuman: false, reviewedAt: new Date(), photosCompared: { pre: 7, post: 6 } });
    await damageCheckService.afterReturnPhotos(id);
    await settle();
    expect(review).toHaveBeenCalledWith(id, 'system:return-photos');
    expect(notificationService.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'g1', title: 'No new damage found' }));
  });

  it('waits until enough return photos are in', async () => {
    const id = await trip('t2', 0);
    await damageCheckService.afterReturnPhotos(id);
    expect(review).not.toHaveBeenCalled();
    expect((await damageCheckService.view(id)).status).toBe('waiting_photos');
  });

  it('a finding is shown as "host will take a look", and the guest is not told it is clear', async () => {
    const id = await trip('t3', 6);
    const doc = { verdict: 'damage_found', needsHuman: false, reviewedAt: new Date(Date.now() + 1000), photosCompared: { pre: 7, post: 6 } };
    review.mockResolvedValue(doc);
    await damageCheckService.afterReturnPhotos(id);
    await settle();
    expect(notificationService.send).not.toHaveBeenCalled();
    (damageReviewService.get as jest.Mock).mockResolvedValue(doc);
    expect((await damageCheckService.view(id)).status).toBe('host_review');
  });

  it('never runs more than three times on one trip', async () => {
    const id = await trip('t4', 6);
    review.mockResolvedValue({ verdict: 'no_new_damage', needsHuman: false, reviewedAt: new Date(0), photosCompared: { pre: 7, post: 6 } });
    for (let i = 0; i < 5; i++) {
      await damageCheckService.afterReturnPhotos(id);
      await settle();
    }
    expect(review).toHaveBeenCalledTimes(3);
  });

  it('does nothing, and shows nothing, when AI is not set up', async () => {
    const id = await trip('t5', 6);
    (damageReviewService.enabled as jest.Mock).mockReturnValue(false);
    await damageCheckService.afterReturnPhotos(id);
    expect(review).not.toHaveBeenCalled();
    expect((await damageCheckService.view(id)).status).toBe('unavailable');
  });

  it('a failed model call never throws into the return', async () => {
    const id = await trip('t6', 6);
    review.mockRejectedValue(new Error('model down'));
    await expect(damageCheckService.afterReturnPhotos(id)).resolves.toBeUndefined();
    await settle();
  });
});
