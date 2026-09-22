import { hashPassword } from '../modules/auth/application/password';
import { config } from '../config';
import { logger } from '../infrastructure/logging/logger';
import { UserModel } from '../modules/users/infrastructure/user.model';
import { hostService } from '../modules/hosts/application/host.service';
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
      roles: [ROLES.HOST],
    });
    user = doc.toObject();
    logger.info({ email }, '🚗 House Fleet account created');
  }

  let host = await hostService.getByUserId(user._id);
  if (!host) {
    host = await hostService.onboard(user._id, config.houseFleet.name);
    logger.info({ hostId: host._id }, '🚗 House Fleet host onboarded');
  }
  if (host.verificationStatus !== 'verified') {
    await hostService.setVerification(host._id, 'verified');
  }
}
