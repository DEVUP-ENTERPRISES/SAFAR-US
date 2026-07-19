import { Router } from 'express';
import { z } from 'zod';
import { kycService } from '../application/kyc.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

const router = Router();

const submitSchema = z.object({
  level: z.enum(['basic', 'full']).optional(),
  documents: z
    .array(
      z.object({
        type: z.enum(['license', 'passport', 'national_id', 'selfie']),
        url: z.string().url(),
      }),
    )
    .min(1),
});

router.post(
  '/submit',
  authenticate,
  validate({ body: submitSchema }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await kycService.submit(req.principal!.userId, req.body));
  }),
);

router.get(
  '/status',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await kycService.getStatus(req.principal!.userId));
  }),
);

export const kycRoutes = router;
