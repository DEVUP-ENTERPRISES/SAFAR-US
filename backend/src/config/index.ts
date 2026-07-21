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
  maps: {
    googleKey: env.GOOGLE_MAPS_API_KEY,
    enabled: !!env.GOOGLE_MAPS_API_KEY,
  },
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    enabled: !!env.GOOGLE_CLIENT_ID,
  },
  admin: {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
    name: env.ADMIN_NAME ?? 'CATO Admin',
    enabled: !!(env.ADMIN_EMAIL && env.ADMIN_PASSWORD),
  },
});

export type Config = typeof config;
