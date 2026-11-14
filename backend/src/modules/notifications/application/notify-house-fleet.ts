import { UserModel } from '../../users/infrastructure/user.model';
import { HOUSE_FLEET_ROLE } from '../../../shared/constants/rbac';
import { notificationService } from './notification.service';
import { logger } from '../../../infrastructure/logging/logger';
import { config } from '../../../config';

/** Alerts everyone on the operations team; a failed alert is logged and never blocks the action that raised it. */
export async function notifyHouseFleet(n: { templateKey: string; title: string; body: string; path?: string; data?: Record<string, unknown> }): Promise<void> {
  try {
    const team = await UserModel.find({ roles: HOUSE_FLEET_ROLE, status: 'active' }).select('_id').lean<{ _id: string }[]>();
    const deepLink = n.path && config.notifications.iocWebUrl ? `${config.notifications.iocWebUrl}${n.path}` : undefined;
    await Promise.all(team.map((u) => notificationService.send({
      userId: u._id, priority: 'high', templateKey: n.templateKey, title: n.title, body: n.body.slice(0, 160), data: n.data, ...(deepLink ? { deepLink } : {}),
    }).catch(() => undefined)));
  } catch (err) {
    logger.warn({ err, templateKey: n.templateKey }, 'operations team alert failed');
  }
}
