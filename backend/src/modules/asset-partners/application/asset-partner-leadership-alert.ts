import { channelProviders } from '../../notifications/infrastructure/channel.providers';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { logger } from '../../../infrastructure/logging/logger';
import { config } from '../../../config';

/** A page in the operations panel, or nothing when its address isn't configured. */
export const opsLink = (path: string): string | undefined => (config.notifications.iocWebUrl ? `${config.notifications.iocWebUrl}${path}` : undefined);

/** Emails the leadership list set in admin (e.g. CEO, CMO) about a partner milestone; a failure is logged, never raised. */
export async function alertLeadership(title: string, lines: string[], link?: string): Promise<void> {
  try {
    const to = (await platformConfigService.get()).assetPartner.onboardingAlertEmails ?? [];
    if (!to.length) return;
    const body = lines.filter(Boolean).join('\n');
    await Promise.all(
      to.map(async (email) => {
        const res = await channelProviders.email.send({ target: { userId: '', email }, templateKey: 'asset_partner.leadership_alert', title, body, deepLink: link, actionLabel: link ? 'Open in the operations panel' : undefined });
        if (!res.ok) logger.warn({ email, error: res.error }, 'leadership alert not delivered');
      }),
    );
  } catch (err) {
    logger.warn({ err, title }, 'leadership alert failed');
  }
}
