import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
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
      const available: VehicleDoc[] = [];
      for (const v of candidates) {
        if (available.length >= limit) break;
        if (await availabilityService.isAvailable(v._id, q.start, q.end)) available.push(v);
      }
      results = available;
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

    const scored = pool
      .map((v) => ({ v, s: this.affinityScore(v, catWeight, bodyWeight, avgPrice) }))
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
  ): number {
    let score = 0;
    if (v.category && catWeight.has(v.category)) score += 3 * catWeight.get(v.category)!;
    if (v.bodyType && bodyWeight.has(v.bodyType)) score += 2 * bodyWeight.get(v.bodyType)!;
    // Price proximity: full credit at the user's average, decaying with distance.
    if (avgPrice > 0 && v.pricing?.dailyPrice) {
      const rel = Math.abs(v.pricing.dailyPrice - avgPrice) / avgPrice;
      score += Math.max(0, 2 - rel * 2);
    }
    // Quality signals so we never recommend a great-fit-but-bad car.
    score += (v.ratingAvg || 0) * 0.5;
    if (v.hostIsSuperhost) score += 1;
    score += Math.min(v.totalTrips || 0, 20) * 0.02;
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
