import { AssetPartnerModel, type AssetPartnerDoc, type FeePlan, type JoiningFee } from '../infrastructure/asset-partner.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { paymentGateway } from '../../payments/infrastructure/gateway.provider';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import type { CheckoutState } from '../../payments/domain/payment-gateway';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { draftTerms } from './asset-partner-terms.service';
import { notificationService } from '../../notifications/application/notification.service';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';
import { config } from '../../../config';

export const FEE_KIND = 'asset_partner_fee';
const CURRENCY = 'USD';

export type FeeStatus = 'none' | 'due' | 'paid' | 'deferred' | 'waived' | 'refunded';

export interface FeeView {
  status: FeeStatus;
  amountCents: number;
  platformFeeCents: number;
  totalCents: number;
  currency: string;
  setAt?: Date;
  paidAt?: Date;
  paidCents?: number;
  refundedAt?: Date;
  refundReason?: string;
  plan?: FeePlan;
  /** Owed from the partner's first earnings. */
  deferredCents?: number;
}

const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const signed = (p: Pick<AssetPartnerDoc, 'agreement' | 'nda'>) => !!p.agreement?.signedAt && !!p.nda?.signedAt;

export function feeDue(p: Pick<AssetPartnerDoc, 'joiningFee'>): boolean {
  const f = p.joiningFee;
  return !!f && f.amountCents > 0 && !f.paidAt && !f.deferredAt;
}

/** What the partner pays: exactly the amount ops set, nothing when waived. */
export function feeTotal(f: Pick<JoiningFee, 'amountCents' | 'platformFeeCents'>): number {
  return f.amountCents > 0 ? f.amountCents : 0;
}

/** The total split into registration and the platform fee it includes. */
export function feeParts(f: Pick<JoiningFee, 'amountCents' | 'platformFeeCents'>): { registrationCents: number; platformFeeCents: number } {
  const total = feeTotal(f);
  const platformFeeCents = Math.min(f.platformFeeCents ?? 0, total);
  return { registrationCents: total - platformFeeCents, platformFeeCents };
}

export interface FeeLine {
  key: 'gps' | 'detailing' | 'insurance' | 'registration';
  label: string;
  amountCents: number;
  /** The usual price, shown struck through while the launch offer runs. */
  regularCents?: number;
}

/** What the registration pays for, as the partner and Stripe see it; the platform fee stays inside the total. */
export async function feeLines(p: Pick<AssetPartnerDoc, 'joiningFee' | 'terms'>): Promise<FeeLine[]> {
  const total = p.joiningFee ? feeTotal(p.joiningFee) : 0;
  if (total <= 0) return [];
  const [t, cfg] = await Promise.all([draftTerms(p), platformConfigService.get()]);
  const gps = total - t.detailingMonthlyCents - t.insuranceMonthlyCents;
  if (gps <= 0) return [{ key: 'registration', label: 'Asset Partner registration', amountCents: total }];
  const regular = cfg.assetPartner.gpsRegularCents ?? 0;
  const lines: FeeLine[] = [
    { key: 'gps', label: 'GPS tracker installation', amountCents: gps, ...(regular > gps ? { regularCents: regular } : {}) },
    { key: 'detailing', label: 'Car wash subscription enrollment', amountCents: t.detailingMonthlyCents },
    { key: 'insurance', label: 'Off-trip insurance enrollment', amountCents: t.insuranceMonthlyCents },
  ];
  return lines.filter((l) => l.amountCents > 0);
}

export function feeView(f?: JoiningFee): FeeView {
  if (!f) return { status: 'none', amountCents: 0, platformFeeCents: 0, totalCents: 0, currency: CURRENCY };
  const status: FeeStatus = f.refundedAt ? 'refunded' : (f.deferredCents ?? 0) > 0 ? 'deferred' : f.paidAt ? 'paid' : f.amountCents > 0 ? 'due' : 'waived';
  const parts = feeParts(f);
  return { status, amountCents: parts.registrationCents, platformFeeCents: parts.platformFeeCents, totalCents: feeTotal(f), currency: f.currency, setAt: f.setAt, paidAt: f.paidAt, paidCents: f.paidCents, refundedAt: f.refundedAt, refundReason: f.refundReason, plan: f.plan, deferredCents: f.deferredCents };
}

