import { TripModel, PrePhotoModel, type TripDoc, type TripPhoto } from '../infrastructure/trip.model';
import { bookingService } from '../../bookings/application/booking.service';
import type { BookingDoc } from '../../bookings/infrastructure/booking.model';
import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { haversineKm } from '../../risk/domain/risk-signals';
import { parseKey } from '../../../infrastructure/storage/storage.gateway';
import { ConflictError, ForbiddenError, ValidationError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';

export type InspectionPhase = 'pre' | 'post';

/** The shots that make a complete condition record; served to clients so the list lives in one place. */
export const INSPECTION_ANGLES = [
  { id: 'front', label: 'Front' },
  { id: 'front_left', label: 'Front left' },
  { id: 'driver_side', label: 'Driver side' },
  { id: 'rear_left', label: 'Rear left' },
  { id: 'rear', label: 'Rear' },
  { id: 'passenger_side', label: 'Passenger side' },
  { id: 'interior', label: 'Interior' },
  { id: 'dashboard', label: 'Dash & fuel' },
] as const;

const ANGLE_IDS: string[] = INSPECTION_ANGLES.map((a) => a.id);
const MINUTE_MS = 60_000;

/** What a client may send about a photo; `at`, `byUserId` and `source` are never taken from it. */
export interface PhotoInput {
  url: string;
  key: string;
  angle: string;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  capturedAtClient?: string;
  sha256?: string;
}

export interface PhaseState {
  opensAt: Date;
  closesAt: Date | null;
  open: boolean;
  /** Why it is shut: not open yet, already closed, or the trip has not started (post only). */
  reason: 'not_yet' | 'closed' | 'no_trip' | null;
  required: number;
  taken: number;
  max: number;
}

export interface InspectionState {
  bookingId: string;
  tripId?: string;
  code: string;
  vehicleLabel: string;
  plate?: string;
  role: 'guest' | 'host';
  requireLocation: boolean;
  angles: typeof INSPECTION_ANGLES;
  pre: PhaseState;
  post: PhaseState;
  photos: (TripPhoto & { role: 'guest' | 'host' })[];
}

/**
 * Condition-photo rules, all read from platform config: when each phase opens
 * and closes, how many photos it needs and allows, and where they may be taken.
 * Photos are append-only — this service deliberately has no update or delete.
 */
export class InspectionService {
  private async tripFor(bookingId: string): Promise<TripDoc | null> {
    return TripModel.findOne({ bookingId }).lean<TripDoc>();
  }

  private async allPhotos(bookingId: string, trip: TripDoc | null): Promise<TripPhoto[]> {
    if (trip) return trip.photos ?? [];
    return PrePhotoModel.find({ bookingId, movedToTripId: { $exists: false } }).sort({ at: 1 }).lean<TripPhoto[]>();
  }

  phaseState(
    phase: InspectionPhase,
    booking: BookingDoc,
    trip: TripDoc | null,
    cfg: Awaited<ReturnType<typeof platformConfigService.get>>['inspection'],
    photos: TripPhoto[],
    now: number,
  ): PhaseState {
    const taken = photos.filter((p) => p.phase === phase).length;
    const base = { taken, max: cfg.maxPhotosPerPhase, required: phase === 'pre' ? cfg.minPrePhotos : cfg.minReturnPhotos };

    if (phase === 'pre') {
      const opensAt = new Date(+new Date(booking.period.start) - cfg.preWindowMinutes * MINUTE_MS);
      // Before the trip starts a late guest still needs to shoot the car, so the window runs to the booking's end.
      const closesAt = trip ? new Date(+new Date(trip.handover.at) + cfg.preWindowMinutes * MINUTE_MS) : new Date(booking.period.end);
      const live = trip ? trip.status === 'active' : booking.status === 'paid';
      if (!live || now > +closesAt) return { ...base, opensAt, closesAt, open: false, reason: 'closed' };
      if (now < +opensAt) return { ...base, opensAt, closesAt, open: false, reason: 'not_yet' };
      return { ...base, opensAt, closesAt, open: true, reason: null };
    }

    const opensAt = new Date(+new Date(booking.period.end) - cfg.postWindowMinutes * MINUTE_MS);
    if (!trip) return { ...base, opensAt, closesAt: null, open: false, reason: 'no_trip' };
    if (trip.status !== 'active') return { ...base, opensAt, closesAt: null, open: false, reason: 'closed' };
    if (now < +opensAt) return { ...base, opensAt, closesAt: null, open: false, reason: 'not_yet' };
    return { ...base, opensAt, closesAt: null, open: true, reason: null };
  }

  async state(booking: BookingDoc, viewerId: string, now = Date.now()): Promise<InspectionState> {
    const [cfg, trip, vehicle] = await Promise.all([
      platformConfigService.get(),
      this.tripFor(booking._id),
      VehicleModel.findById(booking.vehicleId).lean<VehicleDoc>(),
    ]);
    const photos = await this.allPhotos(booking._id, trip);
    return {
      bookingId: booking._id,
      tripId: trip?._id,
      code: booking.code,
      vehicleLabel: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Vehicle',
      plate: vehicle?.registrationNumber,
      role: booking.guestId === viewerId ? 'guest' : 'host',
      requireLocation: cfg.inspection.requireLocation,
      angles: INSPECTION_ANGLES,
      pre: this.phaseState('pre', booking, trip, cfg.inspection, photos, now),
      post: this.phaseState('post', booking, trip, cfg.inspection, photos, now),
      photos: photos.map((p) => ({ ...p, role: p.byUserId === booking.guestId ? 'guest' : 'host' })),
    };
  }

  /** Every server-side rule for a batch of photos; the caller has already proven the user is a participant. */
  async add(booking: BookingDoc, userId: string, phase: InspectionPhase, inputs: PhotoInput[]): Promise<void> {
    const cfg = (await platformConfigService.get()).inspection;
    const trip = await this.tripFor(booking._id);
    const existing = await this.allPhotos(booking._id, trip);
    const state = this.phaseState(phase, booking, trip, cfg, existing, Date.now());

    if (!state.open) {
      if (state.reason === 'not_yet') {
        throw new ConflictError(`${phase === 'pre' ? 'Pickup' : 'Return'} photos open at ${state.opensAt.toISOString()}.`, 'PHOTO_WINDOW_NOT_OPEN');
      }
      if (state.reason === 'no_trip') throw new ConflictError('Return photos can be taken once the trip has started.', 'PHOTO_WINDOW_CLOSED');
      throw new ConflictError(`The ${phase === 'pre' ? 'pickup' : 'return'} photo window is closed.`, 'PHOTO_WINDOW_CLOSED');
    }
    if (state.taken + inputs.length > cfg.maxPhotosPerPhase) {
      throw new ConflictError(`At most ${cfg.maxPhotosPerPhase} ${phase === 'pre' ? 'pickup' : 'return'} photos are allowed.`, 'PHOTO_LIMIT');
    }

    const vehicle = await VehicleModel.findById(booking.vehicleId).lean<VehicleDoc>();
    const spot = booking.delivery?.lat != null && booking.delivery?.lng != null
      ? { lat: booking.delivery.lat, lng: booking.delivery.lng }
      : vehicle?.location?.coordinates ? { lat: vehicle.location.coordinates[1], lng: vehicle.location.coordinates[0] } : null;

    const seen = new Set<string>();
    const at = new Date();
    const records: TripPhoto[] = [];
    for (const p of inputs) {
      this.checkKey(p, userId, seen);
      if (!ANGLE_IDS.includes(p.angle)) throw new ValidationError('Unknown photo angle');
      const hasFix = this.validFix(p.lat, p.lng);
      if (cfg.requireLocation && !hasFix) throw new ConflictError('A location fix is required to take condition photos.', 'PHOTO_LOCATION_REQUIRED');
      if (hasFix && cfg.maxDistanceMeters > 0 && spot) {
        const meters = haversineKm(spot, { lat: p.lat!, lng: p.lng! }) * 1000;
        if (meters > cfg.maxDistanceMeters) {
          throw new ConflictError(`Photos must be taken within ${cfg.maxDistanceMeters} m of the car.`, 'PHOTO_TOO_FAR');
        }
      }
      records.push({
        url: p.url,
        key: p.key,
        phase,
        byUserId: userId,
        at,
        angle: p.angle,
        ...(hasFix ? { lat: p.lat, lng: p.lng, accuracyM: p.accuracyM } : {}),
        ...(p.capturedAtClient ? { capturedAtClient: new Date(p.capturedAtClient) } : {}),
        ...(p.sha256 ? { sha256: p.sha256 } : {}),
        source: 'camera',
      });
    }

    const keys = records.map((r) => r.key!);
    const reused =
      (await TripModel.exists({ 'photos.key': { $in: keys } })) || (await PrePhotoModel.exists({ key: { $in: keys } }));
    if (reused) throw new ConflictError('That photo was already submitted.', 'PHOTO_KEY_REUSED');

    if (trip) {
      await TripModel.updateOne({ _id: trip._id }, { $push: { photos: { $each: records } } });
      return;
    }
    await PrePhotoModel.insertMany(records.map((r) => ({ ...r, bookingId: booking._id })));
    // The trip may have started while this insert ran; carry the photos across so none is stranded.
    const started = await this.tripFor(booking._id);
    if (started) await this.moveToTrip(booking._id, started._id);
  }

  private validFix(lat?: number, lng?: number): boolean {
    return (
      Number.isFinite(lat) && Number.isFinite(lng) &&
      Math.abs(lat!) <= 90 && Math.abs(lng!) <= 180 &&
      !(lat === 0 && lng === 0)
    );
  }

  private checkKey(p: PhotoInput, userId: string, seen: Set<string>): void {
    const parsed = parseKey(p.key);
    if (!parsed || parsed.category !== 'trip_photo' || parsed.ownerId !== userId) {
      throw new ForbiddenError('That upload does not belong to you');
    }
    if (!/\.jpe?g$/i.test(p.key)) throw new ValidationError('Condition photos must be JPEG images');
    if (!p.url.includes(p.key) && !p.url.includes(encodeURIComponent(p.key))) {
      throw new ValidationError('Photo URL does not match its upload');
    }
    if (seen.has(p.key)) throw new ConflictError('The same photo was sent twice.', 'PHOTO_KEY_REUSED');
    seen.add(p.key);
  }

  /** Pickup photos taken by the handing-over side: anyone but the guest. */
  hostPrePhotoCount(photos: TripPhoto[], guestId: string): number {
    return photos.filter((p) => p.phase === 'pre' && p.byUserId !== guestId).length;
  }

  /** The host-side pickup inspection as the host UI shows it, from photos already loaded. */
  hostPreState(
    booking: BookingDoc,
    trip: TripDoc | null,
    photos: TripPhoto[],
    cfg: Awaited<ReturnType<typeof platformConfigService.get>>['inspection'],
    now = Date.now(),
  ): { taken: number; required: number; open: boolean; opensAt: Date; closesAt: Date | null } {
    const s = this.phaseState('pre', booking, trip, cfg, photos, now);
    return { taken: this.hostPrePhotoCount(photos, booking.guestId), required: cfg.minPrePhotos, open: s.open, opensAt: s.opensAt, closesAt: s.closesAt };
  }

  /**
   * Start gate: the host side must have photographed the car. Skipped only once
   * the pickup window has closed (the guest could never be met inside it), and
   * for admins acting for a host.
   */
  async assertPrePhotosBeforeStart(booking: BookingDoc, isAdmin = false): Promise<void> {
    const all = await platformConfigService.get();
    const cfg = all.inspection;
    if (isAdmin || !all.handover.hostInspectionRequired || cfg.minPrePhotos <= 0) return;
    const s = this.hostPreState(booking, null, await this.allPhotos(booking._id, null), cfg);
    if (s.closesAt && Date.now() > +s.closesAt) return;
    if (s.taken < cfg.minPrePhotos) {
      throw new ConflictError(
        `Inspect the car and take at least ${cfg.minPrePhotos} live photos before the pickup code and trip start (you have ${s.taken}).`,
        'HOST_INSPECTION_REQUIRED',
      );
    }
  }

  /** One baseline rule for charges and damage claims: the host side photographed the car at pickup. */
  async assertBaseline(booking: { _id: string; guestId: string }, what: string): Promise<void> {
    const all = await platformConfigService.get();
    const min = all.inspection.minPrePhotos;
    if (!all.handover.baselineRequiredForCharges || min <= 0) return;
    const trip = await this.tripFor(booking._id);
    const taken = this.hostPrePhotoCount(await this.allPhotos(booking._id, trip), booking.guestId);
    if (taken < min) {
      throw new ConflictError(
        `The car was not inspected at pickup (${taken} of ${min} host photos), so ${what} cannot be charged to this guest.`,
        'BASELINE_REQUIRED',
      );
    }
  }

  /** Mark staged photos as carried onto the trip (they are kept, never deleted) and copy any not yet there. */
  async moveToTrip(bookingId: string, tripId: string): Promise<void> {
    const staged = await PrePhotoModel.find({ bookingId, movedToTripId: { $exists: false } }).lean<TripPhoto[]>();
    if (!staged.length) return;
    const claimed = await PrePhotoModel.updateMany({ bookingId, movedToTripId: { $exists: false } }, { movedToTripId: tripId });
    if (!claimed.modifiedCount) return;
    const have = new Set((await TripModel.findById(tripId).lean<TripDoc>())?.photos?.map((p) => p.key));
    const fresh = staged.filter((p) => !have.has(p.key));
    if (fresh.length) await TripModel.updateOne({ _id: tripId }, { $push: { photos: { $each: fresh } } });
  }

  /** Once per trip: tell both sides the return-photo window is open. Marker is set first so a crash never repeats it. */
  async sweepReturnWindow(): Promise<number> {
    const cfg = (await platformConfigService.get()).inspection;
    const trips = await TripModel.find({ status: 'active', returnWindowNotifiedAt: { $exists: false } }).lean<TripDoc[]>();
    let sent = 0;
    for (const t of trips) {
      const booking = await bookingService.getDoc(t.bookingId).catch(() => null);
      if (!booking || Date.now() < +new Date(booking.period.end) - cfg.postWindowMinutes * MINUTE_MS) continue;
      const claimed = await TripModel.updateOne({ _id: t._id, returnWindowNotifiedAt: { $exists: false } }, { returnWindowNotifiedAt: new Date() });
      if (!claimed.modifiedCount) continue;
      emit(EVENTS.TRIP_RETURN_WINDOW_OPEN, t._id, { tripId: t._id, bookingId: t.bookingId, guestId: t.guestId, hostId: t.hostId });
      sent++;
    }
    return sent;
  }
}

export const inspectionService = new InspectionService();
