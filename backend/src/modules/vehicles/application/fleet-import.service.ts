import { vinDecodeService, type DecodedVin } from './vin-decode.service';
import { vehicleService } from './vehicle.service';
import { createVehicleSchema } from '../dto/vehicle.schemas';
import { VehicleModel } from '../infrastructure/vehicle.model';
import { hostService } from '../../hosts/application/host.service';
import { mapsProvider } from '../../maps/infrastructure/maps.provider';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Fleet import — onboarding a host who already runs a hundred cars elsewhere.
 *
 * The work in listing a fleet by hand is not judgement, it is transcription:
 * make, model, year, body, fuel, transmission and seats are all already encoded
 * in the VIN. So the host supplies the four things a VIN cannot know — price,
 * where the car lives, and how they describe it — and everything else is
 * decoded.
 *
 * Three deliberate choices:
 *
 *  - Everything lands as a DRAFT. A hundred cars appearing live, unreviewed and
 *    photoless would be worse for the marketplace than a slow onboarding. The
 *    host reviews and publishes.
 *  - A row that cannot be completed is REPORTED with the reason, and the rest
 *    of the import still runs. An all-or-nothing import of a hundred rows fails
 *    on row 87 and wastes the other 99.
 *  - Duplicate VINs are skipped, not re-created. Re-running an import after
 *    fixing three rows must not produce a hundred duplicates, and hosts will
 *    absolutely re-run it.
 */

export interface ImportRow {
  vin: string;
  /** Cents per day. */
  dailyPrice: number;
  address: string;
  title?: string;
  description?: string;
  registrationNumber?: string;
  /** Supplied only when the VIN did not decode them. */
  transmission?: 'manual' | 'automatic';
  fuelType?: 'petrol' | 'diesel' | 'hybrid' | 'ev';
  seats?: number;
  bodyType?: string;
}

export interface ImportResult {
  vin: string;
  status: 'created' | 'skipped' | 'failed';
  vehicleId?: string;
  label?: string;
  reason?: string;
}

/** Fields a listing needs that a VIN sometimes does not carry. */
export interface RowPreview extends DecodedVin {
  /** Required fields this row still lacks — the host fills these in. */
  missing: ('transmission' | 'fuelType' | 'seats' | 'bodyType')[];
  /** True when this VIN is already in the host's fleet. */
  duplicate?: boolean;
}

export const fleetImportService = {
  /**
   * Decode a batch and report what each row still needs, without writing
   * anything. The host sees the whole fleet resolved before committing.
   */
  async preview(userId: string, vins: string[]): Promise<RowPreview[]> {
    const host = await hostService.requireHostForUser(userId);
    const decoded = await vinDecodeService.decodeBatch(vins);

    const existing = await VehicleModel.find({
      hostId: host._id,
      vin: { $in: decoded.map((d) => d.vin) },
      deletedAt: null,
    }).select('vin').lean<{ vin: string }[]>();
    const already = new Set(existing.map((e) => e.vin));

    return decoded.map((d) => {
      const missing: RowPreview['missing'] = [];
      if (d.ok) {
        // vPIC genuinely omits these for some makes — a Ford F-150 comes back
        // with no transmission and no seat count. Ask rather than assume.
        if (!d.transmission) missing.push('transmission');
        if (!d.fuelType) missing.push('fuelType');
        if (!d.seats) missing.push('seats');
        if (!d.bodyType) missing.push('bodyType');
      }
      return { ...d, missing, duplicate: already.has(d.vin) };
    });
  },

  /**
   * Create the fleet. Rows are independent: one bad address does not cost the
   * other ninety-nine.
   */
  async importRows(userId: string, rows: ImportRow[]): Promise<ImportResult[]> {
    const host = await hostService.requireHostForUser(userId);
    const decoded = await vinDecodeService.decodeBatch(rows.map((r) => r.vin));
    const byVin = new Map(decoded.map((d) => [d.vin, d]));

    const existing = await VehicleModel.find({
      hostId: host._id,
      vin: { $in: rows.map((r) => r.vin.trim().toUpperCase()) },
      deletedAt: null,
    }).select('vin').lean<{ vin: string }[]>();
    const already = new Set(existing.map((e) => e.vin));

    const results: ImportResult[] = [];

    for (const row of rows) {
      const vin = row.vin.trim().toUpperCase();
      const d = byVin.get(vin);

      if (already.has(vin)) {
        results.push({ vin, status: 'skipped', reason: 'Already in your fleet' });
        continue;
      }
      if (!d?.ok) {
        results.push({ vin, status: 'failed', reason: d?.error ?? 'Could not decode this VIN' });
        continue;
      }

      // The host's answers win over the decode — they are looking at the car.
      const transmission = row.transmission ?? d.transmission;
      const fuelType = row.fuelType ?? d.fuelType;
      const seats = row.seats ?? d.seats;
      const bodyType = row.bodyType ?? d.bodyType;

      const lacking = [
        !transmission && 'transmission',
        !fuelType && 'fuel type',
        !seats && 'seat count',
        !bodyType && 'body type',
      ].filter(Boolean);
      if (lacking.length) {
        results.push({ vin, status: 'failed', reason: `Still needs ${lacking.join(', ')}` });
        continue;
      }
      if (!row.dailyPrice || row.dailyPrice <= 0) {
        results.push({ vin, status: 'failed', reason: 'Needs a daily price' });
        continue;
      }

      // Geocode per row. A car placed at the wrong coordinates is invisible to
      // search, so a failed lookup fails the row rather than defaulting.
      let coords: { lat: number; lng: number; city: string } | null = null;
      try {
        const [hit] = await mapsProvider.geocode(row.address);
        if (hit) coords = { lat: hit.lat, lng: hit.lng, city: hit.city };
      } catch (err) {
        logger.warn(`Import geocode failed for ${vin}: ${(err as Error).message}`);
      }
      if (!coords) {
        results.push({ vin, status: 'failed', reason: `Could not find "${row.address}"` });
        continue;
      }

      const label = `${d.year} ${d.make} ${d.model}${d.trim ? ` ${d.trim}` : ''}`;
      try {
        // Parsed through the real schema rather than cast: an import must get
        // the same defaults (category, pricing multipliers) and the same
        // validation as a car created by hand, or imported cars behave subtly
        // differently from typed ones.
        const dto = createVehicleSchema.parse({
          make: d.make!,
          model: d.model!,
          year: d.year!,
          bodyType: bodyType!,
          transmission: transmission!,
          fuelType: fuelType!,
          seats: seats!,
          vin,
          registrationNumber: row.registrationNumber,
          features: [],
          photos: [],
          location: { lat: coords.lat, lng: coords.lng, address: row.address, city: coords.city },
          listing: {
            title: row.title?.trim() || label,
            description: row.description?.trim() || '',
            instantBook: false,
            minTripHours: 24,
            maxTripHours: 24 * 30,
            cancellationPolicy: 'moderate',
          },
          pricing: { dailyPrice: row.dailyPrice, currency: 'USD', cleaningFee: 0 },
          // Status is not in the create DTO — the model defaults new vehicles
          // to 'draft', which is exactly what an import wants: nothing goes
          // live before the host has looked at it and added photos.
        });
        const vehicle = await vehicleService.create(userId, dto);

        results.push({ vin, status: 'created', vehicleId: vehicle._id, label });
      } catch (err) {
        results.push({ vin, status: 'failed', reason: (err as Error).message.slice(0, 160) });
      }
    }

    const created = results.filter((r) => r.status === 'created').length;
    logger.info(`Fleet import for host ${host._id}: ${created}/${rows.length} created`);
    return results;
  },
};
