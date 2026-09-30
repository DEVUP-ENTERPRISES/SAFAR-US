import { VehicleModel, type VehicleDoc, type WheelbaseLink } from '../../vehicles/infrastructure/vehicle.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { ageInYears } from '../../users/domain/profile-completion';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { logger } from '../../../infrastructure/logging/logger';
import { fetchDealerListings, type WheelbaseListing } from '../infrastructure/wheelbase.client';

const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Same year and make, and one model name starts with the other ("Traverse" / "Traverse FWD Premier"). */
export function sameCar(v: Pick<VehicleDoc, 'year' | 'make' | 'model'>, l: WheelbaseListing): boolean {
  if (!l.year || l.year !== v.year || norm(l.make) !== norm(v.make)) return false;
  const a = norm(v.model);
  const b = norm(l.model);
  return !!a && !!b && (a.startsWith(b) || b.startsWith(a));
}

export function linkFrom(l: WheelbaseListing, linkedBy: WheelbaseLink['linkedBy']): WheelbaseLink {
  return {
    rentalId: l.id,
    name: l.name,
    linkedBy,
    insuranceState: l.insuranceState,
    coverage: l.coverage,
    eligible: l.eligible,
    planLabel: l.planLabel,
    minRenterAge: l.minRenterAge,
    found: true,
    syncedAt: new Date(),
  };
}

export interface WheelbaseSyncResult {
  listings: number;
  updated: number;
  autoLinked: number;
  unmatched: number;
  missing: number;
}

