import argon2 from 'argon2';
import { config } from '../config';
import { logger } from '../infrastructure/logging/logger';
import { UserModel } from '../modules/users/infrastructure/user.model';
import { ROLES } from '../shared/constants/rbac';

/**
 * Ensures the main super-admin (from ADMIN_EMAIL/ADMIN_PASSWORD) exists on boot.
 * Idempotent: creates the account if missing, always guarantees the
 * super_admin role and an active status. Password is only set on creation
 * (so an admin who later changes it isn't reset every restart).
 */
export async function seedAdmin(): Promise<void> {
  if (!config.admin.enabled) {
    logger.warn('ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin seed');
    return;
  }
  const email = config.admin.email!.toLowerCase();
  const existing = await UserModel.findOne({ email }).lean();

  if (!existing) {
    const passwordHash = await argon2.hash(config.admin.password!, { type: argon2.argon2id });
    const [firstName, ...rest] = config.admin.name.split(' ');
    await UserModel.create({
      email,
      passwordHash,
      firstName,
      lastName: rest.join(' ') || undefined,
      emailVerified: true,
      status: 'active',
      roles: [ROLES.SUPER_ADMIN],
    });
    logger.info({ email }, '👑 Main admin created (super_admin)');
  } else {
    await UserModel.updateOne(
      { _id: existing._id },
      { $addToSet: { roles: ROLES.SUPER_ADMIN }, $set: { status: 'active' } },
    );
    logger.info({ email }, '👑 Main admin verified (super_admin ensured)');
  }
}
