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

  async setStatus(userId: string, status: 'active' | 'suspended' | 'banned'): Promise<void> {
    await UserModel.updateOne({ _id: userId }, { status });
  }

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return UserModel.countDocuments({ deletedAt: null, ...filter });
  }

  async countCreatedSince(date: Date): Promise<number> {
    return UserModel.countDocuments({ deletedAt: null, createdAt: { $gte: date } });
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const userRepository = new UserRepository();
