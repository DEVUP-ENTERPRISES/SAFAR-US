import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';
import type { BookingStatus } from '../domain/booking-status';

interface MoneyField {
  amount: number;
  currency: string;
}

export interface BookingDoc {
  _id: string;
  code: string;
  guestId: string;
  hostId: string;
  vehicleId: string;
  period: { start: Date; end: Date };
  priceBreakdown: {
    days: number;
    base: MoneyField;
    cleaningFee: MoneyField;
    discount: MoneyField;
    addOnsTotal?: MoneyField;
    delivery?: MoneyField;
    protection?: MoneyField;
    protectionPlan?: string;
    selectedAddOns?: { code: string; label: string; amount: MoneyField }[];
    subtotal: MoneyField;
    commission: MoneyField;
    tax: MoneyField;
    hostEarnings: MoneyField;
    total: MoneyField;
    currency: string;
  };
  cancellationPolicy: 'flexible' | 'moderate' | 'strict';
  /** Where the host delivers the car, when the guest requested delivery. */
  delivery?: {
    mode: 'airport' | 'home' | 'hotel' | 'business';
    address: string;
    lat?: number;
    lng?: number;
    /** Airport pickups: which flight the guest is on, so a delay moves the
     *  handover rather than triggering a no-show. */
    flightNumber?: string;
    terminal?: string;
    arrivesAt?: Date;
  };
  /**
   * Extra people approved to drive on this trip. They must be added before the
   * trip so they're covered by the protection plan; they cannot pick up or drop
   * off the car (only the primary guest can), matching Turo's rule.
   */
  additionalDrivers?: { name: string; licenseNumber?: string; addedAt: Date }[];
  status: BookingStatus;
  statusHistory: { from: BookingStatus | null; to: BookingStatus; at: Date; by: string; reason?: string }[];
  /** Post-trip incidental charges (fuel, cleaning, late return, tolls…). */
  /**
   * Post-trip charges: fuel, cleaning, tolls, fines.
   *
   * Each one carries its own id and status because a guest cannot dispute what
   * they cannot reference. Without an id these were an anonymous array, which
   * is the real reason there was no dispute path — not an oversight in the UI,
   * a data model that could not support one.
   */
  incidentals?: {
    _id: string;
    type: string;
    amount: number;
    /** Units for rated types: % of tank, hours late. */
    qty?: number;
    note?: string;
    /** Photo of the receipt, the citation, or the state of the car. */
    evidenceUrl?: string;
    status: 'charged' | 'disputed' | 'refunded' | 'upheld';
    disputeReason?: string;
    disputedAt?: Date;
    /** Set when staff rule on a dispute. */
    resolvedAt?: Date;
    resolvedBy?: string;
    resolutionNote?: string;
    at: Date;
    by: string;
  }[];
  /** SHA-256 of the guest's pickup code — the host verifies it at handover to
   *  prove the guest is physically present. Never stored in the clear. */
  pickupCodeHash?: string;
  /** Why this booking is held at pending_verification, for the guest's UI. */
  verificationBlockers?: string[];
  holdId?: string;
  paymentId?: string;
  couponCode?: string;
  orgId?: string;
  costCenterId?: string;
  instantBook: boolean;
  approvalDeadline?: Date;
  cancellation?: { by: string; role?: 'guest' | 'host' | 'admin' | 'system'; at: Date; reason: string; refund: MoneyField };
  /**
   * Set when this booking replaces one the host cancelled. `coveredDifference`
   * is what the rebooking guarantee paid so the guest kept their original
   * price — the audit trail behind the promise.
   */
  rebookedFrom?: string;
  coveredDifference?: MoneyField;
  tripId?: string;
  /** Which exception kind the guest has already been told about, so the notice
   *  is sent once per episode rather than on every read. */
  trackingNoticeSentFor?: 'sos' | 'overdue' | 'incident';
  /**
   * The hour before the keys change hands.
   *
   * On the BOOKING rather than the trip because the trip does not exist yet —
   * it is created at handover. Putting this on the trip made every approach
   * feature unreachable in exactly the window it was built for.
   */
  approach?: {
    guest?: { onWayAt?: Date; arrivedAt?: Date; etaAt?: Date; etaNotifiedAt?: Date };
    host?: { onWayAt?: Date; arrivedAt?: Date; etaAt?: Date; etaNotifiedAt?: Date };
    /** Last known position of each party during the approach. */
    guestAt?: { lat: number; lng: number; at: Date };
    hostAt?: { lat: number; lng: number; at: Date };
  };
  idempotencyKey?: string;
  reminderSentAt?: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const moneySchema = { amount: Number, currency: String };

const schema = new Schema<BookingDoc>(
  {
    _id: { type: String, default: () => uuid() },
    code: { type: String, required: true },
    guestId: { type: String, required: true },
    hostId: { type: String, required: true },
    vehicleId: { type: String, required: true },
    period: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    priceBreakdown: {
      days: Number,
      base: moneySchema,
      cleaningFee: moneySchema,
      discount: moneySchema,
      addOnsTotal: moneySchema,
      delivery: moneySchema,
      protection: moneySchema,
      protectionPlan: String,
      selectedAddOns: [{ code: String, label: String, amount: moneySchema }],
      subtotal: moneySchema,
      commission: moneySchema,
      tax: moneySchema,
      hostEarnings: moneySchema,
      total: moneySchema,
      currency: String,
      // Why this booking was priced the way it was. Mongoose strips anything
      // not declared here, so omitting these silently discarded the pricing
      // rationale the moment a quote became a booking — leaving support unable
      // to explain a rate, and no record that surge was ever disclosed.
      commissionBps: Number,
      commissionSource: String,
      surgeDays: Number,
      surgeSource: String,
      memberSavings: moneySchema,
      memberPlan: String,
    },
    cancellationPolicy: { type: String, default: 'moderate' },
    delivery: {
      type: {
        _id: false,
        mode: { type: String, enum: ['airport', 'home', 'hotel', 'business'] },
        address: String,
        lat: Number,
        lng: Number,
        flightNumber: String,
        terminal: String,
        arrivesAt: Date,
      },
      default: undefined,
    },
    additionalDrivers: {
      type: [{ _id: false, name: String, licenseNumber: String, addedAt: Date }],
      default: [],
    },
    status: { type: String, required: true },
    statusHistory: [
      {
        from: { type: String, default: null },
        to: String,
        at: Date,
        by: String,
        reason: String,
      },
    ],
    incidentals: {
      // `type: { type: String }` — the field is literally named "type", which
      // would otherwise be read as the Mongoose SchemaType keyword.
      type: [
        {
          _id: { type: String, required: true },
          type: { type: String },
          amount: Number,
          qty: Number,
          note: String,
          evidenceUrl: String,
          status: {
            type: String,
            enum: ['charged', 'disputed', 'refunded', 'upheld'],
            default: 'charged',
          },
          disputeReason: String,
          disputedAt: Date,
          resolvedAt: Date,
          resolvedBy: String,
          resolutionNote: String,
          at: Date,
          by: String,
        },
      ],
      default: [],
    },
    pickupCodeHash: String,
    verificationBlockers: { type: [String], default: [] },
    holdId: String,
    paymentId: String,
    couponCode: String,
    orgId: String,
    costCenterId: String,
    instantBook: { type: Boolean, default: false },
    approvalDeadline: Date,
    rebookedFrom: String,
    coveredDifference: moneySchema,
    cancellation: {
      by: String,
      role: { type: String, enum: ['guest', 'host', 'admin', 'system'] },
      at: Date,
      reason: String,
      refund: moneySchema,
    },
    tripId: String,
    trackingNoticeSentFor: { type: String, enum: ['sos', 'overdue', 'incident'] },
    approach: {
      guest: { onWayAt: Date, arrivedAt: Date, etaAt: Date, etaNotifiedAt: Date },
      host: { onWayAt: Date, arrivedAt: Date, etaAt: Date, etaNotifiedAt: Date },
      guestAt: { lat: Number, lng: Number, at: Date },
      hostAt: { lat: Number, lng: Number, at: Date },
    },
    idempotencyKey: String,
    reminderSentAt: Date,
    version: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

schema.index({ code: 1 }, { unique: true });
schema.index({ guestId: 1, createdAt: -1 });
schema.index({ hostId: 1, status: 1, createdAt: -1 });
schema.index({ vehicleId: 1, 'period.start': 1, 'period.end': 1 });
schema.index({ status: 1, approvalDeadline: 1 });
schema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export const BookingModel = model<BookingDoc>('Booking', schema);
