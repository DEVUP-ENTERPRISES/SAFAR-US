import { Router } from 'express';
import { z } from 'zod';
import { assetPartnerApplicationAdminRoutes } from './asset-partner-application.admin.routes';
import { assetPartnerAdminRoutes } from './asset-partner.admin.routes';
import { assetPartnerAgreementService, AGREEMENT_PLACEHOLDERS } from '../application/asset-partner-agreement.service';
import { assetPartnerService, PARTNER_DOCS } from '../application/asset-partner.service';
import { assetPartnerCarService } from '../application/asset-partner-car.service';
import { assetPartnerPayoutService } from '../application/asset-partner-payout.service';
import { assetPartnerIntakeService } from '../application/asset-partner-intake.service';
import { assetPartnerPortfolioService } from '../application/asset-partner-portfolio.service';
import { assetPartnerMaintenanceService } from '../application/asset-partner-maintenance.service';
import { DocumentModel } from '../../documents/infrastructure/document.model';
import { AssetPartnerApplicationModel } from '../infrastructure/asset-partner-application.model';
import { assetPartnerEnvelopeService } from '../application/asset-partner-envelope.service';
import { assetPartnerTermsService } from '../application/asset-partner-terms.service';
import { assetPartnerAmendmentService } from '../application/asset-partner-amendment.service';
import type { SignatureEnvelopeDoc } from '../infrastructure/signature-envelope.model';
import { storageGateway } from '../../../infrastructure/storage/storage.provider';
import { assetPartnerExitService } from '../application/asset-partner-exit.service';
import { assetPartnerProfileService } from '../application/asset-partner-profile.service';
import { assetPartnerOfferService } from '../application/asset-partner-offer.service';
import { exitCarPatchSchema, exitSubmitSchema } from '../dto/asset-partner-application.schemas';
import { hostService } from '../../hosts/application/host.service';
import { HostStaffModel } from '../../hosts/infrastructure/host-staff.model';
import { AssetPartnerModel } from '../infrastructure/asset-partner.model';
import { notificationService } from '../../notifications/application/notification.service';
import { NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

const router = Router();

// The operations panel manages Asset Partners with the same endpoints the admin console has always used.
router.use(assetPartnerApplicationAdminRoutes);
router.use(assetPartnerAdminRoutes);

router.get(
  '/asset-partner-agreements',
  authorize('admin:read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await assetPartnerAgreementService.versions());
  }),
);

router.get(
  '/asset-partner-agreements/placeholders',
  authorize('admin:read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, AGREEMENT_PLACEHOLDERS);
  }),
);

/** Publishes a new version; partners who already signed keep the version they signed. */
router.post(
  '/asset-partner-agreements',
  authorize('host:manage'),
  validate({ body: z.object({ kind: z.enum(['agreement', 'nda', 'amendment']).default('agreement'), title: z.string().trim().min(3).max(160), body: z.string().trim().min(50).max(100_000) }) }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await assetPartnerAgreementService.publish(req.principal!.userId, req.body));
  }),
);

/** A partner's signed copy, for CatoDrive's records. */
router.get(
  '/asset-partners/:id/signed/:kind',
  authorize('admin:read'),
  validate({ params: z.object({ id: z.string(), kind: z.enum(['agreement', 'nda']) }) }),
  asyncHandler(async (req, res) => {
    const partner = await assetPartnerService.getById(req.params.id);
    const { pdf, filename } = await assetPartnerAgreementService.signedPdf(partner, req.params.kind as 'agreement' | 'nda');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  }),
);

/** Every sealed signing for a partner, with its history. */
router.get(
  '/asset-partners/:id/envelopes',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerEnvelopeService.list(req.params.id));
  }),
);

