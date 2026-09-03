import { TripModel, type TripDoc } from '../infrastructure/trip.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { handoverService } from './handover.service';
import { routingProvider } from '../../maps/infrastructure/routing.provider';
import { notificationService } from '../../notifications/application/notification.service';
import { NotFoundError, ForbiddenError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * The hour before a handover.
 *
 * This is the hour people currently spend asking "where are you?". The reason
 * that question gets asked five times is that the answer is only available by
 * pulling it — and the person who has it is driving, so they cannot answer.
 *
 * Everything here is therefore push or one tap:
 *
 *  - ON MY WAY is a single button. The other party is notified, and the map
 *    goes live. Position alone is not enough: a stationary car could mean "not
 *    left yet" or "stuck in traffic", and those feel completely different to
 *    someone waiting.
 *  - ETA SLIPS ANNOUNCE THEMSELVES. Recomputed from the mover's own location
 *    stream — which is already arriving every fifteen seconds — and the
 *    counterpart is told when it moves materially later. Nobody has to type
 *    while driving.
 *  - ARRIVED fires from a geofence, not from remembering to press something.
 *
 * The slip threshold is deliberately not small. Telling someone their host is
 * two minutes later than a minute ago is noise, and noise trains people to
 * ignore the alert that matters.
 */

/** A slip smaller than this is traffic noise, not news. */
const SLIP_THRESHOLD_MINUTES = 8;
/** Within this radius of the handover point, you have arrived. */
const ARRIVAL_RADIUS_METRES = 120;

type Party = 'guest' | 'host';

export interface ApproachState {
  guest: { onWayAt?: Date; arrivedAt?: Date; etaAt?: Date };
  host: { onWayAt?: Date; arrivedAt?: Date; etaAt?: Date };
  /** Where to find the car, for self-pickup. Null for delivery. */
  pickup?: { instructions?: string; spotPhotoUrl?: string; accessCode?: string } | null;
}

async function counterpartOf(trip: TripDoc, party: Party): Promise<string> {
  return party === 'guest' ? trip.hostId : trip.guestId;
}

function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dx = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const dy = (b.lat - a.lat) * 110_540;
  return Math.sqrt(dx * dx + dy * dy);
}

