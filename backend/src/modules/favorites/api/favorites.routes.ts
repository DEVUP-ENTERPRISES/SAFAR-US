import { Router } from 'express';
import { z } from 'zod';
import { FavoriteModel } from '../infrastructure/favorite.model';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess, sendCreated } from '../../../shared/http/api-response';

const router = Router();

/** List the user's favorited vehicles (hydrated). */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const favs = await FavoriteModel.find({ userId: req.principal!.userId })
      .sort({ createdAt: -1 })
      .lean();
    const vehicles = await vehicleService.getByIds(favs.map((f) => f.vehicleId));
    sendSuccess(res, vehicles);
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
  validate({ body: z.object({ vehicleId: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
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