router.get(
  '/signed-documents/:documentId',
  authorize('admin:read'),
  validate({ params: z.object({ documentId: z.string().regex(/^CD-DOC-[A-Z0-9]{4}-[A-Z0-9]{4}$/) }) }),
  asyncHandler(async (req, res) => {
    const { pdf, filename } = await assetPartnerEnvelopeService.pdf(req.params.documentId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  }),
);

/** Send the partner their signed copies again. */
router.post(
  '/asset-partners/:id/envelopes/:envelopeId/resend',
  authorize('host:manage'),
  asyncHandler(async (req, res) => {
    const envelope = (await assetPartnerEnvelopeService.list(req.params.id)).find((e) => e.envelopeId === req.params.envelopeId);
    if (!envelope) throw new NotFoundError('Envelope');
    await assetPartnerEnvelopeService.sendCopy(envelope as unknown as SignatureEnvelopeDoc);
    sendSuccess(res, { sent: true });
  }),
);

/** Every version of a partner's terms, and the change waiting for their signature if any. */
router.get(
  '/asset-partners/:id/terms-history',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const [history, pending] = await Promise.all([assetPartnerTermsService.history(req.params.id), assetPartnerTermsService.pending(req.params.id)]);
    sendSuccess(res, { history, pending });
  }),
);

/** New terms for a partner who has signed: they take effect once the partner signs the amendment. */
router.post(
  '/asset-partners/:id/terms-change',
  authorize('host:manage'),
  validate({
    body: z.object({
      managementFeeBps: z.number().int().min(0).max(10_000).optional(),
      insuranceMonthlyCents: z.number().int().min(0).optional(),
      detailingMonthlyCents: z.number().int().min(0).optional(),
      deductibleCapCents: z.number().int().min(0).optional(),
      maintenanceApprovalCents: z.number().int().min(0).optional(),
      payoutDayOfMonth: z.number().int().min(1).max(28).optional(),
      requestedFrom: z.string().datetime({ offset: true }).optional(),
      reason: z.string().trim().max(500).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { requestedFrom, reason, ...patch } = req.body;
    sendCreated(
      res,
      await assetPartnerAmendmentService.request(req.params.id, patch, {
        requestedFrom: requestedFrom ? new Date(requestedFrom) : undefined,
        reason,
        actorId: req.principal!.userId,
      }),
    );
  }),
);

router.post(
  '/asset-partners/:id/terms-change/cancel',
  authorize('host:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerTermsService.close(req.params.id, 'cancelled', req.principal!.userId));
  }),
);

/** The partner's onboarding papers, with whether CatoDrive has checked each one. */
router.get(
  '/asset-partners/:id/documents',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const partner = await assetPartnerService.getById(req.params.id);
    const docs = await DocumentModel.find({ ownerId: partner.userId, category: { $in: PARTNER_DOCS.map((d) => d.category) }, deletedAt: null })
      .sort({ createdAt: -1 })
      .select('category verification createdAt')
      .lean();
    sendSuccess(res, { checklist: await assetPartnerService.documentChecklist(partner), documents: docs });
  }),
);

/** A short-lived link to open one of the partner's papers. */
router.get(
  '/asset-partners/:id/documents/:docId/view',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const doc = await partnerDocument(req.params.id, req.params.docId);
    sendSuccess(res, { url: doc.key ? await storageGateway.createDownloadUrl(doc.key) : doc.url });
  }),
);

/** Mark a paper as received and correct, or send it back with a reason for the partner. */
router.post(
  '/asset-partners/:id/documents/:docId/review',
  authorize('host:manage'),
  validate({ body: z.object({ decision: z.enum(['verified', 'rejected']), reason: z.string().trim().max(300).optional() }) }),
  asyncHandler(async (req, res) => {
    const doc = await partnerDocument(req.params.id, req.params.docId);
    if (req.body.decision === 'rejected' && !req.body.reason) throw new ValidationError('Say what needs to change');
    const verification = req.body.decision === 'verified' ? { status: 'verified', verifiedAt: new Date() } : { status: 'rejected', reason: req.body.reason };
    await DocumentModel.updateOne({ _id: doc._id }, { $set: { verification } });
    if (req.body.decision === 'rejected') {
      const partner = await assetPartnerService.getById(req.params.id);
      void notificationService
        .send({
          userId: partner.userId,
          priority: 'high',
          deepLink: '/asset-partners/documents',
          templateKey: 'account.asset_partner_document_rejected',
          title: 'Please upload a document again',
          body: req.body.reason,
          data: { documentId: doc._id },
        })
        .catch(() => undefined);
    }
    sendSuccess(res, { _id: doc._id, verification });
  }),
);

