import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';
import { insurancePartnerService } from '../application/insurance-partner.service';
import { insurancePlanService } from '../application/insurance-plan.service';
import { insurerLedgerService } from '../application/insurer-ledger.service';

const router = Router();

const stateList = z.array(z.string().trim().regex(/^[A-Za-z]{2}$/, 'Use two-letter state codes')).max(60);

const applySchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(80),
  licenceNumber: z.string().trim().min(2).max(60),
  licensedStates: stateList.min(1),
  contactName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(30).optional(),
  website: z.string().trim().url().max(300).optional(),
  licenceDoc: z.object({ url: z.string().url().max(2000), key: z.string().max(500).optional() }).optional(),
});

const profileSchema = applySchema.pick({ displayName: true, contactName: true, email: true, phone: true, website: true }).partial();

const payoutSchema = z.object({
  accountHolder: z.string().trim().min(2).max(120),
  bankName: z.string().trim().min(2).max(120),
  routingNumber: z.string().trim().regex(/^\d{9}$/, 'Routing numbers are 9 digits'),
  accountNumber: z.string().trim().regex(/^\d{4,17}$/, 'Account numbers are 4 to 17 digits'),
});

const cents = z.number().int().min(0).max(100_000_000);
const planSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(600).optional(),
  pricePerDay: cents,
  deductibleCents: cents,
  liabilityLimitCents: cents,
  coverage: z.array(z.string().trim().max(200)).max(20),
  states: stateList,
  categories: z.array(z.string().trim().max(40)).max(20),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

/** Apply to sell protection plans, or resubmit after a rejection. */
router.post(
  '/insurance-partners/apply',
  authenticate,
  validate({ body: applySchema }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await insurancePartnerService.apply(req.principal!.userId, req.body));
  }),
);

/** The caller's insurer record, or null when they have none. */
router.get(
  '/insurance-partners/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const insurer = await insurancePartnerService.getByUserId(req.principal!.userId);
    sendSuccess(res, insurer ? { insurer, commissionBps: await insurancePartnerService.commissionBps(insurer) } : null);
  }),
);

router.patch(
  '/insurance-partners/me',
  authenticate,
  validate({ body: profileSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await insurancePartnerService.updateProfile(req.principal!.userId, req.body));
  }),
);

router.put(
  '/insurance-partners/me/payout-details',
  authenticate,
  validate({ body: payoutSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await insurancePartnerService.setPayoutDetails(req.principal!.userId, req.body));
  }),
);

/** Balance, totals and earnings by month. */
router.get(
  '/insurance-partners/me/summary',
  authenticate,
  asyncHandler(async (req, res) => {
    const insurer = await insurancePartnerService.requireMember(req.principal!.userId);
    sendSuccess(res, await insurerLedgerService.summary(insurer._id));
  }),
);

/** Trips the insurer covers: the trip, the car and the premium - no guest personal data. */
router.get(
  '/insurance-partners/me/policies',
  authenticate,
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(100).optional(), skip: z.coerce.number().int().min(0).optional() }) }),
  asyncHandler(async (req, res) => {
    const insurer = await insurancePartnerService.requireMember(req.principal!.userId);
    const q = req.query as { limit?: number; skip?: number };
    const result = await insurerLedgerService.policies(insurer._id, q.limit, q.skip);
    sendSuccess(res, result.items, 200, { total: result.total });
  }),
);

router.get(
  '/insurance-partners/me/payouts',
  authenticate,
  asyncHandler(async (req, res) => {
    const insurer = await insurancePartnerService.requireMember(req.principal!.userId);
    sendSuccess(res, await insurerLedgerService.payouts(insurer._id));
  }),
);

router.get(
  '/insurance-partners/me/plans',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await insurancePlanService.listMine(req.principal!.userId));
  }),
);

router.post(
  '/insurance-partners/me/plans',
  authenticate,
  validate({ body: planSchema }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await insurancePlanService.create(req.principal!.userId, req.body));
  }),
);

router.put(
  '/insurance-partners/me/plans/:id',
  authenticate,
  validate({ body: planSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await insurancePlanService.update(req.principal!.userId, req.params.id, req.body));
  }),
);

export const insurancePartnerRoutes = router;
