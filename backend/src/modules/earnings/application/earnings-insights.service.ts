import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { hostService } from '../../hosts/application/host.service';

/**
 * Earnings insight — the questions a host with more than one car actually has.
 *
 * The existing performance endpoint reports what happened: revenue by month,
 * revenue by car, occupancy. All true, none of it decides anything. A host
 * looking at "Car A made $4,000, Car B made $2,600" cannot act, because Car B
 * may have been listed half as long and be the better asset per day it was
 * available.
 *
 * So this reports rates rather than totals:
 *
 *  - REVENUE PER AVAILABLE DAY is the fleet metric. It is how a $200/day car
 *    booked five times gets compared honestly against a $60/day car booked
 *    twenty-five times, and it is usually the opposite of what the totals say.
 *
 *  - IDLE COST prices the empty days. A car sitting unbooked is not neutral, it
 *    is the daily rate not earned, and naming that number is what makes a host
 *    reprice instead of shrug.
 *
 *  - DAY OF WEEK answers whether the weekend multiplier is set correctly, which
 *    is the single most common pricing mistake on this kind of platform.
 *
 *  - LEAD TIME answers whether early-bird or last-minute pricing is worth
 *    running at all, rather than leaving both switched on out of superstition.
 */

const DAY_MS = 86_400_000;

export interface VehicleEconomics {
  vehicleId: string;
  label: string;
  dailyPriceCents: number;
  trips: number;
  /** Host's share, not what the guest paid. */
  earnedCents: number;
  /** Days the trip actually covered. */
  daysBooked: number;
  /** Days the car has been available in the window. */
  daysAvailable: number;
  /** earnedCents / daysAvailable — the number to rank a fleet by. */
  revPerAvailableDayCents: number;
  utilisationPct: number;
  /** Idle days priced at the car's own rate: the cost of doing nothing. */
  idleCostCents: number;
}

