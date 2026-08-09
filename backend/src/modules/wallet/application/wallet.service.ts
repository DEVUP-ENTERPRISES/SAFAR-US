import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { paymentGateway } from '../../payments/infrastructure/gateway.provider';
import { PaymentModel } from '../../payments/infrastructure/payment.model';
import { ConflictError, ValidationError } from '../../../core/errors/app-error';
import { randomId } from '../../../shared/utils/uuid';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { kv } from '../../../infrastructure/cache/kv-store';
import { logger } from '../../../infrastructure/logging/logger';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { trustScoreService } from '../../risk/application/trust-score.service';

/**
 * The in-app wallet. Balance is DERIVED from the ledger (credit − debit on the
 * user's wallet account). Top-up funds it from a card; spend applies it toward
 * a booking. Every movement is a balanced double-entry transaction.
 */
export class WalletService {
  async balance(userId: string): Promise<number> {
    return ledgerService.balance(Account.userWallet(userId));
  }

  /** Add funds via card. Mock gateway captures instantly in dev; Stripe in prod. */
  async topup(userId: string, amount: number): Promise<{ balance: number; paymentId: string }> {
    if (amount < 100) throw new ValidationError('Minimum top-up is $1.00');

    // Trust-scaled balance cap: a brand-new account cannot warehouse large sums
    // (money-laundering / stolen-card cash-out control); a proven member's cap is
    // far higher. The limit rises as the member earns trust.
    const cfg = await platformConfigService.get();
    const { tier } = await trustScoreService.compute(userId);
    const cap = cfg.wallet.maxBalanceCentsByTier[tier];
    const current = await this.balance(userId);
    if (current + amount > cap) {
      throw new ValidationError(
        `This top-up would exceed your wallet limit of ${(cap / 100).toFixed(0)}. Complete more trips to raise it.`,
      );
    }

    const idempotencyKey = `topup_${userId}_${randomId()}`;
    const intent = await paymentGateway.createIntent({
      amount: { amount, currency: 'USD' },
      userId,
      capture: true,
      idempotencyKey,
      metadata: { type: 'wallet_topup' },
    });
    const payment = await PaymentModel.create({
      userId,
      type: 'topup',
      intentId: intent.intentId,
      amount,
      currency: 'USD',
      capturedAmount: amount,
      status: 'succeeded',
      idempotencyKey,
    });
    // card → wallet (credit user_wallet increases the balance).
    await ledgerService.post({
      refType: 'wallet_topup',
      refId: payment._id,
      currency: 'USD',
      description: 'Wallet top-up',
      legs: [
        { account: Account.cardFunding(), direction: 'debit', amount },
        { account: Account.userWallet(userId), direction: 'credit', amount },
      ],
    });
    emit(EVENTS.WALLET_TOPPED_UP, userId, { userId, amount });
    return { balance: await this.balance(userId), paymentId: payment._id };
  }

  /**
   * Apply wallet funds toward a booking. The wallet portion of the booking
   * total was originally funded via a top-up (card_funding); consuming it here
   * releases that funding so the booking's full total remains covered while the
   * card only charges the remainder. Global cash stays balanced.
   */
  async spend(userId: string, amount: number, refType: string, refId: string): Promise<void> {
    if (amount <= 0) return;

    // Serialize per user: balance is read-then-written, so two concurrent
    // spends (e.g. two bookings at once) could both pass the check and overdraw
    // the wallet. A short per-user lock makes the read + post atomic.
    const lockKey = `lock:wallet:${userId}`;
    const locked = await kv().acquire(lockKey, 15);
    if (!locked) throw new ConflictError('Another wallet transaction is in progress — please retry.', 'WALLET_BUSY');
    try {
      const balance = await this.balance(userId);
      if (amount > balance) throw new ConflictError('Insufficient wallet balance', 'INSUFFICIENT_WALLET');
      await ledgerService.post({
        refType,
        refId,
        currency: 'USD',
        description: 'Paid with wallet',
        legs: [
          { account: Account.userWallet(userId), direction: 'debit', amount },
          { account: Account.cardFunding(), direction: 'credit', amount },
        ],
      });
    } finally {
      await kv().del(lockKey);
    }
  }

  // ── Admin / support ─────────────────────────────────────────────────

  /**
   * A goodwill credit or a correction, applied by staff.
   *
   * Support could previously do nothing about a wallet — no apology credit, no
   * way to undo a bad charge — so the only remedy was a database edit. This
   * posts a real double-entry pair instead: a credit is funded from
   * `promo_expense` (the platform genuinely bears the cost, and it shows up in
   * finance as marketing spend rather than appearing from nowhere), and a debit
   * returns funds the same way. Every adjustment names the actor and a reason,
   * so the ledger explains itself later.
   *
   * `amount` is signed: positive credits the member, negative claws back.
   */
  async adminAdjust(
    userId: string,
    amount: number,
    opts: { actorId: string; reason: string },
  ): Promise<{ balance: number }> {
    if (!Number.isInteger(amount) || amount === 0) {
      throw new ValidationError('Adjustment must be a non-zero whole number of cents');
    }
    const magnitude = Math.abs(amount);

    // Share the spend lock: an adjustment races the same balance a booking reads.
    const lockKey = `lock:wallet:${userId}`;
    const locked = await kv().acquire(lockKey, 15);
    if (!locked) throw new ConflictError('Another wallet transaction is in progress — please retry.', 'WALLET_BUSY');
    try {
      if (amount < 0) {
        // Never let a correction push a member negative.
        const balance = await this.balance(userId);
        if (magnitude > balance) {
          throw new ConflictError('Adjustment exceeds the current balance', 'INSUFFICIENT_WALLET');
        }
      }
      const credit = amount > 0;
      await ledgerService.post({
        refType: 'wallet_adjustment',
        refId: `${userId}:${Date.now()}`,
        currency: 'USD',
        description: `${credit ? 'Goodwill credit' : 'Correction'} by ${opts.actorId}: ${opts.reason}`,
        legs: credit
          ? [
              { account: Account.promoExpense(), direction: 'debit', amount: magnitude },
              { account: Account.userWallet(userId), direction: 'credit', amount: magnitude },
            ]
          : [
              { account: Account.userWallet(userId), direction: 'debit', amount: magnitude },
              { account: Account.promoExpense(), direction: 'credit', amount: magnitude },
            ],
      });
      logger.info({ userId, amount, actorId: opts.actorId, reason: opts.reason }, 'wallet adjusted by staff');
      return { balance: await this.balance(userId) };
    } finally {
      await kv().del(lockKey);
    }
  }

  /** Balance plus recent movements — what support needs to answer "where did my money go?". */
  async adminView(userId: string): Promise<{ userId: string; balance: number; entries: unknown[] }> {
    const [balance, entries] = await Promise.all([
      this.balance(userId),
      ledgerService.entriesForAccount(Account.userWallet(userId), 50),
    ]);
    return { userId, balance, entries };
  }
}

export const walletService = new WalletService();