async function partnerDocument(partnerId: string, docId: string) {
  const partner = await assetPartnerService.getById(partnerId);
  const doc = await DocumentModel.findOne({ _id: docId, ownerId: partner.userId, category: { $in: PARTNER_DOCS.map((d) => d.category) }, deletedAt: null }).lean();
  if (!doc) throw new NotFoundError('Document');
  return doc;
}

/** Puts an approved car on the fleet as a draft listing, tagged to its partner. */
router.post(
  '/asset-partner-applications/:id/listing',
  authorize('host:manage'),
  validate({
    body: z.object({
      address: z.string().trim().max(300).optional(),
      transmission: z.enum(['manual', 'automatic']).optional(),
      fuelType: z.enum(['petrol', 'diesel', 'hybrid', 'ev']).optional(),
      seats: z.number().int().min(1).max(15).optional(),
      bodyType: z.string().trim().max(40).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerCarService.createListing(req.params.id, req.principal!.userId, req.body));
  }),
);

/** Every partner's net for a finished month, and whether it was paid. */
router.get(
  '/asset-partner-payouts',
  authorize('admin:read'),
  validate({ query: z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerPayoutService.month(String(req.query.period)));
  }),
);

router.post(
  '/asset-partner-payouts',
  authorize('host:manage'),
  validate({
    body: z.object({
      partnerId: z.string(),
      period: z.string().regex(/^\d{4}-\d{2}$/),
      amount: z.number().int().min(1),
      method: z.enum(['zelle', 'check']),
      reference: z.string().trim().min(2).max(120),
      note: z.string().trim().max(500).optional(),
      paidAt: z.coerce.date().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await assetPartnerPayoutService.record(req.principal!.userId, req.body));
  }),
);

/** Undo a payout recorded by mistake. */
router.delete(
  '/asset-partner-payouts/:payoutId',
  authorize('host:manage'),
  asyncHandler(async (req, res) => {
    await assetPartnerPayoutService.remove(req.params.payoutId);
    sendSuccess(res, { removed: true });
  }),
);

router.get(
  '/asset-partners/:id/intakes',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const partner = await assetPartnerService.getById(req.params.id);
    sendSuccess(res, await assetPartnerIntakeService.list(partner._id));
  }),
);

router.get(
  '/asset-partners/:id/intakes/draft',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const partner = await assetPartnerService.getById(req.params.id);
    sendSuccess(res, await assetPartnerIntakeService.draftFor(partner._id, req.query.applicationId ? String(req.query.applicationId) : undefined));
  }),
);

/** CatoDrive records and signs the Exhibit A intake report; the partner is asked to review it. */
router.post(
  '/asset-partners/:id/intakes',
  authorize('host:manage'),
  validate({ body: z.object({
    applicationId: z.string().optional(),
    vehicleId: z.string().optional(),
    vehicle: z.object({
      year: z.string().trim().regex(/^\d{4}$/), make: z.string().trim().min(1).max(60), model: z.string().trim().min(1).max(60),
      trim: z.string().trim().max(60).optional(), color: z.string().trim().max(40).optional(),
      vin: z.string().trim().length(17), plate: z.string().trim().min(2).max(20),
    }),
    odometer: z.number().int().min(0).max(1_000_000),
    estimatedMarketValue: z.string().trim().max(40).optional(),
    listingUrl: z.string().trim().url().max(300).optional(),
    intakeDate: z.coerce.date(),
    location: z.string().trim().min(3).max(200),
    fuelLevel: z.enum(['full', 'three_quarters', 'half', 'quarter']),
    preExistingDamage: z.string().trim().min(1).max(2000),
    conditionNotes: z.string().trim().max(2000).optional(),
    photos: z.array(z.object({ url: z.string().url(), key: z.string().optional(), label: z.string().max(40).optional() })).max(40).optional(),
    signedName: z.string().trim().min(2).max(120),
    signedTitle: z.string().trim().min(2).max(120),
  }) }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await assetPartnerIntakeService.create(req.params.id, req.principal!.userId, req.body));
  }),
);

