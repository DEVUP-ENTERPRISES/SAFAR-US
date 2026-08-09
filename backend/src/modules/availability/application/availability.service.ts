import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { AvailabilityModel } from '../infrastructure/availability.model';
import { ConflictError } from '../../../core/errors/app-error';
import { randomId } from '../../../shared/utils/uuid';
import type { IAvailabilityContract } from '../../../core/contracts/availability.contract';
import { platformConfigService } from '../../platform-config/application/platform-config.service';

// How long a checkout hold survives is operational policy (it trades abandoned
// carts against inventory being locked up), so it lives in PlatformConfig.
const holdTtlMs = async (): Promise<number> =>
  (await platformConfigService.get()).booking.checkoutHoldMinutes * 60 * 1000;

/** Enumerate the UTC day keys occupied by a [start, end] rental (inclusive). */
function dayKeys(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (d <= last) {
    keys.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return keys;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export class AvailabilityService implements IAvailabilityContract {
  /** Cached per call chain; a config read per availability check is wasteful. */
  private async turnaroundDays(vehicleId: string): Promise<number> {
    const v = await VehicleModel.findOne(
      { _id: vehicleId },
      { 'listing.turnaroundDays': 1 },
    ).lean();
    return Math.max(0, Math.min(7, v?.listing?.turnaroundDays ?? 0));
  }

  /**
   * Is the range free?
   *
   * `excludeHoldId` lets a caller ignore a hold it already owns. Re-checking
   * availability for a booking that is itself holding the slot would otherwise
   * always answer "taken" — which is how a booking waiting on identity
   * verification got cancelled at the moment it should have been released.
   */
  async isAvailable(
    vehicleId: string,
    start: Date,
    end: Date,
    excludeHoldId?: string,
  ): Promise<boolean> {
    // Widen the window by the host's turnaround so a new trip cannot start
    // inside the gap they keep for cleaning and servicing. Checked here rather
    // than written into the calendar so a host can change the setting without
    // rewriting every future day.
    const turnaround = await this.turnaroundDays(vehicleId);
    const keys = turnaround > 0 ? dayKeys(addDays(start, -turnaround), addDays(end, turnaround)) : dayKeys(start, end);
    const now = new Date();
    const blocking = await AvailabilityModel.findOne({
      vehicleId,
      dayKey: { $in: keys },
      ...(excludeHoldId ? { holdId: { $ne: excludeHoldId } } : {}),
      $or: [
        { state: { $in: ['blocked', 'booked'] } },
        { state: 'held', holdExpiresAt: { $gt: now } },
      ],
    }).lean();
    return !blocking;
  }

  /** Atomically reserve the range. The unique index rejects overlaps. */
  async placeHold(vehicleId: string, start: Date, end: Date): Promise<string> {
    const keys = dayKeys(start, end);
    const now = new Date();

    // Reclaim any expired holds in the range so they don't false-block.
    await AvailabilityModel.deleteMany({
      vehicleId,
      dayKey: { $in: keys },
      state: 'held',
      holdExpiresAt: { $lte: now },
    });

    const holdId = randomId();
    const expiresAt = new Date(Date.now() + (await holdTtlMs()));
    try {
      await AvailabilityModel.insertMany(
        keys.map((dayKey) => ({
          vehicleId,
          dayKey,
          state: 'held',
          holdId,
          holdExpiresAt: expiresAt,
        })),
        { ordered: true },
      );
    } catch (err) {
      // Duplicate key = another hold/booking took a day in the range.
      if ((err as { code?: number }).code === 11000) {
        await AvailabilityModel.deleteMany({ holdId }); // roll back partial hold
        throw new ConflictError('Vehicle is not available for the selected dates', 'NOT_AVAILABLE');
      }
      throw err;
    }
    return holdId;
  }

  async confirmHold(holdId: string, bookingId: string): Promise<void> {
    await AvailabilityModel.updateMany(
      { holdId },
      { $set: { state: 'booked', bookingId }, $unset: { holdExpiresAt: '' } },
    );
  }

  async releaseHold(holdId: string): Promise<void> {
    await AvailabilityModel.deleteMany({ holdId, state: 'held' });
  }

  async releaseBooking(bookingId: string): Promise<void> {
    await AvailabilityModel.deleteMany({ bookingId });
  }

  /**
   * Free only part of a booking's days — used when a trip is shortened, so the
   * released tail reopens for others while the days the guest keeps stay booked.
   */
  async releaseRange(bookingId: string, from: Date, to: Date): Promise<void> {
    const keys = dayKeys(from, to);
    await AvailabilityModel.deleteMany({ bookingId, dayKey: { $in: keys } });
  }

  /** Host blocks a range (maintenance / personal use / blackout dates). */
  async block(vehicleId: string, start: Date, end: Date): Promise<void> {
    const keys = dayKeys(start, end);
    await AvailabilityModel.bulkWrite(
      keys.map((dayKey) => ({
        updateOne: {
          filter: { vehicleId, dayKey },
          update: { $setOnInsert: { vehicleId, dayKey, state: 'blocked' } },
          upsert: true,
        },
      })),
    );
  }

  /** Host unblocks a range (only removes host blocks, never booked days). */
  async unblock(vehicleId: string, start: Date, end: Date): Promise<void> {
    const keys = dayKeys(start, end);
    await AvailabilityModel.deleteMany({ vehicleId, dayKey: { $in: keys }, state: 'blocked' });
  }

  /** Calendar view for a month/range: returns occupied days with their state. */
  async getCalendar(
    vehicleId: string,
    from: Date,
    to: Date,
  ): Promise<{ dayKey: string; state: string; bookingId?: string }[]> {
    const keys = dayKeys(from, to);
    const docs = await AvailabilityModel.find({ vehicleId, dayKey: { $in: keys } })
      .select('dayKey state bookingId')
      .lean();
    const now = new Date();
    return docs
      .filter((d) => !(d.state === 'held' && d.holdExpiresAt && d.holdExpiresAt <= now))
      .map((d) => ({ dayKey: d.dayKey, state: d.state, bookingId: d.bookingId }));
  }
}

export const availabilityService = new AvailabilityService();
