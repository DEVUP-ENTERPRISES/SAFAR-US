import { Router } from 'express';
import { z } from 'zod';
import { notificationService } from '../application/notification.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await notificationService.listForUser(req.principal!.userId));
  }),
);

router.post(
  '/read',
  authenticate,
  validate({ body: z.object({ ids: z.array(z.string()).min(1) }) }),
  asyncHandler(async (req, res) => {
    await notificationService.markRead(req.principal!.userId, req.body.ids);
    sendSuccess(res, { updated: true });
  }),
);

/**
 * Send yourself a test message on every configured channel.
 *
 * Staff only, and it always targets the caller's own account — so it can never
 * be used to mail or text an arbitrary address. Exists so credentials can be
 * proven the moment they are set, rather than discovered to be wrong by a host
 * who never heard about a booking.
 */
router.post(
  '/test',
  authenticate,
  authorize('platform:manage'),
  asyncHandler(async (req, res) => {
    const sent = await notificationService.send({
      userId: req.principal!.userId,
      priority: 'critical', // forces the full fan-out: push, SMS and email
      templateKey: 'system.test',
      title: 'CATO test notification',
      body: 'If you are reading this, the channel it arrived on is configured correctly.',
      deepLink: '/account',
    });

    // Poll rather than sleep a fixed amount: an SMTP handshake can take
    // several seconds, and a fixed wait reported email as "missing" when it
    // had in fact been sent a moment later.
    const expected = ['push', 'sms', 'email'];
    const deadline = Date.now() + 15_000;
    let log = await notificationService.deliveryLog(sent._id);
    while (Date.now() < deadline && (log?.attempts?.length ?? 0) < expected.length) {
      await new Promise((r) => setTimeout(r, 400));
      log = await notificationService.deliveryLog(sent._id);
    }

    sendSuccess(res, {
      notificationId: sent._id,
      channels: (log?.attempts ?? []).map((a) => ({
        channel: a.channel,
        delivered: a.ok,
        error: a.error ?? null,
      })),
    });
  }),
);

export const notificationsRoutes = router;
