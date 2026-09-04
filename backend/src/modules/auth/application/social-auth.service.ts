import { createHash } from 'crypto';
import { config } from '../../../config';
import { AppError, UnauthorizedError } from '../../../core/errors/app-error';

/**
 * Verifying Apple and Facebook sign-in tokens.
 *
 * Both are verified SERVER-SIDE against the provider. A client-supplied
 * "I am signed in as this email" is not evidence of anything — anyone can post
 * that — so the token is checked with the issuer and the audience is compared
 * against our own client id. Skipping the audience check is the classic hole:
 * a token minted for a completely different app would otherwise be accepted.
 *
 * Apple is the one worth building even before an iOS app exists. App Store
 * review requires Sign in with Apple wherever another third-party login is
 * offered, so shipping social login without it means a rejected submission
 * later and a retrofit under time pressure.
 */

export interface SocialIdentity {
  email: string;
  emailVerified: boolean;
  /** The provider's stable user id — Apple hides the email on later logins. */
  subject: string;
}

interface AppleKey {
  kty: string;
  kid: string;
  n: string;
  e: string;
  alg: string;
}

/** Apple's public keys, cached — they rotate rarely and the endpoint is rate limited. */
let appleKeys: { keys: AppleKey[]; fetchedAt: number } | null = null;
const APPLE_KEY_TTL = 6 * 60 * 60 * 1000;

async function getAppleKeys(): Promise<AppleKey[]> {
  if (appleKeys && Date.now() - appleKeys.fetchedAt < APPLE_KEY_TTL) return appleKeys.keys;
  const res = await fetch('https://appleid.apple.com/auth/keys', { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new UnauthorizedError('Could not reach Apple to verify that sign-in');
  const body = (await res.json()) as { keys: AppleKey[] };
  appleKeys = { keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * Verify an Apple identity token.
 *
 * Apple signs with RS256 and publishes the keys, so the signature is checked
 * against the key the token names rather than trusting the payload.
 */
async function verifyAppleToken(idToken: string): Promise<SocialIdentity> {
  const [headerB64, payloadB64, signatureB64] = idToken.split('.');
  if (!headerB64 || !payloadB64 || !signatureB64) throw new UnauthorizedError('Malformed Apple token');

  const header = JSON.parse(b64url(headerB64).toString('utf8')) as { kid: string; alg: string };
  const payload = JSON.parse(b64url(payloadB64).toString('utf8')) as {
    iss?: string; aud?: string; exp?: number; sub?: string;
    email?: string; email_verified?: string | boolean;
  };

  if (payload.iss !== 'https://appleid.apple.com') throw new UnauthorizedError('Apple token has the wrong issuer');
  // The audience check is what stops a token minted for another app working here.
  if (payload.aud !== config.apple.clientId) throw new UnauthorizedError('Apple token was not issued for this app');
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new UnauthorizedError('Apple token has expired');
  if (!payload.sub) throw new UnauthorizedError('Apple token has no subject');

  const key = (await getAppleKeys()).find((k) => k.kid === header.kid);
  if (!key) throw new UnauthorizedError('Apple token was signed with an unknown key');

  const { createPublicKey, verify } = await import('crypto');
  const pub = createPublicKey({ key: { kty: key.kty, n: key.n, e: key.e } as never, format: 'jwk' });
  const valid = verify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    pub,
    b64url(signatureB64),
  );
  if (!valid) throw new UnauthorizedError('Apple token signature is invalid');

  /*
   * Apple only returns the email on the FIRST authorisation. On every later
   * sign-in the token carries just the subject, so a user who signs in again
   * must be matched on that — looking them up by email alone would create a
   * duplicate account for the same person every time.
   */
  return {
    email: payload.email ?? `${payload.sub}@privaterelay.appleid.com`,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    subject: payload.sub,
  };
}

/**
 * Verify a Facebook access token.
 *
 * `debug_token` is the only endpoint that reports which app a token was issued
 * for; fetching the profile alone would happily accept a token minted for
 * someone else's app.
 */
async function verifyFacebookToken(accessToken: string): Promise<SocialIdentity> {
  const appToken = `${config.facebook.appId}|${config.facebook.appSecret}`;
  const debug = await fetch(
    `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!debug.ok) throw new UnauthorizedError('Could not verify that Facebook sign-in');
  const info = (await debug.json()) as {
    data?: { app_id?: string; is_valid?: boolean; user_id?: string };
  };
  if (!info.data?.is_valid) throw new UnauthorizedError('Facebook token is not valid');
  if (info.data.app_id !== config.facebook.appId) {
    throw new UnauthorizedError('Facebook token was not issued for this app');
  }

  const profile = await fetch(
    `https://graph.facebook.com/v19.0/me?fields=id,email&access_token=${encodeURIComponent(accessToken)}`,
    { signal: AbortSignal.timeout(8000) },
  );
  const me = (await profile.json()) as { id?: string; email?: string };
  // Facebook accounts registered by phone have no email at all; without one we
  // cannot create an account, so say so plainly rather than failing obscurely.
  if (!me.email) {
    throw new AppError({
      code: 'NO_EMAIL_FROM_PROVIDER',
      message: 'Your Facebook account has no email address. Sign up with email instead.',
      httpStatus: 400,
    });
  }
  return { email: me.email, emailVerified: true, subject: me.id ?? me.email };
}

export const socialAuthService = {
  async verify(provider: 'apple' | 'facebook', token: string): Promise<SocialIdentity> {
    if (provider === 'apple') {
      if (!config.apple.enabled) {
        throw new AppError({ code: 'OAUTH_DISABLED', message: 'Apple sign-in is not configured', httpStatus: 501 });
      }
      return verifyAppleToken(token);
    }
    if (!config.facebook.enabled) {
      throw new AppError({ code: 'OAUTH_DISABLED', message: 'Facebook login is not configured', httpStatus: 501 });
    }
    return verifyFacebookToken(token);
  },

  /** Stable, non-reversible id for a provider subject, for lookup. */
  subjectHash(provider: string, subject: string): string {
    return createHash('sha256').update(`${provider}:${subject}`).digest('hex');
  },
};
