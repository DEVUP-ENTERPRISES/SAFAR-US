import { KycModel, type KycDoc } from '../../kyc/infrastructure/kyc.model';
import { BookingModel, type BookingDoc } from '../infrastructure/booking.model';
import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { TripModel, PrePhotoModel, type TripDoc, type TripPhoto } from '../../trips/infrastructure/trip.model';
import { inspectionService } from '../../trips/application/inspection.service';
import { PayoutModel, type PayoutDoc } from '../../payouts/infrastructure/payout.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { hostService } from '../../hosts/application/host.service';
import { HostStaffModel, type HostStaffDoc } from '../../hosts/infrastructure/host-staff.model';
import { TERMINAL_STATUSES } from '../domain/booking-status';
import { ForbiddenError } from '../../../core/errors/app-error';
import { milesToKm } from '../../../shared/utils/distance';

/** The fleet this caller sees trips for, and which cars they're limited to. */
interface CallerScope {
  hostId: string;
  /** undefined = every car in the fleet; a Captain may be limited to some. */
  vehicleIds?: string[];
}

export interface TimelineStep {
  key: string;
  label: string;
  state: 'done' | 'current' | 'todo' | 'locked';
  detail?: string;
}

/** Where the handover stands, so the host UI can show what to do next without guessing. */
export interface HostHandover {
  inspection: { taken: number; required: number; open: boolean; opensAt: string | null };
  guestVerified: boolean;
  licenceValidThroughTrip: boolean | null;
  licenceConfirmed: boolean;
  pickupVerified: boolean;
  codeLocked: boolean;
  requirements: { hostInspectionRequired: boolean; pickupCodeRequired: boolean; hostOnlyStart: boolean };
}

/** Everything a host trip card / detail screen needs, in one shot. */
export interface HostTrip {
  bookingId: string;
  code: string;
  tripId?: string;
  status: string;
  period: { start: Date; end: Date };
  earnings: number;
  currency: string;
  /** The full financial breakdown behind this trip — powers the receipt. */
  receipt: {
    issuedAt: Date;
    days: number;
    base: number;
    cleaningFee: number;
    delivery: number;
    protection: number;
    protectionPlan?: string;
    discount: number;
    subtotal: number;
    commission: number;
    tax: number;
    hostEarnings: number;
    total: number;
  };
  /** Each paid extension and what it added to the host's earnings. */
  extensions: { _id: string; days: number; prevEnd: Date; newEnd: Date; hostEarnings: number; createdAt: Date }[];
  pickupAddress?: string;
  isDelivery: boolean;
  /**
   * Where and when to hand the car over when the guest asked for delivery.
   * For an airport pickup the flight is the important part — it is what tells
   * the host when to actually be there.
   */
  delivery?: {
    mode: string;
    address: string;
    flightNumber?: string;
    terminal?: string;
    arrivesAt?: Date;
  };

  vehicle: {
    _id: string;
    make: string;
    model: string;
    year: number;
    plate?: string;
    photoUrl?: string;
  };

  guest: {
    _id: string;
    name: string;
    avatarUrl?: string;
    joinedAt: Date;
    tripCount: number;
    /** What identity verification established, for the host to compare with the physical licence. */
    verification: {
      verified: boolean;
      verifiedName?: string;
      age?: number;
      licenceExpiry?: Date;
      verifiedAt?: Date;
      /** False when the licence lapses before this trip ends; null when the expiry is unknown. */
      licenceValidThroughTrip: boolean | null;
    };
  };

  mileage: {
    /** 0 = unlimited. */
    includedKm: number;
    overageFeePerKm: number;
    drivenKm?: number;
  };

  /** Check-in state — drives the "Start check-in" vs "End trip" CTA. */
  licenseConfirmed: boolean;
  /** The host has checked the guest's pickup code. Hides the check once done. */
  pickupVerified: boolean;
  /** The guest ended the trip and the host has not yet confirmed the car came back. */
  returnAwaitingConfirmation?: boolean;
  photoCount: number;
  /** The handover and return steps in order, with the state of each. */
  timeline: TimelineStep[];
  handover: HostHandover;
}

/**
 * Read model for the host's Trips screens. Bookings, vehicles, guests and trips
 * live in separate collections; this joins them once so the UI never N+1s.
 */
export class HostTripsService {
  /** Upcoming + active trips ("BOOKED"). */
  /**
   * Upcoming and active trips ("BOOKED").
   *
   * `pending_approval` belongs here and was missing: a request-to-book booking
   * sits in exactly that state waiting for the host to answer, so leaving it
   * out meant the host never saw the request they were being asked to approve —
   * it simply expired after the approval window while they were told nothing
   * was there. `pending_verification` is included for the same reason: the host
   * should see a trip that is coming, and why it is still being held.
   */
  async booked(userId: string): Promise<HostTrip[]> {
    return this.query(
      userId,
      ['pending_approval', 'pending_verification', 'confirmed', 'paid', 'in_progress'],
      { 'period.start': 1 },
    );
  }

