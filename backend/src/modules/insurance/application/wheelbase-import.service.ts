import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { createVehicleSchema } from '../../vehicles/dto/vehicle.schemas';
import { hostService } from '../../hosts/application/host.service';
import { storageGateway } from '../../../infrastructure/storage/storage.provider';
import { AppError, ForbiddenError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';
import { fetchDealerListings, type WheelbaseListing } from '../infrastructure/wheelbase.client';
import { wheelbaseInsuranceService, sameCar, linkFrom } from './wheelbase-insurance.service';

const MAX_PHOTOS = 12;
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type Car = Pick<VehicleDoc, '_id' | 'make' | 'model' | 'year' | 'status' | 'photos' | 'features' | 'listing' | 'wheelbase' | 'location'>;

export interface ImportPlanRow {
  listingId: number;
  name: string;
  photos: number;
  pricePerDayCents?: number;
  /** update: fill the matching CatoDrive cars; create: no car yet, a draft is made; choose: a car fits several listings. */
  action: 'update' | 'create' | 'choose';
  cars: { id: string; name: string; status: string; fills: string[] }[];
  note?: string;
}

export interface ImportResult {
  listingId: number;
  name: string;
  outcome: 'updated' | 'created' | 'skipped' | 'failed';
  vehicleIds: string[];
  detail?: string;
}

const fuelOf = (f?: string): 'petrol' | 'diesel' | 'hybrid' | 'ev' => {
  const s = (f ?? '').toLowerCase();
  if (s.includes('diesel')) return 'diesel';
  if (s.includes('hybrid')) return 'hybrid';
  if (s.includes('electric') || s === 'ev') return 'ev';
  return 'petrol';
};

const bodyOf = (l: WheelbaseListing): string => {
  const s = `${l.details.bodyClass ?? ''} ${l.name}`.toLowerCase();
  if (/minivan|\bvan\b|odyssey|sienna|pacifica|carnival/.test(s)) return 'minivan';
  if (/truck|pickup|f-150|silverado|tacoma|ram\b/.test(s)) return 'truck';
  if (/sedan|camry|accord|civic|corolla|altima/.test(s)) return 'sedan';
  return 'suv';
};

/** What a CatoDrive car is missing that its Wheelbase listing can supply. */
function fillsFor(car: Car, l: WheelbaseListing): string[] {
  const out: string[] = [];
  if (!car.photos?.length && l.details.photoUrls.length) out.push('photos');
  if (!car.listing?.description && l.details.description) out.push('description');
  if (!car.features?.length && l.details.features.length) out.push('features');
  if (car.wheelbase?.rentalId !== l.id) out.push('insurance');
  return out;
}

/** Copies Wheelbase photos into CatoDrive storage; a photo that cannot be copied keeps its Wheelbase address. */
async function copyPhotos(urls: string[], ownerId: string): Promise<{ url: string; key?: string; isCover: boolean }[]> {
  const out: { url: string; key?: string; isCover: boolean }[] = [];
  for (const [i, src] of urls.slice(0, MAX_PHOTOS).entries()) {
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(20_000) });
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
      if (!res.ok || !PHOTO_TYPES.has(type)) throw new Error(`photo ${res.status} ${type}`);
      const body = Buffer.from(await res.arrayBuffer());
      if (!body.byteLength || body.byteLength > MAX_PHOTO_BYTES) throw new Error('photo size');
      const [target] = await storageGateway.createUploadTargets({ ownerId, category: 'vehicle_photo', contentType: type, sizes: [body.byteLength] });
      const put = await fetch(target.uploadUrl, { method: 'PUT', body, headers: { 'Content-Type': type } });
      if (!put.ok) throw new Error(`upload ${put.status}`);
      out.push({ url: target.publicUrl, key: target.key, isCover: i === 0 });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'wheelbase photo copy failed; linking the original');
      out.push({ url: src, isCover: i === 0 });
    }
  }
  return out;
}

/**
 * Brings a host's Wheelbase fleet into CatoDrive. Cars already here (linked, or the same year, make and model)
 * are filled in and linked, never duplicated; a listing with no car here becomes a new draft. Only fills what is
 * missing, so a host's own photos, text and prices are never overwritten.
 */
