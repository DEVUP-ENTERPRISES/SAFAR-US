import { BookingModel, type BookingDoc } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { handoverService } from './handover.service';
import { routingProvider } from '../../maps/infrastructure/routing.provider';
import { tripService } from './trip.service';
import { hostService } from '../../hosts/application/host.service';
import { notificationService } from '../../notifications/application/notification.service';
import { NotFoundError, ForbiddenError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';
import { UserModel } from '../../users/infrastructure/user.model';
import { realtimeEmitter, RT } from '../../../realtime/emitter';

/**
 * The hour before a handover.
 *
 * Keyed on the BOOKING, not the trip. The trip record is only created when
 * someone taps "start trip" at the handover itself, so anything hung off the
 * trip is unreachable in exactly the window this exists for — the half hour a
 * guest spends asking "where are you?".
 *
 * That question gets asked repeatedly because the answer is only available by
 * pulling it, and the person who has it is driving. So everything here is push
 * or one tap:
 *
 *  - ON MY WAY is a single button. Position alone cannot carry it: a stationary
 *    car means "not left yet" or "stuck in traffic", which look identical on a
 *    map and feel completely different to someone waiting.
 *  - ETA SLIPS ANNOUNCE THEMSELVES, recomputed from the mover's own location
 *    stream, so the late party never touches their phone.
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
/** "About two minutes away": whichever comes first, the ETA or the distance. */
const NEAR_MINUTES = 3;
const NEAR_METRES = 800;

type Party = 'guest' | 'host';

export interface ApproachLeg {
  onWayAt?: Date;
  arrivedAt?: Date;
  etaAt?: Date;
}

/** Where the handover stands, as one word the screen can draw a progress line from. */
export type ApproachStage = 'confirmed' | 'on_way' | 'arriving' | 'arrived' | 'handed_over';

export interface ApproachDriver {
  name: string;
  avatarUrl?: string;
  /** Only to the guest, only while the car is coming and before the keys change hands. */
  phone?: string;
}

export interface ApproachState {
  guest: ApproachLeg;
  host: ApproachLeg;
  /** Last known positions, so a map opened late is not blank. */
  guestAt?: { lat: number; lng: number; at: Date } | null;
  hostAt?: { lat: number; lng: number; at: Date } | null;
  /** Where to find the car, for self-pickup. Null for delivery. */
  pickup?: { instructions?: string; spotPhotoUrl?: string; accessCode?: string } | null;
  /** True when the car is brought to the guest rather than collected. */
  delivery: boolean;
  stage: ApproachStage;
  /** Who is bringing the car, once someone on the host side has set off. */
  driver?: ApproachDriver | null;
  car?: { title: string; plate?: string; color?: string; photoUrl?: string } | null;
  destination?: { lat: number; lng: number; label?: string } | null;
}

function stageOf(b: BookingDoc): ApproachStage {
  if (b.tripId || b.status === 'in_progress' || b.status === 'completed') return 'handed_over';
  const leg = b.approach?.host;
  if (leg?.arrivedAt) return 'arrived';
  if (leg?.nearNotifiedAt) return 'arriving';
  if (leg?.onWayAt) return 'on_way';
  return 'confirmed';
}

/** Tells everyone watching this booking that the approach changed; they refetch their own view of it. */
function announce(bookingId: string): void {
  if (realtimeEmitter.isReady()) realtimeEmitter.toBooking(bookingId, RT.APPROACH_UPDATE, { bookingId });
}

type Leg = NonNullable<NonNullable<BookingDoc['approach']>['host']>;
/** Internal markers stay on the server. */
function publicLeg(leg: Leg | undefined): ApproachLeg {
  return { onWayAt: leg?.onWayAt, arrivedAt: leg?.arrivedAt, etaAt: leg?.etaAt };
}

/** Who to notify: the guest's user id, or the host document's owner (b.hostId is a host id, not a user id). */
async function counterpartOf(b: BookingDoc, party: Party): Promise<string | null> {
  if (party === 'host') return b.guestId;
  return (await hostService.getById(b.hostId).catch(() => null))?.userId ?? null;
}

/** Which side of the booking this user is on, or null when they are neither (owner or Captain who may run the handover). */
async function partyOf(b: BookingDoc, userId: string): Promise<Party | null> {
  if (b.guestId === userId) return 'guest';
  return (await tripService.isHostSideOf(userId, b, 'trip:handover')) ? 'host' : null;
}

function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dx = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const dy = (b.lat - a.lat) * 110_540;
  return Math.sqrt(dx * dx + dy * dy);
}