router.get(
  '/asset-partners/:id/intakes/:intakeId/pdf',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const { pdf, filename } = await assetPartnerIntakeService.pdf(req.params.id, req.params.intakeId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  }),
);

/** Small counts for the panel's sidebar badges; cheap enough to poll every minute. */
router.get(
  '/attention',
  authorize('admin:read'),
  asyncHandler(async (_req, res) => {
    const [applications, partnerDocuments, returns, offersToResend] = await Promise.all([
      AssetPartnerApplicationModel.countDocuments({ status: { $in: ['submitted', 'under_review'] } }),
      DocumentModel.countDocuments({ category: { $in: PARTNER_DOCS.map((d) => d.category) }, 'verification.status': 'pending', deletedAt: null }),
      assetPartnerExitService.attentionCounts(),
      AssetPartnerModel.countDocuments({ 'agreementOffer.reissueRequestedAt': { $exists: true }, 'agreement.signedAt': { $exists: false }, status: { $ne: 'exited' } }),
    ]);
    res.set('Cache-Control', 'no-store');
    sendSuccess(res, { applications, partnerDocuments, ...returns, offersToResend });
  }),
);

const periodQuery = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/).optional() });

router.get(
  '/asset-management/overview',
  authorize('admin:read'),
  validate({ query: periodQuery }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerPortfolioService.overview(req.query.period ? String(req.query.period) : undefined));
  }),
);

/** Every partner car with its owner, price, fee and the month's money each side. */
router.get(
  '/asset-management/cars',
  authorize('admin:read'),
  validate({ query: periodQuery }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerPortfolioService.cars(req.query.period ? String(req.query.period) : undefined));
  }),
);

router.get(
  '/asset-management/unassigned-cars',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerPortfolioService.unassigned(req.principal!.userId));
  }),
);

router.post(
  '/asset-management/cars/:vehicleId/assign',
  authorize('host:manage'),
  validate({ body: z.object({ partnerId: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    await assetPartnerCarService.assign(req.principal!.userId, req.params.vehicleId, req.body.partnerId);
    sendSuccess(res, { assigned: true });
  }),
);

/** The car goes back to its owner. */
router.post(
  '/asset-management/cars/:vehicleId/end',
  authorize('host:manage'),
  asyncHandler(async (req, res) => {
    await assetPartnerCarService.end(req.principal!.userId, req.params.vehicleId);
    sendSuccess(res, { ended: true });
  }),
);

router.get(
  '/asset-partner-repairs',
  authorize('admin:read'),
  validate({ query: z.object({ approval: z.enum(['not_required', 'pending', 'approved', 'declined']).optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerMaintenanceService.listAll({ approval: req.query.approval as 'pending' | undefined }));
  }),
);

/** The partner's ID check, with whether the name on the ID matches the application. */
router.get(
  '/asset-partners/:id/identity',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const partner = await assetPartnerService.getById(req.params.id);
    const [identity, stage] = await Promise.all([assetPartnerProfileService.identity(partner), assetPartnerService.portalStage(partner)]);
    sendSuccess(res, { identity, offer: assetPartnerOfferService.state(partner), stage, profile: partner.profile ?? null, lastSeenAt: partner.lastSeenAt, payoutHold: partner.payoutHold ?? null });
  }),
);

/** Staff checked the ID in person because the automatic check couldn't be used. */
router.post(
  '/asset-partners/:id/identity/confirm',
  authorize('host:manage'),
  validate({ body: z.object({ reason: z.string().trim().min(10).max(500) }) }),
  asyncHandler(async (req, res) => {
    await assetPartnerProfileService.overrideIdentity(req.params.id, req.principal!.userId, req.body.reason);
    sendSuccess(res, { confirmed: true });
  }),
);

/** Send the offer to sign again with a fresh window. */
router.post(
  '/asset-partners/:id/agreement-offer',
  authorize('host:manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerOfferService.reissue(req.params.id, req.principal!.userId));
  }),
);

