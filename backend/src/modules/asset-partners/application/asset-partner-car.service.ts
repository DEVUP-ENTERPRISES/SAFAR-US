import { AssetPartnerApplicationModel, type AssetPartnerApplicationDoc } from '../infrastructure/asset-partner-application.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { fleetImportService } from '../../vehicles/application/fleet-import.service';
import { hostService } from '../../hosts/application/host.service';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { assetPartnerService } from './asset-partner.service';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

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
