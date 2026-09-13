import { KycModel, type KycDoc } from '../infrastructure/kyc.model';
import { identityProvider, type IdentityResult, type IdentitySession } from '../infrastructure/identity.provider';
import { NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { logger } from '../../../infrastructure/logging/logger';

export interface SubmitKycInput {
  level?: 'basic' | 'full';
  documents: { type: 'license' | 'passport' | 'national_id' | 'selfie'; url: string }[];
}

/**
 * Identity / driver-license verification. Documents are uploaded to S3 first
 * (presigned) and their URLs submitted here. Review is a workflow (ops-gated);
 * a real provider (Onfido/Persona) plugs in behind `submit` later.
 */
export class KycService {
  async submit(userId: string, input: SubmitKycInput): Promise<KycDoc> {
    const doc = await KycModel.findOneAndUpdate(
      { userId },
      {
        $set: { level: input.level ?? 'full', status: 'pending', documents: input.documents },
        $setOnInsert: { userId },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean<KycDoc>();
    emit(EVENTS.KYC_SUBMITTED, doc!._id, { userId });
    return doc!;
  }

  /**
   * Start an automated identity check with the provider (Stripe Identity).
   *
   * Creates a session on the provider and marks the local record pending. The
   * decision arrives asynchronously by webhook, so this returns only the
   * client secret / URL the app needs to open the capture flow.
   */
  async startVerification(userId: string): Promise<IdentitySession> {
    const session = await identityProvider.createSession(userId);
    await KycModel.findOneAndUpdate(
      { userId },
      {
        $set: { status: 'pending', provider: session.provider, providerSessionId: session.sessionId },
        $setOnInsert: { userId, level: 'full' },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    emit(EVENTS.KYC_SUBMITTED, userId, { userId });
    return session;
  }

  /**
   * Apply a provider decision to the local record.
   *
   * On approval the verified fields (name, licence expiry, hashed licence
   * number) are persisted — the licence expiry is what booking eligibility
   * checks against a trip's end date, and the hashed number is what the risk
   * engine uses to catch the same licence on two accounts. Emits the same
   * KYC_APPROVED/REJECTED events the manual path does, so held bookings are
   * released (or cancelled) identically.
   */
  async applyProviderResult(userId: string, result: IdentityResult): Promise<void> {
    if (result.status === 'pending') return;

    const approved = result.status === 'verified';
    await KycModel.updateOne(
      { userId },
      {
        $set: {
          status: approved ? 'approved' : 'rejected',
          decisionAt: new Date(),
          reviewedBy: 'provider',
          rejectionReason: approved ? undefined : (result.reason ?? 'verification_failed'),
          ...(result.licenceExpiry ? { licenceExpiry: new Date(result.licenceExpiry) } : {}),
          ...(result.licenceNumberHash ? { licenceNumberHash: result.licenceNumberHash } : {}),
        },
      },
    );
    logger.info({ userId, status: result.status }, 'identity provider decision applied');
    emit(approved ? EVENTS.KYC_APPROVED : EVENTS.KYC_REJECTED, userId, { userId });
  }

  /** Handle a provider webhook (raw body + signature). */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const parsed = await identityProvider.parseEvent(rawBody, signature);
    if (!parsed) return;
    await this.applyProviderResult(parsed.userId, parsed.result);
  }

  /**
   * Dev/test only: force a decision without a real provider webhook, so the
   * automated flow can be exercised offline. Refuses when a live provider is
   * configured — decisions must then come from the provider.
   */
  async forceDecision(userId: string, result: IdentityResult): Promise<void> {
    if (identityProvider.kind !== 'stub') {
      throw new ValidationError('A live identity provider is configured — decisions come from its webhook');
    }
    await this.applyProviderResult(userId, result);
  }

  async getStatus(userId: string): Promise<{ status: string; level?: string; reason?: string }> {
    const doc = await KycModel.findOne({ userId }).lean<KycDoc>();
    if (!doc) return { status: 'not_started' };
    return { status: doc.status, level: doc.level, reason: doc.rejectionReason };
  }

  async isVerified(userId: string): Promise<boolean> {
    const doc = await KycModel.findOne({ userId }).lean<KycDoc>();
    return doc?.status === 'approved';
  }

  // ── Admin / ops review ──────────────────────────────────────────────
  async adminList(opts: { status?: string; userId?: string; limit?: number; skip?: number }): Promise<{ items: KycDoc[]; total: number }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const filter: Record<string, unknown> = {};
    if (opts.status) filter.status = opts.status;
    // Pull one person's KYC — used when an admin drills in from a user/host row.
    if (opts.userId) filter.userId = opts.userId;
    const [items, total] = await Promise.all([
      KycModel.find(filter).sort({ createdAt: -1 }).skip(opts.skip ?? 0).limit(limit).lean<KycDoc[]>(),
      KycModel.countDocuments(filter),
    ]);
    return { items, total };
  }

  async review(kycId: string, reviewerId: string, decision: 'approved' | 'rejected', reason?: string): Promise<KycDoc> {
    const doc = await KycModel.findByIdAndUpdate(
      kycId,
      { status: decision, reviewedBy: reviewerId, rejectionReason: reason, decisionAt: new Date() },
      { new: true },
    ).lean<KycDoc>();
    if (!doc) throw new NotFoundError('KYC record');
    emit(decision === 'approved' ? EVENTS.KYC_APPROVED : EVENTS.KYC_REJECTED, doc._id, { userId: doc.userId });
    return doc;
  }

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return KycModel.countDocuments(filter);
  }
}

export const kycService = new KycService();