  /**
   * Finished trips ("HISTORY").
   *
   * The old filter looked for a status called 'cancelled', which does not exist
   * — cancellations are recorded by who caused them (cancelled_guest /
   * cancelled_host / cancelled_system), so no cancelled trip ever appeared in a
   * host's history. Declined and expired requests belong here too: they are
   * over, and a host reviewing their record should see them.
   */
  async history(userId: string): Promise<HostTrip[]> {
    return this.query(userId, ['completed', ...TERMINAL_STATUSES], { 'period.end': -1 });
  }

  async one(userId: string, bookingId: string): Promise<HostTrip | null> {
    const scope = await this.scopeFor(userId);
    const booking = await BookingModel.findOne({ _id: bookingId, hostId: scope.hostId }).lean<BookingDoc>();
    if (!booking) return null;
    if (scope.vehicleIds && !scope.vehicleIds.includes(booking.vehicleId)) return null;
    const [trip] = await this.enrich([booking]);
    return trip ?? null;
  }

  private async query(
    userId: string,
    statuses: string[],
    sort: Record<string, 1 | -1>,
  ): Promise<HostTrip[]> {
    const scope = await this.scopeFor(userId);
    const bookings = await BookingModel.find({
      hostId: scope.hostId,
      status: { $in: statuses },
      ...(scope.vehicleIds ? { vehicleId: { $in: scope.vehicleIds } } : {}),
    })
      .sort(sort)
      .limit(100)
      .lean<BookingDoc[]>();
    return this.enrich(bookings);
  }

  /**
   * The owner sees their whole fleet; a Captain sees only the host they were
   * invited by, and only the cars assigned to them (empty list = the whole
   * fleet, present and future — same rule as the assignment picker).
   */
  private async scopeFor(userId: string): Promise<CallerScope> {
    const host = await hostService.getByUserId(userId);
    if (host) return { hostId: host._id };

    const staff = await HostStaffModel.findOne({ userId, status: 'active' }).lean<HostStaffDoc>();
    if (!staff) throw new ForbiddenError('You do not have a host account');
    return { hostId: staff.hostId, vehicleIds: staff.vehicleIds.length ? staff.vehicleIds : undefined };
  }

  private verificationFor(k: KycDoc | undefined, tripEnd: Date): HostTrip['guest']['verification'] {
    if (!k) return { verified: false, licenceValidThroughTrip: null };
    const name = [k.verifiedFirstName, k.verifiedLastName].filter(Boolean).join(' ');
    const age = k.verifiedDob ? Math.floor((Date.now() - new Date(k.verifiedDob).getTime()) / (365.25 * 86_400_000)) : undefined;
    return {
      verified: true,
      verifiedName: name || undefined,
      age,
      licenceExpiry: k.licenceExpiry,
      verifiedAt: k.decisionAt,
      licenceValidThroughTrip: k.licenceExpiry ? new Date(k.licenceExpiry).getTime() >= new Date(tripEnd).getTime() : null,
    };
  }

