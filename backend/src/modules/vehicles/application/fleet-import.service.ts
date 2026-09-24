import { vinDecodeService, type DecodedVin } from './vin-decode.service';
import { vehicleService } from './vehicle.service';
import { createVehicleSchema } from '../dto/vehicle.schemas';
import { VehicleModel } from '../infrastructure/vehicle.model';
import { hostService } from '../../hosts/application/host.service';
import { mapsProvider } from '../../maps/infrastructure/maps.provider';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Fleet import & bulk edit — one paste box for onboarding new cars AND
 * updating ones already in the fleet. A VIN not yet owned creates a DRAFT
 * (price auto-suggested from comps if omitted; status/listed can't apply
 * without photos yet); a VIN already owned updates plate/title/status
 * in place instead of being skipped. Each row is independent and reported
 * with its own outcome so one bad row never costs the other ninety-nine.
 */

export interface ImportRow {
  vin: string;
  /** Cents per day. Omitted rows are auto-priced from comparable listings — the host edits it before publishing. */
  dailyPrice?: number;
  address: string;
  title?: string;
  description?: string;
  registrationNumber?: string;
  /** Host intent. New rows: applied only where it's safe (risk flag); listed/unlisted need photos+verification first, so they're just noted. Existing rows: actually applied via hostSetStatus. */
  status?: 'listed' | 'unlisted' | 'risk';
  /** Supplied only when the VIN did not decode them. */
  transmission?: 'manual' | 'automatic';
  fuelType?: 'petrol' | 'diesel' | 'hybrid' | 'ev';
  seats?: number;
  bodyType?: string;
}

export interface ImportResult {
  vin: string;
  status: 'created' | 'updated' | 'skipped' | 'failed';
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
    }).select('_id vin').lean<{ _id: string; vin: string }[]>();
    const alreadyById = new Map(existing.map((e) => [e.vin, e._id]));

    const results: ImportResult[] = [];

    for (const row of rows) {
      const vin = row.vin.trim().toUpperCase();
      const d = byVin.get(vin);

      // Re-pasting a VIN already in the fleet updates it rather than being
      // skipped — this box doubles as bulk edit, not just first import.
      const existingId = alreadyById.get(vin);
      if (existingId) {
        if (!row.registrationNumber && !row.title && !row.status) {
          results.push({ vin, status: 'skipped', reason: 'Already in your fleet' });
          continue;
        }
        try {
          if (row.registrationNumber) {
            await VehicleModel.updateOne({ _id: existingId }, { registrationNumber: row.registrationNumber });
          }
          if (row.title) {
            await VehicleModel.updateOne({ _id: existingId }, { 'listing.title': row.title });
          }
          if (row.status) {
            await vehicleService.hostSetStatus(userId, existingId, {
              ...(row.status === 'listed' ? { status: 'listed' } : {}),
              ...(row.status === 'unlisted' ? { status: 'paused' } : {}),
              ...(row.status === 'risk' ? { maintenanceRisk: true } : { maintenanceRisk: false }),
            });
          }
          results.push({ vin, status: 'updated', vehicleId: existingId });
        } catch (err) {
          results.push({ vin, status: 'failed', reason: (err as Error).message.slice(0, 160) });
        }
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

      // Price is no longer typed per row — start from the market comps for
      // this category/area so a fresh draft isn't stuck at $0; the host
      // corrects it on the listing before publishing either way.
      let dailyPrice = row.dailyPrice;
      if (!dailyPrice) {
        const suggestion = await vehicleService
          .priceSuggestion({ lng: coords.lng, lat: coords.lat, category: 'economy', fuelType })
          .catch(() => null);
        dailyPrice = suggestion?.suggested ?? 4500;
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
          pricing: { dailyPrice, currency: 'USD', cleaningFee: 0 },
          // Status is not in the create DTO — the model defaults new vehicles
          // to 'draft', which is exactly what an import wants: nothing goes
          // live before the host has looked at it and added photos. A
          // listed/unlisted request on a brand-new car can't apply yet —
          // there are no photos — so only the non-gated risk flag applies here.
        });
        const vehicle = await vehicleService.create(userId, dto);
        if (row.status === 'risk') {
          await VehicleModel.updateOne({ _id: vehicle._id }, { maintenanceRisk: true });
        }

        results.push({
          vin,
          status: 'created',
          vehicleId: vehicle._id,
          label,
          reason: row.status && row.status !== 'risk' ? 'Created as draft — add photos, then publish' : undefined,
        });
      } catch (err) {
        results.push({ vin, status: 'failed', reason: (err as Error).message.slice(0, 160) });
      }
    }

    const created = results.filter((r) => r.status === 'created').length;
    logger.info(`Fleet import for host ${host._id}: ${created}/${rows.length} created`);
    return results;
  },
};
