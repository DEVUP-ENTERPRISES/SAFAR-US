import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { payoutService } from '../../payouts/application/payout.service';

export interface EarningsDashboard {
  currency: string;
  lifetimeEarnings: number; // total ever credited to host payable
  currentBalance: number; // currently payable (not yet paid out)
  paidOut: number;
  pendingPayout: number;
  completedTrips: number;
  monthly: { month: string; amount: number }[];
}

/**
 * Host earnings analytics, derived entirely from the append-only ledger +
 * payouts — no separate mutable revenue counters to drift.
 */
export class EarningsService {
  async dashboard(hostId: string): Promise<EarningsDashboard> {
    const account = Account.hostPayable(hostId);
    const [lifetimeEarnings, currentBalance, monthly, payouts] = await Promise.all([
      ledgerService.sumCredits(account),
      ledgerService.balance(account),
      ledgerService.monthlyCredits(account),
      payoutService.listForHost(hostId),
    ]);

    const paidOut = payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    const pendingPayout = payouts
      .filter((p) => p.status === 'scheduled')
      .reduce((s, p) => s + p.amount, 0);

    return {
      currency: 'INR',
      lifetimeEarnings,
      currentBalance,
      paidOut,
      pendingPayout,
      completedTrips: payouts.length,
      monthly,
    };
  }
}

export const earningsService = new EarningsService();
