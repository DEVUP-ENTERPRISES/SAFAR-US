import { AssetPartnerTermsVersionModel, type AssetPartnerTermsVersionDoc, type ResolvedTermsSnapshot } from '../infrastructure/asset-partner-terms.model';
import type { AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

export const TERM_FIELDS = ['managementFeeBps', 'insuranceMonthlyCents', 'detailingMonthlyCents', 'deductibleCapCents', 'maintenanceApprovalCents', 'payoutDayOfMonth'] as const;
export type TermField = (typeof TERM_FIELDS)[number];
export type TermsPatch = Partial<Record<TermField, number>>;

/** The platform defaults with a partner's pre-signing overrides on top: what an unsigned partner would sign. */
export async function draftTerms(partner: Pick<AssetPartnerDoc, 'terms'>): Promise<ResolvedTermsSnapshot> {
  const d = (await platformConfigService.get()).assetPartner;
  const o = partner.terms ?? {};
  return {
    managementFeeBps: o.managementFeeBps ?? d.managementFeeBps,
    insuranceMonthlyCents: o.insuranceMonthlyCents ?? d.insuranceMonthlyCents,
    detailingMonthlyCents: o.detailingMonthlyCents ?? d.detailingMonthlyCents,
    deductibleCapCents: o.deductibleCapCents ?? d.deductibleCapCents,
    maintenanceApprovalCents: o.maintenanceApprovalCents ?? d.maintenanceApprovalCents,
    payoutDayOfMonth: o.payoutDayOfMonth ?? d.payoutDayOfMonth,
  };
}

/** The version in force at `at`, from versions sorted newest first; null before the first one. */
export function versionAt(versions: Pick<AssetPartnerTermsVersionDoc, 'status' | 'effectiveFrom' | 'terms'>[], at: Date): ResolvedTermsSnapshot | null {
  for (const v of versions) {
    if (v.status === 'active' && new Date(v.effectiveFrom).getTime() <= at.getTime()) return v.terms;
  }
  return null;
}

const sameTerms = (a: ResolvedTermsSnapshot, b: ResolvedTermsSnapshot) => TERM_FIELDS.every((k) => a[k] === b[k]);

export class AssetPartnerTermsService {
  private async activeVersions(partnerId: string) {
    return AssetPartnerTermsVersionModel.find({ partnerId, status: 'active' })
      .sort({ effectiveFrom: -1, createdAt: -1 })
      .lean<AssetPartnerTermsVersionDoc[]>();
  }

  /**
   * Resolves terms at any moment: the signed version in force then, or (before anything was signed)
   * the draft. Load once and ask per trip, so a statement costs one query however many trips it has.
   */
  async timeline(partner: AssetPartnerDoc): Promise<(at: Date) => ResolvedTermsSnapshot> {
    const [versions, draft] = await Promise.all([this.activeVersions(partner._id), draftTerms(partner)]);
    if (versions.length === 0) return () => draft;
    const earliest = versions[versions.length - 1];
    // Trips before the first signed version (older data) use the earliest signed terms, never today's defaults.
    return (at) => versionAt(versions, at) ?? earliest.terms;
  }

  async at(partner: AssetPartnerDoc, at = new Date()): Promise<ResolvedTermsSnapshot> {
    return (await this.timeline(partner))(at);
  }

  /** Written once, when the partner signs their agreement: the terms they signed, in full. */
  async writeBaseline(partner: AssetPartnerDoc, terms: ResolvedTermsSnapshot, signedAt: Date, envelopeId?: string): Promise<void> {
    const exists = await AssetPartnerTermsVersionModel.exists({ partnerId: partner._id, kind: 'baseline' });
    if (exists) return;
    await AssetPartnerTermsVersionModel.create({
      partnerId: partner._id, terms, effectiveFrom: signedAt, requestedFrom: signedAt, status: 'active', kind: 'baseline',
      envelopeId, createdBy: partner.userId, activatedAt: signedAt,
    });
  }

  /**
   * A change for a partner who has already signed. It waits for their signature on an amendment and takes
   * effect from the later of the requested date and the moment they sign, so nothing ever applies backwards.
   */
  async requestChange(
    partner: AssetPartnerDoc,
    patch: TermsPatch,
    opts: { requestedFrom?: Date; reason?: string; actorId: string },
  ): Promise<AssetPartnerTermsVersionDoc> {
    if (!partner.agreement?.signedAt) throw new ConflictError('This partner has not signed yet; change their terms directly.', 'NOT_SIGNED');
    const signedAt = new Date(partner.agreement.signedAt);
    // A partner who signed before versions existed gets their baseline from what applied when they signed.
    await this.writeBaseline(partner, await draftTerms(partner), signedAt, partner.agreement.envelopeId);
    const current = await this.at(partner, new Date());
    const next: ResolvedTermsSnapshot = { ...current };
    for (const k of TERM_FIELDS) if (patch[k] !== undefined) next[k] = patch[k]!;
    if (sameTerms(current, next)) throw new ValidationError('These are already the partner’s terms.');

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const requestedFrom = opts.requestedFrom ?? new Date();
    if (requestedFrom < startOfToday) throw new ValidationError('A change can start today or later, never in the past.');

    try {
      const doc = await AssetPartnerTermsVersionModel.create({
        partnerId: partner._id, terms: next, effectiveFrom: requestedFrom, requestedFrom, status: 'pending_signature', kind: 'amendment',
        reason: opts.reason?.trim() || undefined, createdBy: opts.actorId,
      });
      logger.info({ partnerId: partner._id, versionId: doc._id }, 'Asset Partner terms change sent for signature');
      return doc.toObject();
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw new ConflictError('A change is already waiting for this partner’s signature. Cancel it first.', 'CHANGE_PENDING');
      throw err;
    }
  }

  async pending(partnerId: string): Promise<AssetPartnerTermsVersionDoc | null> {
    return AssetPartnerTermsVersionModel.findOne({ partnerId, status: 'pending_signature' }).lean<AssetPartnerTermsVersionDoc>();
  }

  async history(partnerId: string): Promise<AssetPartnerTermsVersionDoc[]> {
    return AssetPartnerTermsVersionModel.find({ partnerId }).sort({ createdAt: -1 }).limit(50).lean<AssetPartnerTermsVersionDoc[]>();
  }

  /** Brings a signed amendment into force; only a version still waiting can move. */
  async activate(versionId: string, signedAt: Date, envelopeId: string): Promise<AssetPartnerTermsVersionDoc> {
    const v = await AssetPartnerTermsVersionModel.findOne({ _id: versionId, status: 'pending_signature' }).lean<AssetPartnerTermsVersionDoc>();
    if (!v) throw new ConflictError('This change is no longer waiting for a signature.', 'CHANGE_CLOSED');
    const effectiveFrom = new Date(Math.max(new Date(v.requestedFrom).getTime(), signedAt.getTime()));
    const res = await AssetPartnerTermsVersionModel.findOneAndUpdate(
      { _id: versionId, status: 'pending_signature' },
      { $set: { status: 'active', effectiveFrom, activatedAt: signedAt, envelopeId } },
      { new: true },
    ).lean<AssetPartnerTermsVersionDoc>();
    if (!res) throw new ConflictError('This change is no longer waiting for a signature.', 'CHANGE_CLOSED');
    return res;
  }

  /** Staff withdraw a change, or the partner declines it; the current terms simply continue. */
  async close(partnerId: string, how: 'cancelled' | 'declined', actorId: string): Promise<AssetPartnerTermsVersionDoc> {
    const res = await AssetPartnerTermsVersionModel.findOneAndUpdate(
      { partnerId, status: 'pending_signature' },
      { $set: { status: how, closedAt: new Date(), closedBy: actorId } },
      { new: true },
    ).lean<AssetPartnerTermsVersionDoc>();
    if (!res) throw new NotFoundError('Waiting change');
    return res;
  }
}

export const assetPartnerTermsService = new AssetPartnerTermsService();
