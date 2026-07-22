import { VehicleModel, type VehicleDoc } from '../infrastructure/vehicle.model';
import { hostService } from '../../hosts/application/host.service';
import { NotFoundError, ForbiddenError, ConflictError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import type {
  IVehicleContract,
  VehicleForBooking,
} from '../../../core/contracts/vehicle.contract';
import type { CreateVehicleDto } from '../dto/vehicle.schemas';

/**
 * Minimum photos before a listing can be submitted for verification. Turo
 * requires a comparable set; below this, ops cannot judge condition and guests
 * will not book. Enforced on submit and on photo removal for live listings.
 */
export const MIN_LISTING_PHOTOS = 4;

export class VehicleService implements IVehicleContract {
  async create(userId: string, dto: CreateVehicleDto): Promise<VehicleDoc> {
    const host = await hostService.requireHostForUser(userId);
    const vehicle = await VehicleModel.create({
      hostId: host._id,
      make: dto.make,
      model: dto.model,
      year: dto.year,
      bodyType: dto.bodyType,
      category: dto.category,
      transmission: dto.transmission,
      fuelType: dto.fuelType,
      seats: dto.seats,
      vin: dto.vin,
      registrationNumber: dto.registrationNumber,
      specs: dto.specs ?? {},
      features: dto.features,
      photos: dto.photos,
      addOns: dto.addOns ?? [],
      tripRules: dto.tripRules ?? [],
      mileageLimit: dto.mileageLimit ?? { perDayKm: 0, overageFeePerKm: 0 },
      location: {
        type: 'Point',
        coordinates: [dto.location.lng, dto.location.lat],
        address: dto.location.address,
        city: dto.location.city,
      },
      listing: dto.listing,
      pricing: dto.pricing,
    });
    return vehicle.toObject();
  }

  async getById(vehicleId: string): Promise<VehicleDoc> {
    const v = await VehicleModel.findOne({ _id: vehicleId, deletedAt: null }).lean<VehicleDoc>();
    if (!v) throw new NotFoundError('Vehicle');
    return v;
  }

  /** Batch resolve (avoids N+1 for favorites / recently-viewed hydration). */
  async getByIds(ids: string[]): Promise<VehicleDoc[]> {
    if (ids.length === 0) return [];
    return VehicleModel.find({ _id: { $in: ids }, deletedAt: null }).lean<VehicleDoc[]>();
  }

  async listByUser(userId: string): Promise<VehicleDoc[]> {
    const host = await hostService.requireHostForUser(userId);
    return VehicleModel.find({ hostId: host._id, deletedAt: null })
      .sort({ createdAt: -1 })
      .lean<VehicleDoc[]>();
  }

  async update(userId: string, vehicleId: string, patch: Partial<CreateVehicleDto>): Promise<VehicleDoc> {
    const vehicle = await this.getById(vehicleId);
    await this.assertOwner(userId, vehicle);

    const update: Record<string, unknown> = {};

    if (patch.listing) {
      // `delivery` is a nested object: a shallow spread would replace the whole
      // block, so toggling one delivery mode would clear the others.
      const { delivery, ...listingRest } = patch.listing;
      update.listing = {
        ...vehicle.listing,
        ...listingRest,
        ...(delivery ? { delivery: { ...vehicle.listing?.delivery, ...delivery } } : {}),
      };
    }
    if (patch.pricing) update.pricing = { ...vehicle.pricing, ...patch.pricing };
    if (patch.features) update.features = patch.features;
    if (patch.tripRules) update.tripRules = patch.tripRules;
    if (patch.mileageLimit) {
      update.mileageLimit = { ...vehicle.mileageLimit, ...patch.mileageLimit };
    }
    if (patch.location) {
      // Coordinates arrive as a pair or not at all (enforced by the schema);
      // keep the stored point when the patch only renames the address.
      const hasPoint = patch.location.lng !== undefined && patch.location.lat !== undefined;
      update.location = {
        type: 'Point',
        coordinates: hasPoint
          ? [patch.location.lng, patch.location.lat]
          : vehicle.location.coordinates,
        address: patch.location.address ?? vehicle.location.address,
        city: patch.location.city ?? vehicle.location.city,
      };
    }

    // Plain scalars the host can correct on an existing listing.
    for (const k of ['make', 'model', 'year', 'bodyType', 'category', 'transmission', 'fuelType', 'seats'] as const) {
      if (patch[k] !== undefined) update[k] = patch[k];
    }
    await VehicleModel.updateOne({ _id: vehicleId }, update);
    return this.getById(vehicleId);
  }

  /** Update pricing engine settings (manual/dynamic/seasonal/discounts/promo). */
  async updatePricing(
    userId: string,
    vehicleId: string,
    patch: Record<string, unknown>,
  ): Promise<VehicleDoc> {
    const vehicle = await this.getById(vehicleId);
    await this.assertOwner(userId, vehicle);
    const oldPrice = vehicle.pricing.dailyPrice;
    const merged = { ...vehicle.pricing, ...patch };
    await VehicleModel.updateOne({ _id: vehicleId }, { pricing: merged });
    // Price-drop alert for wishlisters.
    if (typeof merged.dailyPrice === 'number' && merged.dailyPrice < oldPrice) {
      emit(EVENTS.VEHICLE_PRICE_DROPPED, vehicleId, {
        vehicleId,
        oldPrice,
        newPrice: merged.dailyPrice,
        title: `${vehicle.make} ${vehicle.model}`,
        currency: vehicle.pricing.currency,
      });
    }
    return this.getById(vehicleId);
  }

  /** Append photos (typically after S3 upload). First photo becomes cover. */
  async addPhotos(
    userId: string,
    vehicleId: string,
    photos: { url: string; key?: string; isCover?: boolean }[],
  ): Promise<VehicleDoc> {
    const vehicle = await this.getById(vehicleId);
    await this.assertOwner(userId, vehicle);
    const existing = vehicle.photos ?? [];
    const merged = [...existing, ...photos];
    if (!merged.some((p) => p.isCover) && merged[0]) merged[0].isCover = true;
    await VehicleModel.updateOne({ _id: vehicleId }, { photos: merged });
    return this.getById(vehicleId);
  }

  /**
   * Remove one photo. A live listing may not drop below the minimum — that
   * would leave a bookable car the guest cannot see.
   */
  async removePhoto(userId: string, vehicleId: string, key: string): Promise<VehicleDoc> {
    const vehicle = await this.getById(vehicleId);
    await this.assertOwner(userId, vehicle);

    const photos = vehicle.photos ?? [];
    const target = photos.find((p) => p.key === key);
    if (!target) throw new NotFoundError('Photo not found on this listing');

    const remaining = photos.filter((p) => p.key !== key);
    if (vehicle.status === 'listed' && remaining.length < MIN_LISTING_PHOTOS) {
      throw new ConflictError(
        `A listed car must keep at least ${MIN_LISTING_PHOTOS} photos. Unlist it first, or add another photo.`,
        'PHOTOS_REQUIRED',
      );
    }
    // Deleting the cover promotes the next photo, so a listing is never
    // left with photos but no cover to render.
    if (target.isCover && remaining[0]) remaining[0].isCover = true;

    await VehicleModel.updateOne({ _id: vehicleId }, { photos: remaining });
    return this.getById(vehicleId);
  }

  /** Promote one photo to cover — the image every search result renders. */
  async setCoverPhoto(userId: string, vehicleId: string, key: string): Promise<VehicleDoc> {
    const vehicle = await this.getById(vehicleId);
    await this.assertOwner(userId, vehicle);

    const photos = vehicle.photos ?? [];
    if (!photos.some((p) => p.key === key)) {
      throw new NotFoundError('Photo not found on this listing');
    }
    const next = photos.map((p) => ({ ...p, isCover: p.key === key }));
    await VehicleModel.updateOne({ _id: vehicleId }, { photos: next });
    return this.getById(vehicleId);
  }

  /** VIN verification (mock: accepts a well-formed VIN; real impl calls a VIN API). */
  async verifyVin(userId: string, vehicleId: string, vin: string): Promise<VehicleDoc> {
    const vehicle = await this.getById(vehicleId);
    await this.assertOwner(userId, vehicle);
    const valid = /^[A-HJ-NPR-Z0-9]{11,17}$/i.test(vin);
    if (!valid) throw new ConflictError('Invalid VIN format', 'INVALID_VIN');
    await VehicleModel.updateOne({ _id: vehicleId }, { vin, vinVerified: true });
    return this.getById(vehicleId);
  }

  /** Host submits a draft for verification. */
  async submit(userId: string, vehicleId: string): Promise<VehicleDoc> {
    const vehicle = await this.getById(vehicleId);
    await this.assertOwner(userId, vehicle);
    if (vehicle.status !== 'draft') {
      throw new ConflictError('Only drafts can be submitted', 'INVALID_STATE');
    }

    // Photos are not optional. A listing with no photos cannot be verified by
    // ops and would never book, so it must not be able to enter the queue.
    const photos = vehicle.photos?.length ?? 0;
    if (photos < MIN_LISTING_PHOTOS) {
      throw new ConflictError(
        `Add at least ${MIN_LISTING_PHOTOS} photos before submitting (you have ${photos}).`,
        'PHOTOS_REQUIRED',
      );
    }
    await VehicleModel.updateOne(
      { _id: vehicleId },
      { status: 'pending_verification', verificationStatus: 'pending' },
    );
    return this.getById(vehicleId);
  }

  /** Ops verifies → vehicle becomes listed & bookable. */
  async verify(vehicleId: string): Promise<VehicleDoc> {
    const vehicle = await this.getById(vehicleId);
    await VehicleModel.updateOne(
      { _id: vehicleId },
      { status: 'listed', verificationStatus: 'verified' },
    );
    emit(EVENTS.VEHICLE_VERIFIED, vehicleId, { vehicleId, hostId: vehicle.hostId });
    emit(EVENTS.VEHICLE_LISTED, vehicleId, { vehicleId, hostId: vehicle.hostId });
    return this.getById(vehicleId);
  }

  async delist(userId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.getById(vehicleId);
    await this.assertOwner(userId, vehicle);
    await VehicleModel.updateOne({ _id: vehicleId }, { status: 'delisted' });
  }

  // ── Admin ──────────────────────────────────────────────────────────
  /** Admin approve (list), suspend (pause), or reject a vehicle. */
  async adminSetStatus(
    vehicleId: string,
    action: 'approve' | 'suspend' | 'reject',
  ): Promise<VehicleDoc> {
    await this.getById(vehicleId);
    const update =
      action === 'approve'
        ? { status: 'listed', verificationStatus: 'verified' }
        : action === 'suspend'
          ? { status: 'paused' }
          : { status: 'draft', verificationStatus: 'rejected' };
    await VehicleModel.updateOne({ _id: vehicleId }, update);
    return this.getById(vehicleId);
  }

  async adminList(opts: {
    q?: string;
    status?: string;
    verification?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ items: VehicleDoc[]; total: number }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const filter: Record<string, unknown> = { deletedAt: null };
    if (opts.status) filter.status = opts.status;
    if (opts.verification) filter.verificationStatus = opts.verification;
    if (opts.q) {
      const rx = new RegExp(opts.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ make: rx }, { model: rx }, { 'listing.title': rx }, { registrationNumber: rx }];
    }
    const [items, total] = await Promise.all([
      VehicleModel.find(filter).sort({ createdAt: -1 }).skip(opts.skip ?? 0).limit(limit).lean<VehicleDoc[]>(),
      VehicleModel.countDocuments(filter),
    ]);
    return { items, total };
  }

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return VehicleModel.countDocuments({ deletedAt: null, ...filter });
  }

  /**
   * Smart Price AI: suggest a daily price from live local comparables
   * (same category, listed & verified, within radius). Returns the market
   * median plus a competitive band and a demand signal.
   */
  async priceSuggestion(input: {
    lng: number; lat: number; category: string; fuelType?: string; radiusKm?: number;
  }): Promise<{
    suggested: number; median: number; p25: number; p75: number; sampleSize: number;
    demand: 'low' | 'balanced' | 'high'; currency: string;
  }> {
    const radiusMeters = (input.radiusKm ?? 25) * 1000;
    const filter: Record<string, unknown> = {
      status: 'listed', verificationStatus: 'verified', deletedAt: null,
      category: input.category,
      location: { $near: { $geometry: { type: 'Point', coordinates: [input.lng, input.lat] }, $maxDistance: radiusMeters } },
    };
    if (input.fuelType) filter.fuelType = input.fuelType;
    const comps = await VehicleModel.find(filter).limit(100).select('pricing.dailyPrice totalTrips').lean();

    const prices = comps.map((c) => c.pricing.dailyPrice).filter((p) => p > 0).sort((a, b) => a - b);
    const CATEGORY_FALLBACK: Record<string, number> = {
      economy: 4500, suv: 8000, luxury: 15000, van: 9000, sports: 20000, ev: 9500,
    };
    if (prices.length < 3) {
      const base = CATEGORY_FALLBACK[input.category] ?? 6000;
      return { suggested: base, median: base, p25: base, p75: base, sampleSize: prices.length, demand: 'balanced', currency: 'USD' };
    }
    const at = (q: number) => prices[Math.min(prices.length - 1, Math.floor(q * prices.length))];
    const median = at(0.5);
    const p25 = at(0.25);
    const p75 = at(0.75);
    // Demand signal from average trips of comps.
    const avgTrips = comps.reduce((s, c) => s + (c.totalTrips ?? 0), 0) / comps.length;
    const demand = avgTrips > 8 ? 'high' : avgTrips < 2 ? 'low' : 'balanced';
    // Suggest slightly under median to win bookings, nudged by demand.
    const factor = demand === 'high' ? 1.05 : demand === 'low' ? 0.92 : 0.98;
    return {
      suggested: Math.round(median * factor),
      median, p25, p75, sampleSize: prices.length, demand, currency: 'USD',
    };
  }

  // ── Contract implementation ──────────────────────────────────────────
  async getForBooking(vehicleId: string): Promise<VehicleForBooking> {
    const v = await this.getById(vehicleId);
    return {
      id: v._id,
      hostId: v.hostId,
      instantBook: v.listing.instantBook,
      cancellationPolicy: v.listing.cancellationPolicy,
      minTripHours: v.listing.minTripHours,
      maxTripHours: v.listing.maxTripHours,
      currency: v.pricing.currency,
      dailyPrice: v.pricing.dailyPrice, // deposit is sized off this
      bookable: v.status === 'listed' && v.verificationStatus === 'verified',
    };
  }

  async isBookable(vehicleId: string): Promise<boolean> {
    const v = await VehicleModel.findOne({ _id: vehicleId, deletedAt: null }).lean<VehicleDoc>();
    return !!v && v.status === 'listed' && v.verificationStatus === 'verified';
  }

  /** Public ownership assertion by id (used by availability routes). */
  async assertOwnerById(userId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.getById(vehicleId);
    await this.assertOwner(userId, vehicle);
  }

  private async assertOwner(userId: string, vehicle: VehicleDoc): Promise<void> {
    const host = await hostService.getByUserId(userId);
    if (!host || host._id !== vehicle.hostId) {
      throw new ForbiddenError('You do not own this vehicle');
    }
  }
}

export const vehicleService = new VehicleService();
