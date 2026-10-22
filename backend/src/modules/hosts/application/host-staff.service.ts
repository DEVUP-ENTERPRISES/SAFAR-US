import { randomBytes } from 'crypto';
import {
  HostStaffModel,
  CAPTAIN_ABILITIES,
  DEFAULT_ABILITIES,
  type CaptainAbility,
  type HostStaffDoc,
} from '../infrastructure/host-staff.model';
import { HostModel, type HostDoc } from '../infrastructure/host.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { TripModel } from '../../trips/infrastructure/trip.model';
import { userRepository } from '../../users/infrastructure/user.repository';
import { hashPassword } from '../../auth/application/password';
import { channelProviders } from '../../notifications/infrastructure/channel.providers';
import { config } from '../../../config';
import { logger } from '../../../infrastructure/logging/logger';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { webLink } from '../../../shared/http/site-links';
import { HOUSE_FLEET_ROLE } from '../../../shared/constants/rbac';

/**
 * Captains — a host's staff, and the authority checks that make them safe.
 *
 * The important function here is `can()`. Every Captain-reachable action asks
 * it two questions at once: does this person hold the ability, and is this
 * specific car theirs to touch. Splitting those checks across call sites is how
 * a valet ends up able to cancel a booking on a car they have never seen, so
 * they are answered together or not at all.
 */

export interface CaptainInput {
  name: string;
  email: string;
  phone?: string;
  title?: string;
  abilities?: CaptainAbility[];
  vehicleIds?: string[];
}

function sanitizeAbilities(list?: CaptainAbility[]): CaptainAbility[] {
  if (!list?.length) return [...DEFAULT_ABILITIES];
  // Anything unrecognised is dropped rather than stored — an unknown string in
  // this array would be a permission nobody can audit.
  const clean = list.filter((a) => CAPTAIN_ABILITIES.includes(a));
  if (!clean.length) throw new ValidationError('Pick at least one thing this Captain can do');
  return Array.from(new Set(clean));
}

/**
 * Vehicles, trips and bookings are all keyed by the Host document id, never by
 * the owner's user id, so staff must be keyed the same way or none of the
 * scoping below can ever match.
 */
async function hostFor(userId: string): Promise<HostDoc> {
  const host = await HostModel.findOne({ userId, deletedAt: null }).lean<HostDoc>();
  if (!host) throw new ForbiddenError('You do not have a host account');
  return host;
}

// House Fleet Captains work from the operations panel; everyone else from the host site.
async function acceptUrl(token: string, host: Pick<HostDoc, 'userId'>): Promise<string> {
  const owner = config.notifications.iocWebUrl ? await userRepository.findById(host.userId) : null;
  if (owner?.roles?.includes(HOUSE_FLEET_ROLE)) return `${config.notifications.iocWebUrl}/captain/accept-invite?token=${token}`;
  return webLink(`/host/accept-invite?token=${token}`);
}

async function sendInviteEmail(staff: HostStaffDoc, host: Pick<HostDoc, 'userId' | 'displayName'>): Promise<void> {
  const fleetName = host.displayName;
  const res = await channelProviders.email.send({
    target: { userId: '', email: staff.email },
    templateKey: 'host.captain_invite',
    title: `${fleetName} added you as a Captain on ${config.app.name}`,
    body:
      `${staff.name}, you've been added to the ${fleetName} team on ${config.app.name}. ` +
      'Captains handle pickups and returns for the cars assigned to them. ' +
      'Open the link below to set your password and see your first jobs.',
    actionLabel: 'Accept your invite',
    deepLink: await acceptUrl(staff.inviteToken!, host),
  });
  if (!res.ok) logger.error({ email: staff.email, error: res.error }, 'captain invite email failed');
}

