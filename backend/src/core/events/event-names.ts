/**
 * Central registry of every domain event name. Modules emit these and
 * subscribe to them; no module imports another's internals. Today the bus
 * is in-process; the same names back a real broker (Kafka/Rabbit) later.
 */
export const EVENTS = {
  USER_REGISTERED: 'user.registered',

  HOST_ONBOARDED: 'host.onboarded',

  KYC_SUBMITTED: 'kyc.submitted',
  KYC_APPROVED: 'kyc.approved',
  KYC_REJECTED: 'kyc.rejected',

  USER_LOGGED_IN: 'user.logged_in',

  VEHICLE_LISTED: 'vehicle.listed',
  VEHICLE_VERIFIED: 'vehicle.verified',
  VEHICLE_PRICE_DROPPED: 'vehicle.price_dropped',
  /** Operational lifecycle moved (idle→on_trip→…→idle). */
  VEHICLE_STATE_CHANGED: 'vehicle.state_changed',
  /** Car entered a state where it cannot take new bookings (maintenance/repair/
   *  blocked/awaiting_approval) — ops should notice. */
  VEHICLE_DOWN: 'vehicle.down',
  /** Car returned to service after being down. */
  VEHICLE_REACTIVATED: 'vehicle.reactivated',

  BOOKING_CREATED: 'booking.created',
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_DECLINED: 'booking.declined',
  BOOKING_CANCELLED: 'booking.cancelled',
  BOOKING_EXPIRED: 'booking.expired',
  BOOKING_COMPLETED: 'booking.completed',
  BOOKING_REMINDER: 'booking.reminder',
  BOOKING_EXTENDED: 'booking.extended',
  BOOKING_SHORTENED: 'booking.shortened',
  BOOKING_GUEST_NO_SHOW: 'booking.guest_no_show',
  BOOKING_HOST_NO_SHOW: 'booking.host_no_show',
  BOOKING_REBOOKING_NEEDED: 'booking.rebooking_needed',

  TRIP_STARTED: 'trip.started',
  TRIP_COMPLETED: 'trip.completed',

  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_REFUNDED: 'payment.refunded',
  /** A card failed asynchronously, after the booking was already made. */
  PAYMENT_FAILED: 'payment.failed',
  /** The cardholder's bank is pulling the money back. */
  PAYMENT_DISPUTED: 'payment.disputed',
  WALLET_TOPPED_UP: 'wallet.topped_up',
  PLATFORM_CONFIG_UPDATED: 'platform.config_updated',

  PAYOUT_SCHEDULED: 'payout.scheduled',

  REVIEW_POSTED: 'review.posted',

  CHAT_MESSAGE_SENT: 'chat.message.sent',
  TRIP_LOCATION_UPDATED: 'trip.location.updated',
  TRIP_SOS: 'trip.sos',
  TRIP_INCIDENT_RAISED: 'trip.incident.raised',
  TRIP_INCIDENT_RESOLVED: 'trip.incident.resolved',
  TRIP_DAMAGE_REPORTED: 'trip.damage.reported',
  TRIP_CHECKED_IN: 'trip.checked_in',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export interface DomainEvent<T = unknown> {
  name: EventName;
  aggregateId: string;
  occurredAt: Date;
  correlationId?: string;
  payload: T;
}
