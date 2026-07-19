import { Router } from 'express';
import { z } from 'zod';
import { authController } from './auth.controller';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { validate } from '../../../shared/middleware/validate';
import { authenticate } from '../../../shared/middleware/authenticate';
import { loginSchema, refreshSchema, registerSchema, otpRequestSchema, otpVerifySchema } from '../dto/auth.schemas';

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
  '/otp/request',
  validate({ body: otpRequestSchema }),
  asyncHandler((req, res) => authController.requestOtp(req, res)),
);

router.post(
  '/otp/verify',
  validate({ body: otpVerifySchema }),
  asyncHandler((req, res) => authController.verifyOtp(req, res)),
);

router.post(
  '/otp/phone/request',
  validate({ body: z.object({ phone: z.string().min(6).max(20) }) }),
  asyncHandler((req, res) => authController.requestPhoneOtp(req, res)),
);
router.post(
  '/otp/phone/verify',
  validate({ body: z.object({ phone: z.string().min(6).max(20), code: z.string().length(6) }) }),
  asyncHandler((req, res) => authController.verifyPhoneOtp(req, res)),
);
router.post(
  '/oauth/google',
  validate({ body: z.object({ idToken: z.string().min(10) }) }),
  asyncHandler((req, res) => authController.googleLogin(req, res)),
);

router.post(
  '/logout',
  authenticate,
  asyncHandler((req, res) => authController.logout(req, res)),
);

router.get(
  '/sessions',
  authenticate,
  asyncHandler((req, res) => authController.sessions(req, res)),
);

router.delete(
  '/sessions/:id',
  authenticate,
  asyncHandler((req, res) => authController.revokeSession(req, res)),
);

router.post(
  '/logout/all',
  authenticate,
  asyncHandler((req, res) => authController.logoutOthers(req, res)),
);

export const authRoutes = router;