/** The invite token is a bearer credential for the invitee only; it goes into the email and nowhere else. */
function withoutToken<T extends { inviteToken?: string }>(staff: T): Omit<T, 'inviteToken'> {
  const rest: Partial<T> = { ...staff };
  delete rest.inviteToken;
  return rest as Omit<T, 'inviteToken'>;
}

export const hostStaffService = {
  async list(userId: string) {
    const host = await hostFor(userId);
    return (await HostStaffModel.find({ hostId: host._id }).sort({ createdAt: -1 }).lean()).map(withoutToken);
  },

  /** Vehicles the host owns, for the assignment picker. */
  async assignableVehicles(userId: string) {
    const host = await hostFor(userId);
    return VehicleModel.find({ hostId: host._id, deletedAt: null })
      .select('_id make model year photos status')
      .lean();
  },

  async invite(userId: string, input: CaptainInput) {
    const host = await hostFor(userId);
    const email = input.email.trim().toLowerCase();

    const existing = await HostStaffModel.findOne({ hostId: host._id, email }).lean();
    if (existing) throw new ConflictError('That person is already on your team');

    // Every assigned car must actually belong to this host, or a host could
    // grant access to someone else's vehicle by pasting an id.
    const vehicleIds = input.vehicleIds ?? [];
    if (vehicleIds.length) {
      const owned = await VehicleModel.countDocuments({
        _id: { $in: vehicleIds }, hostId: host._id, deletedAt: null,
      });
      if (owned !== vehicleIds.length) throw new ForbiddenError('One of those cars is not yours');
    }

    const staff = await HostStaffModel.create({
      hostId: host._id,
      email,
      name: input.name.trim(),
      phone: input.phone?.trim(),
      title: input.title?.trim(),
      abilities: sanitizeAbilities(input.abilities),
      vehicleIds,
      status: 'invited',
      inviteToken: randomBytes(24).toString('hex'),
      invitedAt: new Date(),
    });

    // Fire-and-forget: a mail outage must not lose the invite, which is the
    // durable thing. The host can resend; they cannot un-lose a record.
    void sendInviteEmail(staff.toObject(), host).catch(() => undefined);
    return withoutToken(staff.toObject());
  },

  /** The invite email gets lost often enough that resending has to be one click. */
  async resendInvite(userId: string, staffId: string) {
    const host = await hostFor(userId);
    const staff = await HostStaffModel.findOne({ _id: staffId, hostId: host._id });
    if (!staff) throw new NotFoundError('Captain not found');
    if (staff.status !== 'invited') throw new ConflictError('They have already accepted');

    // A fresh token on every resend, so a forwarded or leaked older email
    // stops working the moment a new one goes out.
    staff.inviteToken = randomBytes(24).toString('hex');
    staff.invitedAt = new Date();
    await staff.save();

    await sendInviteEmail(staff.toObject(), host);
    return withoutToken(staff.toObject());
  },

  /**
   * What the invite says, before anyone commits to it. Read-only and keyed by
   * the token alone, since the invitee has no session yet.
   */
  async inviteePreview(token: string) {
    const staff = await HostStaffModel.findOne({ inviteToken: token, status: 'invited' }).lean<HostStaffDoc>();
    if (!staff) throw new NotFoundError('That invite link is no longer valid');

    const host = await HostModel.findOne({ _id: staff.hostId }).lean<HostDoc>();
    const user = await userRepository.findByEmail(staff.email);

    return {
      name: staff.name,
      email: staff.email,
      title: staff.title,
      fleetName: host?.displayName ?? 'the fleet',
      abilities: staff.abilities,
      vehicleCount: staff.vehicleIds.length,
      // An existing CatoDrive account keeps its own password; only a brand new
      // one has to choose one here.
      needsPassword: !user,
    };
  },

  /**
   * Claim an invite. Creates the account if there isn't one, links it to the
   * staff record and activates it. Single-use: the token is cleared, so a
   * forwarded email cannot be replayed by a second person.
   */
  async acceptInvite(token: string, password?: string, signedInUserId?: string): Promise<{ userId: string; created: boolean }> {
    const staff = await HostStaffModel.findOne({ inviteToken: token, status: 'invited' });
    if (!staff) throw new NotFoundError('That invite link is no longer valid');

    let user = await userRepository.findByEmail(staff.email);
    const created = !user;
    // Holding the link is not proof of owning an EXISTING account: without this anyone with a token could sign in as that person.
    if (user && signedInUserId !== user._id) {
      throw new ConflictError(`Sign in as ${staff.email} to accept this invite.`, 'SIGN_IN_REQUIRED');
    }
    if (!user) {
      if (!password || password.length < 8) {
        throw new ValidationError('Choose a password of at least 8 characters');
      }
      const [firstName, ...rest] = staff.name.split(' ');
      user = await userRepository.create({
        email: staff.email,
        passwordHash: await hashPassword(password),
        firstName,
        lastName: rest.join(' ') || undefined,
        phone: staff.phone,
        // Receiving the token at this address is the proof.
        emailVerified: true,
      });
    }

    staff.userId = user._id;
    staff.status = 'active';
    staff.acceptedAt = new Date();
    staff.inviteToken = undefined;
    await staff.save();

    logger.info({ staffId: staff._id, hostId: staff.hostId }, '🧑‍✈️ Captain accepted invite');
    return { userId: user._id, created };
  },

  async update(userId: string, staffId: string, patch: Partial<CaptainInput>) {
    const host = await hostFor(userId);
    const staff = await HostStaffModel.findOne({ _id: staffId, hostId: host._id });
    if (!staff) throw new NotFoundError('Captain not found');

    if (patch.vehicleIds) {
      const owned = await VehicleModel.countDocuments({
        _id: { $in: patch.vehicleIds }, hostId: host._id, deletedAt: null,
      });
      if (owned !== patch.vehicleIds.length) throw new ForbiddenError('One of those cars is not yours');
      staff.vehicleIds = patch.vehicleIds;
    }
    if (patch.abilities) staff.abilities = sanitizeAbilities(patch.abilities);
    if (patch.name) staff.name = patch.name.trim();
    if (patch.phone !== undefined) staff.phone = patch.phone?.trim();
    if (patch.title !== undefined) staff.title = patch.title?.trim();

    await staff.save();
    return withoutToken(staff.toObject());
  },

  async setStatus(userId: string, staffId: string, status: 'active' | 'suspended') {
    const host = await hostFor(userId);
    const staff = await HostStaffModel.findOneAndUpdate(
      { _id: staffId, hostId: host._id },
      { status },
      { new: true },
    ).lean();
    if (!staff) throw new NotFoundError('Captain not found');
    return staff;
  },

  async remove(userId: string, staffId: string) {
    const host = await hostFor(userId);
    const r = await HostStaffModel.deleteOne({ _id: staffId, hostId: host._id });
    if (r.deletedCount === 0) throw new NotFoundError('Captain not found');
  },

  /**
   * Can this user act on this vehicle, on this specific fleet?
   *
   * Answers for the host themselves (always yes on their own cars) and for
   * their Captains (only with the ability, only on assigned cars, and only
   * for the fleet they were invited to — a Captain on one fleet must never
   * pass this check by pointing it at a different one). `actAsUserId` is the
   * fleet owner's user id: the trip layer authorises against that, so a
   * Captain's action is carried out as the owner.
   */
  async can(
    userId: string,
    ability: CaptainAbility,
    hostId: string,
    vehicleId?: string,
  ): Promise<{ allowed: boolean; actAsUserId?: string; asCaptain: boolean }> {
    // The owner path first — a host is not a Captain of their own fleet.
    const ownHost = await HostModel.findOne({ _id: hostId, userId, deletedAt: null }).lean<HostDoc>();
    if (ownHost) return { allowed: true, actAsUserId: userId, asCaptain: false };

    const staff = await HostStaffModel.findOne({ userId, hostId, status: 'active' }).lean<HostStaffDoc>();
    if (!staff) return { allowed: false, asCaptain: false };
    if (!staff.abilities.includes(ability)) return { allowed: false, asCaptain: true };

    // Empty vehicleIds means the whole fleet, present and future.
    if (vehicleId && staff.vehicleIds.length > 0 && !staff.vehicleIds.includes(vehicleId)) {
      return { allowed: false, asCaptain: true };
    }

    const owner = await HostModel.findOne({ _id: hostId, deletedAt: null }).lean<HostDoc>();
    if (!owner) return { allowed: false, asCaptain: true };
    return { allowed: true, actAsUserId: owner.userId, asCaptain: true };
  },

  /**
   * What a Captain is responsible for right now: the trips on their cars.
   * This is the whole point of the feature — a valet opens the app and sees
   * the handovers due, not a dashboard about someone else's money.
   */
  async captainQueue(userId: string) {
    const staff = await HostStaffModel.findOne({ userId, status: 'active' }).lean<HostStaffDoc>();
    if (!staff) return null;

    const scope = staff.vehicleIds.length
      ? { vehicleId: { $in: staff.vehicleIds } }
      : { hostId: staff.hostId };

    const trips = await TripModel.find({ ...scope, status: 'active' })
      .sort({ 'handover.at': 1 })
      .limit(50)
      .lean();

    // Without the car attached, the queue reads as a list of ids — a Captain
    // needs to know which vehicle to walk to.
    const vehicles = await VehicleModel.find({ _id: { $in: trips.map((t) => t.vehicleId) } })
      .select('_id make model year photos licensePlate')
      .lean();
    const byId = new Map(vehicles.map((v) => [v._id, v]));

    const host = await HostModel.findOne({ _id: staff.hostId }).lean<HostDoc>();

    return {
      staff,
      fleetName: host?.displayName ?? 'the fleet',
      trips: trips.map((t) => ({ ...t, vehicle: byId.get(t.vehicleId) ?? null })),
    };
  },

  /** A Captain's day: pickups and returns on their cars for the next week, who's out now, and each car's state. */
  async captainDashboard(userId: string, now = new Date()) {
    const staff = await HostStaffModel.findOne({ userId, status: 'active' }).lean<HostStaffDoc>();
    if (!staff) return null;
    const { BookingModel } = await import('../../bookings/infrastructure/booking.model');
    const { UserModel } = await import('../../users/infrastructure/user.model');

    const carFilter = staff.vehicleIds.length ? { _id: { $in: staff.vehicleIds } } : { hostId: staff.hostId };
    const cars = await VehicleModel.find({ ...carFilter, deletedAt: null, status: { $ne: 'delisted' } })
      .select('_id make model year registrationNumber photos status location.address')
      .sort({ make: 1, model: 1 })
      .limit(200)
      .lean<{ _id: string; make: string; model: string; year: number; registrationNumber?: string; photos?: { url: string; isCover?: boolean }[]; status: string; location?: { address?: string } }[]>();
    const carIds = cars.map((c) => c._id);
    const week = new Date(now.getTime() + 7 * 86_400_000);

    const bookings = await BookingModel.find({
      vehicleId: { $in: carIds },
      $or: [
        { status: { $in: ['confirmed', 'paid'] }, 'period.start': { $lt: week }, 'period.end': { $gt: now } },
        { status: 'in_progress' },
      ],
    })
      .select('_id code guestId vehicleId status period delivery')
      .sort({ 'period.start': 1 })
      .limit(300)
      .lean<{ _id: string; code: string; guestId: string; vehicleId: string; status: string; period: { start: Date; end: Date }; delivery?: { mode: string; address: string; flightNumber?: string; terminal?: string } }[]>();

    const guests = await UserModel.find({ _id: { $in: [...new Set(bookings.map((b) => b.guestId))] } }).select('_id firstName phone').lean<{ _id: string; firstName?: string; phone?: string }[]>();
    const guestById = new Map(guests.map((g) => [g._id, g]));
    const carById = new Map(cars.map((c) => [c._id, c]));
    const canSeePhone = staff.abilities.includes('trip:handover');

    const job = (b: (typeof bookings)[number], kind: 'pickup' | 'return') => {
      const c = carById.get(b.vehicleId);
      const g = guestById.get(b.guestId);
      return {
        kind,
        bookingId: b._id,
        code: b.code,
        at: kind === 'pickup' ? b.period.start : b.period.end,
        overdue: kind === 'return' && new Date(b.period.end) < now,
        guestName: g?.firstName ?? 'Guest',
        ...(canSeePhone && g?.phone ? { guestPhone: g.phone } : {}),
        where: b.delivery?.address ?? c?.location?.address,
        delivery: b.delivery ? { mode: b.delivery.mode, flightNumber: b.delivery.flightNumber, terminal: b.delivery.terminal } : undefined,
        vehicle: c ? { _id: c._id, label: `${c.year} ${c.make} ${c.model}`, plate: c.registrationNumber, photo: (c.photos?.find((p) => p.isCover) ?? c.photos?.[0])?.url } : null,
      };
    };

    const pickups = bookings.filter((b) => b.status !== 'in_progress').map((b) => job(b, 'pickup'));
    const out = bookings.filter((b) => b.status === 'in_progress');
    const returns = out.filter((b) => new Date(b.period.end) < week).map((b) => job(b, 'return'));
    const jobs = [...pickups, ...returns].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    const outBy = new Map(out.map((b) => [b.vehicleId, b]));
    const nextBy = new Map<string, Date>();
    for (const b of bookings) if (b.status !== 'in_progress' && !nextBy.has(b.vehicleId)) nextBy.set(b.vehicleId, b.period.start);

    const host = await HostModel.findOne({ _id: staff.hostId }).select('displayName').lean<{ displayName?: string }>();
    return {
      staff: withoutToken(staff),
      fleetName: host?.displayName ?? 'the fleet',
      jobs,
      counts: {
        today: jobs.filter((j) => new Date(j.at).toDateString() === now.toDateString() || j.overdue).length,
        overdue: jobs.filter((j) => j.overdue).length,
        out: out.length,
        cars: cars.length,
      },
      cars: cars.map((c) => ({
        _id: c._id,
        label: `${c.year} ${c.make} ${c.model}`,
        plate: c.registrationNumber,
        photo: (c.photos?.find((p) => p.isCover) ?? c.photos?.[0])?.url,
        listed: c.status === 'listed',
        outUntil: outBy.get(c._id)?.period.end,
        nextPickup: nextBy.get(c._id),
      })),
    };
  },

  /** A Captain with "Block dates" takes one of their cars off the calendar, e.g. for servicing. */
  async captainBlockDates(userId: string, vehicleId: string, input: { start: Date; end: Date; action: 'block' | 'unblock' }) {
    const car = await VehicleModel.findOne({ _id: vehicleId, deletedAt: null }).select('hostId').lean<{ hostId: string }>();
    if (!car) throw new NotFoundError('Car');
    const { allowed } = await this.can(userId, 'calendar:manage', car.hostId, vehicleId);
    if (!allowed) throw new ForbiddenError('You can’t change the calendar for this car');
    if (input.end <= input.start) throw new ValidationError('The end has to be after the start');
    const { availabilityService } = await import('../../availability/application/availability.service');
    if (input.action === 'unblock') await availabilityService.unblock(vehicleId, input.start, input.end);
    else await availabilityService.block(vehicleId, input.start, input.end);
    logger.info({ userId, vehicleId, action: input.action }, 'Captain changed a car calendar');
    return { updated: true };
  },
};
