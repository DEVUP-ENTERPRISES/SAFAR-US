import { TripModel, type TripDoc } from '../infrastructure/trip.model';
import type { CaptainAbility } from '../../hosts/infrastructure/host-staff.model';
import { KycModel, type KycDoc } from '../../kyc/infrastructure/kyc.model';
import { bookingService } from '../../bookings/application/booking.service';
import { incidentalsService } from '../../bookings/application/incidentals.service';
import { recallHoldService } from '../../vehicles/application/recall-hold.service';
import { depositService } from '../../payments/application/deposit.service';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { AppError, NotFoundError, ConflictError, ForbiddenError } from '../../../core/errors/app-error';
import type { Principal } from '../../../core/types/common';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { logger } from '../../../infrastructure/logging/logger';
import { milesToKm } from '../../../shared/utils/distance';
import { inspectionService, type InspectionPhase, type InspectionState, type PhotoInput } from './inspection.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { eligibilityService } from '../../bookings/application/eligibility.service';
import { payoutService } from '../../payouts/application/payout.service';
import { ClaimModel } from '../../claims/infrastructure/claim.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';

export class TripService {
  /** Start the trip (handover), in a fixed order: host inspection, guest/licence check, pickup code, odometer. Booking must be paid. */
  async start(
    principal: Principal,
    bookingId: string,
    handover: { odometerStart?: number; fuelStart?: number; notes?: string; licenceConfirmed?: boolean },
  ): Promise<TripDoc> {
    const { licenceConfirmed, ...readings } = handover;
    const userId = principal.userId;
    const booking = await bookingService.getDoc(bookingId);
    const isAdmin = this.isAdmin(principal);
    const hostSide = await this.isHost(userId, booking.hostId, booking.vehicleId, 'trip:handover');
    if (booking.guestId !== userId && !hostSide && !isAdmin) {
      throw new ForbiddenError('Not a participant of this booking');
    }
    const cfg = (await platformConfigService.get()).handover;
    if (cfg.hostOnlyStart && !hostSide && !isAdmin) {
      throw new AppError({ code: 'HOST_ONLY_START', message: 'The host starts the trip when they hand over the car.', httpStatus: 403 });
    }
    if (booking.status !== 'paid') {
      throw new ConflictError('Booking must be paid before starting the trip', 'INVALID_STATE');
    }
    const existing = await TripModel.findOne({ bookingId }).lean();
    if (existing) throw new ConflictError('Trip already started', 'TRIP_EXISTS');

    await inspectionService.assertPrePhotosBeforeStart(booking, isAdmin);

    // The guest was eligible when they booked; a suspension or revoked KYC since then must stop the handover.
    if (!isAdmin) {
      const eligibility = await eligibilityService.evaluate(booking.guestId, booking.period.end);
      if (!eligibility.eligible) {
        throw new ConflictError(eligibilityService.describe(eligibility.blockers)[0] ?? 'This guest is not eligible to drive.', 'GUEST_NOT_ELIGIBLE');
      }
    }

    // Only the handing-over side vouches for a licence; a guest's own tick would prove nothing.
    let licence: Partial<TripDoc> = {};
    if (licenceConfirmed && (hostSide || isAdmin)) {
      licence = await this.licenceCheck(booking.guestId, booking.period.end, userId);
    } else if (cfg.hostOnlyStart) {
      throw new ConflictError('Confirm the guest’s licence matches before starting the trip.', 'LICENCE_CONFIRMATION_REQUIRED');
    }
    if (cfg.pickupCodeRequired && !booking.pickupVerifiedAt) {
      throw new ConflictError('Enter the guest’s pickup code before starting the trip.', 'PICKUP_CODE_REQUIRED');
    }
    if (readings.odometerStart == null) {
      throw new ConflictError('Record the odometer reading before starting the trip.', 'ODOMETER_REQUIRED');
    }

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
      handover: { at: new Date(), ...readings },
      ...licence,
      ...(booking.pickupVerifiedAt ? { pickupVerified: true, pickupVerifiedAt: booking.pickupVerifiedAt } : {}),
    });

    await inspectionService.moveToTrip(bookingId, trip._id);
    await bookingService.markInProgress(bookingId);
    await bookingService.attachTrip(bookingId, trip._id);
    emit(EVENTS.TRIP_STARTED, trip._id, { tripId: trip._id, bookingId });
    return this.getDoc(trip._id);
  }

  async updateLocation(userId: string, tripId: string, lng: number, lat: number): Promise<void> {
    const trip = await this.getDoc(tripId);
    if (trip.guestId !== userId) throw new ForbiddenError('Only the guest streams trip location');
    await TripModel.updateOne(
      { _id: tripId },
      { liveLocation: { type: 'Point', coordinates: [lng, lat], updatedAt: new Date() } },
    );
  }

  /** Return + finalize. A host-side completion is final; a guest's waits for the host to confirm before deposit and payout. */
  async complete(
    userId: string,
    tripId: string,
    ret: { odometerEnd?: number; fuelEnd?: number; notes?: string },
  ): Promise<TripDoc> {
    const trip = await this.getDoc(tripId);
    const hostSide = await this.isHost(userId, trip.hostId, trip.vehicleId, 'trip:handover');
    if (trip.guestId !== userId && !hostSide) {
      throw new ForbiddenError('Not a participant of this trip');
    }
    if (trip.status !== 'active') throw new ConflictError('Trip is not active', 'INVALID_STATE');
    if (trip.pausedForIncident) {
      throw new ConflictError('Resolve the open incident before completing the trip.', 'INCIDENT_OPEN');
    }

    // Return photos are required to complete. They are the condition record the
    // deposit and any damage claim are judged against; letting a trip close
    // without them means a later dispute has no evidence either way. The guest
    // is prompted to take them on the trip screen before this button enables.
    const returnPhotos = (trip.photos ?? []).filter((p) => p.phase === 'post').length;
    const minReturnPhotos = (await platformConfigService.get()).inspection.minReturnPhotos;
    if (returnPhotos < minReturnPhotos) {
      throw new ConflictError(
        `Add at least ${minReturnPhotos} return photos before ending the trip (you have ${returnPhotos}).`,
        'RETURN_PHOTOS_REQUIRED',
      );
    }

    const distanceKm = this.distanceFor(trip, ret.odometerEnd);
    const now = new Date();
    // Mileage and fuel are billed from the host's confirmed readings, never a guest's own number.
    const overage = hostSide ? await this.chargeMileageOverage(trip, distanceKm) : null;

    await TripModel.updateOne(
      { _id: tripId },
      {
        status: 'completed',
        return: { at: now, ...ret },
        distanceKm,
        ...(overage ? { mileageOverage: overage } : {}),
        ...(hostSide ? { returnConfirmed: true, returnConfirmedAt: now, returnConfirmedBy: userId } : { returnConfirmed: false }),
      },
    );
    // Late return: billed once, on the way in, for the hours past the grace window.
    try {
      const booking = await bookingService.getDoc(trip.bookingId);
      const graceMinutes = (await platformConfigService.get()).tracking?.overdueGraceMinutes ?? 60;
      const lateMs = Date.now() - new Date(booking.period.end).getTime() - graceMinutes * 60_000;
      if (lateMs > 0) await incidentalsService.chargeLateReturn(trip.bookingId, Math.ceil(lateMs / 3_600_000));
    } catch (err) {
      logger.warn({ err, bookingId: trip.bookingId }, 'late return fee failed');
    }

    await bookingService.markCompleted(trip.bookingId);
    if (hostSide) await this.chargeFuel(trip, ret.fuelEnd);

    // Recall check happens now, not before the trip — a guest with the keys
    // already must never be stranded by a recall that published mid-rental.
    void recallHoldService.applyAfterTrip(trip.vehicleId).catch(() => undefined);

    // The deposit is not released here. The host gets an inspection window to
    // report damage first; the auto-release job frees it when that window
    // closes with no claim. Releasing on return would leave a host who finds a
    // scratch an hour later with nothing to settle against.

    emit(EVENTS.TRIP_COMPLETED, tripId, {
      tripId,
      bookingId: trip.bookingId,
      hostId: trip.hostId,
      awaitingConfirmation: !hostSide,
    });
    return this.getDoc(tripId);
  }

  /** The host side (or staff) confirms a guest-ended return, optionally correcting the readings; billing and payout follow. */
  async confirmReturn(
    principal: Principal,
    tripId: string,
    corrections: { odometerEnd?: number; fuelEnd?: number } = {},
  ): Promise<TripDoc> {
    const trip = await this.getDoc(tripId);
    if (!this.isAdmin(principal) && !(await this.isHost(principal.userId, trip.hostId, trip.vehicleId, 'trip:handover'))) {
      throw new ForbiddenError('Only the host confirms the return');
    }
    if (trip.status !== 'completed' || trip.returnConfirmed !== false) {
      throw new ConflictError('There is no return waiting for confirmation.', 'INVALID_STATE');
    }
    await this.finalizeReturn(trip, principal.userId, corrections);
    return this.getDoc(tripId);
  }

  /** Cron: auto-confirm guest-ended returns the host left alone past the window, unless a dispute is open. */
  async sweepUnconfirmedReturns(): Promise<number> {
    const hours = (await platformConfigService.get()).handover.returnConfirmHours;
    const cutoff = new Date(Date.now() - hours * 3_600_000);
    const waiting = await TripModel.find({ status: 'completed', returnConfirmed: false, 'return.at': { $lte: cutoff } }).lean<TripDoc[]>();
    let confirmed = 0;
    for (const trip of waiting) {
      try {
        if (await this.hasReturnDispute(trip)) continue;
        await this.finalizeReturn(trip, 'system', {});
        confirmed += 1;
      } catch (err) {
        logger.warn({ err, tripId: trip._id }, 'auto-confirm return failed');
      }
    }
    return confirmed;
  }

  /** A host report (damage, open claim, disputed charge or incident) means a human must decide, not the clock. */
  private async hasReturnDispute(trip: TripDoc): Promise<boolean> {
    if ((trip.damageReports ?? []).some((r) => r.byUserId !== trip.guestId)) return true;
    if ((trip.incidents ?? []).some((i) => i.status === 'open')) return true;
    if (await ClaimModel.exists({ bookingId: trip.bookingId, deletedAt: null, status: { $nin: ['settled', 'rejected', 'closed'] } })) return true;
    return !!(await BookingModel.exists({ _id: trip.bookingId, 'incidentals.status': 'disputed' }));
  }

  /** Bill mileage and fuel from the confirmed readings, mark the return confirmed and schedule the payout. */
  private async finalizeReturn(trip: TripDoc, by: string, corrections: { odometerEnd?: number; fuelEnd?: number }): Promise<void> {
    const odometerEnd = corrections.odometerEnd ?? trip.return?.odometerEnd;
    const fuelEnd = corrections.fuelEnd ?? trip.return?.fuelEnd;
    const distanceKm = this.distanceFor(trip, odometerEnd);
    const overage = await this.chargeMileageOverage(trip, distanceKm);
    const claimed = await TripModel.updateOne(
      { _id: trip._id, returnConfirmed: false },
      {
        $set: {
          returnConfirmed: true,
          returnConfirmedAt: new Date(),
          returnConfirmedBy: by,
          distanceKm,
          ...(odometerEnd != null ? { 'return.odometerEnd': odometerEnd } : {}),
          ...(fuelEnd != null ? { 'return.fuelEnd': fuelEnd } : {}),
          ...(overage ? { mileageOverage: overage } : {}),
        },
      },
    );
    if (!claimed.modifiedCount) return;
    await this.chargeFuel(trip, fuelEnd);
    await payoutService.scheduleForBooking(trip.bookingId).catch((err) => logger.error({ err, bookingId: trip.bookingId }, 'payout scheduling after return confirm failed'));
  }

  /** Odometers read miles on a US dashboard; mileage limits/fees are km, so the delta converts before billing. */
  private distanceFor(trip: TripDoc, odometerEnd?: number): number {
    return odometerEnd != null && trip.handover.odometerStart != null
      ? Math.max(0, milesToKm(odometerEnd - trip.handover.odometerStart))
      : trip.distanceKm;
  }

  /** Fuel is measured, so a shortfall charges itself; cleaning/smoking/tolls are host-reported. */
  private async chargeFuel(trip: TripDoc, fuelEnd?: number): Promise<void> {
    try {
      await incidentalsService.chargeFuelShortfall(trip.bookingId, trip.handover.fuelStart, fuelEnd);
    } catch (err) {
      logger.warn({ err, bookingId: trip.bookingId }, 'fuel shortfall charge failed');
    }
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
    // Real money: taken from the guest's card (or deposit), then paid to the host.
    await incidentalsService.collect(
      booking,
      amountCents,
      booking.priceBreakdown.currency,
      `overage_${trip._id}`,
      `Mileage overage: ${overKm} km over ${includedKm} km included`,
    );

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
    if (!(await this.isHost(userId, trip.hostId, trip.vehicleId, 'trip:handover'))) {
      throw new ForbiddenError('Host only');
    }
    const booking = await bookingService.getDoc(trip.bookingId);
    await TripModel.updateOne({ _id: tripId }, await this.licenceCheck(trip.guestId, booking.period.end, userId));
    return this.getDoc(tripId);
  }

  /** Condition photos, keyed by booking so pickup photos can be taken before the trip exists. */
  async addPhotos(userId: string, bookingId: string, phase: InspectionPhase, photos: PhotoInput[]): Promise<InspectionState> {
    const booking = await this.bookingForParticipant(userId, bookingId);
    await inspectionService.add(booking, userId, phase, photos);
    return inspectionService.state(booking, userId);
  }

  /** Window, count and photo state for both phases, for either party of the booking. */
  async inspection(userId: string, bookingId: string): Promise<InspectionState> {
    return inspectionService.state(await this.bookingForParticipant(userId, bookingId), userId);
  }

  private async bookingForParticipant(userId: string, bookingId: string) {
    const booking = await bookingService.getDoc(bookingId);
    if (booking.guestId !== userId && !(await this.isHost(userId, booking.hostId, booking.vehicleId, 'trip:handover'))) {
      throw new ForbiddenError('Not a participant');
    }
    return booking;
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
    if (!(await this.isHost(userId, trip.hostId, trip.vehicleId, 'trip:handover'))) {
      throw new ForbiddenError('Host only');
    }
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

  /**
   * Raise a structured emergency (accident / breakdown / medical / theft /
   * unsafe party). Pauses the trip: it cannot be completed — and therefore
   * cannot bill late/mileage/fuel — until the incident is resolved, so a real
   * emergency is never turned into a charge. Escalated to both parties (and ops)
   * via the event.
   */
  async raiseIncident(
    userId: string,
    tripId: string,
    type: 'accident' | 'breakdown' | 'medical' | 'theft' | 'unsafe',
    note?: string,
  ): Promise<TripDoc> {
    const trip = await this.getDoc(tripId);
    if (!(await this.isParticipant(userId, tripId))) throw new ForbiddenError('Not a participant');
    if (trip.status !== 'active') throw new ConflictError('Only an active trip can raise an incident', 'INVALID_STATE');
    await TripModel.updateOne(
      { _id: tripId },
      {
        pausedForIncident: true,
        $push: { incidents: { type, status: 'open', note, byUserId: userId, at: new Date() } },
      },
    );
    emit(EVENTS.TRIP_INCIDENT_RAISED, tripId, { tripId, bookingId: trip.bookingId, hostId: trip.hostId, guestId: trip.guestId, byUserId: userId, type });
    return this.getDoc(tripId);
  }

  /** Resolve the open incident(s) and un-pause — the trip can complete again. */
  async resolveIncident(userId: string, tripId: string, note?: string): Promise<TripDoc> {
    const trip = await this.getDoc(tripId);
    if (!(await this.isParticipant(userId, tripId))) throw new ForbiddenError('Not a participant');
    await TripModel.updateOne(
      { _id: tripId, 'incidents.status': 'open' },
      { $set: { 'incidents.$[open].status': 'resolved', 'incidents.$[open].resolvedAt': new Date(), pausedForIncident: false } },
      { arrayFilters: [{ 'open.status': 'open' }] },
    );
    emit(EVENTS.TRIP_INCIDENT_RESOLVED, tripId, { tripId, bookingId: trip.bookingId, byUserId: userId, note });
    return this.getDoc(tripId);
  }

  /** The host is vouching for a verified person, so there has to be one, with a licence good for the whole trip. */
  private async licenceCheck(guestId: string, tripEnd: Date, byUserId: string): Promise<Pick<TripDoc, 'licenseConfirmed' | 'licenseConfirmedAt' | 'licenseCheck'>> {
    const kyc = await KycModel.findOne({ userId: guestId }).lean<KycDoc>();
    if (kyc?.status !== 'approved') {
      throw new ConflictError('This guest has not completed identity verification.', 'GUEST_NOT_VERIFIED');
    }
    if (kyc.licenceExpiry && new Date(kyc.licenceExpiry).getTime() < new Date(tripEnd).getTime()) {
      throw new ConflictError('This guest’s licence expires before the trip ends.', 'LICENCE_EXPIRES_DURING_TRIP');
    }
    return {
      licenseConfirmed: true,
      licenseConfirmedAt: new Date(),
      licenseCheck: {
        by: byUserId,
        verifiedName: [kyc.verifiedFirstName, kyc.verifiedLastName].filter(Boolean).join(' ') || undefined,
        licenceExpiry: kyc.licenceExpiry,
      },
    };
  }

  private isAdmin(principal: Principal): boolean {
    return principal.permissions.includes('*') || principal.permissions.includes('booking:read:any');
  }

  /**
   * Host verifies the guest's pickup code — proof the guest is physically
   * present with the car. Recorded on the booking, so it works before the trip
   * exists; wrong tries are counted and lock the code (see bookingService).
   */
  async verifyPickupForBooking(principal: Principal, bookingId: string, code: string): Promise<{ pickupVerified: true }> {
    const booking = await bookingService.getDoc(bookingId);
    if (!this.isAdmin(principal) && !(await this.isHost(principal.userId, booking.hostId, booking.vehicleId, 'trip:handover'))) {
      throw new ForbiddenError('Only the host verifies pickup');
    }
    await bookingService.verifyPickupCode(bookingId, code, principal.userId);
    const trip = await TripModel.findOne({ bookingId }).lean<TripDoc>();
    if (trip) await TripModel.updateOne({ _id: trip._id }, { pickupVerified: true, pickupVerifiedAt: new Date() });
    return { pickupVerified: true };
  }

  /** Same check addressed by trip id, kept for existing clients. */
  async verifyPickup(principal: Principal, tripId: string, code: string): Promise<TripDoc> {
    const trip = await this.getDoc(tripId);
    await this.verifyPickupForBooking(principal, trip.bookingId, code);
    return this.getDoc(tripId);
  }

  private async getDoc(tripId: string): Promise<TripDoc> {
    const trip = await TripModel.findById(tripId).lean<TripDoc>();
    if (!trip) throw new NotFoundError('Trip');
    return trip;
  }

  /**
   * The owner, or a Captain standing in for them on this car with the right
   * ability. `ability` defaults to the loosest read — enough to open the trip
   * — since most call sites gate a stricter action on top of this afterward.
   */
  private async isHost(
    userId: string,
    hostId: string,
    vehicleId?: string,
    ability: CaptainAbility = 'trip:view',
  ): Promise<boolean> {
    const { hostService } = await import('../../hosts/application/host.service');
    const host = await hostService.getByUserId(userId);
    if (host && host._id === hostId) return true;

    const { hostStaffService } = await import('../../hosts/application/host-staff.service');
    const { allowed } = await hostStaffService.can(userId, ability, hostId, vehicleId);
    return allowed;
  }

  /** Host-side access to a trip (owner, or a captain who may view it). */
  async isHostSideOf(userId: string, trip: Pick<TripDoc, 'hostId' | 'vehicleId'>, ability: CaptainAbility = 'trip:view'): Promise<boolean> {
    return this.isHost(userId, trip.hostId, trip.vehicleId, ability);
  }

  /** Public participant check (used by the realtime gateway). */
  async isHostUser(userId: string, hostId: string): Promise<boolean> {
    return this.isHost(userId, hostId);
  }

  /** Is this user a participant (guest or host) of the trip's booking? */
  async isParticipant(userId: string, tripId: string): Promise<boolean> {
    const trip = await this.getDoc(tripId);
    return trip.guestId === userId || (await this.isHost(userId, trip.hostId, trip.vehicleId));
  }
}

export const tripService = new TripService();
