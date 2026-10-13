import { gateSession } from '../application/app-audience';
import { Router } from 'express';
import { z } from 'zod';
import { authController } from './auth.controller';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { validate } from '../../../shared/middleware/validate';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authLimiter, loginLimiter } from '../../../shared/middleware/auth-rate-limit';
import { loginSchema, refreshSchema, registerSchema, otpRequestSchema, otpVerifySchema, forgotPasswordSchema, resetPasswordSchema } from '../dto/auth.schemas';
import { authService } from '../application/auth.service';
import { handoffService } from '../application/handoff.service';
import { sendSuccess } from '../../../shared/http/api-response';

const router = Router();

router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler((req, res) => authController.register(req, res)),
);

router.post(
  '/login',
  loginLimiter,
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
  authLimiter,
  validate({ body: otpRequestSchema }),
  asyncHandler((req, res) => authController.requestOtp(req, res)),
);

router.post(
  '/otp/verify',
  authLimiter,
  validate({ body: otpVerifySchema }),
  asyncHandler((req, res) => authController.verifyOtp(req, res)),
);

// Forgot password: request a reset code, then reset with it. Rate-limited like
// every other credential endpoint so it can't be used to spam or brute-force.
router.post(
  '/password/forgot',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler((req, res) => authController.forgotPassword(req, res)),
);
router.post(
  '/password/reset',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler((req, res) => authController.resetPassword(req, res)),
);

router.post(
  '/otp/phone/request',
  authLimiter,
  validate({ body: z.object({ phone: z.string().min(6).max(20) }) }),
  asyncHandler((req, res) => authController.requestPhoneOtp(req, res)),
);
router.post(
  '/otp/phone/verify',
  authLimiter,
  validate({ body: z.object({ phone: z.string().min(6).max(20), code: z.string().length(6), mfaToken: z.string().length(6).optional() }) }),
  asyncHandler((req, res) => authController.verifyPhoneOtp(req, res)),
);
router.post(
  '/oauth/google',
  authLimiter,
  validate({ body: z.object({ idToken: z.string().min(10), mfaToken: z.string().length(6).optional() }) }),
  asyncHandler((req, res) => authController.googleLogin(req, res)),
);

/**
 * Apple and Facebook. Same shape as Google: the client hands over the
 * provider's token and the server verifies it with the issuer — a client
 * claiming an identity is not evidence of one.
 */
router.post(
  '/oauth/:provider(apple|facebook)',
  authLimiter,
  validate({ body: z.object({ token: z.string().min(10), mfaToken: z.string().length(6).optional() }) }),
  asyncHandler(async (req, res) => {
    const result = await authService.loginWithSocial(
      req.params.provider as 'apple' | 'facebook',
      req.body.token,
      { ip: req.ip, userAgent: req.get('user-agent') },
      req.body.mfaToken,
    );
    sendSuccess(res, await gateSession(req, result));
  }),
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

/**
 * Moving between CatoDrive's own websites, which keep separate sessions: the
 * signed-in site asks for a one-time code, the other redeems it for its own
 * session. The code lives a minute and works once.
 */
router.post(
  '/handoff',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await handoffService.create(req.principal!.userId));
  }),
);

router.post(
  '/handoff/redeem',
  authLimiter,
  validate({ body: z.object({ code: z.string().trim().min(20).max(100) }) }),
  asyncHandler(async (req, res) => {
    const result = await handoffService.redeem(req.body.code, { userAgent: req.header('user-agent') ?? undefined, ip: req.ip });
    sendSuccess(res, await gateSession(req, result));
  }),
);

export const authRoutes = router;
