import { eventBus } from '../shared/events/event-bus';
import { EVENTS } from '../core/events/event-names';
import { notificationService } from '../modules/notifications/application/notification.service';
import { payoutService } from '../modules/payouts/application/payout.service';
import { hostService } from '../modules/hosts/application/host.service';
import { realtimeEmitter, RT } from '../realtime/emitter';
import { rewardsService } from '../modules/rewards/application/rewards.service';
import { referralService } from '../modules/referral/application/referral.service';
import { bookingService } from '../modules/bookings/application/booking.service';
import { favoritesService } from '../modules/favorites/application/favorites.service';
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
    // Live push to any connected devices of the guest.
    realtimeEmitter.toUser(p.guestId, RT.BOOKING_UPDATE, { bookingId: p.bookingId, status: 'paid' });
    realtimeEmitter.toBooking(p.bookingId, RT.BOOKING_UPDATE, { bookingId: p.bookingId, status: 'paid' });
  });

  // Realtime trip status pushes.
  eventBus.subscribe(EVENTS.TRIP_STARTED, async (e) => {
    const p = e.payload as { tripId: string; bookingId: string };
    realtimeEmitter.toBooking(p.bookingId, RT.TRIP_STATUS, { tripId: p.tripId, status: 'active' });
  });
  eventBus.subscribe(EVENTS.TRIP_COMPLETED, async (e) => {
    const p = e.payload as { tripId: string; bookingId: string };
    realtimeEmitter.toBooking(p.bookingId, RT.TRIP_STATUS, { tripId: p.tripId, status: 'completed' });
  });

  // Chat: notify (and live-push) the recipient when a message arrives.
  eventBus.subscribe(EVENTS.CHAT_MESSAGE_SENT, async (e) => {
    const p = e.payload as { bookingId: string; recipientUserId: string; preview: string; senderId: string };
    if (!p.recipientUserId) return;
    await notificationService.send({
      userId: p.recipientUserId,
      templateKey: 'chat.message',
      title: 'New message',
      body: p.preview || 'You have a new message',
      data: { bookingId: p.bookingId },
    });
    realtimeEmitter.toUser(p.recipientUserId, RT.NOTIFICATION, {
      kind: 'chat',
      bookingId: p.bookingId,
    });
  });

  // Trip reminder (from the scheduled job).
  eventBus.subscribe(EVENTS.BOOKING_REMINDER, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string };
    await notificationService.send({
      userId: p.guestId,
      templateKey: 'booking.reminder',
      title: 'Your trip is coming up',
      body: 'Your CATO trip starts soon. Tap to view details.',
      data: { bookingId: p.bookingId },
    });
  });

  // Emergency SOS → alert the other party + support in realtime.
  eventBus.subscribe(EVENTS.TRIP_SOS, async (e) => {
    const p = e.payload as { tripId: string; bookingId: string; byUserId: string };
    realtimeEmitter.toBooking(p.bookingId, RT.TRIP_ALERT, {
      kind: 'sos',
      tripId: p.tripId,
      at: new Date().toISOString(),
    });
    logger.warn({ tripId: p.tripId, by: p.byUserId }, '🚨 SOS raised on trip');
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

    // CATO Rewards: 1 point per $1 spent (× tier multiplier), idempotent per booking.
    try {
      const booking = await bookingService.getDoc(p.bookingId);
      const basePoints = Math.floor(booking.priceBreakdown.total.amount / 100);
      await rewardsService.award(p.guestId, basePoints, 'earn', 'booking', p.bookingId, `Trip ${booking.code}`);
    } catch (err) {
      logger.warn({ err, bookingId: p.bookingId }, 'reward award failed');
    }
    // Referral: convert on the referee's first completed trip (both parties rewarded).
    await referralService.convert(p.guestId).catch(() => undefined);

    await notificationService.send({
      userId: p.guestId,
      templateKey: 'trip.completed',
      title: 'Trip completed',
      body: 'Thanks for riding with CATO! You earned points — leave a review.',
      data: { bookingId: p.bookingId },
    });
    realtimeEmitter.toUser(p.guestId, RT.NOTIFICATION, { kind: 'rewards', bookingId: p.bookingId });
  });

  // Price-drop alert → notify everyone who wishlisted this car.
  eventBus.subscribe(EVENTS.VEHICLE_PRICE_DROPPED, async (e) => {
    const p = e.payload as { vehicleId: string; oldPrice: number; newPrice: number; title: string; currency: string };
    const wishlisters = await favoritesService.wishlistersOf(p.vehicleId);
    const drop = ((p.oldPrice - p.newPrice) / 100).toFixed(0);
    for (const userId of wishlisters) {
      await notificationService.send({
        userId,
        templateKey: 'wishlist.price_drop',
        title: 'Price drop on a saved car! 📉',
        body: `${p.title} dropped by $${drop}/day — book before it's gone.`,
        data: { vehicleId: p.vehicleId },
      });
      realtimeEmitter.toUser(userId, RT.NOTIFICATION, { kind: 'price_drop', vehicleId: p.vehicleId });
    }
    if (wishlisters.length) logger.info({ vehicleId: p.vehicleId, wishlisters: wishlisters.length }, '📉 price-drop alerts sent');
  });

  // Back-in-stock: a saved car became listed/available again.
  eventBus.subscribe(EVENTS.VEHICLE_LISTED, async (e) => {
    const p = e.payload as { vehicleId: string };
    const wishlisters = await favoritesService.wishlistersOf(p.vehicleId);
    for (const userId of wishlisters) {
      await notificationService.send({
        userId,
        templateKey: 'wishlist.available',
        title: 'A saved car is now available! ✅',
        body: 'One of your wishlisted cars is back and ready to book.',
        data: { vehicleId: p.vehicleId },
      });
    }
  });

  /**
   * Identity cleared → release every booking that was waiting on it.
   *
   * Guests can request while unverified so their check runs alongside the
   * host's decision instead of after it. This is the seam that closes that
   * loop: without it, a verified guest's requests would sit held forever.
   */
  eventBus.subscribe(EVENTS.KYC_APPROVED, async (e) => {
    const p = e.payload as { userId: string };
    try {
      const promoted = await bookingService.onGuestVerified(p.userId);
      if (promoted > 0) {
        logger.info({ userId: p.userId, promoted }, 'released bookings held for verification');
        await notificationService.send({
          userId: p.userId,
          templateKey: 'booking.verification_cleared',
          title: 'You’re verified ✅',
          body: `Your licence checked out. ${promoted} booking${promoted === 1 ? ' is' : 's are'} moving forward.`,
          data: { promoted },
        });
      }
    } catch (err) {
      logger.error({ err, userId: p.userId }, 'failed to release held bookings after KYC approval');
    }
  });

  /** Identity rejected → the held requests cannot proceed. Release the money. */
  eventBus.subscribe(EVENTS.KYC_REJECTED, async (e) => {
    const p = e.payload as { userId: string };
    try {
      const held = await bookingService.listHeldForVerification(p.userId);
      for (const b of held) {
        await bookingService.systemCancel(b._id, 'Identity verification was not successful');
      }
      if (held.length > 0) {
        logger.info({ userId: p.userId, cancelled: held.length }, 'cancelled bookings after KYC rejection');
      }
    } catch (err) {
      logger.error({ err, userId: p.userId }, 'failed to cancel held bookings after KYC rejection');
    }
  });

  logger.info('Event subscribers registered');
}
