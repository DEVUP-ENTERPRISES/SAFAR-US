import { BookingModel } from '../infrastructure/booking.model';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { notificationService } from '../../notifications/application/notification.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';
import { auditService } from '../../audit/application/audit.service';
import { uuid } from '../../../shared/utils/uuid';

export type IncidentalType = 'fuel' | 'cleaning' | 'smoking' | 'pet' | 'late_return' | 'toll' | 'fine' | 'other';

export interface IncidentalItem {
  type: IncidentalType;
  /** Explicit amount (minor units) for toll/fine/other; ignored for priced types. */
  amount?: number;
  /** Fuel: whole % returned below pickup. Late: hours past grace. */
  qty?: number;
  note?: string;
  /** Receipt, citation, or a photo of the car. Required above a config
   *  threshold — a large charge on trust alone is an assertion. */
  evidenceUrl?: string;
}

/**
 * Post-trip incidentals — fuel, cleaning, smoking, pet, late return, tolls and
 * fines. Priced from an admin-configurable schedule, charged to the guest and
 * credited to the host through the same balanced posting the mileage overage
 * uses (credit clearing / debit host payable), and recorded on the booking so
 * support can reconstruct any charge months later. Tolls/fines can be applied
 * long after the trip (they arrive late), so this is booking-scoped, not gated
 * on a live trip.
 */
/** The slice of platform config this service reads. */
interface IncidentalConfig {
  fuelPerPercentCents: number;
  cleaningCents: number;
  smokingCents: number;
  petCents: number;
  lateReturnPerHourCents: number;
  maxTollCents?: number;
  maxFineCents?: number;
  maxOtherCents?: number;
  windowDays?: number;
  evidenceRequiredAboveCents?: number;
  disputeWindowHours?: number;
}

export class IncidentalsService {
  private priceFor(type: IncidentalType, cfg: { fuelPerPercentCents: number; cleaningCents: number; smokingCents: number; petCents: number; lateReturnPerHourCents: number }, it: IncidentalItem): number {
    switch (type) {
      case 'cleaning': return cfg.cleaningCents;
      case 'smoking': return cfg.smokingCents;
      case 'pet': return cfg.petCents;
      case 'fuel': return Math.max(0, Math.round((it.qty ?? 0) * cfg.fuelPerPercentCents));
      case 'late_return': return Math.max(0, Math.round((it.qty ?? 0) * cfg.lateReturnPerHourCents));
      case 'toll':
      case 'fine':
      case 'other': return Math.max(0, Math.round(it.amount ?? 0));
      default: return 0;
    }
  }

  /** Ceiling for a free-form category. Rated types are priced by config. */
  private capFor(type: IncidentalType, cfg: IncidentalConfig): number | null {
    if (type === 'toll') return cfg.maxTollCents ?? 10_000;
    if (type === 'fine') return cfg.maxFineCents ?? 50_000;
    if (type === 'other') return cfg.maxOtherCents ?? 15_000;
    return null; // rated — the host does not choose the amount
  }

