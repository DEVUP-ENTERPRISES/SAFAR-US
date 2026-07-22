import { HostModel } from '../infrastructure/host.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { NotFoundError } from '../../../core/errors/app-error';

export interface HostPublicProfile {
  _id: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  city: string | null;
  work: string | null;
  languages: string[];
  joinedAt: Date;
  isSuperhost: boolean;
  ratingAvg: number | null;
  ratingCount: number;
  totalTrips: number;
  listedVehicles: number;
  /** Percentage of booking requests the host answered, 0-100. Null until there
   *  have been requests to answer — an unproven host is not a 100% host. */
  responseRatePct: number | null;
  /** Typical minutes to respond (median, so one slow reply doesn't define them). */
  responseTimeMinutes: number | null;
  verifications: { email: boolean; phone: boolean; identity: boolean };
}

/**
 * What a guest sees before trusting someone with a trip.
 *
 * Every number here is derived from real activity. The listing page previously
 * rendered a hardcoded host ("Ruslan, 13 trips, 5.0") on every car, which is
 * exactly the sort of claim that has to be true.
 */
export class HostProfileService {
  async publicProfile(hostId: string): Promise<HostPublicProfile> {
    const host = await HostModel.findOne({ _id: hostId, deletedAt: null }).lean();
    if (!host) throw new NotFoundError('Host');

    const [user, listedVehicles, responsiveness, kyc] = await Promise.all([
      UserModel.findOne({ _id: host.userId }).lean(),
      VehicleModel.countDocuments({ hostId, status: 'listed', verificationStatus: 'verified' }),
      this.responsiveness(hostId),
      KycModel.findOne({ userId: host.userId }, { status: 1 }).lean(),
    ]);

    return {
      _id: host._id,
      displayName: host.displayName,
      bio: host.bio ?? null,
      // The host's own photo wins; fall back to their account avatar so a host
      // who set one on their profile page isn't shown as a blank initial.
      avatarUrl: host.avatarUrl ?? user?.avatarUrl ?? null,
      city: host.city ?? null,
      work: host.work ?? null,
      languages: host.languages ?? [],
      joinedAt: host.createdAt,
      isSuperhost: !!host.isSuperhost,
      // Null, not 0 — "no rating yet" and "rated zero" are different claims.
      ratingAvg: (host.ratingCount ?? 0) > 0 ? host.ratingAvg : null,
      ratingCount: host.ratingCount ?? 0,
      totalTrips: host.totalTrips ?? 0,
      listedVehicles,
      ...responsiveness,
      verifications: {
        email: !!user?.emailVerified,
        phone: !!user?.phoneVerified,
        identity: kyc?.status === 'approved',
      },
    };
  }

  /**
   * The cars a guest can actually book from this host. Drafts and unverified
   * listings are the host's business, not the public's.
   */
  async publicVehicles(hostId: string) {
    return VehicleModel.find({ hostId, status: 'listed', verificationStatus: 'verified' })
      .sort({ ratingAvg: -1, createdAt: -1 })
      .limit(24)
      .lean();
  }

  /**
   * Response rate and typical response time, read off the booking status trail.
   *
   * Only requests that actually needed a decision count: an Instant Book trip
   * is confirmed without the host doing anything, so counting it would inflate
   * every host to 100%.
   */
  private async responsiveness(
    hostId: string,
  ): Promise<{ responseRatePct: number | null; responseTimeMinutes: number | null }> {
    const rows = await BookingModel.find(
      { hostId, 'statusHistory.to': 'pending_approval' },
      { createdAt: 1, statusHistory: 1 },
    )
      .sort({ createdAt: -1 })
      .limit(200) // recent behaviour, not a lifetime average
      .lean();

    if (rows.length === 0) return { responseRatePct: null, responseTimeMinutes: null };

    const RESPONSES = new Set(['paid', 'confirmed', 'approved', 'rejected', 'declined', 'cancelled']);
    let answered = 0;
    const minutes: number[] = [];

    for (const b of rows) {
      const history = b.statusHistory ?? [];
      const asked = history.find((h) => h.to === 'pending_approval');
      if (!asked) continue;
      const replied = history.find(
        (h) => RESPONSES.has(h.to) && new Date(h.at).getTime() >= new Date(asked.at).getTime(),
      );
      if (!replied) continue;
      answered += 1;
      minutes.push((new Date(replied.at).getTime() - new Date(asked.at).getTime()) / 60_000);
    }

    minutes.sort((a, b) => a - b);
    const median = minutes.length
      ? minutes[Math.floor((minutes.length - 1) / 2)]
      : null;

    return {
      responseRatePct: Math.round((answered / rows.length) * 100),
      responseTimeMinutes: median === null ? null : Math.max(1, Math.round(median)),
    };
  }
}

export const hostProfileService = new HostProfileService();
