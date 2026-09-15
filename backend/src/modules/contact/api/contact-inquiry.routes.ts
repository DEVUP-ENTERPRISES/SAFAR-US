import { Router } from 'express';
import { contactInquiryService } from '../application/contact-inquiry.service';
import { createContactInquirySchema } from '../dto/contact-inquiry.schemas';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticateOptional } from '../../../shared/middleware/authenticate';
import { authLimiter } from '../../../shared/middleware/auth-rate-limit';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated } from '../../../shared/http/api-response';

const router = Router();

/** Public contact form. No login required; rate-limited since it's an
 *  unauthenticated write surface. */
router.post(
  '/contact',
  authLimiter,
  authenticateOptional,
  validate({ body: createContactInquirySchema }),
  asyncHandler(async (req, res) => {
    const doc = await contactInquiryService.create(req.body, {
      userId: req.principal?.userId,
      ip: req.ip,
      userAgent: req.header('user-agent'),
    });
    sendCreated(res, { id: doc._id });
  }),
);

export const contactInquiryRoutes = router;
