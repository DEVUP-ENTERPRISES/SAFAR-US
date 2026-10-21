import { Router } from 'express';
import { z } from 'zod';
import { assetPartnerApplicationAdminRoutes } from './asset-partner-application.admin.routes';
import { assetPartnerAdminRoutes } from './asset-partner.admin.routes';
import { assetPartnerAgreementService, AGREEMENT_PLACEHOLDERS } from '../application/asset-partner-agreement.service';
import { assetPartnerService, PARTNER_DOCS } from '../application/asset-partner.service';
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

export const assetPartnerIocRoutes = router;
