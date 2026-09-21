import {
  AssetPartnerModel,
  type AssetPartnerDoc,
  type PartnerStatus,
  type PartnerType,
  type PayoutMethod,
} from '../infrastructure/asset-partner.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { userRepository } from '../../users/infrastructure/user.repository';
import { hostService } from '../../hosts/application/host.service';
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

  /**
   * Put someone in the programme from their EMAIL, creating whatever identity
   * is missing underneath.
   *
   * Two callers need this and must not drift apart: approving an application,
   * and ops adding a partner directly (the ~20 owners who joined before the
   * website existed and so have no account to approve against).
   *
   * Three layers have to exist before a partner record can:
   *   User   — the account they sign in with
   *   Host   — the marketplace seller identity a Vehicle hangs off
   *   Partner— programme membership, lifecycle and terms
   *
   * The account is deliberately created WITHOUT a password. passwordHash is
   * optional on User, and verifyEmailOtp issues a session for an existing
   * passwordless account, so the partner claims it by asking for an email code
   * — no invite token to mint, expire or leak. Ops never sets, sees or
   * transports a password on someone else's behalf.
   *
   * Idempotent at every layer: re-running it for the same email returns the
   * existing membership rather than creating a second one.
   */
  async enrolByEmail(input: {
    email: string;
    /** Their name, for the host display name and the partner record. */
    fullName: string;
    businessName?: string;
    phone?: string;
    partnerType: PartnerType;
    applicationId?: string;
  }): Promise<{ partner: AssetPartnerDoc; userId: string; accountCreated: boolean }> {
    const email = input.email.toLowerCase().trim();
    const displayName = input.businessName || input.fullName;

    let user = await userRepository.findByEmail(email);
    const accountCreated = !user;
    if (!user) {
      user = await userRepository.create({
        email,
        firstName: input.fullName.split(' ')[0],
        lastName: input.fullName.split(' ').slice(1).join(' ') || undefined,
        phone: input.phone,
        // Ops vouched for this person off-platform; the address is not proven
        // until they actually receive a code at it, which claiming the account
        // requires them to do.
        emailVerified: false,
      });
    }

    // onboard() throws if they are already a host, so check first — many of
    // these owners already exist as hosts from the pre-website fleet.
    let host = await hostService.getByUserId(user._id);
    if (!host) host = await hostService.onboard(user._id, displayName);
    if (host.verificationStatus !== 'verified') {
      // This is the flag vehicle.service checks before allowing a listing.
      await hostService.setVerification(host._id, 'verified');
    }

    const partner = await this.enrol({
      userId: user._id,
      hostId: host._id,
      applicationId: input.applicationId,
      partnerType: input.partnerType,
      displayName,
      businessName: input.businessName,
      email,
      phone: input.phone,
    });

    return { partner, userId: user._id, accountCreated };
  }

  /**
   * Ops adds a partner they already have an agreement with, outside the
   * application flow. Wraps enrolByEmail and tells the partner they can sign
   * in, since unlike an applicant they never asked for anything and would
   * otherwise have no idea an account exists.
   *
   * `alreadyExisted` is returned rather than throwing on a duplicate: with
   * ~20 owners to enter by hand, re-entering one is an ordinary mistake, and
   * the useful answer is "that's already done" instead of an error.
   */
  async addDirect(
    input: {
      email: string;
      fullName: string;
      businessName?: string;
      phone?: string;
      partnerType: PartnerType;
    },
    opts: { notify?: boolean } = {},
  ): Promise<{ partner: AssetPartnerDoc; alreadyExisted: boolean; accountCreated: boolean }> {
    const before = await AssetPartnerModel.findOne({
      email: input.email.toLowerCase().trim(),
    }).lean<AssetPartnerDoc>();

    const { partner, userId, accountCreated } = await this.enrolByEmail(input);
    const alreadyExisted = !!before;

    if (!alreadyExisted && opts.notify !== false) {
      // Fire-and-forget: a mail failure must not lose the enrolment, which is
      // the durable thing. Ops can resend; they cannot un-lose a record.
      const { notificationService } = await import(
        '../../notifications/application/notification.service'
      );
      void notificationService
        .send({
          userId,
          priority: 'high',
          deepLink: '/asset-partners/dashboard',
          actionLabel: 'Open your partner portal',
          templateKey: 'account.partner_added',
          title: `You're set up on ${'CatoDrive'}`,
          body:
            'Your Asset Partner account is ready. Sign in with this email address — ' +
            'choose "email me a code", no password needed — to add your payout details ' +
            'and track what your vehicles earn.',
          data: { partnerId: partner._id },
        })
        .catch(() => undefined);
    }

    logger.info(
      { partnerId: partner._id, alreadyExisted, accountCreated },
      '🤝 Asset Partner added directly by ops',
    );
    return { partner, alreadyExisted, accountCreated };
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

  /**
   * Everything ops needs to review one partner in one call.
   *
   * The admin detail page showed terms and the statement but nothing about
   * the CARS or what the partner actually told us — so there was no way to
   * check a VIN, a plate or an insurance carrier from the partner record.
   * Applications are matched by id AND email: a partner ops added directly
   * has no applicationId at all, but may still have applied earlier.
   */
  async adminDetail(partnerId: string): Promise<{
    partner: AssetPartnerDoc;
    terms: ResolvedPartnerTerms;
    vehicles: unknown[];
    applications: unknown[];
  }> {
    const partner = await this.getById(partnerId);
    const [{ VehicleModel }, { AssetPartnerApplicationModel }] = await Promise.all([
      import('../../vehicles/infrastructure/vehicle.model'),
      import('../infrastructure/asset-partner-application.model'),
    ]);

    // Match on id or email — a directly-added partner has no applicationId.
    const appFilter: Record<string, unknown>[] = [];
    if (partner.applicationId) appFilter.push({ _id: partner.applicationId });
    if (partner.email) appFilter.push({ email: partner.email.toLowerCase() });

    const [terms, vehicles, applications] = await Promise.all([
      this.termsFor(partner),
      VehicleModel.find({ assetPartnerId: partner._id })
        .select('_id year make model trim status vin plate photos createdAt')
        .sort({ createdAt: -1 })
        .lean(),
      appFilter.length
        ? AssetPartnerApplicationModel.find({ $or: appFilter }).sort({ createdAt: -1 }).lean()
        : Promise.resolve([]),
    ]);

    return { partner, terms, vehicles, applications };
  }
}

export const assetPartnerService = new AssetPartnerService();
