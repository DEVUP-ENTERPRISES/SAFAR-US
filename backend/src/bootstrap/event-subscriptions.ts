import { eventBus } from '../shared/events/event-bus';
import { EVENTS } from '../core/events/event-names';
import { notificationService } from '../modules/notifications/application/notification.service';
import { payoutService } from '../modules/payouts/application/payout.service';
import { hostService } from '../modules/hosts/application/host.service';
import { logger } from '../infrastructure/logging/logger';

/**
 * Cross-module reactions wired in one place (each module's "manifest" of
 * subscriptions). Publishers never know who listens; this is the seam that
 * becomes a message broker when modules split into services.
 */
export function registerEventSubscribers(): void {
  const notifyHost = async (
    hostId: string,
    templateKey: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
  ) => {
    try {
      const host = await hostService.getById(hostId);
      await notificationService.send({ userId: host.userId, templateKey, title, body, data });
    } catch (err) {
      logger.warn({ err, hostId }, 'notify host failed');
    }
  };

  eventBus.subscribe(EVENTS.BOOKING_CREATED, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string; hostId: string; instantBook: boolean };
    await notificationService.send({
      userId: p.guestId,
      templateKey: 'booking.created',
      title: 'Booking requested',
      body: p.instantBook ? 'Your booking is confirmed!' : 'Waiting for host approval.',
      data: { bookingId: p.bookingId },
    });
    if (!p.instantBook) {
      await notifyHost(p.hostId, 'booking.request', 'New booking request', 'A guest wants to book your car.', {
        bookingId: p.bookingId,
      });
    }
  });

  eventBus.subscribe(EVENTS.BOOKING_CONFIRMED, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string; hostId: string };
    await notificationService.send({
      userId: p.guestId,
      templateKey: 'booking.confirmed',
      title: 'Booking confirmed',
      body: 'Your trip is booked. Have a great ride!',
      data: { bookingId: p.bookingId },
    });
  });

  eventBus.subscribe(EVENTS.BOOKING_CANCELLED, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string; hostId: string; refund: { amount: number } };
    await notificationService.send({
      userId: p.guestId,
      templateKey: 'booking.cancelled',
      title: 'Booking cancelled',
      body: `Your booking was cancelled. Refund: ${(p.refund?.amount ?? 0) / 100}.`,
      data: { bookingId: p.bookingId },
    });
    await notifyHost(p.hostId, 'booking.cancelled', 'Booking cancelled', 'A booking was cancelled.', {
      bookingId: p.bookingId,
    });
  });

  eventBus.subscribe(EVENTS.TRIP_STARTED, async (e) => {
    const p = e.payload as { tripId: string; bookingId: string };
    logger.info({ tripId: p.tripId }, 'trip started');
  });

  // Trip completion → schedule host payout after the hold window.
  eventBus.subscribe(EVENTS.BOOKING_COMPLETED, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string; hostId: string };
    await payoutService.scheduleForBooking(p.bookingId);
    await notificationService.send({
      userId: p.guestId,
      templateKey: 'trip.completed',
      title: 'Trip completed',
      body: 'Thanks for riding with TURA! Leave a review.',
      data: { bookingId: p.bookingId },
    });
  });

  logger.info('Event subscribers registered');
}
