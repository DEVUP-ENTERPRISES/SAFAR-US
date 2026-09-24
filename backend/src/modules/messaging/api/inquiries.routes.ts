import { Router } from 'express';
import { z } from 'zod';
import { inquiryService } from '../application/inquiry.service';
import { hostService } from '../../hosts/application/host.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

const router = Router();

const sendSchema = z.object({
  body: z.string().max(2000).default(''),
  attachments: z
    .array(z.object({ url: z.string().url(), kind: z.enum(['image', 'file']), name: z.string().optional() }))
    .default([]),
});

/** The caller's inbox — a host sees every guest inquiry across their fleet; anyone else sees their own threads. */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const host = await hostService.getByUserId(req.principal!.userId).catch(() => null);
    sendSuccess(res, host ? await inquiryService.hostInbox(req.principal!.userId) : await inquiryService.myThreads(req.principal!.userId));
  }),
);

router.get(
  '/unread-count',
  authenticate,
  asyncHandler(async (req, res) => {
    const host = await hostService.getByUserId(req.principal!.userId).catch(() => null);
    const count = host
      ? await inquiryService.unreadCountForHost(req.principal!.userId)
      : await inquiryService.unreadCountForGuest(req.principal!.userId);
    sendSuccess(res, { count });
  }),
);

/** A guest starting or continuing their own thread about a car. */
router.get(
  '/:vehicleId',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await inquiryService.list(req.principal!.userId, req.params.vehicleId, req.principal!.userId));
  }),
);

router.post(
  '/:vehicleId',
  authenticate,
  validate({ body: sendSchema }),
  asyncHandler(async (req, res) => {
    const msg = await inquiryService.send(req.principal!.userId, req.params.vehicleId, req.body.body, req.body.attachments);
    sendCreated(res, msg);
  }),
);

/** The host's side of a specific guest's thread. */
router.get(
  '/:vehicleId/:guestId',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await inquiryService.list(req.principal!.userId, req.params.vehicleId, req.params.guestId));
  }),
);

router.post(
  '/:vehicleId/:guestId',
  authenticate,
  validate({ body: sendSchema }),
  asyncHandler(async (req, res) => {
    const msg = await inquiryService.sendReply(
      req.principal!.userId,
      req.params.vehicleId,
      req.params.guestId,
      req.body.body,
      req.body.attachments,
    );
    sendCreated(res, msg);
  }),
);

router.post(
  '/:vehicleId/:guestId/read',
  authenticate,
  asyncHandler(async (req, res) => {
    await inquiryService.markRead(req.principal!.userId, req.params.vehicleId, req.params.guestId);
    sendSuccess(res, { read: true });
  }),
);

export const inquiriesRoutes = router;