export const wheelbaseImportService = {
  /** The host must name the Wheelbase account CatoDrive is connected to; another dealer's fleet is refused. */
  async load(userId: string, dealerId: string) {
    const connected = await wheelbaseInsuranceService.dealerId();
    if (!connected || dealerId.trim() !== connected) {
      throw new ForbiddenError('This Wheelbase account isn’t connected to CatoDrive. Please contact support.');
    }
    const host = await hostService.requireHostForUser(userId);
    const [listings, cars] = await Promise.all([
      fetchDealerListings(connected),
      VehicleModel.find({ hostId: host._id, deletedAt: null })
        .select('make model year status photos features listing wheelbase location')
        .lean<Car[]>(),
    ]);
    return { host, listings, cars };
  },

  plan(listings: WheelbaseListing[], cars: Car[]): ImportPlanRow[] {
    return listings.map((l) => {
      const linked = cars.filter((c) => c.wheelbase?.rentalId === l.id);
      const matches = cars.filter((c) => !c.wheelbase?.rentalId && sameCar(c, l));
      const clear = matches.filter((c) => listings.filter((x) => sameCar(c, x)).length === 1);
      const unclear = matches.filter((c) => !clear.includes(c));
      const target = [...linked, ...clear];
      const row = {
        listingId: l.id,
        name: l.name,
        photos: l.details.photoUrls.length,
        pricePerDayCents: l.details.pricePerDayCents,
        cars: target.map((c) => ({ id: c._id, name: `${c.year} ${c.make} ${c.model}`, status: c.status, fills: fillsFor(c, l) })),
      };
      if (target.length) return { ...row, action: 'update' as const };
      if (unclear.length) {
        return { ...row, action: 'choose' as const, note: `${unclear.length} car(s) could be this or another listing with the same model. Link them in Admin → Insurance.` };
      }
      return { ...row, action: 'create' as const, note: l.details.pricePerDayCents ? undefined : 'No price in Wheelbase; set one before publishing.' };
    });
  },

  async preview(userId: string, dealerId: string) {
    const { listings, cars } = await this.load(userId, dealerId);
    const rows = this.plan(listings, cars);
    return {
      listings: listings.length,
      toUpdate: rows.filter((r) => r.action === 'update').reduce((n, r) => n + r.cars.length, 0),
      toCreate: rows.filter((r) => r.action === 'create').length,
      toChoose: rows.filter((r) => r.action === 'choose').length,
      rows,
    };
  },

  async run(userId: string, dealerId: string): Promise<ImportResult[]> {
    const { host, listings, cars } = await this.load(userId, dealerId);
    const rows = this.plan(listings, cars);
    const byId = new Map(listings.map((l) => [l.id, l]));
    const base = cars.find((c) => c.location?.coordinates?.length === 2);
    const results: ImportResult[] = [];

    for (const row of rows) {
      const l = byId.get(row.listingId)!;
      try {
        if (row.action === 'choose') {
          results.push({ listingId: l.id, name: l.name, outcome: 'skipped', vehicleIds: [], detail: row.note });
          continue;
        }
        if (row.action === 'update') {
          let photos: Awaited<ReturnType<typeof copyPhotos>> | null = null;
          for (const c of row.cars) {
            const set: Record<string, unknown> = { wheelbase: linkFrom(l, 'auto') };
            if (c.fills.includes('photos')) set.photos = photos ??= await copyPhotos(l.details.photoUrls, host.userId);
            if (c.fills.includes('description')) set['listing.description'] = l.details.description!.slice(0, 2000);
            if (c.fills.includes('features')) set.features = l.details.features;
            await VehicleModel.updateOne({ _id: c.id }, { $set: set });
          }
          results.push({ listingId: l.id, name: l.name, outcome: 'updated', vehicleIds: row.cars.map((c) => c.id) });
          continue;
        }
        if (!l.year || !l.make || !l.model) throw new ValidationError('Wheelbase listing has no year, make or model');
        if (!l.details.pricePerDayCents) throw new ValidationError('No price in Wheelbase; add this car by hand');
        const loc = l.details.location;
        const coords = base
          ? { lng: base.location.coordinates[0], lat: base.location.coordinates[1], address: base.location.address, city: base.location.city }
          : loc?.lat != null && loc.lng != null
            ? { lng: loc.lng, lat: loc.lat, address: [loc.city, loc.state].filter(Boolean).join(', '), city: loc.city ?? '' }
            : null;
        if (!coords) throw new ValidationError('No location for this car');
        const body = bodyOf(l);
        const dto = createVehicleSchema.parse({
          make: l.make,
          model: l.model,
          year: l.year,
          bodyType: body,
          category: body,
          transmission: /manual/i.test(l.details.transmission ?? '') ? 'manual' : 'automatic',
          fuelType: fuelOf(l.details.fuelType),
          seats: Math.min(60, Math.max(1, l.details.seats ?? 5)),
          features: l.details.features,
          photos: await copyPhotos(l.details.photoUrls, host.userId),
          location: coords,
          listing: { title: l.name.slice(0, 120), description: (l.details.description ?? '').slice(0, 2000) },
          pricing: { dailyPrice: l.details.pricePerDayCents },
        });
        const v = await vehicleService.create(host.userId, dto);
        await VehicleModel.updateOne({ _id: v._id }, { $set: { wheelbase: linkFrom(l, 'auto') } });
        results.push({ listingId: l.id, name: l.name, outcome: 'created', vehicleIds: [v._id] });
      } catch (err) {
        logger.warn({ err: (err as Error).message, listing: l.id }, 'wheelbase import row failed');
        // Our own rule messages are plain sentences; anything else stays in the log, not in front of the host.
        const detail = err instanceof AppError ? err.message : 'Could not import this car right now. Try again, or add it by hand.';
        results.push({ listingId: l.id, name: l.name, outcome: 'failed', vehicleIds: [], detail });
      }
    }
    return results;
  },
};
