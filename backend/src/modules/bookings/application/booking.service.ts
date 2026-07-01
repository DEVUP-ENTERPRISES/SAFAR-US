import { BookingModel, type BookingDoc } from '../infrastructure/booking.model';
import { canTransition, type BookingStatus } from '../domain/booking-status';
import { computeRefund } from '../domain/cancellation-policy';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { availabilityService } from '../../availability/application/availability.service';
import { pricingService } from '../../pricing/application/pricing.service';
import { paymentService } from '../../payments/application/payment.service';
import { couponService } from '../../coupons/application/coupon.service';
import { hostService } from '../../hosts/application/host.service';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../../core/errors/app-error';
import { uuid, randomId } from '../../../shared/utils/uuid';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { decodeCursor, cursorFilter, toPage } from '../../../shared/utils/pagination';
import type { Page, Principal } from '../../../core/types/common';
import type { PriceBreakdown } from '../../../core/contracts/pricing.contract';
import type { CreateBookingDto } from '../dto/booking.schemas';

const APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export class BookingService {
  async quote(dto: CreateBookingDto): Promise<PriceBreakdown> {
    const { start, end } = this.parsePeriod(dto.start, dto.end);
    await this.assertBookableWindow(dto.vehicleId, start, end);
    return pricingService.quote({ vehicleId: dto.vehicleId, start, end, couponCode: dto.couponCode });
  }

  async create(guestId: string, dto: CreateBookingDto, idempotencyKey?: string): Promise<BookingDoc> {
    if (idempotencyKey) {
      const existing = await BookingModel.findOne({ idempotencyKey }).lean<BookingDoc>();
      if (existing) return existing;
    }

    const { start, end } = this.parsePeriod(dto.start, dto.end);
    const vehicle = await vehicleService.getForBooking(dto.vehicleId);
    if (!vehicle.bookable) throw new ConflictError('Vehicle is not bookable', 'NOT_BOOKABLE');
    if (vehicle.hostId && guestId === (await this.hostUserId(vehicle.hostId))) {
      throw new ForbiddenError('You cannot book your own vehicle');
    }
    this.assertDuration(start, end, vehicle.minTripHours, vehicle.maxTripHours);

    if (!(await availabilityService.isAvailable(dto.vehicleId, start, end))) {
      throw new ConflictError('Vehicle is not available for the selected dates', 'NOT_AVAILABLE');
    }

    const breakdown = await pricingService.quote({
      vehicleId: dto.vehicleId,
      start,
      end,
      couponCode: dto.couponCode,
    });

    // Reserve the slot BEFORE talking to the gateway (prevents double-booking
    // during the payment round-trip). Roll back on any downstream failure.
    const holdId = await availabilityService.placeHold(dto.vehicleId, start, end);
    const bookingId = uuid();

    try {
      const charge = await paymentService.chargeForBooking({
        bookingId,
        guestId,
        hostId: vehicle.hostId,
        capture: vehicle.instantBook,
        total: breakdown.total,
        hostEarnings: breakdown.hostEarnings,
        commission: breakdown.commission,
        tax: breakdown.tax,
        idempotencyKey: idempotencyKey ?? bookingId,
      });

      const status: BookingStatus = vehicle.instantBook ? 'paid' : 'pending_approval';
      const now = new Date();

      const booking = await BookingModel.create({
        _id: bookingId,
        code: this.generateCode(),
        guestId,
        hostId: vehicle.hostId,
        vehicleId: dto.vehicleId,
        period: { start, end },
        priceBreakdown: breakdown,
        cancellationPolicy: vehicle.cancellationPolicy,
        status,
        statusHistory: [{ from: null, to: status, at: now, by: guestId }],
        holdId,
        paymentId: charge.paymentId,
        couponCode: dto.couponCode,
        instantBook: vehicle.instantBook,
        approvalDeadline: vehicle.instantBook
          ? undefined
          : new Date(Math.min(start.getTime(), now.getTime() + APPROVAL_WINDOW_MS)),
        idempotencyKey,
      });

      if (vehicle.instantBook) {
        await availabilityService.confirmHold(holdId, bookingId);
      }
      if (dto.couponCode) await couponService.redeem(dto.couponCode);

      emit(EVENTS.BOOKING_CREATED, bookingId, {
        bookingId,
        guestId,
        hostId: vehicle.hostId,
        instantBook: vehicle.instantBook,
      });
      if (vehicle.instantBook) {
        emit(EVENTS.BOOKING_CONFIRMED, bookingId, { bookingId, guestId, hostId: vehicle.hostId });
      }

      return booking.toObject();
    } catch (err) {
      await availabilityService.releaseHold(holdId);
      throw err;
    }
  }

  /** Host approves a request-to-book booking. */
  async confirm(userId: string, bookingId: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    await this.assertHostOwner(userId, booking.hostId);
    if (booking.status !== 'pending_approval') {
      throw new ConflictError('Booking is not awaiting approval', 'INVALID_STATE');
    }
    await paymentService.captureBooking(bookingId);
    await availabilityService.confirmHold(booking.holdId!, bookingId);
    await this.transition(booking, 'paid', userId, 'Host approved');
    emit(EVENTS.BOOKING_CONFIRMED, bookingId, { bookingId, guestId: booking.guestId, hostId: booking.hostId });
    return this.getDoc(bookingId);
  }

  /** Host declines a request-to-book booking. */
  async decline(userId: string, bookingId: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    await this.assertHostOwner(userId, booking.hostId);
    if (booking.status !== 'pending_approval') {
      throw new ConflictError('Booking is not awaiting approval', 'INVALID_STATE');
    }
    await paymentService.cancelAuthorization(bookingId);
    await availabilityService.releaseHold(booking.holdId!);
    await this.transition(booking, 'declined', userId, 'Host declined');
    return this.getDoc(bookingId);
  }

  /** Guest or host cancels; refund computed by policy. */
  async cancel(principal: Principal, bookingId: string, reason: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    const isGuest = booking.guestId === principal.userId;
    const isHost = await this.isHostOwner(principal.userId, booking.hostId);
    const isAdmin = principal.permissions.includes('booking:read:any') || principal.permissions.includes('*');
    if (!isGuest && !isHost && !isAdmin) throw new ForbiddenError('Cannot cancel this booking');

    if (!['pending_approval', 'confirmed', 'paid'].includes(booking.status)) {
      throw new ConflictError('Booking cannot be cancelled in its current state', 'INVALID_STATE');
    }

    const total = booking.priceBreakdown.total;
    let refund = { amount: 0, currency: total.currency };

    if (booking.status === 'paid' || booking.status === 'confirmed') {
      // Host cancellation → full guest refund; guest cancellation → policy.
      refund = isHost
        ? { ...total }
        : computeRefund(booking.cancellationPolicy, total, booking.period.start);
      if (refund.amount > 0) {
        await paymentService.refundBooking(bookingId, refund, reason);
      }
    } else {
      await paymentService.cancelAuthorization(bookingId);
    }

    await availabilityService.releaseBooking(bookingId);
    if (booking.holdId) await availabilityService.releaseHold(booking.holdId);

    await BookingModel.updateOne(
      { _id: bookingId },
      { cancellation: { by: principal.userId, at: new Date(), reason, refund } },
    );
    await this.transition(booking, 'cancelled', principal.userId, reason);
    emit(EVENTS.BOOKING_CANCELLED, bookingId, {
      bookingId,
      guestId: booking.guestId,
      hostId: booking.hostId,
      refund,
    });
    return this.getDoc(bookingId);
  }

  async get(principal: Principal, bookingId: string): Promise<BookingDoc> {
    const booking = await this.getDoc(bookingId);
    const isParticipant =
      booking.guestId === principal.userId || (await this.isHostOwner(principal.userId, booking.hostId));
    const isAdmin = principal.permissions.includes('booking:read:any') || principal.permissions.includes('*');
    if (!isParticipant && !isAdmin) throw new ForbiddenError('Not your booking');
    return booking;
  }

  async listForGuest(guestId: string, cursorRaw?: string, limit = 20): Promise<Page<BookingDoc>> {
    const cursor = decodeCursor(cursorRaw);
    const rows = await BookingModel.find({ guestId, deletedAt: null, ...cursorFilter(cursor) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<BookingDoc[]>();
    return toPage(rows, limit);
  }

  async listForHost(userId: string, cursorRaw?: string, limit = 20): Promise<Page<BookingDoc>> {
    const host = await hostService.requireHostForUser(userId);
    const cursor = decodeCursor(cursorRaw);
    const rows = await BookingModel.find({ hostId: host._id, deletedAt: null, ...cursorFilter(cursor) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<BookingDoc[]>();
    return toPage(rows, limit);
  }

  /** Cron: expire request-to-book bookings the host never acted on. */
  async expirePending(): Promise<number> {
    const due = await BookingModel.find({
      status: 'pending_approval',
      approvalDeadline: { $lte: new Date() },
    }).lean<BookingDoc[]>();
    for (const b of due) {
      await paymentService.cancelAuthorization(b._id);
      if (b.holdId) await availabilityService.releaseHold(b.holdId);
      const doc = await this.getDoc(b._id);
      await this.transition(doc, 'expired', 'system', 'Approval window elapsed');
      emit(EVENTS.BOOKING_EXPIRED, b._id, { bookingId: b._id });
    }
    return due.length;
  }

  // Called by the trips module
  async markInProgress(bookingId: string): Promise<void> {
    const b = await this.getDoc(bookingId);
    await this.transition(b, 'in_progress', 'system', 'Trip started');
  }

  async markCompleted(bookingId: string): Promise<void> {
    const b = await this.getDoc(bookingId);
    await this.transition(b, 'completed', 'system', 'Trip completed');
    emit(EVENTS.BOOKING_COMPLETED, bookingId, { bookingId, hostId: b.hostId, guestId: b.guestId });
  }

  async attachTrip(bookingId: string, tripId: string): Promise<void> {
    await BookingModel.updateOne({ _id: bookingId }, { tripId });
  }

  /** Aggregated completed-trip stats for a set of vehicles (fleet analytics). */
  async completedStatsForVehicles(
    vehicleIds: string[],
  ): Promise<{ trips: number; revenue: number }> {
    const [row] = await BookingModel.aggregate<{ trips: number; revenue: number }>([
      { $match: { vehicleId: { $in: vehicleIds }, status: 'completed' } },
      {
        $group: {
          _id: null,
          trips: { $sum: 1 },
          revenue: { $sum: '$priceBreakdown.hostEarnings.amount' },
        },
      },
    ]).exec();
    return { trips: row?.trips ?? 0, revenue: row?.revenue ?? 0 };
  }

  // ── internals ────────────────────────────────────────────────────────
  async getDoc(bookingId: string): Promise<BookingDoc> {
    const b = await BookingModel.findOne({ _id: bookingId, deletedAt: null }).lean<BookingDoc>();
    if (!b) throw new NotFoundError('Booking');
    return b;
  }

  private async transition(
    booking: BookingDoc,
    to: BookingStatus,
    by: string,
    reason?: string,
  ): Promise<void> {
    if (!canTransition(booking.status, to)) {
      throw new ConflictError(
        `Illegal transition ${booking.status} → ${to}`,
        'ILLEGAL_TRANSITION',
      );
    }
    // Optimistic concurrency: only transition if version unchanged.
    const res = await BookingModel.updateOne(
      { _id: booking._id, version: booking.version },
      {
        $set: { status: to },
        $inc: { version: 1 },
        $push: { statusHistory: { from: booking.status, to, at: new Date(), by, reason } },
      },
    );
    if (res.matchedCount === 0) {
      throw new ConflictError('Booking was modified concurrently, retry', 'VERSION_CONFLICT');
    }
  }

  private parsePeriod(startIn: unknown, endIn: unknown): { start: Date; end: Date } {
    const start = new Date(startIn as string);
    const end = new Date(endIn as string);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new ValidationError('Invalid dates');
    }
    if (start >= end) throw new ValidationError('start must be before end');
    if (start.getTime() < Date.now() - 60_000) throw new ValidationError('start must be in the future');
    return { start, end };
  }

  private assertDuration(start: Date, end: Date, minH: number, maxH: number): void {
    const hours = (end.getTime() - start.getTime()) / 3_600_000;
    if (hours < minH) throw new ValidationError(`Minimum trip length is ${minH} hours`);
    if (hours > maxH) throw new ValidationError(`Maximum trip length is ${maxH} hours`);
  }

  private async assertBookableWindow(vehicleId: string, start: Date, end: Date): Promise<void> {
    const v = await vehicleService.getForBooking(vehicleId);
    if (!v.bookable) throw new ConflictError('Vehicle is not bookable', 'NOT_BOOKABLE');
    this.assertDuration(start, end, v.minTripHours, v.maxTripHours);
  }

  private async assertHostOwner(userId: string, hostId: string): Promise<void> {
    if (!(await this.isHostOwner(userId, hostId))) {
      throw new ForbiddenError('You are not the host for this booking');
    }
  }

  private async isHostOwner(userId: string, hostId: string): Promise<boolean> {
    const host = await hostService.getByUserId(userId);
    return !!host && host._id === hostId;
  }

  private async hostUserId(hostId: string): Promise<string | null> {
    try {
      const host = await hostService.getById(hostId);
      return host.userId;
    } catch {
      return null;
    }
  }

  private generateCode(): string {
    return `TURA-${randomId().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  }
}

export const bookingService = new BookingService();