async function partnerOrThrow(id: string): Promise<AssetPartnerDoc> {
  const p = await AssetPartnerModel.findById(id).lean<AssetPartnerDoc>();
  if (!p) throw new NotFoundError('Partner');
  return p;
}

export const assetPartnerFeeService = {
  /** Whether registration fees are on, the platform fee each includes, and whether partners may pay from earnings. */
  async settings(): Promise<{ enabled: boolean; platformFeeCents: number; payLaterEnabled: boolean }> {
    const ap = (await platformConfigService.get()).assetPartner;
    return { enabled: ap.joiningFeeEnabled !== false, platformFeeCents: ap.registrationPlatformFeeCents ?? 0, payLaterEnabled: ap.registrationPayLaterEnabled !== false };
  },

  /** The ways this partner may pay, and what each takes today. */
  async options(p: Pick<AssetPartnerDoc, 'joiningFee'>): Promise<{ plan: FeePlan; todayCents: number; fromEarningsCents: number }[]> {
    const f = p.joiningFee;
    const total = f ? feeTotal(f) : 0;
    if (total <= 0) return [];
    const now = { plan: 'now' as const, todayCents: total, fromEarningsCents: 0 };
    if (!(await this.settings()).payLaterEnabled) return [now];
    const platform = feeParts(f!).platformFeeCents;
    return [
      now,
      { plan: 'later', todayCents: 0, fromEarningsCents: total },
      ...(platform > 0 && platform < total ? [{ plan: 'platform_now' as const, todayCents: platform, fromEarningsCents: total - platform }] : []),
    ];
  },

  /** The partner chooses to pay everything from their car's first earnings: nothing is charged now. */
  async payFromEarnings(userId: string): Promise<FeeView> {
    let p = await AssetPartnerModel.findOne({ userId }).lean<AssetPartnerDoc>();
    if (!p) throw new NotFoundError('Partner');
    p = await this.sync(p);
    if (!feeDue(p)) return feeView(p.joiningFee);
    if (!(await this.options(p)).some((o) => o.plan === 'later')) throw new ConflictError('Paying from earnings isn’t available right now.', 'PAY_LATER_OFF');
    if (p.joiningFee!.sessionId) await paymentGateway.expireCheckout(p.joiningFee!.sessionId).catch(() => undefined);
    const total = feeTotal(p.joiningFee!);
    const updated = await AssetPartnerModel.findOneAndUpdate(
      { _id: p._id, 'joiningFee.paidAt': { $exists: false }, 'joiningFee.deferredAt': { $exists: false } },
      { $set: { 'joiningFee.plan': 'later', 'joiningFee.deferredCents': total, 'joiningFee.deferredAt': new Date() }, $unset: { 'joiningFee.sessionId': 1, 'joiningFee.sessionUrl': 1 }, $inc: { 'joiningFee.attempt': 1 } },
      { new: true },
    ).lean<AssetPartnerDoc>();
    logger.info({ partnerId: p._id, total }, 'Asset Partner fee set to come from earnings');
    return feeView((updated ?? (await partnerOrThrow(p._id))).joiningFee);
  },

  /** Ops must state each new partner's registration fee when approving (0 waives it), unless fees are switched off. */
  async requireAtApproval(amountCents: number | undefined): Promise<void> {
    if ((await this.settings()).enabled && amountCents === undefined) {
      throw new ValidationError('Enter the registration fee for this partner, or 0 to waive it');
    }
  },

  /** Sets the fee as ops approves; a partner who already paid or signed is left alone. */
  async setAtApproval(partnerId: string, amountCents: number | undefined, by: string): Promise<void> {
    const p = await partnerOrThrow(partnerId);
    if (p.joiningFee?.paidAt || signed(p)) return;
    if (!(await this.settings()).enabled) return;
    await this.setAmount(partnerId, amountCents ?? 0, by);
  },

  /** Ops changes or waives (0) the fee before it is paid; any open payment page is closed first. */
  async setAmount(partnerId: string, amountCents: number, by: string): Promise<FeeView> {
    if (!Number.isInteger(amountCents) || amountCents < 0) throw new ValidationError('Enter the fee in whole cents, or 0 to waive it');
    let p = await partnerOrThrow(partnerId);
    if (p.joiningFee?.paidAt) throw new ConflictError('This partner has already paid the fee.', 'FEE_PAID');
    if (signed(p)) throw new ConflictError('The fee can only be set before the partner signs.', 'FEE_AFTER_SIGNING');
    if (p.joiningFee?.sessionId) {
      p = await this.sync(p);
      if (p.joiningFee?.paidAt) throw new ConflictError('This partner has just paid the fee.', 'FEE_PAID');
      if (p.joiningFee?.sessionId) await paymentGateway.expireCheckout(p.joiningFee.sessionId);
    }
    const platformFeeCents = amountCents > 0 ? Math.min((await this.settings()).platformFeeCents, amountCents) : 0;
    const updated = await AssetPartnerModel.findOneAndUpdate(
      { _id: partnerId, 'joiningFee.paidAt': { $exists: false } },
      {
        $set: { 'joiningFee.amountCents': amountCents, 'joiningFee.platformFeeCents': platformFeeCents, 'joiningFee.currency': CURRENCY, 'joiningFee.setBy': by, 'joiningFee.setAt': new Date() },
        $unset: { 'joiningFee.sessionId': 1, 'joiningFee.sessionUrl': 1, 'joiningFee.plan': 1, 'joiningFee.deferredCents': 1, 'joiningFee.deferredAt': 1 },
        $inc: { 'joiningFee.attempt': 1 },
      },
      { new: true },
    ).lean<AssetPartnerDoc>();
    if (!updated) throw new ConflictError('This partner has already paid the fee.', 'FEE_PAID');
    logger.info({ partnerId, amountCents, by }, 'Asset Partner fee set');
    return feeView(updated.joiningFee);
  },

  /** The hosted payment page for the partner: the open one if there is one, otherwise a new one. */
  async checkout(userId: string, plan: 'now' | 'platform_now' = 'now'): Promise<{ url?: string; paid: boolean }> {
    let p = await AssetPartnerModel.findOne({ userId }).lean<AssetPartnerDoc>();
    if (!p) throw new NotFoundError('Partner');
    p = await this.sync(p);
    if (!feeDue(p)) return { paid: !!p.joiningFee?.paidAt || !!p.joiningFee?.deferredAt };
    const option = (await this.options(p)).find((o) => o.plan === plan);
    if (!option) throw new ConflictError('That way to pay isn’t available right now.', 'PLAN_UNAVAILABLE');
    let fee = p.joiningFee!;
    if (fee.sessionId && fee.sessionUrl && (fee.plan ?? 'now') === plan) return { url: fee.sessionUrl, paid: false };
    // A page opened for the other amount is closed so the partner can never pay both.
    if (fee.sessionId) {
      await paymentGateway.expireCheckout(fee.sessionId).catch(() => undefined);
      await AssetPartnerModel.updateOne({ _id: p._id, 'joiningFee.sessionId': fee.sessionId }, { $unset: { 'joiningFee.sessionId': 1, 'joiningFee.sessionUrl': 1 }, $inc: { 'joiningFee.attempt': 1 } });
      p = await partnerOrThrow(p._id);
      fee = p.joiningFee!;
    }
    const lines = plan === 'now'
      ? (await feeLines(p)).map((l) => ({ name: l.regularCents ? `${l.label} (launch offer)` : l.label, amountCents: l.amountCents }))
      : [{ name: 'Processing fee (the rest comes from your car’s first earnings)', amountCents: option.todayCents }];

    const user = await UserModel.findById(userId).select('email').lean<{ email?: string }>();
    const base = config.notifications.partnerWebUrl || config.notifications.webUrl;
    // The same attempt always maps to the same Stripe page, so a double click cannot open two.
    const session = await paymentGateway.createCheckout({
      lines,
      currency: fee.currency,
      description: 'CatoDrive Asset Partner registration (one-time, non-refundable)',
      customerEmail: user?.email ?? p.email,
      successUrl: `${base}/onboarding?fee=paid`,
      cancelUrl: `${base}/onboarding?fee=cancelled`,
      idempotencyKey: `apfee_${p._id}_${fee.attempt}_${plan}`,
      metadata: { kind: FEE_KIND, partnerId: p._id, plan },
    });
    await AssetPartnerModel.updateOne(
      { _id: p._id, 'joiningFee.attempt': fee.attempt, 'joiningFee.paidAt': { $exists: false } },
      { $set: { 'joiningFee.sessionId': session.sessionId, 'joiningFee.sessionUrl': session.url, 'joiningFee.plan': plan } },
    );
    return { url: session.url, paid: false };
  },

  /** Brings the partner's fee in line with Stripe: records a payment, or forgets a page that expired. */
  async sync(p: AssetPartnerDoc): Promise<AssetPartnerDoc> {
    const sessionId = p.joiningFee?.sessionId;
    if (!sessionId || p.joiningFee?.paidAt) return p;
    const state = await paymentGateway.retrieveCheckout(sessionId);
    if (state.paid) {
      await this.recordPaid(p._id, state);
    } else if (state.status === 'expired') {
      await AssetPartnerModel.updateOne(
        { _id: p._id, 'joiningFee.sessionId': sessionId },
        { $unset: { 'joiningFee.sessionId': 1, 'joiningFee.sessionUrl': 1 }, $inc: { 'joiningFee.attempt': 1 } },
      );
    } else {
      return p;
    }
    return partnerOrThrow(p._id);
  },

  /** From the webhook: a hosted page for a partner fee was paid. */
  async onCheckoutCompleted(sessionId: string): Promise<void> {
    const state = await paymentGateway.retrieveCheckout(sessionId);
    if (state.metadata.kind !== FEE_KIND || !state.metadata.partnerId || !state.paid) return;
    await this.recordPaid(state.metadata.partnerId, state);
  },

  /** Records a payment once; a second payment for the same partner is refunded, never kept. */
  async recordPaid(partnerId: string, state: CheckoutState): Promise<void> {
    const now = new Date();
    const before = await AssetPartnerModel.findById(partnerId).select('joiningFee').lean<AssetPartnerDoc>();
    const total = before?.joiningFee ? feeTotal(before.joiningFee) : 0;
    // Paying less than the total only happens on the platform-fee-now page; the rest comes from earnings.
    const rest = state.metadata.plan === 'platform_now' || before?.joiningFee?.plan === 'platform_now' ? Math.max(0, total - state.amountTotal) : 0;
    const updated = await AssetPartnerModel.findOneAndUpdate(
      { _id: partnerId, 'joiningFee.paidAt': { $exists: false } },
      {
        $set: {
          'joiningFee.paidAt': now, 'joiningFee.paidCents': state.amountTotal, 'joiningFee.intentId': state.intentId,
          ...(rest > 0 ? { 'joiningFee.plan': 'platform_now', 'joiningFee.deferredCents': rest, 'joiningFee.deferredAt': now } : {}),
        },
        $unset: { 'joiningFee.sessionUrl': 1 },
      },
      { new: true },
    ).lean<AssetPartnerDoc>();

    if (!updated) {
      const p = await AssetPartnerModel.findById(partnerId).select('joiningFee').lean<AssetPartnerDoc>();
      if (state.intentId && p?.joiningFee?.intentId && p.joiningFee.intentId !== state.intentId) {
        await paymentGateway.refund(state.intentId, { amount: state.amountTotal, currency: CURRENCY }, `apfee_dup_${state.intentId}`);
        logger.warn({ partnerId, intentId: state.intentId }, 'Asset Partner fee paid twice; the second payment was refunded');
      }
      return;
    }

    await ledgerService.post({
      txnId: `apfee_${partnerId}`,
      refType: FEE_KIND,
      refId: partnerId,
      currency: CURRENCY,
      description: 'Asset Partner fee',
      legs: [
        { account: Account.gatewayClearing(), direction: 'credit', amount: state.amountTotal },
        { account: Account.platformRevenue(), direction: 'debit', amount: state.amountTotal },
      ],
    }).catch((err) => logger.error({ err, partnerId }, 'Asset Partner fee ledger entry failed'));
    logger.info({ partnerId, amountCents: state.amountTotal }, 'Asset Partner fee paid');

    await notificationService
      .send({
        userId: updated.userId,
        templateKey: 'asset_partner.joining_fee_paid',
        title: 'Payment received',
        body: rest > 0
          ? `We received your ${dollars(state.amountTotal)} payment on ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })}. The remaining ${dollars(rest)} comes from your car’s first earnings. Next, sign your agreement.`
          : `We received your one-time, non-refundable ${dollars(state.amountTotal)} registration payment on ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })}. It covers every car you place with CatoDrive. Next, sign your agreement.`,
        deepLink: '/onboarding',
        actionLabel: 'Continue',
        data: { partnerId },
      })
      .catch((err) => logger.warn({ err, partnerId }, 'fee receipt not sent'));
  },

  /** Ops refunds a paid fee in full, with a reason kept on the record. */
  async refund(partnerId: string, by: string, reason: string): Promise<FeeView> {
    const p = await partnerOrThrow(partnerId);
    const f = p.joiningFee;
    if (!f?.paidAt || !f.intentId) throw new ConflictError('There is no paid fee to refund.', 'FEE_NOT_PAID');
    if (f.refundedAt) return feeView(f);
    const cents = f.paidCents ?? f.amountCents;
    await paymentGateway.refund(f.intentId, { amount: cents, currency: f.currency }, `apfee_refund_${partnerId}`);
    return this.markRefunded(partnerId, cents, by, reason);
  },

  /** A refund made in the Stripe dashboard. */
  async reconcileRefund(intentId: string, amountRefunded: number): Promise<void> {
    const p = await AssetPartnerModel.findOne({ 'joiningFee.intentId': intentId }).select('joiningFee').lean<AssetPartnerDoc>();
    const f = p?.joiningFee;
    if (!p || !f || f.refundedAt) return;
    if (amountRefunded < (f.paidCents ?? f.amountCents)) {
      logger.warn({ partnerId: p._id, amountRefunded }, 'Asset Partner fee partly refunded in Stripe; record left as paid');
      return;
    }
    await this.markRefunded(p._id, amountRefunded, 'stripe', 'Refunded in Stripe');
  },

  async markRefunded(partnerId: string, cents: number, by: string, reason: string): Promise<FeeView> {
    const updated = await AssetPartnerModel.findOneAndUpdate(
      { _id: partnerId, 'joiningFee.paidAt': { $exists: true }, 'joiningFee.refundedAt': { $exists: false } },
      { $set: { 'joiningFee.refundedAt': new Date(), 'joiningFee.refundedBy': by, 'joiningFee.refundReason': reason.trim() } },
      { new: true },
    ).lean<AssetPartnerDoc>();
    if (updated) {
      await ledgerService.post({
        txnId: `apfee_refund_${partnerId}`,
        refType: FEE_KIND,
        refId: partnerId,
        currency: CURRENCY,
        description: 'Asset Partner fee refund',
        legs: [
          { account: Account.gatewayClearing(), direction: 'debit', amount: cents },
          { account: Account.platformRevenue(), direction: 'credit', amount: cents },
        ],
      }).catch((err) => logger.error({ err, partnerId }, 'Asset Partner fee refund ledger entry failed'));
      logger.info({ partnerId, cents, by }, 'Asset Partner fee refunded');
    }
    return feeView((updated ?? (await partnerOrThrow(partnerId))).joiningFee);
  },

  /** Registration fee revenue for HQ and the operations panel: totals plus the latest fees, newest first. */
  async report(limit = 50): Promise<FeeReport> {
    const [totals] = await AssetPartnerModel.aggregate<Omit<FeeReport, 'currency' | 'rows'>>([
      { $match: { joiningFee: { $exists: true } } },
      {
        $project: {
          kept: { $and: [{ $gt: ['$joiningFee.paidAt', null] }, { $not: [{ $gt: ['$joiningFee.refundedAt', null] }] }] },
          refunded: { $gt: ['$joiningFee.refundedAt', null] },
          due: { $and: [{ $gt: ['$joiningFee.amountCents', 0] }, { $not: [{ $gt: ['$joiningFee.paidAt', null] }] }, { $not: [{ $gt: ['$joiningFee.deferredAt', null] }] }] },
          waived: { $lte: ['$joiningFee.amountCents', 0] },
          charged: { $ifNull: ['$joiningFee.paidCents', '$joiningFee.amountCents'] },
          platform: { $ifNull: ['$joiningFee.platformFeeCents', 0] },
          amount: '$joiningFee.amountCents',
          deferred: { $cond: [{ $gt: ['$joiningFee.refundedAt', null] }, 0, { $ifNull: ['$joiningFee.deferredCents', 0] }] },
        },
      },
      {
        $group: {
          _id: null,
          collectedCents: { $sum: { $cond: ['$kept', '$charged', 0] } },
          platformFeeCents: { $sum: { $cond: ['$kept', { $min: ['$platform', '$charged'] }, 0] } },
          refundedCents: { $sum: { $cond: ['$refunded', '$charged', 0] } },
          dueCents: { $sum: { $cond: ['$due', '$amount', 0] } },
          paidCount: { $sum: { $cond: ['$kept', 1, 0] } },
          dueCount: { $sum: { $cond: ['$due', 1, 0] } },
          waivedCount: { $sum: { $cond: ['$waived', 1, 0] } },
          refundedCount: { $sum: { $cond: ['$refunded', 1, 0] } },
          fromEarningsCents: { $sum: '$deferred' },
          deferredCount: { $sum: { $cond: [{ $gt: ['$deferred', 0] }, 1, 0] } },
        },
      },
    ]).exec();
    const docs = await AssetPartnerModel.find({ joiningFee: { $exists: true } })
      .sort({ 'joiningFee.paidAt': -1, 'joiningFee.setAt': -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .select('displayName businessName joiningFee')
      .lean<Pick<AssetPartnerDoc, '_id' | 'displayName' | 'businessName' | 'joiningFee'>[]>();
    const t = totals ?? { collectedCents: 0, platformFeeCents: 0, refundedCents: 0, dueCents: 0, paidCount: 0, dueCount: 0, waivedCount: 0, refundedCount: 0, fromEarningsCents: 0, deferredCount: 0 };
    return {
      currency: CURRENCY,
      collectedCents: t.collectedCents, platformFeeCents: t.platformFeeCents, refundedCents: t.refundedCents, dueCents: t.dueCents,
      paidCount: t.paidCount, dueCount: t.dueCount, waivedCount: t.waivedCount, refundedCount: t.refundedCount,
      fromEarningsCents: t.fromEarningsCents, deferredCount: t.deferredCount,
      rows: docs.map((d) => {
        const v = feeView(d.joiningFee);
        return { partnerId: d._id, name: d.businessName || d.displayName, status: v.status, totalCents: v.totalCents, platformFeeCents: v.platformFeeCents, paidCents: v.paidCents, deferredCents: v.deferredCents, setAt: v.setAt, paidAt: v.paidAt, refundedAt: v.refundedAt };
      }),
    };
  },
};

export interface FeeReport {
  currency: string;
  collectedCents: number;
  platformFeeCents: number;
  refundedCents: number;
  dueCents: number;
  paidCount: number;
  dueCount: number;
  waivedCount: number;
  refundedCount: number;
  /** Set to be taken from partners' first earnings (not yet net of what statements have taken). */
  fromEarningsCents: number;
  deferredCount: number;
  rows: { partnerId: string; name: string; status: FeeStatus; totalCents: number; platformFeeCents: number; paidCents?: number; deferredCents?: number; setAt?: Date; paidAt?: Date; refundedAt?: Date }[];
}
