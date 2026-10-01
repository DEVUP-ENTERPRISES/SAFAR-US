import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { sendSuccess, sendCreated } from '../../../shared/http/api-response';
import { tollService } from '../application/toll.service';
import { credentialVault } from '../infrastructure/credential-vault';

const router = Router();

// ── Accounts ─────────────────────────────────────────────────────────────

router.get(
  '/tolls/accounts',
  authorize('admin:read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { accounts: await tollService.accounts(), loginStorage: credentialVault.isConfigured() });
  }),
);

router.post(
  '/tolls/accounts',
  authorize('vehicle:verify'),
  validate({ body: z.object({ agency: z.enum(['ntta']), nickname: z.string().trim().min(1).max(60) }) }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await tollService.createAccount(req.body));
  }),
);

router.patch(
  '/tolls/accounts/:id',
  authorize('vehicle:verify'),
  validate({ body: z.object({ nickname: z.string().trim().min(1).max(60).optional(), vehicleIds: z.array(z.string().min(1)).max(1000).optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tollService.updateAccount(req.params.id, req.body));
  }),
);

/** Save the agency login (sealed, never returned). */
router.put(
  '/tolls/accounts/:id/login',
  authorize('vehicle:verify'),
  validate({ body: z.object({ username: z.string().trim().min(1).max(120), password: z.string().min(1).max(200) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tollService.saveLogin(req.params.id, req.body.username, req.body.password, req.principal!.userId));
  }),
);

router.delete(
  '/tolls/accounts/:id/login',
  authorize('vehicle:verify'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tollService.removeLogin(req.params.id));
  }),
);

/** The TollTag on a car, for matching by tag as well as plate. */
router.put(
  '/tolls/vehicles/:id/tag',
  authorize('vehicle:verify'),
  validate({ body: z.object({ tagId: z.string().trim().max(40).nullable() }) }),
  asyncHandler(async (req, res) => {
    await tollService.setVehicleTag(req.params.id, req.body.tagId);
    sendSuccess(res, { ok: true });
  }),
);

// ── Statements & tolls ───────────────────────────────────────────────────

router.post(
  '/tolls/import',
  authorize('vehicle:verify'),
  // Requests are capped at 1 MB (about 6,000 toll rows); bigger statements are imported in parts.
  validate({ body: z.object({ text: z.string().min(1).max(1_000_000), accountId: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tollService.importNtta(req.body.text, req.principal!.userId, req.body.accountId));
  }),
);

router.get(
  '/tolls/transactions',
  authorize('admin:read'),
  validate({ query: z.object({ status: z.enum(['matched', 'no_trip', 'unknown_car', 'billed', 'covered', 'waived', 'too_late']).optional(), bookingId: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tollService.list(req.query as { status?: string; bookingId?: string }));
  }),
);

router.post(
  '/tolls/transactions/:id/assign',
  authorize('vehicle:verify'),
  validate({ body: z.object({ vehicleId: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tollService.assign(req.params.id, req.body.vehicleId));
  }),
);

router.post(
  '/tolls/transactions/:id/waive',
  authorize('vehicle:verify'),
  validate({ body: z.object({ note: z.string().trim().min(3).max(300) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tollService.waive(req.params.id, req.body.note));
  }),
);

/** Charge a finished trip's tolls now instead of waiting for the scheduled run. */
router.post(
  '/tolls/bill/:bookingId',
  authorize('vehicle:verify'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, (await tollService.bill(req.params.bookingId)) ?? { billed: 0, totalCents: 0, collected: true });
  }),
);

export const tollsAdminRoutes = router;