const guestLink = (bookingId: string) => `/bookings/${bookingId}`;
const hostLink = (bookingId: string) => `/host/trips/${bookingId}`;

export const approachService = {
  async state(bookingId: string, viewerId: string): Promise<ApproachState> {
    const b = await BookingModel.findById(bookingId).lean<BookingDoc>();
    if (!b) throw new NotFoundError('Booking not found');
    if (!(await partyOf(b, viewerId))) throw new ForbiddenError('Not your booking');

    const vehicle = await VehicleModel.findById(b.vehicleId)
      .select('pickup make model year specs.color registrationNumber photos')
      .lean<{ pickup?: ApproachState['pickup']; make?: string; model?: string; year?: number; specs?: { color?: string }; registrationNumber?: string; photos?: { url: string; isCover?: boolean }[] }>();

    // The access code is the one genuinely sensitive field: it opens a gate or
    // a lockbox. Only the guest gets it, and only once they are on their way —
    // a code handed over at booking time has been sitting in an inbox for a
    // week.
    const pickup = vehicle?.pickup ? { ...vehicle.pickup } : null;
    const isGuest = b.guestId === viewerId;
    if (pickup && (!isGuest || !b.approach?.guest?.onWayAt)) delete pickup.accessCode;

    const stage = stageOf(b);
    const driverId = b.approach?.host?.byUserId;
    let driver: ApproachDriver | null = null;
    if (driverId && stage !== 'handed_over') {
      const u = await UserModel.findById(driverId).select('firstName avatarUrl phone').lean<{ firstName?: string; avatarUrl?: string; phone?: string }>();
      if (u) driver = { name: u.firstName ?? 'Your driver', avatarUrl: u.avatarUrl, ...(isGuest && u.phone ? { phone: u.phone } : {}) };
    }
    const cover = vehicle?.photos?.find((p) => p.isCover) ?? vehicle?.photos?.[0];
    const car = vehicle
      ? {
          title: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' '),
          // The plate is how a guest spots their car at the kerb, so it shows once it is on its way.
          ...(stage !== 'confirmed' && vehicle.registrationNumber ? { plate: vehicle.registrationNumber.replace(/\s+/g, '') } : {}),
          ...(vehicle.specs?.color ? { color: vehicle.specs.color } : {}),
          ...(cover ? { photoUrl: cover.url } : {}),
        }
      : null;

    return {
      guest: publicLeg(b.approach?.guest),
      host: publicLeg(b.approach?.host),
      guestAt: b.approach?.guestAt ?? null,
      hostAt: b.approach?.hostAt ?? null,
      pickup,
      delivery: !!b.delivery?.mode,
      stage,
      driver,
      car,
      destination: await handoverService.destinationFor(bookingId).catch(() => null),
    };
  },

  /** One tap. The counterpart hears about it immediately. */
  async setOnWay(bookingId: string, userId: string): Promise<ApproachState> {
    const b = await BookingModel.findById(bookingId).lean<BookingDoc>();
    if (!b) throw new NotFoundError('Booking not found');
    const party = await partyOf(b, userId);
    if (!party) throw new ForbiddenError('Not your booking');

    // Idempotent: tapping twice must not send a second notification.
    if (b.approach?.[party]?.onWayAt) return this.state(bookingId, userId);

    await BookingModel.updateOne(
      { _id: bookingId },
      { $set: { [`approach.${party}.onWayAt`]: new Date(), [`approach.${party}.byUserId`]: userId } },
    );
    announce(bookingId);

    const notifyUserId = await counterpartOf(b, party);
    if (notifyUserId) await notificationService
      .send({
        userId: notifyUserId,
        priority: 'high',
        templateKey: 'trip.approach.on_way',
        title: party === 'host' ? 'Your host is on the way' : 'Your guest is on the way',
        body:
          party === 'host'
            ? 'They have set off with the car. You can follow them on the map.'
            : 'They are heading to the car now.',
        deepLink: party === 'host' ? guestLink(bookingId) : hostLink(bookingId),
        data: { bookingId, party },
      })
      .catch((err) => logger.warn(`on-way notice failed: ${(err as Error).message}`));

    return this.state(bookingId, userId);
  },

  /**
   * Called on every position update from a party who is on their way.
   *
   * Recomputes their ETA and tells the counterpart when it has slipped
   * materially. This runs off the location stream the mover's device is already
   * sending, so the late party never has to touch their phone — which is the
   * whole point, because they are driving.
   */
  async onPosition(bookingId: string, party: Party, pos: { lat: number; lng: number }): Promise<void> {
    const b = await BookingModel.findById(bookingId).lean<BookingDoc>();
    if (!b) return;

    // Remember where each party is, so a map opened late shows something
    // immediately instead of an empty grid until the next fix arrives.
    await BookingModel.updateOne(
      { _id: bookingId },
      { $set: { [`approach.${party}At`]: { lat: pos.lat, lng: pos.lng, at: new Date() } } },
    );

    const leg = b.approach?.[party];
    // Only track people who said they were coming. Position is not intent.
    if (!leg?.onWayAt || leg.arrivedAt) return;

    const destination = await handoverService.destinationFor(bookingId);
    if (!destination) return;

    // ── Arrival, by geofence rather than by remembering a button ──────
    if (metresBetween(pos, destination) <= ARRIVAL_RADIUS_METRES) {
      await BookingModel.updateOne(
        { _id: bookingId },
        { $set: { [`approach.${party}.arrivedAt`]: new Date() } },
      );
      announce(bookingId);
      const arrivedNotifyId = await counterpartOf(b, party);
      if (arrivedNotifyId) await notificationService
        .send({
          userId: arrivedNotifyId,
          priority: 'high',
          templateKey: 'trip.approach.arrived',
          title: party === 'host' ? 'Your host has arrived' : 'Your guest has arrived',
          body: party === 'host' ? 'The car is at the pickup point.' : 'They are at the pickup point.',
          deepLink: party === 'host' ? guestLink(bookingId) : hostLink(bookingId),
          data: { bookingId, party },
        })
        .catch(() => undefined);
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

    await BookingModel.updateOne({ _id: bookingId }, { $set: { [`approach.${party}.etaAt`]: etaAt } });
    announce(bookingId);

    // Almost there: once, the food-delivery "two minutes away" moment.
    const near = (etaAt.getTime() - Date.now()) / 60_000 <= NEAR_MINUTES || metresBetween(pos, destination) <= NEAR_METRES;
    if (near && !leg.nearNotifiedAt) {
      const claimed = await BookingModel.updateOne(
        { _id: bookingId, [`approach.${party}.nearNotifiedAt`]: { $exists: false } },
        { $set: { [`approach.${party}.nearNotifiedAt`]: new Date() } },
      );
      const nearNotifyId = claimed.modifiedCount ? await counterpartOf(b, party) : null;
      if (nearNotifyId) {
        const mins = Math.max(1, Math.round((etaAt.getTime() - Date.now()) / 60_000));
        await notificationService
          .send({
            userId: nearNotifyId,
            priority: 'high',
            templateKey: 'trip.approach.near',
            title: party === 'host' ? `Your car is about ${mins} min away` : `Your guest is about ${mins} min away`,
            body: party === 'host' ? 'Head out to meet it. Have your pickup code ready.' : 'They are almost at the pickup point.',
            deepLink: party === 'host' ? guestLink(bookingId) : hostLink(bookingId),
            data: { bookingId, party },
          })
          .catch(() => undefined);
      }
      announce(bookingId);
    }

    const told = leg.etaNotifiedAt ? new Date(leg.etaNotifiedAt) : null;

    // The first ETA is not news — "on my way" already said they were coming.
    if (!told) {
      await BookingModel.updateOne(
        { _id: bookingId },
        { $set: { [`approach.${party}.etaNotifiedAt`]: etaAt } },
      );
      return;
    }

    const slipMinutes = (etaAt.getTime() - told.getTime()) / 60_000;
    if (slipMinutes < SLIP_THRESHOLD_MINUTES) return;

    await BookingModel.updateOne(
      { _id: bookingId },
      { $set: { [`approach.${party}.etaNotifiedAt`]: etaAt } },
    );
    const slipNotifyId = await counterpartOf(b, party);
    if (slipNotifyId) await notificationService
      .send({
        userId: slipNotifyId,
        priority: 'high',
        templateKey: 'trip.approach.eta_slipped',
        title: party === 'host' ? 'Your host is running late' : 'Your guest is running late',
        body: `Now expected around ${etaAt.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        })} — about ${Math.round(slipMinutes)} minutes later than before.`,
        deepLink: party === 'host' ? guestLink(bookingId) : hostLink(bookingId),
        data: { bookingId, party, etaAt },
      })
      .catch(() => undefined);

    logger.info(`Approach ETA slipped ${Math.round(slipMinutes)}min for ${party} on booking ${bookingId}`);
  },
};
