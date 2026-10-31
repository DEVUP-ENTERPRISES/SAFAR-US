import { UserModel } from '../../users/infrastructure/user.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { AssetPartnerModel } from '../../asset-partners/infrastructure/asset-partner.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { ReviewModel } from '../../reviews/infrastructure/review.model';
import { HOUSE_FLEET_ROLE, STAFF_ROLES } from '../../../shared/constants/rbac';

/** staff: CatoDrive's own people (admin console, operations panel); host: a self-managed host answering a guest. */
export type Visibility = 'staff' | 'host';
export type PersonKind = 'guest' | 'host' | 'asset_partner' | 'staff';

export interface PersonSummary {
  id: string;
  name: string;
  kind: PersonKind;
  avatar?: string;
  memberSince?: Date;
  accountStatus: string;
  canBook: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  identity: 'verified' | 'pending' | 'not_verified';
  /** Null when there is no verified licence on file. */
  licenceValid: boolean | null;
  age?: number;
  trips: { completed: number; upcoming: number; cancelledByGuest: number; withThisHost?: number };
  rating?: { average: number; count: number };
  deleted?: boolean;
  /** Staff only. */
  contact?: { fullName?: string; verifiedName?: string; email?: string; phone?: string };
}

interface UserLite {
  _id: string; firstName?: string; lastName?: string; email?: string; phone?: string; avatarUrl?: string; roles?: string[];
  createdAt?: Date; status?: string; emailVerified?: boolean; phoneVerified?: boolean;
}
interface KycLite { userId: string; status: string; verifiedFirstName?: string; verifiedLastName?: string; verifiedDob?: Date; licenceExpiry?: Date }

const UPCOMING = ['pending_verification', 'pending_approval', 'pending_payment', 'confirmed', 'paid', 'in_progress'];

const ageOn = (dob: Date, now = new Date()) => {
  let a = now.getFullYear() - dob.getFullYear();
  if (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate())) a -= 1;
  return a;
};

/** "Jordan R." */
export function shortName(first?: string, last?: string): string | undefined {
  const f = first?.trim();
  if (!f) return undefined;
  const l = last?.trim();
  return l ? `${f} ${l[0].toUpperCase()}.` : f;
}

/** Staff see the full name, else the name on their ID, else their email; hosts see a short name and never an email. */
export function displayName(u: UserLite | undefined, k: KycLite | undefined, visibility: Visibility): string {
  if (!u) return 'Deleted account';
  if (visibility === 'staff') {
    return [u.firstName, u.lastName].filter(Boolean).join(' ') || [k?.verifiedFirstName, k?.verifiedLastName].filter(Boolean).join(' ') || u.email || u.phone || 'No name yet';
  }
  return shortName(u.firstName, u.lastName) ?? shortName(k?.verifiedFirstName, k?.verifiedLastName) ?? 'New guest (no name yet)';
}

/** Whether a viewer is CatoDrive staff (console roles or the CatoDrive fleet operator). */
export async function visibilityFor(userId: string): Promise<Visibility> {
  const u = await UserModel.findOne({ _id: userId }).select('roles').lean<{ roles?: string[] }>();
  const roles = u?.roles ?? [];
  return roles.includes(HOUSE_FLEET_ROLE) || roles.some((r) => STAFF_ROLES.includes(r)) ? 'staff' : 'host';
}

/**
 * The one answer to "who is this person", for any screen where someone contacts us.
 * Batched: a fixed number of queries however many people are asked about.
 */
