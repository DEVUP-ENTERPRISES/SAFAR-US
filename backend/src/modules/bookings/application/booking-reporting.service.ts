import { BookingModel, type BookingDoc } from '../infrastructure/booking.model';

/**
 * Read-only booking analytics and reporting.
 *
 * Split out of booking.service.ts, which had grown to carry the whole booking
 * lifecycle AND every aggregation the admin, fleet and corporate dashboards
 * read. These methods share none of the lifecycle's state-machine internals —
 * they only run aggregations over BookingModel — so they live on their own,
 * where they can grow (new dashboards, new cohorts) without enlarging the
 * transactional core.
 *
 * Behaviour is unchanged: these are the exact method bodies that were on the
 * booking service, moved verbatim.
 */
export class BookingReportingService {
  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return BookingModel.countDocuments({ deletedAt: null, ...filter });
  }

  /** All bookings billed to an org within a period (consolidated invoicing). */
  async orgBookings(orgId: string, from?: Date, to?: Date): Promise<BookingDoc[]> {
    const filter: Record<string, unknown> = { orgId, deletedAt: null };
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.$gte = from;
      if (to) range.$lte = to;
      filter.createdAt = range;
    }
    return BookingModel.find(filter).sort({ createdAt: -1 }).lean<BookingDoc[]>();
  }

  /** Gross Merchandise Value = sum of totals for paid+completed bookings. */
  async gmv(): Promise<number> {
    const [row] = await BookingModel.aggregate<{ total: number }>([
      { $match: { status: { $in: ['paid', 'in_progress', 'completed'] } } },
      { $group: { _id: null, total: { $sum: '$priceBreakdown.total.amount' } } },
    ]).exec();
    return row?.total ?? 0;
  }

  /** Daily bookings + GMV for the last N days (analytics chart). */
  async dailySeries(days = 14): Promise<{ day: string; bookings: number; gmv: number }[]> {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await BookingModel.aggregate<{ _id: string; bookings: number; gmv: number }>([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          bookings: { $sum: 1 },
          gmv: {
            $sum: {
              $cond: [
                { $in: ['$status', ['paid', 'in_progress', 'completed']] },
                '$priceBreakdown.total.amount',
                0,
              ],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec();
    // A day with no bookings produces no group, so the raw aggregate silently
    // omits it — the chart would then draw a quiet day adjacent to a busy one
    // as if they were consecutive. Fill the calendar so the axis tells the truth.
    const found = new Map(rows.map((r) => [r._id, r]));
    const series: { day: string; bookings: number; gmv: number }[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const hit = found.get(day);
      series.push({ day, bookings: hit?.bookings ?? 0, gmv: hit?.gmv ?? 0 });
    }
    return series;
  }

  /**
   * Where demand actually is. Bookings don't carry a city or category of their
   * own — those live on the vehicle — so this joins through to the listing
   * rather than denormalising fields that could drift out of sync.
   */
  async demandBreakdown(
    days = 30,
  ): Promise<{ cities: { key: string; trips: number; gmv: number }[]; categories: { key: string; trips: number; gmv: number }[] }> {
    const since = new Date(Date.now() - days * 86_400_000);
    const stage = (key: string) => [
      { $match: { createdAt: { $gte: since } } },
      {
        $lookup: {
          from: 'vehicles', localField: 'vehicleId', foreignField: '_id', as: 'v',
        },
      },
      { $unwind: '$v' },
      {
        $group: {
          _id: { $ifNull: [`$v.${key}`, 'unknown'] },
          trips: { $sum: 1 },
          gmv: {
            $sum: {
              $cond: [
                { $in: ['$status', ['paid', 'in_progress', 'completed']] },
                '$priceBreakdown.total.amount',
                0,
              ],
            },
          },
        },
      },
      { $sort: { trips: -1 as const } },
      { $limit: 8 },
    ];

    const [cities, categories] = await Promise.all([
      BookingModel.aggregate<{ _id: string; trips: number; gmv: number }>(stage('location.city')).exec(),
      BookingModel.aggregate<{ _id: string; trips: number; gmv: number }>(stage('category')).exec(),
    ]);

    const shape = (rows: { _id: string; trips: number; gmv: number }[]) =>
      rows.map((r) => ({ key: r._id || 'unknown', trips: r.trips, gmv: r.gmv }));
    return { cities: shape(cities), categories: shape(categories) };
  }

  async statusBreakdown(): Promise<{ status: string; count: number }[]> {
    const rows = await BookingModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).exec();
    return rows.map((r) => ({ status: r._id, count: r.count }));
  }

  /** Per-vehicle completed-booking economics (fleet P&L). */
  async earningsByVehicle(
    vehicleIds: string[],
  ): Promise<Record<string, { trips: number; gross: number; commission: number; tax: number; hostEarnings: number }>> {
    if (vehicleIds.length === 0) return {};
    const rows = await BookingModel.aggregate<{
      _id: string;
      trips: number;
      gross: number;
      commission: number;
      tax: number;
      hostEarnings: number;
    }>([
      { $match: { vehicleId: { $in: vehicleIds }, status: 'completed' } },
      {
        $group: {
          _id: '$vehicleId',
          trips: { $sum: 1 },
          gross: { $sum: '$priceBreakdown.total.amount' },
          commission: { $sum: '$priceBreakdown.commission.amount' },
          tax: { $sum: '$priceBreakdown.tax.amount' },
          hostEarnings: { $sum: '$priceBreakdown.hostEarnings.amount' },
        },
      },
    ]).exec();
    const map: Record<string, { trips: number; gross: number; commission: number; tax: number; hostEarnings: number }> = {};
    for (const r of rows) {
      map[r._id] = { trips: r.trips, gross: r.gross, commission: r.commission, tax: r.tax, hostEarnings: r.hostEarnings };
    }
    return map;
  }

  /** Aggregated completed-trip stats for a set of vehicles (fleet analytics). */
  async completedStatsForVehicles(
    vehicleIds: string[],
  ): Promise<{ trips: number; revenue: number }> {
    const [row] = await BookingModel.aggregate<{ trips: number; revenue: number }>([
      { $match: { vehicleId: { $in: vehicleIds }, status: 'completed' } },
      {
        $group: {
          _id: null,
          trips: { $sum: 1 },
          revenue: { $sum: '$priceBreakdown.hostEarnings.amount' },
        },
      },
    ]).exec();
    return { trips: row?.trips ?? 0, revenue: row?.revenue ?? 0 };
  }
}

export const bookingReportingService = new BookingReportingService();
