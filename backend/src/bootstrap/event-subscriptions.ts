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
import { vehicleLifecycleService } from '../modules/vehicles/application/vehicle-lifecycle.service';
import { TripModel } from '../modules/trips/infrastructure/trip.model';
import { logger } from '../infrastructure/logging/logger';
import { userRepository } from '../modules/users/infrastructure/user.repository';
import { ROLES } from '../shared/constants/rbac';

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

  // Ops needs to hear about anything the platform itself must act on.
  const notifyStaff = async (
    templateKey: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
    priority: 'critical' | 'high' = 'high',
  ) => {
    try {
      const staff = await userRepository.findByAnyRole([ROLES.SUPPORT, ROLES.OPS, ROLES.SUPER_ADMIN]);
      await Promise.all(
        staff.map((u) =>
          notificationService.send({ userId: u._id, templateKey, title, body, data, priority }),
        ),
      );
    } catch (err) {
      logger.warn({ err, templateKey }, 'notify staff failed');
    }
  };

  eventBus.subscribe(EVENTS.BOOKING_CREATED, async (e) => {
    const p = e.payload as {
      bookingId: string;
      guestId: string;
      hostId: string;
      instantBook: boolean;
      status: string;
    };

    /*
     * What the guest is told must match what the booking actually is.
     *
     * This branched on `instantBook` — a property of the listing, not of the
     * booking — so a trip left at pending_verification with a card that never
     * cleared still told the guest "Your booking is confirmed!". A guest who
     * believes that shows up at an airport for a car nobody is bringing.
     *
     * A genuinely paid booking is announced by BOOKING_CONFIRMED, which fires
     * immediately after this one. Saying it here too would be both duplicated
     * and, whenever the money had not moved, false — so this stays quiet.
     */
    const GUEST_MESSAGE: Record<string, { title: string; body: string }> = {
      pending_approval: { title: 'Booking requested', body: 'Waiting for host approval.' },
      pending_payment: {
        title: 'Payment not completed',
        body: 'Your trip is being held but is not confirmed yet. Finish payment to confirm it.',
      },
      pending_verification: {
        title: 'Verification needed',
        body: 'Your trip is being held. Finish your identity checks to confirm it.',
      },
    };
    const message = GUEST_MESSAGE[p.status];
    if (message) {
      await notificationService.send({
        userId: p.guestId,
        priority: 'high',
        deepLink: `/bookings/${p.bookingId}`,
        templateKey: 'booking.created',
        title: message.title,
        body: message.body,
        data: { bookingId: p.bookingId },
      });
    }
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

  eventBus.subscribe(EVENTS.USER_REGISTERED, async (e) => {
    const p = e.payload as { userId: string; email?: string; firstName?: string };
    // High priority (not the 'normal' default) is what puts this on email —
    // 'normal' only reaches push/in-app, and a welcome email that never
    // arrives is the first impression of the whole product.
    await notificationService.send({
      userId: p.userId,
      priority: 'high',
      deepLink: '/search',
      actionLabel: 'Start exploring',
      templateKey: 'account.welcome',
      title: `Welcome to CatoDrive${p.firstName ? `, ${p.firstName}` : ''}`,
      body: 'Your account is ready. Browse verified cars near you and book your first trip in minutes.',
      data: { userId: p.userId },
    });
  });

  eventBus.subscribe(EVENTS.BOOKING_CONFIRMED, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string; hostId: string; instant?: boolean };
    // A host who approved a request already knows; an Instant Book arrives unannounced.
    if (p.instant) {
      await notifyHost(p.hostId, 'booking.confirmed', 'New booking', 'A guest booked your car instantly. It’s confirmed and on your calendar.', { bookingId: p.bookingId }, 'high', `/host/trips?booking=${p.bookingId}`);
      realtimeEmitter.toBooking(p.bookingId, RT.BOOKING_UPDATE, { bookingId: p.bookingId, status: 'paid' });
    }
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

  // Pre-booking inquiry: notify the recipient (guest or host) of a new question.
  eventBus.subscribe(EVENTS.INQUIRY_MESSAGE_SENT, async (e) => {
    const p = e.payload as { vehicleId: string; guestId: string; recipientUserId: string; preview: string };
    if (!p.recipientUserId) return;
    await notificationService.send({
      userId: p.recipientUserId,
      templateKey: 'inquiry.message',
      title: 'New question',
      body: p.preview || 'You have a new message',
      data: { vehicleId: p.vehicleId, guestId: p.guestId },
    });
  });

  // Trip reminder (from the scheduled job).
  eventBus.subscribe(EVENTS.BOOKING_REMINDER, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string; kind?: string; deadline?: string | Date };
    if (p.kind === 'verification') {
      const by = p.deadline
        ? new Date(p.deadline).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : 'shortly before pickup';
      await notificationService.send({
        userId: p.guestId,
        priority: 'critical',
        deepLink: '/account/verify-identity',
        templateKey: 'booking.verification_reminder',
        title: 'Verify your licence to keep your trip',
        body: `Finish your identity check by ${by} or the booking will be released. You haven’t been charged.`,
        data: { bookingId: p.bookingId },
      });
      return;
    }
    await notificationService.send({
      userId: p.guestId,
      priority: 'critical',
      deepLink: `/bookings/${p.bookingId}`,
      templateKey: 'booking.reminder',
      title: 'Your trip is coming up',
      body: 'Your CatoDrive trip starts soon. Tap to view details.',
      data: { bookingId: p.bookingId },
    });
  });

  // A card that authorized fine at booking time can still fail minutes later
  // (bank decline, 3DS abandoned). Unhandled, the guest never learns their
  // trip isn't actually paid for until they're standing at the car.
  eventBus.subscribe(EVENTS.PAYMENT_FAILED, async (e) => {
    const p = e.payload as { bookingId: string; reason?: string };
    let released = false;
    try {
      released = await bookingService.failForPayment(p.bookingId, p.reason);
    } catch (err) {
      logger.error({ err, bookingId: p.bookingId }, 'payment.failed cleanup failed — booking may still hold dates');
    }
    try {
      const booking = await bookingService.getDoc(p.bookingId);
      await notificationService.send({
        userId: booking.guestId,
        priority: 'critical',
        deepLink: `/bookings/${p.bookingId}`,
        templateKey: 'payment.failed',
        title: released ? 'Your booking was cancelled' : 'Payment didn’t go through',
        body: released
          ? `Your card was declined${p.reason ? ` (${p.reason})` : ''}, so this booking was released. You can book again with another card.`
          : p.reason
            ? `Your card was declined: ${p.reason}. Update your payment method to keep this trip.`
            : 'Your card was declined. Update your payment method to keep this trip.',
        data: { bookingId: p.bookingId },
      });
      if (released) {
        await notifyHost(
          booking.hostId,
          'booking.cancelled',
          'A booking was released',
          'A guest’s payment failed after checkout, so their booking was cancelled and your dates are open again.',
          { bookingId: p.bookingId },
          'high',
        );
      }
    } catch (err) {
      logger.warn({ err, bookingId: p.bookingId }, 'payment.failed notification failed');
    }
  });

  // A chargeback is money already gone. The guest doesn't need telling —
  // this reaches ops via support, since it's the one payment event with no
  // per-user "you're fine" message that makes sense to send.
  eventBus.subscribe(EVENTS.PAYMENT_DISPUTED, async (e) => {
    const p = e.payload as { bookingId: string };
    try {
      const booking = await bookingService.getDoc(p.bookingId);
      const held = await payoutService.holdForBooking(p.bookingId, 'Chargeback opened');
      await notifyHost(
        booking.hostId,
        'payment.disputed',
        'A charge on your trip is under dispute',
        'The guest’s bank has opened a dispute on this trip’s charge. Your payout for it is on hold until the bank decides.',
        { bookingId: p.bookingId },
        'high',
        `/host/trips?booking=${p.bookingId}`,
      );
      await notifyStaff(
        'payment.disputed',
        'Chargeback opened',
        held
          ? `Booking ${booking.code}: payout placed on hold. Submit evidence in Stripe.`
          : `Booking ${booking.code}: the host was ALREADY PAID for this trip. Submit evidence in Stripe and arrange recovery.`,
        { bookingId: p.bookingId },
        'critical',
      );
    } catch (err) {
      logger.warn({ err, bookingId: p.bookingId }, 'payment.disputed handling failed');
    }
  });

  eventBus.subscribe(EVENTS.PAYMENT_DISPUTE_CLOSED, async (e) => {
    const p = e.payload as { bookingId: string; won: boolean };
    try {
      await payoutService.resolveHold(p.bookingId, p.won);
      await notifyStaff('payment.dispute_closed', p.won ? 'Chargeback won' : 'Chargeback lost', `Booking ${p.bookingId}: payout ${p.won ? 'released' : 'written off'}.`, { bookingId: p.bookingId });
    } catch (err) {
      logger.warn({ err, bookingId: p.bookingId }, 'payment.dispute_closed handling failed');
    }
  });

  // A card payment that needed the cardholder just cleared: confirm the trip.
  eventBus.subscribe(EVENTS.PAYMENT_SUCCEEDED, async (e) => {
    const p = e.payload as { bookingId: string };
    try {
      await bookingService.confirmAfterPayment(p.bookingId);
    } catch (err) {
      logger.error({ err, bookingId: p.bookingId }, 'could not confirm booking after payment');
    }
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
    try {
      const booking = await bookingService.getDoc(p.bookingId);
      await notifyStaff('trip.sos', 'SOS on an active trip', `Booking ${booking.code}: a participant pressed SOS. Contact them now.`, { bookingId: p.bookingId, tripId: p.tripId }, 'critical');
      const other = p.byUserId === booking.guestId ? null : booking.guestId;
      if (other) {
        await notificationService.send({ userId: other, priority: 'critical', deepLink: `/bookings/${p.bookingId}`, templateKey: 'trip.sos', title: 'SOS raised on your trip', body: 'An emergency alert was sent for your trip. Our team is following up.', data: { bookingId: p.bookingId } });
      } else {
        await notifyHost(booking.hostId, 'trip.sos', 'SOS raised on your car', 'Your guest pressed SOS during the trip. Our team is following up.', { bookingId: p.bookingId }, 'critical');
      }
    } catch (err) {
      logger.warn({ err, bookingId: p.bookingId }, 'sos notification failed');
    }
  });

  // A car pulled off the road takes its future bookings with it.
  eventBus.subscribe(EVENTS.VEHICLE_UNAVAILABLE, async (e) => {
    const p = e.payload as { vehicleId: string; reason: string; withinHours?: number };
    try {
      const n = await bookingService.cancelUpcomingForVehicle(p.vehicleId, p.reason, p.withinHours);
      if (n) await notifyStaff('vehicle.unavailable', 'Bookings released', `${n} upcoming booking(s) were cancelled and refunded because the car became unavailable (${p.reason}).`, { vehicleId: p.vehicleId }, 'high');
    } catch (err) {
      logger.error({ err, vehicleId: p.vehicleId }, 'could not release bookings for unavailable vehicle');
    }
  });

  // Money collected after the trip (overage, a late fee, a toll…) is the host's.
  eventBus.subscribe(EVENTS.BOOKING_CHARGE_COLLECTED, async (e) => {
    const p = e.payload as { bookingId: string; hostId: string; amount: number; currency: string; key: string };
    await payoutService.scheduleExtra(p.bookingId, p.hostId, p.amount, p.currency, `charge_${p.key}`);
  });

  // A charge we could not collect is money owed that nobody is chasing unless we say so.
  eventBus.subscribe(EVENTS.BOOKING_CHARGE_FAILED, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string; hostId: string; amount: number; label: string };
    await notificationService.send({
      userId: p.guestId,
      priority: 'critical',
      deepLink: '/account',
      templateKey: 'booking.charge_failed',
      title: 'We couldn’t collect a charge',
      body: `${p.label} (${formatAmount(p.amount)}) could not be charged to your card. Please update your payment method.`,
      data: { bookingId: p.bookingId },
    });
    await notifyStaff('booking.charge_failed', 'Post-trip charge not collected', `Booking ${p.bookingId}: ${p.label} (${formatAmount(p.amount)}) could not be collected from the guest's card or deposit.`, { bookingId: p.bookingId });
  });

  // A trip that should have ended and hasn't.
  eventBus.subscribe(EVENTS.BOOKING_OVERDUE, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string; hostId: string; stage: 'late' | 'escalated' | 'never_started' };
    if (p.stage === 'never_started') {
      await notificationService.send({ userId: p.guestId, priority: 'high', deepLink: `/bookings/${p.bookingId}`, templateKey: 'booking.not_started', title: 'Your pickup time has passed', body: 'Your trip hasn’t started yet. Meet your host, or report a no-show from your trip page if they haven’t turned up.', data: { bookingId: p.bookingId } });
      await notifyHost(p.hostId, 'booking.not_started', 'Guest hasn’t picked up yet', 'The pickup time has passed and the trip hasn’t started. Start the trip when you meet, or report a no-show.', { bookingId: p.bookingId }, 'high', `/host/trips?booking=${p.bookingId}`);
      return;
    }
    if (p.stage === 'late') {
      await notificationService.send({ userId: p.guestId, priority: 'critical', deepLink: `/bookings/${p.bookingId}`, templateKey: 'trip.overdue', title: 'Your return time has passed', body: 'Please return the car now. Late fees apply per hour after the grace period.', data: { bookingId: p.bookingId } });
      await notifyHost(p.hostId, 'trip.overdue', 'Your car is overdue', 'The guest hasn’t returned the car on time. We’ve reminded them and late fees will apply.', { bookingId: p.bookingId }, 'high', `/host/trips?booking=${p.bookingId}`);
      return;
    }
    await notifyStaff('trip.overdue_escalated', 'Vehicle not returned', `Booking ${p.bookingId} is more than a day overdue. Contact the guest; consider the recovery process.`, { bookingId: p.bookingId }, 'critical');
    await notifyHost(p.hostId, 'trip.overdue', 'Still no return', 'Your car is more than a day overdue. Our team has been alerted and is contacting the guest.', { bookingId: p.bookingId }, 'critical');
  });

  eventBus.subscribe(EVENTS.BOOKING_CANCELLED, async (e) => {
    const p = e.payload as {
      bookingId: string; guestId: string; hostId: string; cancelledBy?: string;
      refund: { amount: number; currency?: string };
    };
    const refunded = p.refund?.amount ?? 0;
    // A late guest cancel keeps part of the money; the host's share of it is theirs.
    if (p.cancelledBy === 'guest') {
      await payoutService.scheduleRetainedShare(p.bookingId).catch((err) => logger.error({ err, bookingId: p.bookingId }, 'retained share payout failed'));
    }
    realtimeEmitter.toUser(p.guestId, RT.BOOKING_UPDATE, { bookingId: p.bookingId, status: 'cancelled' });
    realtimeEmitter.toBooking(p.bookingId, RT.BOOKING_UPDATE, { bookingId: p.bookingId, status: 'cancelled' });
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
        : p.cancelledBy === 'system'
          ? 'Your booking was cancelled by CatoDrive. You haven’t been charged.'
          : 'Your booking was cancelled. No refund was due under the cancellation policy.',
      data: { bookingId: p.bookingId },
    });
    await notifyHost(
      p.hostId,
      'booking.cancelled',
      'Booking cancelled',
      p.cancelledBy === 'guest'
        ? 'Your guest cancelled the trip. Your calendar is open again, and you keep your share of anything the cancellation policy retains.'
        : 'A booking was cancelled and your calendar is open again.',
      { bookingId: p.bookingId },
      'high',
      `/host/trips?booking=${p.bookingId}`,
    );
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
    await notifyStaff('trip.incident', `Incident: ${p.type}`, `An incident (${p.type}) was reported on booking ${p.bookingId}. The trip is paused.`, { bookingId: p.bookingId, type: p.type }, 'critical');
    logger.error({ bookingId: p.bookingId, type: p.type, by: p.byUserId }, 'TRIP INCIDENT RAISED');
  });

  // Trip completion → schedule host payout after the hold window.
  eventBus.subscribe(EVENTS.BOOKING_COMPLETED, async (e) => {
    const p = e.payload as { bookingId: string; guestId: string; hostId: string };
    await payoutService.scheduleForBooking(p.bookingId);

    // CatoDrive Rewards: 1 point per $1 spent (× tier multiplier), idempotent per booking.
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
      body: 'Thanks for riding with CatoDrive! You earned points — leave a review.',
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
  // Both sides get a real notification at each milestone, not just a chat note.
  const notifyParties = async (
    bookingId: string,
    templateKey: string,
    guestCopy: { title: string; body: string },
    hostCopy: { title: string; body: string },
  ) => {
    try {
      const booking = await bookingService.getDoc(bookingId);
      await notificationService.send({ userId: booking.guestId, priority: 'high', deepLink: `/bookings/${bookingId}`, templateKey, ...guestCopy, data: { bookingId } });
      await notifyHost(booking.hostId, templateKey, hostCopy.title, hostCopy.body, { bookingId }, 'high', `/host/trips?booking=${bookingId}`);
      realtimeEmitter.toBooking(bookingId, RT.BOOKING_UPDATE, { bookingId, status: booking.status });
    } catch (err) {
      logger.warn({ err, bookingId, templateKey }, 'party notification failed');
    }
  };

  eventBus.subscribe(EVENTS.TRIP_STARTED, async (e) => {
    const p = e.payload as { bookingId: string };
    await postSystemNote(p.bookingId, 'Trip started — the handover is complete and the car is on the road.');
    await notifyParties(
      p.bookingId,
      'trip.started',
      { title: 'Your trip has started', body: 'Enjoy the drive — return the car on time to avoid late fees.' },
      { title: 'Trip started', body: 'Your guest has the car. You’ll be told when it’s returned.' },
    );
  });
  eventBus.subscribe(EVENTS.TRIP_COMPLETED, async (e) => {
    const p = e.payload as { bookingId: string };
    await postSystemNote(p.bookingId, 'Trip completed — the car has been returned.');
    await notifyParties(
      p.bookingId,
      'trip.returned',
      { title: 'Car returned', body: 'Thanks — your host now has a short window to inspect the car before your deposit is released.' },
      { title: 'Car returned', body: 'Your guest has returned the car. Inspect it and report any damage within the inspection window.' },
    );
  });
  eventBus.subscribe(EVENTS.BOOKING_EXTENDED, async (e) => {
    const p = e.payload as { bookingId: string; newEnd: Date | string; hostId?: string };
    await postSystemNote(p.bookingId, `Trip extended — the new return date is ${fmtDay(p.newEnd)}.`);
    if (p.hostId) {
      await notifyHost(p.hostId, 'booking.extended', 'Trip extended', `Your guest extended the trip — the new return date is ${fmtDay(p.newEnd)}.`, { bookingId: p.bookingId }, 'high', `/host/trips?booking=${p.bookingId}`);
    }
  });
  eventBus.subscribe(EVENTS.PAYOUT_SCHEDULED, async (e) => {
    const p = e.payload as { bookingId: string; hostId: string };
    await notifyHost(p.hostId, 'payout.scheduled', 'Earnings on the way', 'Your earnings from a completed trip are scheduled for payout.', { bookingId: p.bookingId });
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

  // ── Vehicle lifecycle & master timeline ────────────────────────────────
  // The trip milestones the trip service already emits drive the vehicle's
  // operational state and its append-only timeline. Handlers are isolated by
  // the bus, so a lifecycle write failing never breaks the trip flow; the
  // idempotency keys make a redelivered event a no-op.
  eventBus.subscribe(EVENTS.TRIP_STARTED, async (e) => {
    const p = e.payload as { tripId: string; bookingId: string; vehicleId?: string };
    const trip = await TripModel.findById(p.tripId).lean<{ vehicleId: string; guestId: string }>();
    const vehicleId = p.vehicleId ?? trip?.vehicleId;
    if (!vehicleId) return;
    await vehicleLifecycleService.transition({
      vehicleId,
      to: 'on_trip',
      actor: { userId: trip?.guestId, system: true },
      reason: 'Trip started (handover complete)',
      bookingId: p.bookingId,
      tripId: p.tripId,
      sourceType: 'trip',
      sourceId: p.tripId,
      idempotencyKey: `trip.started:${p.tripId}`,
    }).catch((err) => logger.warn({ err: (err as Error).message, tripId: p.tripId }, 'lifecycle on_trip failed'));
  });

  eventBus.subscribe(EVENTS.TRIP_COMPLETED, async (e) => {
    const p = e.payload as { tripId: string; bookingId: string };
    const trip = await TripModel.findById(p.tripId).lean<{
      vehicleId: string;
      damageReports?: unknown[];
      incidents?: { status: string }[];
    }>();
    if (!trip?.vehicleId) return;
    // Return the car, then route it: straight back to service when it came back
    // clean, otherwise into inspection when there is damage or an open incident.
    const needsReview =
      (trip.damageReports?.length ?? 0) > 0 ||
      (trip.incidents ?? []).some((i) => i.status === 'open');
    const common = {
      vehicleId: trip.vehicleId,
      actor: { system: true },
      bookingId: p.bookingId,
      tripId: p.tripId,
      sourceType: 'trip',
      sourceId: p.tripId,
    } as const;
    try {
      await vehicleLifecycleService.transition({
        ...common,
        to: 'returned',
        reason: 'Trip completed (vehicle returned)',
        idempotencyKey: `trip.returned:${p.tripId}`,
      });
      await vehicleLifecycleService.transition({
        ...common,
        to: needsReview ? 'inspecting' : 'idle',
        reason: needsReview ? 'Post-trip review required (damage/incident on record)' : 'Returned clean — back in service',
        idempotencyKey: `trip.postreturn:${p.tripId}`,
      });
    } catch (err) {
      logger.warn({ err: (err as Error).message, tripId: p.tripId }, 'lifecycle return failed');
    }
  });

  eventBus.subscribe(EVENTS.TRIP_CHECKED_IN, async (e) => {
    const p = e.payload as { tripId: string; bookingId: string; method?: string };
    const trip = await TripModel.findById(p.tripId).lean<{ vehicleId: string }>();
    if (!trip?.vehicleId) return;
    await vehicleLifecycleService.record({
      vehicleId: trip.vehicleId,
      kind: 'trip.checked_in',
      summary: `Guest checked in (${p.method ?? 'contactless'}) — pre-trip inspection captured`,
      actor: { system: true },
      bookingId: p.bookingId,
      tripId: p.tripId,
      sourceType: 'trip',
      sourceId: p.tripId,
      idempotencyKey: `trip.checked_in:${p.tripId}`,
    }).catch(() => undefined);
  });

  eventBus.subscribe(EVENTS.TRIP_DAMAGE_REPORTED, async (e) => {
    const p = e.payload as { tripId: string; bookingId: string; byUserId: string };
    const trip = await TripModel.findById(p.tripId).lean<{ vehicleId: string }>();
    if (!trip?.vehicleId) return;
    await vehicleLifecycleService.record({
      vehicleId: trip.vehicleId,
      kind: 'damage.reported',
      summary: 'Damage reported on the vehicle',
      actor: { userId: p.byUserId },
      bookingId: p.bookingId,
      tripId: p.tripId,
      sourceType: 'trip',
      sourceId: p.tripId,
    }).catch(() => undefined);
  });

  eventBus.subscribe(EVENTS.TRIP_INCIDENT_RAISED, async (e) => {
    const p = e.payload as { tripId: string; bookingId: string; byUserId: string; type: string };
    const trip = await TripModel.findById(p.tripId).lean<{ vehicleId: string }>();
    if (!trip?.vehicleId) return;
    await vehicleLifecycleService.record({
      vehicleId: trip.vehicleId,
      kind: 'incident.raised',
      summary: `Emergency reported on an active trip: ${p.type}`,
      actor: { userId: p.byUserId },
      reason: p.type,
      bookingId: p.bookingId,
      tripId: p.tripId,
      sourceType: 'trip',
      sourceId: p.tripId,
    }).catch(() => undefined);
  });

  logger.info('Event subscribers registered');
}
