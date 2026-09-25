import { Router } from 'express';
import { z } from 'zod';
import { hostStaffService } from '../application/host-staff.service';
import { CAPTAIN_ABILITIES } from '../infrastructure/host-staff.model';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate, authenticateOptional } from '../../../shared/middleware/authenticate';
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

router.post(
  '/staff/:id/resend-invite',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hostStaffService.resendInvite(req.principal!.userId, req.params.id));
  }),
);

/**
 * Public — the invitee has no session yet. Scoped entirely by the single-use
 * token, never by an authenticated id.
 */
router.get(
  '/staff/invite/:token',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await hostStaffService.inviteePreview(req.params.token));
  }),
);

router.post(
  '/staff/accept',
  authenticateOptional,
  validate({ body: z.object({ token: z.string().min(10), password: z.string().min(8).max(72).optional() }) }),
  asyncHandler(async (req, res) => {
    const { userId, created } = await hostStaffService.acceptInvite(req.body.token, req.body.password, req.principal?.userId);
    // An existing account is already signed in and keeps its own session; only a brand new one is issued a session here.
    if (!created) {
      sendSuccess(res, { linked: true });
      return;
    }
    const { authService } = await import('../../auth/application/auth.service');
    const result = await authService.issueSessionForUser(userId, {
      userAgent: req.header('user-agent'),
      ip: req.ip,
    });
    sendSuccess(res, result);
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
