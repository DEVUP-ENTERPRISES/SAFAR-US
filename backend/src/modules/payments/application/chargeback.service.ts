import { PaymentModel } from '../infrastructure/payment.model';
import { ledgerService } from './ledger.service';
import { Account } from '../domain/ledger.accounts';
import { walletService } from '../../wallet/application/wallet.service';
import { userRepository } from '../../users/infrastructure/user.repository';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { logger } from '../../../infrastructure/logging/logger';

export class ChargebackService {
  /**
   * A bank pulled back a wallet top-up: take that money out of the wallet (what is
   * still there), put the account under review, and tell staff the shortfall.
   * Returns false when the payment is not a top-up. Replay-safe on the dispute id.
   */
  async onTopupDispute(disputeId: string, paymentIntent: string, disputedAmount: number): Promise<boolean> {
    const payment = await PaymentModel.findOne({ intentId: paymentIntent, type: 'topup' }).lean();
    if (!payment) return false;

    const balance = await walletService.balance(payment.userId);
    const debit = Math.max(0, Math.min(disputedAmount, balance));
    if (debit > 0) {
      await ledgerService.post({
        txnId: `dispute_${disputeId}`,
        refType: 'topup_dispute',
        refId: payment._id,
        currency: payment.currency,
        description: `Chargeback on wallet top-up ${payment._id}`,
        legs: [
          { account: Account.userWallet(payment.userId), direction: 'debit', amount: debit },
          { account: Account.cardFunding(), direction: 'credit', amount: debit },
        ],
      });
    }

    const user = await userRepository.findById(payment.userId);
    if (user?.status === 'active') {
      await userRepository.setStatus(payment.userId, 'under_review', { reason: `Chargeback on wallet top-up (${disputeId})`, by: 'system' });
    }

    logger.error({ disputeId, userId: payment.userId, disputedAmount, debit }, 'CHARGEBACK on wallet top-up — wallet debited, account under review');
    emit(EVENTS.WALLET_TOPUP_DISPUTED, payment.userId, {
      userId: payment.userId,
      disputeId,
      amount: disputedAmount,
      debited: debit,
      shortfall: disputedAmount - debit,
      currency: payment.currency,
    });
    return true;
  }
}

export const chargebackService = new ChargebackService();
