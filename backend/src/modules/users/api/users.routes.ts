import { Router } from 'express';
import { z } from 'zod';
import { usersController } from './users.controller';
import { userService } from '../application/user.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendSuccess, sendCreated } from '../../../shared/http/api-response';

const router = Router();

router.get(
  '/me',
  authenticate,
  asyncHandler((req, res) => usersController.me(req, res)),
);

const profileSchema = z.object({
  firstName: z.string().min(1).max(60).optional(),
  lastName: z.string().min(1).max(60).optional(),
  phone: z.string().min(6).max(20).optional(),
  avatarUrl: z.string().url().optional(),
  dateOfBirth: z.string().optional(),
});

router.patch(
  '/me',
  authenticate,
  validate({ body: profileSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.updateProfile(req.principal!.userId, req.body));
  }),
);

// ── Account setup gate ──────────────────────────────────────────────────

/** After login the client calls this; if `complete` is false it routes the
 *  guest to setup before letting them into the app. */
router.get(
  '/me/profile-status',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.profileStatus(req.principal!.userId));
  }),
);

const onboardingSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  dateOfBirth: z.string().min(4), // service validates it parses and clears min age
  phone: z.string().trim().min(6).max(20),
  avatarUrl: z.string().url(),
  address: z.object({
    label: z.string().max(40).optional(),
    line1: z.string().trim().min(2).max(200),
    city: z.string().trim().min(1).max(120),
    state: z.string().trim().min(1).max(120),
    zip: z.string().trim().min(2).max(20),
    country: z.string().trim().min(2).max(60),
  }),
  emergencyContact: z.object({
    name: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(6).max(20),
    relation: z.string().trim().max(40).optional(),
  }),
});

router.post(
  '/me/onboarding',
  authenticate,
  validate({ body: onboardingSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.completeOnboarding(req.principal!.userId, req.body));
  }),
);

// ── Notification preferences ────────────────────────────────────────────
const catBool = z.boolean();
const notifPrefsSchema = z.object({
  push: z.boolean().optional(),
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  smsCriticalOnly: z.boolean().optional(),
  quietHours: z.boolean().optional(),
  categories: z
    .object({ trips: catBool, messages: catBool, payments: catBool, promotions: catBool, reviews: catBool, account: catBool })
    .partial()
    .optional(),
});

router.get(
  '/me/notification-preferences',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, (await userService.get(req.principal!.userId)).notificationPrefs ?? {});
  }),
);

router.patch(
  '/me/notification-preferences',
  authenticate,
  validate({ body: notifPrefsSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.updateNotificationPrefs(req.principal!.userId, req.body));
  }),
);

// ── Saved addresses ─────────────────────────────────────────────────────
const addressSchema = z.object({
  label: z.string().min(1).max(40),
  line1: z.string().min(1).max(120),
  city: z.string().min(1).max(60),
  state: z.string().max(60).default(''),
  zip: z.string().max(12).default(''),
  country: z.string().max(60).default('USA'),
  isDefault: z.boolean().optional(),
});

router.post(
  '/me/addresses',
  authenticate,
  validate({ body: addressSchema }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await userService.addAddress(req.principal!.userId, req.body));
  }),
);

router.delete(
  '/me/addresses/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.removeAddress(req.principal!.userId, req.params.id));
  }),
);

router.post(
  '/me/addresses/:id/default',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.setDefaultAddress(req.principal!.userId, req.params.id));
  }),
);

// ── Emergency contacts ──────────────────────────────────────────────────
const contactSchema = z.object({
  name: z.string().min(1).max(80),
  phone: z.string().min(6).max(20),
  relation: z.string().max(40).optional(),
});

router.post(
  '/me/emergency-contacts',
  authenticate,
  validate({ body: contactSchema }),
  asyncHandler(async (req, res) => {
    sendCreated(res, await userService.addEmergencyContact(req.principal!.userId, req.body));
  }),
);

router.delete(
  '/me/emergency-contacts/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.removeEmergencyContact(req.principal!.userId, req.params.id));
  }),
);

// ── Two-factor authentication (TOTP) ─────────────────────────────────────
router.get(
  '/me/mfa',
  authenticate,
  asyncHandler(async (req, res) => sendSuccess(res, await userService.mfaStatus(req.principal!.userId))),
);
router.post(
  '/me/mfa/setup',
  authenticate,
  asyncHandler(async (req, res) => sendSuccess(res, await userService.setupMfa(req.principal!.userId))),
);
router.post(
  '/me/mfa/enable',
  authenticate,
  validate({ body: z.object({ token: z.string().length(6) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await userService.enableMfa(req.principal!.userId, req.body.token))),
);
router.post(
  '/me/mfa/disable',
  authenticate,
  validate({ body: z.object({ token: z.string().length(6) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await userService.disableMfa(req.principal!.userId, req.body.token))),
);

/** Register this device's push token so notifications reach the app. */
router.post(
  '/me/devices',
  authenticate,
  validate({ body: z.object({ token: z.string().min(10).max(4096) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.registerDevice(req.principal!.userId, req.body.token));
  }),
);

/** Unregister a device token (sign-out on a device, or opt-out). */
router.delete(
  '/me/devices',
  authenticate,
  validate({ body: z.object({ token: z.string().min(10).max(4096) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await userService.unregisterDevice(req.principal!.userId, req.body.token));
  }),
);

export const usersRoutes = router;
