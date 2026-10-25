import { Router } from 'express';
import { z } from 'zod';
import { assetPartnerApplicationService } from '../application/asset-partner-application.service';
import { assetPartnerService } from '../application/asset-partner.service';
import { assetPartnerPortalService } from '../application/asset-partner-portal.service';
import { assetPartnerMaintenanceService } from '../application/asset-partner-maintenance.service';
import { assetPartnerAgreementService } from '../application/asset-partner-agreement.service';
import { assetPartnerIntakeService } from '../application/asset-partner-intake.service';
import { createApplicationSchema, portalApplicationSchema, signAgreementSchema } from '../dto/asset-partner-application.schemas';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate, authenticateOptional } from '../../../shared/middleware/authenticate';
import { authLimiter, lookupLimiter } from '../../../shared/middleware/auth-rate-limit';
import { assetPartnerEnvelopeService } from '../application/asset-partner-envelope.service';
import { assetPartnerAmendmentService } from '../application/asset-partner-amendment.service';
import { assetPartnerTermsService } from '../application/asset-partner-terms.service';
import { ENVELOPE_ID_PATTERN } from '../domain/envelope-id';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';
import { ForbiddenError } from '../../../core/errors/app-error';
import { notificationService } from '../../notifications/application/notification.service';

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
    void notificationService
      .send({
        userId: partner.userId,
        priority: 'normal',
        deepLink: '/asset-partners/documents',
        templateKey: 'account.asset_partner_signed',
        title: 'Your signed agreement and NDA',
        body: 'Thanks for signing. Your copies are on the Documents page of your partner portal whenever you need them.',
        data: { partnerId: partner._id },
      })
      .catch(() => undefined);
    sendSuccess(res, { agreement: signed.agreement, nda: signed.nda });
  }),
);

/** Intake reports CatoDrive recorded for the partner's cars. */
router.get(
  '/asset-partners/me/intakes',
  authenticate,
  asyncHandler(async (req, res) => {
    const partner = await assetPartnerService.getByUserId(req.principal!.userId);
    sendSuccess(res, partner ? await assetPartnerIntakeService.list(partner._id) : []);
  }),
);

/** The partner agrees with an intake report, or objects to it in writing. */
router.post(
  '/asset-partners/me/intakes/:id/respond',
  authenticate,
  validate({
    body: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('acknowledged'), signedName: z.string().trim().min(2).max(120) }),
      z.object({ kind: z.literal('objected'), objection: z.string().trim().min(10).max(2000) }),
    ]),
  }),
  asyncHandler(async (req, res) => {
    const partner = await assetPartnerService.getByUserId(req.principal!.userId);
    if (!partner) throw new ForbiddenError('Not an Asset Partner');
    sendSuccess(res, await assetPartnerIntakeService.respond(partner, req.params.id, req.body, req.ip));
  }),
);

router.get(
  '/asset-partners/me/intakes/:id/pdf',
  authenticate,
  asyncHandler(async (req, res) => {
    const partner = await assetPartnerService.getByUserId(req.principal!.userId);
    if (!partner) throw new ForbiddenError('Not an Asset Partner');
    const { pdf, filename } = await assetPartnerIntakeService.pdf(partner._id, req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  }),
);

/** The partner's own signed copy, as a PDF. */
router.get(
  '/asset-partners/me/signed/:kind',
  authenticate,
  validate({ params: z.object({ kind: z.enum(['agreement', 'nda']) }) }),
  asyncHandler(async (req, res) => {
    const partner = await assetPartnerService.getByUserId(req.principal!.userId);
    if (!partner) throw new ForbiddenError('Not an Asset Partner');
    const { pdf, filename } = await assetPartnerAgreementService.signedPdf(partner, req.params.kind as 'agreement' | 'nda');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  }),
);

const partnerOf = async (userId: string) => {
  const partner = await assetPartnerService.getByUserId(userId);
  if (!partner) throw new ForbiddenError('Not an Asset Partner');
  return partner;
};
const ctxOf = (req: { ip?: string; header(name: string): string | undefined }) => ({ ip: req.ip, userAgent: req.header('user-agent') });
const sendPdf = (res: import('express').Response, pdf: Buffer, filename: string) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
};

