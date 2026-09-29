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
    };
  });
}
