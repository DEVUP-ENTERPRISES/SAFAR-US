import { Router } from 'express';
import { authController } from './auth.controller';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { validate } from '../../../shared/middleware/validate';
import { authenticate } from '../../../shared/middleware/authenticate';
import { loginSchema, refreshSchema, registerSchema } from '../dto/auth.schemas';

const router = Router();

router.post(
  '/register',
  validate({ body: registerSchema }),
  asyncHandler((req, res) => authController.register(req, res)),
);

router.post(
  '/login',
  validate({ body: loginSchema }),
  asyncHandler((req, res) => authController.login(req, res)),
);

router.post(
  '/token/refresh',
  validate({ body: refreshSchema }),
  asyncHandler((req, res) => authController.refresh(req, res)),
);

router.post(
  '/logout',
  authenticate,
  asyncHandler((req, res) => authController.logout(req, res)),
);

export const authRoutes = router;
