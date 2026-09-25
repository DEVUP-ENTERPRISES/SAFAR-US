import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { AvailabilityModel, type AvailabilityDoc } from '../infrastructure/availability.model';
import { ConflictError } from '../../../core/errors/app-error';
import { randomId } from '../../../shared/utils/uuid';
import type { IAvailabilityContract } from '../../../core/contracts/availability.contract';
import { platformConfigService } from '../../platform-config/application/platform-config.service';

// How long a checkout hold survives is operational policy (it trades abandoned
// carts against inventory being locked up), so it lives in PlatformConfig.
const holdTtlMs = async (): Promise<number> =>
  (await platformConfigService.get()).booking.checkoutHoldMinutes * 60 * 1000;

/** Enumerate the UTC day keys occupied by a [start, end] rental (inclusive). */
export function dayKeys(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (d <= last) {
    keys.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return keys;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

/** The first UTC day after the one `d` falls on, at 00:00 — where an extension's extra days begin. */
export function dayAfter(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

export interface BlockingRow {
  dayKey: string;
  state: 'blocked' | 'held' | 'booked';
  bookingId?: string;
  holdId?: string;
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
    excludeBookingId?: string,
  ): Promise<boolean> {
    // Widen the window by the host's turnaround so a new trip cannot start
    // inside the gap they keep for cleaning and servicing. Checked here rather
    // than written into the calendar so a host can change the setting without
    // rewriting every future day.
    return (await this.blockingRows(vehicleId, start, end, { excludeHoldId, excludeBookingId }, 1)).length === 0;
  }

  /** Every live row in the way of the range, with isAvailable's turnaround widening. */
  async blockingRows(
    vehicleId: string,
    start: Date,
    end: Date,
    opts: { excludeHoldId?: string; excludeBookingId?: string } = {},
    limit = 200,
  ): Promise<BlockingRow[]> {
    const turnaround = await this.turnaroundDays(vehicleId);
    const keys = turnaround > 0 ? dayKeys(addDays(start, -turnaround), addDays(end, turnaround)) : dayKeys(start, end);
    const now = new Date();
    return AvailabilityModel.find(
      {
        vehicleId,
        dayKey: { $in: keys },
        ...(opts.excludeHoldId ? { holdId: { $ne: opts.excludeHoldId } } : {}),
        ...(opts.excludeBookingId ? { bookingId: { $ne: opts.excludeBookingId } } : {}),
        $or: [
          { state: { $in: ['blocked', 'booked'] } },
          { state: 'held', holdExpiresAt: { $gt: now } },
        ],
      },
      { dayKey: 1, state: 1, bookingId: 1, holdId: 1 },
    )
      .limit(limit)
      .lean<BlockingRow[]>();
  }

  /** Take a booking's days off the calendar, returning them so they can be put back. */
  async detachBooking(bookingId: string): Promise<AvailabilityDoc[]> {
    const rows = await AvailabilityModel.find({ bookingId }).lean<AvailabilityDoc[]>();
    await AvailabilityModel.deleteMany({ bookingId });
    return rows;
  }

  /** Put back rows removed by detachBooking (a rolled-back swap). */
  async restoreRows(rows: AvailabilityDoc[]): Promise<void> {
    if (rows.length === 0) return;
    await AvailabilityModel.insertMany(rows, { ordered: true });
  }

  /**
   * The same question as isAvailable, asked about many cars at once.
   *
   * Search called isAvailable in a sequential loop over every candidate, and
   * each call costs two round trips (the turnaround lookup, then the calendar
   * probe). With the default page that is up to sixty candidates — a hundred
   * and twenty queries, run one after another, on the hottest endpoint in the
   * product. This answers the whole page in two.
   *
   * The semantics are deliberately identical: each car keeps its OWN turnaround
   * window, so the keys are unioned for the fetch and then narrowed per vehicle
   * in memory rather than applying one shared window to everybody.
   */
  async availableAmong(vehicleIds: string[], start: Date, end: Date): Promise<Set<string>> {
    const free = new Set<string>();
    if (vehicleIds.length === 0) return free;

    // 1. Every turnaround in one read.
    const vehicles = await VehicleModel.find(
      { _id: { $in: vehicleIds } },
      { 'listing.turnaroundDays': 1 },
    ).lean<{ _id: string; listing?: { turnaroundDays?: number } }[]>();

    const turnaroundOf = new Map<string, number>();
    for (const v of vehicles) {
      turnaroundOf.set(String(v._id), Math.max(0, Math.min(7, v.listing?.turnaroundDays ?? 0)));
    }

    // 2. Each car's own key range, plus the union to fetch against.
    const keysOf = new Map<string, Set<string>>();
    const union = new Set<string>();
    for (const id of vehicleIds) {
      const t = turnaroundOf.get(id) ?? 0;
      const keys = t > 0 ? dayKeys(addDays(start, -t), addDays(end, t)) : dayKeys(start, end);
      keysOf.set(id, new Set(keys));
      for (const k of keys) union.add(k);
    }

    // 3. One calendar probe for the whole page. Same blocking predicate as
    //    isAvailable — booked and blocked always count, a hold only while it
    //    has not expired.
    const now = new Date();
    const blocking = await AvailabilityModel.find(
      {
        vehicleId: { $in: vehicleIds },
        dayKey: { $in: [...union] },
        $or: [
          { state: { $in: ['blocked', 'booked'] } },
          { state: 'held', holdExpiresAt: { $gt: now } },
        ],
      },
      { vehicleId: 1, dayKey: 1 },
    ).lean<{ vehicleId: string; dayKey: string }[]>();

    // A row only blocks the car it belongs to, and only on a day inside THAT
    // car's window — the union is wider than any single vehicle's range.
    const blockedOf = new Map<string, Set<string>>();
    for (const row of blocking) {
      const id = String(row.vehicleId);
      let set = blockedOf.get(id);
      if (!set) blockedOf.set(id, (set = new Set()));
      set.add(row.dayKey);
    }

    for (const id of vehicleIds) {
      const blocked = blockedOf.get(id);
      if (!blocked) {
        free.add(id);
        continue;
      }
      const mine = keysOf.get(id)!;
      let hit = false;
      for (const k of blocked) {
        if (mine.has(k)) {
          hit = true;
          break;
        }
      }
      if (!hit) free.add(id);
    }
    return free;
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

  /** Keep a hold alive as long as the booking behind it is still pending. */
  async extendHold(holdId: string, until: Date): Promise<void> {
    await AvailabilityModel.updateMany(
      { holdId, state: 'held' },
      { $set: { holdExpiresAt: until } },
    );
  }

  /** Whether a hold still exists — a TTL-expired hold has silently freed its dates. */
  async holdExists(holdId: string): Promise<boolean> {
    return !!(await AvailabilityModel.exists({ holdId }));
  }

  /** Turn a hold into a booking; throws if the hold had lapsed, so a trip is never confirmed on dates that were released. */
  async confirmHold(holdId: string, bookingId: string, expectedRows?: number): Promise<void> {
    const res = await AvailabilityModel.updateMany(
      { holdId, state: 'held' },
      { $set: { state: 'booked', bookingId }, $unset: { holdExpiresAt: '' } },
    );
    // A repeat confirm finds the rows already booked for this booking, which is fine.
    const already = res.modifiedCount === 0 ? await AvailabilityModel.countDocuments({ holdId, bookingId, state: 'booked' }) : 0;
    const confirmed = res.modifiedCount + already;
    if (confirmed === 0 || (expectedRows !== undefined && confirmed !== expectedRows)) {
      throw new ConflictError('These dates are no longer held for this booking.', 'HOLD_LOST');
    }
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
  ): Promise<{ dayKey: string; state: string }[]> {
    const keys = dayKeys(from, to);
    const docs = await AvailabilityModel.find({ vehicleId, dayKey: { $in: keys } })
      .select('dayKey state holdExpiresAt')
      .lean();
    const now = new Date();
    return docs
      .filter((d) => !(d.state === 'held' && d.holdExpiresAt && d.holdExpiresAt <= now))
      .map((d) => ({ dayKey: d.dayKey, state: d.state }));
  }
}

export const availabilityService = new AvailabilityService();
