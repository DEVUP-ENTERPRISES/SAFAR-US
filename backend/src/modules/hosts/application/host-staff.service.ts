import { randomBytes } from 'crypto';
import {
  HostStaffModel,
  CAPTAIN_ABILITIES,
  DEFAULT_ABILITIES,
  type CaptainAbility,
  type HostStaffDoc,
} from '../infrastructure/host-staff.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { TripModel } from '../../trips/infrastructure/trip.model';
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

export const hostStaffService = {
  async list(hostId: string) {
    return HostStaffModel.find({ hostId }).sort({ createdAt: -1 }).lean();
  },

  /** Vehicles the host owns, for the assignment picker. */
  async assignableVehicles(hostId: string) {
    return VehicleModel.find({ hostId, deletedAt: null })
      .select('_id make model year photos status')
      .lean();
  },

  async invite(hostId: string, input: CaptainInput) {
    const email = input.email.trim().toLowerCase();

    const existing = await HostStaffModel.findOne({ hostId, email }).lean();
    if (existing) throw new ConflictError('That person is already on your team');

    // Every assigned car must actually belong to this host, or a host could
    // grant access to someone else's vehicle by pasting an id.
    const vehicleIds = input.vehicleIds ?? [];
    if (vehicleIds.length) {
      const owned = await VehicleModel.countDocuments({ _id: { $in: vehicleIds }, hostId, deletedAt: null });
      if (owned !== vehicleIds.length) throw new ForbiddenError('One of those cars is not yours');
    }

    return HostStaffModel.create({
      hostId,
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
  },

  async update(hostId: string, staffId: string, patch: Partial<CaptainInput>) {
    const staff = await HostStaffModel.findOne({ _id: staffId, hostId });
    if (!staff) throw new NotFoundError('Captain not found');

    if (patch.vehicleIds) {
      const owned = await VehicleModel.countDocuments({
        _id: { $in: patch.vehicleIds }, hostId, deletedAt: null,
      });
      if (owned !== patch.vehicleIds.length) throw new ForbiddenError('One of those cars is not yours');
      staff.vehicleIds = patch.vehicleIds;
    }
    if (patch.abilities) staff.abilities = sanitizeAbilities(patch.abilities);
    if (patch.name) staff.name = patch.name.trim();
    if (patch.phone !== undefined) staff.phone = patch.phone?.trim();
    if (patch.title !== undefined) staff.title = patch.title?.trim();

    await staff.save();
    return staff.toObject();
  },

  async setStatus(hostId: string, staffId: string, status: 'active' | 'suspended') {
    const staff = await HostStaffModel.findOneAndUpdate(
      { _id: staffId, hostId },
      { status },
      { new: true },
    ).lean();
    if (!staff) throw new NotFoundError('Captain not found');
    return staff;
  },

  async remove(hostId: string, staffId: string) {
    const r = await HostStaffModel.deleteOne({ _id: staffId, hostId });
    if (r.deletedCount === 0) throw new NotFoundError('Captain not found');
  },

  /**
   * Can this user act on this vehicle?
   *
   * Answers for the host themselves (always yes on their own cars) and for
   * their Captains (only with the ability, and only on assigned cars). Returns
   * the effective hostId so the caller can act as the fleet owner.
   */
  async can(
    userId: string,
    ability: CaptainAbility,
    vehicleId?: string,
  ): Promise<{ allowed: boolean; hostId?: string; asCaptain: boolean }> {
    // The owner path first — a host is not a Captain of their own fleet.
    if (vehicleId) {
      const owned = await VehicleModel.exists({ _id: vehicleId, hostId: userId, deletedAt: null });
      if (owned) return { allowed: true, hostId: userId, asCaptain: false };
    }

    const staff = await HostStaffModel.findOne({ userId, status: 'active' }).lean<HostStaffDoc>();
    if (!staff) return { allowed: false, asCaptain: false };
    if (!staff.abilities.includes(ability)) return { allowed: false, hostId: staff.hostId, asCaptain: true };

    // Empty vehicleIds means the whole fleet, present and future.
    if (vehicleId && staff.vehicleIds.length > 0 && !staff.vehicleIds.includes(vehicleId)) {
      return { allowed: false, hostId: staff.hostId, asCaptain: true };
    }
    return { allowed: true, hostId: staff.hostId, asCaptain: true };
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

    return { staff, trips };
  },
};
