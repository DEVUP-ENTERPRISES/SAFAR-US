import type { AccountStatus } from '../domain/account-status';
import { UserModel, type UserDoc } from './user.model';
import { cursorFilter, decodeCursor, toPage } from '../../../shared/utils/pagination';
import type { Page } from '../../../core/types/common';

/**
 * The only code that touches the User collection. Other modules resolve
 * users through the users contract, never through this repository directly.
 * All default reads exclude soft-deleted documents.
 */
export class UserRepository {
  async create(data: Partial<UserDoc>): Promise<UserDoc> {
    const doc = await UserModel.create(data);
    return doc.toObject();
  }

  async findById(id: string): Promise<UserDoc | null> {
    return UserModel.findOne({ _id: id, deletedAt: null }).lean<UserDoc>().exec();
  }

  /** Match a returning social user on the provider subject. */
  async findBySocialSubject(subjectKey: string): Promise<UserDoc | null> {
    return UserModel.findOne({ socialSubjects: subjectKey, deletedAt: null }).lean<UserDoc>();
  }

  /** Idempotent — $addToSet, so re-linking the same provider is a no-op. */
  async linkSocialSubject(userId: string, subjectKey: string): Promise<void> {
    await UserModel.updateOne({ _id: userId }, { $addToSet: { socialSubjects: subjectKey } });
  }

  async findByEmail(email: string, withSecret = false): Promise<UserDoc | null> {
    const q = UserModel.findOne({ email: email.toLowerCase(), deletedAt: null });
    if (withSecret) q.select('+passwordHash +mfa.secret');
    return q.lean<UserDoc>().exec();
  }

  async findByPhone(phone: string): Promise<UserDoc | null> {
    return UserModel.findOne({ phone, deletedAt: null }).lean<UserDoc>().exec();
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await UserModel.countDocuments({
      email: email.toLowerCase(),
      deletedAt: null,
    }).exec();
    return count > 0;
  }

  // ── Admin queries ──────────────────────────────────────────────────
  async adminList(opts: {
    q?: string;
    status?: string;
    role?: string;
    cursor?: string;
    limit?: number;
  }): Promise<Page<UserDoc>> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const filter: Record<string, unknown> = { deletedAt: null, ...cursorFilter(decodeCursor(opts.cursor)) };
    if (opts.status) filter.status = opts.status;
    if (opts.role) filter.roles = opts.role;
    if (opts.q) {
      const rx = new RegExp(escapeRegex(opts.q), 'i');
      filter.$or = [{ email: rx }, { firstName: rx }, { lastName: rx }, { phone: rx }];
    }
    const rows = await UserModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<UserDoc[]>();
    return toPage(rows, limit);
  }

  async setStatus(
    userId: string,
    status: AccountStatus,
    opts: { reason?: string; by?: string } = {},
  ): Promise<void> {
    await UserModel.updateOne(
      { _id: userId },
      {
        status,
        statusReason: opts.reason,
        statusChangedAt: new Date(),
        statusChangedBy: opts.by,
        ...(status === 'closed' ? { closedAt: new Date() } : {}),
      },
    );
  }

  /**
   * Remove roles from an account. Used only by the admin-singleton enforcement
   * — there is deliberately no method to ADD a privileged role from anywhere in
   * the request path, so escalation has no code to travel through.
   */
  /** Replace a user's stored password hash — used to upgrade legacy hashes. */
  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await UserModel.updateOne({ _id: userId }, { passwordHash });
  }

  async pullRoles(userId: string, roles: string[]): Promise<void> {
    await UserModel.updateOne({ _id: userId }, { $pull: { roles: { $in: roles } } });
  }

  /** Every account holding any of these roles. */
  async findByAnyRole(roles: string[]): Promise<UserDoc[]> {
    return UserModel.find({ roles: { $in: roles }, deletedAt: null }).lean<UserDoc[]>();
  }

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return UserModel.countDocuments({ deletedAt: null, ...filter });
  }

  async countCreatedSince(date: Date): Promise<number> {
    return UserModel.countDocuments({ deletedAt: null, createdAt: { $gte: date } });
  }

  /** Signups per calendar day, gap-filled so a quiet day still plots as zero. */
  async dailySignups(days = 30): Promise<{ day: string; signups: number }[]> {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await UserModel.aggregate<{ _id: string; signups: number }>([
      { $match: { deletedAt: null, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, signups: { $sum: 1 } } },
    ]).exec();

    const found = new Map(rows.map((r) => [r._id, r.signups]));
    const series: { day: string; signups: number }[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      series.push({ day, signups: found.get(day) ?? 0 });
    }
    return series;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const userRepository = new UserRepository();
