import { Router } from 'express';
import { z } from 'zod';
import { messageService } from '../application/message.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/unread-count',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await messageService.unreadCount(req.principal!.userId));
  }),
);

const sendSchema = z.object({
  body: z.string().max(2000).default(''),
  attachments: z
    .array(z.object({ url: z.string().url(), kind: z.enum(['image', 'file']), name: z.string().optional() }))
    .default([]),
});

router.get(
  '/:bookingId',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await messageService.list(req.principal!.userId, req.params.bookingId));
  }),
);

router.post(
  '/:bookingId',
  authenticate,
  validate({ body: sendSchema }),
  asyncHandler(async (req, res) => {
    const msg = await messageService.send(
      req.principal!.userId,
      req.params.bookingId,
      req.body.body,
      req.body.attachments,
    );
    sendCreated(res, msg);
  }),
);

router.post(
  '/:bookingId/read',
  authenticate,
  asyncHandler(async (req, res) => {
    await messageService.markRead(req.principal!.userId, req.params.bookingId);
    sendSuccess(res, { read: true });
  }),
);


export const messagesRoutes = router;
