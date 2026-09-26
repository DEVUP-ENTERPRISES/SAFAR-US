import { PlatformConfigModel } from '../modules/platform-config/infrastructure/platform-config.model';
import { platformConfigService } from '../modules/platform-config/application/platform-config.service';
import { DEFAULT_BOOKING_QUOTES } from '../modules/platform-config/application/booking-quotes';
import { logger } from '../infrastructure/logging/logger';

/** Saves the starter calendar messages into the platform config once, so admins see and edit them; never overwrites their own. */
export async function seedBookingQuotes(): Promise<void> {
  const stored = await PlatformConfigModel.exists({ _id: 'platform', 'content.bookingQuotes.0': { $exists: true } });
  if (stored) return;
  await platformConfigService.update({ content: { bookingQuotes: DEFAULT_BOOKING_QUOTES } }, 'system', 'Seed default booking calendar messages');
  logger.info('default booking calendar messages saved');
}