export async function personSummaries(userIds: string[], opts: { visibility: Visibility; hostId?: string }): Promise<Map<string, PersonSummary>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out = new Map<string, PersonSummary>();
  if (ids.length === 0) return out;
  const now = new Date();
  const [users, hosts, partners, kycs, done, upcoming, cancelled, withHost, ratings] = await Promise.all([
    UserModel.find({ _id: { $in: ids } }).select('_id firstName lastName email phone avatarUrl roles createdAt status emailVerified phoneVerified').lean<UserLite[]>(),
    HostModel.find({ userId: { $in: ids } }).select('userId').lean<{ userId: string }[]>(),
    AssetPartnerModel.find({ userId: { $in: ids } }).select('userId').lean<{ userId: string }[]>(),
    KycModel.find({ userId: { $in: ids } }).select('userId status verifiedFirstName verifiedLastName verifiedDob licenceExpiry').lean<KycLite[]>(),
    BookingModel.aggregate<{ _id: string; n: number }>([{ $match: { guestId: { $in: ids }, status: 'completed' } }, { $group: { _id: '$guestId', n: { $sum: 1 } } }]),
    BookingModel.aggregate<{ _id: string; n: number }>([{ $match: { guestId: { $in: ids }, status: { $in: UPCOMING }, 'period.end': { $gt: now } } }, { $group: { _id: '$guestId', n: { $sum: 1 } } }]),
    BookingModel.aggregate<{ _id: string; n: number }>([{ $match: { guestId: { $in: ids }, status: 'cancelled_guest' } }, { $group: { _id: '$guestId', n: { $sum: 1 } } }]),
    opts.hostId
      ? BookingModel.aggregate<{ _id: string; n: number }>([{ $match: { guestId: { $in: ids }, hostId: opts.hostId, status: 'completed' } }, { $group: { _id: '$guestId', n: { $sum: 1 } } }])
      : Promise.resolve([] as { _id: string; n: number }[]),
    ReviewModel.aggregate<{ _id: string; avg: number; n: number }>([
      { $match: { subjectId: { $in: ids }, direction: 'host_to_guest', status: 'published' } },
      { $group: { _id: '$subjectId', avg: { $avg: '$rating' }, n: { $sum: 1 } } },
    ]),
  ]);
  const count = (rows: { _id: string; n: number }[]) => new Map(rows.map((r) => [r._id, r.n]));
  const userBy = new Map(users.map((u) => [u._id, u]));
  const kycBy = new Map(kycs.map((k) => [k.userId, k]));
  const hostSet = new Set(hosts.map((h) => h.userId));
  const partnerSet = new Set(partners.map((p) => p.userId));
  const [doneBy, upBy, cancelBy, hostBy] = [count(done), count(upcoming), count(cancelled), count(withHost)];
  const ratingBy = new Map(ratings.map((r) => [r._id, r]));

  for (const id of ids) {
    const u = userBy.get(id);
    const k = kycBy.get(id);
    const approved = k?.status === 'approved';
    const r = ratingBy.get(id);
    const status = u?.status ?? 'active';
    out.set(id, {
      id,
      name: displayName(u, k, opts.visibility),
      kind: (u?.roles ?? []).some((x) => STAFF_ROLES.includes(x)) ? 'staff' : partnerSet.has(id) ? 'asset_partner' : hostSet.has(id) ? 'host' : 'guest',
      avatar: u?.avatarUrl,
      memberSince: u?.createdAt,
      accountStatus: u ? status : 'deleted',
      canBook: !!u && status === 'active',
      emailVerified: !!u?.emailVerified,
      phoneVerified: !!u?.phoneVerified,
      identity: approved ? 'verified' : k?.status === 'pending' ? 'pending' : 'not_verified',
      licenceValid: approved && k?.licenceExpiry ? new Date(k.licenceExpiry) > now : null,
      age: approved && k?.verifiedDob ? ageOn(new Date(k.verifiedDob), now) : undefined,
      trips: { completed: doneBy.get(id) ?? 0, upcoming: upBy.get(id) ?? 0, cancelledByGuest: cancelBy.get(id) ?? 0, ...(opts.hostId ? { withThisHost: hostBy.get(id) ?? 0 } : {}) },
      rating: r?.n ? { average: Math.round(r.avg * 10) / 10, count: r.n } : undefined,
      ...(u ? {} : { deleted: true }),
      ...(opts.visibility === 'staff' && u
        ? { contact: { fullName: [u.firstName, u.lastName].filter(Boolean).join(' ') || undefined, verifiedName: [k?.verifiedFirstName, k?.verifiedLastName].filter(Boolean).join(' ') || undefined, email: u.email, phone: u.phone } }
        : {}),
    });
  }
  return out;
}

export async function personSummary(userId: string, opts: { visibility: Visibility; hostId?: string }): Promise<PersonSummary> {
  return (await personSummaries([userId], opts)).get(userId)!;
}
