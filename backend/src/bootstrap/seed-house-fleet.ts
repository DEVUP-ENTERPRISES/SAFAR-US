import { hashPassword } from '../modules/auth/application/password';
import { config } from '../config';
import { logger } from '../infrastructure/logging/logger';
import { UserModel } from '../modules/users/infrastructure/user.model';
import { hostService } from '../modules/hosts/application/host.service';
import { VehicleModel } from '../modules/vehicles/infrastructure/vehicle.model';
import { ROLES } from '../shared/constants/rbac';

/**
 * Seeds the single House Fleet account: CatoDrive's own vehicles, one Host
 * record, no Stripe Connect (revenue stays in the platform's own balance).
 * Idempotent, same shape as seedAdmin. Password only set on creation.
 */
export async function seedHouseFleet(): Promise<void> {
  if (!config.houseFleet.enabled) {
    logger.warn('HOUSE_FLEET_EMAIL/PASSWORD not set — skipping house fleet seed');
    return;
  }
  const email = config.houseFleet.email!.toLowerCase();
  let user = await UserModel.findOne({ email }).lean();

  if (!user) {
    const passwordHash = await hashPassword(config.houseFleet.password!);
    const doc = await UserModel.create({
      email,
      passwordHash,
      firstName: config.houseFleet.name,
      emailVerified: true,
      status: 'active',
      // 'house_fleet' carries no permissions of its own (it's not in
      // ROLE_PERMISSIONS) — it's an identity tag so the frontend can tell this
      // one seeded account apart from an ordinary self-serve host, e.g. to skip
      // guest-renter onboarding an internal fleet account will never need.
      roles: [ROLES.HOST, 'house_fleet'],
    });
    user = doc.toObject();
    logger.info({ email }, '🚗 House Fleet account created');
  } else if (!user.roles.includes('house_fleet')) {
    // Self-heal an account seeded before this tag existed.
    await UserModel.updateOne({ _id: user._id }, { $addToSet: { roles: 'house_fleet' } });
    user.roles = [...user.roles, 'house_fleet'];
  }

  let host = await hostService.getByUserId(user._id);
  if (!host) {
    host = await hostService.onboard(user._id, config.houseFleet.name);
    logger.info({ hostId: host._id }, '🚗 House Fleet host onboarded');
  }
  if (host.verificationStatus !== 'verified') {
    await hostService.setVerification(host._id, 'verified');
  }
  // Every fleet car carries the CatoDrive Fleet badge, including ones added before the flag existed.
  await VehicleModel.updateMany({ hostId: host._id, fleetOwned: { $ne: true } }, { $set: { fleetOwned: true } });
}
