import { UserModel, type UserDoc } from './user.model';

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
    if (withSecret) q.select('+passwordHash');
    return q.lean<UserDoc>().exec();
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await UserModel.countDocuments({
      email: email.toLowerCase(),
      deletedAt: null,
    }).exec();
    return count > 0;
  }
}

export const userRepository = new UserRepository();
