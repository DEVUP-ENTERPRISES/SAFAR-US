import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
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

    results = this.applySort(results, q.sort ?? 'relevance').slice(0, limit);
    return results;
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
