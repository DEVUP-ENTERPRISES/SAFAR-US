import { Router } from 'express';
import { z } from 'zod';
import { DocumentModel } from '../infrastructure/document.model';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';
import { NotFoundError } from '../../../core/errors/app-error';

const router = Router();

const createSchema = z.object({
  vehicleId: z.string().optional(),
  category: z.enum(['registration', 'insurance', 'pollution', 'fitness', 'kyc', 'claim']),
  url: z.string().url(),
  key: z.string().optional(),
  expiresAt: z.coerce.date().optional(),
});

router.post(
  '/',
  authenticate,
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const doc = await DocumentModel.create({ ownerId: req.principal!.userId, ...req.body });
    sendCreated(res, doc.toObject());
  }),
);

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (req.query.vehicleId) filter.vehicleId = req.query.vehicleId;
    else filter.ownerId = req.principal!.userId;
    const docs = await DocumentModel.find(filter).sort({ createdAt: -1 }).lean();
    sendSuccess(res, docs);
  }),
);

// Ops verification
router.post(
  '/:id/verify',
  authenticate,
  authorize('vehicle:verify'),
  asyncHandler(async (req, res) => {
    const res2 = await DocumentModel.updateOne(
      { _id: req.params.id },
      { verification: { status: 'verified', verifiedAt: new Date() } },
    );
    if (res2.matchedCount === 0) throw new NotFoundError('Document');
    sendSuccess(res, { verified: true });
  }),
);

export const documentsRoutes = router;
