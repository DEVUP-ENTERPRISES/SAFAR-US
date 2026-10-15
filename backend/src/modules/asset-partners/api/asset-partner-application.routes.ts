import { Router } from 'express';
import { z } from 'zod';
import { assetPartnerApplicationService } from '../application/asset-partner-application.service';
import { assetPartnerService } from '../application/asset-partner.service';
import { assetPartnerPortalService } from '../application/asset-partner-portal.service';
import { assetPartnerMaintenanceService } from '../application/asset-partner-maintenance.service';
import { assetPartnerAgreementService } from '../application/asset-partner-agreement.service';
import { createApplicationSchema, portalApplicationSchema, signAgreementSchema } from '../dto/asset-partner-application.schemas';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate, authenticateOptional } from '../../../shared/middleware/authenticate';
import { authLimiter } from '../../../shared/middleware/auth-rate-limit';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';
import { ForbiddenError } from '../../../core/errors/app-error';

const router = Router();

// A partner who has not signed the agreement or added payout details can't open the dashboard's data yet.
const requirePartnerReady = asyncHandler(async (req, _res, next) => {
  const partner = await assetPartnerService.getByUserId(req.principal!.userId);
  if (partner) await assetPartnerService.requirePortalReady(req.principal!.userId);
  next();
});

/** Fills the car's details from its VIN and says whether that car is already with CatoDrive. */
router.get(
  '/asset-partners/vin/:vin',
  authenticate,
  authLimiter,
  validate({ params: z.object({ vin: z.string().trim().regex(/^[A-HJ-NPR-Z0-9]{17}$/i, 'Enter the 17-character VIN') }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerApplicationService.lookupVin(req.params.vin));
  }),
);

/** Which getting-started step the signed-in account is on. */
router.get(
  '/asset-partners/onboarding',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerApplicationService.onboarding(req.principal!.userId));
  }),
);

/** Apply from the partner portal: as a new partner, or with another car once in the programme. */
router.post(
  '/asset-partners/me/applications',
  authenticate,
  authLimiter,
  validate({ body: portalApplicationSchema }),
  asyncHandler(async (req, res) => {
    const app = await assetPartnerApplicationService.createForAccount(req.principal!.userId, req.body, {
      ip: req.ip,
      userAgent: req.header('user-agent'),
    });
    sendCreated(res, app);
  }),
);

router.patch(
  '/asset-partners/me/applications/:id',
  authenticate,
  validate({ body: portalApplicationSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerApplicationService.resubmit(req.principal!.userId, req.params.id, req.body));
  }),
);

router.post(
  '/asset-partners/me/agreement',
  authenticate,
  validate({ body: signAgreementSchema }),
  asyncHandler(async (req, res) => {
    const partner = await assetPartnerService.getByUserId(req.principal!.userId);
    if (!partner) throw new ForbiddenError('Not an Asset Partner');
    const signed = await assetPartnerAgreementService.sign(partner, req.body, { ip: req.ip, userAgent: req.header('user-agent') });
    sendSuccess(res, { agreement: signed.agreement });
  }),
);

/**
 * The Asset Partner intake form submission. No login required — the form
 * never asks for a password — but authenticateOptional attaches a principal
 * when the applicant happens to be signed in, so the lead can be linked back
 * to their account. Rate-limited (shares the auth limiter) since it's an
 * unauthenticated write surface.
 */
router.post(
  '/asset-partner-applications',
  authLimiter,
  authenticateOptional,
  validate({ body: createApplicationSchema }),
  asyncHandler(async (req, res) => {
    const app = await assetPartnerApplicationService.create(req.body, {
      userId: req.principal?.userId,
      ip: req.ip,
      userAgent: req.header('user-agent'),
    });
    sendCreated(res, { reference: app.reference, status: app.status });
  }),
);

/**
 * The partner's own dashboard: their applications and, once they hold a host
 * account, what their cars are earning.
 *
 * Before this, an applicant got a reference number on submit and then had no
 * way to ever see the application again — the only view of it was the admin
 * queue. Signed in, because it returns their own personal and earnings data.
 */
router.get(
  '/asset-partners/dashboard',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerApplicationService.dashboardFor(req.principal!.userId));
  }),
);

/**
 * The partner's own membership record, payout details included.
 *
 * dashboardFor deliberately omits payoutDetails — it is a summary for the
 * front page, not the source of truth for a settings form. Without a route
 * that returns the SAVED value, the profile page's payout form could only
 * ever start blank, and a partner resubmitting it without retyping would
 * silently overwrite a good mailing address with nothing.
 */
router.get(
  '/asset-partners/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const partner = await assetPartnerService.getByUserId(req.principal!.userId);
    if (!partner) {
      sendSuccess(res, null);
      return;
    }
    const terms = await assetPartnerService.termsFor(partner);
    sendSuccess(res, { partner, terms });
  }),
);

/**
 * The rest of the partner portal — vehicles as their own surface, one car's
 * own history, and the full statement archive. All 404 (via requirePartner in
 * the service) rather than returning empty data for someone not enrolled, so
 * the frontend can tell "no vehicles yet" from "you aren't a partner".
 */
router.get(
  '/asset-partners/vehicles',
  authenticate,
  requirePartnerReady,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerPortalService.vehicles(req.principal!.userId));
  }),
);

router.get(
  '/asset-partners/vehicles/:id',
  authenticate,
  requirePartnerReady,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerPortalService.vehicleDetail(req.principal!.userId, req.params.id));
  }),
);

router.get(
  '/asset-partners/statements',
  authenticate,
  requirePartnerReady,
  asyncHandler(async (req, res) => {
    const months = req.query.months ? Number(req.query.months) : 12;
    sendSuccess(res, await assetPartnerPortalService.statements(req.principal!.userId, months));
  }),
);

/**
 * Self-service payout recipient details. NOT terms — a partner may correct
 * their own mailing address or Zelle handle; only ops can change the
 * negotiated commercial terms (see the admin routes).
 */
router.patch(
  '/asset-partners/payout-details',
  authenticate,
  validate({
    body: z.object({
      mailingAddress: z.string().max(300).optional(),
      zelleHandle: z.string().max(120).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerService.setPayoutDetails(req.principal!.userId, req.body));
  }),
);

/**
 * Maintenance approvals. Ops schedules the work (see maintenance.routes.ts
 * for the SEPARATE host self-service flow — a different product); this is
 * only the partner's yes/no on anything over their agreed threshold.
 */
router.get(
  '/asset-partners/maintenance',
  authenticate,
  requirePartnerReady,
  asyncHandler(async (req, res) => {
    const partner = await assetPartnerService.getByUserId(req.principal!.userId);
    if (!partner) {
      sendSuccess(res, []);
      return;
    }
    sendSuccess(
      res,
      await assetPartnerMaintenanceService.listForPartner(partner, {
        approval: req.query.approval as never,
      }),
    );
  }),
);

router.post(
  '/asset-partners/maintenance/:id/approve',
  authenticate,
  requirePartnerReady,
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await assetPartnerMaintenanceService.approve(req.principal!.userId, req.params.id),
    );
  }),
);

router.post(
  '/asset-partners/maintenance/:id/decline',
  authenticate,
  requirePartnerReady,
  validate({ body: z.object({ reason: z.string().max(300).optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await assetPartnerMaintenanceService.decline(
        req.principal!.userId,
        req.params.id,
        req.body.reason,
      ),
    );
  }),
);

export const assetPartnerApplicationRoutes = router;
