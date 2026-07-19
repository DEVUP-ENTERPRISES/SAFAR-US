import { LedgerModel } from '../infrastructure/ledger.model';
import type { LedgerLeg } from '../domain/ledger.accounts';
import { uuid } from '../../../shared/utils/uuid';
import { ConflictError } from '../../../core/errors/app-error';

export interface PostTxnInput {
  txnId?: string;
  refType: string;
  refId: string;
  currency: string;
  description: string;
  legs: LedgerLeg[];
}

/**
 * The financial source of truth. Every money movement is a balanced,
 * append-only transaction. Balances are derived by summing entries.
 */
export class LedgerService {
  /** Post a balanced double-entry transaction. Rejects if debits != credits. */
  async post(input: PostTxnInput): Promise<string> {
    const debits = input.legs.filter((l) => l.direction === 'debit').reduce((s, l) => s + l.amount, 0);
    const credits = input.legs.filter((l) => l.direction === 'credit').reduce((s, l) => s + l.amount, 0);

    if (debits !== credits) {
      throw new ConflictError(
        `Unbalanced ledger transaction: debit ${debits} != credit ${credits}`,
        'LEDGER_UNBALANCED',
      );
    }
    if (input.legs.length < 2) {
      throw new ConflictError('A ledger transaction needs at least two legs', 'LEDGER_INVALID');
    }

    const txnId = input.txnId ?? uuid();
    const now = new Date();
    await LedgerModel.insertMany(
      input.legs.map((leg) => ({
        txnId,
        account: leg.account,
        direction: leg.direction,
        amount: leg.amount,
        currency: input.currency,
        refType: input.refType,
        refId: input.refId,
        description: input.description,
        postedAt: now,
      })),
    );
    return txnId;
  }

  /** Derived balance for an account = Σcredits − Σdebits (minor units). */
  async balance(account: string): Promise<number> {
    const rows = await LedgerModel.aggregate<{ _id: string; total: number }>([
      { $match: { account } },
      {
        $group: {
          _id: '$direction',
          total: { $sum: '$amount' },
        },
      },
    ]).exec();
    let credit = 0;
    let debit = 0;
    for (const r of rows) {
      if (r._id === 'credit') credit = r.total;
      if (r._id === 'debit') debit = r.total;
    }
    return credit - debit;
  }

  async entriesForAccount(account: string, limit = 50): Promise<unknown[]> {
    return LedgerModel.find({ account }).sort({ postedAt: -1 }).limit(limit).lean().exec();
  }

  /** Total credited to an account over all time. */
  async sumCredits(account: string): Promise<number> {
    const [row] = await LedgerModel.aggregate<{ total: number }>([
      { $match: { account, direction: 'credit' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).exec();
    return row?.total ?? 0;
  }

  /**
   * Total debited to an account over all time.
   *
   * IMPORTANT — account normality in this ledger:
   *   user_wallet   is CREDIT-normal (a top-up credits it; spending debits it)
   *   host_payable  is DEBIT-normal  (a booking debits it; a payout credits it)
   *   platform_revenue / platform_tax are DEBIT-normal (commission debits them)
   *
   * So "how much has this host earned" is the sum of DEBITS, not credits, and
   * "how much do we still owe them" is debits − credits. Reading these with
   * sumCredits()/balance() returns 0 and a negative number respectively.
   */
  async sumDebits(account: string): Promise<number> {
    const [row] = await LedgerModel.aggregate<{ total: number }>([
      { $match: { account, direction: 'debit' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).exec();
    return row?.total ?? 0;
  }

  /** Accrued-minus-settled for a DEBIT-normal account (host payable, revenue). */
  async debitBalance(account: string): Promise<number> {
    const [debit, credit] = await Promise.all([this.sumDebits(account), this.sumCredits(account)]);
    return debit - credit;
  }

  /** Monthly debited totals for a DEBIT-normal account (host earnings charts). */
  async monthlyDebits(account: string, months = 6): Promise<{ month: string; amount: number }[]> {
    const rows = await LedgerModel.aggregate<{ _id: string; amount: number }>([
      { $match: { account, direction: 'debit' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$postedAt' } },
          amount: { $sum: '$amount' },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: months },
    ]).exec();
    return rows.map((r) => ({ month: r._id, amount: r.amount })).reverse();
  }

  /** Monthly credited totals (for revenue charts). Returns last N months. */
  async monthlyCredits(account: string, months = 6): Promise<{ month: string; amount: number }[]> {
    const rows = await LedgerModel.aggregate<{ _id: string; amount: number }>([
      { $match: { account, direction: 'credit' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$postedAt' } },
          amount: { $sum: '$amount' },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: months },
    ]).exec();
    return rows.map((r) => ({ month: r._id, amount: r.amount })).reverse();
  }
}

export const ledgerService = new LedgerService();
