import { VehicleModel, type VehicleDoc } from '../infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { ReviewModel } from '../../reviews/infrastructure/review.model';
import { ClaimModel } from '../../claims/infrastructure/claim.model';
import { DocumentModel } from '../../documents/infrastructure/document.model';
import { hostService } from '../../hosts/application/host.service';
import { ForbiddenError, NotFoundError } from '../../../core/errors/app-error';
import { isCancelled, type BookingStatus } from '../../bookings/domain/booking-status';

/**
 * Everything about ONE car, in one read.
 *
 * A host deciding whether a particular vehicle is worth keeping has to answer:
 * what has it earned, how often is it actually rented, how do guests rate it,
 * has it cost me anything in claims, and is its paperwork about to lapse.
 * Spread across five screens those questions never get asked. Together they are
 * a verdict on the asset.
 */
export interface VehicleInsights {
  vehicle: Pick<VehicleDoc, '_id' | 'make' | 'model' | 'year' | 'status' | 'verificationStatus' | 'ratingAvg' | 'ratingCount' | 'totalTrips'>;
  earnings: {
    lifetime: number;
    last30d: number;
    /** Revenue per month, oldest first — the shape of the asset's income. */
    byMonth: { month: string; amount: number; trips: number }[];
    averagePerTrip: number;
  };
  utilisation: {
    completedTrips: number;
    cancelledTrips: number;
    /** Share of the last 90 days the car was actually on a trip. */
    occupancyPct: number;
    daysRented90d: number;
  };
  reviews: { average: number; count: number; recent: { rating: number; comment: string; createdAt: Date }[] };
  claims: { total: number; open: number; costToDate: number };
  documents: { category: string; status: string; expiresAt?: Date; expiringSoon: boolean }[];
  upcoming: { bookingId: string; code: string; start: Date; end: Date; status: string; earnings: number }[];
}

const DAY = 86_400_000;

export class VehicleInsightsService {
  async forVehicle(userId: string, vehicleId: string): Promise<VehicleInsights> {
    const vehicle = await VehicleModel.findOne({ _id: vehicleId, deletedAt: null }).lean<VehicleDoc>();
    if (!vehicle) throw new NotFoundError('Vehicle');

    // Only the owner sees an asset's finances.
    const host = await hostService.requireHostForUser(userId);
    if (vehicle.hostId !== host._id) throw new ForbiddenError('Not your vehicle');

    const now = Date.now();
    const [bookings, reviews, claims, documents] = await Promise.all([
      BookingModel.find({ vehicleId, deletedAt: null })
        .select('_id code period status priceBreakdown createdAt')
        .sort({ 'period.start': -1 })
        .lean<
          {
            _id: string; code: string; period: { start: Date; end: Date }; status: BookingStatus;
            priceBreakdown: { hostEarnings: { amount: number } }; createdAt: Date;
          }[]
        >(),
      ReviewModel.find({ vehicleId, status: 'published', deletedAt: null })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('rating comment createdAt')
        .lean<{ rating: number; comment: string; createdAt: Date }[]>(),
      ClaimModel.find({ deletedAt: null, bookingId: { $exists: true } })
        .select('bookingId status amountApproved')
        .lean<{ bookingId?: string; status: string; amountApproved?: number }[]>(),
      DocumentModel.find({ vehicleId, deletedAt: null })
        .select('category status expiresAt')
        .lean<{ category: string; status: string; expiresAt?: Date }[]>(),
    ]);

    const completed = bookings.filter((b) => b.status === 'completed');
    const earningsOf = (b: (typeof bookings)[number]) => b.priceBreakdown?.hostEarnings?.amount ?? 0;

    // ── Earnings ──────────────────────────────────────────────────────
    const lifetime = completed.reduce((s, b) => s + earningsOf(b), 0);
    const last30d = completed
      .filter((b) => new Date(b.period.end).getTime() >= now - 30 * DAY)
      .reduce((s, b) => s + earningsOf(b), 0);

    const monthly = new Map<string, { amount: number; trips: number }>();
    for (const b of completed) {
      const key = new Date(b.period.end).toISOString().slice(0, 7); // YYYY-MM
      const row = monthly.get(key) ?? { amount: 0, trips: 0 };
      row.amount += earningsOf(b);
      row.trips += 1;
      monthly.set(key, row);
    }
    const byMonth = [...monthly.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));

    // ── Utilisation ───────────────────────────────────────────────────
    // Days actually on a trip within the last 90, clamped to the window so a
    // long trip that started earlier doesn't count time outside it.
    const windowStart = now - 90 * DAY;
    let rentedMs = 0;
    for (const b of bookings) {
      if (isCancelled(b.status) || b.status === 'declined' || b.status === 'expired') continue;
      const s = Math.max(new Date(b.period.start).getTime(), windowStart);
      const e = Math.min(new Date(b.period.end).getTime(), now);
      if (e > s) rentedMs += e - s;
    }
    const daysRented90d = Math.round(rentedMs / DAY);

    // ── Claims that touched this car ──────────────────────────────────
    const bookingIds = new Set(bookings.map((b) => b._id));
    const mine = claims.filter((c) => c.bookingId && bookingIds.has(c.bookingId));

    return {
      vehicle: {
        _id: vehicle._id,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        status: vehicle.status,
        verificationStatus: vehicle.verificationStatus,
        ratingAvg: vehicle.ratingAvg,
        ratingCount: vehicle.ratingCount,
        totalTrips: vehicle.totalTrips,
      },
      earnings: {
        lifetime,
        last30d,
        byMonth,
        averagePerTrip: completed.length ? Math.round(lifetime / completed.length) : 0,
      },
      utilisation: {
        completedTrips: completed.length,
        cancelledTrips: bookings.filter((b) => isCancelled(b.status)).length,
        occupancyPct: Math.min(100, Math.round((daysRented90d / 90) * 100)),
        daysRented90d,
      },
      reviews: {
        average: vehicle.ratingAvg ?? 0,
        count: vehicle.ratingCount ?? 0,
        recent: reviews,
      },
      claims: {
        total: mine.length,
        open: mine.filter((c) => !['settled', 'rejected', 'closed'].includes(c.status)).length,
        costToDate: mine.reduce((s, c) => s + (c.amountApproved ?? 0), 0),
      },
      documents: documents.map((d) => ({
        category: d.category,
        status: d.status,
        expiresAt: d.expiresAt,
        // 30 days is enough warning to actually renew something.
        expiringSoon: !!d.expiresAt && new Date(d.expiresAt).getTime() - now < 30 * DAY,
      })),
      upcoming: bookings
        .filter((b) => ['paid', 'confirmed', 'in_progress', 'pending_approval'].includes(b.status))
        .filter((b) => new Date(b.period.end).getTime() >= now)
        .sort((a, b) => +new Date(a.period.start) - +new Date(b.period.start))
        .slice(0, 10)
        .map((b) => ({
          bookingId: b._id,
          code: b.code,
          start: b.period.start,
          end: b.period.end,
          status: b.status,
          earnings: earningsOf(b),
        })),
    };
  }
}

export const vehicleInsightsService = new VehicleInsightsService();
