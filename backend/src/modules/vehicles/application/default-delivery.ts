import type { createVehicleSchema } from '../dto/vehicle.schemas';
import { mapsProvider } from '../../maps/infrastructure/maps.provider';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * The fleet's standard delivery spots, each with its own fee, so a guest picks from a real list instead of
 * typing any airport for free. Sub-locations (terminals, counters) are left for the host to add per car.
 */
const DEFAULT_DELIVERY_TEMPLATE = [
  { kind: 'airport' as const, name: 'Dallas Love Field Airport', query: 'Dallas Love Field Airport (DAL), Dallas, TX', fee: 7500, minTripDays: 2, accessMethod: 'lockbox' as const, parkingRate: 'hourly' as const },
  { kind: 'airport' as const, name: 'Dallas/Fort Worth International Airport', query: 'Dallas/Fort Worth International Airport (DFW), TX', fee: 5500, minTripDays: 2, accessMethod: 'lockbox' as const },
  { kind: 'hotel' as const, name: 'Omni PGA Frisco Resort', query: 'Omni PGA Frisco Resort, Frisco, TX', fee: 10000, minTripDays: 0, accessMethod: 'remote_unlock' as const },
] as const;

// The standard spots are Dallas-area; a car further than this from DFW does not get them.
const DFW = { lat: 32.8998, lng: -97.0403 };
const AREA_KM = 100;

/** Whether a car sits close enough to Dallas for the standard DFW / Love Field / Frisco spots to make sense. */
export function isDallasArea(lng?: number, lat?: number): boolean {
  if (typeof lng !== 'number' || typeof lat !== 'number') return false;
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat - DFW.lat) / 2) ** 2 + Math.cos(rad(DFW.lat)) * Math.cos(rad(lat)) * Math.sin(rad(lng - DFW.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a)) <= AREA_KM;
}

type Locations =NonNullable<ReturnType<typeof createVehicleSchema.parse>['listing']['deliveryLocations']>;

/** Geocodes the standard spots once; a spot that can't be found is left out rather than placed wrongly. */
export async function buildDefaultDeliveryLocations(): Promise<Locations> {
  const geocoded = await Promise.all(
    DEFAULT_DELIVERY_TEMPLATE.map(async (t) => {
      try {
        const [hit] = await mapsProvider.geocode(t.query);
        return hit ? { ...t, address: hit.formatted ?? t.query, lat: hit.lat, lng: hit.lng, enabled: true } : null;
      } catch (err) {
        logger.warn(`Default delivery geocode failed for "${t.name}": ${(err as Error).message}`);
        return null;
      }
    }),
  );
  const located = geocoded.filter((g): g is NonNullable<typeof g> => g !== null).map(({ query: _query, ...loc }) => loc);
  return [
    ...located,
    { kind: 'custom', name: 'Custom delivery', address: '', fee: 10000, minTripDays: 0, accessMethod: 'in_person', radiusMiles: 20, enabled: true },
  ] as Locations;
}
