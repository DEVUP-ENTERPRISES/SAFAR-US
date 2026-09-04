import dotenv from 'dotenv';
import { envSchemaWithProdGuards, type Env } from './env.schema';

dotenv.config();

// The prod-guarded schema adds checks that only apply when NODE_ENV=production
// (explicit CORS origins, strong distinct secrets, complete S3 config). Dev is
// unaffected; production refuses to boot insecure.
const parsed = envSchemaWithProdGuards.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:');
  // eslint-disable-next-line no-console
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env: Env = parsed.data;

/**
 * Are these AWS credentials plausibly real, rather than a placeholder?
 *
 * We only check shape — the real proof is the first signed request — but that
 * is enough to stop `AWS_ACCESS_KEY_ID=xxx` from switching the app onto the S3
 * gateway and breaking every upload in production. When this returns false the
 * app stays on mock storage, which is loudly wrong in dev instead of quietly
 * broken in prod.
 */
function isUsableAwsCreds(keyId?: string, secret?: string, bucket?: string): boolean {
  if (!keyId || !secret || !bucket) return false;
  // Real AWS access key IDs are 20 chars (AKIA…/ASIA…); secrets are 40.
  return keyId.trim().length >= 16 && secret.trim().length >= 32 && bucket.trim().length > 0;
}

/**
 * Frozen, typed configuration object consumed everywhere.
 * Grouped by concern so call sites read like `config.jwt.accessTtl`.
 */

/** Decode + parse the base64 Firebase service account, or null if unset/bad. */
function parseServiceAccount(b64?: string):
  | { projectId: string; clientEmail: string; privateKey: string; tokenUri: string }
  | null {
  if (!b64) return null;
  try {
    const j = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    if (!j.project_id || !j.client_email || !j.private_key) return null;
    return {
      projectId: j.project_id,
      clientEmail: j.client_email,
      privateKey: j.private_key,
      tokenUri: j.token_uri ?? 'https://oauth2.googleapis.com/token',
    };
  } catch {
    return null;
  }
}

