import { BookingModel, type BookingDoc } from '../infrastructure/booking.model';
import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { TripModel } from '../../trips/infrastructure/trip.model';
import { hostService } from '../../hosts/application/host.service';
import { TERMINAL_STATUSES } from '../domain/booking-status';

/** Everything a host trip card / detail screen needs, in one shot. */
export interface HostTrip {
  bookingId: string;
  code: string;
  tripId?: string;
  status: string;
  period: { start: Date; end: Date };
  earnings: number;
  currency: string;
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
  };

  mileage: {
    /** 0 = unlimited. */
    includedKm: number;
    overageFeePerKm: number;
    drivenKm?: number;
  };

  /** Check-in state — drives the "Start check-in" vs "End trip" CTA. */
  licenseConfirmed: boolean;
  photoCount: number;
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
    const host = await hostService.requireHostForUser(userId);
    const booking = await BookingModel.findOne({ _id: bookingId, hostId: host._id }).lean<BookingDoc>();
    if (!booking) return null;
    const [trip] = await this.enrich([booking]);
    return trip ?? null;
  }

  private async query(
    userId: string,
    statuses: string[],
    sort: Record<string, 1 | -1>,
  ): Promise<HostTrip[]> {
    const host = await hostService.requireHostForUser(userId);
    const bookings = await BookingModel.find({ hostId: host._id, status: { $in: statuses } })
      .sort(sort)
      .limit(100)
      .lean<BookingDoc[]>();
    return this.enrich(bookings);
  }

  /** One batched join — never a query per row. */
  private async enrich(bookings: BookingDoc[]): Promise<HostTrip[]> {
    if (bookings.length === 0) return [];

    const vehicleIds = [...new Set(bookings.map((b) => b.vehicleId))];
    const guestIds = [...new Set(bookings.map((b) => b.guestId))];
    const tripIds = bookings.map((b) => b.tripId).filter((x): x is string => !!x);

    const [vehicles, guests, trips, tripCounts] = await Promise.all([
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
    ]);

    const vMap = new Map(vehicles.map((v) => [v._id, v]));
    const gMap = new Map(guests.map((g) => [g._id, g]));
    const tMap = new Map((trips as { _id: string }[]).map((t) => [t._id, t as Record<string, unknown>]));
    const cMap = new Map(tripCounts.map((c) => [c._id, c.n]));

    return bookings.map((b) => {
      const v = vMap.get(b.vehicleId);
      const g = gMap.get(b.guestId);
      const t = b.tripId ? tMap.get(b.tripId) : undefined;

      const handover = (t?.handover ?? {}) as { odometerStart?: number };
      const ret = (t?.return ?? {}) as { odometerEnd?: number };
      const drivenKm =
        ret.odometerEnd != null && handover.odometerStart != null
          ? ret.odometerEnd - handover.odometerStart
          : undefined;

      const days = Math.max(
        1,
        Math.ceil((+new Date(b.period.end) - +new Date(b.period.start)) / 86_400_000),
      );
      const perDayKm = v?.mileageLimit?.perDayKm ?? 0;

      const photos = ((t?.photos as unknown[]) ?? []).length;

      return {
        bookingId: b._id,
        code: b.code,
        tripId: b.tripId,
        status: b.status,
        period: b.period,
        earnings: b.priceBreakdown.hostEarnings.amount,
        currency: b.priceBreakdown.currency,
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
        },

        mileage: {
          includedKm: perDayKm * days, // 0 stays 0 = unlimited
          overageFeePerKm: v?.mileageLimit?.overageFeePerKm ?? 0,
          drivenKm,
        },

        licenseConfirmed: !!(t?.licenseConfirmed as boolean),
        photoCount: photos,
      };
    });
  }
}

export const hostTripsService = new HostTripsService();
