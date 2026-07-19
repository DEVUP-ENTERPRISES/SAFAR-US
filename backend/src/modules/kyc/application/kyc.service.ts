import { KycModel, type KycDoc } from '../infrastructure/kyc.model';
import { NotFoundError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';

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
  async adminList(opts: { status?: string; limit?: number; skip?: number }): Promise<{ items: KycDoc[]; total: number }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const filter: Record<string, unknown> = {};
    if (opts.status) filter.status = opts.status;
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
