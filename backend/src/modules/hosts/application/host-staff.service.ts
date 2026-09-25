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

function acceptUrl(token: string): string {
  const base = config.notifications.webUrl || config.app.publicUrl;
  return `${base}/host/accept-invite?token=${token}`;
}

async function sendInviteEmail(staff: HostStaffDoc, fleetName: string): Promise<void> {
  const res = await channelProviders.email.send({
    target: { userId: '', email: staff.email },
    templateKey: 'host.captain_invite',
    title: `${fleetName} added you as a Captain on ${config.app.name}`,
    body:
      `${staff.name}, you've been added to the ${fleetName} team on ${config.app.name}. ` +
      'Captains handle pickups and returns for the cars assigned to them. ' +
      'Open the link below to set your password and see your first jobs.',
    actionLabel: 'Accept your invite',
    deepLink: acceptUrl(staff.inviteToken!),
  });
  if (!res.ok) logger.error({ email: staff.email, error: res.error }, 'captain invite email failed');
}

/** The invite token is a bearer credential for the invitee only; it goes into the email and nowhere else. */
function withoutToken<T extends { inviteToken?: string }>(staff: T): Omit<T, 'inviteToken'> {
  const { inviteToken: _token, ...rest } = staff;
  return rest;
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
    void sendInviteEmail(staff.toObject(), host.displayName).catch(() => undefined);
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

    await sendInviteEmail(staff.toObject(), host.displayName);
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
};
