import { randomInt } from 'crypto';
import { UserModel } from '../../users/infrastructure/user.model';
import { userRepository } from '../../users/infrastructure/user.repository';
import { hashPassword } from '../../auth/application/password';
import { sessionStore } from '../../auth/infrastructure/session.store';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { ROLES } from '../../../shared/constants/rbac';

/** The only roles a super admin can hand out; super_admin is never grantable, it belongs to the .env account alone. */
export const GRANTABLE_STAFF_ROLES = [ROLES.SUPPORT, ROLES.MODERATOR, ROLES.FINANCE, ROLES.OPS] as const;
export type StaffRole = (typeof GRANTABLE_STAFF_ROLES)[number];

// No look-alike characters (0/O, 1/l/I) so a password read off a screen is typed correctly.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const STAFF_EMAIL_DOMAIN = 'staff.catodrive.com';

const generatePassword = (length = 16): string =>
  Array.from({ length }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join('');

const slug = (s: string): string => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 24) || 'staff';

interface StaffRow {
  _id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
  status: string;
  createdAt?: Date;
}

export class StaffService {
  async list(): Promise<StaffRow[]> {
    return UserModel.find({ roles: { $in: [ROLES.SUPER_ADMIN, ...GRANTABLE_STAFF_ROLES] }, deletedAt: null })
      .select('email firstName lastName roles status createdAt')
      .sort({ createdAt: 1 })
      .lean<StaffRow[]>();
  }

  /** A new staff login with a generated username (email-style) and password, returned once and never stored in plain text. */
  async create(input: { name: string; role: StaffRole; email?: string }): Promise<{ id: string; username: string; password: string; role: StaffRole }> {
    const username = input.email?.trim().toLowerCase() || (await this.freeUsername(input.name));
    if (input.email && (await userRepository.existsByEmail(username))) throw new ConflictError('That email already has an account', 'EMAIL_TAKEN');

    const password = generatePassword();
    const [firstName, ...rest] = input.name.trim().split(/\s+/);
    const user = await userRepository.create({
      email: username,
      passwordHash: await hashPassword(password),
      firstName,
      lastName: rest.join(' ') || undefined,
      roles: [input.role],
      status: 'active',
      emailVerified: true,
    });
    return { id: user._id, username, password, role: input.role };
  }

  async setRole(id: string, role: StaffRole): Promise<void> {
    await this.mustBeManageable(id);
    await UserModel.updateOne({ _id: id }, { $set: { roles: [role] } });
    // Old sessions carry the old role in their token until refreshed.
    await sessionStore.revokeAllForUser(id);
  }

  /** A fresh password, shown once; every open session of that person ends. */
  async resetPassword(id: string): Promise<{ username: string; password: string }> {
    const user = await this.mustBeManageable(id);
    const password = generatePassword();
    await userRepository.updatePasswordHash(id, await hashPassword(password));
    await sessionStore.revokeAllForUser(id);
    return { username: user.email ?? '', password };
  }

  /** Suspending also ends their sessions (setStatus revokes them). */
  async setActive(id: string, active: boolean, by: string): Promise<void> {
    await this.mustBeManageable(id);
    await userRepository.setStatus(id, active ? 'active' : 'suspended', { by, reason: active ? 'Staff reactivated' : 'Staff suspended by admin' });
  }

  private async mustBeManageable(id: string): Promise<{ email?: string }> {
    const user = await userRepository.findById(id);
    if (!user) throw new NotFoundError('Staff member');
    if (user.roles.includes(ROLES.SUPER_ADMIN)) throw new ValidationError('The main admin account cannot be changed here');
    if (!user.roles.some((r) => (GRANTABLE_STAFF_ROLES as readonly string[]).includes(r))) throw new ValidationError('That account is not a staff member');
    return user;
  }

  private async freeUsername(name: string): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const candidate = `${slug(name)}.${randomInt(1000, 10000)}@${STAFF_EMAIL_DOMAIN}`;
      if (!(await userRepository.existsByEmail(candidate))) return candidate;
    }
    throw new ConflictError('Could not generate a free username, try again', 'USERNAME_EXHAUSTED');
  }
}

export const staffService = new StaffService();
