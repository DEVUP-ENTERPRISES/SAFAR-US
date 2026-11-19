import { Router } from 'express';
import { z } from 'zod';
import { websiteClaimService } from '../application/website-claim.service';
import { disclosureService } from '../application/disclosure.service';
import { CLAIM_OWNERS, EVIDENCE_HINT, NEEDS_LEGAL, REVIEW_DAYS } from '../domain/defaults';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();
const keyParam = z.object({ key: z.string().regex(/^[a-zA-Z0-9]{2,40}$/) });
const note = z.string().trim().max(1000).optional();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-18');

router.get('/website-claims', authorize('admin:read'), asyncHandler(async (_req, res) => {
  const claims = await websiteClaimService.list();
  res.set('Cache-Control', 'private, no-store');
  sendSuccess(res, claims, 200, { total: claims.length });
}));

router.get('/website-claims/rules', authorize('admin:read'), asyncHandler(async (_req, res) => {
  sendSuccess(res, { reviewDays: REVIEW_DAYS, needsLegal: [...NEEDS_LEGAL], evidenceHint: EVIDENCE_HINT, owners: CLAIM_OWNERS });
}));

router.get('/website-claims/:key', authorize('admin:read'), validate({ params: keyParam }), asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  sendSuccess(res, await websiteClaimService.get(req.params.key));
}));

router.patch(
  '/website-claims/:key',
  authorize('website:claims'),
  validate({
    params: keyParam,
    body: z.object({
      label: z.string().trim().min(2).max(160).optional(),
      display: z.string().trim().min(1).max(40).optional(),
      value: z.number().finite().min(0).max(1e12).nullable().optional(),
      asOf: day.nullable().optional(),
      wording: z.string().trim().min(2).max(400).optional(),
      definition: z.string().trim().min(2).max(1000).optional(),
      pages: z.array(z.string().trim().regex(/^\/[\w\-/[\]]*$/).max(80)).max(20).optional(),
      owner: z.enum(CLAIM_OWNERS).optional(),
      responsibleUserId: z.string().trim().max(64).nullable().optional(),
      note,
    }),
  }),
  asyncHandler(async (req, res) => sendSuccess(res, await websiteClaimService.update(req.principal!.userId, req.params.key, req.body))),
);

router.post(
  '/website-claims/:key/evidence',
  authorize('website:claims'),
  validate({
    params: keyParam,
    body: z.object({
      label: z.string().trim().min(2).max(160),
      url: z.string().trim().url().max(500).refine((u) => u.startsWith('https://'), 'Use an https:// link').optional(),
      note,
    }),
  }),
  asyncHandler(async (req, res) => sendSuccess(res, await websiteClaimService.addEvidence(req.principal!.userId, req.params.key, req.body))),
);

router.delete(
  '/website-claims/:key/evidence/:evidenceId',
  authorize('website:claims'),
  validate({ params: keyParam.extend({ evidenceId: z.string().min(8).max(64) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await websiteClaimService.removeEvidence(req.principal!.userId, req.params.key, req.params.evidenceId))),
);

router.post('/website-claims/:key/verify', authorize('website:claims'), validate({ params: keyParam, body: z.object({ note }) }), asyncHandler(async (req, res) => {
  sendSuccess(res, await websiteClaimService.verify(req.principal!.userId, req.params.key, req.body.note));
}));

router.post('/website-claims/:key/legal-review', authorize('platform:manage'), validate({ params: keyParam, body: z.object({ note: z.string().trim().min(5).max(1000) }) }), asyncHandler(async (req, res) => {
  sendSuccess(res, await websiteClaimService.recordLegalReview(req.principal!.userId, req.params.key, req.body.note));
}));

router.post('/website-claims/:key/approve', authorize('platform:manage'), validate({ params: keyParam, body: z.object({ note }) }), asyncHandler(async (req, res) => {
  sendSuccess(res, await websiteClaimService.approve(req.principal!.userId, req.params.key, req.body.note));
}));

router.post('/website-claims/:key/suspend', authorize('website:claims'), validate({ params: keyParam, body: z.object({ reason: z.string().trim().min(5).max(1000) }) }), asyncHandler(async (req, res) => {
  sendSuccess(res, await websiteClaimService.suspend(req.principal!.userId, req.params.key, req.body.reason));
}));

router.post('/website-claims/:key/reviewed', authorize('website:claims'), validate({ params: keyParam, body: z.object({ note }) }), asyncHandler(async (req, res) => {
  sendSuccess(res, await websiteClaimService.markReviewed(req.principal!.userId, req.params.key, req.body.note));
}));

router.get('/website-disclosures', authorize('admin:read'), asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'private, no-store');
  sendSuccess(res, { current: await disclosureService.current(), versions: await disclosureService.versions() });
}));

router.post(
  '/website-disclosures',
  authorize('platform:manage'),
  validate({
    body: z.object({
      changeNote: z.string().trim().min(5).max(500),
      sections: z.array(z.object({
        id: z.string().trim().min(2).max(40),
        title: z.string().trim().min(2).max(120),
        note: z.string().trim().min(5).max(400),
        body: z.array(z.string().trim().min(2).max(3000)).min(1).max(20),
      })).min(1).max(30),
    }),
  }),
  asyncHandler(async (req, res) => sendSuccess(res, await disclosureService.publish(req.principal!.userId, req.body))),
);

export const disclosuresAdminRoutes = router;
