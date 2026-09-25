import { Router } from 'express';
import { z } from 'zod';
import { DocumentModel } from '../infrastructure/document.model';
import { recallHoldService } from '../../vehicles/application/recall-hold.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { resolveOwnedUpload } from '../../../infrastructure/storage/owned-upload';
import { NotFoundError } from '../../../core/errors/app-error';

const router = Router();

const createSchema = z.object({
  vehicleId: z.string().optional(),
  category: z.enum(['registration', 'insurance', 'pollution', 'fitness', 'kyc', 'claim', 'recall_receipt']),
  // A server-issued upload key (or the URL it produced); the stored URL is always derived from the key.
  url: z.string().max(2048).optional(),
  key: z.string().max(512).optional(),
  expiresAt: z.coerce.date().optional(),
});

router.post(
  '/',
  authenticate,
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const userId = req.principal!.userId;
    // Only the car's own host may attach documents to it; anyone could otherwise expire a rival's insurance.
    if (req.body.vehicleId) await vehicleService.assertOwnerById(userId, req.body.vehicleId);
    const upload = resolveOwnedUpload(req.body, userId, req.body.category);
    const doc = await DocumentModel.create({ ...req.body, ownerId: userId, ...upload });
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
    const doc = await DocumentModel.findOne({ _id: req.params.id });
    if (!doc) throw new NotFoundError('Document');
    doc.verification = { status: 'verified', verifiedAt: new Date() };
    await doc.save();

    // A verified repair receipt is what a recall hold is waiting on.
    if (doc.category === 'recall_receipt' && doc.vehicleId) {
      await recallHoldService.releaseIfHeld(doc.vehicleId);
    }
    sendSuccess(res, { verified: true });
  }),
);

export const documentsRoutes = router;
