import { config } from '../../../config';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Turn-by-turn routing and live ETA.
 *
 * Kept separate from the geocoding chain because the preference order is
 * different and deliberately so: Google is primary here because its
 * traffic-aware ETAs are the better product, and a handover ETA that is wrong
 * by ten minutes is the difference between a host waiting and a guest stranded.
 * Mapbox is the backup, and a distance-only estimate is the last resort so the
 * feature degrades to "roughly this far" instead of disappearing.
 */

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface Route {
  distanceMeters: number;
  /** Free-flow estimate. */
  durationSeconds: number;
  /** Traffic-aware where the provider supplies it; falls back to duration. */
  durationInTrafficSeconds: number;
  /** Encoded polyline (Google format, precision 5) for drawing the line. */
  polyline?: string;
  steps: RouteStep[];
  provider: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

interface RoutingProvider {
  readonly name: string;
  route(from: LatLng, to: LatLng): Promise<Route | null>;
}

class GoogleRouting implements RoutingProvider {
  readonly name = 'google';
  constructor(private readonly key: string) {}

  async route(from: LatLng, to: LatLng): Promise<Route | null> {
    const url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}` +
      // departure_time=now is what unlocks duration_in_traffic.
      `&departure_time=now&mode=driving&key=${this.key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const json = (await res.json()) as {
      status?: string;
      routes?: {
        overview_polyline?: { points?: string };
        legs?: {
          distance?: { value: number };
          duration?: { value: number };
          duration_in_traffic?: { value: number };
          steps?: { html_instructions?: string; distance?: { value: number }; duration?: { value: number } }[];
        }[];
      }[];
    };
    if (json.status !== 'OK') return null;
    const leg = json.routes?.[0]?.legs?.[0];
    if (!leg) return null;

    const duration = leg.duration?.value ?? 0;
    return {
      distanceMeters: leg.distance?.value ?? 0,
      durationSeconds: duration,
      durationInTrafficSeconds: leg.duration_in_traffic?.value ?? duration,
      polyline: json.routes?.[0]?.overview_polyline?.points,
      steps: (leg.steps ?? []).map((s) => ({
        // Google returns HTML in instructions; strip it rather than render it.
        instruction: (s.html_instructions ?? '').replace(/<[^>]*>/g, '').trim(),
        distanceMeters: s.distance?.value ?? 0,
        durationSeconds: s.duration?.value ?? 0,
      })),
      provider: this.name,
    };
  }
}

class MapboxRouting implements RoutingProvider {
  readonly name = 'mapbox';
  constructor(private readonly token: string) {}

  async route(from: LatLng, to: LatLng): Promise<Route | null> {
    // driving-traffic is the traffic-aware profile.
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?geometries=polyline&overview=full&steps=true&access_token=${this.token}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const json = (await res.json()) as {
      code?: string;
      routes?: {
        distance?: number;
        duration?: number;
        geometry?: string;
        legs?: { steps?: { maneuver?: { instruction?: string }; distance?: number; duration?: number }[] }[];
      }[];
    };
    if (json.code !== 'Ok') return null;
    const r = json.routes?.[0];
    if (!r) return null;

    const duration = Math.round(r.duration ?? 0);
    return {
      distanceMeters: Math.round(r.distance ?? 0),
      durationSeconds: duration,
      // The traffic profile already bakes traffic into duration.
      durationInTrafficSeconds: duration,
      polyline: r.geometry,
      steps: (r.legs?.[0]?.steps ?? []).map((s) => ({
        instruction: s.maneuver?.instruction ?? '',
        distanceMeters: Math.round(s.distance ?? 0),
        durationSeconds: Math.round(s.duration ?? 0),
      })),
      provider: this.name,
    };
  }
}

/**
 * No key: straight-line distance at a plausible urban average. Honest about
 * being an estimate — it returns no steps, so the UI shows a distance and an
 * approximate time rather than pretending to navigate.
 */
class StubRouting implements RoutingProvider {
  readonly name = 'estimate';
  async route(from: LatLng, to: LatLng): Promise<Route> {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(to.lat - from.lat);
    const dLng = toRad(to.lng - from.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
    const straight = 2 * R * Math.asin(Math.sqrt(a));
    // Roads are not straight lines; 1.3 is the usual urban detour factor.
    const distanceMeters = Math.round(straight * 1.3);
    const durationSeconds = Math.round(distanceMeters / 8.3); // ~30 km/h
    return {
      distanceMeters,
      durationSeconds,
      durationInTrafficSeconds: durationSeconds,
      steps: [],
      provider: this.name,
    };
  }
}

const chain: RoutingProvider[] = [];
if (config.maps.googleKey) chain.push(new GoogleRouting(config.maps.googleKey));
if (config.maps.mapboxToken) chain.push(new MapboxRouting(config.maps.mapboxToken));
chain.push(new StubRouting());

export const routingProvider = {
  /** First provider that returns a route wins; a failure falls through. */
  async route(from: LatLng, to: LatLng): Promise<Route> {
    for (const p of chain) {
      try {
        const r = await p.route(from, to);
        if (r) return r;
      } catch (err) {
        logger.warn({ provider: p.name, err: (err as Error).message }, 'routing failed, trying backup');
      }
    }
    // The stub cannot return null, so this is unreachable in practice.
    return new StubRouting().route(from, to);
  },
};

logger.info(`Routing provider chain: ${chain.map((c) => c.name).join(' → ')}`);
