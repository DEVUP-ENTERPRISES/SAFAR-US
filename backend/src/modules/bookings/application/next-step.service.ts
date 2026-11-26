import type { BookingDoc } from '../infrastructure/booking.model';
import type { EligibilityBlocker } from './eligibility.service';
import { eligibilityService } from './eligibility.service';
import { inspectionService } from '../../trips/application/inspection.service';
import { trackingPhaseService } from '../../trips/application/tracking-phase.service';
import { TripModel } from '../../trips/infrastructure/trip.model';
import { ReviewModel } from '../../reviews/infrastructure/review.model';
import { userService } from '../../users/application/user.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';

const HOUR = 3_600_000;

export type StepTone = 'action' | 'waiting' | 'info' | 'warning' | 'success';

export interface NextStep {
  key: string;
  tone: StepTone;
  title: string;
  body: string;
  /** The moment this step is due by, for a countdown. */
  dueAt?: Date;
  action?: { label: string; href: string };
  /** The journey so far, for a compact progress line. */
  steps: { label: string; done: boolean; current: boolean }[];
}

const JOURNEY = ['Booked', 'Ready to drive', 'Picked up', 'Returned', 'Reviewed'] as const;

function journey(at: number): NextStep['steps'] {
  return JOURNEY.map((label, i) => ({ label, done: i < at, current: i === at }));
}

const fmt = (d: Date) => d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });

// Blockers the guest clears on the identity page, versus ones only support or the account page can clear.
const IDENTITY: EligibilityBlocker[] = ['identity_not_submitted', 'identity_rejected', 'licence_expired', 'mvr_required', 'background_required', 'insurance_required'];

/**
 * The single answer to "what do I do now?" for a guest's booking, worked out on the server from
 * the booking, the ID check, the photo windows, the tracking window and reviews, so every screen
 * says the same thing.
 */