router.post(
  '/asset-partners/:id/payout-hold/release',
  authorize('host:manage'),
  validate({ body: z.object({ payableTo: z.string().trim().max(120).optional(), mailingAddress: z.string().trim().max(300).optional() }) }),
  asyncHandler(async (req, res) => {
    const payee = req.body.payableTo || req.body.mailingAddress ? { payableTo: req.body.payableTo ?? '', mailingAddress: req.body.mailingAddress ?? '' } : undefined;
    await assetPartnerExitService.releaseHold(req.params.id, req.principal!.userId, payee);
    sendSuccess(res, { released: true });
  }),
);

const contactBody = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  relation: z.string().trim().max(60).default(''),
  email: z.string().trim().max(160).optional().or(z.literal('')),
});

/** Start a return: the partner asked by phone, can't be reached, or passed away. */
router.post(
  '/asset-partners/:id/exits',
  authorize('host:manage'),
  validate({
    body: z.object({
      reason: z.enum(['partner_request', 'unresponsive', 'deceased']),
      vehicleIds: z.array(z.string().min(1)).max(20).optional(),
      note: z.string().trim().max(1000).optional(),
      reportedBy: contactBody.optional(),
      preferredDate: z.coerce.date().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await assetPartnerExitService.open(req.principal!.userId, req.params.id, req.body));
  }),
);

router.get(
  '/asset-partner-exits',
  authorize('admin:read'),
  validate({
    query: z.object({
      status: z.enum(['open', 'requested', 'notice', 'scheduled', 'in_progress', 'submitted', 'completed', 'cancelled']).optional(),
      reason: z.enum(['partner_request', 'unresponsive', 'deceased']).optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
      skip: z.coerce.number().int().min(0).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await assetPartnerExitService.list(req.query as never);
    sendSuccess(res, result.items, 200, { total: result.total });
  }),
);

router.get(
  '/asset-partner-exits/watch-list',
  authorize('admin:read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await assetPartnerExitService.watchList());
  }),
);

/** Captains on the team who can be sent to do a return. */
router.get(
  '/asset-partner-exits/runners',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    const host = await hostService.getByUserId(req.principal!.userId);
    const staff = host ? await HostStaffModel.find({ hostId: host._id, status: 'active', userId: { $exists: true } }).select('_id name email').sort({ name: 1 }).limit(100).lean() : [];
    sendSuccess(res, staff);
  }),
);

router.get(
  '/asset-partner-exits/:id',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await assetPartnerExitService.detail(req.params.id, req.principal!.userId));
  }),
);

