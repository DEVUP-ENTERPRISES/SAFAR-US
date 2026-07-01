import { TripModel, type TripDoc } from '../infrastructure/trip.model';
import { bookingService } from '../../bookings/application/booking.service';
import { NotFoundError, ConflictError, ForbiddenError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';

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

    const distanceKm =
      ret.odometerEnd && trip.handover.odometerStart
        ? Math.max(0, ret.odometerEnd - trip.handover.odometerStart)
        : trip.distanceKm;

    await TripModel.updateOne(
      { _id: tripId },
      { status: 'completed', return: { at: new Date(), ...ret }, distanceKm },
    );
    await bookingService.markCompleted(trip.bookingId);
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
}

export const tripService = new TripService();
