import { HostModel, type HostDoc } from '../infrastructure/host.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { ConflictError, NotFoundError } from '../../../core/errors/app-error';
import { ROLES } from '../../../shared/constants/rbac';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';

/** Host onboarding + read contract used by vehicles/bookings. */
export class HostService {
  async onboard(userId: string, displayName: string, bio?: string): Promise<HostDoc> {
    const existing = await HostModel.findOne({ userId, deletedAt: null }).lean();
    if (existing) throw new ConflictError('Already a host', 'ALREADY_HOST');

    const host = await HostModel.create({ userId, displayName, bio });

    // Grant the host role (union with existing roles).
    await UserModel.updateOne({ _id: userId }, { $addToSet: { roles: ROLES.HOST } });

    emit(EVENTS.HOST_ONBOARDED, host._id, { hostId: host._id, userId });
    return host.toObject();
  }

  async getById(hostId: string): Promise<HostDoc> {
    const host = await HostModel.findOne({ _id: hostId, deletedAt: null }).lean<HostDoc>();
    if (!host) throw new NotFoundError('Host');
    return host;
  }

  async getByUserId(userId: string): Promise<HostDoc | null> {
    return HostModel.findOne({ userId, deletedAt: null }).lean<HostDoc>();
  }

  /** Update host/business/tax/banking profile. Only provided fields change. */
  async updateProfile(userId: string, patch: Partial<HostDoc>): Promise<HostDoc> {
    const host = await this.requireHostForUser(userId);
    const allowed: Record<string, unknown> = {};
    const keys: (keyof HostDoc)[] = [
      'displayName',
      'bio',
      'hostType',
      'isFleetOwner',
      'businessProfile',
      'taxInfo',
      'bankingDetails',
    ];
    for (const k of keys) if (patch[k] !== undefined) allowed[k] = patch[k];
    await HostModel.updateOne({ _id: host._id }, allowed);
    return this.getById(host._id);
  }

  async requireHostForUser(userId: string): Promise<HostDoc> {
    const host = await this.getByUserId(userId);
    if (!host) throw new NotFoundError('Host profile');
    return host;
  }

  async isVerified(hostId: string): Promise<boolean> {
    const host = await HostModel.findOne({ _id: hostId }).lean<HostDoc>();
    return host?.verificationStatus === 'verified';
  }

  async verify(hostId: string): Promise<void> {
    const res = await HostModel.updateOne({ _id: hostId }, { verificationStatus: 'verified' });
    if (res.matchedCount === 0) throw new NotFoundError('Host');
  }
}

export const hostService = new HostService();