  async charge(
    bookingId: string,
    items: IncidentalItem[],
    byUserId: string,
  ): Promise<{ total: number; items: { id: string; type: string; amount: number; note?: string }[] }> {
    const booking = await BookingModel.findOne({ _id: bookingId }).lean();
    if (!booking) throw new NotFoundError('Booking');
    const cfg = (await platformConfigService.get()).incidentals as IncidentalConfig;
    const currency = booking.priceBreakdown.currency;
    const existing = booking.incidentals ?? [];

    /*
     * Every rule is enforced here rather than in the form, because the form is
     * not the only way to reach this. All of it charges a card the guest
     * already handed over, with nobody standing between the host and that card.
     */

    // 1. WINDOW — without one, a host can bill a trip from six months ago, long
    //    after the guest could possibly evidence otherwise.
    const tripEnd = booking.period?.end ? new Date(booking.period.end) : null;
    if (tripEnd) {
      const closesAt = new Date(tripEnd.getTime() + (cfg.windowDays ?? 7) * 86_400_000);
      if (Date.now() > closesAt.getTime()) {
        throw new ValidationError(
          `Incidentals can only be applied within ${cfg.windowDays ?? 7} days of the trip ending. ` +
            'Open a claim instead.',
        );
      }
    }

    for (const it of items) {
      const cap = this.capFor(it.type, cfg);
      const amount = this.priceFor(it.type, cfg, it);

      if (cap !== null) {
        // 2. CEILING — per category, because a toll is a few dollars and a
        //    moving violation can be a few hundred.
        if ((it.amount ?? 0) > cap) {
          throw new ValidationError(
            `A single ${it.type} charge cannot exceed ${(cap / 100).toFixed(0)} ${currency}. ` +
              'File a damage claim for anything larger.',
          );
        }

        // 3. EXPLANATION — a charge the guest cannot understand is one they
        //    dispute, and one we could not defend.
        if (!it.note || it.note.trim().length < 10) {
          throw new ValidationError(
            `Say what the ${it.type} charge is for — the guest sees this, and an unexplained charge gets disputed.`,
          );
        }
      }

      // 4. EVIDENCE above a threshold. A $6 toll on trust is reasonable; a $200
      //    one is an assertion. Applies to rated types too — a large fuel
      //    shortfall should be photographed.
      const needsEvidence = amount > (cfg.evidenceRequiredAboveCents ?? 5_000);
      if (needsEvidence && !it.evidenceUrl) {
        throw new ValidationError(
          `A ${it.type} charge over ${((cfg.evidenceRequiredAboveCents ?? 5_000) / 100).toFixed(0)} ${currency} ` +
            'needs a photo — the receipt, the citation, or the state of the car.',
        );
      }

      // 5. NO DUPLICATES. A host re-submitting the form, or trying twice, must
      //    not bill the same thing again. Same category at the same amount on
      //    one booking is a duplicate; a genuinely separate second toll will
      //    differ in amount or can be raised as one line with a clear note.
      const dupe = existing.find(
        (e) => e.type === it.type && e.amount === amount && e.status !== 'refunded',
      );
      if (dupe) {
        throw new ConflictError(
          `A ${it.type} charge of ${(amount / 100).toFixed(2)} ${currency} is already on this booking.`,
          'DUPLICATE_INCIDENTAL',
        );
      }
    }

    const now = new Date();
    const priced = items
      .map((it) => ({
        _id: uuid(),
        type: it.type,
        amount: this.priceFor(it.type, cfg, it),
        qty: it.qty,
        note: it.note,
        evidenceUrl: it.evidenceUrl,
        status: 'charged' as const,
        at: now,
        by: byUserId,
      }))
      .filter((p) => p.amount > 0);

    const total = priced.reduce((s, p) => s + p.amount, 0);
    if (total <= 0) throw new ValidationError('No chargeable incidental in this request');

    await ledgerService.post({
      refType: 'incidental',
      refId: bookingId,
      currency,
      description: `Incidentals: ${priced.map((p) => p.type).join(', ')}`,
      legs: [
        { account: Account.gatewayClearing(), direction: 'credit', amount: total },
        { account: Account.hostPayable(booking.hostId), direction: 'debit', amount: total },
      ],
    });
    await BookingModel.updateOne({ _id: bookingId }, { $push: { incidentals: { $each: priced } } });

    // Every charge is written down with who applied it and what it was for.
    await auditService
      .record({
        actorId: byUserId,
        actorRoles: ['host'],
        action: 'incidental.charged',
        resourceType: 'booking',
        resourceId: bookingId,
        after: { total, items: priced.map((p) => ({ id: p._id, type: p.type, amount: p.amount })) },
        status: 200,
      })
      .catch(() => undefined);

    await notificationService
      .send({
        userId: booking.guestId,
        priority: 'high',
        deepLink: `/bookings/${bookingId}`,
        templateKey: 'booking.incidental_charged',
        title: 'A post-trip charge was applied',
        body:
          `${priced.map((p) => p.type.replace('_', ' ')).join(', ')} — ${(total / 100).toFixed(2)} ${currency}. ` +
          `If this is wrong you have ${cfg.disputeWindowHours ?? 72} hours to dispute it.`,
        data: { bookingId },
      })
      .catch(() => undefined);

    logger.info({ bookingId, total, types: priced.map((p) => p.type) }, 'incidentals charged');
    return {
      total,
      items: priced.map((p) => ({ id: p._id, type: p.type, amount: p.amount, note: p.note })),
    };
  }

