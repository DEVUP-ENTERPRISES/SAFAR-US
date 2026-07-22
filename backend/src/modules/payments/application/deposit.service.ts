import { PaymentModel } from '../infrastructure/payment.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { paymentGateway } from '../infrastructure/gateway.provider';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { ledgerService } from './ledger.service';
import { Account } from '../domain/ledger.accounts';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';
import { uuid } from '../../../shared/utils/uuid';
import type { Money } from '../../../core/types/money';

/**
 * The security deposit.
 *
 * A separate authorisation on the guest's card, held for the trip and captured
 * only against evidenced damage. It is deliberately NOT part of the booking
 * charge: the guest is never actually charged it, their available balance is
 * simply reduced while the car is out, and the ledger only ever sees money that
 * was genuinely taken.
 *
 * Before this, `holdId` on a booking was an availability hold — a calendar
 * reservation — and there was no funds instrument at all. A host reporting a
 * kerbed alloy had nothing to settle against.
 */
export class DepositService {
  /**
   * What to hold for this trip.
   *
   * Scaled off the daily rate so a $40 economy car and a $400 exotic do not
   * carry the same exposure, then clamped: a floor so cheap cars still carry
   * meaningful deterrence, and a ceiling so an expensive one does not
   * authorise someone's entire credit limit.
   */
  async amountFor(dailyPrice: number, currency: string): Promise<Money> {
    const cfg = await platformConfigService.get();
    const scaled = Math.round((dailyPrice * cfg.deposit.multiplierBps) / 10000);
    const clamped = Math.min(Math.max(scaled, cfg.deposit.minCents), cfg.deposit.maxCents);
    return { amount: clamped, currency };
  }

  async isEnabled(): Promise<boolean> {
    return (await platformConfigService.get()).deposit.enabled;
  }

  /** The live deposit for a booking, if one was ever placed. */
  async forBooking(bookingId: string) {
    return PaymentModel.findOne({ bookingId, type: 'deposit', deletedAt: null }).lean();
  }

  /**
   * Place the hold. Idempotent — calling twice returns the existing one rather
   * than authorising a second time against the guest's card.
   */
  async authorize(input: {
    bookingId: string;
    userId: string;
    dailyPrice: number;
    currency: string;
  }): Promise<{ placed: boolean; amount: Money } | null> {
    if (!(await this.isEnabled())) return null;

    const existing = await this.forBooking(input.bookingId);
    if (existing) {
      return {
        placed: false,
        amount: { amount: existing.amount, currency: existing.currency },
      };
    }

    const amount = await this.amountFor(input.dailyPrice, input.currency);

    const intent = await paymentGateway.createIntent({
      userId: input.userId,
      amount,
      capture: false, // authorisation only — never charged unless claimed against
      idempotencyKey: `deposit_${input.bookingId}`,
      metadata: { bookingId: input.bookingId, kind: 'security_deposit' },
    });

    await PaymentModel.create({
      _id: uuid(),
      bookingId: input.bookingId,
      userId: input.userId,
      type: 'deposit',
      intentId: intent.intentId,
      amount: amount.amount,
      currency: amount.currency,
      hostEarnings: 0,
      commission: 0,
      tax: 0,
      capturedAmount: 0,
      refundedAmount: 0,
      status: 'authorized',
      idempotencyKey: `deposit_${input.bookingId}`,
    });

    logger.info({ bookingId: input.bookingId, amount: amount.amount }, 'deposit authorised');
    return { placed: true, amount };
  }

  /**
   * Release the hold untouched — the normal ending for the overwhelming
   * majority of trips. Idempotent, because the auto-release job and a host
   * clearing an inspection can both reach it.
   */
  async release(bookingId: string, reason = 'Trip completed with no claim'): Promise<boolean> {
    const deposit = await this.forBooking(bookingId);
    if (!deposit) return false;
    if (deposit.status !== 'authorized') return false; // already settled

    await paymentGateway.cancel(deposit.intentId);
    await PaymentModel.updateOne(
      { _id: deposit._id },
      { status: 'cancelled', releasedReason: reason, releasedAt: new Date() },
    );
    logger.info({ bookingId, reason }, 'deposit released');
    return true;
  }

  /**
   * Capture part (or all) of the hold against an assessed claim.
   *
   * Only what is captured touches the ledger — an authorisation is not money.
   * The remainder is released by the issuer when the intent settles, so there
   * is nothing further to void.
   */
  async capture(
    bookingId: string,
    requested: Money,
    reason: string,
    hostId: string,
  ): Promise<Money> {
    const deposit = await this.forBooking(bookingId);
    if (!deposit) throw new NotFoundError('Deposit for this booking');
    if (deposit.status !== 'authorized') {
      throw new ConflictError('This deposit has already been settled', 'DEPOSIT_SETTLED');
    }
    if (requested.currency !== deposit.currency) {
      throw new ValidationError('Claim currency does not match the deposit');
    }
    if (requested.amount <= 0) {
      throw new ValidationError('Claim amount must be positive');
    }
    // Never take more than was held, however large the claim. Anything beyond
    // the deposit is a separate charge or an insurance matter, not a silent
    // over-capture of an authorisation the guest agreed to.
    const taken = Math.min(requested.amount, deposit.amount);

    await paymentGateway.capture(deposit.intentId, taken);
    await PaymentModel.updateOne(
      { _id: deposit._id },
      {
        status: 'succeeded',
        capturedAmount: taken,
        releasedReason: reason,
        releasedAt: new Date(),
      },
    );

    // Only now does the ledger see it — an authorisation is not money, so the
    // deposit is invisible to the books until some of it is actually taken.
    // A damage settlement compensates the host, so it lands in their payable.
    try {
      await ledgerService.post({
        refType: 'deposit',
        refId: bookingId,
        currency: deposit.currency,
        description: `Deposit capture: ${reason}`,
        legs: [
          { account: Account.gatewayClearing(), direction: 'credit', amount: taken },
          { account: Account.hostPayable(hostId), direction: 'debit', amount: taken },
        ],
      });
    } catch (err) {
      // Loud, never silent: money moved at the PSP and the books disagree.
      logger.error({ err, bookingId, taken }, 'DEPOSIT CAPTURED BUT LEDGER WRITE FAILED');
      throw err;
    }

    logger.info({ bookingId, taken, requested: requested.amount, reason }, 'deposit captured');
    return { amount: taken, currency: deposit.currency };
  }

  /**
   * Cron: free deposits whose inspection window has closed with no claim.
   *
   * This is the ending for the overwhelming majority of trips, and it must not
   * depend on a host remembering to do anything — an unreleased authorisation
   * is money the guest cannot spend.
   */
  async releaseDue(): Promise<number> {
    const cfg = await platformConfigService.get();
    if (!cfg.deposit.enabled) return 0;

    const cutoff = new Date(Date.now() - cfg.deposit.autoReleaseHours * 3_600_000);
    const due = await PaymentModel.find({
      type: 'deposit',
      status: 'authorized',
      deletedAt: null,
    }).lean();

    let released = 0;
    for (const deposit of due) {
      if (!deposit.bookingId) continue;
      const booking = await BookingModel.findOne(
        { _id: deposit.bookingId },
        { status: 1, 'period.end': 1 },
      ).lean();
      if (!booking) continue;

      // Only completed trips. A live or disputed one keeps its hold.
      if (booking.status !== 'completed') continue;
      if (new Date(booking.period.end).getTime() > cutoff.getTime()) continue;

      if (await this.release(deposit.bookingId, 'Inspection window closed with no claim')) {
        released += 1;
      }
    }
    return released;
  }
}

export const depositService = new DepositService();
