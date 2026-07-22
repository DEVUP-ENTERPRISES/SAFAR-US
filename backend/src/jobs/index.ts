import { makeQueue, makeWorker } from '../infrastructure/queue/bullmq.client';
import { logger } from '../infrastructure/logging/logger';
import { bookingService } from '../modules/bookings/application/booking.service';
import { payoutService } from '../modules/payouts/application/payout.service';
import { depositService } from '../modules/payments/application/deposit.service';

const QUEUE = 'cato-maintenance';

/**
 * Async work plane. Cron-like repeatable jobs fan out platform maintenance:
 *   - expire-bookings  every 5 min  → release holds/funds for un-actioned requests
 *   - run-payouts      every hour    → pay hosts whose hold window elapsed
 *   - trip-reminders   every hour    → notify guests of imminent trips
 *   - release-deposits every 30 min  → free holds whose inspection window closed
 * These run here in dev; in prod they run in a dedicated worker process
 * (same code, started via PM2) so the API tier stays latency-focused.
 */
export async function initJobs(): Promise<void> {
  const queue = makeQueue(QUEUE);

  // Register repeatable jobs (idempotent — BullMQ dedups by repeat key).
  await queue.add('expire-bookings', {}, { repeat: { every: 5 * 60_000 }, jobId: 'expire-bookings' });
  await queue.add('run-payouts', {}, { repeat: { every: 60 * 60_000 }, jobId: 'run-payouts' });
  await queue.add('trip-reminders', {}, { repeat: { every: 60 * 60_000 }, jobId: 'trip-reminders' });
  await queue.add('release-deposits', {}, { repeat: { every: 30 * 60_000 }, jobId: 'release-deposits' });

  makeWorker(QUEUE, async (job) => {
    switch (job.name) {
      case 'expire-bookings': {
        const n = await bookingService.expirePending();
        if (n) logger.info({ n }, 'expired pending bookings');
        return { expired: n };
      }
      case 'run-payouts': {
        const r = await payoutService.runAllDue();
        if (r.paid) logger.info(r, 'payout run complete');
        return r;
      }
      case 'release-deposits': {
        const n = await depositService.releaseDue();
        if (n) logger.info({ n }, 'security deposits released');
        return { released: n };
      }
      case 'trip-reminders': {
        const n = await bookingService.remindUpcoming();
        if (n) logger.info({ n }, 'trip reminders sent');
        return { reminded: n };
      }
      default:
        return null;
    }
  });

  logger.info('✅ Background jobs (BullMQ) scheduler + worker started');
}