  /**
   * The guest's answer.
   *
   * Disputing does not reverse the money — staff rule on it — but it marks the
   * charge and stops it being treated as settled. A charge nobody can contest
   * is not a charge, it is a taking.
   */
  async dispute(bookingId: string, incidentalId: string, userId: string, reason: string) {
    const booking = await BookingModel.findOne({ _id: bookingId }).lean();
    if (!booking) throw new NotFoundError('Booking');
    if (booking.guestId !== userId) throw new ForbiddenError('Only the guest can dispute a charge');

    const item = (booking.incidentals ?? []).find((i) => i._id === incidentalId);
    if (!item) throw new NotFoundError('Charge');
    if (item.status !== 'charged') {
      throw new ConflictError(`That charge is already ${item.status}`, 'NOT_DISPUTABLE');
    }

    const cfg = (await platformConfigService.get()).incidentals as IncidentalConfig;
    const closesAt = new Date(new Date(item.at).getTime() + (cfg.disputeWindowHours ?? 72) * 3_600_000);
    if (Date.now() > closesAt.getTime()) {
      throw new ValidationError(
        `The window to dispute this charge closed on ${closesAt.toLocaleDateString('en-US')}. Contact support.`,
      );
    }

    await BookingModel.updateOne(
      { _id: bookingId, 'incidentals._id': incidentalId },
      {
        $set: {
          'incidentals.$.status': 'disputed',
          'incidentals.$.disputeReason': reason,
          'incidentals.$.disputedAt': new Date(),
        },
      },
    );

    await auditService
      .record({
        actorId: userId,
        actorRoles: ['guest'],
        action: 'incidental.disputed',
        resourceType: 'booking',
        resourceId: bookingId,
        reason,
        after: { incidentalId, type: item.type, amount: item.amount },
        status: 200,
      })
      .catch(() => undefined);

    // The host hears it from us, not from a chargeback weeks later.
    await notificationService
      .send({
        userId: booking.hostId,
        priority: 'high',
        templateKey: 'booking.incidental_disputed',
        title: 'A guest disputed a charge',
        body: `Your ${item.type.replace('_', ' ')} charge is being reviewed. We will be in touch.`,
        deepLink: `/host/trips/${bookingId}`,
        data: { bookingId, incidentalId },
      })
      .catch(() => undefined);

    logger.info({ bookingId, incidentalId, type: item.type }, 'incidental disputed');
    return { disputed: true };
  }

  /**
   * Staff ruling on a dispute.
   *
   * Refunding posts a compensating ledger entry rather than editing the
   * original: the first posting is a fact that happened, and a double-entry
   * ledger that can be rewritten is not one.
   */
  async resolveDispute(
    bookingId: string,
    incidentalId: string,
    staffUserId: string,
    outcome: 'refund' | 'uphold',
    note: string,
  ) {
    const booking = await BookingModel.findOne({ _id: bookingId }).lean();
    if (!booking) throw new NotFoundError('Booking');

    const item = (booking.incidentals ?? []).find((i) => i._id === incidentalId);
    if (!item) throw new NotFoundError('Charge');
    if (item.status !== 'disputed') {
      throw new ConflictError('That charge is not under dispute', 'NOT_DISPUTED');
    }

    if (outcome === 'refund') {
      await ledgerService.post({
        refType: 'incidental_refund',
        refId: `${bookingId}:${incidentalId}`,
        currency: booking.priceBreakdown.currency,
        description: `Incidental refunded after dispute: ${item.type}`,
        legs: [
          { account: Account.hostPayable(booking.hostId), direction: 'credit', amount: item.amount },
          { account: Account.gatewayClearing(), direction: 'debit', amount: item.amount },
        ],
      });
    }

    await BookingModel.updateOne(
      { _id: bookingId, 'incidentals._id': incidentalId },
      {
        $set: {
          'incidentals.$.status': outcome === 'refund' ? 'refunded' : 'upheld',
          'incidentals.$.resolvedAt': new Date(),
          'incidentals.$.resolvedBy': staffUserId,
          'incidentals.$.resolutionNote': note,
        },
      },
    );

    await auditService
      .record({
        actorId: staffUserId,
        actorRoles: ['staff'],
        action: `incidental.${outcome}`,
        resourceType: 'booking',
        resourceId: bookingId,
        reason: note,
        after: { incidentalId, type: item.type, amount: item.amount },
        status: 200,
      })
      .catch(() => undefined);

    for (const userId of [booking.guestId, booking.hostId]) {
      await notificationService
        .send({
          userId,
          priority: 'normal',
          templateKey: 'booking.incidental_resolved',
          title: outcome === 'refund' ? 'A disputed charge was refunded' : 'A disputed charge stands',
          body: note,
          deepLink: userId === booking.guestId ? `/bookings/${bookingId}` : `/host/trips/${bookingId}`,
          data: { bookingId, incidentalId },
        })
        .catch(() => undefined);
    }

    logger.info({ bookingId, incidentalId, outcome }, 'incidental dispute resolved');
    return { outcome };
  }

  async chargeFuelShortfall(bookingId: string, fuelStart?: number, fuelEnd?: number): Promise<number> {
    if (fuelStart == null || fuelEnd == null) return 0;
    const short = fuelStart - fuelEnd;
    if (short <= 0) return 0;
    const { total } = await this.charge(bookingId, [{ type: 'fuel', qty: short }], 'system');
    return total;
  }

  /** Auto late-return fee — hours past the return grace window. */
  async chargeLateReturn(bookingId: string, hoursLate: number): Promise<number> {
    if (hoursLate <= 0) return 0;
    const { total } = await this.charge(bookingId, [{ type: 'late_return', qty: hoursLate }], 'system');
    return total;
  }
}

export const incidentalsService = new IncidentalsService();
