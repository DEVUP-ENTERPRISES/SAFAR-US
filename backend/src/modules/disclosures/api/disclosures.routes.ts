import { Router } from 'express';
import { z } from 'zod';
import { websiteClaimService } from '../application/website-claim.service';
import { disclosureService } from '../application/disclosure.service';
import { assetPartnerAgreementService, AGREEMENT_PLACEHOLDERS, renderAgreement, termFields } from '../../asset-partners/application/asset-partner-agreement.service';
import { draftTerms } from '../../asset-partners/application/asset-partner-terms.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess } from '../../../shared/http/api-response';
import { NotFoundError } from '../../../core/errors/app-error';

const router = Router();
const cache = (res: { set: (k: string, v: string) => void }) => res.set('Cache-Control', 'public, max-age=120');

router.get('/website/claims', asyncHandler(async (_req, res) => {
  cache(res);
  sendSuccess(res, await websiteClaimService.publicMap());
}));

router.get('/website/disclosures', asyncHandler(async (_req, res) => {
  cache(res);
  const v = await disclosureService.current();
  if (!v) throw new NotFoundError('Disclosures');
  sendSuccess(res, { version: v.version, effectiveAt: v.effectiveAt, sections: v.sections });
}));

router.get('/website/disclosures/versions', asyncHandler(async (_req, res) => {
  cache(res);
  sendSuccess(res, await disclosureService.versions());
}));

router.get(
  '/website/disclosures/:version',
  validate({ params: z.object({ version: z.coerce.number().int().min(1) }) }),
  asyncHandler(async (req, res) => {
    cache(res);
    const v = await disclosureService.byVersion(Number(req.params.version));
    sendSuccess(res, { version: v.version, effectiveAt: v.effectiveAt, changeNote: v.changeNote, sections: v.sections });
  }),
);

// The current Asset Partner Agreement as a sample: standard terms filled in, personal details left as labelled blanks.
router.get('/legal/asset-partner-agreement', asyncHandler(async (_req, res) => {
  cache(res);
  const doc = await assetPartnerAgreementService.current('agreement');
  if (!doc) throw new NotFoundError('Asset Partner Agreement');
  const labels = Object.fromEntries(AGREEMENT_PLACEHOLDERS.map((p) => [p.key, `[${p.label}]`]));
  const body = renderAgreement(doc.body, { ...labels, ...termFields(await draftTerms({ terms: {} })), changes_table: 'Not applicable', changes_effective: 'Not applicable' });
  sendSuccess(res, { title: doc.title, version: doc.version, publishedAt: doc.createdAt, body });
}));

export const disclosuresRoutes = router;
