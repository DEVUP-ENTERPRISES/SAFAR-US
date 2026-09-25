import { inspectionService } from '../modules/trips/application/inspection.service';
import { makeQueue, makeWorker } from '../infrastructure/queue/bullmq.client';
import { webhookRetryService } from '../modules/payments/application/webhook-retry.service';
import { logger } from '../infrastructure/logging/logger';
import { bookingService } from '../modules/bookings/application/booking.service';
import { payoutService } from '../modules/payouts/application/payout.service';
import { depositService } from '../modules/payments/application/deposit.service';
import { paymentService } from '../modules/payments/application/payment.service';
import { kycService } from '../modules/kyc/application/kyc.service';
import { documentComplianceService } from '../modules/documents/application/document-compliance.service';
import { maintenanceService } from '../modules/maintenance/application/maintenance.service';
import { reviewService } from '../modules/reviews/application/review.service';
import { platformConfigService } from '../modules/platform-config/application/platform-config.service';
import { acquireJobLease } from './job-lease.model';

const QUEUE = 'cato-maintenance';
const MIN = 60_000;
/** How long a Stripe result gets to arrive by webhook before we go and ask Stripe ourselves. */
const WEBHOOK_GRACE_MS = 3 * MIN;

interface JobDef {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

/**
 * Async work plane, defined once. Cron-like jobs fan out platform maintenance:
 *   - expire-bookings  every 5 min  → release holds/funds for un-actioned requests
 *   - run-payouts      every hour   → pay hosts whose hold window elapsed
 *   - trip-reminders   every hour   → notify guests of imminent trips
 *   - release-deposits every 30 min → free holds whose inspection window closed
 *   - lifecycle-sweep  every 15 min → flag overdue returns and pickups nobody did
 *   - reconcile        every 5 min  → ask Stripe about payments and identity checks whose webhook never landed
 *   - retry-webhooks   every 5 min  → replay payment events whose handler failed
 *
 * Two runners share this table. BullMQ (Redis) is the normal one; if Redis is
 * unavailable at boot or the queue cannot start, an in-process timer runs the
 * same jobs, coordinated through a database lease so several instances never
 * run one twice. Nothing stops the platform's housekeeping.
 */
const JOBS: JobDef[] = [
  {
    name: 'expire-bookings',
    everyMs: 5 * MIN,
    run: async () => {
      const n = await bookingService.expirePending();
      if (n) logger.info({ n }, 'expired pending bookings');
      return { expired: n };
    },
  },
  {
    name: 'run-payouts',
    everyMs: 60 * MIN,
    run: async () => {
      const r = await payoutService.runAllDue();
      if (r.paid) logger.info(r, 'payout run complete');
      return r;
    },
  },
  {
    name: 'trip-reminders',
    everyMs: 60 * MIN,
    run: async () => {
      const n = await bookingService.remindUpcoming();
      const v = await bookingService.remindVerification();
      if (n || v) logger.info({ n, v }, 'trip reminders sent');
      return { reminded: n, verificationReminded: v };
    },
  },
  {
    name: 'release-deposits',
    everyMs: 30 * MIN,
    run: async () => {
      const n = await depositService.releaseDue();
      if (n) logger.info({ n }, 'security deposits released');
      return { released: n };
    },
  },
  {
    name: 'compliance-sweep',
    everyMs: 60 * MIN,
    // Warn before pausing: a host whose first notice is the car going offline cannot renew insurance in time to prevent it.
    run: async () => {
      const warned = await documentComplianceService.remindExpiring();
      const r = await documentComplianceService.sweep();
      if (r.paused || r.restored || warned.warned30 || warned.warned7) logger.info({ ...r, ...warned }, 'document compliance sweep');
      return { ...r, ...warned };
    },
  },
  {
    name: 'maintenance-reminders',
    everyMs: 6 * 60 * MIN,
    run: async () => ({ reminded: await maintenanceService.remindDue() }),
  },
  {
    // Blind window closed: publish reviews the other side never answered, so silence cannot bury criticism.
    name: 'release-reviews',
    everyMs: 60 * MIN,
    run: async () => ({ released: await reviewService.releaseExpired() }),
  },
  {
    name: 'lifecycle-sweep',
    everyMs: 15 * MIN,
    run: async () => {
      const r = { ...(await bookingService.sweepLifecycle()), returnWindowOpened: await inspectionService.sweepReturnWindow() };
      if (r.late || r.escalated || r.notStarted || r.returnWindowOpened) logger.info(r, 'lifecycle sweep');
      return r;
    },
  },
  {
    // A webhook can be missed or misconfigured; money and identity must not depend on it alone.
    name: 'reconcile',
    everyMs: 5 * MIN,
    run: async () => {
      const payments = await paymentService.reconcilePending(WEBHOOK_GRACE_MS);
      const identity = await kycService.syncStalePending(WEBHOOK_GRACE_MS);
      if (payments.succeeded || payments.authorized || payments.cancelled || identity) logger.warn({ payments, identity }, 'reconciled state a webhook had not delivered');
      return { payments, identity };
    },
  },
  {
    // A charge that Stripe confirmed but this side failed to record is money without a booking.
    name: 'retry-webhooks',
    everyMs: 5 * MIN,
    run: () => webhookRetryService.retryFailed(),
  },
  {
    // Promote any config change staged for a time that has now passed, through the normal versioned publish path.
    name: 'apply-scheduled-config',
    everyMs: 5 * MIN,
    run: async () => ({ applied: await platformConfigService.applyDueScheduled() }),
  },
];

const runByName = (name: string): Promise<unknown> => JOBS.find((j) => j.name === name)?.run() ?? Promise.resolve(null);

let queueRef: import('bullmq').Queue | null = null;
let workerRef: import('bullmq').Worker | null = null;
const timers: NodeJS.Timeout[] = [];

export async function initJobs(): Promise<void> {
  const queue = makeQueue(QUEUE);
  queueRef = queue;

  // Register repeatable jobs (idempotent — BullMQ dedups by repeat key).
  for (const j of JOBS) await queue.add(j.name, {}, { repeat: { every: j.everyMs }, jobId: j.name });

  workerRef = makeWorker(QUEUE, async (job) => runByName(job.name));

  logger.info('✅ Background jobs (BullMQ) scheduler + worker started');
}

/**
 * The same jobs on in-process timers, for when Redis or BullMQ is unavailable.
 * A lease in the database keeps several instances from running one job twice,
 * and one job failing never stops the others.
 */
export function startFallbackJobs(): void {
  if (timers.length) return;
  for (const j of JOBS) {
    const tick = async () => {
      try {
        if (await acquireJobLease(j.name, j.everyMs)) await j.run();
      } catch (err) {
        logger.error({ err: (err as Error).message, job: j.name }, 'fallback job failed');
      }
    };
    const t = setInterval(() => void tick(), j.everyMs);
    t.unref();
    timers.push(t);
    // First pass shortly after boot, so a restart never leaves work waiting a full interval.
    setTimeout(() => void tick(), 30_000).unref();
  }
  logger.warn('⚠️  Background jobs are running on the in-process fallback scheduler (Redis/BullMQ unavailable)');
}

/**
 * Stop background processing gracefully on shutdown.
 *
 * worker.close() waits for the job currently being processed to FINISH before
 * resolving — critical for the payout and payment jobs, which must never be
 * killed mid-transfer. New jobs stop being pulled immediately. Called before
 * Redis is disconnected, or BullMQ cannot record the outcome of the in-flight
 * job and it would be retried from scratch on the next boot.
 */
export async function closeJobs(): Promise<void> {
  for (const t of timers.splice(0)) clearInterval(t);
  await workerRef?.close();
  await queueRef?.close();
  workerRef = null;
  queueRef = null;
}
