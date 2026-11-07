import { AssetPartnerApplicationModel, type AssetPartnerApplicationDoc } from '../infrastructure/asset-partner-application.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { fleetImportService } from '../../vehicles/application/fleet-import.service';
import { hostService } from '../../hosts/application/host.service';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { assetPartnerService } from './asset-partner.service';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';
import { auditService } from '../../audit/application/audit.service';

export const MAX_CARS_PER_BATCH = 25;
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/;

export interface AddCarRow {
  vin: string;
  plate?: string;
}

export interface AddCarResult {
  vin: string;
  status: 'added' | 'already' | 'failed';
  vehicleId?: string;
  reason?: string;
}

export interface Operator {
  userId: string;
  roles: string[];
  ip?: string;
  userAgent?: string;
}

export interface ListingInput {
  address?: string;
  transmission?: 'manual' | 'automatic';
  fuelType?: 'petrol' | 'diesel' | 'hybrid' | 'ev';
  seats?: number;
  bodyType?: string;
}

/** Puts an approved partner car on CatoDrive's own fleet as a draft, tagged to its partner so statements, repairs and their dashboard follow it. */
export const assetPartnerCarService = {
  async createListing(applicationId: string, operatorUserId: string, input: ListingInput = {}): Promise<{ vehicleId: string; created: boolean }> {
    const app = await AssetPartnerApplicationModel.findById(applicationId).lean<AssetPartnerApplicationDoc>();
    if (!app) throw new NotFoundError('Application');
    if (app.status !== 'approved' || !app.partnerId) throw new ConflictError('Approve the application first.', 'NOT_APPROVED');
    if (app.vehicleId && (await VehicleModel.exists({ _id: app.vehicleId, deletedAt: null }))) return { vehicleId: app.vehicleId, created: false };

    const host = await hostService.requireHostForUser(operatorUserId);
    // Partner cars are run from where the rest of the fleet is based, unless told otherwise.
    const base = await VehicleModel.findOne({ hostId: host._id, deletedAt: null, 'location.address': { $exists: true } })
      .sort({ createdAt: -1 })
      .select('location.address')
      .lean<{ location?: { address?: string } }>();
    const address = input.address?.trim() || base?.location?.address;
    if (!address) throw new ValidationError('Enter the address the car will be based at');

    const vin = app.vehicle.vin.trim().toUpperCase();
    const [result] = await fleetImportService.importRows(operatorUserId, [{
      vin,
      address,
      registrationNumber: app.vehicle.plate,
      title: `${app.vehicle.year} ${app.vehicle.make} ${app.vehicle.model}${app.vehicle.trim ? ` ${app.vehicle.trim}` : ''}`,
      status: 'unlisted',
      transmission: input.transmission,
      fuelType: input.fuelType,
      seats: input.seats,
      bodyType: input.bodyType,
    }]);
    let vehicleId = result?.vehicleId;
    if (!vehicleId) {
      const existing = await VehicleModel.findOne({ hostId: host._id, vin, deletedAt: null }).select('_id').lean<{ _id: string }>();
      vehicleId = existing?._id;
    }
    if (!vehicleId) throw new ValidationError(result?.reason ?? 'We couldn’t create the listing for this VIN');

    const current = await VehicleModel.findById(vehicleId).select('assetPartnerId assetPartnerEndedAt photos').lean<{ assetPartnerId?: string; assetPartnerEndedAt?: Date; photos?: unknown[] }>();
    if (current?.assetPartnerId && current.assetPartnerId !== app.partnerId) throw new ConflictError('This car already belongs to another partner.', 'OTHER_PARTNER');
    const photos = (app.photos ?? []).map((p, i) => ({ url: p.url, key: p.key, isCover: i === 0 }));
    await VehicleModel.updateOne(
      { _id: vehicleId },
      {
        $set: { assetPartnerId: app.partnerId, ...(!current?.assetPartnerId ? { assetPartnerSince: new Date() } : {}), ...(photos.length && !current?.photos?.length ? { photos } : {}) },
        $unset: { assetPartnerEndedAt: 1 },
      },
    );
    await AssetPartnerApplicationModel.updateOne({ _id: app._id }, { $set: { vehicleId } });
    logger.info({ applicationId, vehicleId, partnerId: app.partnerId }, 'Asset Partner car added to the fleet');
    return { vehicleId, created: result?.status === 'created' };
  },

  /** Records who owns a car already on CatoDrive's fleet, for cars that were placed before the portal existed. */
  async assign(operatorUserId: string, vehicleId: string, partnerId: string): Promise<void> {
    const host = await hostService.requireHostForUser(operatorUserId);
    const car = await VehicleModel.findOne({ _id: vehicleId, hostId: host._id, deletedAt: null }).select('assetPartnerId assetPartnerEndedAt').lean<{ assetPartnerId?: string; assetPartnerEndedAt?: Date }>();
    if (!car) throw new NotFoundError('Car');
    if (car.assetPartnerId && car.assetPartnerId !== partnerId) throw new ConflictError('This car already belongs to another partner.', 'OTHER_PARTNER');
    if (car.assetPartnerId === partnerId && !car.assetPartnerEndedAt) return;
    const partner = await assetPartnerService.getById(partnerId);
    if (!['onboarding', 'active'].includes(partner.status)) throw new ConflictError('This partner isn’t active, so a car can’t be added to them.', 'PARTNER_NOT_ACTIVE');
    await VehicleModel.updateOne(
      { _id: vehicleId },
      { $set: { assetPartnerId: partnerId, ...(!car.assetPartnerId ? { assetPartnerSince: new Date() } : {}) }, $unset: { assetPartnerEndedAt: 1 } },
    );
    logger.info({ vehicleId, partnerId, operatorUserId }, 'Asset Partner car assigned');
  },

  /** Ops adds a partner's cars, one or many; each row reports its own result so one bad VIN never blocks the rest. */
  async addCars(op: Operator, partnerId: string, input: { address?: string; rows: AddCarRow[] }): Promise<AddCarResult[]> {
    if (!input.rows.length) throw new ValidationError('Add at least one VIN');
    if (input.rows.length > MAX_CARS_PER_BATCH) throw new ValidationError(`Add up to ${MAX_CARS_PER_BATCH} cars at a time`);
    const partner = await assetPartnerService.getById(partnerId);
    if (!['onboarding', 'active'].includes(partner.status)) throw new ConflictError('This partner isn’t active, so cars can’t be added to them.', 'PARTNER_NOT_ACTIVE');
    const host = await hostService.requireHostForUser(op.userId);

    const results = new Map<string, AddCarResult>();
    const rows = new Map<string, AddCarRow>();
    for (const r of input.rows) {
      const vin = r.vin.trim().toUpperCase();
      if (!VIN.test(vin)) results.set(vin || r.vin, { vin: vin || r.vin, status: 'failed', reason: 'Not a 17-character VIN' });
      else if (!rows.has(vin)) rows.set(vin, { vin, plate: r.plate?.trim().toUpperCase() || undefined });
    }

    const vins = [...rows.keys()];
    const found = await VehicleModel.find({ vin: { $in: vins }, deletedAt: null })
      .select('_id vin hostId assetPartnerId assetPartnerEndedAt')
      .lean<{ _id: string; vin: string; hostId: string; assetPartnerId?: string; assetPartnerEndedAt?: Date }[]>();
    const toImport: AddCarRow[] = [];
    for (const vin of vins) {
      const car = found.find((v) => v.vin === vin);
      if (!car) toImport.push(rows.get(vin)!);
      else if (car.hostId !== host._id) results.set(vin, { vin, status: 'failed', reason: 'Listed by another host on CatoDrive' });
      else if (car.assetPartnerId && car.assetPartnerId !== partnerId && !car.assetPartnerEndedAt) results.set(vin, { vin, status: 'failed', reason: 'Belongs to another partner' });
      else if (car.assetPartnerId === partnerId && !car.assetPartnerEndedAt) results.set(vin, { vin, status: 'already', vehicleId: car._id });
      else {
        await this.tag(car._id, partnerId, !car.assetPartnerId || car.assetPartnerId !== partnerId);
        results.set(vin, { vin, status: 'added', vehicleId: car._id });
      }
    }

    if (toImport.length) {
      const base = await VehicleModel.findOne({ hostId: host._id, deletedAt: null, 'location.address': { $exists: true } })
        .sort({ createdAt: -1 })
        .select('location.address')
        .lean<{ location?: { address?: string } }>();
      const address = input.address?.trim() || base?.location?.address;
      if (!address) {
        for (const r of toImport) results.set(r.vin, { vin: r.vin, status: 'failed', reason: 'Enter the address the cars will be based at' });
      } else {
        const imported = await fleetImportService.importRows(op.userId, toImport.map((r) => ({ vin: r.vin, address, registrationNumber: r.plate, status: 'unlisted' as const })));
        for (const r of imported) {
          if (r.vehicleId && (r.status === 'created' || r.status === 'updated' || r.status === 'skipped')) {
            await this.tag(r.vehicleId, partnerId, true);
            results.set(r.vin, { vin: r.vin, status: 'added', vehicleId: r.vehicleId });
          } else {
            results.set(r.vin, { vin: r.vin, status: 'failed', reason: r.reason ?? 'We couldn’t add this VIN' });
          }
        }
      }
    }

    const out = input.rows.map((r) => results.get(r.vin.trim().toUpperCase()) ?? results.get(r.vin)!).filter(Boolean);
    const unique = [...new Map(out.map((r) => [r.vin, r])).values()];
    const added = unique.filter((r) => r.status === 'added');
    if (added.length) {
      await auditService.record({
        actorId: op.userId, actorRoles: op.roles, action: 'asset_partner.cars.added', resourceType: 'asset_partner', resourceId: partnerId,
        ip: op.ip, userAgent: op.userAgent, after: { vehicles: added.map((r) => r.vehicleId) }, status: 200,
      });
      logger.info({ partnerId, added: added.length, operator: op.userId }, 'Asset Partner cars added by ops');
    }
    return unique;
  },

  /** Ties a car to a partner, starting a new partnership date when it is new to them. */
  async tag(vehicleId: string, partnerId: string, fresh: boolean): Promise<void> {
    await VehicleModel.updateOne(
      { _id: vehicleId },
      { $set: { assetPartnerId: partnerId, ...(fresh ? { assetPartnerSince: new Date() } : {}) }, $unset: { assetPartnerEndedAt: 1 } },
    );
  },

  /** Undoes a car put on the wrong partner, only before it has had any booking with them. */
  async unlink(op: Operator, vehicleId: string, reason: string): Promise<void> {
    const host = await hostService.requireHostForUser(op.userId);
    // Only a car on this operator's own fleet can be unlinked.
    const car = await VehicleModel.findOne({ _id: vehicleId, hostId: host._id, deletedAt: null }).select('assetPartnerId assetPartnerSince').lean<{ assetPartnerId?: string; assetPartnerSince?: Date }>();
    if (!car) throw new NotFoundError('Car');
    if (!car.assetPartnerId) throw new ConflictError('This car isn’t a partner car.', 'NOT_PARTNER_VEHICLE');
    const { BookingModel } = await import('../../bookings/infrastructure/booking.model');
    const since = car.assetPartnerSince ?? new Date(0);
    if (await BookingModel.exists({ vehicleId, createdAt: { $gte: since } })) {
      throw new ConflictError('This car has bookings with this partner. Use “Return to owner” instead, so their statements stay right.', 'HAS_TRIPS');
    }
    await VehicleModel.updateOne({ _id: vehicleId, assetPartnerId: car.assetPartnerId }, { $unset: { assetPartnerId: 1, assetPartnerSince: 1, assetPartnerEndedAt: 1 } });
    await auditService.record({
      actorId: op.userId, actorRoles: op.roles, action: 'asset_partner.car.unlinked', resourceType: 'asset_partner', resourceId: car.assetPartnerId,
      ip: op.ip, userAgent: op.userAgent, before: { vehicleId }, reason: reason.trim(), status: 200,
    });
    logger.info({ vehicleId, partnerId: car.assetPartnerId, operator: op.userId }, 'Asset Partner car unlinked');
  },

  /** The car goes back to its owner: it comes off the marketplace and stops being charged from next month. */
  async end(operatorUserId: string, vehicleId: string): Promise<void> {
    const car = await VehicleModel.findById(vehicleId).select('assetPartnerId assetPartnerEndedAt').lean<{ assetPartnerId?: string; assetPartnerEndedAt?: Date }>();
    if (!car?.assetPartnerId) throw new ConflictError('This car isn’t a partner car.', 'NOT_PARTNER_VEHICLE');
    if (car.assetPartnerEndedAt) return;
    await vehicleService.delist(operatorUserId, vehicleId);
    await VehicleModel.updateOne({ _id: vehicleId }, { $set: { assetPartnerEndedAt: new Date() } });
    logger.info({ vehicleId, partnerId: car.assetPartnerId, operatorUserId }, 'Asset Partner car returned to its owner');
  },
};
