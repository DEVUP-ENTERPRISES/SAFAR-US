import { routingProvider, type LatLng, type Route } from '../../maps/infrastructure/routing.provider';
import { TripModel } from '../infrastructure/trip.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';

/**
 * The handover countdown — the same clock, shown to both sides.
 *
 * Every competitor treats pickup as a phone call and a guess: the guest does
 * not know whether the host has left, and the host does not know whether the
 * guest is ten minutes away or an hour. So both parties pad, both wait, and the
 * first fifteen minutes of a rental are spent in a car park.
 *
 * Here both sides read the same computed times, from the same route:
 *   - the guest sees live navigation to the car and their own ETA
 *   - the host sees when to LEAVE, worked back from that ETA
 *
 * Deriving the host's departure from the guest's actual position (rather than
 * from the booking's nominal start time) is the whole trick. If the guest is
 * stuck in traffic, the host's "leave by" slides with them automatically, and
 * nobody stands around.
 */

export interface HandoverStatus {
  tripId: string;
  /** Where the handover happens. */
  destination: LatLng & { label?: string };
  /** Present when we know where the asking party is. */
  route?: Route;
  /** Guest's projected arrival, if their position is known. */
  guestEtaAt?: Date;
  /** When the host should set off to arrive as the guest does. */
  hostLeaveBy?: Date;
  /** Scheduled start, for reference. */
  scheduledAt?: Date;
  /** True once the host should already be moving. */
  hostShouldLeaveNow: boolean;
  /** Nothing is known about anyone's position yet. */
  awaitingLocation: boolean;
}

/** Padding so "leave now" means leave now, not "you are already late". */
const HOST_PREP_BUFFER_SECONDS = 5 * 60;

export const handoverService = {
  /**
   * Where the car changes hands: the delivery address when the guest chose
   * delivery, otherwise the vehicle's own location.
   */
  async destinationFor(bookingId: string): Promise<(LatLng & { label?: string }) | null> {
    const booking = await BookingModel.findById(bookingId).lean<{
      vehicleId?: string;
      delivery?: { lat?: number; lng?: number; address?: string; mode?: string };
    }>();
    if (!booking) return null;

    if (booking.delivery?.lat != null && booking.delivery?.lng != null) {
      return { lat: booking.delivery.lat, lng: booking.delivery.lng, label: booking.delivery.address };
    }

    const vehicle = await VehicleModel.findById(booking.vehicleId).lean<{
      location?: { coordinates?: [number, number] };
    }>();
    const c = vehicle?.location?.coordinates;
    if (!c || c.length !== 2) return null;
    return { lat: c[1], lng: c[0], label: 'Pickup location' };
  },

  /**
   * @param viewer  whose screen this is — decides which position is routed from
   * @param from    the viewer's current position, when their device shared it
   */
  async status(
    tripId: string,
    viewer: 'guest' | 'host',
    from?: LatLng,
  ): Promise<HandoverStatus> {
    const trip = await TripModel.findById(tripId).lean();
    if (!trip) throw new Error('Trip not found');

    const destination = await this.destinationFor(trip.bookingId);
    if (!destination) throw new Error('No handover location on this booking');

    const booking = await BookingModel.findById(trip.bookingId).lean<{ period?: { start?: Date } }>();
    const scheduledAt = booking?.period?.start ? new Date(booking.period.start) : undefined;

    // The guest's last known position: their own if they are the viewer,
    // otherwise whatever the trip has been receiving from their device.
    const guestPos: LatLng | undefined =
      viewer === 'guest'
        ? from
        : trip.liveLocation?.coordinates
          ? { lat: trip.liveLocation.coordinates[1], lng: trip.liveLocation.coordinates[0] }
          : undefined;

    const origin = viewer === 'guest' ? from : from ?? undefined;
    const route = origin ? await routingProvider.route(origin, destination) : undefined;

    // The guest's ETA drives both clocks.
    let guestEtaAt: Date | undefined;
    if (viewer === 'guest' && route) {
      guestEtaAt = new Date(Date.now() + route.durationInTrafficSeconds * 1000);
    } else if (guestPos) {
      const guestRoute = await routingProvider.route(guestPos, destination);
      guestEtaAt = new Date(Date.now() + guestRoute.durationInTrafficSeconds * 1000);
    }

    // Fall back to the booked start when the guest has shared nothing — better
    // than telling the host nothing at all.
    const targetArrival = guestEtaAt ?? scheduledAt;

    let hostLeaveBy: Date | undefined;
    if (targetArrival && viewer === 'host' && route) {
      hostLeaveBy = new Date(
        targetArrival.getTime() - (route.durationInTrafficSeconds + HOST_PREP_BUFFER_SECONDS) * 1000,
      );
    }

    return {
      tripId,
      destination,
      route,
      guestEtaAt,
      hostLeaveBy,
      scheduledAt,
      hostShouldLeaveNow: !!hostLeaveBy && hostLeaveBy.getTime() <= Date.now(),
      awaitingLocation: !origin && !guestPos,
    };
  },

  /** Record the guest's position so the host's countdown can track it. */
  async updateLocation(tripId: string, pos: LatLng) {
    await TripModel.updateOne(
      { _id: tripId },
      { $set: { liveLocation: { type: 'Point', coordinates: [pos.lng, pos.lat], updatedAt: new Date() } } },
    );
  },
};
