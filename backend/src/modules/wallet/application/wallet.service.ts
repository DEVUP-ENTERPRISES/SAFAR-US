import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { paymentGateway } from '../../payments/infrastructure/gateway.provider';
import { PaymentModel } from '../../payments/infrastructure/payment.model';
import { ConflictError, ValidationError } from '../../../core/errors/app-error';
import { randomId } from '../../../shared/utils/uuid';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { kv } from '../../../infrastructure/cache/kv-store';
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
}

export const walletService = new WalletService();