export const config = Object.freeze({
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  isDev: env.NODE_ENV === 'development',
  adminPanel: {
    /** Secret base path for the console; every admin route is `/{slug}/...`. */
    slug: env.ADMIN_SLUG,
    basePath: `/${env.ADMIN_SLUG}`,
  },
  app: {
    name: env.APP_NAME,
    port: env.PORT,
    apiPrefix: env.API_PREFIX,
    /** Absolute base for URLs we hand to browsers (media, webhooks, emails). */
    publicUrl: (env.PUBLIC_API_URL ?? `http://localhost:${env.PORT}${env.API_PREFIX}`).replace(/\/+$/, ''),
  },
  db: {
    uri: env.MONGO_URI,
  },
  redis: {
    url: env.REDIS_URL,
  },
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtl: env.JWT_REFRESH_TTL,
  },
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
  },
  cors: {
    // Strip stray quotes/backticks/whitespace so a value like `*` still parses.
    origins: env.CORS_ORIGINS.split(',')
      .map((o) => o.trim().replace(/[`'"]/g, ''))
      .filter(Boolean),
  },
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    enabled: !!env.STRIPE_SECRET_KEY,
  },
  kyc: {
    // Stripe Identity runs on the same secret key; it needs its own webhook
    // signing secret. Live only when both the key and that secret are present.
    identityWebhookSecret: env.STRIPE_IDENTITY_WEBHOOK_SECRET,
    identityEnabled: !!env.STRIPE_SECRET_KEY && !!env.STRIPE_IDENTITY_WEBHOOK_SECRET,
  },
  observability: {
    sentryDsn: env.SENTRY_DSN,
    /** Shown against each event so a regression can be traced to a deploy. */
    release: env.RELEASE ?? 'dev',
  },
  aws: {
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    s3Bucket: env.S3_BUCKET,
    s3PublicBaseUrl: env.S3_PUBLIC_BASE_URL,
    // Truthiness is not enough: a placeholder like AWS_ACCESS_KEY_ID=xxx is a
    // non-empty string, so it would switch on the real S3 gateway and every
    // upload would fail against AWS with an auth error — in production, while
    // the config looked "set". Require credentials that are at least shaped
    // like real ones (AWS key IDs are 20 chars, secrets 40) before trusting them.
    enabled: isUsableAwsCreds(env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY, env.S3_BUCKET),
  },
  notifications: {
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT ?? 587,
    smtpUser: env.SMTP_USER,
    smtpPass: env.SMTP_PASS,
    // Port 465 is implicit TLS; 587 upgrades via STARTTLS. Infer when unset so
    // a correct port with a missing flag still connects.
    smtpSecure: env.SMTP_SECURE ?? (env.SMTP_PORT === 465),
    smtpEnabled: !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.EMAIL_FROM),
    emailApiUrl: env.EMAIL_API_URL,
    emailApiKey: env.EMAIL_API_KEY,
    emailFrom: env.EMAIL_FROM,
    emailApiEnabled: !!(env.EMAIL_API_URL && env.EMAIL_API_KEY && env.EMAIL_FROM),
    emailEnabled: !!(
      env.EMAIL_FROM &&
      ((env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) || (env.EMAIL_API_URL && env.EMAIL_API_KEY))
    ),
    // Account SID identifies the account in the request URL (always required).
    smsAccountSid: env.SMS_ACCOUNT_SID,
    // Basic-auth credentials: prefer a scoped, revocable API key (SK…) over the
    // full-account Auth Token. Resolved once here so the provider stays dumb.
    smsAuthUser: env.SMS_API_KEY_SID || env.SMS_ACCOUNT_SID,
    smsAuthPass: env.SMS_API_KEY_SECRET || env.SMS_AUTH_TOKEN,
    smsUsingApiKey: !!(env.SMS_API_KEY_SID && env.SMS_API_KEY_SECRET),
    smsFrom: env.SMS_FROM,
    smsEnabled: !!(
      env.SMS_ACCOUNT_SID &&
      env.SMS_FROM &&
      ((env.SMS_API_KEY_SID && env.SMS_API_KEY_SECRET) || env.SMS_AUTH_TOKEN)
    ),
    // FCM HTTP v1: a service account, decoded from base64. The legacy server
    // key (fcmServerKey) is retained only for backwards config; v1 is used when
    // a service account is present, which is the only path Google still supports.
    fcmServerKey: env.FCM_SERVER_KEY,
    fcmServiceAccount: parseServiceAccount(env.FCM_SERVICE_ACCOUNT_BASE64),
    pushEnabled: !!env.FCM_SERVICE_ACCOUNT_BASE64,
  },
  maps: {
    mapboxToken: env.MAPBOX_TOKEN,
    googleKey: env.GOOGLE_MAPS_API_KEY,
    // Any geocoder configured (or the stub) means maps resolve — kept for the
    // boot log and the frontend-key hints.
    enabled: !!env.MAPBOX_TOKEN || !!env.GOOGLE_MAPS_API_KEY,
  },
  ai: {
    apiKey: env.OPENROUTER_API_KEY,
    fallbackApiKey: env.OPENROUTER_API_KEY_FALLBACK,
    model: env.OPENROUTER_MODEL,
    dailyBudgetCents: env.AI_DAILY_BUDGET_CENTS,
    enabled: !!env.OPENROUTER_API_KEY,
  },
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    enabled: !!env.GOOGLE_CLIENT_ID,
  },
  vinAudit: {
    apiKey: env.VINAUDIT_API_KEY,
    enabled: !!env.VINAUDIT_API_KEY,
  },
  apple: {
    clientId: env.APPLE_CLIENT_ID,
    enabled: !!env.APPLE_CLIENT_ID,
  },
  facebook: {
    appId: env.FACEBOOK_APP_ID,
    appSecret: env.FACEBOOK_APP_SECRET,
    // Both halves or nothing: an app id without a secret cannot verify a token,
    // and would advertise a button that always fails.
    enabled: !!(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET),
  },
  admin: {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
    name: env.ADMIN_NAME ?? 'CATO Admin',
    enabled: !!(env.ADMIN_EMAIL && env.ADMIN_PASSWORD),
  },
});

export type Config = typeof config;
