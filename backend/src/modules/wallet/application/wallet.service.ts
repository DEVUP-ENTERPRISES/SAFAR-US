import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { paymentGateway } from '../../payments/infrastructure/gateway.provider';
import { PaymentModel } from '../../payments/infrastructure/payment.model';
import { ConflictError, ValidationError } from '../../../core/errors/app-error';
import { randomId } from '../../../shared/utils/uuid';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';

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
  }
}

export const walletService = new WalletService();
