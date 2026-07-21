import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { HostModel } from '../../hosts/infrastructure/host.model';

export interface CityFacet {
  city: string;
  vehicles: number;
  /** Centroid of the city's listings — drives the map/search origin. */
  lng: number;
  lat: number;
  fromPrice: number;
}

export interface CategoryFacet {
  category: string;
  vehicles: number;
  fromPrice: number;
}

export interface MarketplaceFacets {
  currency: string;
  cities: CityFacet[];
  categories: CategoryFacet[];
  stats: {
    vehicles: number;
    verifiedHosts: number;
    ratingAvg: number | null;
    ratingCount: number;
    instantBook: number;
  };
}

/** Only bookable supply counts — an unverified or unlisted car isn't a facet. */
const BOOKABLE = { status: 'listed', verificationStatus: 'verified' } as const;

/**
 * The real shape of the marketplace: which cities and categories actually have
 * bookable cars, and what the trust numbers really are.
 *
 * This exists so no surface has to hardcode a city list. A host listing in a
 * city nobody hardcoded was previously unreachable from the homepage — the
 * carousel and the search widget offered six fixed cities regardless of supply,
 * and a category with no cars still rendered, sending guests to empty results.
 */
export class FacetsService {
  async marketplace(city?: string): Promise<MarketplaceFacets> {
    const [cities, categories, stats] = await Promise.all([
      this.cities(),
      this.categories(city),
      this.stats(),
    ]);
    return { currency: 'USD', cities, categories, stats };
  }

  private async cities(): Promise<CityFacet[]> {
    const rows = await VehicleModel.aggregate<{
      _id: string; vehicles: number; lng: number; lat: number; fromPrice: number;
    }>([
      { $match: { ...BOOKABLE, 'location.city': { $nin: ['', null] } } },
      {
        $group: {
          _id: '$location.city',
          vehicles: { $sum: 1 },
          lng: { $avg: { $arrayElemAt: ['$location.coordinates', 0] } },
          lat: { $avg: { $arrayElemAt: ['$location.coordinates', 1] } },
          fromPrice: { $min: '$pricing.dailyPrice' },
        },
      },
      { $sort: { vehicles: -1, _id: 1 } },
      { $limit: 24 },
    ]).exec();

    return rows.map((r) => ({
      city: r._id,
      vehicles: r.vehicles,
      lng: r.lng,
      lat: r.lat,
      fromPrice: r.fromPrice ?? 0,
    }));
  }

  private async categories(city?: string): Promise<CategoryFacet[]> {
    const match: Record<string, unknown> = { ...BOOKABLE };
    if (city) match['location.city'] = city;

    const rows = await VehicleModel.aggregate<{ _id: string; vehicles: number; fromPrice: number }>([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ['$category', 'other'] },
          vehicles: { $sum: 1 },
          fromPrice: { $min: '$pricing.dailyPrice' },
        },
      },
      { $sort: { vehicles: -1, _id: 1 } },
    ]).exec();

    return rows.map((r) => ({
      category: r._id,
      vehicles: r.vehicles,
      fromPrice: r.fromPrice ?? 0,
    }));
  }

  private async stats(): Promise<MarketplaceFacets['stats']> {
    const [agg] = await VehicleModel.aggregate<{
      vehicles: number; instantBook: number; ratingSum: number; ratingCount: number;
    }>([
      { $match: BOOKABLE },
      {
        $group: {
          _id: null,
          vehicles: { $sum: 1 },
          instantBook: { $sum: { $cond: ['$listing.instantBook', 1, 0] } },
          // Weight each car's average by how many ratings it has, so one
          // five-star car with a single review can't outweigh the fleet.
          ratingSum: { $sum: { $multiply: [{ $ifNull: ['$ratingAvg', 0] }, { $ifNull: ['$ratingCount', 0] }] } },
          ratingCount: { $sum: { $ifNull: ['$ratingCount', 0] } },
        },
      },
    ]).exec();

    const verifiedHosts = await HostModel.countDocuments({ verificationStatus: 'verified' });
    const ratingCount = agg?.ratingCount ?? 0;

    return {
      vehicles: agg?.vehicles ?? 0,
      verifiedHosts,
      // null, not a flattering default — the UI hides the claim until it's real.
      ratingAvg: ratingCount > 0 ? Math.round((agg!.ratingSum / ratingCount) * 10) / 10 : null,
      ratingCount,
      instantBook: agg?.instantBook ?? 0,
    };
  }
}

export const facetsService = new FacetsService();
