import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { sendSuccess } from '../../../shared/http/api-response';
import { wheelbaseInsuranceService } from '../application/wheelbase-insurance.service';
import { wheelbaseClaimsService } from '../application/wheelbase-claims.service';

const router = Router();

/** Every car with its Wheelbase link and insurance, and the dealer's listings to link to. */
router.get(
  '/insurance/wheelbase',
  authorize('admin:read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await wheelbaseInsuranceService.overview());
  }),
);

/** Read Wheelbase now instead of waiting for the next scheduled check. */
router.post(
  '/insurance/wheelbase/sync',
  authorize('vehicle:verify'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await wheelbaseInsuranceService.sync());
  }),
);

/** Tie a car to a Wheelbase listing, or clear it with null. */
router.patch(
  '/insurance/wheelbase/vehicles/:id',
  authorize('vehicle:verify'),
  validate({ body: z.object({ rentalId: z.number().int().positive().nullable() }) }),
  asyncHandler(async (req, res) => {
    await wheelbaseInsuranceService.link(req.params.id, req.body.rentalId);
    sendSuccess(res, { ok: true });
  }),
);

// ── Trips owed to Wheelbase ─────────────────────────────────────────────

const reportStatus = z.object({ status: z.enum(['pending', 'reported']).optional() });

router.get(
  '/insurance/wheelbase/trips',
  authorize('admin:read'),
  validate({ query: reportStatus }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await wheelbaseInsuranceService.tripReport(req.query.status as 'pending' | 'reported' | undefined));
  }),
);

/** The same report as a spreadsheet, in the order Wheelbase reads it. */
router.get(
  '/insurance/wheelbase/trips.csv',
  authorize('admin:read'),
  validate({ query: reportStatus }),
  asyncHandler(async (req, res) => {
    const rows = await wheelbaseInsuranceService.tripReport(req.query.status as 'pending' | 'reported' | undefined);
    const cell = (v: unknown) => {
      const s = v instanceof Date ? v.toISOString() : v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['Booking', 'Wheelbase listing', 'Vehicle', 'VIN', 'Plate', 'Driver', 'Driver email', 'Trip start', 'Trip end', 'Picked up', 'Returned', 'Odometer start', 'Odometer end', 'Plan', 'Protection', 'Deductible ($)', 'Report status', 'Wheelbase reference'];
    const lines = rows.map((r) =>
      [r.code, r.wheelbaseListing, r.vehicle, r.vin, r.plate, r.driver, r.driverEmail, r.start, r.end, r.pickedUpAt, r.returnedAt, r.odometerStart, r.odometerEnd, r.plan, r.protection, r.deductibleCents != null ? (r.deductibleCents / 100).toFixed(2) : '', r.report.status, r.report.reference]
        .map(cell)
        .join(','),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="wheelbase-trips-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send([head.join(','), ...lines].join('\n'));
  }),
);

/** Staff mark trips as sent to Wheelbase, with Wheelbase's reference when they give one. */
router.post(
  '/insurance/wheelbase/trips/reported',
  authorize('vehicle:verify'),
  validate({ body: z.object({ bookingIds: z.array(z.string().min(1)).min(1).max(500), reference: z.string().trim().max(120).optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { updated: await wheelbaseInsuranceService.markReported(req.body.bookingIds, req.principal!.userId, req.body.reference) });
  }),
);

// ── Claims filed with Wheelbase ─────────────────────────────────────────

const claimStatus = z.enum(['to_file', 'filed', 'accepted', 'denied', 'paid']);

router.get(
  '/insurance/wheelbase/claims',
  authorize('admin:read'),
  validate({ query: z.object({ status: claimStatus.optional() }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await wheelbaseClaimsService.list(req.query.status as z.infer<typeof claimStatus> | undefined));
  }),
);

/** The claim pack: claim, booking, car, driver, trip readings and every stamped photo. */
router.get(
  '/insurance/wheelbase/claims/:id/pack',
  authorize('admin:read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await wheelbaseClaimsService.pack(req.params.id));
  }),
);

router.patch(
  '/insurance/wheelbase/claims/:id',
  authorize('vehicle:verify'),
  validate({
    body: z.object({
      status: claimStatus,
      reference: z.string().trim().max(120).optional(),
      payoutCents: z.number().int().min(0).optional(),
      note: z.string().trim().max(500).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await wheelbaseClaimsService.update(req.params.id, req.principal!.userId, req.body));
  }),
);

export const insuranceAdminRoutes = router;
