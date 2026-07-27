import { z } from 'zod';

/**
 * Single source of truth for environment configuration.
 * Parsed & validated once at boot. If anything is missing/malformed,
 * the process refuses to start (fail fast, never at 3am under load).
 */
/**
 * Treat an empty env var as unset.
 *
 * A documented-but-blank line (`EMAIL_API_URL=`) is the normal way to ship a
 * .env template. Without this, an empty string reaches `.url()` and the whole
 * process refuses to boot over a variable the operator deliberately left off.
 */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema.optional());

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default('/api/v1'),
  /**
   * Absolute, publicly reachable base of this API (no trailing slash), e.g.
   * https://api.cato.com. Used to build media URLs that resolve from a browser
   * when no CDN is configured. Defaults to localhost for development.
   */
  PUBLIC_API_URL: z.string().url().optional(),
  APP_NAME: z.string().default('TURA'),

  /**
   * Secret base path for the admin console, e.g. `ctrl-0986-cato-admin`.
   * Keeping the console off the guessable /admin removes it from the bulk
   * credential-stuffing and scanner traffic that hits every /admin on the
   * internet. It is obscurity, NOT access control — RBAC still guards every
   * route — but it meaningfully cuts noise and drive-by attempts.
   */
  ADMIN_SLUG: z
    .string()
    .min(3)
    .regex(/^[a-z0-9-]+$/, 'ADMIN_SLUG must be lowercase letters, digits and dashes')
    .default('admin'),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET too short'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET too short'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

  CORS_ORIGINS: z.string().default('*'),

  // ── Optional integrations: real adapters activate when these are set ──
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_IDENTITY_WEBHOOK_SECRET: optional(z.string()),

  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(), // e.g. https://cdn.cato.com or the bucket URL

  MAPBOX_TOKEN: optional(z.string()),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),

  // ── Bootstrap super-admin (seeded on boot if set) ──
  // ── Notification channels ──────────────────────────────────────────
  // Each is optional; a channel with no credentials logs loudly instead of
  // silently pretending to deliver. Production without email + SMS is an
  // error at boot, not a surprise in week one.
  // Email — either SMTP (any mailbox provider) or a transactional HTTP API.
  // SMTP wins when both are set, since it is the more explicit choice.
  SMTP_HOST: optional(z.string()),
  SMTP_PORT: optional(z.coerce.number().int().positive().max(65535)),
  SMTP_USER: optional(z.string()),
  SMTP_PASS: optional(z.string()),
  /** true for port 465 (implicit TLS). Leave false for 587 STARTTLS. */
  SMTP_SECURE: optional(z.coerce.boolean()),
  EMAIL_API_URL: optional(z.string().url()),
  EMAIL_API_KEY: optional(z.string()),
  /** Envelope sender, e.g. "CATO <no-reply@cato.com>". Required either way. */
  EMAIL_FROM: optional(z.string()),
  SMS_ACCOUNT_SID: optional(z.string()),
  SMS_AUTH_TOKEN: optional(z.string()),
  SMS_FROM: optional(z.string()),
  FCM_SERVER_KEY: optional(z.string()),

  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  ADMIN_NAME: z.string().optional(),
});

/**
 * Production-only guard rails.
 *
 * The base schema is deliberately permissive so local dev is frictionless — but
 * those same defaults are dangerous in production: CORS_ORIGINS defaults to '*'
 * (any site can call the API with a user's credentials) and a short dev secret
 * satisfies min(16). Rather than trust a deploy checklist, production refuses to
 * boot when it is misconfigured. A crash at deploy is recoverable; a wide-open
 * API discovered later is not.
 */
const PROD_MIN_SECRET = 32;

export const envSchemaWithProdGuards = envSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;

  const fail = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  // 1. Wildcard CORS in production would let any origin make credentialed calls.
  if (env.CORS_ORIGINS.includes('*')) {
    fail('CORS_ORIGINS', 'must list explicit origins in production — "*" is not allowed');
  }

  // 2. Secrets must be long, and must not be the values shipped in .env.example.
  const weak = /^(change[-_ ]?me|secret|password|dev|test|example|placeholder)/i;
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    const v = env[key];
    if (v.length < PROD_MIN_SECRET) {
      fail(key, `must be at least ${PROD_MIN_SECRET} characters in production`);
    }
    if (weak.test(v)) fail(key, 'looks like a placeholder — generate a real random secret');
  }

  // 3. Reusing one secret for both tokens means a leaked access token can be
  //    replayed as a refresh token.
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    fail('JWT_REFRESH_SECRET', 'must differ from JWT_ACCESS_SECRET');
  }

  // 4. A seeded admin with a weak password is a permanent back door.
  if (env.ADMIN_PASSWORD && (env.ADMIN_PASSWORD.length < 12 || weak.test(env.ADMIN_PASSWORD))) {
    fail('ADMIN_PASSWORD', 'must be at least 12 characters and not a placeholder in production');
  }

  // 5. Half-configured S3 silently degrades to mock storage, so uploads "work"
  //    in prod but every photo URL is a dead placeholder.
  const s3 = [env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY, env.S3_BUCKET];
  if (s3.some(Boolean) && !s3.every(Boolean)) {
    fail('S3_BUCKET', 'AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and S3_BUCKET must all be set together');
  }

  // 6. Placeholder AWS credentials are worse than none: they are truthy, so a
  //    naive check switches on the real S3 client and every upload fails auth.
  //    In production, refuse rather than fall back to mock (which would serve
  //    dead placeholder image URLs to real users).
  if (s3.every(Boolean)) {
    if ((env.AWS_ACCESS_KEY_ID ?? '').trim().length < 16) {
      fail('AWS_ACCESS_KEY_ID', 'looks like a placeholder — real AWS access key IDs are 20 characters');
    }
    if ((env.AWS_SECRET_ACCESS_KEY ?? '').trim().length < 32) {
      fail('AWS_SECRET_ACCESS_KEY', 'looks like a placeholder — real AWS secret keys are 40 characters');
    }
  }
});

export type Env = z.infer<typeof envSchema>;
