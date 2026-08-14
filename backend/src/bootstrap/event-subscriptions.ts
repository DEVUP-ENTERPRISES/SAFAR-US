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
import { savedSearchService } from '../modules/saved-search/application/saved-search.service';
import { messageService } from '../modules/messaging/application/message.service';
import { logger } from '../infrastructure/logging/logger';

/** Best-effort system note into a booking conversation; never breaks the flow. */
async function postSystemNote(bookingId: string, body: string): Promise<void> {
  try {
    await messageService.system(bookingId, body);
  } catch (err) {
    logger.warn({ err, bookingId }, 'system chat note failed');
  }
}

const fmtDay = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Minor units → a properly formatted amount for message copy ("$28.39"). */
const formatAmount = (minorUnits: number, currency = 'USD'): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minorUnits / 100);

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
    priority: 'critical' | 'high' | 'normal' | 'low' = 'normal',
    deepLink?: string,
  ) => {
    try {
      const host = await hostService.getById(hostId);
      await notificationService.send({ userId: host.userId, templateKey, title, body, data, priority, deepLink });
    } catch (err) {
      logger.warn({ err, hostId }, 'notify host failed');
    }
  };

  eventBus.subscribe(EVENTS.BOOKING_CREATED, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string; hostId: string; instantBook: boolean };
    await notificationService.send({
      userId: p.guestId,
      priority: 'high',
      deepLink: `/bookings/${p.bookingId}`,
      templateKey: 'booking.created',
      title: 'Booking requested',
      body: p.instantBook ? 'Your booking is confirmed!' : 'Waiting for host approval.',
      data: { bookingId: p.bookingId },
    });
    if (!p.instantBook) {
      // Critical: this is the message whose absence silently expires bookings.
      // It has to leave the app — push, SMS and email.
      await notifyHost(
        p.hostId,
        'booking.request',
        'New booking request',
        'A guest wants to book your car. You have 24 hours to respond.',
        { bookingId: p.bookingId },
        'critical',
        `/host/trips?booking=${p.bookingId}`,
      );
    }
  });

  eventBus.subscribe(EVENTS.BOOKING_CONFIRMED, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string; hostId: string };
    await notificationService.send({
      userId: p.guestId,
      priority: 'critical',
      deepLink: `/bookings/${p.bookingId}`,
      templateKey: 'booking.confirmed',
      title: 'Booking confirmed',
      body: 'Your trip is booked. Have a great ride!',
      data: { bookingId: p.bookingId },
    });
    // Live push to any connected devices of the guest.
    realtimeEmitter.toUser(p.guestId, RT.BOOKING_UPDATE, { bookingId: p.bookingId, status: 'paid' });
    realtimeEmitter.toBooking(p.bookingId, RT.BOOKING_UPDATE, { bookingId: p.bookingId, status: 'paid' });
  });

  /*
   * A request that ends in "no" must say so.
   *
   * Declines and lapsed requests both quietly void the guest's authorisation
   * and release the dates — but neither told the guest anything, so their
   * screen kept showing "waiting for the host" while nothing was coming. Both
   * are critical: the guest has to know they need to book something else, and
   * that they have not been charged.
   *
   * The deep link goes to search rather than the dead booking — at the moment
   * someone learns their trip fell through, the useful next screen is other
   * cars for the same dates, not the request that failed.
   */
  eventBus.subscribe(EVENTS.BOOKING_DECLINED, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string };
    await notificationService.send({
      userId: p.guestId,
      priority: 'critical',
      deepLink: '/search',
      templateKey: 'booking.declined',
      title: 'Your request wasn’t accepted',
      body: 'The host couldn’t take this trip. You haven’t been charged — here are other cars for your dates.',
      data: { bookingId: p.bookingId },
    });
    realtimeEmitter.toUser(p.guestId, RT.BOOKING_UPDATE, { bookingId: p.bookingId, status: 'declined' });
    realtimeEmitter.toBooking(p.bookingId, RT.BOOKING_UPDATE, { bookingId: p.bookingId, status: 'declined' });
  });

  eventBus.subscribe(EVENTS.BOOKING_EXPIRED, async (e) => {
    const p = e.payload as { bookingId: string; guestId?: string; hostId?: string; reason?: string };
    if (!p.guestId) return; // older payloads carried only the id

    const verification = p.reason === 'verification';
    await notificationService.send({
      userId: p.guestId,
      priority: 'critical',
      deepLink: verification ? '/account/verify-identity' : '/search',
      templateKey: 'booking.expired',
      title: verification ? 'Your booking expired — verification incomplete' : 'Your request expired',
      body: verification
        ? 'We couldn’t confirm your identity in time, so the dates were released. You haven’t been charged — finish verifying and book again.'
        : 'The host didn’t respond in time, so we released your request. You haven’t been charged — here are other cars for your dates.',
      data: { bookingId: p.bookingId },
    });
    realtimeEmitter.toUser(p.guestId, RT.BOOKING_UPDATE, { bookingId: p.bookingId, status: 'expired' });

    // A missed request is a host problem too — an unanswered booking is lost
    // income and counts against their responsiveness.
    if (p.hostId && !verification) {
      await notifyHost(
        p.hostId,
        'booking.expired',
        'You missed a booking request',
        'A request expired before you answered. Responding faster keeps your listing competitive.',
        { bookingId: p.bookingId },
      );
    }
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
      priority: 'critical',
      deepLink: `/bookings/${p.bookingId}`,
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
    const p = e.payload as {
      bookingId: string; guestId: string; hostId: string;
      refund: { amount: number; currency?: string };
    };
    const refunded = p.refund?.amount ?? 0;
    await notificationService.send({
      userId: p.guestId,
      priority: 'critical',
      deepLink: `/bookings/${p.bookingId}`,
      templateKey: 'booking.cancelled',
      title: 'Booking cancelled',
      // Money is in minor units: dividing by 100 alone rendered "Refund: 28.4"
      // (and occasionally a float artefact) with no currency at all.
      body: refunded > 0
        ? `Your booking was cancelled. We're refunding ${formatAmount(refunded, p.refund?.currency)}.`
        : 'Your booking was cancelled. No refund was due under the cancellation policy.',
      data: { bookingId: p.bookingId },
    });
    await notifyHost(p.hostId, 'booking.cancelled', 'Booking cancelled', 'A booking was cancelled.', {
      bookingId: p.bookingId,
    });
  });

  // Guest no-show → the host earns their share of the forfeit (payout), and the
  // guest is told the outcome (the reliability hit lands via the cancelled_guest
  // status the trust engine already reads).
  eventBus.subscribe(EVENTS.BOOKING_GUEST_NO_SHOW, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string; hostId: string };
    await payoutService.scheduleForBooking(p.bookingId);
    await notificationService.send({
      userId: p.guestId,
      priority: 'high',
      deepLink: `/bookings/${p.bookingId}`,
      templateKey: 'booking.guest_no_show',
      title: 'Trip marked as a no-show',
      body: 'Your trip was recorded as a no-show. A share of the cost was retained per the no-show policy.',
      data: { bookingId: p.bookingId },
    });
    await notifyHost(p.hostId, 'booking.guest_no_show', 'Guest no-show recorded', 'The guest did not show — you keep your share of the no-show fee.', { bookingId: p.bookingId });
  });

  // Host no-show → the stranded guest is refunded and nudged to rebook.
  eventBus.subscribe(EVENTS.BOOKING_HOST_NO_SHOW, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string; hostId: string };
    await notificationService.send({
      userId: p.guestId,
      priority: 'critical',
      deepLink: `/bookings/${p.bookingId}`,
      templateKey: 'booking.host_no_show',
      title: 'Your host didn’t show — fully refunded',
      body: 'You’ve been fully refunded. We’ve found similar cars for your dates.',
      data: { bookingId: p.bookingId },
    });
  });

  // Host bailed (cancel/no-show) → nudge the stranded guest to rebook a similar
  // free car for the same dates.
  eventBus.subscribe(EVENTS.BOOKING_REBOOKING_NEEDED, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string };
    await notificationService.send({
      userId: p.guestId,
      priority: 'high',
      deepLink: `/bookings/${p.bookingId}/rebook`,
      templateKey: 'booking.rebooking_available',
      title: 'We’ll get you another car',
      // The promise, not just a link: a host cancelling pushes the guest into
      // last-minute pricing, and we cover that gap rather than refunding and
      // leaving them worse off.
      body: 'Your host cancelled, so we’ve lined up similar cars for the same dates — and we’ll cover the price difference. You won’t pay more than you originally booked.',
      data: { bookingId: p.bookingId },
    });
  });

  eventBus.subscribe(EVENTS.TRIP_STARTED, async (e) => {
    const p = e.payload as { tripId: string; bookingId: string };
    logger.info({ tripId: p.tripId }, 'trip started');
  });

  // Emergency raised → alert both parties immediately (critical). The trip is
  // already paused; ops watches TRIP_INCIDENT_RAISED for dispatch.
  eventBus.subscribe(EVENTS.TRIP_INCIDENT_RAISED, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string; hostId: string; byUserId: string; type: string };
    const body = `An emergency (${p.type}) was reported on an active trip. Our team has been alerted.`;
    for (const userId of [p.guestId]) {
      await notificationService.send({ userId, priority: 'critical', deepLink: `/trips`, templateKey: 'trip.incident', title: 'Emergency reported', body, data: { bookingId: p.bookingId, type: p.type } });
    }
    await notifyHost(p.hostId, 'trip.incident', 'Emergency reported on your car', body, { bookingId: p.bookingId, type: p.type });
    logger.error({ bookingId: p.bookingId, type: p.type, by: p.byUserId }, 'TRIP INCIDENT RAISED');
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
              priority: 'critical',
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

  // ── System notes into the booking conversation ─────────────────────────
  // The chat thread doubles as the trip's running record: the milestones that
  // both parties care about are written into it as they happen.
  eventBus.subscribe(EVENTS.TRIP_STARTED, async (e) => {
    const p = e.payload as { bookingId: string };
    await postSystemNote(p.bookingId, 'Trip started — the handover is complete and the car is on the road.');
  });
  eventBus.subscribe(EVENTS.TRIP_COMPLETED, async (e) => {
    const p = e.payload as { bookingId: string };
    await postSystemNote(p.bookingId, 'Trip completed — the car has been returned.');
  });
  eventBus.subscribe(EVENTS.BOOKING_EXTENDED, async (e) => {
    const p = e.payload as { bookingId: string; newEnd: Date | string };
    await postSystemNote(p.bookingId, `Trip extended — the new return date is ${fmtDay(p.newEnd)}.`);
  });
  eventBus.subscribe(EVENTS.BOOKING_SHORTENED, async (e) => {
    const p = e.payload as { bookingId: string; newEnd: Date | string };
    await postSystemNote(p.bookingId, `Trip shortened — the new return date is ${fmtDay(p.newEnd)}.`);
  });

  /** A newly listed car alerts everyone whose saved search it matches. */
  eventBus.subscribe(EVENTS.VEHICLE_LISTED, async (e) => {
    const p = e.payload as { vehicleId: string };
    try {
      await savedSearchService.notifyMatchesForVehicle(p.vehicleId);
    } catch (err) {
      logger.error({ err, vehicleId: p.vehicleId }, 'saved-search match run failed');
    }
  });

  logger.info('Event subscribers registered');
}
