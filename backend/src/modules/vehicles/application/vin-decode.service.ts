import { logger } from '../../../infrastructure/logging/logger';

/**
 * VIN decoding via NHTSA vPIC.
 *
 * Onboarding a fleet by hand is mostly typing facts that are already encoded in
 * the VIN. vPIC is the US government's own database — free, public, no key, no
 * terms problem — and it returns year, make, model, trim, body class, fuel,
 * transmission, doors and seats. That is seven of the ten fields a listing
 * requires, so a host supplies only what a VIN cannot know: price, location and
 * how they describe the car.
 *
 * Two rules here, both because a wrong spec on a rental listing is a dispute
 * rather than a typo:
 *
 *  - A VIN that does not decode is REPORTED, never guessed at. The importer
 *    shows it back to the host to fix rather than inventing a plausible car.
 *  - vPIC's own error text is passed through. It distinguishes "this VIN is
 *    malformed" from "we decoded it but the check digit is off", and the second
 *    is common in legitimate data entry and should not block an import.
 */

const ENDPOINT = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesBatch/';

export interface DecodedVin {
  vin: string;
  ok: boolean;
  /** Present when ok. */
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  bodyType?: string;
  fuelType?: 'petrol' | 'diesel' | 'hybrid' | 'ev';
  transmission?: 'manual' | 'automatic';
  seats?: number;
  doors?: number;
  /** vPIC's note — often a harmless check-digit warning worth surfacing. */
  note?: string;
  error?: string;
}

interface VpicRow {
  VIN?: string;
  ModelYear?: string;
  Make?: string;
  Model?: string;
  Trim?: string;
  BodyClass?: string;
  FuelTypePrimary?: string;
  TransmissionStyle?: string;
  Doors?: string;
  Seats?: string;
  ElectrificationLevel?: string;
  ErrorText?: string;
}

/** vPIC body classes are verbose ("Sedan/Saloon"); the listing wants a bucket. */
function mapBody(cls?: string): string | undefined {
  if (!cls) return undefined;
  const c = cls.toLowerCase();
  if (c.includes('sedan') || c.includes('saloon')) return 'sedan';
  if (c.includes('suv') || c.includes('sport utility')) return 'suv';
  if (c.includes('pickup') || c.includes('truck')) return 'truck';
  if (c.includes('van') || c.includes('minivan')) return 'van';
  if (c.includes('coupe')) return 'coupe';
  if (c.includes('convertible') || c.includes('cabriolet') || c.includes('roadster')) return 'convertible';
  if (c.includes('hatchback') || c.includes('liftback')) return 'hatchback';
  if (c.includes('wagon')) return 'wagon';
  return 'sedan';
}

/**
 * Electrification level is the reliable hybrid/EV signal, not fuel type: a
 * plug-in hybrid reports "Gasoline" as its primary fuel and would otherwise be
 * listed as a petrol car.
 */
function mapFuel(fuel?: string, electrification?: string): DecodedVin['fuelType'] {
  const e = (electrification ?? '').toLowerCase();
  if (e.includes('bev') || e.includes('battery electric')) return 'ev';
  if (e.includes('hev') || e.includes('phev') || e.includes('hybrid')) return 'hybrid';

  const f = (fuel ?? '').toLowerCase();
  if (f.includes('electric')) return 'ev';
  if (f.includes('diesel')) return 'diesel';
  if (f.includes('gasoline') || f.includes('petrol') || f.includes('flexible')) return 'petrol';
  return undefined;
}

function mapTransmission(t?: string): DecodedVin['transmission'] {
  if (!t) return undefined;
  const s = t.toLowerCase();
  if (s.includes('manual')) return 'manual';
  // Automatic, CVT, DCT, "Automated Manual" — all automatic to a renter.
  return 'automatic';
}

const num = (v?: string): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export const vinDecodeService = {
  /**
   * Decode up to 50 VINs in one call — vPIC's batch endpoint, which is the
   * difference between one request and a hundred for a fleet import.
   */
  async decodeBatch(vins: string[]): Promise<DecodedVin[]> {
    const clean = vins.map((v) => v.trim().toUpperCase()).filter(Boolean);
    if (clean.length === 0) return [];

    const out: DecodedVin[] = [];
    for (let i = 0; i < clean.length; i += 50) {
      const chunk = clean.slice(i, i + 50);
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ format: 'json', data: chunk.join(';') }),
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) throw new Error(`vPIC ${res.status}`);
        const rows = ((await res.json()) as { Results?: VpicRow[] }).Results ?? [];

        for (let k = 0; k < chunk.length; k += 1) {
          const r = rows[k];
          const vin = chunk[k];
          const year = num(r?.ModelYear);
          const make = r?.Make?.trim();
          const model = r?.Model?.trim();

          // Year, make and model are the floor. Without all three there is no
          // listing, whatever else came back.
          if (!year || !make || !model) {
            out.push({
              vin,
              ok: false,
              error: r?.ErrorText?.split(';')[0]?.trim() || 'Could not decode this VIN',
            });
            continue;
          }

          out.push({
            vin,
            ok: true,
            year,
            make: make.charAt(0) + make.slice(1).toLowerCase(),
            model,
            trim: r?.Trim?.trim() || undefined,
            bodyType: mapBody(r?.BodyClass),
            fuelType: mapFuel(r?.FuelTypePrimary, r?.ElectrificationLevel),
            transmission: mapTransmission(r?.TransmissionStyle),
            seats: num(r?.Seats),
            doors: num(r?.Doors),
            note: r?.ErrorText && !r.ErrorText.startsWith('0') ? r.ErrorText.split(';')[0].trim() : undefined,
          });
        }
      } catch (err) {
        logger.warn(`VIN batch decode failed: ${(err as Error).message}`);
        // The whole chunk failing is a lookup outage, not bad VINs — say so,
        // so the host retries instead of retyping a hundred correct VINs.
        for (const vin of chunk) {
          out.push({ vin, ok: false, error: 'VIN lookup is unavailable right now — try again shortly' });
        }
      }
    }
    return out;
  },
};
