import {
  AssetPartnerModel,
  type AssetPartnerDoc,
  type PartnerStatus,
  type PartnerType,
  type PayoutMethod,
} from '../infrastructure/asset-partner.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { NotFoundError, ConflictError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Asset Partner programme membership: who is in it, what stage they are at,
 * and on what commercial terms.
 *
 * Kept apart from host.service on purpose. A host is a marketplace seller; a
 * partner is a managed-programme member whose money is worked out monthly
 * after a management fee and two recurring per-vehicle costs. Overloading the
 * host record could express neither the lifecycle nor the terms.
 */

/** Terms actually in force for one partner — no optional fields left. */
export interface ResolvedPartnerTerms {
  managementFeeBps: number;
  insuranceMonthlyCents: number;
  detailingMonthlyCents: number;
  deductibleCapCents: number;
  maintenanceApprovalCents: number;
  payoutDayOfMonth: number;
  payoutMethod: PayoutMethod;
  /** True when any field was negotiated away from the platform default. */
  negotiated: boolean;
}

/** Which stage can follow which — a partner cannot un-exit. */
const ALLOWED: Record<PartnerStatus, PartnerStatus[]> = {
  onboarding: ['active', 'exited'],
  active: ['suspended', 'exited'],
  suspended: ['active', 'exited'],
  exited: [],
};

export class AssetPartnerService {
  /**
   * Admit an approved applicant to the programme.
   *
   * Idempotent: re-approving or re-running this for the same account returns
   * the existing membership rather than creating a second one, because the
   * unique index on userId would otherwise throw on a retry.
   */
  async enrol(input: {
    userId: string;
    hostId: string;
    applicationId?: string;
    partnerType: PartnerType;
    displayName: string;
    businessName?: string;
    email?: string;
    phone?: string;
  }): Promise<AssetPartnerDoc> {
    const existing = await AssetPartnerModel.findOne({ userId: input.userId }).lean<AssetPartnerDoc>();
    if (existing) return existing;

    const doc = await AssetPartnerModel.create({
      ...input,
      // Approved on paper is not yet earning: the car still has to be
      // photographed, inspected and listed. Saying 'active' here would tell a
      // partner they were live before anything could be booked.
      status: 'onboarding',
      terms: {},
      approvedAt: new Date(),
    });

    logger.info(
      { partnerId: doc._id, userId: input.userId, partnerType: input.partnerType },
      '🤝 Asset Partner enrolled',
    );
    return doc.toObject();
  }

  async getByUserId(userId: string): Promise<AssetPartnerDoc | null> {
    return AssetPartnerModel.findOne({ userId }).lean<AssetPartnerDoc>();
  }

  async getById(partnerId: string): Promise<AssetPartnerDoc> {
    const doc = await AssetPartnerModel.findById(partnerId).lean<AssetPartnerDoc>();
    if (!doc) throw new NotFoundError('Asset Partner');
    return doc;
  }

  /**
   * The terms in force: platform defaults with the partner's negotiated
   * overrides laid on top. One resolver, so the dashboard, the statement and
   * the admin view can never quote a partner different numbers.
   */
  async termsFor(partner: AssetPartnerDoc): Promise<ResolvedPartnerTerms> {
    const d = (await platformConfigService.get()).assetPartner;
    const o = partner.terms ?? {};
    return {
      managementFeeBps: o.managementFeeBps ?? d.managementFeeBps,
      insuranceMonthlyCents: o.insuranceMonthlyCents ?? d.insuranceMonthlyCents,
      detailingMonthlyCents: o.detailingMonthlyCents ?? d.detailingMonthlyCents,
      deductibleCapCents: o.deductibleCapCents ?? d.deductibleCapCents,
      maintenanceApprovalCents: o.maintenanceApprovalCents ?? d.maintenanceApprovalCents,
      payoutDayOfMonth: o.payoutDayOfMonth ?? d.payoutDayOfMonth,
      payoutMethod: o.payoutMethod ?? d.payoutMethod,
      negotiated: Object.values(o).some((v) => v !== undefined && v !== null),
    };
  }

  async transition(
    partnerId: string,
    to: PartnerStatus,
    opts: { reason?: string } = {},
  ): Promise<AssetPartnerDoc> {
    const partner = await this.getById(partnerId);
    if (partner.status === to) return partner;
    if (!ALLOWED[partner.status].includes(to)) {
      throw new ConflictError(
        `An Asset Partner cannot go from ${partner.status} to ${to}`,
        'INVALID_STATE',
      );
    }

    const patch: Record<string, unknown> = { status: to };
    if (to === 'active') patch.activatedAt = new Date();
    if (to === 'suspended') {
      patch.suspendedAt = new Date();
      patch.suspendedReason = opts.reason;
    }
    if (to === 'exited') patch.exitedAt = new Date();

    await AssetPartnerModel.updateOne({ _id: partnerId }, patch);
    logger.info({ partnerId, from: partner.status, to }, 'Asset Partner status changed');
    return this.getById(partnerId);
  }

  /** Negotiate terms for one partner. Undefined fields fall back to platform. */
  async setTerms(partnerId: string, terms: AssetPartnerDoc['terms']): Promise<AssetPartnerDoc> {
    await this.getById(partnerId); // 404s if unknown
    await AssetPartnerModel.updateOne({ _id: partnerId }, { terms });
    logger.info({ partnerId, terms }, 'Asset Partner terms updated');
    return this.getById(partnerId);
  }

  /**
   * Self-service: where the partner's own money goes. Deliberately a
   * DIFFERENT endpoint from setTerms — a partner may correct their own
   * mailing address or Zelle handle, but must never be able to write to
   * `terms`, which is a negotiated commercial agreement only ops can change.
   */
  async setPayoutDetails(
    userId: string,
    details: NonNullable<AssetPartnerDoc['payoutDetails']>,
  ): Promise<AssetPartnerDoc> {
    const partner = await this.getByUserId(userId);
    if (!partner) throw new NotFoundError('Asset Partner');
    await AssetPartnerModel.updateOne({ _id: partner._id }, { payoutDetails: details });
    logger.info({ partnerId: partner._id }, 'Asset Partner payout details updated');
    return this.getById(partner._id);
  }

  async adminList(opts: { status?: PartnerStatus; limit?: number; skip?: number }): Promise<{
    items: AssetPartnerDoc[];
    total: number;
  }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const filter: Record<string, unknown> = {};
    if (opts.status) filter.status = opts.status;
    const [items, total] = await Promise.all([
      AssetPartnerModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(opts.skip ?? 0)
        .limit(limit)
        .lean<AssetPartnerDoc[]>(),
      AssetPartnerModel.countDocuments(filter),
    ]);
    return { items, total };
  }
}

export const assetPartnerService = new AssetPartnerService();
