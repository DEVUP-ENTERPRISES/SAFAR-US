import { AssetPartnerModel, type AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { AssetPartnerPayoutModel, type AssetPartnerPayoutDoc } from '../infrastructure/asset-partner-payout.model';
import { assetPartnerStatementService, currentPeriod } from './asset-partner-statement.service';
import { assetPartnerService } from './asset-partner.service';
import { notificationService } from '../../notifications/application/notification.service';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

const usd = (minor: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(minor / 100);
const monthName = (period: string) => new Date(`${period}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export interface PayoutRow {
  partnerId: string;
  displayName: string;
  status: string;
  net: number;
  trips: number;
  cars: number;
  method: 'zelle' | 'check';
  /** Where the money goes, as the partner gave it. */
  sendTo?: string;
  dueDate: Date;
  paid?: AssetPartnerPayoutDoc;
  /** Set while payouts are paused for an open return case. */
  hold?: { reason: string; since: Date };
}

export const assetPartnerPayoutService = {
  /** Every partner's net for one finished month, and whether it has been paid. */
  async month(period: string): Promise<{ period: string; rows: PayoutRow[]; totals: { due: number; paid: number; unpaid: number } }> {
    if (!/^\d{4}-\d{2}$/.test(period)) throw new ValidationError('Pick a month');
    if (period >= currentPeriod()) throw new ValidationError('A month can be paid once it has ended');
    // A partner who left during or after this month is still owed for it.
    const partners = await AssetPartnerModel.find({
      $or: [{ status: { $in: ['onboarding', 'active', 'suspended'] } }, { status: 'exited', exitedAt: { $gte: new Date(`${period}-01T00:00:00Z`) } }],
    }).lean<AssetPartnerDoc[]>();
    const payouts = await AssetPartnerPayoutModel.find({ period, partnerId: { $in: partners.map((p) => p._id) } }).lean<AssetPartnerPayoutDoc[]>();
    const paidBy = new Map(payouts.map((p) => [p.partnerId, p]));

    const rows = await Promise.all(partners.map(async (p): Promise<PayoutRow> => {
      const s = await assetPartnerStatementService.statement(p, period);
      const method = s.terms.payoutMethod as 'zelle' | 'check';
      return {
        partnerId: p._id,
        displayName: p.displayName,
        status: p.status,
        net: s.totals.net,
        trips: s.totals.trips,
        cars: s.lines.length,
        method,
        sendTo: method === 'zelle' ? p.payoutDetails?.zelleHandle : p.payoutDetails?.mailingAddress,
        dueDate: s.payoutDate,
        paid: paidBy.get(p._id),
        hold: p.payoutHold ? { reason: p.payoutHold.reason, since: p.payoutHold.since } : undefined,
      };
    }));
    // Partners with nothing owed and no cars that month are noise on a payout run.
    const relevant = rows.filter((r) => r.cars > 0 || r.paid).sort((a, b) => Number(!!a.paid) - Number(!!b.paid) || b.net - a.net);
    const due = relevant.filter((r) => r.net > 0).reduce((s, r) => s + r.net, 0);
    const paid = relevant.reduce((s, r) => s + (r.paid?.amount ?? 0), 0);
    return { period, rows: relevant, totals: { due, paid, unpaid: Math.max(0, due - paid) } };
  },

  /** Records money sent to a partner for a month; once per month, and never more than the statement's net. */
  async record(
    operatorUserId: string,
    input: { partnerId: string; period: string; amount: number; method: 'zelle' | 'check'; reference: string; note?: string; paidAt?: Date },
  ): Promise<AssetPartnerPayoutDoc> {
    const partner = await assetPartnerService.getById(input.partnerId);
    if (partner.payoutHold) {
      throw new ConflictError(
        partner.payoutHold.reason === 'deceased' ? 'Payouts are on hold until the estate’s papers are checked.' : 'Payouts are on hold until we reach this partner.',
        'PAYOUT_HELD',
      );
    }
    if (!/^\d{4}-\d{2}$/.test(input.period) || input.period >= currentPeriod()) throw new ValidationError('A month can be paid once it has ended');
    const statement = await assetPartnerStatementService.statement(partner, input.period);
    if (statement.totals.net <= 0) throw new ConflictError('Nothing is owed for this month.', 'NOTHING_OWED');
    if (input.amount > statement.totals.net) throw new ConflictError(`That is more than the ${usd(statement.totals.net)} owed for this month.`, 'OVERPAY');
    if (!input.reference.trim()) throw new ValidationError('Add the Zelle confirmation or check number');

    let doc: AssetPartnerPayoutDoc;
    try {
      doc = (await AssetPartnerPayoutModel.create({
        partnerId: partner._id,
        period: input.period,
        amount: input.amount,
        method: input.method,
        reference: input.reference.trim(),
        note: input.note?.trim() || undefined,
        paidAt: input.paidAt ?? new Date(),
        recordedBy: operatorUserId,
      })).toObject();
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw new ConflictError('This month is already recorded as paid.', 'ALREADY_PAID');
      throw err;
    }
    logger.info({ partnerId: partner._id, period: input.period, amount: input.amount }, 'Asset Partner payout recorded');
    void notificationService
      .send({
        userId: partner.userId,
        priority: 'high',
        deepLink: '/asset-partners/statements',
        templateKey: 'account.asset_partner_payout_sent',
        title: `Your ${monthName(input.period)} payout was sent`,
        body: `${usd(input.amount)} by ${input.method === 'zelle' ? 'Zelle' : 'mailed check'} (reference ${doc.reference}).`,
        data: { partnerId: partner._id, period: input.period },
      })
      .catch(() => undefined);
    return doc;
  },

  async forPartner(partnerId: string, periods: string[]): Promise<Map<string, AssetPartnerPayoutDoc>> {
    const docs = await AssetPartnerPayoutModel.find({ partnerId, period: { $in: periods } }).lean<AssetPartnerPayoutDoc[]>();
    return new Map(docs.map((d) => [d.period, d]));
  },

  async remove(payoutId: string): Promise<void> {
    const res = await AssetPartnerPayoutModel.deleteOne({ _id: payoutId });
    if (!res.deletedCount) throw new NotFoundError('Payout');
  },
};