/** Steps the signer takes before signing (opened, read each document to the end, agreed): the audit trail. */
router.post(
  '/asset-partners/me/signing-events',
  authenticate,
  validate({
    body: z.object({
      purpose: z.enum(['onboarding', 'amendment']),
      type: z.enum(['opened', 'read_agreement', 'read_nda', 'read_amendment', 'consented']),
    }),
  }),
  asyncHandler(async (req, res) => {
    const partner = await partnerOf(req.principal!.userId);
    const termsVersionId = req.body.purpose === 'amendment' ? (await assetPartnerTermsService.pending(partner._id))?._id : undefined;
    if (req.body.purpose === 'amendment' && !termsVersionId) {
      sendSuccess(res, { recorded: false });
      return;
    }
    await assetPartnerEnvelopeService.recordEvent(partner._id, req.body.purpose, req.body.type, ctxOf(req), { termsVersionId });
    sendSuccess(res, { recorded: true });
  }),
);

/** Every completed signing for this partner: envelope IDs, documents and history. */
router.get(
  '/asset-partners/me/envelopes',
  authenticate,
  asyncHandler(async (req, res) => {
    const partner = await partnerOf(req.principal!.userId);
    sendSuccess(res, await assetPartnerEnvelopeService.list(partner._id));
  }),
);

router.get(
  '/asset-partners/me/signed-documents/:documentId',
  authenticate,
  validate({ params: z.object({ documentId: z.string().regex(/^CD-DOC-[A-Z0-9]{4}-[A-Z0-9]{4}$/) }) }),
  asyncHandler(async (req, res) => {
    const partner = await partnerOf(req.principal!.userId);
    const { pdf, filename } = await assetPartnerEnvelopeService.pdf(req.params.documentId, partner._id);
    sendPdf(res, pdf, filename);
  }),
);

/** A change to the partner's terms waiting for their signature, as they will read it. */
router.get(
  '/asset-partners/me/amendment',
  authenticate,
  asyncHandler(async (req, res) => {
    const partner = await partnerOf(req.principal!.userId);
    sendSuccess(res, await assetPartnerAmendmentService.forPartner(partner));
  }),
);

router.post(
  '/asset-partners/me/amendment/sign',
  authenticate,
  validate({ body: z.object({ versionId: z.string().min(1), signedName: z.string().trim().min(2).max(120), templateVersion: z.number().int().min(0) }) }),
  asyncHandler(async (req, res) => {
    const partner = await partnerOf(req.principal!.userId);
    sendSuccess(res, await assetPartnerAmendmentService.sign(partner, req.body, ctxOf(req)));
  }),
);

router.post(
  '/asset-partners/me/amendment/decline',
  authenticate,
  asyncHandler(async (req, res) => {
    const partner = await partnerOf(req.principal!.userId);
    await assetPartnerAmendmentService.decline(partner, ctxOf(req));
    sendSuccess(res, { declined: true });
  }),
);

/** Public: is this envelope genuine? Answers with initials and dates only. */
router.get(
  '/agreements/verify/:envelopeId',
  lookupLimiter,
  validate({ params: z.object({ envelopeId: z.string().trim().toUpperCase().regex(ENVELOPE_ID_PATTERN) }) }),
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    sendSuccess(res, await assetPartnerEnvelopeService.verify(req.params.envelopeId));
  }),
);

/** Public: does this file's fingerprint (computed in the visitor's browser) match a sealed document? */
router.get(
  '/agreements/verify-file/:sha256',
  lookupLimiter,
  validate({ params: z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/) }) }),
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    sendSuccess(res, await assetPartnerEnvelopeService.verifyFile(req.params.sha256));
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
