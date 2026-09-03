import { TripModel } from '../infrastructure/trip.model';
import { trackingPhaseService, type TrackingState } from './tracking-phase.service';
import { notificationService } from '../../notifications/application/notification.service';
import { auditService } from '../../audit/application/audit.service';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Telling the guest when exception tracking turns on, and recording that we did.
 *
 * Phase 4 is the only time this platform locates someone who has not chosen to
 * share — an SOS, an open incident, a car overdue past grace. Two things make
 * that defensible rather than merely convenient:
 *
 *  1. THE GUEST IS TOLD. Not buried in terms accepted weeks ago — a
 *     notification, at the moment it starts, naming the reason and how it ends.
 *     Several US states make notice the difference between lawful recovery and
 *     unlawful surveillance, and it is also simply what we would want told to
 *     us.
 *  2. IT IS WRITTEN DOWN. An audit row per activation, so "when did you start
 *     watching this person and why" has an answer that is not someone's memory.
 *
 * Notice is sent once per exception episode. A guest whose car is overdue
 * should not be pinged every time a screen polls, and a spammed notice is one
 * nobody reads.
 */

export const trackingNoticeService = {
  /**
   * Called when a trip enters an exception. Idempotent per episode: the flag on
   * the trip records that this kind has already been announced.
   */
  async announceIfNeeded(tripId: string, state: TrackingState): Promise<void> {
    if (!state.isException || !state.exceptionKind) return;

    const trip = await TripModel.findById(tripId).lean<{
      _id: string; guestId: string; hostId: string; bookingId: string;
      trackingNoticeSentFor?: string;
    }>();
    if (!trip) return;

    // Already announced for this kind — do not ping again.
    if (trip.trackingNoticeSentFor === state.exceptionKind) return;

    const bodies: Record<string, string> = {
      sos: 'You raised an emergency, so your location is being shared with your host and our support team until it is resolved.',
      incident: 'While an open incident on this trip is being resolved, your location is shared with your host and our support team.',
      overdue: 'This car is past its return time, so its location is being shared with the host until you return it.',
    };

    try {
      await notificationService.send({
        userId: trip.guestId,
        priority: 'high',
        templateKey: 'tracking.exception.started',
        title: 'Your location is being shared',
        body: bodies[state.exceptionKind],
        deepLink: `/trips/${trip._id}`,
        data: { tripId: trip._id, reason: state.exceptionKind },
      });

      await auditService.record({
        // The system did this, not a person — no operator pressed a button.
        actorId: 'system',
        actorRoles: ['system'],
        action: 'tracking.exception.activated',
        resourceType: 'trip',
        resourceId: trip._id,
        reason: state.exceptionKind,
        after: { phase: state.phase, viewers: state.viewers, guestNotified: true },
        status: 200,
      });

      await TripModel.updateOne({ _id: tripId }, { $set: { trackingNoticeSentFor: state.exceptionKind } });
    } catch (err) {
      // Never let the notice failing block the tracking that protects someone
      // in an emergency — but say so loudly, because an un-noticed activation
      // is the thing we do not want.
      logger.error(
        { tripId, kind: state.exceptionKind, err: (err as Error).message },
        'Exception tracking started but the guest could NOT be notified',
      );
    }
  },

  /**
   * Resolve the phase and announce in one step. This is what the read path
   * calls, so the notice fires the first time anyone observes the exception
   * rather than depending on a background job having run.
   */
  async resolveAndAnnounce(tripId: string): Promise<TrackingState> {
    const state = await trackingPhaseService.resolve(tripId);
    if (state.isException) await this.announceIfNeeded(tripId, state);
    return state;
  },
};
