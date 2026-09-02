import { Router } from 'express';
import { z } from 'zod';
import { hostStaffService } from '../application/host-staff.service';
import { CAPTAIN_ABILITIES } from '../infrastructure/host-staff.model';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';

/**
 * Captains — a host's staff.
 *
 * Every route here is scoped to the caller's own fleet by passing their userId
 * as the hostId into the service, never by trusting an id from the request. A
 * host can only ever see and change their own team.
 */
const router = Router();

const abilities = z.array(z.enum(CAPTAIN_ABILITIES as [string, ...string[]])).optional();

const inviteBody = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  title: z.string().max(60).optional(),
  abilities,
  /** Empty array means the whole fleet, present and future. */
  vehicleIds: z.array(z.string()).optional(),
});

router.get(
  '/staff',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hostStaffService.list(req.principal!.userId));
  }),
);

/** The host's own cars, for the assignment picker. */
router.get(
  '/staff/assignable-vehicles',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hostStaffService.assignableVehicles(req.principal!.userId));
  }),
);

router.post(
  '/staff',
  authenticate,
  validate({ body: inviteBody }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await hostStaffService.invite(req.principal!.userId, req.body));
  }),
);

router.patch(
  '/staff/:id',
  authenticate,
  validate({ body: inviteBody.partial().omit({ email: true }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hostStaffService.update(req.principal!.userId, req.params.id, req.body));
  }),
);

router.post(
  '/staff/:id/status',
  authenticate,
  validate({ body: z.object({ status: z.enum(['active', 'suspended']) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hostStaffService.setStatus(req.principal!.userId, req.params.id, req.body.status));
  }),
);

router.delete(
  '/staff/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    await hostStaffService.remove(req.principal!.userId, req.params.id);
    sendSuccess(res, { removed: true });
  }),
);

/**
 * What the signed-in Captain is on the hook for. Returns null when the caller
 * is not anyone's Captain, so the client can simply not render the surface.
 */
router.get(
  '/staff/me/queue',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hostStaffService.captainQueue(req.principal!.userId));
  }),
);

export const hostStaffRoutes = router;
