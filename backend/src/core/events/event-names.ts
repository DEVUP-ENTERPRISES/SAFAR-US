/**
 * Central registry of every domain event name. Modules emit these and
 * subscribe to them; no module imports another's internals. Today the bus
 * is in-process; the same names back a real broker (Kafka/Rabbit) later.
 */
export const EVENTS = {
  USER_REGISTERED: 'user.registered',

  HOST_ONBOARDED: 'host.onboarded',

  VEHICLE_LISTED: 'vehicle.listed',
  VEHICLE_VERIFIED: 'vehicle.verified',

  BOOKING_CREATED: 'booking.created',
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_CANCELLED: 'booking.cancelled',
  BOOKING_EXPIRED: 'booking.expired',
  BOOKING_COMPLETED: 'booking.completed',

  TRIP_STARTED: 'trip.started',
  TRIP_COMPLETED: 'trip.completed',

  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_REFUNDED: 'payment.refunded',

  PAYOUT_SCHEDULED: 'payout.scheduled',

  REVIEW_POSTED: 'review.posted',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export interface DomainEvent<T = unknown> {
  name: EventName;
  aggregateId: string;
  occurredAt: Date;
  correlationId?: string;
  payload: T;
}
