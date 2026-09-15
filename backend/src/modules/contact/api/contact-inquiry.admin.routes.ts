import { Router } from 'express';
import { z } from 'zod';
import { contactInquiryService } from '../application/contact-inquiry.service';
import { respondContactInquirySchema } from '../dto/contact-inquiry.schemas';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/contact-inquiries',
  authorize('admin:read'),
  validate({
    query: z.object({
      status: z.enum(['new', 'responded']).optional(),
      interest: z.enum(['asset_partner', 'investor', 'corporate', 'general', 'other']).optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
      skip: z.coerce.number().int().min(0).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await contactInquiryService.adminList(req.query as never);
    sendSuccess(res, result.items, 200, { total: result.total });
  }),
);

/** Per-category open counts, for the admin queue's filter tabs — so ops sees
 *  at a glance how many asset-partner vs. investor vs. corporate leads are
 *  waiting, not just one flat unread number. */
router.get(
  '/contact-inquiries/counts',
  authorize('admin:read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await contactInquiryService.countsByInterest());
  }),
);

router.get(
  '/contact-inquiries/:id',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await contactInquiryService.adminOne(req.params.id));
  }),
);

router.post(
  '/contact-inquiries/:id/respond',
  authorize('admin:read'),
  validate({ body: respondContactInquirySchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await contactInquiryService.markResponded(req.params.id, req.principal!.userId, req.body.notes));
  }),
);

export const contactInquiryAdminRoutes = router;
