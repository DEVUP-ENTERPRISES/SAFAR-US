import type { BookingStatus } from './types';

export type StatusTone = 'default' | 'success' | 'warning' | 'destructive' | 'muted';

export const STATUS_TONE: Record<BookingStatus, StatusTone> = {
  pending_verification: 'warning',
  pending_payment: 'warning',
  pending_approval: 'warning',
  confirmed: 'default',
  paid: 'success',
  in_progress: 'default',
  completed: 'success',
  cancelled: 'destructive',
  cancelled_guest: 'muted',
  cancelled_host: 'destructive',
  cancelled_system: 'muted',
  declined: 'destructive',
  expired: 'muted',
  disputed: 'destructive',
};

/**
 * Plain-English labels. "cancelled_host" is not a thing a guest should have to
 * decode, and it matters to them WHO cancelled - a host cancelling is the case
 * where they are owed a replacement car.
 */
export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_verification: 'Verifying you',
  pending_payment: 'Payment incomplete',
  pending_approval: 'Awaiting host',
  confirmed: 'Confirmed',
  paid: 'Confirmed',
  in_progress: 'On trip',
  completed: 'Completed',
  cancelled: 'Cancelled',
  cancelled_guest: 'Cancelled by you',
  cancelled_host: 'Cancelled by host',
  cancelled_system: 'Cancelled',
  declined: 'Declined',
  expired: 'Expired',
  disputed: 'Disputed',
};

export const statusLabel = (s: BookingStatus | string) => STATUS_LABEL[s as BookingStatus] ?? s.replace(/_/g, ' ');

/** What the guest does next, shown under each trip. */
export const NEXT_STEP: Record<string, string> = {
  pending_verification: 'Next: verify your licence before pickup - tap to continue',
  pending_approval: 'Next: waiting for the host to accept',
  pending_payment: 'Next: finish your payment to lock in the trip',
  paid: 'Next: show your pickup code to the host at the car',
  confirmed: 'Next: show your pickup code to the host at the car',
  in_progress: 'Trip in progress',
};

export const HOST_STARTS = 'Your host starts the trip at pickup. Show them your pickup code.';

/** Statuses a guest can still cancel. */
export const CANCELLABLE: BookingStatus[] = ['pending_approval', 'confirmed', 'paid'];

export const POLICY_LABEL = { flexible: 'Flexible', moderate: 'Moderate', strict: 'Strict' } as const;

/** The trip page's headline for each status, and what it means for the guest. */
export const BOOKING_STATE: Record<string, { tone: StatusTone; label: string; detail: string }> = {
  pending_approval: { tone: 'warning', label: 'Waiting on the host', detail: 'The host has up to 24 hours to accept. Your card is only held, not charged; if they decline or don’t answer, the hold is released.' },
  pending_verification: { tone: 'warning', label: 'Verifying your identity', detail: 'We’re confirming your licence. Your card is authorised but not charged.' },
  pending_payment: { tone: 'warning', label: 'Payment incomplete', detail: 'Your dates are held but the payment didn’t finish. This trip isn’t confirmed until it does.' },
  paid: { tone: 'success', label: 'Confirmed', detail: 'You’re booked. The host will meet you at pickup.' },
  confirmed: { tone: 'success', label: 'Confirmed', detail: 'You’re booked. The host will meet you at pickup.' },
  in_progress: { tone: 'default', label: 'Trip in progress', detail: 'Enjoy the drive - return it on time to avoid late fees.' },
  completed: { tone: 'muted', label: 'Completed', detail: 'This trip is finished. Thanks for riding.' },
  declined: { tone: 'destructive', label: 'Declined by host', detail: 'The host couldn’t take this trip. You haven’t been charged.' },
  expired: { tone: 'destructive', label: 'Request expired', detail: 'The host didn’t respond in time. You haven’t been charged.' },
  cancelled_guest: { tone: 'muted', label: 'Cancelled by you', detail: 'You cancelled this trip.' },
  cancelled_host: { tone: 'destructive', label: 'Cancelled by host', detail: 'The host cancelled. We’ll cover the price difference on a replacement car.' },
  cancelled_system: { tone: 'muted', label: 'Cancelled', detail: 'This booking was cancelled.' },
};

/** Statuses the trip page offers "Cancel trip" for (wider than the list: unpaid holds can be dropped too). */
export const DETAIL_CANCELLABLE = ['pending_approval', 'pending_verification', 'pending_payment', 'confirmed', 'paid'];

/** Statuses where guest and host can message each other on the booking. */
export const CHATTABLE = ['pending_approval', 'pending_verification', 'pending_payment', 'confirmed', 'paid', 'in_progress', 'completed'];

/** Where each status sits on the step-by-step trip timeline. */
export const TRIP_STAGE: Record<string, number> = {
  pending_verification: 1,
  pending_approval: 2,
  pending_payment: 3,
  paid: 4,
  confirmed: 4,
  in_progress: 5,
  completed: 7,
};

export const TRIP_STEPS = [
  { title: 'Trip requested', detail: 'Your dates are held and your card is authorised.' },
  { title: 'Verify your identity', detail: 'Photograph your licence and take a selfie. Nothing is charged until this passes, and it must be done a few hours before pickup or the booking is released.' },
  { title: 'Host approval', detail: 'The host reviews and accepts your request.' },
  { title: 'Payment confirmed', detail: 'Your card is charged and the trip is locked in.' },
  { title: 'Pickup day', detail: 'We will communicate with you all the required information close to your pickup time.' },
  { title: 'On the road', detail: 'Enjoy the drive.' },
  { title: 'Return & close out', detail: 'Return on time with photos; your deposit is released after the host’s inspection window.' },
];

/** Post-trip charge types in plain words. */
export const INCIDENTAL_LABEL: Record<string, string> = {
  fuel: 'Fuel',
  cleaning: 'Extra cleaning',
  smoking: 'Smoking',
  pet: 'Unapproved pet',
  late_return: 'Late return',
  toll: 'Toll',
  fine: 'Fine',
  other: 'Other',
};