export const nextStepService = {
  async forGuest(b: BookingDoc, guestId: string): Promise<NextStep> {
    const id = String(b._id);
    const start = new Date(b.period.start);
    const end = new Date(b.period.end);
    const now = Date.now();
    const cfg = await platformConfigService.get();

    if (String(b.status).startsWith('cancelled')) {
      const rebook = b.status === 'cancelled_host';
      return {
        key: 'cancelled', tone: 'info', title: 'This booking was cancelled',
        body: rebook ? 'Your host cancelled. Pick a similar car and we cover the difference where we can.' : 'Any refund due goes back to your card within 5 to 10 business days.',
        ...(rebook ? { action: { label: 'Find another car', href: `/bookings/${id}/rebook` } } : {}),
        steps: journey(0).map((s) => ({ ...s, current: false })),
      };
    }

    if (b.status === 'pending_payment') {
      return { key: 'pay', tone: 'action', title: 'Finish your payment', body: 'Your car is held, but the booking isn’t confirmed until the payment goes through.', action: { label: 'Finish payment', href: `/bookings/${id}#pay` }, steps: journey(0) };
    }

    if (b.status === 'completed') {
      const trip = await TripModel.findOne({ bookingId: id }).select('_id').lean<{ _id: string }>();
      const reviewed = await ReviewModel.exists({ bookingId: id, direction: 'guest_to_host' });
      const doneAt = [...(b.statusHistory ?? [])].reverse().find((h) => h.to === 'completed')?.at ?? end;
      const reviewClosesAt = new Date(new Date(doneAt).getTime() + cfg.reviews.blindWindowDays * 24 * HOUR);
      if (!reviewed && reviewClosesAt.getTime() > now && trip) {
        return { key: 'review', tone: 'action', title: 'How was your trip?', body: 'A quick rating helps the next guest and your host.', dueAt: reviewClosesAt, action: { label: 'Rate your trip', href: `/trips/${trip._id}#review` }, steps: journey(4) };
      }
      return { key: 'done', tone: 'success', title: 'Trip complete', body: 'Thanks for driving with CatoDrive. Your receipt is ready.', action: { label: 'View receipt', href: `/bookings/${id}/receipt` }, steps: journey(5) };
    }

    if (b.status === 'in_progress') {
      const trip = await TripModel.findOne({ bookingId: id }).select('_id').lean<{ _id: string }>();
      const tripHref = trip ? `/trips/${trip._id}` : `/bookings/${id}`;
      const photos = await inspectionService.state(b, guestId, now).catch(() => null);
      const returnOpen = !!photos?.post.open;
      const needReturnPhotos = returnOpen && (photos?.post.taken ?? 0) < Math.max(1, photos?.post.required ?? 0);
      if (now > end.getTime()) {
        return { key: 'late', tone: 'warning', title: 'Your trip has ended', body: 'Return the car now, or extend if you need more time. Late fees apply to the time over.', dueAt: end, action: needReturnPhotos ? { label: 'Take return photos', href: `${tripHref}#return` } : { label: 'Extend trip', href: `/bookings/${id}/change` }, steps: journey(2) };
      }
      if (needReturnPhotos) {
        return { key: 'return_photos', tone: 'action', title: `Return by ${fmt(end)}`, body: `Take ${Math.max(1, photos!.post.required)} return photos of the car before you hand it back. They protect you.`, dueAt: end, action: { label: 'Take return photos', href: `${tripHref}#return` }, steps: journey(2) };
      }
      if (end.getTime() - now <= 2 * HOUR) {
        return { key: 'return_soon', tone: 'action', title: `Return by ${fmt(end)}`, body: 'Head back with time to spare. Refill to the level you picked it up at.', dueAt: end, action: { label: 'Open trip', href: tripHref }, steps: journey(2) };
      }
      return { key: 'driving', tone: 'info', title: 'Enjoy your trip', body: `Return by ${fmt(end)}. Need longer? Extend from here.`, dueAt: end, action: { label: 'Extend trip', href: `/bookings/${id}/change` }, steps: journey(2) };
    }

    if (b.status === 'pending_approval') {
      return { key: 'awaiting_host', tone: 'waiting', title: 'Waiting for your host', body: 'Your card isn’t charged until they accept. We’ll tell you the moment they reply.', ...(b.approvalDeadline ? { dueAt: new Date(b.approvalDeadline) } : {}), steps: journey(0) };
    }

    // Booked, not yet picked up: the guest has things to clear before the keys change hands.
    const [profile, eligibility] = await Promise.all([
      userService.profileStatus(guestId).catch(() => null),
      eligibilityService.evaluate(guestId, end).catch(() => null),
    ]);
    if (profile && !profile.complete) {
      return { key: 'profile', tone: 'action', title: 'Finish your profile', body: 'A few details we need before your first trip.', action: { label: 'Finish profile', href: `/account/setup?next=/bookings/${id}` }, steps: journey(1) };
    }
    const blockers = eligibility?.blockers ?? [];
    const cutoff = new Date(start.getTime() - cfg.booking.verificationCutoffHours * HOUR);
    if (blockers.includes('email_unverified') || blockers.includes('phone_unverified')) {
      return { key: 'contact', tone: 'action', title: 'Confirm your email and phone', body: eligibilityService.describe(blockers.filter((x) => x === 'email_unverified' || x === 'phone_unverified'))[0], dueAt: cutoff, action: { label: 'Confirm now', href: `/account?next=/bookings/${id}` }, steps: journey(1) };
    }
    const idBlock = blockers.find((x) => IDENTITY.includes(x));
    if (idBlock) {
      return { key: 'verify', tone: 'action', title: 'Verify your ID', body: eligibilityService.describe([idBlock])[0], dueAt: cutoff, action: { label: 'Verify ID', href: `/account/verify-identity?next=/bookings/${id}` }, steps: journey(1) };
    }
    if (blockers.includes('identity_pending')) {
      return { key: 'verifying', tone: 'waiting', title: 'Checking your ID', body: 'This usually takes a few minutes. We’ll tell you when it’s done.', steps: journey(1) };
    }
    if (blockers.length) {
      return { key: 'support', tone: 'warning', title: 'We need to talk to you', body: eligibilityService.describe(blockers)[0], action: { label: 'Contact support', href: '/support' }, steps: journey(1) };
    }
    if (b.status === 'pending_verification') {
      return { key: 'verifying', tone: 'waiting', title: 'Confirming your booking', body: 'Your ID is verified. We’re finishing the booking now.', steps: journey(1) };
    }

    const photos = await inspectionService.state(b, guestId, now).catch(() => null);
    if (photos?.pre.open && photos.pre.taken < Math.max(1, photos.pre.required)) {
      return { key: 'pickup_photos', tone: 'action', title: 'Take your pickup photos', body: `Photograph the car before you drive: ${Math.max(1, photos.pre.required)} photos, each angle once. They protect you if anything is disputed.`, dueAt: start, action: { label: 'Take photos', href: `/bookings/${id}#photos` }, steps: journey(1) };
    }
    const tracking = await trackingPhaseService.resolve(id).catch(() => null);
    if (tracking?.phase === 'approach') {
      if (b.delivery?.mode) {
        return { key: 'delivery', tone: 'info', title: 'Your car is coming to you', body: 'Follow it live below. Have your pickup code ready when it arrives.', dueAt: start, action: { label: 'Show pickup code', href: `/bookings/${id}#pickup-code` }, steps: journey(1) };
      }
      return { key: 'go', tone: 'action', title: 'Time to head to the car', body: b.approach?.guest?.onWayAt ? 'Your host knows you’re on the way. Show your pickup code when you get there.' : 'Tap “I’m on my way” below so your host knows, then show your pickup code at the car.', dueAt: start, action: { label: 'Show pickup code', href: `/bookings/${id}#pickup-code` }, steps: journey(1) };
    }
    return { key: 'ready', tone: 'success', title: 'You’re all set', body: `Pickup ${fmt(start)}. We’ll remind you before it’s time to go.`, dueAt: start, steps: journey(1).map((s, i) => (i === 1 ? { ...s, done: true, current: false } : s)) };
  },
};
