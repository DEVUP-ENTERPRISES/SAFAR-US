import { config } from '../../../config';
import { logger } from '../../../infrastructure/logging/logger';

export interface GeoResult {
  lat: number;
  lng: number;
  formatted: string;
  /** Structured locality — what a listing stores as its city, and what the
   *  marketplace facets group by. Empty when the provider can't resolve one. */
  city: string;
}
export interface Suggestion {
  description: string;
  placeId?: string;
}

export interface MapsProvider {
  geocode(query: string): Promise<GeoResult[]>;
  reverseGeocode(lat: number, lng: number): Promise<string | null>;
  autocomplete(query: string): Promise<Suggestion[]>;
}

/** Real Google Maps Platform provider (server-side key, restricted). */
class GoogleMapsProvider implements MapsProvider {
  constructor(private readonly key: string) {}

  async geocode(query: string): Promise<GeoResult[]> {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${this.key}`;
    const res = await fetch(url);
    const json = (await res.json()) as {
      results?: {
        geometry: { location: { lat: number; lng: number } };
        formatted_address: string;
        address_components?: { long_name: string; types: string[] }[];
      }[];
    };
    return (json.results ?? []).map((r) => ({
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      formatted: r.formatted_address,
      city: pickCity(r.address_components ?? []),
    }));
  }

  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${this.key}`;
    const res = await fetch(url);
    const json = (await res.json()) as { results?: { formatted_address: string }[] };
    return json.results?.[0]?.formatted_address ?? null;
  }

