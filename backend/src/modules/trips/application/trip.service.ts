import { TripModel, type TripDoc } from '../infrastructure/trip.model';
import { bookingService } from '../../bookings/application/booking.service';
import { depositService } from '../../payments/application/deposit.service';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { NotFoundError, ConflictError, ForbiddenError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { logger } from '../../../infrastructure/logging/logger';

/** Minimum return-condition photos before a trip can be completed. */
export const MIN_RETURN_PHOTOS = 2;

export class TripService {
  /** Start the trip (handover). Booking must be paid. */
  async start(
    userId: string,
    bookingId: string,
    handover: { odometerStart?: number; fuelStart?: number; notes?: string },
  ): Promise<TripDoc> {
    const booking = await bookingService.getDoc(bookingId);
    if (booking.guestId !== userId && !(await this.isHost(userId, booking.hostId))) {
      throw new ForbiddenError('Not a participant of this booking');
    }
    if (booking.status !== 'paid') {
      throw new ConflictError('Booking must be paid before starting the trip', 'INVALID_STATE');
    }
    const existing = await TripModel.findOne({ bookingId }).lean();
    if (existing) throw new ConflictError('Trip already started', 'TRIP_EXISTS');

    // The deposit is authorised at handover, not at booking: a card
    // authorisation only lives about a week, so one taken when a trip was
    // booked 40 days out would have expired by the day it mattered.
    if (await depositService.isEnabled()) {
      const held = await depositService.forBooking(bookingId);
      if (!held) {
        const vehicle = await vehicleService.getForBooking(booking.vehicleId);
        await depositService.authorize({
          bookingId,
          userId: booking.guestId,
          dailyPrice: vehicle.dailyPrice,
          currency: booking.priceBreakdown.total.currency,
        });
      }
    }

    const trip = await TripModel.create({
      bookingId,
      vehicleId: booking.vehicleId,
      guestId: booking.guestId,
      hostId: booking.hostId,
      status: 'active',
      handover: { at: new Date(), ...handover },
    });

    await bookingService.markInProgress(bookingId);
    await bookingService.attachTrip(bookingId, trip._id);
    emit(EVENTS.TRIP_STARTED, trip._id, { tripId: trip._id, bookingId });
    return trip.toObject();
  }

  async updateLocation(userId: string, tripId: string, lng: number, lat: number): Promise<void> {
    const trip = await this.getDoc(tripId);
    if (trip.guestId !== userId) throw new ForbiddenError('Only the guest streams trip location');
    await TripModel.updateOne(
      { _id: tripId },
      { liveLocation: { type: 'Point', coordinates: [lng, lat], updatedAt: new Date() } },
    );
  }

  /** Return + finalize. Triggers payout scheduling via events. */
  async complete(
    userId: string,
    tripId: string,
    ret: { odometerEnd?: number; fuelEnd?: number; notes?: string },
  ): Promise<TripDoc> {
    const trip = await this.getDoc(tripId);
    if (trip.guestId !== userId && !(await this.isHost(userId, trip.hostId))) {
      throw new ForbiddenError('Not a participant of this trip');
    }
    if (trip.status !== 'active') throw new ConflictError('Trip is not active', 'INVALID_STATE');

    // Return photos are required to complete. They are the condition record the
    // deposit and any damage claim are judged against; letting a trip close
    // without them means a later dispute has no evidence either way. The guest
    // is prompted to take them on the trip screen before this button enables.
    const returnPhotos = (trip.photos ?? []).filter((p) => p.phase === 'post').length;
    if (returnPhotos < MIN_RETURN_PHOTOS) {
      throw new ConflictError(
        `Add at least ${MIN_RETURN_PHOTOS} return photos before ending the trip (you have ${returnPhotos}).`,
        'RETURN_PHOTOS_REQUIRED',
      );
    }

    const distanceKm =
      ret.odometerEnd != null && trip.handover.odometerStart != null
        ? Math.max(0, ret.odometerEnd - trip.handover.odometerStart)
        : trip.distanceKm;

    // Charge the guest for driving past the included mileage. Real money —
    // booked to the ledger and paid to the host, exactly like rental income.
    const overage = await this.chargeMileageOverage(trip, distanceKm);

    await TripModel.updateOne(
      { _id: tripId },
      {
        status: 'completed',
        return: { at: new Date(), ...ret },
        distanceKm,
        ...(overage ? { mileageOverage: overage } : {}),
      },
    );
    await bookingService.markCompleted(trip.bookingId);

    // The deposit is not released here. The host gets an inspection window to
    // report damage first; the auto-release job frees it when that window
    // closes with no claim. Releasing on return would leave a host who finds a
    // scratch an hour later with nothing to settle against.

    emit(EVENTS.TRIP_COMPLETED, tripId, {
      tripId,
      bookingId: trip.bookingId,
      hostId: trip.hostId,
    });
    return this.getDoc(tripId);
  }

  async get(tripId: string): Promise<TripDoc> {
    return this.getDoc(tripId);
  }

  /**
   * Mileage overage: the guest agreed to N included km; anything beyond that is
   * billed at the host's per-km rate. The money is real — debited from the
   * guest's wallet and credited to the host's payable, through the same
   * double-entry ledger as everything else.
   *
   * Returns null when the vehicle has unlimited mileage or the guest stayed
   * within the limit.
   */
  private async chargeMileageOverage(
    trip: TripDoc,
    distanceKm: number,
  ): Promise<{ km: number; amountCents: number; chargedAt: Date } | null> {
    if (trip.mileageOverage) return null; // idempotent — never bill twice

    const vehicle = await VehicleModel.findById(trip.vehicleId).lean<VehicleDoc>();
    const perDayKm = vehicle?.mileageLimit?.perDayKm ?? 0;
    const feePerKm = vehicle?.mileageLimit?.overageFeePerKm ?? 0;
    if (perDayKm <= 0 || feePerKm <= 0) return null; // unlimited mileage

    const booking = await bookingService.getDoc(trip.bookingId);
    // Included mileage must be measured against the exact number of days the
    // guest was billed for — the same count the pricing engine used and stored
    // on the booking. Recomputing it here with a different rule (e.g. ceil of
    // the millisecond span) drifts from what they paid for and would charge
    // overage a day early. Fall back to the span only for legacy bookings that
    // predate a stored day count.
    const days =
      booking.priceBreakdown?.days ??
      Math.max(
        1,
        Math.ceil((+new Date(booking.period.end) - +new Date(booking.period.start)) / 86_400_000),
      );
    const includedKm = perDayKm * days;
    const overKm = Math.max(0, Math.round(distanceKm - includedKm));
    if (overKm <= 0) return null;

    const amountCents = overKm * feePerKm;
    // Same shape as postBookingLedger: cash collected from the guest is a
    // CREDIT to gateway_clearing, and what the host is owed is a DEBIT to their
    // payable (host_payable is debit-normal in this ledger).
    await ledgerService.post({
      refType: 'mileage_overage',
      refId: trip.bookingId,
      currency: booking.priceBreakdown.currency,
      description: `Mileage overage: ${overKm} km over ${includedKm} km included`,
      legs: [
        { account: Account.gatewayClearing(), direction: 'credit', amount: amountCents },
        { account: Account.hostPayable(trip.hostId), direction: 'debit', amount: amountCents },
      ],
    });

    logger.info(
      { tripId: trip._id, overKm, includedKm, amountCents },
      'Mileage overage charged',
    );
    return { km: overKm, amountCents, chargedAt: new Date() };
  }

  /** Contactless / in-person check-in before handover. */
  async checkIn(
    userId: string,
    tripId: string,
    method: 'contactless' | 'in_person',
  ): Promise<TripDoc> {
    const trip = await this.getDoc(tripId);
    if (!(await this.isParticipant(userId, tripId))) throw new ForbiddenError('Not a participant');
    await TripModel.updateOne({ _id: tripId }, { checkin: { at: new Date(), method } });
    emit(EVENTS.TRIP_CHECKED_IN, tripId, { tripId, bookingId: trip.bookingId, method });
    return this.getDoc(tripId);
  }

  /**
   * Host confirms the guest's driver's licence at handover. Required before the
   * protection plan applies — so it gates the rest of check-in.
   */
  async confirmLicense(userId: string, tripId: string): Promise<TripDoc> {
    const trip = await this.getDoc(tripId);
    if (!(await this.isHost(userId, trip.hostId))) throw new ForbiddenError('Host only');
    await TripModel.updateOne(
      { _id: tripId },
      { licenseConfirmed: true, licenseConfirmedAt: new Date() },
    );
    return this.getDoc(tripId);
  }

  /** Condition photos. `pre` = check-in, `post` = checkout. */
  async addPhotos(
    userId: string,
    tripId: string,
    phase: 'pre' | 'post',
    photos: { url: string; key?: string }[],
  ): Promise<TripDoc> {
    if (!(await this.isParticipant(userId, tripId))) throw new ForbiddenError('Not a participant');
    const at = new Date();
    await TripModel.updateOne(
      { _id: tripId },
      { $push: { photos: { $each: photos.map((p) => ({ ...p, phase, byUserId: userId, at })) } } },
    );
    return this.getDoc(tripId);
  }

  /**
   * Record the start odometer/fuel — the baseline every mileage charge is
   * measured from, so it must be captured before the guest drives away.
   */
  async startHandover(
    userId: string,
    tripId: string,
    input: { odometerStart: number; fuelStart?: number; notes?: string },
  ): Promise<TripDoc> {
    const trip = await this.getDoc(tripId);
    if (!(await this.isHost(userId, trip.hostId))) throw new ForbiddenError('Host only');
    await TripModel.updateOne(
      { _id: tripId },
      { handover: { at: new Date(), ...input } },
    );
    return this.getDoc(tripId);
  }

  /** Guest/host reports damage with photos (feeds claims/assessment). */
  async reportDamage(
    userId: string,
    tripId: string,
    description: string,
    photos: string[],
  ): Promise<TripDoc> {
    const trip = await this.getDoc(tripId);
    if (!(await this.isParticipant(userId, tripId))) throw new ForbiddenError('Not a participant');
    await TripModel.updateOne(
      { _id: tripId },
      { $push: { damageReports: { description, photos, byUserId: userId, at: new Date() } } },
    );
    emit(EVENTS.TRIP_DAMAGE_REPORTED, tripId, { tripId, bookingId: trip.bookingId, byUserId: userId });
    return this.getDoc(tripId);
  }

  /** Emergency SOS during a trip. */
  async raiseSos(userId: string, tripId: string): Promise<void> {
    const trip = await this.getDoc(tripId);
    if (!(await this.isParticipant(userId, tripId))) throw new ForbiddenError('Not a participant');
    await TripModel.updateOne(
      { _id: tripId },
      { $push: { sosEvents: { byUserId: userId, at: new Date() } } },
    );
    emit(EVENTS.TRIP_SOS, tripId, { tripId, bookingId: trip.bookingId, byUserId: userId });
  }

  private async getDoc(tripId: string): Promise<TripDoc> {
    const trip = await TripModel.findById(tripId).lean<TripDoc>();
    if (!trip) throw new NotFoundError('Trip');
    return trip;
  }

  private async isHost(userId: string, hostId: string): Promise<boolean> {
    const { hostService } = await import('../../hosts/application/host.service');
    const host = await hostService.getByUserId(userId);
    return !!host && host._id === hostId;
  }

  /** Public participant check (used by the realtime gateway). */
  async isHostUser(userId: string, hostId: string): Promise<boolean> {
    return this.isHost(userId, hostId);
  }

  /** Is this user a participant (guest or host) of the trip's booking? */
  async isParticipant(userId: string, tripId: string): Promise<boolean> {
    const trip = await this.getDoc(tripId);
    return trip.guestId === userId || (await this.isHost(userId, trip.hostId));
  }
}

export const tripService = new TripService();
