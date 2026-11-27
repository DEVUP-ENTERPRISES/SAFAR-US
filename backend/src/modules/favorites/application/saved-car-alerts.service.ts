import { DateWatchModel, type DateWatchDoc } from '../infrastructure/date-watch.model';
import { favoritesService } from './favorites.service';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { availabilityService } from '../../availability/application/availability.service';
import { notificationService } from '../../notifications/application/notification.service';
import { kv } from '../../../infrastructure/cache/kv-store';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

/** One alert of a kind per guest per car in this window, so a host fiddling with prices never spams anyone. */
const THROTTLE_SECONDS = 3 * 86_400;
/** A drop has to matter: at least 5% and at least $5 a day. */
const MIN_DROP_BPS = 500;
const MIN_DROP_CENTS = 500;
const MAX_WATCHES_PER_USER = 10;

type Pricing = { dailyPrice: number; promoActive?: boolean; promoDiscountBps?: number; currency?: string };

/** The per-day price a guest actually sees on the listing, promo included. */
export function headlinePrice(p: Pricing): number {
  const promo = p.promoActive && p.promoDiscountBps ? p.promoDiscountBps : 0;
  return Math.round((p.dailyPrice * (10_000 - promo)) / 10_000);
}

const dollars = (cents: number) => `$${Math.round(cents / 100)}`;
const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });

async function firstInWindow(key: string): Promise<boolean> {
  return kv().acquire(key, THROTTLE_SECONDS).catch(() => true);
}

async function carTitle(vehicleId: string): Promise<{ title: string; bookable: boolean } | null> {
  const v = await VehicleModel.findById(vehicleId).select('year make model status verificationStatus deletedAt').lean<{ year?: number; make: string; model: string; status: string; verificationStatus: string; deletedAt?: Date | null }>();
  if (!v) return null;
  return { title: [v.year, v.make, v.model].filter(Boolean).join(' '), bookable: v.status === 'listed' && v.verificationStatus === 'verified' && !v.deletedAt };
}

/** Alerts for cars a guest saved or is waiting on: a real price drop, back on the site, or their dates opening up. */
export const savedCarAlertsService = {
  async onPriceChange(vehicleId: string, before: Pricing, after: Pricing): Promise<number> {
    const was = headlinePrice(before);
    const now = headlinePrice(after);
    const drop = was - now;
    if (drop < MIN_DROP_CENTS || drop * 10_000 < was * MIN_DROP_BPS) return 0;
    const car = await carTitle(vehicleId);
    if (!car?.bookable) return 0;
    let sent = 0;
    for (const userId of await favoritesService.wishlistersOf(vehicleId)) {
      if (!(await firstInWindow(`alert:price:${userId}:${vehicleId}`))) continue;
      await notificationService
        .send({
          userId,
          templateKey: 'wishlist.price_drop',
          title: `Price drop: ${car.title}`,
          body: `Now ${dollars(now)}/day, down from ${dollars(was)}. Tap to book.`,
          deepLink: `/vehicles/${vehicleId}`,
          data: { vehicleId },
        })
        .catch(() => undefined);
      sent += 1;
    }
    return sent;
  },

  async onListed(vehicleId: string): Promise<number> {
    const car = await carTitle(vehicleId);
    if (!car?.bookable) return 0;
    let sent = 0;
    for (const userId of await favoritesService.wishlistersOf(vehicleId)) {
      if (!(await firstInWindow(`alert:listed:${userId}:${vehicleId}`))) continue;
      await notificationService
        .send({ userId, templateKey: 'wishlist.available', title: `${car.title} is bookable again`, body: 'A car you saved is back. Tap to see your dates.', deepLink: `/vehicles/${vehicleId}`, data: { vehicleId } })
        .catch(() => undefined);
      sent += 1;
    }
    return sent;
  },

  async watch(userId: string, vehicleId: string, start: Date, end: Date): Promise<DateWatchDoc> {
    if (!(end > start)) throw new ValidationError('Pick a return time after the pickup time.');
    if (start.getTime() <= Date.now()) throw new ValidationError('Pick dates in the future.');
    const car = await carTitle(vehicleId);
    if (!car?.bookable) throw new NotFoundError('Vehicle');
    const existing = await DateWatchModel.findOne({ userId, vehicleId, start, end }).lean<DateWatchDoc>();
    if (existing) return existing;
    if ((await DateWatchModel.countDocuments({ userId, notifiedAt: null, start: { $gt: new Date() } })) >= MAX_WATCHES_PER_USER) {
      throw new ConflictError(`You can watch up to ${MAX_WATCHES_PER_USER} trips at once. Remove one to add another.`, 'WATCHES_FULL');
    }
    return (await DateWatchModel.create({ userId, vehicleId, start, end })).toObject();
  },

  async listWatches(userId: string): Promise<DateWatchDoc[]> {
    return DateWatchModel.find({ userId, start: { $gt: new Date() } }).sort({ start: 1 }).limit(MAX_WATCHES_PER_USER * 2).lean<DateWatchDoc[]>();
  },

  async unwatch(userId: string, watchId: string): Promise<void> {
    await DateWatchModel.deleteOne({ _id: watchId, userId });
  },

  /** Tells each waiting guest whose dates are now free on this car; each watch fires once. */
  async checkWatches(vehicleId: string): Promise<number> {
    const watches = await DateWatchModel.find({ vehicleId, notifiedAt: null, start: { $gt: new Date() } }).limit(200).lean<DateWatchDoc[]>();
    if (!watches.length) return 0;
    const car = await carTitle(vehicleId);
    if (!car?.bookable) return 0;
    let sent = 0;
    for (const w of watches) {
      if (!(await availabilityService.isAvailable(vehicleId, w.start, w.end).catch(() => false))) continue;
      const claimed = await DateWatchModel.updateOne({ _id: w._id, notifiedAt: null }, { $set: { notifiedAt: new Date() } });
      if (!claimed.modifiedCount) continue;
      await notificationService
        .send({
          userId: w.userId,
          priority: 'high',
          templateKey: 'wishlist.dates_open',
          title: `Your dates just opened up`,
          body: `${car.title} is free ${day(w.start)} to ${day(w.end)}. Book before someone else does.`,
          deepLink: `/vehicles/${vehicleId}?start=${encodeURIComponent(w.start.toISOString())}&end=${encodeURIComponent(w.end.toISOString())}`,
          data: { vehicleId, watchId: w._id },
        })
        .catch(() => undefined);
      sent += 1;
    }
    if (sent) logger.info({ vehicleId, sent }, 'date-watch alerts sent');
    return sent;
  },

  /** Safety net for frees that raise no event, such as a checkout hold lapsing. */
  async sweep(): Promise<number> {
    const ids = await DateWatchModel.distinct('vehicleId', { notifiedAt: null, start: { $gt: new Date() } });
    let sent = 0;
    for (const id of (ids as string[]).slice(0, 500)) sent += await this.checkWatches(id);
    return sent;
  },
};
