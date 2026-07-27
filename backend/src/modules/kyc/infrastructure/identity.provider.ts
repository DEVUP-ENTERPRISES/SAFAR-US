import Stripe from 'stripe';
import { createHash } from 'crypto';
import { config } from '../../../config';
import { logger } from '../../../infrastructure/logging/logger';
import { ExternalServiceError } from '../../../core/errors/app-error';

/** What a verification returns once the provider has decided. */
export interface IdentityResult {
  status: 'verified' | 'rejected' | 'pending';
  reason?: string;
  /** Extracted, verified fields — the point of using a real provider. */
  firstName?: string;
  lastName?: string;
  dob?: string;
  licenceExpiry?: string;
  /** Hashed before it ever leaves this layer — never stored in clear. */
  licenceNumberHash?: string;
}

export interface IdentitySession {
  provider: 'stripe' | 'stub';
  sessionId: string;
  /** Client secret for Stripe.js, or a hosted URL to redirect to. */
  clientSecret?: string;
  url?: string;
}

export interface IdentityProvider {
  readonly kind: 'stripe' | 'stub';
  /** Begin a document + selfie check for a user. */
  createSession(userId: string): Promise<IdentitySession>;
  /** Verify + parse a provider webhook; returns null for events we ignore. */
  parseEvent(rawBody: Buffer, signature: string): Promise<{ userId: string; result: IdentityResult } | null>;
}

function hashLicence(v: string): string {
  return createHash('sha256').update(v.trim().toUpperCase()).digest('hex');
}

/**
 * Stripe Identity: document capture, liveness/selfie match, and authenticity
 * checks, run by Stripe. We never see or store the raw document — only the
 * verified outputs (name, DOB, expiry) and a decision.
 */
class StripeIdentityProvider implements IdentityProvider {
  readonly kind = 'stripe' as const;
  private readonly stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  async createSession(userId: string): Promise<IdentitySession> {
    const vs = await this.stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: { userId },
      options: {
        document: {
          // The two checks that make this worth doing: a live selfie matched to
          // the document, and a real capture rather than a photo of a screen.
          require_matching_selfie: true,
          require_live_capture: true,
          allowed_types: ['driving_license', 'passport', 'id_card'],
        },
      },
    });
    return { provider: 'stripe', sessionId: vs.id, clientSecret: vs.client_secret ?? undefined, url: vs.url ?? undefined };
  }

  async parseEvent(rawBody: Buffer, signature: string) {
    const secret = config.kyc.identityWebhookSecret;
    if (!secret) throw new ExternalServiceError('Identity webhook secret not configured');

    const event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    if (!event.type.startsWith('identity.verification_session.')) return null;

    const vs = event.data.object as Stripe.Identity.VerificationSession;
    const userId = (vs.metadata?.userId as string) ?? '';
    if (!userId) return null;

    if (event.type === 'identity.verification_session.verified') {
      // Pull the verified outputs — this needs an explicit retrieve with expand,
      // because the webhook payload omits the sensitive fields by design.
      const full = await this.stripe.identity.verificationSessions.retrieve(vs.id, {
        expand: ['verified_outputs'],
      });
      const o = full.verified_outputs;
      const doc = (o as unknown as { document?: { number?: string; expiration_date?: { day: number; month: number; year: number } } })?.document;
      const exp = doc?.expiration_date;
      return {
        userId,
        result: {
          status: 'verified' as const,
          firstName: o?.first_name ?? undefined,
          lastName: o?.last_name ?? undefined,
          dob: o?.dob ? `${o.dob.year}-${String(o.dob.month).padStart(2, '0')}-${String(o.dob.day).padStart(2, '0')}` : undefined,
          licenceExpiry: exp ? `${exp.year}-${String(exp.month).padStart(2, '0')}-${String(exp.day).padStart(2, '0')}` : undefined,
          licenceNumberHash: doc?.number ? hashLicence(doc.number) : undefined,
        },
      };
    }

    if (event.type === 'identity.verification_session.requires_input') {
      const err = vs.last_error;
      return { userId, result: { status: 'rejected' as const, reason: err?.reason ?? 'verification_failed' } };
    }

    return null; // created / processing — nothing to persist yet
  }
}

/**
 * Dev stub: no Stripe account needed. `createSession` returns a fake session,
 * and there is a service-level helper to force a decision so the whole flow is
 * testable end to end offline. Never selected when a Stripe key is present.
 */
class StubIdentityProvider implements IdentityProvider {
  readonly kind = 'stub' as const;
  async createSession(userId: string): Promise<IdentitySession> {
    logger.warn({ userId }, 'Identity: STUB session — no real verification will run');
    return { provider: 'stub', sessionId: `stub_${userId}_${Date.now()}`, url: 'about:blank' };
  }
  async parseEvent(): Promise<null> {
    return null; // the stub has no webhooks; decisions are forced via the service
  }
}

export const identityProvider: IdentityProvider = config.kyc.identityEnabled
  ? new StripeIdentityProvider(config.stripe.secretKey!)
  : new StubIdentityProvider();

logger.info(`Identity verification: ${config.kyc.identityEnabled ? 'Stripe Identity (live)' : 'Stub (dev, manual review)'}`);
