import { BookingModel, type BookingDoc } from '../infrastructure/booking.model';
import { VehicleModel, type VehicleDoc } from '../../vehicles/infrastructure/vehicle.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { TripModel } from '../../trips/infrastructure/trip.model';
import { hostService } from '../../hosts/application/host.service';

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
  async booked(userId: string): Promise<HostTrip[]> {
    return this.query(userId, ['confirmed', 'paid', 'in_progress'], { 'period.start': 1 });
  }

  /** Finished or cancelled trips ("HISTORY"). */
  async history(userId: string): Promise<HostTrip[]> {
    return this.query(userId, ['completed', 'cancelled'], { 'period.end': -1 });
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
        pickupAddress: v?.location?.address,
        isDelivery: !!(b as unknown as { delivery?: unknown }).delivery,

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
