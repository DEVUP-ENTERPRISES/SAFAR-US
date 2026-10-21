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
import { storageGateway } from '../../../infrastructure/storage/storage.provider';
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
  validate({ body: z.object({ kind: z.enum(['agreement', 'nda']).default('agreement'), title: z.string().trim().min(3).max(160), body: z.string().trim().min(50).max(100_000) }) }),
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

export const assetPartnerIocRoutes = router;
