import { Router } from 'express';
import { usersController } from './users.controller';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';

const router = Router();

router.get(
  '/me',
  authenticate,
  asyncHandler((req, res) => usersController.me(req, res)),
);

export const usersRoutes = router;
