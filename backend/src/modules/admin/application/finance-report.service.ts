import { LedgerModel } from '../../payments/infrastructure/ledger.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { PayoutModel } from '../../payouts/infrastructure/payout.model';
import { Account } from '../../payments/domain/ledger.accounts';

/**
 * Platform finance, derived entirely from the ledger and bookings — never a
 * stored/aggregated number that can drift. Every figure here can be traced to
 * ledger rows, so the admin report reconciles by construction.
 */
export class FinanceReportService {
  async report(months = 6): Promise<{
    currency: string;
    revenueByMonth: { month: string; amount: number }[];
    gmvByMonth: { month: string; amount: number }[];
    /** Where platform revenue comes from — the donut. */
    revenueMix: { label: string; value: number }[];
    totals: {
      gmv: number;
      platformRevenue: number;
      hostEarnings: number;
      tax: number;
      protection: number;
      delivery: number;
      payoutsOwed: number;
      payoutsPaid: number;
    };
  }> {
    const since = new Date();
    since.setMonth(since.getMonth() - months + 1);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    // Platform revenue is DEBIT-normal (commission debits it). Month buckets.
    const [revenueByMonth, gmvByMonth, breakdown, payoutAgg] = await Promise.all([
      this.monthlyByDirection(Account.platformRevenue(), 'debit', since),
      this.gmvByMonth(since),
      this.revenueBreakdown(),
      this.payoutTotals(),
    ]);

    const platformRevenue = breakdown.commission;
    const revenueMix = [
      { label: 'Commission', value: breakdown.commission },
      { label: 'Protection', value: breakdown.protection },
      { label: 'Delivery', value: breakdown.delivery },
      { label: 'Membership', value: breakdown.membership },
    ].filter((s) => s.value > 0);

    return {
      currency: 'USD',
      revenueByMonth,
      gmvByMonth,
      revenueMix,
      totals: {
        gmv: breakdown.gmv,
        platformRevenue,
        hostEarnings: breakdown.hostEarnings,
        tax: breakdown.tax,
        protection: breakdown.protection,
        delivery: breakdown.delivery,
        payoutsOwed: payoutAgg.owed,
        payoutsPaid: payoutAgg.paid,
      },
    };
  }

  /** Monthly sum for one account+direction, zero-filled so the chart has no gaps. */
  private async monthlyByDirection(
    account: string,
    direction: 'debit' | 'credit',
    since: Date,
  ): Promise<{ month: string; amount: number }[]> {
    const rows = await LedgerModel.aggregate<{ _id: string; amount: number }>([
      { $match: { account, direction, postedAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$postedAt' } },
          amount: { $sum: '$amount' },
        },
      },
    ]).exec();
    return this.zeroFill(rows, since);
  }

  private async gmvByMonth(since: Date): Promise<{ month: string; amount: number }[]> {
    const rows = await BookingModel.aggregate<{ _id: string; amount: number }>([
      { $match: { createdAt: { $gte: since }, status: { $in: ['paid', 'in_progress', 'completed'] } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          amount: { $sum: '$priceBreakdown.total.amount' },
        },
      },
    ]).exec();
    return this.zeroFill(rows, since);
  }

  /** Composition of platform take, summed across all paid bookings. */
  private async revenueBreakdown(): Promise<{
    gmv: number;
    commission: number;
    hostEarnings: number;
    tax: number;
    protection: number;
    delivery: number;
    membership: number;
  }> {
    const [b] = await BookingModel.aggregate<{
      gmv: number;
      commission: number;
      hostEarnings: number;
      tax: number;
      protection: number;
      delivery: number;
    }>([
      { $match: { status: { $in: ['paid', 'in_progress', 'completed'] } } },
      {
        $group: {
          _id: null,
          gmv: { $sum: '$priceBreakdown.total.amount' },
          commission: { $sum: '$priceBreakdown.commission.amount' },
          hostEarnings: { $sum: '$priceBreakdown.hostEarnings.amount' },
          tax: { $sum: '$priceBreakdown.tax.amount' },
          protection: { $sum: '$priceBreakdown.protection.amount' },
          delivery: { $sum: { $ifNull: ['$priceBreakdown.delivery.amount', 0] } },
        },
      },
    ]).exec();

    // Membership revenue comes from the ledger, not bookings.
    const membership = await this.sumLedger('subscription', 'debit', Account.platformRevenue());

    return {
      gmv: b?.gmv ?? 0,
      commission: b?.commission ?? 0,
      hostEarnings: b?.hostEarnings ?? 0,
      tax: b?.tax ?? 0,
      protection: b?.protection ?? 0,
      delivery: b?.delivery ?? 0,
      membership,
    };
  }

  private async sumLedger(refType: string, direction: string, account: string): Promise<number> {
    const [r] = await LedgerModel.aggregate<{ t: number }>([
      { $match: { refType, direction, account } },
      { $group: { _id: null, t: { $sum: '$amount' } } },
    ]).exec();
    return r?.t ?? 0;
  }

  private async payoutTotals(): Promise<{ owed: number; paid: number }> {
    const rows = await PayoutModel.aggregate<{ _id: string; t: number }>([
      { $group: { _id: '$status', t: { $sum: '$amount' } } },
    ]).exec();
    const by = (s: string) => rows.find((r) => r._id === s)?.t ?? 0;
    return { owed: by('scheduled'), paid: by('paid') };
  }

  /** Fill missing months with 0 so a sparse ledger still draws a clean line. */
  private zeroFill(rows: { _id: string; amount: number }[], since: Date): { month: string; amount: number }[] {
    const map = new Map(rows.map((r) => [r._id, r.amount]));
    const out: { month: string; amount: number }[] = [];
    const d = new Date(since);
    const now = new Date();
    while (d <= now) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ month: key, amount: map.get(key) ?? 0 });
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }
}

export const financeReportService = new FinanceReportService();
