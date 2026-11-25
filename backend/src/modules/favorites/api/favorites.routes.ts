import { Router } from 'express';
import { z } from 'zod';
import { FavoriteModel } from '../infrastructure/favorite.model';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { toPublicVehicle } from '../../vehicles/application/vehicle-public';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess, sendCreated } from '../../../shared/http/api-response';
import { ConflictError, NotFoundError } from '../../../core/errors/app-error';

const router = Router();
const MAX_FAVORITES = 200;
const isShoppable = (v: { status?: string; verificationStatus?: string }) => v.status === 'listed' && v.verificationStatus === 'verified';

/** List the user's favorited vehicles (hydrated). */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const favs = await FavoriteModel.find({ userId: req.principal!.userId })
      .sort({ createdAt: -1 })
      .limit(MAX_FAVORITES)
      .lean();
    // Newest saved first, and only cars a guest could still book.
    const byId = new Map((await vehicleService.getByIds(favs.map((f) => f.vehicleId))).filter(isShoppable).map((v) => [String(v._id), v]));
    sendSuccess(res, favs.flatMap((f) => (byId.has(f.vehicleId) ? [toPublicVehicle(byId.get(f.vehicleId)!)] : [])));
  }),
);

/** Lightweight id list for toggling heart state in the UI. */
router.get(
  '/ids',
  authenticate,
  asyncHandler(async (req, res) => {
    const favs = await FavoriteModel.find({ userId: req.principal!.userId }).select('vehicleId').lean();
    sendSuccess(res, favs.map((f) => f.vehicleId));
  }),
);

router.post(
  '/',
  authenticate,
  validate({ body: z.object({ vehicleId: z.string().min(1).max(64) }) }),
  asyncHandler(async (req, res) => {
    const [car] = await vehicleService.getByIds([req.body.vehicleId]);
    if (!car || !isShoppable(car)) throw new NotFoundError('Vehicle');
    const already = await FavoriteModel.exists({ userId: req.principal!.userId, vehicleId: req.body.vehicleId });
    if (!already && (await FavoriteModel.countDocuments({ userId: req.principal!.userId })) >= MAX_FAVORITES) {
      throw new ConflictError(`You can save up to ${MAX_FAVORITES} cars. Remove one to save another.`, 'FAVORITES_FULL');
    }
    await FavoriteModel.updateOne(
      { userId: req.principal!.userId, vehicleId: req.body.vehicleId },
      { $setOnInsert: { userId: req.principal!.userId, vehicleId: req.body.vehicleId } },
      { upsert: true },
    );
    sendCreated(res, { favorited: true });
  }),
);

router.delete(
  '/:vehicleId',
  authenticate,
  asyncHandler(async (req, res) => {
    await FavoriteModel.deleteOne({ userId: req.principal!.userId, vehicleId: req.params.vehicleId });
    sendSuccess(res, { favorited: false });
  }),
);

export const favoritesRoutes = router;