export interface EarningsInsights {
  windowDays: number;
  currency: string;
  fleet: VehicleEconomics[];
  /** Where the guest's money went, across the window. */
  split: { grossCents: number; commissionCents: number; netCents: number; commissionPct: number };
  /** Host earnings by day of the week the trip started. */
  byWeekday: { weekday: number; label: string; trips: number; earnedCents: number }[];
  /** How far ahead guests booked. */
  leadTime: { bucket: string; trips: number; earnedCents: number }[];
  /** The single most useful sentence we can produce from the above. */
  headline: string | null;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function leadBucket(days: number): string {
  if (days < 1) return 'Same day';
  if (days < 3) return '1-2 days';
  if (days < 7) return '3-6 days';
  if (days < 30) return '1-4 weeks';
  return 'Over a month';
}
const BUCKET_ORDER = ['Same day', '1-2 days', '3-6 days', '1-4 weeks', 'Over a month'];

export const earningsInsightsService = {
  async insights(userId: string, windowDays = 90): Promise<EarningsInsights> {
    const host = await hostService.requireHostForUser(userId);
    const since = new Date(Date.now() - windowDays * DAY_MS);

    const vehicles = await VehicleModel.find({ hostId: host._id, deletedAt: null }).lean<VehicleDoc[]>();
    const bookings = await BookingModel.find({
      hostId: host._id,
      status: 'completed',
      'period.start': { $gte: since },
    }).lean();

    const currency = bookings[0]?.priceBreakdown?.currency ?? 'USD';

    // ── Per-vehicle economics ────────────────────────────────────────
    const byVehicle = new Map<string, { trips: number; earned: number; days: number }>();
    for (const b of bookings) {
      const cur = byVehicle.get(b.vehicleId) ?? { trips: 0, earned: 0, days: 0 };
      cur.trips += 1;
      cur.earned += b.priceBreakdown?.hostEarnings?.amount ?? 0;
      cur.days += b.priceBreakdown?.days ?? 0;
      byVehicle.set(b.vehicleId, cur);
    }

    const fleet: VehicleEconomics[] = vehicles.map((v) => {
      const agg = byVehicle.get(v._id) ?? { trips: 0, earned: 0, days: 0 };
      // A car listed three weeks ago has not had 90 days to earn, and judging
      // it against one that has would be arithmetic dressed as insight.
      const listedFor = Math.max(
        1,
        Math.min(windowDays, Math.ceil((Date.now() - new Date(v.createdAt).getTime()) / DAY_MS)),
      );
      const daysBooked = Math.min(agg.days, listedFor);
      const idleDays = Math.max(0, listedFor - daysBooked);
      const daily = v.pricing?.dailyPrice ?? 0;
      return {
        vehicleId: v._id,
        label: `${v.year} ${v.make} ${v.model}`,
        dailyPriceCents: daily,
        trips: agg.trips,
        earnedCents: agg.earned,
        daysBooked,
        daysAvailable: listedFor,
        revPerAvailableDayCents: Math.round(agg.earned / listedFor),
        utilisationPct: Math.round((daysBooked / listedFor) * 100),
        idleCostCents: idleDays * daily,
      };
    }).sort((a, b) => b.revPerAvailableDayCents - a.revPerAvailableDayCents);

    // ── Where the money went ─────────────────────────────────────────
    let gross = 0, commission = 0, net = 0;
    for (const b of bookings) {
      gross += b.priceBreakdown?.subtotal?.amount ?? 0;
      commission += b.priceBreakdown?.commission?.amount ?? 0;
      net += b.priceBreakdown?.hostEarnings?.amount ?? 0;
    }

    // ── Weekday and lead time ────────────────────────────────────────
    const weekdayMap = new Map<number, { trips: number; earned: number }>();
    const leadMap = new Map<string, { trips: number; earned: number }>();
    for (const b of bookings) {
      const earned = b.priceBreakdown?.hostEarnings?.amount ?? 0;
      const start = new Date(b.period.start);

      const wd = start.getDay();
      const w = weekdayMap.get(wd) ?? { trips: 0, earned: 0 };
      w.trips += 1; w.earned += earned; weekdayMap.set(wd, w);

      const lead = (start.getTime() - new Date(b.createdAt).getTime()) / DAY_MS;
      const bucket = leadBucket(lead);
      const l = leadMap.get(bucket) ?? { trips: 0, earned: 0 };
      l.trips += 1; l.earned += earned; leadMap.set(bucket, l);
    }

    const byWeekday = WEEKDAYS.map((label, i) => ({
      weekday: i,
      label,
      trips: weekdayMap.get(i)?.trips ?? 0,
      earnedCents: weekdayMap.get(i)?.earned ?? 0,
    }));

    const leadTime = BUCKET_ORDER.filter((b) => leadMap.has(b)).map((bucket) => ({
      bucket,
      trips: leadMap.get(bucket)!.trips,
      earnedCents: leadMap.get(bucket)!.earned,
    }));

    return {
      windowDays,
      currency,
      fleet,
      split: {
        grossCents: gross,
        commissionCents: commission,
        netCents: net,
        commissionPct: gross > 0 ? Math.round((commission / gross) * 1000) / 10 : 0,
      },
      byWeekday,
      leadTime,
      headline: this.headline(fleet, byWeekday),
    };
  },

  /**
   * One sentence, or none.
   *
   * A dashboard that always produces advice produces noise, so this returns
   * null unless the data actually supports a claim: a fleet needs two cars
   * before they can be compared, and a weekday needs trips before its average
   * means anything.
   */
  headline(fleet: VehicleEconomics[], byWeekday: EarningsInsights['byWeekday']): string | null {
    const earning = fleet.filter((f) => f.trips > 0);

    if (earning.length >= 2) {
      const best = earning[0];
      const worst = earning[earning.length - 1];
      if (best.revPerAvailableDayCents > worst.revPerAvailableDayCents * 1.5) {
        return `${best.label} earns ${Math.round(
          best.revPerAvailableDayCents / Math.max(1, worst.revPerAvailableDayCents),
        )}x more per available day than ${worst.label}. Look at ${worst.label}'s price and photos.`;
      }
    }

    const busiest = [...byWeekday].filter((d) => d.trips > 0).sort((a, b) => b.trips - a.trips)[0];
    if (busiest && busiest.trips >= 3) {
      return `${busiest.label} is your busiest start day — ${busiest.trips} trips began then.`;
    }

    const idle = fleet.filter((f) => f.idleCostCents > 0).sort((a, b) => b.idleCostCents - a.idleCostCents)[0];
    if (idle && idle.trips === 0 && idle.daysAvailable >= 14) {
      return `${idle.label} has not been booked once in ${idle.daysAvailable} days listed. Something is wrong with its price, photos or availability.`;
    }

    return null;
  },
};
