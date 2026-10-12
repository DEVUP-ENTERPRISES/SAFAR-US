import type { SearchParams, SortKey } from '@/features/vehicles/types';

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'price_asc', label: 'Price: low to high' },
  { key: 'price_desc', label: 'Price: high to low' },
  { key: 'rating', label: 'Top rated' },
  { key: 'trending', label: 'Trending' },
];

export const FUELS = ['petrol', 'diesel', 'hybrid', 'ev'] as const;
export const SEAT_OPTIONS = [2, 4, 5, 7];

/** The results-page filters, as typed in (prices in whole dollars, years and seats as text). */
export interface SearchFilters {
  category: string;
  make: string;
  fuelType: string;
  transmission: string;
  instantBook: boolean;
  delivery: boolean;
  seatsMin: string;
  priceMin: string;
  priceMax: string;
  yearMin: string;
  yearMax: string;
  ratingMin: number;
  sort: SortKey;
}

export const EMPTY_FILTERS: SearchFilters = {
  category: '',
  make: '',
  fuelType: '',
  transmission: '',
  instantBook: false,
  delivery: false,
  seatsMin: '',
  priceMin: '',
  priceMax: '',
  yearMin: '',
  yearMax: '',
  ratingMin: 0,
  sort: 'relevance',
};

/** How many filters are switched on (sort is not a filter). */
export function activeFilterCount(f: SearchFilters): number {
  const { category, make, fuelType, transmission, instantBook, delivery, seatsMin, priceMin, priceMax, yearMin, yearMax, ratingMin } = f;
  return [category, make, fuelType, transmission, instantBook, delivery, seatsMin, priceMin, priceMax, yearMin, yearMax, ratingMin].filter(Boolean).length;
}

/** The search API query for a place, an optional date range and the filters; null until there is a place. */
export function buildSearchParams(
  coords: { lat: number; lng: number } | undefined,
  dates: { startIso?: string; endIso?: string },
  f: SearchFilters,
): SearchParams | null {
  if (!coords) return null;
  const bothDates = !!(dates.startIso && dates.endIso);
  return {
    ...coords,
    radiusKm: 50,
    start: bothDates ? dates.startIso : undefined,
    end: bothDates ? dates.endIso : undefined,
    category: f.category || undefined,
    make: f.make.trim() || undefined,
    fuelType: (f.fuelType as SearchParams['fuelType']) || undefined,
    transmission: (f.transmission as SearchParams['transmission']) || undefined,
    instantBook: f.instantBook || undefined,
    delivery: f.delivery || undefined,
    seatsMin: f.seatsMin ? Number(f.seatsMin) : undefined,
    priceMin: f.priceMin ? Number(f.priceMin) * 100 : undefined,
    priceMax: f.priceMax ? Number(f.priceMax) * 100 : undefined,
    yearMin: f.yearMin ? Number(f.yearMin) : undefined,
    yearMax: f.yearMax ? Number(f.yearMax) : undefined,
    ratingMin: f.ratingMin || undefined,
    sort: f.sort,
    limit: 24,
  };
}

/** What "Save search" stores for these filters in this city. */
export function savedSearchInput(city: string, f: SearchFilters) {
  return {
    city: city || undefined,
    category: f.category || undefined,
    fuelType: (f.fuelType || undefined) as never,
    transmission: (f.transmission || undefined) as never,
    seatsMin: f.seatsMin ? Number(f.seatsMin) : undefined,
    priceMaxCents: f.priceMax ? Number(f.priceMax) * 100 : undefined,
    instantBook: f.instantBook || undefined,
  };
}
