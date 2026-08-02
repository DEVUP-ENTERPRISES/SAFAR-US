import { BookingModel } from '../infrastructure/booking.model';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { notificationService } from '../../notifications/application/notification.service';
import { ValidationError, NotFoundError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

export type IncidentalType = 'fuel' | 'cleaning' | 'smoking' | 'pet' | 'late_return' | 'toll' | 'fine' | 'other';

export interface IncidentalItem {
  type: IncidentalType;
  /** Explicit amount (minor units) for toll/fine/other; ignored for priced types. */
  amount?: number;
  /** Fuel: whole % returned below pickup. Late: hours past grace. */
  qty?: number;
  note?: string;
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

  async charge(bookingId: string, items: IncidentalItem[], byUserId: string): Promise<{ total: number; items: { type: string; amount: number; note?: string }[] }> {
    const booking = await BookingModel.findOne({ _id: bookingId }).lean();
    if (!booking) throw new NotFoundError('Booking');
    const cfg = (await platformConfigService.get()).incidentals;
    const currency = booking.priceBreakdown.currency;

    const priced = items
      .map((it) => ({ type: it.type, amount: this.priceFor(it.type, cfg, it), note: it.note, at: new Date(), by: byUserId }))
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

    await notificationService
      .send({
        userId: booking.guestId,
        priority: 'high',
        deepLink: `/bookings/${bookingId}`,
        templateKey: 'booking.incidental_charged',
        title: 'A post-trip charge was applied',
        body: `${priced.map((p) => p.type.replace('_', ' ')).join(', ')} — ${(total / 100).toFixed(2)} ${currency}.`,
        data: { bookingId },
      })
      .catch(() => undefined);

    logger.info({ bookingId, total, types: priced.map((p) => p.type) }, 'incidentals charged');
    return { total, items: priced.map((p) => ({ type: p.type, amount: p.amount, note: p.note })) };
  }

  /** Auto fuel shortfall at return — the % returned below the pickup level. */
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
