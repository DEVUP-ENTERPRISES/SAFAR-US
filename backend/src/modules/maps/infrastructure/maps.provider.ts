import { config } from '../../../config';
import { logger } from '../../../infrastructure/logging/logger';

export interface GeoResult {
  lat: number;
  lng: number;
  formatted: string;
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
    const json = (await res.json()) as { results?: { geometry: { location: { lat: number; lng: number } }; formatted_address: string }[] };
    return (json.results ?? []).map((r) => ({
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      formatted: r.formatted_address,
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

/** Offline stub: a few known metros so map search works without a key. */
const CITY_INDEX: Record<string, GeoResult> = {
  'new york': { lat: 40.7128, lng: -74.006, formatted: 'New York, NY, USA' },
  'los angeles': { lat: 34.0522, lng: -118.2437, formatted: 'Los Angeles, CA, USA' },
  'san francisco': { lat: 37.7749, lng: -122.4194, formatted: 'San Francisco, CA, USA' },
  chicago: { lat: 41.8781, lng: -87.6298, formatted: 'Chicago, IL, USA' },
  miami: { lat: 25.7617, lng: -80.1918, formatted: 'Miami, FL, USA' },
  austin: { lat: 30.2672, lng: -97.7431, formatted: 'Austin, TX, USA' },
  seattle: { lat: 47.6062, lng: -122.3321, formatted: 'Seattle, WA, USA' },
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

export const mapsProvider: MapsProvider = config.maps.enabled
  ? new GoogleMapsProvider(config.maps.googleKey!)
  : new StubMapsProvider();

logger.info(`Maps: ${config.maps.enabled ? 'Google Maps (live)' : 'Stub (dev)'}`);
