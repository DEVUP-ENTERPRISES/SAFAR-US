import { Router } from 'express';
import { z } from 'zod';
import { storageGateway } from '../../../infrastructure/storage/mock.storage';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

const uploadUrlSchema = z.object({
  category: z.enum(['vehicle_photo', 'registration', 'insurance', 'kyc', 'claim']),
  contentType: z.string().default('image/jpeg'),
  count: z.number().int().min(1).max(20).default(1),
});

/**
 * Returns presigned upload targets. The client PUTs bytes directly to
 * `uploadUrl` (keeping large files off the API), then persists `publicUrl`.
 */
router.post(
  '/upload-urls',
  authenticate,
  validate({ body: uploadUrlSchema }),
  asyncHandler(async (req, res) => {
    const targets = await storageGateway.createUploadTargets({
      ownerId: req.principal!.userId,
      category: req.body.category,
      contentType: req.body.contentType,
      count: req.body.count,
    });
    sendSuccess(res, targets);
  }),
);

export const mediaRoutes = router;
