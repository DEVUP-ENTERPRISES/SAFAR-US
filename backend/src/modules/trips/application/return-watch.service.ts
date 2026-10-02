import { BookingModel, type BookingDoc } from '../../bookings/infrastructure/booking.model';
import { bookingService } from '../../bookings/application/booking.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { logger } from '../../../infrastructure/logging/logger';

const MIN = 60_000;

/** Every minute around return time: remind the guest, flag the car overdue the moment grace ends, and protect the next booking. */
export const returnWatchService = {
  async sweep(now = Date.now()) {
    return {
      reminders: await this.remind(now),
      overdue: await bookingService.sweepOverdueLate(),
      nextAtRisk: await this.protectNextBookings(now),
    };
  },

  /** Each configured reminder once per trip, the most urgent one if several fall due together. */
  async remind(now: number): Promise<number> {
    const cfg = await platformConfigService.get();
    const marks = [...new Set(cfg.tracking.returnReminderMinutes ?? [])].filter((m) => m > 0).sort((a, b) => b - a);
    if (!marks.length) return 0;
    const due = await BookingModel.find({ status: 'in_progress', 'period.end': { $gt: new Date(now), $lte: new Date(now + marks[0] * MIN) } })
      .select('_id guestId period returnRemindersSent')
      .lean<Pick<BookingDoc, '_id' | 'guestId' | 'period' | 'returnRemindersSent'>[]>();
    let sent = 0;
    for (const b of due) {
      const left = (new Date(b.period.end).getTime() - now) / MIN;
      const fresh = marks.filter((m) => left <= m && !(b.returnRemindersSent ?? []).includes(m));
      if (!fresh.length) continue;
      const claimed = await BookingModel.updateOne(
        { _id: b._id, returnRemindersSent: { $nin: fresh } },
        { $addToSet: { returnRemindersSent: { $each: fresh } } },
      );
      if (!claimed.modifiedCount) continue;
      emit(EVENTS.TRIP_RETURN_REMINDER, b._id, {
        bookingId: b._id,
        guestId: b.guestId,
        minutesLeft: Math.max(1, Math.round(left)),
        returnAt: b.period.end,
        graceMinutes: cfg.tracking.overdueGraceMinutes,
        perHourCents: cfg.incidentals.lateReturnPerHourCents,
        hourlyMaxHours: cfg.incidentals.lateHourlyMaxHours,
      });
      sent++;
    }
    return sent;
  },

  /** A car now overdue whose next booking starts soon: alert the host and staff once, and offer the next guest a similar car. */
  async protectNextBookings(now: number): Promise<number> {
    const hours = (await platformConfigService.get()).tracking.nextBookingAlertHours ?? 24;
    if (hours <= 0) return 0;
    const late = await BookingModel.find({ status: 'in_progress', overdueNotifiedAt: { $exists: true }, nextBookingAlertedAt: { $exists: false } })
      .select('_id code vehicleId hostId period')
      .lean<Pick<BookingDoc, '_id' | 'code' | 'vehicleId' | 'hostId' | 'period'>[]>();
    let alerted = 0;
    for (const b of late) {
      const claimed = await BookingModel.updateOne({ _id: b._id, nextBookingAlertedAt: { $exists: false } }, { $set: { nextBookingAlertedAt: new Date(now) } });
      if (!claimed.modifiedCount) continue;
      const next = await BookingModel.findOne({
        _id: { $ne: b._id },
        vehicleId: b.vehicleId,
        deletedAt: null,
        status: { $in: ['paid', 'confirmed'] },
        'period.start': { $lte: new Date(now + hours * 3_600_000) },
      })
        .sort({ 'period.start': 1 })
        .select('_id code guestId period')
        .lean<Pick<BookingDoc, '_id' | 'code' | 'guestId' | 'period'>>();
      if (!next) continue;
      let offeredCar: string | null = null;
      try {
        offeredCar = await bookingService.offerLateSwap(next._id, b._id);
      } catch (err) {
        logger.warn({ err, bookingId: next._id }, 'late swap offer failed');
      }
      emit(EVENTS.NEXT_BOOKING_AT_RISK, b._id, {
        lateBookingId: b._id,
        lateCode: b.code,
        hostId: b.hostId,
        nextBookingId: next._id,
        nextCode: next.code,
        nextGuestId: next.guestId,
        nextStart: next.period.start,
        offeredCar,
      });
      alerted++;
    }
    return alerted;
  },
};