  /** Each step's state from real data; toggled-off steps read as done ("Not required"). */
  private timelineFor(
    b: BookingDoc,
    t: TripDoc | null,
    photos: TripPhoto[],
    verification: HostTrip['guest']['verification'],
    cfg: Awaited<ReturnType<typeof platformConfigService.get>>,
    payout?: PayoutDoc,
  ): { timeline: TimelineStep[]; handover: HostHandover } {
    const req = cfg.handover;
    const pre = inspectionService.hostPreState(b, t, photos, cfg.inspection);
    const started = !!t;
    const completed = t?.status === 'completed' || b.status === 'completed';
    const inspectRequired = req.hostInspectionRequired && pre.required > 0;
    const licenceConfirmed = !!t?.licenseConfirmed;
    const pickupVerified = !!b.pickupVerifiedAt || !!t?.pickupVerified;
    const codeLocked = !pickupVerified && req.maxCodeAttempts > 0 && (b.pickupCodeAttempts ?? 0) >= req.maxCodeAttempts;
    const returned = photos.filter((p) => p.phase === 'post').length;
    const returnRequired = cfg.inspection.minReturnPhotos;
    const notRequired = 'Not required';

    const drafts: { key: string; label: string; done: boolean; detail?: string; post?: boolean }[] = [
      { key: 'inspect', label: 'Inspect the car', done: !inspectRequired || started || pre.taken >= pre.required, detail: inspectRequired ? `${pre.taken} of ${pre.required} photos` : notRequired },
      {
        key: 'verify_guest', label: 'Verify the guest', done: !req.hostOnlyStart || started || licenceConfirmed,
        detail: !req.hostOnlyStart ? notRequired : !verification.verified ? 'Guest identity not verified' : verification.licenceValidThroughTrip === false ? 'Licence expires during the trip' : started || licenceConfirmed ? 'Licence confirmed' : 'Check the licence in person',
      },
      {
        key: 'pickup_code', label: 'Guest’s pickup code', done: !req.pickupCodeRequired || pickupVerified || started,
        detail: !req.pickupCodeRequired ? notRequired : codeLocked ? 'Locked — guest must generate a new code' : pickupVerified || started ? 'Verified' : 'Ask the guest for their code',
      },
      { key: 'start', label: 'Start the trip', done: started, detail: started ? 'Trip started' : undefined },
      { key: 'on_trip', label: 'On the trip', done: completed, detail: completed ? 'Trip finished' : started ? 'In progress' : undefined, post: true },
      { key: 'return_photos', label: 'Return photos', done: completed || returnRequired <= 0 || returned >= returnRequired, detail: returnRequired > 0 ? `${returned} of ${returnRequired} photos` : notRequired, post: true },
      { key: 'return', label: 'Car returned & inspected', done: completed && t?.returnConfirmed !== false, detail: completed ? (t?.returnConfirmed === false ? 'Guest ended the trip — confirm the return' : 'Returned') : undefined, post: true },
      { key: 'payout', label: 'Payout', done: payout?.status === 'paid', detail: payout ? `Payout ${payout.status}` : undefined, post: true },
    ];

    let currentSeen = false;
    const timeline = drafts.map((d): TimelineStep => {
      const { done, post, ...rest } = d;
      if (done) return { ...rest, state: 'done' };
      if (!currentSeen) {
        currentSeen = true;
        return { ...rest, state: 'current' };
      }
      // Before the trip starts a step waits on the one before it; after, the rest are simply ahead.
      return { ...rest, state: started && post ? 'todo' : 'locked' };
    });

    return {
      timeline,
      handover: {
        inspection: { taken: pre.taken, required: pre.required, open: pre.open, opensAt: pre.opensAt.toISOString() },
        guestVerified: verification.verified,
        licenceValidThroughTrip: verification.licenceValidThroughTrip,
        licenceConfirmed,
        pickupVerified,
        codeLocked,
        requirements: { hostInspectionRequired: req.hostInspectionRequired, pickupCodeRequired: req.pickupCodeRequired, hostOnlyStart: req.hostOnlyStart },
      },
    };
  }

