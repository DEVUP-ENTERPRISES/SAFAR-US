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
    if (patch.listing) update.listing = { ...vehicle.listing, ...patch.listing };
    if (patch.pricing) update.pricing = { ...vehicle.pricing, ...patch.pricing };
    if (patch.features) update.features = patch.features;
    if (patch.location) {
      update.location = {
        type: 'Point',
        coordinates: [patch.location.lng, patch.location.lat],
        address: patch.location.address ?? vehicle.location.address,
        city: patch.location.city ?? vehicle.location.city,
      };
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
    const merged = { ...vehicle.pricing, ...patch };
    await VehicleModel.updateOne({ _id: vehicleId }, { pricing: merged });
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
