import { Router } from 'express';
import { z } from 'zod';
import { notificationService } from '../application/notification.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
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

export const notificationsRoutes = router;
