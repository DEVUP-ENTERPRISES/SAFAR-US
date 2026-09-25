import type { VehicleDoc } from '../infrastructure/vehicle.model';

// Two decimals is roughly a kilometre: enough for a search map, not enough to find a car.
const APPROX_COORD_FACTOR = 100;

const approx = (n: number) => Math.round(n * APPROX_COORD_FACTOR) / APPROX_COORD_FACTOR;

/** The one serializer for every vehicle a non-owner can see: no codes, plate, VIN, spot photo or street address. */
export function toPublicVehicle<T extends Partial<VehicleDoc>>(v: T): T {
  const { vin: _vin, registrationNumber: _plate, pickup: _pickup, location, ...rest } = v as Partial<VehicleDoc>;
  const out: Partial<VehicleDoc> = { ...rest };
  if (location) {
    const [lng, lat] = location.coordinates ?? [];
    out.location = {
      type: 'Point',
      coordinates: [approx(lng), approx(lat)],
      address: [location.city, location.state].filter(Boolean).join(', '),
      city: location.city,
      state: location.state,
    };
  }
  return out as T;
}
