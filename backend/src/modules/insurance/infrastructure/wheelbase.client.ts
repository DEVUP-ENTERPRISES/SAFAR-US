import { ExternalServiceError } from '../../../core/errors/app-error';

/** One Wheelbase listing, reduced to what CatoDrive uses: identity for matching, and its insurance. */
export interface WheelbaseListing {
  id: number;
  name: string;
  year?: number;
  make?: string;
  model?: string;
  insuranceState?: string;
  coverage?: string;
  eligible?: boolean;
  planLabel?: string;
  minRenterAge?: number;
  /** Listing content, used to fill CatoDrive cars on import. */
  details: {
    photoUrls: string[];
    features: string[];
    fuelType?: string;
    transmission?: string;
    seats?: number;
    pricePerDayCents?: number;
    description?: string;
    bodyClass?: string;
    location?: { city?: string; state?: string; lat?: number; lng?: number };
  };
}

// Wheelbase feature flags that describe policy or trim, not equipment a guest can use.
const NOT_FEATURES = new Set(['doors', 'fuel_type', 'transmission', 'linens_included', 'pet_friendly', 'smoking_allowed', 'full_self_driving']);

function photoUrlsOf(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((i) => i as Record<string, unknown>)
    .sort((a, b) => Number(b.primary === true) - Number(a.primary === true) || Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((i) => [i.url, i.best, i.original_url, i.large, i.src].find((u) => typeof u === 'string' && /^https:\/\//.test(u)) as string | undefined)
    .filter((u): u is string => !!u);
}

// The same public listing search the Wheelbase widget uses for a dealer's store.
const SEARCH = 'https://search.outdoorsy.com/rentals';

export async function fetchDealerListings(dealerId: string): Promise<WheelbaseListing[]> {
  const q = new URLSearchParams({
    owner_id: dealerId,
    raw_json: 'true',
    include_unavailable: 'true',
    hidden: 'true',
    sort: 'position',
    'page[limit]': '1000',
    locale: 'en-us',
    currency: 'USD',
    from_srp: 'false',
    'filter[rental_category]': 'auto',
  });
  let res: Response;
  try {
    res = await fetch(`${SEARCH}?${q}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'CatoDrive/1.0 (+https://www.catodrive.com)' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new ExternalServiceError(`Wheelbase unreachable: ${(err as Error).message}`);
  }
  if (!res.ok) throw new ExternalServiceError(`Wheelbase listings ${res.status}`);
  const body = (await res.json().catch(() => null)) as { data?: unknown[] } | null;
  if (!body || !Array.isArray(body.data)) throw new ExternalServiceError('Wheelbase listings: unexpected response');

  return body.data.map((row) => {
    const r = row as { id: number | string; attributes?: Record<string, unknown> } & Record<string, unknown>;
    const a = (r.attributes ?? r) as Record<string, unknown>;
    const plan = a.insurance_plan as { label?: string } | undefined;
    const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined);
    return {
      id: Number(r.id),
      name: String(a.name ?? ''),
      year: num(a.vehicle_year),
      make: typeof a.vehicle_make === 'string' ? a.vehicle_make : undefined,
      model: typeof a.vehicle_model === 'string' ? a.vehicle_model : undefined,
      insuranceState: typeof a.insurance_state === 'string' ? a.insurance_state : undefined,
      coverage: typeof a.insurance_coverage === 'string' ? a.insurance_coverage : undefined,
      eligible: typeof a.insurance_eligible === 'boolean' ? a.insurance_eligible : undefined,
      planLabel: plan?.label || undefined,
      minRenterAge: num(a.minimum_renter_age),
      details: (() => {
        const feats = (a.features ?? {}) as Record<string, unknown>;
        const loc = (a.location ?? {}) as Record<string, unknown>;
        const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
        return {
          photoUrls: photoUrlsOf(a.images),
          features: Object.entries(feats).filter(([k, v]) => v === true && !NOT_FEATURES.has(k)).map(([k]) => k),
          fuelType: str(feats.fuel_type),
          transmission: str(feats.transmission),
          seats: num(a.seatbelts),
          pricePerDayCents: num(a.price_per_day),
          description: str(a.description),
          bodyClass: str(a.vehicle_body_class) ?? str(a.display_vehicle_type) ?? str(a.vehicle_class),
          location: { city: str(loc.city), state: str(loc.state), lat: num(loc.lat), lng: num(loc.lng) },
        };
      })(),
    };
  });
}
