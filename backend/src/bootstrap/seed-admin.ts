import { hashPassword } from '../modules/auth/application/password';
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
    const passwordHash = await hashPassword(config.admin.password!);
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


/**
 * Guarantees exactly ONE super_admin: the account from the environment.
 *
 * The seed grants super_admin to the .env admin. This is the other half —
 * it revokes super_admin from anyone else who somehow holds it. "Somehow" is
 * the point: there is no API that grants the role, so any other holder came
 * from a manual database edit, a restored backup, a migration, or a future
 * bug. Whatever the cause, an unexpected super_admin is a full compromise, so
 * it is stripped and logged as a security event rather than trusted.
 *
 * Runs at boot after seedAdmin, and requireAdmin repeats the check per request
 * for anything that appears while the process is live.
 */
export async function enforceSingleSuperAdmin(): Promise<void> {
  if (!config.admin.enabled) return;
  const envEmail = config.admin.email!.toLowerCase();

  const holders = await UserModel.find({ roles: ROLES.SUPER_ADMIN, deletedAt: null })
    .select('email roles')
    .lean<{ _id: string; email: string }[]>();

  const rogue = holders.filter((u) => u.email.toLowerCase() !== envEmail);
  if (rogue.length === 0) {
    logger.info({ superAdmins: holders.length }, 'super_admin singleton verified');
    return;
  }

  logger.error(
    { count: rogue.length, emails: rogue.map((u) => u.email) },
    'SECURITY: super_admin held by non-env account(s) — revoking',
  );
  await UserModel.updateMany(
    { _id: { $in: rogue.map((u) => u._id) } },
    { $pull: { roles: ROLES.SUPER_ADMIN } },
  );
}