router.post(
  '/asset-partner-exits/:id/attempts',
  authorize('host:manage'),
  validate({
    body: z.object({
      channel: z.enum(['call', 'text', 'email', 'letter', 'visit']),
      to: z.enum(['partner', 'emergency_contact', 'representative']),
      outcome: z.enum(['no_answer', 'left_message', 'reached', 'bounced', 'wrong_number']),
      note: z.string().trim().max(500).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    await assetPartnerExitService.logAttempt(req.params.id, req.principal!.userId, req.body);
    sendSuccess(res, await assetPartnerExitService.detail(req.params.id, req.principal!.userId));
  }),
);

router.put(
  '/asset-partner-exits/:id/estate-contact',
  authorize('host:manage'),
  validate({ body: contactBody }),
  asyncHandler(async (req, res) => {
    await assetPartnerExitService.setEstateContact(req.params.id, req.principal!.userId, req.body);
    sendSuccess(res, await assetPartnerExitService.detail(req.params.id, req.principal!.userId));
  }),
);

router.post(
  '/asset-partner-exits/:id/estate-documents',
  authorize('host:manage'),
  validate({ body: z.object({ kind: z.enum(['death_certificate', 'authority', 'other']), key: z.string().min(5).max(512) }) }),
  asyncHandler(async (req, res) => {
    await assetPartnerExitService.addEstateDocument(req.params.id, req.principal!.userId, req.body);
    sendSuccess(res, await assetPartnerExitService.detail(req.params.id, req.principal!.userId));
  }),
);

router.post(
  '/asset-partner-exits/:id/estate-documents/:index/verify',
  authorize('host:manage'),
  validate({ params: z.object({ id: z.string(), index: z.coerce.number().int().min(0).max(20) }) }),
  asyncHandler(async (req, res) => {
    await assetPartnerExitService.verifyEstateDocument(req.params.id, req.principal!.userId, Number(req.params.index));
    sendSuccess(res, await assetPartnerExitService.detail(req.params.id, req.principal!.userId));
  }),
);

router.get(
  '/asset-partner-exits/:id/estate-documents/:index/view',
  authorize('admin:read'),
  validate({ params: z.object({ id: z.string(), index: z.coerce.number().int().min(0).max(20) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { url: await assetPartnerExitService.estateDocumentUrl(req.params.id, Number(req.params.index)) });
  }),
);

router.post(
  '/asset-partner-exits/:id/schedule',
  authorize('host:manage'),
  validate({ body: z.object({ scheduledFor: z.coerce.date(), runnerStaffId: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    await assetPartnerExitService.schedule(req.params.id, req.principal!.userId, req.body);
    sendSuccess(res, await assetPartnerExitService.detail(req.params.id, req.principal!.userId));
  }),
);

router.post(
  '/asset-partner-exits/:id/cancel',
  authorize('host:manage'),
  validate({ body: z.object({ reason: z.string().trim().min(5).max(500) }) }),
  asyncHandler(async (req, res) => {
    await assetPartnerExitService.cancelByOps(req.params.id, req.principal!.userId, req.body.reason);
    sendSuccess(res, await assetPartnerExitService.detail(req.params.id, req.principal!.userId));
  }),
);

/** Operations can do the checklist themselves when no runner is sent. */
router.post(
  '/asset-partner-exits/:id/start',
  authorize('host:manage'),
  asyncHandler(async (req, res) => {
    await assetPartnerExitService.start(req.params.id, req.principal!.userId, true);
    sendSuccess(res, await assetPartnerExitService.detail(req.params.id, req.principal!.userId));
  }),
);

router.patch(
  '/asset-partner-exits/:id/cars/:vehicleId',
  authorize('host:manage'),
  validate({ body: exitCarPatchSchema }),
  asyncHandler(async (req, res) => {
    await assetPartnerExitService.updateCar(req.params.id, req.principal!.userId, req.params.vehicleId, req.body, true);
    sendSuccess(res, await assetPartnerExitService.detail(req.params.id, req.principal!.userId));
  }),
);

router.post(
  '/asset-partner-exits/:id/submit',
  authorize('host:manage'),
  validate({ body: exitSubmitSchema }),
  asyncHandler(async (req, res) => {
    await assetPartnerExitService.submit(req.params.id, req.principal!.userId, req.body, true);
    sendSuccess(res, await assetPartnerExitService.detail(req.params.id, req.principal!.userId));
  }),
);

router.post(
  '/asset-partner-exits/:id/send-back',
  authorize('host:manage'),
  validate({ body: z.object({ reason: z.string().trim().min(5).max(500) }) }),
  asyncHandler(async (req, res) => {
    await assetPartnerExitService.sendBack(req.params.id, req.principal!.userId, req.body.reason);
    sendSuccess(res, await assetPartnerExitService.detail(req.params.id, req.principal!.userId));
  }),
);

router.post(
  '/asset-partner-exits/:id/approve',
  authorize('host:manage'),
  validate({ body: z.object({ note: z.string().trim().max(500).optional() }) }),
  asyncHandler(async (req, res) => {
    await assetPartnerExitService.approve(req.params.id, req.principal!.userId, req.body.note);
    sendSuccess(res, await assetPartnerExitService.detail(req.params.id, req.principal!.userId));
  }),
);

export const assetPartnerIocRoutes = router;
