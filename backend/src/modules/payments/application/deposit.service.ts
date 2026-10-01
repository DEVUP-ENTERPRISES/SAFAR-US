import { PaymentModel } from '../infrastructure/payment.model';
import { PaymentMethodModel } from '../infrastructure/payment-method.model';
import { paymentMethodService } from './payment-method.service';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { paymentGateway } from '../infrastructure/gateway.provider';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { trustScoreService } from '../../risk/application/trust-score.service';
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
  async amountFor(dailyPrice: number, currency: string, guestId?: string): Promise<Money> {
    const cfg = await platformConfigService.get();
    const scaled = Math.round((dailyPrice * cfg.deposit.multiplierBps) / 10000);
    let amount = Math.min(Math.max(scaled, cfg.deposit.minCents), cfg.deposit.maxCents);

    // Reputation actually does something: a proven guest carries a smaller hold,
    // a Gold guest none at all. The discount is applied after the clamp so a
    // trusted guest can legitimately drop below the floor the deterrence band
    // sets for unproven ones — that is the reward. New/untrusted guests are
    // unaffected (0% discount), so exposure on the risky end is never reduced.
    if (guestId) {
      const perks = await trustScoreService.perks(guestId);
      if (perks.depositWaived || perks.depositDiscountPct >= 100) amount = 0;
      else if (perks.depositDiscountPct > 0) {
        amount = Math.round(amount * (1 - perks.depositDiscountPct / 100));
      }
    }
    return { amount, currency };
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
    // A hold the guest started on their booking page counts once Stripe has it; an abandoned one gives way to the saved card.
    if (existing && existing.status === 'pending' && existing.onPage) {
      if (await this.syncOnPage(existing.intentId)) return { placed: true, amount: { amount: existing.amount, currency: existing.currency } };
      await paymentGateway.cancel(existing.intentId).catch(() => undefined);
      await PaymentModel.updateOne({ _id: existing._id }, { status: 'cancelled', deletedAt: new Date(), releasedReason: 'Replaced by the saved card at handover' });
    } else if (existing) {
      return {
        placed: existing.status === 'authorized',
        amount: { amount: existing.amount, currency: existing.currency },
      };
    }

    const amount = await this.amountFor(input.dailyPrice, input.currency, input.userId);

    // A waived deposit (top-tier guest) holds nothing — there is no
    // authorisation to place, and nothing to release later.
    if (amount.amount <= 0) {
      logger.info({ bookingId: input.bookingId, userId: input.userId }, 'deposit waived by trust tier');
      return { placed: false, amount };
    }

    // An intent with no card attached never holds anything: it needs the guest's saved card, confirmed off-session.
    const [card, customerId] = await Promise.all([
      PaymentMethodModel.findOne({ userId: input.userId, isDefault: true }).lean<{ stripePaymentMethodId?: string }>(),
      paymentMethodService.customerFor(input.userId).catch(() => null),
    ]);
    let intent;
    try {
      intent = await paymentGateway.createIntent({
        userId: input.userId,
        amount,
        capture: false, // authorisation only — never charged unless claimed against
        idempotencyKey: `deposit_${input.bookingId}`,
        metadata: { bookingId: input.bookingId, kind: 'security_deposit' },
        customerId: customerId ?? undefined,
        paymentMethodId: card?.stripePaymentMethodId,
      });
    } catch (err) {
      logger.warn({ err, bookingId: input.bookingId }, 'DEPOSIT NOT PLACED — the card refused the hold');
      return { placed: false, amount };
    }
    if (intent.status !== 'requires_capture') {
      await paymentGateway.cancel(intent.intentId).catch(() => undefined);
      logger.warn({ bookingId: input.bookingId, status: intent.status }, 'DEPOSIT NOT PLACED — no card could be held');
      return { placed: false, amount };
    }

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
  /**
   * The guest places the hold themselves from their booking page, with any card or Apple / Google Pay.
   * For guests who paid another way (Klarna, Cash App…) or have no saved card. The card is kept for later
   * charges, and the hold is released on the normal schedule. Only close to pickup, because a card hold lasts about a week.
   */
  async selfServe(input: { bookingId: string; userId: string; tripStart: Date; dailyPrice: number; currency: string }): Promise<
    { status: 'held' | 'not_needed'; amount: Money } | { status: 'needs_payment'; clientSecret: string; amount: Money } | { status: 'too_early'; amount: Money; opensAt: Date }
  > {
    const cfg = await platformConfigService.get();
    const existing = await this.forBooking(input.bookingId);
    if (existing?.status === 'authorized') return { status: 'held', amount: { amount: existing.amount, currency: existing.currency } };
    if (existing?.status === 'pending' && existing.onPage) {
      if (await this.syncOnPage(existing.intentId)) return { status: 'held', amount: { amount: existing.amount, currency: existing.currency } };
      const intent = await paymentGateway.retrieveIntent(existing.intentId);
      return { status: 'needs_payment', clientSecret: intent.clientSecret, amount: { amount: existing.amount, currency: existing.currency } };
    }

    const amount = await this.amountFor(input.dailyPrice, input.currency, input.userId);
    if (!cfg.deposit.enabled || amount.amount <= 0) return { status: 'not_needed', amount };
    const opensAt = new Date(input.tripStart.getTime() - cfg.deposit.selfServeWindowHours * 3_600_000);
    if (Date.now() < opensAt.getTime()) return { status: 'too_early', amount, opensAt };

    const customerId = await paymentMethodService.customerFor(input.userId).catch(() => null);
    const intent = await paymentGateway.createIntent({
      userId: input.userId,
      amount,
      capture: false,
      idempotencyKey: `deposit_page_${input.bookingId}`,
      metadata: { bookingId: input.bookingId, kind: 'security_deposit' },
      customerId: customerId ?? undefined,
      saveCard: true,
    });
    await PaymentModel.create({
      _id: uuid(), bookingId: input.bookingId, userId: input.userId, type: 'deposit', intentId: intent.intentId,
      amount: amount.amount, currency: amount.currency, hostEarnings: 0, commission: 0, tax: 0, capturedAmount: 0, refundedAmount: 0,
      status: 'pending', onPage: true, idempotencyKey: `deposit_page_${input.bookingId}`,
    });
    return { status: 'needs_payment', clientSecret: intent.clientSecret, amount };
  }

  /** Marks an on-page hold as held once Stripe has it, and keeps the card it was placed on. True when held. */
  async syncOnPage(intentId: string): Promise<boolean> {
    const intent = await paymentGateway.retrieveIntent(intentId).catch(() => null);
    if (intent?.status !== 'requires_capture') return false;
    const doc = await PaymentModel.findOneAndUpdate({ intentId, type: 'deposit', status: 'pending' }, { status: 'authorized' }, { new: true }).lean();
    if (doc && intent.paymentMethodId) {
      const hasCard = await PaymentMethodModel.exists({ userId: doc.userId, stripePaymentMethodId: intent.paymentMethodId });
      if (!hasCard) {
        await paymentMethodService
          .save(doc.userId, { brand: 'card', last4: '0000', expMonth: 1, expYear: 2100, stripePaymentMethodId: intent.paymentMethodId })
          .catch((err) => logger.warn({ err: (err as Error).message, intentId }, 'deposit card could not be kept'));
      }
    }
    if (doc) logger.info({ bookingId: doc.bookingId, amount: doc.amount }, 'deposit held (placed by the guest)');
    return true;
  }

  async release(bookingId: string, reason = 'Trip completed with no claim'): Promise<boolean> {
    const deposit = await this.forBooking(bookingId);
    if (!deposit) return false;
    // A hold the guest started but never finished is simply withdrawn.
    if (deposit.status === 'pending' && deposit.onPage) {
      await paymentGateway.cancel(deposit.intentId).catch(() => undefined);
      await PaymentModel.updateOne({ _id: deposit._id }, { status: 'cancelled', releasedReason: reason, releasedAt: new Date() });
      return true;
    }
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
    opts: { postLedger?: boolean } = {},
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
    if (opts.postLedger === false) {
      logger.info({ bookingId, taken, reason }, 'deposit captured (caller posts the ledger)');
      return { amount: taken, currency: deposit.currency };
    }
    try {
      await ledgerService.post({
        txnId: `deposit_capture_${bookingId}`,
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
      // The capture already happened; the txnId is deterministic, so this is
      // safely replayable. Surfaced for reconciliation rather than thrown,
      // which would tell the caller the capture failed when it did not.
      logger.error(
        { err, bookingId, taken, txnId: `deposit_capture_${bookingId}` },
        'DEPOSIT CAPTURED BUT LEDGER WRITE FAILED — replayable, needs reconciliation',
      );
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

      // A claim or a disputed charge is still being argued: its money is this hold.
      const { ClaimModel } = await import('../../claims/infrastructure/claim.model');
      const openClaim = await ClaimModel.exists({
        bookingId: deposit.bookingId,
        deletedAt: null,
        status: { $nin: ['settled', 'rejected', 'closed'] },
      });
      const disputedCharge = await BookingModel.exists({ _id: deposit.bookingId, 'incidentals.status': 'disputed' });
      if (openClaim || disputedCharge) continue;
      const { TripModel } = await import('../../trips/infrastructure/trip.model');
      // A return the host has not confirmed yet keeps its hold.
      if (await TripModel.exists({ bookingId: deposit.bookingId, returnConfirmed: false })) continue;

      // Tolls from the trip are taken from the hold first; release then frees whatever is left (nothing, if it was captured).
      if (cfg.tolls.enabled && cfg.tolls.autoCharge) {
        const { tollService } = await import('../../tolls/application/toll.service');
        await tollService.bill(deposit.bookingId, { preferDeposit: true }).catch((err) => logger.warn({ err, bookingId: deposit.bookingId }, 'tolls not billed at deposit release'));
      }
      if (await this.release(deposit.bookingId, 'Inspection window closed with no claim')) {
        released += 1;
      }
    }
    return released;
  }
}

export const depositService = new DepositService();
