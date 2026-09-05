import { envSchemaWithProdGuards } from './env.schema';

/**
 * The production boot guards.
 *
 * These turn a deploy checklist into a wall: a misconfigured production
 * environment must fail to boot, loudly, rather than start in a state that is
 * exploitable later. Each case here is a real hole the guard closes — proven by
 * asserting the specific field is flagged.
 */

// A production env that passes every guard, which each test then breaks in one
// place to prove that one guard fires.
const GOOD: Record<string, string> = {
  NODE_ENV: 'production',
  MONGO_URI: 'mongodb://localhost:27017/cato',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  CORS_ORIGINS: 'https://app.cato.com',
  ADMIN_EMAIL: 'admin@cato.com',
  ADMIN_PASSWORD: 'a-strong-admin-pass-123',
  TRUST_PROXY_HOPS: '2',
};

/** Parse and return the set of field paths that failed, or [] on success. */
function failedFields(env: Record<string, string | undefined>): string[] {
  const prev = process.env.TRUST_PROXY_HOPS;
  // The TRUST_PROXY_HOPS guard reads process.env directly (to detect "unset"),
  // so mirror the fixture there for these tests.
  if (env.TRUST_PROXY_HOPS === undefined) delete process.env.TRUST_PROXY_HOPS;
  else process.env.TRUST_PROXY_HOPS = env.TRUST_PROXY_HOPS;
  try {
    const r = envSchemaWithProdGuards.safeParse(env);
    return r.success ? [] : r.error.issues.map((i) => String(i.path[0]));
  } finally {
    if (prev === undefined) delete process.env.TRUST_PROXY_HOPS;
    else process.env.TRUST_PROXY_HOPS = prev;
  }
}

describe('production env guards', () => {
  it('accepts a fully-configured production env', () => {
    expect(failedFields(GOOD)).toEqual([]);
  });

  it('rejects wildcard CORS', () => {
    expect(failedFields({ ...GOOD, CORS_ORIGINS: '*' })).toContain('CORS_ORIGINS');
  });

  it('rejects a short JWT secret', () => {
    expect(failedFields({ ...GOOD, JWT_ACCESS_SECRET: 'short' })).toContain('JWT_ACCESS_SECRET');
  });

  it('rejects reused access/refresh secrets', () => {
    const same = 'z'.repeat(40);
    expect(failedFields({ ...GOOD, JWT_ACCESS_SECRET: same, JWT_REFRESH_SECRET: same })).toContain(
      'JWT_REFRESH_SECRET',
    );
  });

  it('requires a Stripe webhook secret when the Stripe key is set', () => {
    expect(failedFields({ ...GOOD, STRIPE_SECRET_KEY: 'sk_live_realish_key_value' })).toContain(
      'STRIPE_WEBHOOK_SECRET',
    );
  });

  it('rejects a Stripe TEST key in production', () => {
    const fields = failedFields({
      ...GOOD,
      STRIPE_SECRET_KEY: 'sk_test_abc',
      STRIPE_WEBHOOK_SECRET: 'whsec_abc',
    });
    expect(fields).toContain('STRIPE_SECRET_KEY');
  });

  it('requires the admin to be provisioned', () => {
    const noAdmin = { ...GOOD };
    delete noAdmin.ADMIN_EMAIL;
    delete noAdmin.ADMIN_PASSWORD;
    expect(failedFields(noAdmin)).toContain('ADMIN_EMAIL');
  });

  it('requires TRUST_PROXY_HOPS to be set explicitly', () => {
    const noHops = { ...GOOD };
    delete noHops.TRUST_PROXY_HOPS;
    expect(failedFields(noHops)).toContain('TRUST_PROXY_HOPS');
  });

  it('applies none of these guards outside production', () => {
    expect(failedFields({ ...GOOD, NODE_ENV: 'development', CORS_ORIGINS: '*', JWT_ACCESS_SECRET: 'dev-secret-16chars' })).toEqual([]);
  });
});
