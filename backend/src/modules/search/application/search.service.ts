import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import type { PlatformConfigDoc } from '../../platform-config/infrastructure/platform-config.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { availabilityService } from '../../availability/application/availability.service';

export type SortKey = 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'trending' | 'newest';

export interface SearchQuery {
  lng: number;
  lat: number;
  radiusKm?: number;
  make?: string;
  bodyType?: string;
  category?: string;
  fuelType?: string;
  transmission?: string;
  seatsMin?: number;
  yearMin?: number;
  yearMax?: number;
  priceMin?: number;
  priceMax?: number;
  instantBook?: boolean;
  delivery?: boolean; // any delivery option offered
  ratingMin?: number;
  features?: string; // comma-separated
  start?: Date;
  end?: Date;
  sort?: SortKey;
  limit?: number;
}

/**
 * Geo + attribute search over listed, verified vehicles. Availability-aware
 * when a date range is supplied. Backed by MongoDB 2dsphere today; the
 * adapter boundary lets us move to Elasticsearch/Atlas Search later.
 */
export class SearchService {
  async searchVehicles(q: SearchQuery): Promise<VehicleDoc[]> {
    const radiusMeters = (q.radiusKm ?? 25) * 1000;
    const limit = Math.min(q.limit ?? 24, 50);

    const filter: Record<string, unknown> = {
      status: 'listed',
      verificationStatus: 'verified',
      deletedAt: null,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [q.lng, q.lat] },
          $maxDistance: radiusMeters,
        },
      },
    };
    if (q.make) filter.make = new RegExp(`^${escapeRegex(q.make)}`, 'i');
    if (q.bodyType) filter.bodyType = q.bodyType;
    if (q.category) filter.category = q.category;
    if (q.fuelType) filter.fuelType = q.fuelType;
    if (q.transmission) filter.transmission = q.transmission;
    if (q.seatsMin) filter.seats = { $gte: q.seatsMin };
    if (q.yearMin || q.yearMax) {
      const year: Record<string, number> = {};
      if (q.yearMin) year.$gte = q.yearMin;
      if (q.yearMax) year.$lte = q.yearMax;
      filter.year = year;
    }
    if (q.instantBook !== undefined) filter['listing.instantBook'] = q.instantBook;
    if (q.ratingMin) filter.ratingAvg = { $gte: q.ratingMin };
    if (q.delivery) {
      filter.$or = [
        { 'listing.delivery.airport': true },
        { 'listing.delivery.home': true },
        { 'listing.delivery.hotel': true },
        { 'listing.delivery.business': true },
      ];
    }
    if (q.priceMin || q.priceMax) {
      const price: Record<string, number> = {};
      if (q.priceMin) price.$gte = q.priceMin;
      if (q.priceMax) price.$lte = q.priceMax;
      filter['pricing.dailyPrice'] = price;
    }
    if (q.features) {
      const feats = q.features.split(',').map((f) => f.trim()).filter(Boolean);
      if (feats.length) filter.features = { $all: feats };
    }

    // $near already sorts by distance (relevance). For explicit sorts we apply
    // an in-memory sort after fetching (fine at this catalog size; a dedicated
    // search engine handles this at scale).
    const fetchLimit = q.start && q.end ? limit * 3 : limit;
    const candidates = await VehicleModel.find(filter).limit(fetchLimit).lean<VehicleDoc[]>();

    let results = candidates;
    if (q.start && q.end) {
      // One batched probe rather than a sequential isAvailable per candidate.
      // That loop cost two round trips each — up to 120 serial queries for a
      // single page of results.
      const free = await availabilityService.availableAmong(
        candidates.map((v) => v._id),
        q.start,
        q.end,
      );
      results = candidates.filter((v) => free.has(v._id));
    }

    const sort = q.sort ?? 'relevance';
    results = this.applySort(results, sort);
    // Superhost ranking boost (stable) — surfaces top hosts on the default views.
    if (['relevance', 'trending', 'rating'].includes(sort)) {
      results = [...results].sort((a, b) => Number(!!b.hostIsSuperhost) - Number(!!a.hostIsSuperhost));
    }
    return results.slice(0, limit);
  }

  /**
   * How many cars each filter option would actually return, in this area, with
   * the guest's other filters still applied.
   *
   * Filtering blind is the worst part of every car-rental search: you pick
   * "Electric", get nothing, undo it, try "7 seats", get nothing, and give up
   * with no idea which combination has supply. Counts turn that into one
   * glance — and an option showing zero can be disabled rather than offered as
   * a dead end.
   *
   * Each dimension is counted with its OWN filter removed. That is what makes
   * the number mean "what I'd get if I picked this" rather than "what I have
   * now", so switching between options in the same group behaves sanely.
   */
  async filterCounts(q: SearchQuery): Promise<{
    total: number;
    category: Record<string, number>;
    bodyType: Record<string, number>;
    fuelType: Record<string, number>;
    transmission: Record<string, number>;
    seats: Record<string, number>;
    make: Record<string, number>;
    instantBook: number;
    delivery: number;
    priceRange: { min: number; max: number } | null;
  }> {
    // $near is illegal inside an aggregation $match (it implies a sort), and
    // counting has no use for distance ordering anyway — $geoWithin expresses
    // "inside this radius" without one. Radians, per $centerSphere.
    const EARTH_RADIUS_KM = 6378.1;
    const radiusRadians = (q.radiusKm ?? 25) / EARTH_RADIUS_KM;

    /** The filter for everything EXCEPT the named dimension. */
    const build = (except?: keyof SearchQuery): Record<string, unknown> => {
      const f: Record<string, unknown> = {
        status: 'listed',
        verificationStatus: 'verified',
        deletedAt: null,
        location: {
          $geoWithin: { $centerSphere: [[q.lng, q.lat], radiusRadians] },
        },
      };
      if (q.category && except !== 'category') f.category = q.category;
      if (q.bodyType && except !== 'bodyType') f.bodyType = q.bodyType;
      if (q.fuelType && except !== 'fuelType') f.fuelType = q.fuelType;
      if (q.transmission && except !== 'transmission') f.transmission = q.transmission;
      if (q.seatsMin && except !== 'seatsMin') f.seats = { $gte: q.seatsMin };
      if (q.make && except !== 'make') f.make = new RegExp(`^${escapeRegex(q.make)}`, 'i');
      if (q.instantBook !== undefined && except !== 'instantBook') f['listing.instantBook'] = q.instantBook;
      if (q.ratingMin && except !== 'ratingMin') f.ratingAvg = { $gte: q.ratingMin };
      if (q.yearMin || q.yearMax) {
        const year: Record<string, number> = {};
        if (q.yearMin) year.$gte = q.yearMin;
        if (q.yearMax) year.$lte = q.yearMax;
        if (except !== 'yearMin' && except !== 'yearMax') f.year = year;
      }
      if ((q.priceMin || q.priceMax) && except !== 'priceMin' && except !== 'priceMax') {
        const price: Record<string, number> = {};
        if (q.priceMin) price.$gte = q.priceMin;
        if (q.priceMax) price.$lte = q.priceMax;
        f['pricing.dailyPrice'] = price;
      }
      return f;
    };

    const countBy = async (field: string, except: keyof SearchQuery): Promise<Record<string, number>> => {
      const rows = await VehicleModel.aggregate<{ _id: string | number; n: number }>([
        { $match: build(except) },
        { $group: { _id: `$${field}`, n: { $sum: 1 } } },
      ]);
      const out: Record<string, number> = {};
      for (const r of rows) if (r._id !== null && r._id !== undefined) out[String(r._id)] = r.n;
      return out;
    };

    const [total, category, bodyType, fuelType, transmission, make, seatRows, instantBook, delivery, priceAgg] =
      await Promise.all([
        VehicleModel.countDocuments(build()),
        countBy('category', 'category'),
        countBy('bodyType', 'bodyType'),
        countBy('fuelType', 'fuelType'),
        countBy('transmission', 'transmission'),
        countBy('make', 'make'),
        VehicleModel.aggregate<{ _id: number; n: number }>([
          { $match: build('seatsMin') },
          { $group: { _id: '$seats', n: { $sum: 1 } } },
        ]),
        VehicleModel.countDocuments({ ...build('instantBook'), 'listing.instantBook': true }),
        VehicleModel.countDocuments({
          ...build(),
          $or: [
            { 'listing.delivery.airport': true },
            { 'listing.delivery.home': true },
            { 'listing.delivery.hotel': true },
            { 'listing.delivery.business': true },
          ],
        }),
        VehicleModel.aggregate<{ min: number; max: number }>([
          { $match: build('priceMin') },
          { $group: { _id: null, min: { $min: '$pricing.dailyPrice' }, max: { $max: '$pricing.dailyPrice' } } },
        ]),
      ]);

    // "5+ seats" means every car with at least five, so the buckets accumulate
    // downward rather than counting exact seat numbers.
    const seats: Record<string, number> = {};
    for (const bucket of [2, 4, 5, 7]) {
      seats[String(bucket)] = seatRows.filter((r) => r._id >= bucket).reduce((sum, r) => sum + r.n, 0);
    }

    return {
      total,
      category,
      bodyType,
      fuelType,
      transmission,
      seats,
      make,
      instantBook,
      delivery,
      priceRange: priceAgg[0] ? { min: priceAgg[0].min, max: priceAgg[0].max } : null,
    };
  }

  /**
   * "Similar cars" for a vehicle's detail page — nearby, listed, verified cars
   * other than this one, ranked same-category-first then by rating. When a date
   * range is supplied, only cars actually free for those dates are returned, so
   * the strip reads "similar cars for your dates" honestly.
   */
  async similarTo(
    vehicleId: string,
    opts: { start?: Date; end?: Date; limit?: number } = {},
  ): Promise<VehicleDoc[]> {
    const limit = Math.min(opts.limit ?? 8, 12);
    const base = await VehicleModel.findOne({ _id: vehicleId }).lean<VehicleDoc>();
    if (!base) return [];

    const filter: Record<string, unknown> = {
      _id: { $ne: vehicleId },
      status: 'listed',
      verificationStatus: 'verified',
      deletedAt: null,
    };
    const coords = base.location?.coordinates;
    if (coords && coords.length === 2) {
      filter.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: coords },
          $maxDistance: 100_000, // 100 km — same metro
        },
      };
    }

    const candidates = await VehicleModel.find(filter).limit(limit * 4).lean<VehicleDoc[]>();

    let pool = candidates;
    if (opts.start && opts.end) {
      const free = await availabilityService.availableAmong(
        candidates.map((v) => v._id),
        opts.start,
        opts.end,
      );
      pool = candidates.filter((v) => free.has(v._id));
    }

    // Same category first (the closest substitute), then better-rated.
    pool = [...pool].sort(
      (a, b) =>
        Number(b.category === base.category) - Number(a.category === base.category) ||
        (b.ratingAvg || 0) - (a.ratingAvg || 0),
    );
    return pool.slice(0, limit);
  }

  /**
   * "For You" — personalized recommendations derived from the user's own
   * booking history. We build a lightweight taste profile (preferred
   * categories, body types, price band, and last city) and score fresh,
   * available candidates by affinity to it. No external LLM: the signal is
   * the user's real behaviour, so it is explainable and privacy-preserving.
   * Cold-start (no history) gracefully falls back to top-rated nearby cars.
   */
  async recommendFor(userId: string, limit = 12): Promise<VehicleDoc[]> {
    const past = await BookingModel.find({ guestId: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('vehicleId')
      .lean<{ vehicleId: string }[]>();

    const bookedIds = [...new Set(past.map((b) => b.vehicleId))];
    const bookedVehicles = bookedIds.length
      ? await VehicleModel.find({ _id: { $in: bookedIds } }).lean<VehicleDoc[]>()
      : [];

    // Build the taste profile from previously booked vehicles.
    const catWeight = new Map<string, number>();
    const bodyWeight = new Map<string, number>();
    let priceSum = 0;
    let priceN = 0;
    let anchor: [number, number] | undefined;
    for (const v of bookedVehicles) {
      if (v.category) catWeight.set(v.category, (catWeight.get(v.category) ?? 0) + 1);
      if (v.bodyType) bodyWeight.set(v.bodyType, (bodyWeight.get(v.bodyType) ?? 0) + 1);
      if (v.pricing?.dailyPrice) { priceSum += v.pricing.dailyPrice; priceN += 1; }
      if (!anchor && (v.location as any)?.coordinates) {
        anchor = (v.location as any).coordinates as [number, number];
      }
    }
    const avgPrice = priceN ? priceSum / priceN : 0;

    // Candidate pool: listed/verified vehicles the user hasn't booked, near
    // their last city when known (else global top-rated for cold-start).
    const filter: Record<string, unknown> = {
      status: 'listed',
      verificationStatus: 'verified',
      deletedAt: null,
      _id: { $nin: bookedIds },
    };
    if (anchor) {
      filter.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: anchor },
          $maxDistance: 60 * 1000,
        },
      };
    }
    const pool = await VehicleModel.find(filter).limit(120).lean<VehicleDoc[]>();

    if (!bookedVehicles.length) {
      // Cold start: rating + superhost, capped.
      return pool
        .sort(
          (a, b) =>
            Number(!!b.hostIsSuperhost) - Number(!!a.hostIsSuperhost) ||
            b.ratingAvg - a.ratingAvg ||
            b.totalTrips - a.totalTrips,
        )
        .slice(0, limit);
    }

    // Ranking weights are a competitive lever (quality vs. proximity vs. new
    // supply), so they come from PlatformConfig — one read for the whole pool.
    const { search } = await platformConfigService.get();
    const scored = pool
      .map((v) => ({ v, s: this.affinityScore(v, catWeight, bodyWeight, avgPrice, search.ranking) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((x) => x.v);
    return scored;
  }

  private affinityScore(
    v: VehicleDoc,
    catWeight: Map<string, number>,
    bodyWeight: Map<string, number>,
    avgPrice: number,
    w: PlatformConfigDoc['search']['ranking'],
  ): number {
    let score = 0;
    if (v.category && catWeight.has(v.category)) score += w.categoryMatch * catWeight.get(v.category)!;
    if (v.bodyType && bodyWeight.has(v.bodyType)) score += w.bodyTypeMatch * bodyWeight.get(v.bodyType)!;
    // Price proximity: full credit at the user's average, decaying with distance.
    if (avgPrice > 0 && v.pricing?.dailyPrice) {
      const rel = Math.abs(v.pricing.dailyPrice - avgPrice) / avgPrice;
      score += Math.max(0, w.priceProximity - rel * w.priceProximity);
    }
    // Quality signals so we never recommend a great-fit-but-bad car.
    score += (v.ratingAvg || 0) * w.ratingWeight;
    if (v.hostIsSuperhost) score += w.superhostBoost;
    score += Math.min(v.totalTrips || 0, w.tripsCap) * w.tripsWeight;
    return score;
  }

  private applySort(items: VehicleDoc[], sort: SortKey): VehicleDoc[] {
    const arr = [...items];
    switch (sort) {
      case 'price_asc':
        return arr.sort((a, b) => a.pricing.dailyPrice - b.pricing.dailyPrice);
      case 'price_desc':
        return arr.sort((a, b) => b.pricing.dailyPrice - a.pricing.dailyPrice);
      case 'rating':
        return arr.sort((a, b) => b.ratingAvg - a.ratingAvg);
      case 'trending':
        return arr.sort((a, b) => b.totalTrips - a.totalTrips || b.ratingCount - a.ratingCount);
      case 'newest':
        return arr.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      default:
        return arr; // relevance = geo distance from $near
    }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const searchService = new SearchService();
