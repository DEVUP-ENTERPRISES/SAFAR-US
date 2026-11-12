import { AssetPartnerModel, type AssetPartnerDoc, type JoiningFee } from '../infrastructure/asset-partner.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { paymentGateway } from '../../payments/infrastructure/gateway.provider';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import type { CheckoutState } from '../../payments/domain/payment-gateway';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { notificationService } from '../../notifications/application/notification.service';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';
import { config } from '../../../config';

export const FEE_KIND = 'asset_partner_fee';
const CURRENCY = 'USD';

export type FeeStatus = 'none' | 'due' | 'paid' | 'waived' | 'refunded';

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
}

const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const signed = (p: Pick<AssetPartnerDoc, 'agreement' | 'nda'>) => !!p.agreement?.signedAt && !!p.nda?.signedAt;

export function feeDue(p: Pick<AssetPartnerDoc, 'joiningFee'>): boolean {
  const f = p.joiningFee;
  return !!f && f.amountCents > 0 && !f.paidAt;
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

export function feeView(f?: JoiningFee): FeeView {
  if (!f) return { status: 'none', amountCents: 0, platformFeeCents: 0, totalCents: 0, currency: CURRENCY };
  const status: FeeStatus = f.refundedAt ? 'refunded' : f.paidAt ? 'paid' : f.amountCents > 0 ? 'due' : 'waived';
  const parts = feeParts(f);
  return { status, amountCents: parts.registrationCents, platformFeeCents: parts.platformFeeCents, totalCents: feeTotal(f), currency: f.currency, setAt: f.setAt, paidAt: f.paidAt, paidCents: f.paidCents, refundedAt: f.refundedAt, refundReason: f.refundReason };
}

async function partnerOrThrow(id: string): Promise<AssetPartnerDoc> {
  const p = await AssetPartnerModel.findById(id).lean<AssetPartnerDoc>();
  if (!p) throw new NotFoundError('Partner');
  return p;
}

export const assetPartnerFeeService = {
  /** Whether registration fees are on, and the platform fee added to each. */
  async settings(): Promise<{ enabled: boolean; platformFeeCents: number }> {
    const ap = (await platformConfigService.get()).assetPartner;
    return { enabled: ap.joiningFeeEnabled !== false, platformFeeCents: ap.registrationPlatformFeeCents ?? 0 };
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
        $unset: { 'joiningFee.sessionId': 1, 'joiningFee.sessionUrl': 1 },
        $inc: { 'joiningFee.attempt': 1 },
      },
      { new: true },
    ).lean<AssetPartnerDoc>();
    if (!updated) throw new ConflictError('This partner has already paid the fee.', 'FEE_PAID');
    logger.info({ partnerId, amountCents, by }, 'Asset Partner fee set');
    return feeView(updated.joiningFee);
  },

  /** The hosted payment page for the partner: the open one if there is one, otherwise a new one. */
  async checkout(userId: string): Promise<{ url?: string; paid: boolean }> {
    let p = await AssetPartnerModel.findOne({ userId }).lean<AssetPartnerDoc>();
    if (!p) throw new NotFoundError('Partner');
    p = await this.sync(p);
    if (!feeDue(p)) return { paid: !!p.joiningFee?.paidAt };
    const fee = p.joiningFee!;
    if (fee.sessionId && fee.sessionUrl) return { url: fee.sessionUrl, paid: false };
    const parts = feeParts(fee);

    const user = await UserModel.findById(userId).select('email').lean<{ email?: string }>();
    const base = config.notifications.partnerWebUrl || config.notifications.webUrl;
    // The same attempt always maps to the same Stripe page, so a double click cannot open two.
    const session = await paymentGateway.createCheckout({
      lines: [
        { name: 'CatoDrive Asset Partner registration fee (one-time, non-refundable)', amountCents: parts.registrationCents },
        ...(parts.platformFeeCents > 0 ? [{ name: 'Platform fee', amountCents: parts.platformFeeCents }] : []),
      ],
      currency: fee.currency,
      description: 'CatoDrive Asset Partner registration',
      customerEmail: user?.email ?? p.email,
      successUrl: `${base}/onboarding?fee=paid`,
      cancelUrl: `${base}/onboarding?fee=cancelled`,
      idempotencyKey: `apfee_${p._id}_${fee.attempt}`,
      metadata: { kind: FEE_KIND, partnerId: p._id },
    });
    await AssetPartnerModel.updateOne(
      { _id: p._id, 'joiningFee.attempt': fee.attempt, 'joiningFee.paidAt': { $exists: false } },
      { $set: { 'joiningFee.sessionId': session.sessionId, 'joiningFee.sessionUrl': session.url } },
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
    const updated = await AssetPartnerModel.findOneAndUpdate(
      { _id: partnerId, 'joiningFee.paidAt': { $exists: false } },
      { $set: { 'joiningFee.paidAt': now, 'joiningFee.paidCents': state.amountTotal, 'joiningFee.intentId': state.intentId }, $unset: { 'joiningFee.sessionUrl': 1 } },
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
        body: `We received your one-time, non-refundable ${dollars(state.amountTotal)} registration payment on ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })}. It covers every car you place with CatoDrive. Next, sign your agreement.`,
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
};
