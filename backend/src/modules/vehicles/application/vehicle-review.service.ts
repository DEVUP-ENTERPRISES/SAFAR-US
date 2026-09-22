import { VehicleModel, type VehicleDoc } from '../infrastructure/vehicle.model';
import { DocumentModel } from '../../documents/infrastructure/document.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { userRepository } from '../../users/infrastructure/user.repository';
import { vinDecodeService } from './vin-decode.service';
import { MIN_LISTING_PHOTOS } from './vehicle.service';
import { NotFoundError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

/** One thing an admin should look at before approving, and whether it passes. */
export interface ReviewCheck {
  key: 'photos' | 'registration' | 'insurance' | 'vin' | 'pricing' | 'location';
  label: string;
  detail: string;
  state: 'ok' | 'missing' | 'attention';
}

/** The VIN says one thing, the host typed another. */
export interface VinMismatch {
  field: string;
  vinSays: string;
  hostTyped: string;
}

/**
 * Everything an admin needs to decide on a vehicle, in one read.
 *
 * The queue used to expose Approve/Reject off a table row alone — no photos,
 * no documents, no way to tell a complete listing from an empty one. Approving
 * is the moment a car becomes bookable by a real guest, so it has to be the
 * one place where what was actually submitted is visible.
 */
export const vehicleReviewService = {
  async detail(vehicleId: string) {
    const vehicle = await VehicleModel.findOne({ _id: vehicleId, deletedAt: null }).lean<VehicleDoc>();
    if (!vehicle) throw new NotFoundError('Vehicle');

    const [documents, host] = await Promise.all([
      DocumentModel.find({ vehicleId, deletedAt: null })
        .select('category url status verification expiresAt createdAt')
        .sort({ createdAt: -1 })
        .lean(),
      HostModel.findOne({ _id: vehicle.hostId }).lean<{ _id: string; userId: string; displayName: string } | null>(),
    ]);

    const owner = host ? await userRepository.findById(host.userId) : null;

    const docFor = (category: string) =>
      documents.find((d) => d.category === category) as
        | { category: string; url: string; expiresAt?: Date; verification?: { status?: string } }
        | undefined;

    const checks: ReviewCheck[] = [];
    const photoCount = vehicle.photos?.length ?? 0;
    checks.push({
      key: 'photos',
      label: `${photoCount} photo${photoCount === 1 ? '' : 's'}`,
      detail: photoCount >= MIN_LISTING_PHOTOS ? 'Meets the minimum' : `Needs at least ${MIN_LISTING_PHOTOS}`,
      state: photoCount >= MIN_LISTING_PHOTOS ? 'ok' : 'missing',
    });

    for (const category of ['registration', 'insurance'] as const) {
      const doc = docFor(category);
      const expired = doc?.expiresAt ? new Date(doc.expiresAt).getTime() < Date.now() : false;
      checks.push({
        key: category,
        label: category === 'registration' ? 'Registration document' : 'Insurance document',
        detail: !doc
          ? 'Not uploaded'
          : expired
            ? `Expired ${new Date(doc.expiresAt!).toDateString()}`
            : doc.verification?.status === 'verified'
              ? 'Uploaded and verified'
              : 'Uploaded, not yet verified',
        state: !doc ? 'missing' : expired ? 'attention' : doc.verification?.status === 'verified' ? 'ok' : 'attention',
      });
    }

    // The VIN is the only claim here that can be checked against an outside
    // source, so it is worth re-decoding live rather than trusting a flag.
    let vinMismatches: VinMismatch[] = [];
    let vinNote: string | undefined;
    if (vehicle.vin) {
      try {
        const [decoded] = await vinDecodeService.decodeBatch([vehicle.vin]);
        vinNote = decoded?.note;
        if (decoded?.ok) {
          const compare: [string, unknown, unknown][] = [
            ['Year', decoded.year, vehicle.year],
            ['Make', decoded.make, vehicle.make],
            ['Model', decoded.model, vehicle.model],
          ];
          vinMismatches = compare
            .filter(([, a, b]) => a != null && String(a).toLowerCase() !== String(b).toLowerCase())
            .map(([field, a, b]) => ({ field, vinSays: String(a), hostTyped: String(b) }));
        }
      } catch (err) {
        // A decode outage must not block the review — say so instead.
        logger.warn({ vehicleId, err }, 'VIN decode failed during admin review');
        vinNote = 'VIN could not be checked right now.';
      }
    }
    checks.push({
      key: 'vin',
      label: 'VIN',
      detail: !vehicle.vin
        ? 'Not provided'
        : vinMismatches.length
          ? `Does not match what the host entered (${vinMismatches.map((m) => m.field).join(', ')})`
          : vinNote ?? 'Matches the listing',
      state: !vehicle.vin ? 'missing' : vinMismatches.length ? 'attention' : 'ok',
    });

    checks.push({
      key: 'pricing',
      label: 'Daily price',
      detail: vehicle.pricing?.dailyPrice > 0 ? 'Set' : 'Not set',
      state: vehicle.pricing?.dailyPrice > 0 ? 'ok' : 'missing',
    });
    checks.push({
      key: 'location',
      label: 'Pickup location',
      detail: vehicle.location?.address ? vehicle.location.address : 'Not set',
      state: vehicle.location?.address ? 'ok' : 'missing',
    });

    return {
      vehicle,
      documents,
      host: host
        ? {
            hostId: host._id,
            displayName: host.displayName,
            email: owner?.email,
            userId: host.userId,
          }
        : null,
      checks,
      vinMismatches,
      /** Nothing missing — an admin can approve without chasing anything. */
      readyToApprove: checks.every((c) => c.state !== 'missing'),
    };
  },
};
