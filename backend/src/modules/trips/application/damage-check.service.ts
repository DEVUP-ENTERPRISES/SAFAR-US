import { TripModel } from '../infrastructure/trip.model';
import { damageReviewService } from '../../ai/application/damage-review.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { notificationService } from '../../notifications/application/notification.service';
import { realtimeEmitter } from '../../../realtime/emitter';
import { kv } from '../../../infrastructure/cache/kv-store';
import { logger } from '../../../infrastructure/logging/logger';

/** Each run is a paid model call; a trip gets a few, never a loop. */
const MAX_RUNS_PER_TRIP = 3;
const RUN_LOCK_SECONDS = 180;

export type DamageCheckStatus = 'unavailable' | 'waiting_photos' | 'checking' | 'clear' | 'host_review';

export interface DamageCheckView {
  status: DamageCheckStatus;
  checkedAt?: Date;
  photosCompared?: { pre: number; post: number };
}

type TripPhotos = { _id: string; bookingId: string; guestId: string; photos?: { phase: string; byUserId?: string; at?: Date }[] };

async function returnPhotosReady(trip: TripPhotos): Promise<{ ready: boolean; latest?: number }> {
  const { inspection } = await platformConfigService.get();
  const pre = (trip.photos ?? []).filter((p) => p.phase === 'pre');
  const guestPost = (trip.photos ?? []).filter((p) => p.phase === 'post' && p.byUserId === trip.guestId);
  const latest = Math.max(0, ...guestPost.map((p) => (p.at ? new Date(p.at).getTime() : 0)));
  return { ready: pre.length > 0 && guestPost.length >= Math.max(1, inspection.minReturnPhotos ?? 0), latest };
}

/**
 * The guest's return photos compared with the pickup photos the moment they are in, so the guest
 * walks away knowing where they stand. It only ever reports: a person decides any charge.
 */
export const damageCheckService = {
  /** Called after return photos are saved. Never throws and never blocks the return. */
  async afterReturnPhotos(tripId: string): Promise<void> {
    try {
      if (!damageReviewService.enabled()) return;
      const trip = await TripModel.findById(tripId).select('bookingId guestId photos').lean<TripPhotos>();
      if (!trip) return;
      const { ready, latest } = await returnPhotosReady(trip);
      if (!ready) return;
      const existing = await damageReviewService.get(tripId);
      if (existing && new Date(existing.reviewedAt).getTime() >= (latest ?? 0)) return;

      const runsKey = `damage-check:runs:${tripId}`;
      if (Number((await kv().get(runsKey).catch(() => null)) ?? 0) >= MAX_RUNS_PER_TRIP) return;
      const lockKey = `damage-check:lock:${tripId}`;
      if (!(await kv().acquire(lockKey, RUN_LOCK_SECONDS).catch(() => false))) return;
      void this.run(trip, runsKey, lockKey);
    } catch (err) {
      logger.warn({ tripId, err: (err as Error).message }, 'damage check not started');
    }
  },

  async run(trip: TripPhotos, runsKey: string, lockKey: string): Promise<void> {
    try {
      await kv().set(runsKey, String(Number((await kv().get(runsKey).catch(() => null)) ?? 0) + 1), 14 * 86_400).catch(() => undefined);
      const doc = await damageReviewService.review(trip._id, 'system:return-photos');
      if (realtimeEmitter.isReady()) realtimeEmitter.toBooking(trip.bookingId, 'damage:checked', { bookingId: trip.bookingId });
      if (doc?.verdict === 'no_new_damage' && !doc.needsHuman) {
        await notificationService
          .send({
            userId: trip.guestId,
            priority: 'normal',
            templateKey: 'trip.damage_check.clear',
            title: 'No new damage found',
            body: 'We compared your return photos with the pickup photos. You’re all set.',
            deepLink: `/trips/${trip._id}`,
            data: { tripId: trip._id },
          })
          .catch(() => undefined);
      }
    } catch (err) {
      logger.warn({ tripId: trip._id, err: (err as Error).message }, 'damage check failed');
    } finally {
      await kv().del(lockKey).catch(() => undefined);
    }
  },

  /** What a party to the trip sees. A finding reads as "your host will take a look", never as a verdict on the guest. */
  async view(tripId: string): Promise<DamageCheckView> {
    if (!damageReviewService.enabled()) return { status: 'unavailable' };
    const trip = await TripModel.findById(tripId).select('bookingId guestId photos').lean<TripPhotos>();
    if (!trip) return { status: 'unavailable' };
    const { ready, latest } = await returnPhotosReady(trip);
    if (!(trip.photos ?? []).some((p) => p.phase === 'pre')) return { status: 'unavailable' };
    if (!ready) return { status: 'waiting_photos' };
    const doc = await damageReviewService.get(tripId);
    const fresh = !!doc && new Date(doc.reviewedAt).getTime() >= (latest ?? 0);
    if (!fresh) {
      const capped = Number((await kv().get(`damage-check:runs:${tripId}`).catch(() => null)) ?? 0) >= MAX_RUNS_PER_TRIP;
      return capped && doc ? toView(doc) : { status: 'checking' };
    }
    return toView(doc!);
  },
};

function toView(doc: { verdict: string; needsHuman: boolean; reviewedAt: Date; photosCompared: { pre: number; post: number } }): DamageCheckView {
  return {
    status: doc.verdict === 'no_new_damage' && !doc.needsHuman ? 'clear' : 'host_review',
    checkedAt: doc.reviewedAt,
    photosCompared: doc.photosCompared,
  };
}