export const wheelbaseInsuranceService = {
  async dealerId(): Promise<string> {
    return (await platformConfigService.get()).insurance.wheelbaseDealerId.trim();
  },

  /**
   * Reads the dealer's Wheelbase listings and refreshes every linked car; links an unlinked car only
   * when exactly one free listing matches it. A Wheelbase outage leaves every car's last known state.
   */
  async sync(): Promise<WheelbaseSyncResult | { skipped: 'no_dealer' }> {
    const dealer = await this.dealerId();
    if (!dealer) return { skipped: 'no_dealer' };
    const listings = await fetchDealerListings(dealer);
    const byId = new Map(listings.map((l) => [l.id, l]));
    const cars = await VehicleModel.find({ deletedAt: null }).lean<VehicleDoc[]>();

    const out: WheelbaseSyncResult = { listings: listings.length, updated: 0, autoLinked: 0, unmatched: 0, missing: 0 };

    for (const car of cars) {
      const current = car.wheelbase;
      if (current?.rentalId) {
        const l = byId.get(current.rentalId);
        if (!l) {
          // Gone from the dealer's account: keep the last reading, but say it could not be confirmed.
          if (current.found !== false) await VehicleModel.updateOne({ _id: car._id }, { $set: { 'wheelbase.found': false, 'wheelbase.syncedAt': new Date() } });
          out.missing += 1;
          continue;
        }
        const next = linkFrom(l, current.linkedBy);
        if (current.insuranceState === 'approved' && next.insuranceState !== 'approved') {
          emit(EVENTS.INSURANCE_STATUS_CHANGED, car._id, { vehicleId: car._id, from: current.insuranceState, to: next.insuranceState ?? 'unknown', name: l.name });
        }
        await VehicleModel.updateOne({ _id: car._id }, { $set: { wheelbase: next } });
        out.updated += 1;
        continue;
      }
      // A Wheelbase listing covers every identical car in its group, so several cars may share one.
      const candidates = listings.filter((l) => sameCar(car, l));
      if (candidates.length === 1) {
        await VehicleModel.updateOne({ _id: car._id }, { $set: { wheelbase: linkFrom(candidates[0], 'auto') } });
        out.autoLinked += 1;
      } else {
        out.unmatched += 1;
      }
    }
    logger.info(out, 'wheelbase insurance sync');
    return out;
  },

  /** Every car with its link, plus the dealer's listings, for the admin page. */
  async overview() {
    const dealer = await this.dealerId();
    const cars = await VehicleModel.find({ deletedAt: null })
      .select('make model year registrationNumber status wheelbase photos')
      .sort({ make: 1, model: 1 })
      .lean<VehicleDoc[]>();
    let listings: WheelbaseListing[] = [];
    let error: string | undefined;
    if (dealer) {
      try {
        listings = await fetchDealerListings(dealer);
      } catch (err) {
        error = 'Wheelbase could not be reached just now. Showing the last known insurance for each car.';
        logger.warn({ err: (err as Error).message }, 'wheelbase listings fetch failed');
      }
    }
    return {
      dealerId: dealer,
      error,
      listings,
      cars: cars.map((c) => ({
        _id: c._id,
        name: `${c.year} ${c.make} ${c.model}`,
        plate: c.registrationNumber,
        status: c.status,
        photoUrl: c.photos?.[0]?.url,
        wheelbase: c.wheelbase ?? null,
        suggestions: c.wheelbase ? [] : listings.filter((l) => sameCar(c, l)).map((l) => l.id),
      })),
    };
  },

  /** An admin ties a car to a Wheelbase listing (or clears it); the listing must be in the dealer's account. */
  async link(vehicleId: string, rentalId: number | null): Promise<void> {
    const car = await VehicleModel.findOne({ _id: vehicleId, deletedAt: null }).lean<VehicleDoc>();
    if (!car) throw new NotFoundError('Vehicle');
    if (rentalId === null) {
      await VehicleModel.updateOne({ _id: vehicleId }, { $unset: { wheelbase: 1 } });
      return;
    }
    const dealer = await this.dealerId();
    if (!dealer) throw new ValidationError('Set the Wheelbase dealer ID first.');
    const listing = (await fetchDealerListings(dealer)).find((l) => l.id === rentalId);
    if (!listing) throw new ValidationError('That listing is not in this Wheelbase account.');
    await VehicleModel.updateOne({ _id: vehicleId }, { $set: { wheelbase: linkFrom(listing, 'admin') } });
  },

  /** Added to every guest-facing car query so guests only see cars the booking rule below would accept. */
  async guestVisibleFilter(): Promise<Record<string, unknown>> {
    const { insurance } = await platformConfigService.get();
    return insurance.requireApproved ? { 'wheelbase.insuranceState': 'approved' } : {};
  },

  /**
   * The insurance rules at booking and at handover: the car must be approved (when required) and the
   * driver old enough for its cover, by the verified ID's date of birth or else the profile's, at pickup.
   */
  async assertInsurable(vehicleId: string, guestId: string, pickupAt: Date): Promise<void> {
    const { insurance } = await platformConfigService.get();
    const car = await VehicleModel.findById(vehicleId).select('wheelbase').lean<Pick<VehicleDoc, 'wheelbase'>>();
    const wb = car?.wheelbase;

    if (insurance.requireApproved && wb?.insuranceState !== 'approved') {
      throw new ConflictError('This car isn’t available to book right now. Please choose another car.', 'INSURANCE_NOT_APPROVED');
    }
    const minAge = wb?.minRenterAge;
    if (insurance.enforceMinAge && minAge) {
      const [kyc, user] = await Promise.all([
        KycModel.findOne({ userId: guestId }).select('verifiedDob').lean<{ verifiedDob?: Date }>(),
        UserModel.findById(guestId).select('dateOfBirth').lean<{ dateOfBirth?: string }>(),
      ]);
      const age = ageInYears(kyc?.verifiedDob ?? user?.dateOfBirth, pickupAt);
      if (age !== null && age < minAge) {
        throw new ConflictError(`Drivers must be ${minAge} or older to be insured on this car. Please choose another car.`, 'RENTER_TOO_YOUNG');
      }
    }
  },

  /** What is recorded on a booking: the car's insurance as it stood when it was booked. */
  async snapshot(vehicleId: string): Promise<Record<string, unknown> | undefined> {
    const car = await VehicleModel.findById(vehicleId).select('wheelbase').lean<Pick<VehicleDoc, 'wheelbase'>>();
    const wb = car?.wheelbase;
    if (!wb) return undefined;
    return {
      provider: 'wheelbase',
      rentalId: wb.rentalId,
      insuranceState: wb.insuranceState,
      coverage: wb.coverage,
      planLabel: wb.planLabel,
      minRenterAge: wb.minRenterAge,
      checkedAt: wb.syncedAt,
    };
  },
};
