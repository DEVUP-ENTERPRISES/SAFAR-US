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
      'avatarUrl',
      'avatarKey',
      'languages',
      'city',
      'work',
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

  /**
   * Superhost program: auto-award when a host clears the quality bar, and
   * denormalize the flag onto their vehicles so search can boost + badge them
   * without a join.
   */
  async recomputeSuperhost(hostId: string): Promise<boolean> {
    const host = await HostModel.findOne({ _id: hostId }).lean<HostDoc>();
    if (!host) return false;
    const qualifies =
      host.verificationStatus === 'verified' && host.ratingAvg >= 4.8 && host.ratingCount >= 3;
    if (qualifies !== host.isSuperhost) {
      await HostModel.updateOne({ _id: hostId }, { isSuperhost: qualifies });
      const { VehicleModel } = await import('../../vehicles/infrastructure/vehicle.model');
      await VehicleModel.updateMany({ hostId }, { hostIsSuperhost: qualifies });
    }
    return qualifies;
  }

  async verify(hostId: string): Promise<void> {
    const res = await HostModel.updateOne({ _id: hostId }, { verificationStatus: 'verified' });
    if (res.matchedCount === 0) throw new NotFoundError('Host');
  }

  // ── Admin ──────────────────────────────────────────────────────────
  async setVerification(hostId: string, status: 'pending' | 'verified' | 'rejected'): Promise<HostDoc> {
    const res = await HostModel.updateOne({ _id: hostId }, { verificationStatus: status });
    if (res.matchedCount === 0) throw new NotFoundError('Host');
    return this.getById(hostId);
  }

  async adminList(opts: { q?: string; status?: string; limit?: number; skip?: number }): Promise<{
    items: HostDoc[];
    total: number;
  }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const filter: Record<string, unknown> = { deletedAt: null };
    if (opts.status) filter.verificationStatus = opts.status;
    if (opts.q) filter.displayName = new RegExp(opts.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const [items, total] = await Promise.all([
      HostModel.find(filter).sort({ createdAt: -1 }).skip(opts.skip ?? 0).limit(limit).lean<HostDoc[]>(),
      HostModel.countDocuments(filter),
    ]);
    return { items, total };
  }

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return HostModel.countDocuments({ deletedAt: null, ...filter });
  }
}

export const hostService = new HostService();
