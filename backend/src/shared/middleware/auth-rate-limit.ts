import rateLimit from 'express-rate-limit';
import { config } from '../../config';

/**
 * Strict brute-force limiter for credential and OTP endpoints. The global
 * limiter (≈120/min across everything) is a DDoS backstop, not password
 * protection — login, registration, OTP and OAuth need a much tighter, per-IP
 * cap so an attacker can't grind passwords or spam codes.
 *
 * In-memory store (single instance). Behind multiple instances, back this with
 * rate-limit-redis so the cap is shared across the fleet.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please try again in a few minutes.' },
  },
  // Active in production; skipped in dev/test so local e2e suites and manual
  // testing aren't throttled.
  skip: () => !config.isProd,
});