  async autocomplete(query: string): Promise<Suggestion[]> {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${this.key}`;
    const res = await fetch(url);
    const json = (await res.json()) as { predictions?: { description: string; place_id: string }[] };
    return (json.predictions ?? []).map((p) => ({ description: p.description, placeId: p.place_id }));
  }
}

/**
 * Mapbox geocoding — the primary provider until a Google key is in place.
 *
 * Same MapsProvider contract as Google, so nothing downstream (search origin,
 * listing location, city facets) knows or cares which one answered. Restricted
 * to US + CA, the launch markets, to keep results relevant and quota focused.
 */
class MapboxProvider implements MapsProvider {
  private readonly base = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
  constructor(private readonly token: string) {}

  async geocode(query: string): Promise<GeoResult[]> {
    const url = `${this.base}/${encodeURIComponent(query)}.json?access_token=${this.token}&country=us,ca&limit=5`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox geocode ${res.status}`);
    const json = (await res.json()) as { features?: MapboxFeature[] };
    return (json.features ?? []).map((f) => ({
      lng: f.center[0],
      lat: f.center[1],
      formatted: f.place_name,
      city: pickCityMapbox(f),
    }));
  }

  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    const url = `${this.base}/${lng},${lat}.json?access_token=${this.token}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox reverse ${res.status}`);
    const json = (await res.json()) as { features?: MapboxFeature[] };
    return json.features?.[0]?.place_name ?? null;
  }

  async autocomplete(query: string): Promise<Suggestion[]> {
    const url = `${this.base}/${encodeURIComponent(query)}.json?access_token=${this.token}&country=us,ca&autocomplete=true&limit=5`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox autocomplete ${res.status}`);
    const json = (await res.json()) as { features?: MapboxFeature[] };
    return (json.features ?? []).map((f) => ({ description: f.place_name, placeId: f.id }));
  }
}

interface MapboxFeature {
  id: string;
  place_name: string;
  text: string;
  center: [number, number];
  place_type: string[];
  context?: { id: string; text: string }[];
}

/** Mapbox tags each feature with a type; the city is the `place` feature or,
 *  for an address, the `place` entry in its context. */
function pickCityMapbox(f: MapboxFeature): string {
  if (f.place_type.includes('place')) return f.text;
  const ctx = f.context ?? [];
  for (const prefix of ['place.', 'locality.', 'district.', 'region.']) {
    const hit = ctx.find((c) => c.id.startsWith(prefix));
    if (hit) return hit.text;
  }
  return '';
}

/**
 * Tries providers in order and moves to the next on failure OR an empty
 * result. So Mapbox is primary, Google is the backup that catches a Mapbox
 * outage or a query it can't resolve, and the stub is the last resort. A
 * geocode call never hard-fails as long as one provider answers.
 */
class FallbackMapsProvider implements MapsProvider {
  constructor(private readonly chain: { name: string; provider: MapsProvider }[]) {}

  async geocode(query: string): Promise<GeoResult[]> {
    for (const { name, provider } of this.chain) {
      try {
        const out = await provider.geocode(query);
        if (out.length > 0) return out;
      } catch (err) {
        logger.warn({ provider: name, err: (err as Error).message }, 'maps geocode failed, trying backup');
      }
    }
    return [];
  }

  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    for (const { name, provider } of this.chain) {
      try {
        const out = await provider.reverseGeocode(lat, lng);
        if (out) return out;
      } catch (err) {
        logger.warn({ provider: name, err: (err as Error).message }, 'maps reverse failed, trying backup');
      }
    }
    return null;
  }

  async autocomplete(query: string): Promise<Suggestion[]> {
    for (const { name, provider } of this.chain) {
      try {
        const out = await provider.autocomplete(query);
        if (out.length > 0) return out;
      } catch (err) {
        logger.warn({ provider: name, err: (err as Error).message }, 'maps autocomplete failed, trying backup');
      }
    }
    return [];
  }
}

/**
 * Google returns a component list, not a city. Prefer the locality; fall back
 * through the administrative levels so a listing outside an incorporated city
 * still lands in a sensible bucket rather than an empty one.
 */
function pickCity(components: { long_name: string; types: string[] }[]): string {
  const ORDER = ['locality', 'postal_town', 'sublocality', 'administrative_area_level_2', 'administrative_area_level_1'];
  for (const type of ORDER) {
    const hit = components.find((c) => c.types.includes(type));
    if (hit) return hit.long_name;
  }
  return '';
}

/** Offline stub: a few known metros so map search works without a key. */
const CITY_INDEX: Record<string, GeoResult> = {
  'new york': { city: 'New York', lat: 40.7128, lng: -74.006, formatted: 'New York, NY, USA' },
  'los angeles': { city: 'Los Angeles', lat: 34.0522, lng: -118.2437, formatted: 'Los Angeles, CA, USA' },
  'san francisco': { city: 'San Francisco', lat: 37.7749, lng: -122.4194, formatted: 'San Francisco, CA, USA' },
  chicago: { city: 'Chicago', lat: 41.8781, lng: -87.6298, formatted: 'Chicago, IL, USA' },
  miami: { city: 'Miami', lat: 25.7617, lng: -80.1918, formatted: 'Miami, FL, USA' },
  austin: { city: 'Austin', lat: 30.2672, lng: -97.7431, formatted: 'Austin, TX, USA' },
  seattle: { city: 'Seattle', lat: 47.6062, lng: -122.3321, formatted: 'Seattle, WA, USA' },
};

class StubMapsProvider implements MapsProvider {
  async geocode(query: string): Promise<GeoResult[]> {
    const hit = CITY_INDEX[query.trim().toLowerCase()];
    return hit ? [hit] : [];
  }
  async reverseGeocode(): Promise<string | null> {
    return null;
  }
  async autocomplete(query: string): Promise<Suggestion[]> {
    const q = query.trim().toLowerCase();
    return Object.entries(CITY_INDEX)
      .filter(([name]) => name.startsWith(q))
      .map(([, v]) => ({ description: v.formatted }));
  }
}

/**
 * Provider chain, primary first: Mapbox → Google → Stub.
 *
 * Mapbox is the primary geocoder for now; Google, when its key is set, becomes
 * the backup that a Mapbox failure falls through to. The stub is always last so
 * a dev box with no keys still resolves the seed cities.
 */
const chain: { name: string; provider: MapsProvider }[] = [];
if (config.maps.mapboxToken) chain.push({ name: 'mapbox', provider: new MapboxProvider(config.maps.mapboxToken) });
if (config.maps.googleKey) chain.push({ name: 'google', provider: new GoogleMapsProvider(config.maps.googleKey) });
chain.push({ name: 'stub', provider: new StubMapsProvider() });

export const mapsProvider: MapsProvider = chain.length > 1 ? new FallbackMapsProvider(chain) : chain[0].provider;

logger.info(`Maps provider chain: ${chain.map((c) => c.name).join(' → ')}`);