export const approachService = {
  async state(tripId: string, viewerId: string): Promise<ApproachState> {
    const trip = await TripModel.findById(tripId).lean<TripDoc>();
    if (!trip) throw new NotFoundError('Trip not found');
    if (trip.guestId !== viewerId && trip.hostId !== viewerId) throw new ForbiddenError('Not your trip');

    const vehicle = await VehicleModel.findById(trip.vehicleId)
      .select('pickup')
      .lean<{ pickup?: ApproachState['pickup'] }>();

    // The access code is the one field that is genuinely sensitive: it opens a
    // gate or a lockbox. Only the guest gets it, and only once they are on
    // their way — a code handed over at booking time is a code that has been
    // sitting in someone's inbox for a week.
    const pickup = vehicle?.pickup ? { ...vehicle.pickup } : null;
    const isGuest = trip.guestId === viewerId;
    if (pickup && (!isGuest || !trip.approach?.guest?.onWayAt)) delete pickup.accessCode;

    return {
      guest: trip.approach?.guest ?? {},
      host: trip.approach?.host ?? {},
      pickup,
    };
  },

  /** One tap. The counterpart hears about it immediately. */
  async setOnWay(tripId: string, userId: string): Promise<ApproachState> {
    const trip = await TripModel.findById(tripId).lean<TripDoc>();
    if (!trip) throw new NotFoundError('Trip not found');
    const party: Party = trip.hostId === userId ? 'host' : 'guest';
    if (trip.guestId !== userId && trip.hostId !== userId) throw new ForbiddenError('Not your trip');

    // Idempotent: tapping twice should not send a second notification.
    if (trip.approach?.[party]?.onWayAt) return this.state(tripId, userId);

    await TripModel.updateOne({ _id: tripId }, { $set: { [`approach.${party}.onWayAt`]: new Date() } });

    await notificationService.send({
      userId: await counterpartOf(trip, party),
      priority: 'high',
      templateKey: 'trip.approach.on_way',
      title: party === 'host' ? 'Your host is on the way' : 'Your guest is on the way',
      body:
        party === 'host'
          ? 'They have set off with the car. You can follow them on the map.'
          : 'They are heading to the car now.',
      deepLink: party === 'host' ? `/trips/${tripId}` : `/host/trips/${trip.bookingId}`,
      data: { tripId, party },
    }).catch((err) => logger.warn(`on-way notice failed: ${(err as Error).message}`));

    return this.state(tripId, userId);
  },

  /**
   * Called on every position update from a party who is on their way.
   *
   * Recomputes their ETA and tells the counterpart when it has slipped
   * materially. This runs off the location stream the mover's device is already
   * sending, so the late party never has to touch their phone — which is the
   * whole point, because they are driving.
   */
  async onPosition(tripId: string, party: Party, pos: { lat: number; lng: number }): Promise<void> {
    const trip = await TripModel.findById(tripId).lean<TripDoc>();
    if (!trip) return;

    const leg = trip.approach?.[party];
    // Only track people who said they were coming. Position alone is not intent.
    if (!leg?.onWayAt || leg.arrivedAt) return;

    const destination = await handoverService.destinationFor(trip.bookingId);
    if (!destination) return;

    // ── Arrival, by geofence rather than by remembering to press a button ──
    if (metresBetween(pos, destination) <= ARRIVAL_RADIUS_METRES) {
      await TripModel.updateOne({ _id: tripId }, { $set: { [`approach.${party}.arrivedAt`]: new Date() } });
      await notificationService.send({
        userId: await counterpartOf(trip, party),
        priority: 'high',
        templateKey: 'trip.approach.arrived',
        title: party === 'host' ? 'Your host has arrived' : 'Your guest has arrived',
        body: party === 'host' ? 'The car is at the pickup point.' : 'They are at the pickup point.',
        deepLink: party === 'host' ? `/trips/${tripId}` : `/host/trips/${trip.bookingId}`,
        data: { tripId, party },
      }).catch(() => undefined);
      return;
    }

    // ── ETA, and whether it slipped enough to be worth saying ──────────
    let etaAt: Date;
    try {
      const route = await routingProvider.route(pos, destination);
      etaAt = new Date(Date.now() + route.durationInTrafficSeconds * 1000);
    } catch {
      return; // A routing blip should not produce a wrong ETA.
    }

    await TripModel.updateOne({ _id: tripId }, { $set: { [`approach.${party}.etaAt`]: etaAt } });

    const told = leg.etaNotifiedAt ? new Date(leg.etaNotifiedAt) : null;
    const slipMinutes = told ? (etaAt.getTime() - told.getTime()) / 60_000 : 0;

    // First ETA is not news — "on my way" already said they are coming.
    if (!told) {
      await TripModel.updateOne({ _id: tripId }, { $set: { [`approach.${party}.etaNotifiedAt`]: etaAt } });
      return;
    }
    if (slipMinutes < SLIP_THRESHOLD_MINUTES) return;

    await TripModel.updateOne({ _id: tripId }, { $set: { [`approach.${party}.etaNotifiedAt`]: etaAt } });
    await notificationService.send({
      userId: await counterpartOf(trip, party),
      priority: 'high',
      templateKey: 'trip.approach.eta_slipped',
      title: party === 'host' ? 'Your host is running late' : 'Your guest is running late',
      body: `Now expected around ${etaAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} — about ${Math.round(slipMinutes)} minutes later than before.`,
      deepLink: party === 'host' ? `/trips/${tripId}` : `/host/trips/${trip.bookingId}`,
      data: { tripId, party, etaAt },
    }).catch(() => undefined);

    logger.info(`Approach ETA slipped ${Math.round(slipMinutes)}min for ${party} on trip ${tripId}`);
  },
};
