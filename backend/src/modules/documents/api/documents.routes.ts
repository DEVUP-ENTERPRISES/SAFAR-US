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
    // Always scope to the caller's own documents. Previously a vehicleId in the
    // query dropped the owner filter, so anyone could read another host's
    // registration/insurance/KYC docs by passing a (public) vehicle id — an IDOR
    // exposing private legal and identity records.
    const filter: Record<string, unknown> = { deletedAt: null, ownerId: req.principal!.userId };
    if (req.query.vehicleId) filter.vehicleId = String(req.query.vehicleId);
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