  /** One batched join — never a query per row. */
  private async enrich(bookings: BookingDoc[]): Promise<HostTrip[]> {
    if (bookings.length === 0) return [];

    const vehicleIds = [...new Set(bookings.map((b) => b.vehicleId))];
    const guestIds = [...new Set(bookings.map((b) => b.guestId))];
    const tripIds = bookings.map((b) => b.tripId).filter((x): x is string => !!x);

    const untripped = bookings.filter((b) => !b.tripId).map((b) => b._id);
    const completedIds = bookings.filter((b) => b.status === 'completed').map((b) => b._id);

    const [vehicles, guests, trips, tripCounts, kycs, staged, payouts, cfg] = await Promise.all([
      VehicleModel.find({ _id: { $in: vehicleIds } }).lean<VehicleDoc[]>(),
      UserModel.find({ _id: { $in: guestIds } })
        .select('firstName lastName avatarUrl createdAt')
        .lean<{ _id: string; firstName?: string; lastName?: string; avatarUrl?: string; createdAt: Date }[]>(),
      tripIds.length ? TripModel.find({ _id: { $in: tripIds } }).lean() : Promise.resolve([]),
      // How many trips has each guest taken, ever? (the "14 trips" on the guest card)
      BookingModel.aggregate<{ _id: string; n: number }>([
        { $match: { guestId: { $in: guestIds }, status: 'completed' } },
        { $group: { _id: '$guestId', n: { $sum: 1 } } },
      ]),
      KycModel.find({ userId: { $in: guestIds }, status: 'approved' }).lean<KycDoc[]>(),
      // Pickup photos taken before the trip exists are staged by booking.
      untripped.length
        ? PrePhotoModel.find({ bookingId: { $in: untripped }, movedToTripId: { $exists: false } }).lean<(TripPhoto & { bookingId: string })[]>()
        : Promise.resolve([] as (TripPhoto & { bookingId: string })[]),
      completedIds.length
        ? PayoutModel.find({ bookingId: { $in: completedIds }, kind: 'trip' }).lean<PayoutDoc[]>()
        : Promise.resolve([] as PayoutDoc[]),
      platformConfigService.get(),
    ]);

    const vMap = new Map(vehicles.map((v) => [v._id, v]));
    const gMap = new Map(guests.map((g) => [g._id, g]));
    const tMap = new Map((trips as { _id: string }[]).map((t) => [t._id, t as Record<string, unknown>]));
    const cMap = new Map(tripCounts.map((c) => [c._id, c.n]));
    const kMap = new Map(kycs.map((k) => [k.userId, k]));
    const stagedMap = new Map<string, TripPhoto[]>();
    for (const p of staged) stagedMap.set(p.bookingId, [...(stagedMap.get(p.bookingId) ?? []), p]);
    const payoutMap = new Map(payouts.map((p) => [p.bookingId as string, p]));

    return bookings.map((b) => {
      const v = vMap.get(b.vehicleId);
      const g = gMap.get(b.guestId);
      const t = b.tripId ? tMap.get(b.tripId) : undefined;

      const handover = (t?.handover ?? {}) as { odometerStart?: number };
      const ret = (t?.return ?? {}) as { odometerEnd?: number };
      // Odometers read miles on a US dashboard; everything else here is km.
      const drivenKm =
        ret.odometerEnd != null && handover.odometerStart != null
          ? milesToKm(ret.odometerEnd - handover.odometerStart)
          : undefined;

      const days = Math.max(
        1,
        Math.ceil((+new Date(b.period.end) - +new Date(b.period.start)) / 86_400_000),
      );
      const perDayKm = v?.mileageLimit?.perDayKm ?? 0;

      const photos = ((t?.photos as unknown[]) ?? []).length;
      const verification = this.verificationFor(kMap.get(b.guestId), b.period.end);
      const { timeline, handover: handoverState } = this.timelineFor(
        b,
        (t as unknown as TripDoc | undefined) ?? null,
        (t?.photos as TripPhoto[] | undefined) ?? stagedMap.get(b._id) ?? [],
        verification,
        cfg,
        payoutMap.get(b._id),
      );

      return {
        bookingId: b._id,
        code: b.code,
        tripId: b.tripId,
        status: b.status,
        period: b.period,
        earnings: b.priceBreakdown.hostEarnings.amount,
        currency: b.priceBreakdown.currency,
        receipt: {
          issuedAt: b.createdAt,
          days: b.priceBreakdown.days,
          base: b.priceBreakdown.base.amount,
          cleaningFee: b.priceBreakdown.cleaningFee?.amount ?? 0,
          delivery: b.priceBreakdown.delivery?.amount ?? 0,
          protection: b.priceBreakdown.protection?.amount ?? 0,
          protectionPlan: b.priceBreakdown.protectionPlan,
          discount: b.priceBreakdown.discount?.amount ?? 0,
          subtotal: b.priceBreakdown.subtotal.amount,
          commission: b.priceBreakdown.commission.amount,
          tax: b.priceBreakdown.tax.amount,
          hostEarnings: b.priceBreakdown.hostEarnings.amount,
          total: b.priceBreakdown.total.amount,
        },
        extensions: (b.extensions ?? []).map((e) => ({
          _id: e._id,
          days: e.days,
          prevEnd: e.prevEnd,
          newEnd: e.newEnd,
          hostEarnings: e.hostEarnings.amount,
          createdAt: e.createdAt,
        })),
        pickupAddress: b.delivery?.address ?? v?.location?.address,
        isDelivery: !!b.delivery,
        delivery: b.delivery
          ? {
              mode: b.delivery.mode,
              address: b.delivery.address,
              flightNumber: b.delivery.flightNumber,
              terminal: b.delivery.terminal,
              arrivesAt: b.delivery.arrivesAt,
            }
          : undefined,

        vehicle: {
          _id: b.vehicleId,
          make: v?.make ?? '—',
          model: v?.model ?? '',
          year: v?.year ?? 0,
          plate: v?.registrationNumber,
          photoUrl: v?.photos?.find((p) => p.isCover)?.url ?? v?.photos?.[0]?.url,
        },

        guest: {
          _id: b.guestId,
          name: [g?.firstName, g?.lastName].filter(Boolean).join(' ') || 'Guest',
          avatarUrl: g?.avatarUrl,
          joinedAt: g?.createdAt ?? new Date(),
          tripCount: cMap.get(b.guestId) ?? 0,
          verification,
        },

        mileage: {
          includedKm: perDayKm * days, // 0 stays 0 = unlimited
          overageFeePerKm: v?.mileageLimit?.overageFeePerKm ?? 0,
          drivenKm,
        },

        licenseConfirmed: !!(t?.licenseConfirmed as boolean),
        pickupVerified: !!(t?.pickupVerified as boolean),
        returnAwaitingConfirmation: t?.returnConfirmed === false,
        photoCount: photos,
        timeline,
        handover: handoverState,
      };
    });
  }
}

export const hostTripsService = new HostTripsService();
