import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { sendSuccess, sendCreated } from '../../../shared/http/api-response';
import { hostService } from '../../hosts/application/host.service';
import { tollService } from '../application/toll.service';

/** The host's own toll accounts (Turo's "Toll accounts"), for the house fleet signed into the host portal. */
const router = Router();
const hostOf = async (userId: string) => (await hostService.requireHostForUser(userId))._id;

router.get(
  '/me/tolls/accounts',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tollService.accountsForHost(await hostOf(req.principal!.userId)));
  }),
);

router.get(
  '/me/tolls/accounts/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const hostId = await hostOf(req.principal!.userId);
    const { credentials, ...account } = await tollService.accountForHost(hostId, req.params.id);
    sendSuccess(res, { ...account, hasLogin: !!credentials, loginSavedAt: credentials?.savedAt });
  }),
);

router.post(
  '/me/tolls/accounts',
  authenticate,
  validate({
    body: z.object({
      agency: z.enum(['ntta']),
      nickname: z.string().trim().min(1).max(60),
      username: z.string().trim().min(1).max(120),
      password: z.string().min(1).max(200),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await tollService.linkForHost(await hostOf(req.principal!.userId), req.principal!.userId, req.body));
  }),
);

router.put(
  '/me/tolls/accounts/:id/login',
  authenticate,
  validate({ body: z.object({ username: z.string().trim().min(1).max(120), password: z.string().min(1).max(200) }) }),
  asyncHandler(async (req, res) => {
    const hostId = await hostOf(req.principal!.userId);
    await tollService.accountForHost(hostId, req.params.id);
    sendSuccess(res, await tollService.saveLogin(req.params.id, req.body.username, req.body.password, req.principal!.userId));
  }),
);

router.put(
  '/me/tolls/accounts/:id/vehicles',
  authenticate,
  validate({ body: z.object({ vehicleIds: z.array(z.string().min(1)).max(1000) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await tollService.setHostVehicles(await hostOf(req.principal!.userId), req.params.id, req.body.vehicleIds));
  }),
);

router.delete(
  '/me/tolls/accounts/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    await tollService.unlinkForHost(await hostOf(req.principal!.userId), req.params.id);
    sendSuccess(res, { ok: true });
  }),
);

export const tollsHostRoutes = router;
